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

    // Get booked_by_phone from User entity by matching name
    let bookedByPhone = job.booked_by_phone;
    if (!bookedByPhone && job.booked_by_name) {
      const users = await base44.asServiceRole.entities.User.filter({ full_name: job.booked_by_name });
      bookedByPhone = users?.[0]?.phone_number || '';
    }

    if (!job.client_phone || !job.client_email || !job.booked_by_name || !bookedByPhone) {
      console.error('Missing required fields:', {
        client_phone: job.client_phone,
        client_email: job.client_email,
        booked_by_name: job.booked_by_name,
        booked_by_phone: bookedByPhone
      });
      return Response.json({ error: 'Missing required job data', missing: {
        client_phone: !job.client_phone,
        client_email: !job.client_email,
        booked_by_name: !job.booked_by_name,
        booked_by_phone: !bookedByPhone
      }}, { status: 400 });
    }

    // Format the date and time
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    const displayDate = addDays(jobDate, 1);
    const formattedDate = format(displayDate, 'MMMM d, yyyy');
    const formattedTime = job.start_time || '9:00 AM';

    // Create SMS message
    const smsMessage = `Your Photographer/Videographer ${job.booked_by_name} will be seeing you on ${formattedDate} at ${formattedTime}. If you do not plan on being on site please make sure that you have granted Supra access to ${bookedByPhone}. Supra instructions: https://drive.google.com/file/d1mtMMXNAIutztKxa4GYrqrWx96uoEGqRv/view?usp=drivesdk`;

    // Send SMS via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    const formattedPhone = job.client_phone.startsWith('+') ? job.client_phone : `+1${job.client_phone}`;
    
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
          'Body': smsMessage,
        }).toString(),
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'client',
        recipient_phone: job.client_phone,
        message_content: smsMessage,
        job_id: jobId,
        status: 'success'
      });
    } catch (error) {
      console.error('SMS send error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'client',
        recipient_phone: job.client_phone,
        message_content: smsMessage,
        job_id: jobId,
        status: 'failed',
        error_message: error.message
      });
    }

    // Send email with PDF attachment via Gmail
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
      const adminEmail = 'BradCBurke@arrivestatemedia.com';

      // Download and encode PDF
      const pdfUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/e8d4eb3d5_Supra_General_Access_Guide.pdf';
      const pdfResponse = await fetch(pdfUrl);
      const pdfBuffer = await pdfResponse.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

      // Create multipart email
      const boundary = '----=_Part_0_' + Date.now();
      const emailBody = `Hi ${job.client_name},\n\nYour Photographer/Videographer ${job.booked_by_name} will be seeing you on ${formattedDate} at ${formattedTime}.\n\nIf you do not plan on being on site please make sure that you have granted Supra access to the number below:\n\n${bookedByPhone}\n\nPlease see attached document for instructions on how to add Temporary access in Supra.\n\nSupra instructions: https://drive.google.com/file/d1mtMMXNAIutztKxa4GYrqrWx96uoEGqRv/view?usp=drivesdk\n\nBest regards,\nArriv Team`;

      const email = [
        `To: ${job.client_email}`,
        `From: ${adminEmail}`,
        `Subject: Supra Access Information for Your Upcoming Shoot`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset="UTF-8"`,
        '',
        emailBody
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
        recipient_type: 'client',
        recipient_email: job.client_email,
        message_content: emailBody,
        subject: 'Supra Access Information for Your Upcoming Shoot',
        job_id: jobId,
        status: emailResponse.ok ? 'success' : 'failed'
      });
    } catch (error) {
      console.error('Email send error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: job.client_email,
        message_content: 'Failed to send email',
        subject: 'Supra Access Information for Your Upcoming Shoot',
        job_id: jobId,
        status: 'failed',
        error_message: error.message
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending Supra access notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});