import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { verifyCanonicalRequest, isTimestampFresh } from '../../shared/payrollCrypto.ts';
import { PREPAID_FEATURE_FLAG_KEY } from '../../shared/prepaidEngine.ts';
import { evaluateCertificationBypass, isCertificationId } from '../../shared/certificationMode.ts';
import { processCommissionReversal } from '../../shared/commissionReversalEngine.ts';
import { processWalletRefundAdjustment } from '../../shared/walletRefundEngine.ts';
import {
  holdDisputedLots,
  buildDisputeEvidencePacket,
  generateDisputeCaseId,
} from '../../shared/disputeProtection.ts';

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

    // ── Chargeback: HOLD the disputed value. Refund: reverse it. ───────────
    // These are NOT the same event and must not share one treatment:
    //   - a REFUND is money returned: the unredeemed value it funded is reversed.
    //   - a CHARGEBACK is money CONTESTED: the outcome is unknown, so the
    //     disputed unspent value is HELD (suspended, unspendable) until the
    //     dispute is won (release) or lost (reverse).
    // Reversing on a chargeback would destroy the customer's value before the
    // outcome is known; holding and also reversing would double-count. So a
    // chargeback takes the hold path ONLY, and the refund path is untouched.
    const isChargeback = String(refund_type || '').toLowerCase() === 'chargeback';

    let walletRefundResult = null;
    let disputeHoldResult = null;
    let disputeCaseId = '';
    let alertResult: any = null;

    if (isChargeback) {
      const originalEvent = await getOriginalPaymentEvent(base44.asServiceRole, original_payment_event_id);
      const walletId = originalEvent?.wallet_id || '';

      if (walletId) {
        disputeHoldResult = await holdDisputedLots({
          base44: base44.asServiceRole,
          wallet_id: walletId,
          // The provider's dispute reference is the idempotency key: a redelivered
          // webhook must never hold the same funds twice.
          dispute_reference: refund_event_id,
          provider_charge_id: originalEvent?.stripe_charge_id || originalEvent?.stripe_invoice_id || '',
          amount_cents: Math.round(round2(refunded_commissionable_amount) * 100),
          actor: 'arriv_pay',
          cert_mode: certResult.isCertification,
        });
      } else {
        disputeHoldResult = {
          status: 'nothing_to_hold',
          dispute_reference: refund_event_id,
          held_cents: 0,
          lots: [],
          unexplained: 'The original payment event could not be resolved, so no charge could be traced and NO funds were suspended. No unrelated funds were touched.',
        };
      }

      // Evidence packet — assembled now, while the records are current.
      let evidence: any = null;
      try {
        const subscription = await getSubscriptionForCustomer(base44.asServiceRole, original_payment_event_id, customer_id, customer_email);
        const wallet = walletId ? await getWalletById(base44.asServiceRole, walletId) : null;
        evidence = await buildDisputeEvidencePacket({
          base44: base44.asServiceRole,
          subscription,
          wallet,
          dispute_reference: refund_event_id,
          provider_charge_id: originalEvent?.stripe_charge_id || '',
          disputed_amount_cents: Math.round(round2(refunded_commissionable_amount) * 100),
        });
      } catch (e) {
        console.error('Dispute evidence assembly error:', e.message);
      }

      // Automatic dispute alert. A dispute is time-critical, so the alert is sent
      // as part of handling the event rather than waiting for anyone to look.
      let alertStatus = 'skipped';
      let alertReason = 'No administrator alert address configured.';
      const alertRecipient = secrets.get("ADMIN_EMAIL") || '';
      if (alertRecipient) {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: alertRecipient,
            subject: `AUTO-FUND DISPUTE: $${round2(refunded_commissionable_amount).toFixed(2)} — ${refund_event_id}`,
            body: [
              'A chargeback has been raised against an Auto-Fund charge.',
              '',
              `Dispute reference: ${refund_event_id}`,
              `Customer: ${customer_email || evidence?.customer_email || 'unknown'}`,
              `Disputed amount: $${round2(refunded_commissionable_amount).toFixed(2)}`,
              `Unspent value held: $${((disputeHoldResult?.held_cents || 0) / 100).toFixed(2)}`,
              `Hold outcome: ${disputeHoldResult?.status}`,
              disputeHoldResult?.unexplained ? `Note: ${disputeHoldResult.unexplained}` : '',
              '',
              'EVIDENCE PACKET — sections present: ' + ((evidence?.present || []).join(', ') || 'none'),
              'Evidence gaps: ' + ((evidence?.gaps || []).join(', ') || 'none'),
              '',
              'Commission: a reversal event may be created automatically, but a reversal event is NOT recovered cash.',
              'Recovery is only confirmed when Arriv Pay states it was actually recovered from payroll.',
              '',
              'Action: review the dispute, decide contest-vs-accept, and record the outcome so the held value is either released or reversed.',
            ].filter(Boolean).join('\n'),
          });
          alertStatus = 'sent';
          alertReason = '';
        } catch (e) {
          alertStatus = 'failed';
          alertReason = e.message;
        }
      }

      // Durable case record, with the evidence and the alert outcome preserved.
      try {
        const disputeCase = await base44.asServiceRole.entities.AutoFundDisputeCase.create({
          dispute_case_id: generateDisputeCaseId(),
          dispute_reference: refund_event_id,
          provider_charge_id: originalEvent?.stripe_charge_id || '',
          subscription_id: originalEvent?.subscription_id || '',
          wallet_id: walletId,
          customer_id: customer_id || evidence?.customer_id || '',
          customer_email: customer_email || evidence?.customer_email || '',
          disputed_amount_cents: Math.round(round2(refunded_commissionable_amount) * 100),
          held_cents: disputeHoldResult?.held_cents || 0,
          held_lot_ids: (disputeHoldResult?.lots || []).map((l: any) => l.lot_id),
          phase: 'open_hold',
          held_at: new Date().toISOString(),
          alert_sent_at: alertStatus === 'sent' ? new Date().toISOString() : '',
          alert_recipient: alertRecipient,
          alert_delivery_status: alertStatus,
          alert_failure_reason: alertReason,
          evidence_packet: evidence?.packet || {},
          evidence_completeness: evidence?.present || [],
          evidence_gaps: evidence?.gaps || [],
          // A reversal event is created by the commission engine, but that is not
          // recovery. Recovery stays unconfirmed until Arriv Pay says so.
          commission_reversal_created: result?.reversals_created > 0,
          commission_recovery_confirmed: false,
          certification_mode: certResult.isCertification,
          created_at: new Date().toISOString(),
        });
        disputeCaseId = disputeCase?.id || '';
      } catch (e) {
        console.error('Dispute case record error:', e.message);
      }

      alertResult = { status: alertStatus, recipient: alertRecipient || null, failure_reason: alertReason || null };
    } else {
      // ── Process wallet/CreditLot refund adjustment ────────────────────────
      // Reverses the unredeemed booking value from the original payment's
      // CreditLot, creates a REFUND_REVERSAL WalletTransaction, and adjusts
      // the wallet balance. Redeemed credits are reported as an unresolved
      // decision (no approved policy for reversing consumed booking value).
      try {
        walletRefundResult = await processWalletRefundAdjustment({
          base44: base44.asServiceRole,
          refund_event_id,
          original_payment_event_id,
          refunded_cash: round2(refunded_commissionable_amount),
          refund_type: (refunded_commissionable_amount >= (await getOriginalCash(base44.asServiceRole, original_payment_event_id)) ? 'full' : 'partial'),
          reason: reason || refund_type || 'customer_refund',
          actor: 'arriv_pay',
          cert_mode: certResult.isCertification,
        });
      } catch (e) {
        console.error('Wallet refund adjustment error:', e.message);
        walletRefundResult = { status: 'error', message: e.message };
      }
    }

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
      wallet_refund: walletRefundResult,
      dispute: isChargeback
        ? {
            treatment: 'hold',
            case_id: disputeCaseId,
            hold: disputeHoldResult,
            alert: alertResult,
            // Stated explicitly so no reader can infer recovered cash from a
            // reversal event: recovery is confirmed only by Arriv Pay.
            commission_reversal_is_not_recovered_cash: true,
            commission_recovery_confirmed: false,
          }
        : null,
      refund_type: refund_type || 'customer_refund',
      certification_mode: certResult.isCertification,
      cert_id: certResult.certId,
    }, { status: httpStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

/** Resolve the original payment event so a disputed charge can be traced to its lot. */
async function getOriginalPaymentEvent(base44: any, paymentEventId: string) {
  try {
    const resp = await base44.entities.AutoFundPaymentEvent.filter(
      { payment_event_id: paymentEventId },
      undefined,
      1
    );
    const arr = Array.isArray(resp) ? resp : (resp?.data || []);
    return arr[0] || null;
  } catch {
    return null;
  }
}

/** Resolve the subscription for the disputed charge, for the evidence packet. */
async function getSubscriptionForCustomer(base44: any, paymentEventId: string, customerId: string, customerEmail: string) {
  try {
    const event = await getOriginalPaymentEvent(base44, paymentEventId);
    if (event?.subscription_id) {
      try {
        const sub = await base44.entities.AutoFundSubscription.get(event.subscription_id);
        if (sub) return sub;
      } catch {}
    }
    const key = event?.customer_id || customerId;
    if (key) {
      const resp = await base44.entities.AutoFundSubscription.filter({ customer_id: key }, '-created_date', 1);
      const arr = Array.isArray(resp) ? resp : (resp?.data || []);
      if (arr.length > 0) return arr[0];
    }
    if (customerEmail) {
      const resp = await base44.entities.AutoFundSubscription.filter({ customer_email: customerEmail }, '-created_date', 1);
      const arr = Array.isArray(resp) ? resp : (resp?.data || []);
      if (arr.length > 0) return arr[0];
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve a wallet by primary key, tolerating a missing record. */
async function getWalletById(base44: any, walletId: string) {
  try {
    const resp = await base44.entities.PrepaidWallet.filter({ id: walletId }, undefined, 1);
    const arr = Array.isArray(resp) ? resp : (resp?.data || []);
    return arr[0] || null;
  } catch {
    return null;
  }
}

async function getOriginalCash(base44: any, paymentEventId: string): Promise<number> {
  try {
    const resp = await base44.entities.AutoFundPaymentEvent.filter(
      { payment_event_id: paymentEventId },
      undefined,
      1
    );
    const arr = Array.isArray(resp) ? resp : (resp?.data || []);
    return arr.length > 0 ? (arr[0].amount_charged || 0) : 0;
  } catch {
    return 0;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}