import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { verifyCanonicalRequest, isTimestampFresh } from '../../shared/payrollCrypto.ts';
import { PREPAID_FEATURE_FLAG_KEY } from '../../shared/prepaidEngine.ts';
import { evaluateCertificationBypass, isCertificationId } from '../../shared/certificationMode.ts';
import { processCommissionReversal } from '../../shared/commissionReversalEngine.ts';

/**
 * Arriv Pay Refund Event Webhook
 *
 * Receives authenticated customer refund/chargeback events from Arriv Pay
 * and determines whether commission attributable to the refunded revenue
 * must be reversed.
 *
 * Estate Media owns the reversal determination:
 *   - identifies original commissionable payment
 *   - identifies compensation event(s) attributable to that payment
 *   - calculates proportional/full reversal (from ORIGINAL event, not current rate)
 *   - traces to commissionable CUSTOMER CASH, not promotional Booking Value
 *   - creates immutable COMMISSION_REVERSAL event(s)
 *   - caps cumulative reversals at original commission
 *   - never deletes original commission events
 *
 * Arriv Pay owns payroll treatment. Estate Media does NOT debit employees,
 * edit paychecks, or alter completed payroll.
 *
 * Security: canonical HMAC (ARRIV_PAYROLL_HANDOFF_SECRET).
 *   - timestamp freshness (±5 min)
 *   - source validation (must be arriv_pay)
 *   - replay/idempotency via refund_event_id + original source_event_id pair
 *
 * Certification mode: cert_-prefixed synthetic events bypass the
 * prepaid_enabled feature flag ONLY when valid canonical HMAC is present.
 * Bearer fallback NEVER qualifies for certification bypass.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // ── HMAC Validation (canonical_estate_media contract) ────────────────────
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
    let hmacValid = false;

    // Canonical HMAC verification
    if (signature && timestamp) {
      hmacValid = await verifyCanonicalRequest(handoffSecret, {
        body: bodyText,
        timestamp,
        requestId,
        sourceAppId: sourceApp,
        signature,
      });
      if (!hmacValid) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
      // Validate source application
      if (sourceApp && sourceApp !== 'arriv_pay' && sourceApp !== 'ARRIV_PAY') {
        return Response.json({ error: 'Invalid source application' }, { status: 401 });
      }
      authMethod = 'hmac';
    } else {
      // Bearer fallback (initial integration testing only — NEVER qualifies for cert bypass)
      const authHeader = req.headers.get('authorization') || '';
      const provided = authHeader.replace(/^Bearer\s+/i, '');
      if (provided !== handoffSecret) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      authMethod = 'bearer';
    }

    // ── Parse refund event ──────────────────────────────────────────────────
    const {
      refund_event_id,
      original_payment_event_id,
      refunded_commissionable_amount,
      refund_type,
      reason,
      customer_id,
      customer_email,
    } = body;

    if (!refund_event_id) return Response.json({ error: 'refund_event_id is required' }, { status: 400 });
    if (!original_payment_event_id) return Response.json({ error: 'original_payment_event_id is required' }, { status: 400 });
    if (!refunded_commissionable_amount || refunded_commissionable_amount <= 0) {
      return Response.json({ error: 'refunded_commissionable_amount must be positive' }, { status: 400 });
    }

    // ── Certification bypass evaluation ─────────────────────────────────────
    const certResult = evaluateCertificationBypass({
      authMethod,
      sourceApp,
      timestamp,
      requestId,
      // Arriv Pay sends `certification: true` in the body as its intent marker.
      certificationFlag: body.certification === true,
      // Only refund_event_id and original_payment_event_id are synthetic
      // identifiers Arriv Pay controls. customer_id is a UUID foreign key,
      // customer_email is a real-world value — neither can be cert_-prefixed.
      identifiers: [refund_event_id, original_payment_event_id],
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

    // ── Process commission reversal ────────────────────────────────────────
    const result = await processCommissionReversal({
      base44: base44.asServiceRole,
      refund_event_id,
      original_payment_event_id,
      refunded_commissionable_amount: round2(refunded_commissionable_amount),
      reason: reason || refund_type || 'customer_refund',
      actor: 'arriv_pay',
      cert_mode: certResult.isCertification,
    });

    // ── HTTP error semantics ─────────────────────────────────────────────
    // 200 = processed or duplicate (idempotent acknowledgement)
    // 400 = invalid request (missing fields, non-positive amount)
    // 500 = processing failure (transient)
    let httpStatus = 200;
    if (result.status === 'error') {
      httpStatus = 500;
    }

    return Response.json({
      ...result,
      refund_type: refund_type || 'customer_refund',
      certification_mode: certResult.isCertification,
      cert_id: certResult.certId,
    }, { status: httpStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}