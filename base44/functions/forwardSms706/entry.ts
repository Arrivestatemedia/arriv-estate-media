import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';

// Default target (can be overridden via the manageSmsForwarding function).
const SETTING_KEY = 'sms_forward_706_target';
const DEFAULT_TARGET = '+16786409268';

const e164 = (n) => {
  if (!n) return '';
  return n.startsWith('+') ? n : '+1' + String(n).replace(/\D/g, '');
};

// Sends an outbound SMS via the Twilio REST API.
async function sendTwilioSms(from, to, body) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  if (!sid || !token) throw new Error('Twilio credentials not configured');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const body = await req.text();

    // ── Twilio webhook signature verification ──
    const signatureValid = await validateTwilioRequest(req, body, 'forwardSms706');
    if (!signatureValid) {
      return new Response(JSON.stringify({ error: 'Invalid Twilio signature' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const params = new URLSearchParams(body);
    const from = params.get('From');
    const to = params.get('To');
    const messageBody = params.get('Body');

    // Read the current forwarding target from AppSetting (set via manageSmsForwarding).
    const base44 = createClientFromRequest(req);
    let forwardTo = DEFAULT_TARGET;
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: SETTING_KEY });
      if (settings && settings.length > 0 && settings[0].value) {
        forwardTo = settings[0].value;
      }
    } catch (e) {
      console.error('Failed to read forwarding target setting:', e.message);
    }

    // Loop prevention: don't forward messages sent FROM the target number
    // (e.g. the specialist replying to the 706 number).
    if (e164(from) === forwardTo) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Forward the inbound SMS to the target, preserving the original sender.
    const forwardedBody = `[Forwarded from ${from}] ${messageBody}`;
    await sendTwilioSms(to, forwardTo, forwardedBody);

    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    console.error('forwardSms706 error:', error);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
});