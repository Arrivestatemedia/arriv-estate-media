import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processBackgroundCheckFailure } from '../../shared/backgroundCheck.ts';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { email, status } = body;
    if (!email || !['clear', 'failed'].includes(status)) {
      return Response.json({ error: 'email and status (clear|failed) are required' }, { status: 400 });
    }

    const users = await base44.asServiceRole.entities.User.filter({ email });
    let partner = users && users[0];
    let pendingSignup = null;
    if (!partner) {
      const pending = await base44.asServiceRole.entities.PendingSignup.filter({ email });
      pendingSignup = pending && pending[0];
      if (pendingSignup) {
        partner = { id: null, email: pendingSignup.email, full_name: pendingSignup.full_name, phone_number: pendingSignup.phone_number };
      }
    }
    if (!partner) return Response.json({ error: 'User not found' }, { status: 404 });

    const nowIso = new Date().toISOString();
    const updateFields = {
      background_check_status: status,
      background_check_completed_at: nowIso,
    };
    if (partner.id) {
      await base44.asServiceRole.entities.User.update(partner.id, updateFields);
    } else if (pendingSignup) {
      await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, updateFields);
    }

    let outcome = null;
    if (status === 'failed') {
      outcome = await processBackgroundCheckFailure(base44, partner);
    } else {
      // Capture the job they booked while pending (before clearing) so we can mention it
      const pendingJobId = partner.id
        ? (await base44.asServiceRole.entities.User.get(partner.id))?.background_check_pending_job_id
        : pendingSignup?.background_check_pending_job_id;
      const hasFirstJob = !!pendingJobId;

      if (partner.id) {
        await base44.asServiceRole.entities.User.update(partner.id, { background_check_pending_job_id: null });
      } else if (pendingSignup) {
        await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, { background_check_pending_job_id: null });
      }

      // Notify the media specialist they're cleared and their first job is officially booked
      const firstName = (partner.full_name || '').split(' ')[0] || 'there';
      const smsMessage = hasFirstJob
        ? `Hi ${firstName}! Great news — your background check with Arriv has cleared. You're now cleared to book and accept gigs, and your first job is officially booked! Head to your dashboard for the details. Welcome to the team!`
        : `Hi ${firstName}! Great news — your background check with Arriv has cleared. You're now cleared to book and accept gigs on the Arriv job board. Head to your dashboard to start claiming jobs. Welcome to the team!`;
      const emailSubject = 'Your Arriv Background Check Cleared!';
      const emailBody = hasFirstJob
        ? `Hi ${firstName},\n\nGreat news — your background check with Arriv has cleared. You're now fully cleared to book and accept gigs, and your first job is officially booked!\n\nHead to your dashboard for the job details. If you have any questions, feel free to reach out.\n\nWelcome to the team!\n\nArriv Estate Media Team`
        : `Hi ${firstName},\n\nGreat news — your background check with Arriv has cleared. You're now fully cleared to book and accept gigs on the Arriv job board.\n\nHead to your dashboard to start claiming jobs. If you have any questions, feel free to reach out.\n\nWelcome to the team!\n\nArriv Estate Media Team`;

      // SMS via Twilio
      if (partner.phone_number) {
        const formattedPhone = partner.phone_number.startsWith('+') ? partner.phone_number : `+1${partner.phone_number}`;
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        try {
          const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: fromPhone,
              To: formattedPhone,
              Body: smsMessage,
            }).toString(),
          });
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'sms',
            recipient_type: 'media_partner',
            recipient_phone: partner.phone_number,
            message_content: smsMessage,
            status: smsResponse.ok ? 'success' : 'failed',
          });
        } catch (smsErr) {
          console.error('Background check clear SMS failed:', smsErr.message);
        }
      }

      // Email via Brevo (from careers@arrivestatemedia.com)
      if (partner.email) {
        try {
          await sendBrevoEmail({
            to: partner.email,
            subject: emailSubject,
            textContent: emailBody,
            senderEmail: 'careers@arrivestatemedia.com',
            senderName: 'Arriv Estate Media',
          });
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'media_partner',
            recipient_email: partner.email,
            message_content: emailBody,
            subject: emailSubject,
            status: 'success',
          });
        } catch (emailErr) {
          console.error('Background check clear email failed:', emailErr.message);
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'media_partner',
            recipient_email: partner.email,
            message_content: emailBody,
            subject: emailSubject,
            status: 'failed',
            error_message: emailErr.message,
          });
        }
      }
    }

    return Response.json({ success: true, status, outcome });
  } catch (error) {
    console.error('updateBackgroundCheckStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});