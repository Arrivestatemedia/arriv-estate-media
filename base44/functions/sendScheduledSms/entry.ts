import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';

/**
 * sendScheduledSms
 * Sends any queued text whose time has come, through the app's normal SMS path
 * (sendSms) so it lands in the thread with delivery tracking.
 *
 * Called by the "Send Scheduled Emails" workflow every 5 minutes, next to
 * sendScheduledEmails.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const pending = await base44.asServiceRole.entities.ScheduledSms.filter({ status: 'pending' });
    const now = Date.now();
    const due = pending
      .filter((text) => new Date(text.scheduled_for).getTime() <= now)
      .slice(0, 10);

    let sent = 0;
    let failed = 0;

    for (const text of due) {
      try {
        const res = await base44.asServiceRole.functions.invoke('sendSms', {
          toNumber: text.to_number,
          body: text.body,
        });
        const data = res?.data || res;
        if (!data?.success) throw new Error(data?.error || 'SMS send failed');

        await base44.asServiceRole.entities.ScheduledSms.update(text.id, {
          status: 'sent',
          sent_at: new Date().toISOString(),
          twilio_sid: data.sid || '',
        });
        sent++;
      } catch (error) {
        failed++;
        await base44.asServiceRole.entities.ScheduledSms.update(text.id, {
          status: 'failed',
          error_message: error.message,
        });
      }
    }

    return Response.json({ success: true, sent, failed, due: due.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});