/**
 * ivrHrWhisper — the line the owner hears before a job-applicant call is
 * bridged. Twilio fetches this URL as the <Number> whisper, so the greeting is
 * spoken only to the owner and never to the caller.
 *
 * It says who is calling, and that they are calling about a job interview.
 * A caller with no application on file is announced by number only, so the
 * owner is never told a name the system does not actually have.
 */

import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { escapeXml, e164 } from '../../shared/ivr.ts';

function spokenNumber(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return digits.split('').join(' ');
}

Deno.serve(async (req) => {
  const raw = await req.text();

  const valid = await validateTwilioRequest(req, raw, 'ivrHrWhisper');
  if (!valid) {
    console.error('[ivrHrWhisper] signature verification failed');
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 403,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    });
  }

  const query = new URL(req.url).searchParams;
  const name = String(query.get('name') || '').trim();
  const number = spokenNumber(e164(query.get('number')) || query.get('number') || '');
  const firstName = name.split(/\s+/)[0] || '';

  const text = name
    ? `Call from ${name}, ${number}. ${firstName} is calling to follow up on a job application, regarding a job interview. Connecting now.`
    : `Call from ${number}. This caller is not in the applicant records, and is calling regarding a job interview. Connecting now.`;

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(text)}</Say></Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
  );
});