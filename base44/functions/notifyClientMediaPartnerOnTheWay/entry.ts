import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';

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

    // Extract first names
    const clientFirstName = job.client_name.split(' ')[0];
    const mediaPartnerFirstName = job.booked_by_name.split(' ')[0];

    const smsMessage = `Hi ${clientFirstName}! Your Media Specialist ${mediaPartnerFirstName} is on the way to your ${job.location} listing.\n\nThey should arrive shortly. Filming should take 2 hours and we'll be in contact immediately after the shoot. Thank you for choosing Arriv!`;
    
    const emailBody = `Hi ${clientFirstName}! Your Media Specialist ${mediaPartnerFirstName} is on the way to your ${job.location} listing.\n\nThey should arrive shortly. Filming should take 2 hours and we'll be in contact immediately after the shoot. Thank you for choosing Arriv!`;

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

    // Send email via Brevo
    try {
      await sendBrevoEmail({
        to: job.client_email,
        subject: 'Your Media Partner is On The Way!',
        textContent: emailBody,
        senderEmail: BOOKINGS_SENDER_EMAIL,
      });
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

    return Response.json({ success: true, message: 'Client notified that media partner is on the way' });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});