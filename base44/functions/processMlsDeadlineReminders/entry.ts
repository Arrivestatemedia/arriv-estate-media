import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { loadMlsServiceWindow, businessMinutesBetween, formatEtDeadline } from '../../shared/mlsServiceWindow.ts';
import { notifyAdminAlert } from '../../shared/mlsNotifications.ts';

/**
 * processMlsDeadlineReminders
 * Business-hours SLA reminders for open MLS upload requests.
 *
 * Reminders are measured in elapsed OPERATING minutes, not wall clock minutes, so a request
 * submitted at 5 PM is not "overdue" overnight. Each threshold is recorded on the request the
 * moment it fires, which makes this function safe to run on any cadence and impossible to send a
 * duplicate alert for the same request and threshold. Closed requests are never reminded.
 *
 * Invoked by the "MLS SLA Reminders" workflow every 10 minutes.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const windowConfig = await loadMlsServiceWindow(base44);
    const now = new Date();

    const rows = await base44.asServiceRole.entities.MlsUploadRequest.filter({}, '-submitted_at', 300);
    const open = (rows || []).filter((r: any) => ['submitted', 'processing', 'photos_uploaded', 'video_added', 'needs_attention'].includes(String(r.status)));

    let sent = 0;
    const results: Array<{ request_id: string; alert?: string; skipped?: string }> = [];

    for (const request of open) {
      if (!request.submitted_at) { results.push({ request_id: request.request_id, skipped: 'no submitted_at' }); continue; }

      const submitted = new Date(request.submitted_at);
      const elapsed = businessMinutesBetween(submitted, now, windowConfig);
      const deadline = request.deadline_at ? new Date(request.deadline_at) : null;
      const overdue = !!deadline && deadline <= now;
      const patch: Record<string, any> = {};

      const label = `${request.property_address || 'property'} · MLS #${request.mls_number}`;

      try {
        if (overdue && !request.overdue_notified_at) {
          await notifyAdminAlert(base44, {
            subject: `MLS upload overdue — ${request.property_address || 'property'}`,
            body: `${label} passed its ${formatEtDeadline(deadline)} deadline and is still open.\nStatus: ${request.status}\n${request.photo_count || 0} photos, ${request.video_count || 0} videos.`,
            jobId: request.job_id,
          });
          patch.overdue_notified_at = now.toISOString();
          sent += 1;
          results.push({ request_id: request.request_id, alert: 'overdue' });
        } else if (elapsed >= 90 && !request.reminder_90_sent_at) {
          await notifyAdminAlert(base44, {
            subject: `MLS upload 90 minutes in — ${request.property_address || 'property'}`,
            body: `${label} has used 90 business minutes of the upload window and is still open.\nStatus: ${request.status}. Deadline ${formatEtDeadline(deadline)}.`,
            jobId: request.job_id,
          });
          patch.reminder_90_sent_at = now.toISOString();
          sent += 1;
          results.push({ request_id: request.request_id, alert: '90m' });
        } else if (elapsed >= 60 && !request.reminder_60_sent_at) {
          await notifyAdminAlert(base44, {
            subject: `MLS upload 60 minutes in — ${request.property_address || 'property'}`,
            body: `${label} has used 60 business minutes of the upload window and is still open.\nStatus: ${request.status}. Deadline ${formatEtDeadline(deadline)}.`,
            jobId: request.job_id,
          });
          patch.reminder_60_sent_at = now.toISOString();
          sent += 1;
          results.push({ request_id: request.request_id, alert: '60m' });
        } else {
          results.push({ request_id: request.request_id, skipped: 'within window' });
        }
      } catch (err: any) {
        console.error('MLS reminder failed:', request.request_id, err?.message || err);
        results.push({ request_id: request.request_id, skipped: 'error' });
      }

      if (Object.keys(patch).length > 0) {
        await base44.asServiceRole.entities.MlsUploadRequest.update(request.id, patch);
      }
    }

    return Response.json({ success: true, open_requests: open.length, alerts_sent: sent, results });
  } catch (error: any) {
    console.error('processMlsDeadlineReminders error:', error);
    return Response.json({ error: error?.message || 'Reminder processing failed' }, { status: 500 });
  }
});