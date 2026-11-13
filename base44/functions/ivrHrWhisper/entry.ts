/**
 * ivrHrWhisper — the line the owner hears before a job-applicant call is
 * bridged. Twilio fetches this URL as the <Number> whisper, so the greeting is
 * spoken only to the owner and never to the caller.
 *
 * The wording lives in the published Call Center configuration, so the studio
 * can retune what the owner hears without any deployment. The defaults are the
 * exact sentences that were hardcoded here before.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { escapeXml, e164 } from '../../shared/ivr.ts';
import { loadProduction, applicantWhisper } from '../../shared/productionIvr.ts';

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

  const { prod } = await loadProduction(createClientFromRequest(req));
  const text = applicantWhisper(prod, { name, first_name: firstName, number });
  const voice = String(prod.applicant.whisper_voice || 'Polly.Joanna');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escapeXml(voice)}">${escapeXml(text)}</Say></Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
  );
});