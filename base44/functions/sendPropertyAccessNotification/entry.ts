import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { format, parse as parseDate } from 'npm:date-fns@3.6.0';
import {
  PROVIDER_SENTRILOCK,
  PROVIDER_SUPRA,
  getPropertyAccessProvider,
  getAccessGuideUrl,
} from '../../shared/propertyAccessProvider.ts';

// Encode a string as base64url (RFC 4648) with UTF-8 support.
function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendTwilioSms(to: string, body: string): Promise<Response> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
  if (!accountSid || !authToken || !fromPhone) {
    throw new Error('Twilio credentials not configured');
  }
  return fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
    body: new URLSearchParams({ From: fromPhone, To: to, Body: body }).toString(),
  });
}

async function sendGmailEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<Response> {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');
  const encoded = encodeBase64Url(email);
  return fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  });
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

    if (!job.client_phone || !job.client_email || !job.booked_by_name) {
      console.error('Missing required job fields:', {
        client_phone: !!job.client_phone,
        client_email: !!job.client_email,
        booked_by_name: !!job.booked_by_name,
      });
      return Response.json({ error: 'Missing required job data' }, { status: 400 });
    }

    // ── Resolve provider from property state ──
    const provider = getPropertyAccessProvider(job);
    const guideUrl = getAccessGuideUrl(provider);

    // ── Format common fields ──
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    const formattedDate = format(jobDate, 'MMMM d, yyyy');
    const formattedTime = job.start_time || '9:00 AM';
    const clientFirstName = (job.client_name || '').split(' ')[0] || 'there';
    const specialistName = job.booked_by_name;
    const specialistEmail = job.booked_by; // canonical verified account email
    const specialistPhone = job.booked_by_phone;
    const propertyAddress = job.location;
    const formattedPhone = job.client_phone.startsWith('+')
      ? job.client_phone
      : `+1${job.client_phone}`;

    const accessMethod = provider === PROVIDER_SENTRILOCK ? 'SENTRICONNECT' : 'SUPRA_EKEY';

    let smsMessage: string;
    let emailSubject: string;
    let emailBody: string;

    if (provider === PROVIDER_SENTRILOCK) {
      // ── DMV: SentriLock / SentriConnect notification ──
      smsMessage =
        `Hi ${clientFirstName}! Your Arriv Estate Media Media Specialist, ${specialistName}, is on the way to your listing at ${propertyAddress}.\n\n` +
        `If you will not be on site, please grant them temporary SentriConnect access through your SentriKey Real Estate app.\n\n` +
        `SentriConnect email:\n${specialistEmail}\n\n` +
        `For step-by-step instructions, view the Arriv Estate Media SentriLock Access Guide:\n${guideUrl}\n\n` +
        `Arriv Estate Media`;

      emailSubject = 'Your Media Specialist is on the way - SentriLock Access';

      emailBody =
        `Hi ${clientFirstName},\n\n` +
        `Your Arriv Estate Media Media Specialist, ${specialistName}, is on the way to your listing at:\n\n` +
        `${propertyAddress}\n\n` +
        `If you will not be on site, please grant temporary SentriConnect access through your SentriKey Real Estate app.\n\n` +
        `MEDIA SPECIALIST\n${specialistName}\n\n` +
        `SENTRICONNECT EMAIL\n${specialistEmail}\n\n` +
        `APPOINTMENT\n${formattedDate}\n${formattedTime}\n\n` +
        `For step-by-step instructions, view the Arriv Estate Media SentriLock General Access Guide:\n${guideUrl}\n\n` +
        `Thank you,\n\nArriv Estate Media`;
    } else {
      // ── Supra notification (existing markets) ──
      // Fixed: removed "Please see attached document" (no attachment is sent),
      // replaced with "view the guide below". Uses SUPRA_ACCESS_GUIDE_URL from env.
      smsMessage =
        `Hi ${clientFirstName}!\n\n` +
        `Your Media Specialist ${specialistName} is on the way to your ${propertyAddress} listing.\n\n` +
        `They should arrive shortly. Filming should take 2 hours and we'll be in contact immediately after the shoot.\n\n` +
        `If you do not plan on being on site please make sure that you grant Supra access to the number below:\n\n` +
        `${specialistPhone}\n\n` +
        `For instructions on how to add temporary access in Supra, view the guide below:\n${guideUrl}`;

      emailSubject = 'Your Media Specialist is on the way!';

      emailBody =
        `Hi ${clientFirstName}!\n\n` +
        `Your Media Specialist ${specialistName} is on the way to your ${propertyAddress} listing.\n\n` +
        `They should arrive shortly. Filming should take 2 hours and we'll be in contact immediately after the shoot.\n\n` +
        `If you do not plan on being on site please make sure that you grant Supra access to the number below:\n\n` +
        `${specialistPhone}\n\n` +
        `For instructions on how to add temporary access in Supra, view the guide below:\n${guideUrl}`;
    }

    // ── Send SMS via Twilio ──
    try {
      const smsRes = await sendTwilioSms(formattedPhone, smsMessage);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'client',
        recipient_phone: job.client_phone,
        message_content: smsMessage,
        job_id: jobId,
        status: smsRes.ok ? 'success' : 'failed',
        provider,
        access_method: accessMethod,
        ...(smsRes.ok ? {} : { error_message: `Twilio returned ${smsRes.status}` }),
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
        error_message: error.message,
        provider,
        access_method: accessMethod,
      });
    }

    // ── Send email via Gmail connector ──
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
      const emailRes = await sendGmailEmail(accessToken, job.client_email, emailSubject, emailBody);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: job.client_email,
        message_content: emailBody,
        subject: emailSubject,
        job_id: jobId,
        status: emailRes.ok ? 'success' : 'failed',
        provider,
        access_method: accessMethod,
        ...(emailRes.ok ? {} : { error_message: `Gmail returned ${emailRes.status}` }),
      });
    } catch (error) {
      console.error('Email send error:', error);
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: job.client_email,
        message_content: emailBody,
        subject: emailSubject,
        job_id: jobId,
        status: 'failed',
        error_message: error.message,
        provider,
        access_method: accessMethod,
      });
    }

    return Response.json({ success: true, provider });
  } catch (error) {
    console.error('Error sending property access notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});