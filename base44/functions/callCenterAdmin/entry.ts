/**
 * callCenterAdmin — admin-only API behind the Call Center dashboard.
 *
 * Reads and updates call records, voicemails, callback requests, technical
 * support issues and the IVR settings. Every action requires an administrator.
 * (Studio actions that manage flows live in ivrStudio.)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { secrets } from 'base44:runtime';
import { attemptAssistTicket } from '../../shared/ivrAssist.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../../shared/ivr.ts';
import { verifyAdmin } from '../../shared/adminAuth.ts';

function listOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

// Platform admins and SalesTeamMember admins are both accepted, exactly like
// every other admin surface in this app (the app's own login is not a platform
// session, so a platform-only check hid the whole dashboard from its users).
async function requireAdmin(base44: any, body: any, url?: URL) {
  const auth = await verifyAdmin(base44, body, url);
  if (!auth.authorized) {
    return { ok: false, status: 403, error: 'Administrator access required' };
  }
  return { ok: true, user: { email: auth.actorEmail || 'admin' } };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action || '';

    const auth = await requireAdmin(base44, body, new URL(req.url));
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status as number });

    const E = base44.asServiceRole.entities;

    switch (action) {
      case 'overview': {
        const [totalCalls, answered, abandoned, pendingCallbacks, unreviewedVoicemails, openIssues, aiBookings] =
          await Promise.all([
            E.CallRecord.count({}).catch(() => 0),
            E.CallRecord.count({ outcome: 'answered' }).catch(() => 0),
            E.CallRecord.count({ outcome: 'abandoned' }).catch(() => 0),
            E.CallbackRequest.count({ status: 'pending' }).catch(() => 0),
            E.CallVoicemail.count({ status: 'unreviewed' }).catch(() => 0),
            E.TechSupportIssue.count({ status: { $in: ['open', 'ticket_pending'] } }).catch(() => 0),
            E.CallRecord.count({ route: 'ashley', booking_id: { $exists: true, $ne: '' } }).catch(() => 0),
          ]);

        const recent = listOf(
          await E.CallRecord.filter({}, { sort: '-started_at', limit: 8 }).catch(() => [])
        );

        return Response.json({
          overview: {
            total_calls: totalCalls,
            answered,
            abandoned,
            pending_callbacks: pendingCallbacks,
            unreviewed_voicemails: unreviewedVoicemails,
            open_issues: openIssues,
            ai_bookings: aiBookings,
          },
          recent_calls: recent,
        });
      }

      case 'listCalls': {
        const query: any = {};
        if (body.line) query.receiving_line = body.line;
        if (body.outcome) query.outcome = body.outcome;
        const rows = listOf(
          await E.CallRecord.filter(query, { sort: '-started_at', limit: 100 }).catch(() => [])
        );
        return Response.json({ calls: rows });
      }

      case 'listCallbacks': {
        const query: any = {};
        if (body.status) query.status = body.status;
        if (body.assigned_to_member_id) query.assigned_to_member_id = body.assigned_to_member_id;
        const rows = listOf(
          await E.CallbackRequest.filter(query, { sort: '-created_at', limit: 200 }).catch(() => [])
        );
        return Response.json({ callbacks: rows });
      }

      case 'updateCallback': {
        if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });
        const patch: any = { ...(body.patch || {}) };
        if (patch.status === 'completed' || patch.status === 'cancelled') {
          patch.handled_at = new Date().toISOString();
          patch.handled_by = auth.user?.email || 'admin';
        }
        await E.CallbackRequest.update(body.id, patch);
        return Response.json({ success: true });
      }

      case 'listVoicemails': {
        const query: any = {};
        if (body.status) query.status = body.status;
        const rows = listOf(
          await E.CallVoicemail.filter(query, { sort: '-created_at', limit: 200 }).catch(() => [])
        );
        return Response.json({ voicemails: rows });
      }

      case 'updateVoicemail': {
        if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });
        const patch: any = { ...(body.patch || {}) };
        if (patch.status && patch.status !== 'unreviewed') {
          patch.reviewed_at = new Date().toISOString();
          patch.reviewed_by = auth.user?.email || 'admin';
        }
        await E.CallVoicemail.update(body.id, patch);
        return Response.json({ success: true });
      }

      case 'voicemailUrl': {
        const rows = listOf(await E.CallVoicemail.filter({ id: body.id }).catch(() => []));
        const vm = rows[0];
        if (!vm?.recording_file_uri) {
          return Response.json({ error: 'No stored recording for this voicemail.' }, { status: 404 });
        }
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: vm.recording_file_uri,
          expires_in: 300,
        });
        return Response.json({ signed_url: signed?.signed_url || '' });
      }

      case 'listIssues': {
        const query: any = {};
        if (body.status) query.status = body.status;
        const rows = listOf(
          await E.TechSupportIssue.filter(query, { sort: '-created_at', limit: 200 }).catch(() => [])
        );
        return Response.json({ issues: rows });
      }

      case 'retryTicket': {
        const rows = listOf(await E.TechSupportIssue.filter({ id: body.id }).catch(() => []));
        const issue = rows[0];
        if (!issue) return Response.json({ error: 'Issue not found' }, { status: 404 });

        const attempt = await attemptAssistTicket(base44, secrets, {
          summary: issue.summary,
          caller_name: issue.caller_name,
          caller_email: issue.caller_email,
          caller_number: issue.caller_number,
          receiving_number: issue.receiving_number,
          category: issue.category,
        });

        await E.TechSupportIssue.update(issue.id, {
          assist_available: !!attempt.available,
          assist_ticket_id: attempt.ticketId || '',
          assist_ticket_number: attempt.ticketNumber || '',
          assist_error: attempt.error || '',
          status: attempt.available ? 'ticket_created' : 'ticket_pending',
          retry_count: Number(issue.retry_count || 0) + 1,
          last_retry_at: new Date().toISOString(),
        });

        return Response.json({ success: !!attempt.available, attempt });
      }

      case 'resolveIssue': {
        if (!body.id) return Response.json({ error: 'id required' }, { status: 400 });
        await E.TechSupportIssue.update(body.id, {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        });
        return Response.json({ success: true });
      }

      case 'getSettings': {
        const settings = await loadSettings(base44);
        const reps = listOf(
          await E.SalesTeamMember.filter({ is_active: true }, { sort: 'full_name', limit: 200 }).catch(() => [])
        );
        return Response.json({
          settings,
          defaults: DEFAULT_SETTINGS,
          reps: reps.map((r: any) => ({
            id: r.id,
            name: r.full_name || r.email,
            role: r.role || '',
            primary: r.work_phone || r.phone_number || '',
            cell: r.mobile_phone_number || '',
          })),
        });
      }

      case 'saveSettings': {
        const existing = listOf(
          await E.CallCenterSetting.filter({ settings_key: 'default' }).catch(() => [])
        );
        const patch = {
          ...(body.settings || {}),
          settings_key: 'default',
          updated_by: auth.user?.email || 'admin',
          updated_at: new Date().toISOString(),
        };
        if (existing[0]) {
          await E.CallCenterSetting.update(existing[0].id, patch);
        } else {
          await E.CallCenterSetting.create(patch);
        }
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error('[callCenterAdmin] failed:', (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
});