import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function getTimeOfDay() {
  const hour = new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' });
  const h = parseInt(hour);
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { jobId, driveLink, youtubeLink } = await req.json();

    if (!jobId || !driveLink) {
      return Response.json({ error: 'jobId and driveLink are required' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(jobId);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const timeOfDay = getTimeOfDay();
    const firstName = job.client_name ? job.client_name.split(' ')[0] : 'there';
    const address = job.location || 'your property';

    const youtubeLine = youtubeLink
      ? `\n\nAnd here's the unbranded YouTube link for MLS:\n\n${youtubeLink}`
      : '';

    const messageText = `Good ${timeOfDay} ${firstName} -\nyour media for ${address} is ready.\n\nHere's the download link:\n\n${driveLink}${youtubeLine}\n\nHappy to make any adjustments if needed.\n-Brad`;

    const gmailToken = await base44.asServiceRole.connectors.getAccessToken('gmail');

    // Send email
    if (job.client_email) {
      const htmlBody = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.8; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Good ${timeOfDay} ${firstName} -<br>your media for <strong>${address}</strong> is ready.</p>
  <p>Here's the download link:</p>
  <p style="text-align: center; margin: 24px 0;">
    <a href="${driveLink}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">📁 Download Media</a>
  </p>
  ${youtubeLink ? `<p>And here's the unbranded YouTube link for MLS:</p><p style="text-align: center; margin: 24px 0;"><a href="${youtubeLink}" style="background-color: #1A1A1A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">▶ YouTube (Unbranded MLS)</a></p>` : ''}
  <p>Happy to make any adjustments if needed.<br>-Brad</p>
</body></html>`;

      const emailLines = [
        `To: ${job.client_email}`,
        `Subject: Your Media is Ready - ${address}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        '',
        htmlBody
      ].join('\r\n');

      const encoded = btoa(unescape(encodeURIComponent(emailLines)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encoded })
      });
    }

    // Send SMS
    if (job.client_phone) {
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          To: job.client_phone,
          From: twilioPhone,
          Body: messageText
        })
      });
    }

    return Response.json({ success: true });

  } catch (error) {
    console.error('Error sending media:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});