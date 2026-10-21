import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { validateTwilioRequest } from '../../shared/twilioWebhookValidation.ts';
import { applyDeliveryStatus } from '../../shared/smsTracking.ts';

/**
 * Twilio outbound message status callback.
 *
 * Registered per message by the send path (`StatusCallback`), so no Messaging
 * Service and no change to any assigned phone number is involved.
 *
 * Contract:
 *   - The Twilio request signature is validated; unsigned requests are rejected.
 *   - Updates are idempotent: a repeated callback changes nothing.
 *   - Updates are ordered: a delayed callback never downgrades a newer status,
 *     and a confirmed delivery is final.
 *   - A callback for a message we did not store (for example a relay text that has
 *     no thread record) is logged and acknowledged, never treated as an error.
 */
Deno.serve(async (req) => {
  try {
    const body = await req.text();

    const signatureValid = await validateTwilioRequest(req, body, 'twilioMessageStatusCallback');
    if (!signatureValid) {
      console.error('STATUS CALLBACK: invalid Twilio signature');
      return new Response('', { status: 403 });
    }

    const params = new URLSearchParams(body);
    const sid = params.get('MessageSid') || params.get('SmsSid') || '';
    const status = (params.get('MessageStatus') || params.get('SmsStatus') || '').toLowerCase();
    const errorCode = params.get('ErrorCode') || '';
    const segments = Number(params.get('NumSegments') || '');

    if (!sid || !status) {
      return new Response('', { status: 204 });
    }

    const base44 = createClientFromRequest(req);
    const result = await applyDeliveryStatus(base44, { sid, status, errorCode, segments });

    if (result.reason === 'unknown_message') {
      console.log('STATUS CALLBACK: no stored message for sid', sid, status);
    }

    return new Response('', { status: 204 });
  } catch (error) {
    // Twilio retries a callback that is not acknowledged. We always acknowledge so a
    // retry storm cannot flood the endpoint, and the failure is logged server-side.
    console.error('Status callback error:', error.message);
    return new Response('', { status: 204 });
  }
});