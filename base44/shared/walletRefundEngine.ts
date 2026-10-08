/**
 * Wallet Refund Adjustment Engine — adjusts wallet balances, CreditLots, and
 * creates REFUND_REVERSAL ledger entries when Arriv Pay confirms a customer
 * refund/chargeback.
 *
 * Boundary: Estate Media owns wallet/credit adjustments. Arriv Pay owns
 * payroll treatment (commission reversal is handled separately by
 * commissionReversalEngine.ts). This engine does NOT touch commissions,
 * payroll, or employee compensation.
 *
 * Refund logic:
 *   - Finds the original payment's CreditLot(s) via AutoFundPaymentEvent.
 *   - Calculates the proportional booking value to reverse:
 *       refund_ratio = refunded_cash / original_cash
 *       refund_bv_cents = round(original_bv_issued_cents × refund_ratio)
 *   - Caps the reversal at the lot's REMAINING (unredeemed) booking value.
 *   - Creates a REFUND_REVERSAL WalletTransaction (negative delta).
 *   - Reduces the CreditLot's booking_value_remaining_cents.
 *   - Reduces the wallet's booking_value_balance_cents.
 *
 * Redeemed credits policy:
 *   If credits were already redeemed (lot remaining < lot issued), only the
 *   unredeemed portion is reversed. The redeemed portion is reported as an
 *   UNRESOLVED DECISION — no financial adjustment rule is invented for
 *   already-consumed booking value. The caller receives a flag indicating
 *   this so it can be reported in certification output.
 *
 * Idempotency:
 *   One refund_event_id produces at most one REFUND_REVERSAL per lot.
 *   Duplicate refund webhooks do NOT duplicate the reversal.
 *
 * No second ledger:
 *   Uses the existing WalletTransaction entity with type REFUND_REVERSAL.
 *   Does NOT create a new entity or ledger.
 */

import { round2, generateId, toCents, fromCents, creditsFromCents } from './prepaidEngine.ts';

export interface WalletRefundInput {
  base44: any;
  refund_event_id: string;
  original_payment_event_id: string;
  refunded_cash: number;
  refund_type: 'full' | 'partial' | 'chargeback';
  reason: string;
  actor: string;
  cert_mode?: boolean;
}

export interface WalletRefundResult {
  status: 'processed' | 'duplicate' | 'no_lot' | 'fully_redeemed' | 'partial_redeemed' | 'error';
  refund_event_id: string;
  original_payment_event_id: string;
  refund_bv_cents_requested: number;
  refund_bv_cents_actual: number;
  redeemed_bv_cents_unresolved: number;
  wallet_transaction_id: string;
  lot_id: string;
  wallet_id: string;
  message: string;
  unresolved_decision?: string;
}

export async function processWalletRefundAdjustment(input: WalletRefundInput): Promise<WalletRefundResult> {
  const { base44, refund_event_id, original_payment_event_id, refunded_cash, refund_type, reason, actor } = input;
  const idPrefix = input.cert_mode ? 'cert_' : '';

  if (!refund_event_id) {
    return { status: 'error', refund_event_id: '', original_payment_event_id, refund_bv_cents_requested: 0, refund_bv_cents_actual: 0, redeemed_bv_cents_unresolved: 0, wallet_transaction_id: '', lot_id: '', wallet_id: '', message: 'refund_event_id is required' };
  }
  if (!original_payment_event_id) {
    return { status: 'error', refund_event_id, original_payment_event_id: '', refund_bv_cents_requested: 0, refund_bv_cents_actual: 0, redeemed_bv_cents_unresolved: 0, wallet_transaction_id: '', lot_id: '', wallet_id: '', message: 'original_payment_event_id is required' };
  }

  // ── Idempotency: check for existing REFUND_REVERSAL for this refund_event_id ──
  const refundTxnId = `refund_${refund_event_id}`;
  const existingTxnResp = await base44.entities.WalletTransaction.filter(
    { transaction_id: refundTxnId },
    undefined,
    1
  );
  const existingTxnArr = Array.isArray(existingTxnResp) ? existingTxnResp : (existingTxnResp?.data || []);
  if (existingTxnArr.length > 0) {
    const existing = existingTxnArr[0];
    return {
      status: 'duplicate',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: -existing.booking_value_cents || 0,
      refund_bv_cents_actual: -existing.booking_value_cents || 0,
      redeemed_bv_cents_unresolved: 0,
      wallet_transaction_id: existing.transaction_id,
      lot_id: existing.lot_id || '',
      wallet_id: existing.wallet_id || '',
      message: `Refund ${refund_event_id} already processed — duplicate reversal skipped`,
    };
  }

  // ── Find the original AutoFundPaymentEvent ──────────────────────────────
  const afResp = await base44.entities.AutoFundPaymentEvent.filter(
    { payment_event_id: original_payment_event_id },
    undefined,
    1
  );
  const afArr = Array.isArray(afResp) ? afResp : (afResp?.data || []);
  if (afArr.length === 0) {
    return {
      status: 'no_lot',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: 0,
      refund_bv_cents_actual: 0,
      redeemed_bv_cents_unresolved: 0,
      wallet_transaction_id: '',
      lot_id: '',
      wallet_id: '',
      message: `No original payment event found for ${original_payment_event_id}`,
    };
  }
  const originalEvent = afArr[0];

  // Only reverse if the original payment succeeded (issued funding)
  if (originalEvent.status !== 'succeeded' && originalEvent.status !== 'retry_succeeded') {
    return {
      status: 'no_lot',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: 0,
      refund_bv_cents_actual: 0,
      redeemed_bv_cents_unresolved: 0,
      wallet_transaction_id: '',
      lot_id: '',
      wallet_id: '',
      message: `Original payment ${original_payment_event_id} was not successful — no lot to reverse`,
    };
  }

  const lotId = originalEvent.lot_id;
  const walletId = originalEvent.wallet_id || '';
  const customerId = originalEvent.customer_id;
  const customerEmail = originalEvent.customer_email;
  const originalCash = originalEvent.amount_charged || 0;
  const originalBvCents = originalEvent.booking_value_issued_cents || 0;

  if (!lotId) {
    return {
      status: 'no_lot',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: 0,
      refund_bv_cents_actual: 0,
      redeemed_bv_cents_unresolved: 0,
      wallet_transaction_id: '',
      lot_id: '',
      wallet_id: walletId,
      message: `Original payment ${original_payment_event_id} has no lot_id — no lot to reverse`,
    };
  }

  // ── Find the CreditLot ──────────────────────────────────────────────────
  const lotResp = await base44.entities.CreditLot.filter(
    { lot_id: lotId },
    undefined,
    1
  );
  const lotArr = Array.isArray(lotResp) ? lotResp : (lotResp?.data || []);
  if (lotArr.length === 0) {
    return {
      status: 'no_lot',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: 0,
      refund_bv_cents_actual: 0,
      redeemed_bv_cents_unresolved: 0,
      wallet_transaction_id: '',
      lot_id: lotId,
      wallet_id: walletId,
      message: `CreditLot ${lotId} not found`,
    };
  }
  const lot = lotArr[0];

  const lotRemainingCents = lot.booking_value_remaining_cents ?? 0;
  const lotIssuedCents = lot.booking_value_issued_cents ?? 0;

  // ── Calculate proportional refund ───────────────────────────────────────
  // refund_ratio = refunded_cash / original_cash
  // refund_bv_cents = round(original_bv_issued_cents × refund_ratio)
  let refundBvCentsRequested = 0;
  if (originalCash > 0) {
    const refundRatio = refunded_cash / originalCash;
    refundBvCentsRequested = Math.round(originalBvCents * refundRatio);
  }

  // Cap at the lot's REMAINING (unredeemed) booking value
  const refundBvCentsActual = Math.min(refundBvCentsRequested, lotRemainingCents);
  const redeemedBvCentsUnresolved = refundBvCentsRequested - refundBvCentsActual;

  // ── Fully redeemed — nothing to reverse ─────────────────────────────────
  if (lotRemainingCents <= 0) {
    return {
      status: 'fully_redeemed',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: refundBvCentsRequested,
      refund_bv_cents_actual: 0,
      redeemed_bv_cents_unresolved: refundBvCentsRequested,
      wallet_transaction_id: '',
      lot_id: lotId,
      wallet_id: walletId,
      message: `CreditLot ${lotId} is fully redeemed — no unredeemed booking value to reverse`,
      unresolved_decision: `REDEEMED_CREDITS: ${refundBvCentsRequested} cents of booking value was already redeemed. No approved policy exists for reversing redeemed credits. Refund recorded but wallet not adjusted. Decision required: should the customer be billed for the redeemed portion, or should the loss be absorbed?`,
    };
  }

  // ── Partially redeemed — reverse only the unredeemed portion ───────────
  if (redeemedBvCentsUnresolved > 0) {
    // Reverse the remaining unredeemed portion, report the redeemed portion
    const nowIso = new Date().toISOString();
    const newLotRemaining = lotRemainingCents - refundBvCentsActual;

    // Create REFUND_REVERSAL WalletTransaction (negative delta)
    await base44.entities.WalletTransaction.create({
      transaction_id: refundTxnId,
      wallet_id: walletId,
      customer_id: customerId,
      customer_email: customerEmail,
      type: 'REFUND_REVERSAL',
      cash_amount: -round2(refunded_cash),
      credits: -creditsFromCents(refundBvCentsActual),
      booking_value: -fromCents(refundBvCentsActual),
      booking_value_cents: -refundBvCentsActual,
      stripe_transaction_id: refund_event_id,
      booking_id: '',
      lot_id: lotId,
      source: 'STRIPE',
      actor: actor || 'arriv_pay',
      description: `Refund reversal (${refund_type}) — ${refundBvCentsActual}¢ of ${refundBvCentsRequested}¢ reversed (${redeemedBvCentsUnresolved}¢ already redeemed — unresolved) — ${reason}`,
      prepaid_tier: lot.tier || '',
      created_at: nowIso,
    });

    // Reduce CreditLot remaining
    await base44.entities.CreditLot.update(lot.id, {
      booking_value_remaining_cents: newLotRemaining,
      booking_value_remaining: fromCents(newLotRemaining),
      credits_remaining: creditsFromCents(newLotRemaining),
    });

    // Reduce wallet balance
    const walletResp = await base44.entities.PrepaidWallet.filter(
      { customer_id: customerId },
      undefined,
      10
    );
    const walletArrResp = Array.isArray(walletResp) ? walletResp : (walletResp?.data || []);
    const walletRecord = walletArrResp.find(w => w.id === walletId);
    if (walletRecord) {
      const currentBalanceCents = walletRecord.booking_value_balance_cents ?? 0;
      const newBalanceCents = Math.max(0, currentBalanceCents - refundBvCentsActual);
      await base44.entities.PrepaidWallet.update(walletId, {
        booking_value_balance_cents: newBalanceCents,
        booking_value_balance: fromCents(newBalanceCents),
        credits_balance: creditsFromCents(newBalanceCents),
        updated_at: nowIso,
      });
    }

    return {
      status: 'partial_redeemed',
      refund_event_id,
      original_payment_event_id,
      refund_bv_cents_requested: refundBvCentsRequested,
      refund_bv_cents_actual: refundBvCentsActual,
      redeemed_bv_cents_unresolved: redeemedBvCentsUnresolved,
      wallet_transaction_id: refundTxnId,
      lot_id: lotId,
      wallet_id: walletId,
      message: `Partial reversal: ${refundBvCentsActual}¢ reversed (unredeemed), ${redeemedBvCentsUnresolved}¢ unresolved (already redeemed)`,
      unresolved_decision: `REDEEMED_CREDITS: ${redeemedBvCentsUnresolved} cents of booking value was already redeemed. No approved policy exists for reversing redeemed credits. Only the unredeemed portion was reversed. Decision required for the redeemed portion.`,
    };
  }

  // ── Full unredeemed — reverse the entire requested amount ───────────────
  const nowIso = new Date().toISOString();
  const newLotRemaining = lotRemainingCents - refundBvCentsActual;

  // Create REFUND_REVERSAL WalletTransaction (negative delta)
  await base44.entities.WalletTransaction.create({
    transaction_id: refundTxnId,
    wallet_id: walletId,
    customer_id: customerId,
    customer_email: customerEmail,
    type: 'REFUND_REVERSAL',
    cash_amount: -round2(refunded_cash),
    credits: -creditsFromCents(refundBvCentsActual),
    booking_value: -fromCents(refundBvCentsActual),
    booking_value_cents: -refundBvCentsActual,
    stripe_transaction_id: refund_event_id,
    booking_id: '',
    lot_id: lotId,
    source: 'STRIPE',
    actor: actor || 'arriv_pay',
    description: `Refund reversal (${refund_type}) — ${refundBvCentsActual}¢ reversed — ${reason}`,
    prepaid_tier: lot.tier || '',
    created_at: nowIso,
  });

  // Reduce CreditLot remaining
  await base44.entities.CreditLot.update(lot.id, {
    booking_value_remaining_cents: newLotRemaining,
    booking_value_remaining: fromCents(newLotRemaining),
    credits_remaining: creditsFromCents(newLotRemaining),
  });

  // Reduce wallet balance
  const walletResp2 = await base44.entities.PrepaidWallet.filter(
    { customer_id: customerId },
    undefined,
    10
  );
  const walletArr2 = Array.isArray(walletResp2) ? walletResp2 : (walletResp2?.data || []);
  const walletRecord2 = walletArr2.find(w => w.id === walletId);
  if (walletRecord2) {
    const currentBalanceCents2 = walletRecord2.booking_value_balance_cents ?? 0;
    const newBalanceCents2 = Math.max(0, currentBalanceCents2 - refundBvCentsActual);
    await base44.entities.PrepaidWallet.update(walletId, {
      booking_value_balance_cents: newBalanceCents2,
      booking_value_balance: fromCents(newBalanceCents2),
      credits_balance: creditsFromCents(newBalanceCents2),
      updated_at: nowIso,
    });
  }

  return {
    status: 'processed',
    refund_event_id,
    original_payment_event_id,
    refund_bv_cents_requested: refundBvCentsRequested,
    refund_bv_cents_actual: refundBvCentsActual,
    redeemed_bv_cents_unresolved: 0,
    wallet_transaction_id: refundTxnId,
    lot_id: lotId,
    wallet_id: walletId,
    message: `Refund reversal processed: ${refundBvCentsActual}¢ booking value reversed from lot ${lotId}`,
  };
}