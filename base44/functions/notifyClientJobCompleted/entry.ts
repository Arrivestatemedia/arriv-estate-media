import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function sendEmailViaGmail(accessToken, to, subject, body) {
  const message = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
  const encodedMessage = btoa(message);
  
  const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedMessage
    })
  });
  
  if (!response.ok) {
    throw new Error(`Gmail send failed: ${response.statusText}`);
  }
  
  return response.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job details
    const job = await base44.asServiceRole.entities.Job.get(jobId);

    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.client_phone || !job.client_email) {
      return Response.json({ error: 'Missing required job data' }, { status: 400 });
    }

    // Update job: Media Partner has completed on-site capture.
    // Keep status as 'booked' until footage is uploaded (autoCompleteJobsWithFootage
    // transitions to 'in_progress' when upload is confirmed). Set capture_status
    // to 'captured' — this is separate from upload and delivery status.
    await base44.asServiceRole.entities.Job.update(jobId, {
      media_partner_status: 'job_completed',
      capture_status: 'captured',
      completed_at: new Date().toISOString()
    });

    // Mark associated booking as completed
    if (job.booking_id) {
      await base44.asServiceRole.entities.Booking.update(job.booking_id, {
        status: 'completed'
      });
    }

    // Add pay amount to media partner's current balance
          const mediaPartnerEmail = job.booked_by;
          const payAmount = job.pay_rate || 0;

          // Try to update User entity first
          const existingUsers = await base44.asServiceRole.entities.User.filter({ email: mediaPartnerEmail });
          if (existingUsers.length > 0) {
            const user = existingUsers[0];
            const newBalance = (user.current_balance || 0) + payAmount;
            await base44.asServiceRole.entities.User.update(user.id, {
              current_balance: newBalance
            });
          } else {
            // If not in User entity, update PendingSignup
            const pendingSignups = await base44.asServiceRole.entities.PendingSignup.filter({ email: mediaPartnerEmail });
            if (pendingSignups.length > 0) {
              const pendingSignup = pendingSignups[0];
              const newBalance = (pendingSignup.current_balance || 0) + payAmount;
              await base44.asServiceRole.entities.PendingSignup.update(pendingSignup.id, {
                current_balance: newBalance
              });
            }
          }

    // Get Gmail access token
    let gmailAccessToken;
    try {
      gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    } catch (e) {
      console.log('Gmail not available');
    }

    // Prepare messages
    const smsMessage = `Your shoot has been completed! Your media should be ready in 24-48 hours. Thank you for trusting Arriv!`;
    
    const emailBody = `Hello ${job.client_name},\n\nYour shoot has been completed! Your media should be ready in 24-48 hours.\n\nThank you for trusting Arriv.\n\nBest regards,\nArriv`;

    // Send SMS via Twilio
    const formattedPhone = job.client_phone.startsWith('+') ? job.client_phone : `+1${job.client_phone}`;
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

      if (smsResponse.ok) {
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms',
          recipient_type: 'client',
          recipient_phone: job.client_phone,
          message_content: smsMessage,
          job_id: jobId,
          status: 'success'
        });
      }
    } catch (error) {
      console.error('SMS send error:', error.message);
    }

    // Send email via Gmail
    if (gmailAccessToken) {
      try {
        await sendEmailViaGmail(gmailAccessToken, job.client_email, 'Your Shoot is Complete!', emailBody);
      } catch (error) {
        console.error('Email send error:', error.message);
      }
    }

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'client',
      recipient_email: job.client_email,
      message_content: emailBody,
      subject: 'Your Shoot is Complete!',
      job_id: jobId,
      status: 'success'
    });

    return Response.json({ success: true, message: 'Client notified that job is completed' });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});