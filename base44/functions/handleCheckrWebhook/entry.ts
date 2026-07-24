import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

const twilioSms = async (to, body) => {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!accountSid || !authToken || !fromPhone || !to) return { ok: false };
  const res = await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
    },
    body: new URLSearchParams({ From: fromPhone, To: to, Body: body }).toString(),
  });
  return { ok: res.ok };
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const secret = url.searchParams.get('secret');
    const expectedSecret = Deno.env.get('CHECKR_WEBHOOK_SECRET');
    if (!expectedSecret || secret !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const objectType = body.object || (body.type ? String(body.type).split('.')[0] : null);
    const candidateId = body.candidate_id;
    const status = body.status;
    const reportId = body.id;

    // Only report results matter for the pass/fail decision.
    if (objectType !== 'report' || !candidateId) {
      return Response.json({ received: true, ignored: true });
    }

    // Find the partner by their Checkr candidate id.
    const partners = await base44.asServiceRole.entities.User.filter({ checkr_candidate_id: candidateId });
    const partner = partners && partners[0];
    if (!partner) {
      return Response.json({ received: true, partnerNotFound: true });
    }

    const nowIso = new Date().toISOString();

    if (status === 'clear') {
      // Passed — partner is cleared for all future gigs. Job stays as-is.
      await base44.asServiceRole.entities.User.update(partner.id, {
        background_check_status: 'clear',
        background_check_completed_at: nowIso,
        checkr_report_id: reportId || partner.checkr_report_id,
        background_check_pending_job_id: null,
      });
      return Response.json({ received: true, result: 'clear' });
    }

    if (status === 'consider' || status === 'suspended') {
      // Failed — remove the partner from the gig, promote/notify backup, notify admin.
      await base44.asServiceRole.entities.User.update(partner.id, {
        background_check_status: 'failed',
        background_check_completed_at: nowIso,
        checkr_report_id: reportId || partner.checkr_report_id,
      });

      // Locate the gig they were booking.
      let job = null;
      if (partner.background_check_pending_job_id) {
        try { job = await base44.asServiceRole.entities.Job.get(partner.background_check_pending_job_id); } catch (e) { job = null; }
      }
      if (!job) {
        const booked = await base44.asServiceRole.entities.Job.filter({ booked_by: partner.email, status: 'booked' });
        job = booked && booked[0];
      }
      if (!job) {
        return Response.json({ received: true, result: 'failed', jobNotFound: true });
      }

      const adminPhone = Deno.env.get('ADMIN_PHONE') || '4047891107';

      if (job.backup_booked_by) {
        // Promote the backup to primary.
        await base44.asServiceRole.entities.Job.update(job.id, {
          booked_by: job.backup_booked_by,
          booked_by_name: job.backup_booked_by_name,
          booked_by_phone: job.backup_booked_by_phone,
          backup_booked_by: null,
          backup_booked_by_name: null,
          backup_booked_by_phone: null,
          status: 'booked',
        });

        // Look up the backup's own background-check status to tailor the message.
        let backupCleared = false;
        try {
          const backupUsers = await base44.asServiceRole.entities.User.filter({ email: job.backup_booked_by });
          const backupUser = backupUsers && backupUsers[0];
          backupCleared = backupUser && backupUser.background_check_status === 'clear';
          // Ensure the promoted backup is flagged to complete a background check (if not already cleared).
          if (backupUser && backupUser.background_check_status !== 'clear' && !backupUser.background_check_status) {
            await base44.asServiceRole.entities.User.update(backupUser.id, { background_check_status: 'not_started' });
          }
        } catch (e) { /* ignore */ }

        const jobLine = `${job.title} on ${job.date} at ${job.start_time || 'TBD'} (${job.location}) — $${job.pay_rate}`;
        const smsBody = `Arriv: You've been promoted to PRIMARY for ${jobLine}.${backupCleared ? '' : ' You must complete a background check before you can begin — log in to your Arriv dashboard to finish it.'} - Arriv`;
        await twilioSms(job.backup_booked_by_phone, smsBody);

        try {
          const clearedNote = "<p>Since your background check is already complete, you are all set — head to your Arriv dashboard to manage the gig.</p>";
          const pendingNote = "<p><strong>One more step:</strong> a background check is required before you can begin. Please log in to your Arriv dashboard and complete the background check authorization to confirm the gig.</p>";
          await sendBrevoEmail({
            to: job.backup_booked_by,
            subject: "You've been promoted to primary on Arriv",
            htmlContent: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1A1A1A">
              <h2 style="color:#B8956A">You've been promoted to primary</h2>
              <p>Hi ${job.backup_booked_by_name || 'there'},</p>
              <p>The original media partner for the following gig is no longer available, and you've been promoted to primary:</p>
              <p style="background:#FFFBF5;border:1px solid #B8956A33;border-radius:8px;padding:12px 16px;">
                <strong>${job.title}</strong><br/>
                ${job.location}<br/>
                ${job.date}${job.start_time ? ' at ' + job.start_time : ''}<br/>
                Pay: $${job.pay_rate}
              </p>
              ${backupCleared ? clearedNote : pendingNote}
              <p style="color:#888;font-size:12px;margin-top:24px">— Arriv Estate Media</p>
            </div>`,
          });
        } catch (e) {
          console.error('Backup email failed:', e.message);
        }

        await twilioSms(adminPhone, `Arriv: A media partner's background check did not pass. ${job.title} on ${job.date} has been reassigned to the backup: ${job.backup_booked_by_name || job.backup_booked_by}.`);
      } else {
        // No backup — return the gig to the open board.
        await base44.asServiceRole.entities.Job.update(job.id, {
          booked_by: null,
          booked_by_name: null,
          booked_by_phone: null,
          status: 'open',
        });
        await twilioSms(adminPhone, `Arriv: A media partner's background check did not pass. ${job.title} on ${job.date} has been returned to the open job board (no backup was assigned).`);
      }

      return Response.json({ received: true, result: 'failed', reassigned: !!job.backup_booked_by });
    }

    // Any other status (pending, etc.) — just record the report id.
    if (reportId) {
      await base44.asServiceRole.entities.User.update(partner.id, { checkr_report_id: reportId });
    }
    return Response.json({ received: true, result: status });
  } catch (error) {
    console.error('handleCheckrWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});