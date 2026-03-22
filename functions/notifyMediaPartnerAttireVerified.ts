import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { format, parse as parseDate, addDays } from 'npm:date-fns@3.6.0';

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

    if (!job.booked_by || !job.booked_by_phone || !job.location) {
      console.error('Missing required fields:', {
        booked_by: job.booked_by,
        booked_by_phone: job.booked_by_phone,
        location: job.location
      });
      return Response.json({ error: 'Missing required job data' }, { status: 400 });
    }

    // Format the date and time
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    const displayDate = addDays(addDays(jobDate, -1), 1);
    const formattedDate = format(displayDate, 'MMMM d, yyyy');
    const formattedTime = job.start_time || '9:00 AM';

    const mediaPartnerFirstName = job.booked_by_name.split(' ')[0];

    // Create message
    const message = `Hi ${mediaPartnerFirstName}!\n\nThank you for verifying your attire. You're all set to head to the property!\n\nJob Details:\nAddress: ${job.location}\nDate: ${formattedDate}\nTime: ${formattedTime}\n\nSafe travels!`;

    // Send SMS via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    const formattedPhone = job.booked_by_phone.startsWith('+') ? job.booked_by_phone : `+1${job.booked_by_phone}`;
    
    try {
      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
        },
        body: new URLSearchParams({
          'From': twilioPhone,
          'To': formattedPhone,
          'Body': message,
        }).toString(),
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'media_partner',
        recipient_phone: job.booked_by_phone,
        message_content: message,
        job_id: jobId,
        status: 'success'
      });
    } catch (error) {
      console.error('SMS send error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'media_partner',
        recipient_phone: job.booked_by_phone,
        message_content: message,
        job_id: jobId,
        status: 'failed',
        error_message: error.message
      });
    }

    // Send email via Gmail
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const adminEmail = 'BradCBurke@arrivestatemedia.com';

      const email = [
        `To: ${job.booked_by}`,
        `From: ${adminEmail}`,
        `Subject: You're verified and ready to go!`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset="UTF-8"`,
        '',
        message
      ].join('\r\n');

      const encodedMessage = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const emailResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedMessage })
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.text();
        console.error('Gmail API error:', emailResponse.status, errorData);
      }

      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'media_partner',
        recipient_email: job.booked_by,
        message_content: message,
        subject: "You're verified and ready to go!",
        job_id: jobId,
        status: emailResponse.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Email send error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'media_partner',
        recipient_email: job.booked_by,
        message_content: message,
        subject: "You're verified and ready to go!",
        job_id: jobId,
        status: 'failed',
        error_message: error.message
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending media partner notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});