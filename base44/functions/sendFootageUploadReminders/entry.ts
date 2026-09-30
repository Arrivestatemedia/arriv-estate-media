import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * sendFootageUploadReminders
 * Scheduled system function — sends footage upload reminders to media partners
 * who marked a job complete but haven't confirmed their upload.
 *
 * Cadence:
 *   - 2 hours after completion  → reminder #1 (SMS + email, includes Drive link)
 *   - 6 hours after completion  → reminder #2 (SMS + email, includes Drive link)
 *
 * Each reminder is tracked independently (footage_reminder_2h_sent_at,
 * footage_reminder_6h_sent_at) so neither is sent twice.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all jobs that are completed but footage not uploaded
    const jobs = await base44.asServiceRole.entities.Job.filter({
      media_partner_status: 'job_completed',
      footage_uploaded: false
    });

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
    const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));

    let remindersSent = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        if (!job.completed_at) continue;
        const completedAt = new Date(job.completed_at);

        // 2-hour reminder
        if (completedAt <= twoHoursAgo && !job.footage_reminder_2h_sent_at) {
          await sendReminder(base44, job, now);
          await base44.asServiceRole.entities.Job.update(job.id, {
            footage_reminder_2h_sent_at: now.toISOString()
          });
          remindersSent++;
          console.log(`Sent 2h footage reminder for job ${job.id} to ${job.booked_by_name}`);
        }
        // 6-hour reminder
        else if (completedAt <= sixHoursAgo && !job.footage_reminder_6h_sent_at) {
          await sendReminder(base44, job, now);
          await base44.asServiceRole.entities.Job.update(job.id, {
            footage_reminder_6h_sent_at: now.toISOString()
          });
          remindersSent++;
          console.log(`Sent 6h footage reminder for job ${job.id} to ${job.booked_by_name}`);
        }
      } catch (error) {
        console.error(`Failed to send reminder for job ${job.id}:`, error);
        errors.push(`${job.id}: ${error.message}`);
      }
    }

    return Response.json({
      success: true,
      remindersSent,
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    console.error('Error in sendFootageUploadReminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function sendReminder(base44, job, now) {
  // --- SMS via Twilio ---
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  const smsMessage = `Hi ${job.booked_by_name}! Reminder to upload your footage from your shoot at ${job.location}. Open the Arriv app, find your completed job, and use the upload tool to submit your photos and videos directly. Then tap "I've uploaded all my footage" to confirm.`;

  const formattedPhone = job.booked_by_phone.startsWith('+') ? job.booked_by_phone : `+1${job.booked_by_phone}`;

  await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
    },
    body: new URLSearchParams({
      'From': twilioPhone,
      'To': formattedPhone,
      'Body': smsMessage,
    }).toString(),
  });

  // --- Email via Gmail ---
  const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
  const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';

  const emailBody = `Hi ${job.booked_by_name}!

This is a reminder to upload your footage from your shoot at ${job.location}.

Please open the Arriv app, find your completed job card, and use the upload tool to submit your photos and videos directly within the app. After uploading, tap "I've uploaded all my footage" to confirm.

Thank you!`;

  const email = [
    `To: ${job.booked_by}`,
    `From: ${adminEmail}`,
    `Subject: Reminder: Upload Your Footage`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    '',
    emailBody
  ].join('\r\n');

  const encodedMessage = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedMessage })
  });

  // --- Log both messages ---
  await base44.asServiceRole.entities.MessageLog.create({
    message_type: 'sms',
    recipient_type: 'media_partner',
    recipient_phone: job.booked_by_phone,
    message_content: smsMessage,
    job_id: job.id,
    status: 'success'
  });

  await base44.asServiceRole.entities.MessageLog.create({
    message_type: 'email',
    recipient_type: 'media_partner',
    recipient_email: job.booked_by,
    message_content: emailBody,
    subject: 'Reminder: Upload Your Footage',
    job_id: job.id,
    status: 'success'
  });
}