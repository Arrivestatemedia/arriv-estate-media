import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { jobId, driveLink, youtubeLink, messageBody: customMessageBody } = await req.json();

    if (!jobId || !driveLink) {
      return Response.json({ error: 'jobId and driveLink are required' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    let messageBody;
    if (customMessageBody) {
      // Use the edited message from the frontend
      messageBody = customMessageBody;
    } else {
      // Fallback: build default message
      const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' });
      const h = parseInt(hour);
      const timeOfDay = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
      const firstName = job.client_name?.split(' ')[0] || job.client_name;
      const address = job.location;
      const youtubeLine = youtubeLink ? `\n\nAnd here's the unbranded YouTube link for MLS:\n\n${youtubeLink}` : '';
      messageBody = `Good ${timeOfDay} ${firstName} -\nyour media for ${address} is ready.\n\nHere's the download link:\n\n${driveLink}${youtubeLine}\n\nHappy to make any adjustments if needed.\n-Brad`;
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    // Send SMS
    const formattedPhone = job.client_phone?.startsWith('+') ? job.client_phone : `+1${job.client_phone}`;
    const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: fromPhone, To: formattedPhone, Body: messageBody }).toString(),
    });

    const smsOk = smsRes.ok;
    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'sms',
      recipient_type: 'client',
      recipient_phone: job.client_phone,
      message_content: messageBody,
      job_id: jobId,
      status: smsOk ? 'success' : 'failed',
    });

    // Send Email
    const emailSubject = `Your Media is Ready – ${address}`;
    const emailLines = [
      `To: ${job.client_email}`,
      `Subject: ${emailSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      messageBody,
    ].join('\r\n');

    const encodedEmail = btoa(unescape(encodeURIComponent(emailLines)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const emailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encodedEmail }),
    });

    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'email',
      recipient_type: 'client',
      recipient_email: job.client_email,
      subject: emailSubject,
      message_content: messageBody,
      job_id: jobId,
      status: emailRes.ok ? 'success' : 'failed',
    });

    return Response.json({ success: true, smsOk, emailOk: emailRes.ok, preview: messageBody });

  } catch (error) {
    console.error('sendMediaToClient error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});