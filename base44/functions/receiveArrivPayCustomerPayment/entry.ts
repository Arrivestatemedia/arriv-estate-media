import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
// autoFundProcessor: wallet lookup uses .filter(customer_id) + id match (not .get)
// v2: supports prepaid_purchase event_type with canonical tier bonus
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { PREPAID_FEATURE_FLAG_KEY, AUTO_FUND_AMOUNT_OPTIONS } from '../../shared/prepaidEngine.ts';
import { verifyCanonicalRequest, isTimestampFresh } from '../../shared/payrollCrypto.ts';
import { evaluateCertificationBypass } from '../../shared/certificationMode.ts';
import {
  processFailedAutoFundPayment,
  processSuccessfulAutoFundPayment,
  processFailedPrepaidPurchase,
} from '../../shared/individualPaymentRecoveryEngine.ts';

/**
 * Normalize amount_charged: Arriv Pay sends integer cents (e.g., 10000 = $100).
 * Existing callers may send dollars (e.g., 100 = $100).
 * Heuristic: if the value matches a known plan amount, treat as dollars.
 * If value/100 matches a known plan amount, treat as cents.
 * Otherwise, treat as dollars (backward compatible).
 */
function normalizeAmountCharged(raw: number): number {
  if (raw == null || typeof raw !== 'number') return 0;
  // Explicit cents field takes precedence
  // (Arriv Pay may send amount_charged_cents as an explicit integer)
  // This is handled by the caller before calling this function.
  const PLAN_AMOUNTS = AUTO_FUND_AMOUNT_OPTIONS; // [50, 100, 200, 350, 500, 1000]
  if (PLAN_AMOUNTS.includes(raw)) return raw; // dollars
  if (PLAN_AMOUNTS.includes(raw / 100)) return raw / 100; // cents → dollars
  return raw; // backward compatible: treat as dollars
}

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
    if (!customer_id) return Response.json({ error: 'customer_id is required' }, { status: 400 });
    if (!customer_email) return Response.json({ error: 'customer_email is required' }, { status: 400 });

    const validStatuses = ['succeeded', 'failed', 'retry_succeeded'];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: 'Invalid status. Must be: succeeded, failed, or retry_succeeded' }, { status: 400 });
    }

    // ── Normalize amount_charged (Arriv Pay sends integer cents) ──────────
    const normalizedAmount = body.amount_charged_cents != null
      ? body.amount_charged_cents / 100
      : normalizeAmountCharged(amount_charged);

    // ── B2B invoice payment classification ──────────────────────────────────
    // Not every Arriv Pay event is a B2B invoice payment. Explicit classification:
    //   1. body.b2b_invoice_id present → B2B invoice payment (reconcile directly)
    //   2. body.event_type === 'b2b_recurring' or 'b2b_implementation' → B2B payment
    //   3. Otherwise → individual Auto-Fund/Prepaid (existing flow)
    const b2bInvoiceId = body.b2b_invoice_id;
    const isB2BPayment = !!b2bInvoiceId || body.event_type === 'b2b_recurring' || body.event_type === 'b2b_implementation';

    if (isB2BPayment && status === 'succeeded') {
      let invoiceId = b2bInvoiceId;

      // If no direct invoice ID, try to find by stripe_invoice_id or customer_email
      if (!invoiceId) {
        const b2bInvoices = await base44.asServiceRole.entities.Invoice.filter({
          payment_status: 'unpaid',
          invoice_source: { $in: ['b2b_annual_contract', 'b2b_implementation', 'b2b_approved_overage'] },
        });
        const match = b2bInvoices.find(inv =>
          (stripe_invoice_id && inv.stripe_payment_intent_id === stripe_invoice_id) ||
          (customer_email && inv.client_email?.toLowerCase() === customer_email.toLowerCase())
        );
        invoiceId = match?.id;
      }

      if (invoiceId) {
        try {
          const reconcileResult = await base44.asServiceRole.functions.invoke('manageB2BDelinquency', {
            action: 'process_payment_received',
            invoice_id: invoiceId,
            payment_intent_id: stripe_charge_id || stripe_invoice_id,
            amount_paid: normalizedAmount,
            certification_mode: certResult.isCertification,
          });
          return Response.json({
            ...reconcileResult,
            b2b_payment: true,
            certification_mode: certResult.isCertification,
            cert_id: certResult.certId,
          });
        } catch (e) {
          return Response.json({ error: `B2B reconciliation failed: ${e.message}` }, { status: 500 });
        }
      }

      console.warn('B2B payment event without matching invoice:', payment_event_id);
    }

    // ── Process via shared processor (handles idempotency + credit issuance) ─
    const result = await processAutoFundPayment({
      base44: base44.asServiceRole,
      payment_event_id,
      subscription_id,
      customer_id,
      customer_email,
      wallet_id,
      amount_charged: normalizedAmount,
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

    // ── Recovery engine: process failure/success for recovery state ────────
    // Only for NEW events (not duplicates). The autoFundProcessor already
    // handles idempotency — duplicates return { status: 'duplicate' } and
    // we skip recovery processing to avoid double-counting failures.
    let recoveryResult = null;
    if (result.status === 'processed') {
      const effectiveEventType = event_type || 'recurring';
      const isRecurringOrRetry = effectiveEventType === 'recurring' || effectiveEventType === 'retry';

      if (status === 'failed') {
        if (isRecurringOrRetry) {
          // Auto-Fund recurring/retry failure → 3-strike rule applies
          try {
            recoveryResult = await processFailedAutoFundPayment(base44.asServiceRole, {
              payment_event_id,
              subscription_id,
              customer_id,
              customer_email,
              customer_name: '',
              wallet_id,
              amount_charged: normalizedAmount,
              failure_reason: failure_reason || 'Payment declined',
              event_type: effectiveEventType,
              cert_mode: certResult.isCertification,
            });
          } catch (e) {
            console.error('Recovery engine error (failed):', e.message);
          }
        } else {
          // One-time Prepaid/topup failure → no 3-strike rule
          try {
            recoveryResult = await processFailedPrepaidPurchase(base44.asServiceRole, {
              payment_event_id,
              customer_id,
              customer_email,
              customer_name: '',
              amount: normalizedAmount,
              failure_reason: failure_reason || 'Payment declined',
              cert_mode: certResult.isCertification,
            });
          } catch (e) {
            console.error('Recovery engine error (prepaid failed):', e.message);
          }
        }
      } else if (status === 'succeeded' || status === 'retry_succeeded') {
        // Successful payment → reset failure counter, clear recovery hold
        try {
          recoveryResult = await processSuccessfulAutoFundPayment(base44.asServiceRole, {
            payment_event_id,
            subscription_id,
            customer_id,
            customer_email,
            customer_name: '',
            amount_charged: normalizedAmount,
            booking_value_added: result.booking_value_issued || 0,
            cert_mode: certResult.isCertification,
          });
        } catch (e) {
          console.error('Recovery engine error (success):', e.message);
        }
      }
    }

    // ── HTTP error semantics ─────────────────────────────────────────────
    // Arriv Pay must distinguish:
    //   200 = accepted (processed or duplicate/idempotent)
    //   404 = wallet not found (rejected — fixture missing)
    //   403 = ownership mismatch (rejected — security)
    //   500 = processing failure (transient — safe to retry)
    let httpStatus = 200;
    if (result.status === 'error') {
      if (result.error?.includes('not found')) {
        httpStatus = 404;
      } else if (result.error?.includes('mismatch') || result.error?.includes('ownership')) {
        httpStatus = 403;
      } else {
        httpStatus = 500;
      }
    }

    return Response.json({
      ...result,
      _debug_event_type: event_type,
      _debug_body_event_type: body.event_type,
      _debug_body_keys: Object.keys(body),
      _webhook_version: 'v2_prepaid_20261009',
      recovery: recoveryResult,
      certification_mode: certResult.isCertification,
      cert_id: certResult.certId,
    }, { status: httpStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}