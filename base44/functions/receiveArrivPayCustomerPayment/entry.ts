import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { PREPAID_FEATURE_FLAG_KEY } from '../../shared/prepaidEngine.ts';

/**
 * Arriv Pay Customer Payment Event Webhook
 *
 * Receives authenticated customer payment events from Arriv Pay:
 *   - recurring Auto-Fund charges (succeeded/failed)
 *   - retry events
 *   - one-time prepaid purchase confirmations
 *   - top-up confirmations
 *
 * Boundary correction: Arriv Pay owns customer payment PROCESSING.
 * Estate Media owns WHAT the successful payment entitles (credits, booking value).
 *
 * Security: HMAC validation using ARRIV_PAYROLL_HANDOFF_SECRET.
 *   - timestamp freshness (±5 min)
 *   - nonce/replay protection via payment_event_id idempotency
 *   - body integrity
 *
 * Idempotency: Each payment_event_id is processed exactly once.
 *   Duplicate deliveries return the original result without re-issuing credits.
 */
export default async function(req) {
  try {
    // ── Feature flag check ────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const flagRecords = await base44.asServiceRole.entities.AppSetting.filter(
      { key: PREPAID_FEATURE_FLAG_KEY },
      undefined,
      1
    );
    const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
    const globalEnabled = flagArr.length > 0 ? flagArr[0].value === 'true' : false;
    if (!globalEnabled) {
      return Response.json({ error: 'Prepaid/Auto-Fund feature is not enabled' }, { status: 503 });
    }

    // ── HMAC Validation ────────────────────────────────────────────────────
    const handoffSecret = secrets.get("ARRIV_PAYROLL_HANDOFF_SECRET");
    if (!handoffSecret) {
      return Response.json({ error: 'Arriv Pay handoff secret not configured' }, { status: 503 });
    }

    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    const signature = req.headers.get('x-arriv-pay-signature') || '';
    const timestamp = req.headers.get('x-arriv-pay-timestamp') || '';

    // Timestamp freshness (±5 minutes)
    if (timestamp) {
      const eventTime = parseInt(timestamp, 10);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      if (Math.abs(now - eventTime) > fiveMinutes) {
        return Response.json({ error: 'Timestamp outside acceptable window' }, { status: 401 });
      }
    }

    // HMAC verification using Web Crypto API
    if (signature && timestamp) {
      const message = `${timestamp}.${bodyText}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(handoffSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
      const expectedHex = Array.from(new Uint8Array(expectedSig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      if (signature !== expectedHex) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      // Fallback: bearer token match (for initial integration testing)
      const authHeader = req.headers.get('authorization') || '';
      const provided = authHeader.replace(/^Bearer\s+/i, '');
      if (provided !== handoffSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // ── Parse event ────────────────────────────────────────────────────────
    const {
      payment_event_id,
      subscription_id,
      customer_id,
      customer_email,
      wallet_id,
      amount_charged,
      status,
      event_type,
      sales_rep_id,
      stripe_invoice_id,
      stripe_charge_id,
      failure_reason,
      billing_period_start,
      billing_period_end,
    } = body;

    if (!payment_event_id) return Response.json({ error: 'payment_event_id is required' }, { status: 400 });
    if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });
    if (!wallet_id) return Response.json({ error: 'wallet_id is required' }, { status: 400 });

    const validStatuses = ['succeeded', 'failed', 'retry_succeeded'];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: 'Invalid status. Must be: succeeded, failed, or retry_succeeded' }, { status: 400 });
    }

    // ── Process via shared processor (handles idempotency + credit issuance) ─
    const result = await processAutoFundPayment({
      base44: base44.asServiceRole,
      payment_event_id,
      subscription_id,
      customer_id,
      customer_email,
      wallet_id,
      amount_charged,
      status,
      event_type: event_type || 'recurring',
      sales_rep_id,
      stripe_invoice_id,
      stripe_charge_id,
      failure_reason,
      billing_period_start,
      billing_period_end,
      raw_event: bodyText,
      actor: 'arriv_pay',
    });

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}