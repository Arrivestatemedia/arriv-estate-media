import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { auditLog } from '../../shared/securityAudit.ts';

Deno.serve(async (req) => {
  try {
    const body = await req.text();

    // ── Twilio webhook signature verification ──
    const signatureValid = await validateTwilioRequest(req, body);
    if (!signatureValid) {
      try {
        const base44 = createClientFromRequest(req);
        await auditLog(base44, req, {
          event_type: 'webhook_verification_failure',
          actor_type: 'webhook',
          action: 'conferenceTwiml',
          result: 'denied',
          reason: 'invalid_twilio_signature',
        });
      } catch (_) {}
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { status: 403, headers: { 'Content-Type': 'application/xml' } }
      );
    }

    const url = new URL(req.url);
    const transferId = url.searchParams.get('transferId');
    const originalCaller = url.searchParams.get('originalCaller');
    const senderPhone = url.searchParams.get('senderPhone');

    if (!transferId || !originalCaller) {
      return new Response('Missing parameters', { status: 400 });
    }

    // TwiML that puts recipient in conference and bridges original caller
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="true" endConferenceOnExit="false">${transferId}</Conference>
  </Dial>
</Response>`;

    return new Response(twiml, {
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  } catch (error) {
    console.error('TwiML generation error:', error);
    return new Response('Error generating TwiML', { status: 500 });
  }
});