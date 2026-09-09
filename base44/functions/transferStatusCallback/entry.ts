import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { auditLog } from '../../shared/securityAudit.ts';

Deno.serve(async (req) => {
  try {
    const body = await req.text();

    // ── Twilio webhook signature verification ──
    const signatureValid = await validateTwilioRequest(req, body);
    if (!signatureValid) {
      const base44 = createClientFromRequest(req);
      await auditLog(base44, req, {
        event_type: 'webhook_verification_failure',
        actor_type: 'webhook',
        action: 'transferStatusCallback',
        result: 'denied',
        reason: 'invalid_twilio_signature',
      });
      return new Response('OK', { status: 200 });
    }

    const formData = new URLSearchParams(body);
    const status = formData.get('CallStatus');
    const transferId = formData.get('CallSid');

    console.log('Transfer status callback:', { status, transferId });

    // Log transfer status for debugging
    // Could store in database or send notifications here

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Status callback error:', error);
    return new Response('Error', { status: 500 });
  }
});