import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Archive applicants who received an interview invitation but never responded
// within STALE_DAYS. Covers two invitation paths:
//   A) Async interview — an InterviewSession exists and is still INVITED past the cutoff.
//   B) Sales email invitation — JobApplication.status === 'interview_invitation' with no
//      interview session, untouched (updated_date) past the cutoff.
// Responded = the session moved past INVITED, or the application status advanced past
// 'interview_invitation'. Already-advanced/hired/closed applications are never archived here.

const DEFAULT_STALE_DAYS = 30;
const NO_RESPONSE_SESSION_STATUSES = ['INVITED', 'EXPIRED'];
const DO_NOT_ARCHIVE_STATUSES = [
  'hired', 'offer_extended', 'offer_not_extended',
  'accepted', 'accepted_pending', 'accepted_waitlist', 'denied', 'final_review',
];

const unwrapList = (res) => res?.items ?? res ?? [];
const unwrapOne = (res) => res?.data ?? res;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Workflow-only endpoint: the URL is public, so require an admin caller.
  // Workflow steps invoke this as the workflow creator (an admin).
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  let staleDays = DEFAULT_STALE_DAYS;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.staleDays && Number.isFinite(Number(body.staleDays))) {
      staleDays = Math.max(1, Number(body.staleDays));
    }
  } catch (_) {}

  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString();
  const archived = [];
  const skipped = [];
  const handled = new Set();

  try {
    // ── Path A: stale async interview sessions with no response (INVITED or EXPIRED) ──
    const staleSessions = unwrapList(
      await base44.asServiceRole.entities.InterviewSession.filter(
        { status: { $in: NO_RESPONSE_SESSION_STATUSES }, invited_at: { $lt: cutoff } },
        { sort: '-invited_at', limit: 200 }
      )
    );

    for (const s of staleSessions) {
      const appId = s.application_id;
      if (!appId || handled.has(appId)) continue;
      handled.add(appId);

      // Confirm the NEWEST session is still a no-response state (INVITED/EXPIRED) and
      // stale — a re-invite or a responded (COMPLETED/STARTED/...) session resets the
      // clock and must not be archived.
      const latest = unwrapList(
        await base44.asServiceRole.entities.InterviewSession.filter(
          { application_id: appId },
          { sort: '-invited_at', limit: 1 }
        )
      )[0];
      if (!latest || !NO_RESPONSE_SESSION_STATUSES.includes(latest.status) || !latest.invited_at || new Date(latest.invited_at) >= new Date(cutoff)) {
        skipped.push({ appId, reason: 'newer_invite_or_responded' });
        continue;
      }

      const app = unwrapOne(await base44.asServiceRole.entities.JobApplication.get(appId));
      if (!app || app.archived) { skipped.push({ appId, reason: 'missing_or_already_archived' }); continue; }
      if (DO_NOT_ARCHIVE_STATUSES.includes(app.status)) { skipped.push({ appId, reason: 'advanced_status', status: app.status }); continue; }

      await archiveApp(base44, app, 'interview invitation not responded to in ' + staleDays + ' days');
      archived.push({ appId, name: app.full_name, email: app.email, path: 'async_session' });
    }

    // ── Path B: sales email invitations with no session, invited past cutoff ──
    // Clock = interview_invitation_sent_at (when the admin sent the invitation).
    // Legacy records without that field fall back to created_date (submission).
    // updated_date is unreliable (any admin touch refreshes it) and is never used.
    // created_date is a safe pre-filter because the invitation always follows
    // submission, so an invitation older than the cutoff implies submission is too.
    const salesApps = unwrapList(
      await base44.asServiceRole.entities.JobApplication.filter(
        { status: 'interview_invitation', archived: { $ne: true }, created_date: { $lt: cutoff } },
        { sort: '-created_date', limit: 200 }
      )
    );

    for (const app of salesApps) {
      if (handled.has(app.id)) continue; // already processed via path A
      // If an interview session exists, path A owns the decision.
      const sess = unwrapList(
        await base44.asServiceRole.entities.InterviewSession.filter(
          { application_id: app.id },
          { sort: '-invited_at', limit: 1 }
        )
      )[0];
      if (sess) { skipped.push({ appId: app.id, reason: 'has_session' }); continue; }

      const invitedAt = app.interview_invitation_sent_at || app.created_date;
      if (!invitedAt || new Date(invitedAt) >= new Date(cutoff)) {
        skipped.push({ appId: app.id, reason: 'invited_within_window' });
        continue;
      }

      await archiveApp(base44, app, 'interview invitation not responded to in ' + staleDays + ' days');
      archived.push({ appId: app.id, name: app.full_name, email: app.email, path: 'sales_email' });
    }

    return Response.json({
      staleDays,
      cutoff,
      archived: archived.length,
      archived_records: archived,
      skipped: skipped.length,
      skipped_records: skipped,
    });
  } catch (e) {
    console.error('archiveStaleInterviewApplicants error:', e.message);
    return Response.json({ error: e.message, archived: archived.length, skipped: skipped.length }, { status: 500 });
  }
});

async function archiveApp(base44, app, reason) {
  const note = { message: `Automatically archived: ${reason}.`, created_at: new Date().toISOString() };
  const updates = Array.isArray(app.updates) ? [...app.updates, note] : [note];
  await base44.asServiceRole.entities.JobApplication.update(app.id, { archived: true, updates });
}