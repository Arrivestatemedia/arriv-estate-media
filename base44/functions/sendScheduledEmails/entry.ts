import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const pending = await base44.asServiceRole.entities.ScheduledEmail.filter({
      status: "pending"
    });

    const now = new Date();
    const toSend = pending.filter(e => new Date(e.scheduled_for) <= now);

    // Brevo accepts a batch comfortably; cap so a backlog can't run away.
    const batch = toSend.slice(0, 20);

    const results = await Promise.allSettled(
      batch.map(async (email) => {
        await sendBrevoEmail({
          to: email.to,
          subject: email.subject,
          textContent: email.body,
          senderName: email.from_name || undefined,
          senderEmail: email.from_email || undefined,
        });
        await base44.asServiceRole.entities.ScheduledEmail.update(email.id, {
          status: "sent",
          sent_at: new Date().toISOString()
        });
      })
    );

    let sent = 0, failed = 0;
    await Promise.all(results.map(async (result, i) => {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        failed++;
        await base44.asServiceRole.entities.ScheduledEmail.update(batch[i].id, {
          status: "failed",
          error_message: result.reason?.message || 'Unknown error'
        });
      }
    }));

    // Same cadence as the emails: flush any text that is due.
    let sms = null;
    try {
      const smsRes = await base44.asServiceRole.functions.invoke('sendScheduledSms', {});
      sms = smsRes?.data || smsRes;
    } catch (smsError) {
      console.error('Scheduled SMS run failed:', smsError.message);
    }

    return Response.json({ success: true, sent, failed, checked: batch.length, total_pending: toSend.length, sms });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});