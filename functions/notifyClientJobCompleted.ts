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

    // Update job status
    await base44.asServiceRole.entities.Job.update(jobId, {
      media_partner_status: 'job_completed',
      completed_at: new Date().toISOString(),
      status: 'completed'
    });

    // Check if 90 minutes have passed since job start time
    const jobDateTime = new Date(`${job.date}T${job.start_time}`);
    const now = new Date();
    const minutesSinceStart = (now - jobDateTime) / (1000 * 60);

    // If 90+ minutes have passed, add to media partner's current balance
    if (minutesSinceStart >= 90 && job.booked_by && job.pay_rate) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ email: job.booked_by });
        if (users.length > 0) {
          const mediaPartner = users[0];
          const currentBalance = mediaPartner.current_balance || 0;
          await base44.asServiceRole.entities.User.update(mediaPartner.id, {
            current_balance: currentBalance + job.pay_rate
          });
        }
      } catch (error) {
        console.error('Error updating media partner balance:', error.message);
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