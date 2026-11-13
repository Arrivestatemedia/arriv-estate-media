/**
 * Inbound voice handler for the (706) 912-8967 business line.
 *
 * Every call to the 706 number is forwarded to the designated cellphone.
 * If nobody answers, the caller hears a short message instead of silence,
 * so the line never dead-airs.
 */

const FORWARD_TO = '+14047891107';
const CALLER_ID = '+17069128967';

// Twilio is registered against the published app host, so the callback uses it too.
const APP_BASE = 'https://arrivestatemedia.base44.app';

function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const stage = url.searchParams.get('stage');

  if (stage === 'fallback') {
    const form = new URLSearchParams(await req.text().catch(() => ''));
    if (form.get('DialCallStatus') === 'completed') {
      return xml('');
    }
    return xml(
      '<Say voice="Polly.Joanna">Thank you for calling Arrive Estate Media. ' +
        'No one is available to take your call right now. Please call back shortly. Goodbye.</Say>' +
        '<Hangup/>'
    );
  }

  const action = `${APP_BASE}/functions/twilio706Voice?stage=fallback`;

  return xml(
    `<Dial callerId="${CALLER_ID}" timeout="30" answerOnBridge="true" action="${action}">` +
      `<Number>${FORWARD_TO}</Number></Dial>`
  );
});