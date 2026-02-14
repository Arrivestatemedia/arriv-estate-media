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

    const job = await base44.asServiceRole.entities.Job.get(jobId);

    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.client_phone || !job.client_email) {
      return Response.json({ error: 'Missing required job data' }, { status: 400 });
    }

    // Update job status to "on_the_way"
    await base44.asServiceRole.entities.Job.update(jobId, {
      media_partner_status: 'on_the_way',
      on_the_way_at: new Date().toISOString()
    });

    // Get Gmail access token
    let gmailAccessToken;
    try {
      gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    } catch (e) {
      console.log('Gmail not available');
    }

    // Extract first names
    const clientFirstName = job.client_name.split(' ')[0];
    const mediaPartnerFirstName = job.booked_by_name.split(' ')[0];
    const duration = job.duration_hours || 2;

    const smsMessage = `Hi ${clientFirstName}! Your Media Partner ${mediaPartnerFirstName} is on the way to your ${job.location} listing. They should arrive shortly. Filming should take ${duration} hours and we'll be in contact immediately after the shoot. Thank you for choosing Arriv!`;
    
    const emailBody = `Hi ${clientFirstName}! Your Media Partner ${mediaPartnerFirstName} is on the way to your ${job.location} listing. They should arrive shortly. Filming should take ${duration} hours and we'll be in contact immediately after the shoot. Thank you for choosing Arriv!`;

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
        await sendEmailViaGmail(gmailAccessToken, job.client_email, 'Your Media Partner is On The Way!', emailBody);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'client',
          recipient_email: job.client_email,
          message_content: emailBody,
          subject: 'Your Media Partner is On The Way!',
          job_id: jobId,
          status: 'success'
        });
      } catch (error) {
        console.error('Email send error:', error.message);
      }
    }

    return Response.json({ success: true, message: 'Client notified that media partner is on the way' });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});