import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
// autoFundProcessor: wallet lookup uses .filter(customer_id) + id match (not .get)
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { PREPAID_FEATURE_FLAG_KEY } from '../../shared/prepaidEngine.ts';
import { verifyCanonicalRequest, isTimestampFresh } from '../../shared/payrollCrypto.ts';
import { evaluateCertificationBypass } from '../../shared/certificationMode.ts';

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
    const base44 = createClientFromRequest(req);

    // ── HMAC Validation (canonical_estate_media contract) ────────────────────
    // Auth runs BEFORE the feature flag so certification mode can bypass it.
    // Canonical signing input: body\ntimestamp\nrequest_id\nsource_app
    // Headers: x-arriv-pay-signature, x-arriv-pay-timestamp,
    //          x-arriv-pay-request-id, x-arriv-pay-source-app
    const handoffSecret = secrets.get("ARRIV_PAYROLL_HANDOFF_SECRET");
    if (!handoffSecret) {
      return Response.json({ error: 'Arriv Pay handoff secret not configured' }, { status: 503 });
    }

    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    const signature = req.headers.get('x-arriv-pay-signature') || '';
    const timestamp = req.headers.get('x-arriv-pay-timestamp') || '';
    const requestId = req.headers.get('x-arriv-pay-request-id') || '';
    const sourceApp = req.headers.get('x-arriv-pay-source-app') || '';

    // Timestamp freshness (±5 minutes)
    if (timestamp && !isTimestampFresh(timestamp)) {
      return Response.json({ error: 'Timestamp outside acceptable window' }, { status: 401 });
    }

    let authMethod: 'hmac' | 'bearer' | 'none' = 'none';

    // Canonical HMAC verification (body\ntimestamp\nrequest_id\nsource_app)
    if (signature && timestamp) {
      const isValid = await verifyCanonicalRequest(handoffSecret, {
        body: bodyText,
        timestamp,
        requestId,
        sourceAppId: sourceApp,
        signature,
      });
      if (!isValid) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
      // Validate source application
      if (sourceApp && sourceApp !== 'arriv_pay' && sourceApp !== 'ARRIV_PAY') {
        return Response.json({ error: 'Invalid source application' }, { status: 401 });
      }
      authMethod = 'hmac';
    } else {
      // Fallback: bearer token match (for initial integration testing only)
      // Bearer fallback NEVER qualifies for certification bypass.
      const authHeader = req.headers.get('authorization') || '';
      const provided = authHeader.replace(/^Bearer\s+/i, '');
      if (provided !== handoffSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      authMethod = 'bearer';
    }

    // ── Parse event (needed for cert_ identifier check) ─────────────────────
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

    // ── Certification bypass evaluation ─────────────────────────────────────
    // Bypasses prepaid_enabled ONLY when ALL safeguards are met:
    //   valid HMAC (not bearer), trusted source, fresh timestamp, valid
    //   request ID, cert_ prefixed synthetic identifiers.
    const certResult = evaluateCertificationBypass({
      authMethod,
      sourceApp,
      timestamp,
      requestId,
      // Arriv Pay sends `certification: true` in the body as its intent marker.
      // This is accepted ONLY alongside valid HMAC + trusted source + fresh
      // timestamp + cert_-prefixed payment_event_id. It NEVER authorizes alone.
      certificationFlag: body.certification === true,
      // Only payment_event_id is a synthetic identifier Arriv Pay controls and
      // can cert_-prefix. subscription_id is a Stripe foreign key (sub_xxx),
      // customer_email is a real-world value — neither can be cert_-prefixed.
      // Wallet-level synthetic fixture isolation is enforced separately by
      // the payment processor (autoFundProcessor.ts lines 126-175).
      identifiers: [payment_event_id],
    });

    // ── Feature flag check (bypassed ONLY for qualifying cert_ events) ──────
    if (!certResult.isCertification) {
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
    }

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
      cert_mode: certResult.isCertification,
    });

    return Response.json({
      ...result,
      certification_mode: certResult.isCertification,
      cert_id: certResult.certId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}