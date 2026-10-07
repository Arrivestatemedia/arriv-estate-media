/**
 * Commission Reversal Engine — canonical refund → commission reversal logic.
 *
 * Business rule: Refunded customer revenue is not commissionable revenue.
 * If customer revenue that generated Sales Growth Advisor commission is
 * refunded, the commission attributable to the refunded amount must be
 * reversed.
 *
 * Reversal is calculated from the ORIGINAL compensation event, never from
 * a current commission rate. Traces to commissionable CUSTOMER CASH, not
 * promotional Booking Value.
 *
 *   reversal_ratio = refunded_commissionable_amount / original_commissionable_amount
 *   commission_reversal = original_commission_amount × reversal_ratio
 *
 * Cumulative reversals are capped so they can never exceed the original
 * commission attributable to that payment.
 *
 * Original commission events are NEVER deleted — new immutable
 * COMMISSION_REVERSAL events are created instead, preserving full audit
 * history.
 *
 * Estate Media creates the reversal and delivers it to Arriv Pay.
 * Estate Media does NOT debit employees, edit paychecks, deduct wages,
 * modify tax records, or alter completed payroll. Arriv Pay owns payroll
 * treatment (negative commission balance, future offsets, wage-law
 * safeguards).
 */

import { round2, generateId } from './prepaidEngine.ts';

export interface ReversalInput {
  base44: any;
  /** Globally unique refund event ID from Arriv Pay. */
  refund_event_id: string;
  /** The original payment event ID (Arriv Pay payment_event_id or Estate Media transaction_id). */
  original_payment_event_id: string;
  /** The commissionable customer CASH being refunded (NOT Booking Value). */
  refunded_commissionable_amount: number;
  /** Human-readable reason for the refund. */
  reason: string;
  /** Who/what initiated the reversal (system, admin email, etc.). */
  actor: string;
  /** When true, all generated reversal IDs are cert_-prefixed for certification isolation. */
  cert_mode?: boolean;
}

export interface ReversalEntryResult {
  source_event_id: string;
  reverses: string;
  reversal_amount: number;
  original_commission: number;
  original_commissionable_cash: number;
  cumulative_reversed: number;
  remaining_commission: number;
  status: 'created' | 'duplicate' | 'capped' | 'skipped';
}

export interface ReversalResult {
  status: 'processed' | 'duplicate' | 'no_commission' | 'error';
  reversals_created: number;
  total_reversal_amount: number;
  results: ReversalEntryResult[];
  message: string;
}

/**
 * Process a confirmed customer refund: identify original commission events
 * linked to the refunded payment, calculate proportional reversals, cap
 * cumulative reversals at the original commission, and create immutable
 * COMMISSION_REVERSAL records.
 *
 * Idempotency: one refund_event_id produces at most one reversal per
 * original compensation event. Duplicate refund webhooks do NOT duplicate
 * the reversal.
 */
export async function processCommissionReversal(input: ReversalInput): Promise<ReversalResult> {
  const { base44, refund_event_id, original_payment_event_id, refunded_commissionable_amount, reason, actor } = input;
  const idPrefix = input.cert_mode ? 'cert_' : '';

  if (!refund_event_id) {
    return { status: 'error', reversals_created: 0, total_reversal_amount: 0, results: [], message: 'refund_event_id is required' };
  }
  if (!original_payment_event_id) {
    return { status: 'error', reversals_created: 0, total_reversal_amount: 0, results: [], message: 'original_payment_event_id is required' };
  }
  if (!refunded_commissionable_amount || refunded_commissionable_amount <= 0) {
    return { status: 'error', reversals_created: 0, total_reversal_amount: 0, results: [], message: 'refunded_commissionable_amount must be positive' };
  }

  // ── Identify original commission events linked to this payment ──────────
  // Strategy:
  //   1. Try AutoFundPaymentEvent lookup (Auto-Fund payments)
  //   2. Try WalletTransaction lookup (Prepaid purchase/reload)
  let originalCommissionEvents: any[] = [];
  let originalCommissionableCash = 0;

  // Auto-Fund lookup
  const afResp = await base44.entities.AutoFundPaymentEvent.filter(
    { payment_event_id: original_payment_event_id },
    undefined,
    1
  );
  const afArr = Array.isArray(afResp) ? afResp : (afResp?.data || []);
  if (afArr.length > 0) {
    const af = afArr[0];
    originalCommissionableCash = af.amount_charged;
    if (af.commission_event_id) {
      const ceResp = await base44.entities.PrepaidCompensationEvent.filter(
        { source_event_id: af.commission_event_id },
        undefined,
        1
      );
      const ceArr = Array.isArray(ceResp) ? ceResp : (ceResp?.data || []);
      originalCommissionEvents = ceArr;
    }
  }

  // WalletTransaction lookup (Prepaid purchase/reload)
  if (originalCommissionEvents.length === 0) {
    const wtResp = await base44.entities.WalletTransaction.filter(
      { transaction_id: original_payment_event_id },
      undefined,
      1
    );
    const wtArr = Array.isArray(wtResp) ? wtResp : (wtResp?.data || []);
    if (wtArr.length > 0) {
      const wt = wtArr[0];
      originalCommissionableCash = wt.cash_amount;
      const ceResp = await base44.entities.PrepaidCompensationEvent.filter(
        { transaction_id: original_payment_event_id, source_type: { $ne: 'COMMISSION_REVERSAL' }, status: 'APPROVED' },
        undefined,
        50
      );
      originalCommissionEvents = Array.isArray(ceResp) ? ceResp : (ceResp?.data || []);
    }
  }

  if (originalCommissionEvents.length === 0) {
    return {
      status: 'no_commission',
      reversals_created: 0,
      total_reversal_amount: 0,
      results: [],
      message: `No original commission events found for payment ${original_payment_event_id}. No reversal needed.`,
    };
  }

  const nowIso = new Date().toISOString();
  const results: ReversalEntryResult[] = [];
  let totalReversalAmount = 0;

  for (const origEvent of originalCommissionEvents) {
    const originalCommission = round2(origEvent.commission_amount || 0);
    // Trace to commissionable CUSTOMER CASH, not Booking Value
    const originalCash = round2(origEvent.gross_customer_cash || originalCommissionableCash || 0);

    if (originalCash <= 0 || originalCommission <= 0) {
      results.push({
        source_event_id: '',
        reverses: origEvent.source_event_id,
        reversal_amount: 0,
        original_commission: originalCommission,
        original_commissionable_cash: originalCash,
        cumulative_reversed: 0,
        remaining_commission: originalCommission,
        status: 'skipped',
      });
      continue;
    }

    // ── Idempotency: check for existing reversal for this (refund, original) pair ──
    const reversalIdempotencyKey = `rev_${refund_event_id}_${origEvent.source_event_id}`;
    const existingRevResp = await base44.entities.PrepaidCompensationEvent.filter(
      { idempotency_key: reversalIdempotencyKey, source_type: 'COMMISSION_REVERSAL' },
      undefined,
      1
    );
    const existingRevArr = Array.isArray(existingRevResp) ? existingRevResp : (existingRevResp?.data || []);
    if (existingRevArr.length > 0) {
      const existing = existingRevArr[0];
      results.push({
        source_event_id: existing.source_event_id,
        reverses: origEvent.source_event_id,
        reversal_amount: round2(existing.reversal_amount || 0),
        original_commission: originalCommission,
        original_commissionable_cash: originalCash,
        cumulative_reversed: round2(existing.reversal_amount || 0),
        remaining_commission: round2(originalCommission - (existing.reversal_amount || 0)),
        status: 'duplicate',
      });
      continue;
    }

    // ── Cumulative cap: existing reversals for this original event ──────────
    const priorReversalsResp = await base44.entities.PrepaidCompensationEvent.filter(
      { reverses_source_event_id: origEvent.source_event_id, source_type: 'COMMISSION_REVERSAL', status: 'APPROVED' },
      undefined,
      100
    );
    const priorReversals = Array.isArray(priorReversalsResp) ? priorReversalsResp : (priorReversalsResp?.data || []);
    const cumulativeReversed = round2(priorReversals.reduce((sum, e) => sum + (e.reversal_amount || 0), 0));
    const remainingReversible = round2(originalCommission - cumulativeReversed);

    if (remainingReversible <= 0) {
      results.push({
        source_event_id: '',
        reverses: origEvent.source_event_id,
        reversal_amount: 0,
        original_commission: originalCommission,
        original_commissionable_cash: originalCash,
        cumulative_reversed: cumulativeReversed,
        remaining_commission: 0,
        status: 'capped',
      });
      continue;
    }

    // ── Proportional reversal (from original event, not current rate) ──────
    const reversalRatio = round2(refunded_commissionable_amount / originalCash);
    let reversalAmount = round2(originalCommission * reversalRatio);

    // Cap at remaining reversible
    if (reversalAmount > remainingReversible) {
      reversalAmount = remainingReversible;
    }
    if (reversalAmount <= 0) {
      results.push({
        source_event_id: '',
        reverses: origEvent.source_event_id,
        reversal_amount: 0,
        original_commission: originalCommission,
        original_commissionable_cash: originalCash,
        cumulative_reversed: cumulativeReversed,
        remaining_commission: remainingReversible,
        status: 'skipped',
      });
      continue;
    }

    // ── Create immutable COMMISSION_REVERSAL event ─────────────────────────
    const reversalSourceEventId = idPrefix + generateId('empe');
    await base44.entities.PrepaidCompensationEvent.create({
      source_event_id: reversalSourceEventId,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'COMMISSION_REVERSAL',
      employee_id: origEvent.employee_id,
      employee_email: origEvent.employee_email || '',
      customer_id: origEvent.customer_id || '',
      transaction_id: origEvent.transaction_id || '',
      gross_customer_cash: round2(refunded_commissionable_amount),
      commission_amount: -round2(reversalAmount),
      currency: origEvent.currency || 'USD',
      earned_at: nowIso,
      status: 'APPROVED',
      reverses_source_event_id: origEvent.source_event_id,
      reversal_amount: round2(reversalAmount),
      reason: `refund:${refund_event_id}${reason ? ` — ${reason}` : ''}`,
      effective_at: nowIso,
      prepaid_tier: origEvent.prepaid_tier || '',
      delivered_to_payroll: false,
      delivery_attempts: 0,
      idempotency_key: reversalIdempotencyKey,
    });

    totalReversalAmount = round2(totalReversalAmount + reversalAmount);
    results.push({
      source_event_id: reversalSourceEventId,
      reverses: origEvent.source_event_id,
      reversal_amount: round2(reversalAmount),
      original_commission: originalCommission,
      original_commissionable_cash: originalCash,
      cumulative_reversed: round2(cumulativeReversed + reversalAmount),
      remaining_commission: round2(originalCommission - cumulativeReversed - reversalAmount),
      status: 'created',
    });
  }

  const createdCount = results.filter(r => r.status === 'created').length;
  if (createdCount === 0 && results.every(r => r.status === 'duplicate')) {
    return {
      status: 'duplicate',
      reversals_created: 0,
      total_reversal_amount: totalReversalAmount,
      results,
      message: `Refund ${refund_event_id} already processed. All reversals are duplicates.`,
    };
  }

  return {
    status: 'processed',
    reversals_created: createdCount,
    total_reversal_amount: totalReversalAmount,
    results,
    message: `Processed ${createdCount} commission reversal(s) totaling $${totalReversalAmount} for refund ${refund_event_id}.`,
  };
}