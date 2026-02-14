import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { format, parse as parseDate, addDays } from 'npm:date-fns@3.6.0';

async function sendEmailViaGmail(accessToken, to, subject, body, attachmentUrl) {
  // Download the PDF attachment
  const pdfResponse = await fetch(attachmentUrl);
  const pdfBuffer = await pdfResponse.arrayBuffer();
  const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
  
  // Create email with attachment
  const boundary = '----=_Part_0_' + Date.now();
  
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    '',
    body,
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="Supra_General_Access_Guide.pdf"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="Supra_General_Access_Guide.pdf"`,
    '',
    pdfBase64,
    '',
    `--${boundary}--`
  ].join('\r\n');
  
  const encodedMessage = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
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

    if (!job.client_phone || !job.client_email || !job.booked_by_name || !job.booked_by_phone) {
      return Response.json({ error: 'Missing required job data' }, { status: 400 });
    }

    // Format the date and time (add 1 day to display correct date)
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    const displayDate = addDays(jobDate, 1);
    const formattedDate = format(displayDate, 'MMMM d, yyyy');
    const formattedTime = job.start_time || '9:00 AM';

    // Create the message
    const message = `Your Photographer/Videographer ${job.booked_by_name} will be seeing you on ${formattedDate} at ${formattedTime}.

If you do not plan on being on site please make sure that you have granted Supra access to the number below:

${job.booked_by_phone}

Please see attached document for instructions on how to add Temporary access in Supra.`;

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Send SMS to client
    const formattedPhone = job.client_phone.startsWith('+') ? job.client_phone : `+1${job.client_phone}`;
    
    const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: formattedPhone,
        Body: message,
      }).toString(),
    });

    if (!smsResponse.ok) {
      const error = await smsResponse.text();
      console.error('Twilio error:', error);
    }

    // Log SMS
    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'sms',
      recipient_type: 'client',
      recipient_phone: job.client_phone,
      message_content: message,
      job_id: jobId,
      status: smsResponse.ok ? 'success' : 'failed'
    });

    // Send email with PDF attachment via Gmail
    let gmailAccessToken;
    try {
      gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
    } catch (e) {
      console.log('Gmail not available');
    }

    if (gmailAccessToken) {
      const pdfUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/e8d4eb3d5_Supra_General_Access_Guide.pdf';
      const emailBody = `Your Photographer/Videographer ${job.booked_by_name} will be seeing you on ${formattedDate} at ${formattedTime}.\n\nIf you do not plan on being on site please make sure that you have granted Supra access to the number below:\n\n${job.booked_by_phone}\n\nPlease see attached document for instructions on how to add Temporary access in Supra.\n\nBest regards,\nArriv`;
      
      try {
        await sendEmailViaGmail(gmailAccessToken, job.client_email, 'Supra Access Information for Your Upcoming Shoot', emailBody, pdfUrl);
        
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'client',
          recipient_email: job.client_email,
          message_content: emailBody,
          subject: 'Supra Access Information for Your Upcoming Shoot',
          job_id: jobId,
          status: 'success'
        });
      } catch (error) {
        console.error('Email send error:', error);
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'client',
          recipient_email: job.client_email,
          message_content: emailBody,
          subject: 'Supra Access Information for Your Upcoming Shoot',
          job_id: jobId,
          status: 'failed',
          error_message: error.message
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending Supra access notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});