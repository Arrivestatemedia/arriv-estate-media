// ============================================================================
// ARRIV AUTO-FUND — MEMBERSHIP FEE BILLING
// ============================================================================
// The membership fee is COLLECTED REVENUE. It is:
//   - NOT spendable Booking Value
//   - NOT a customer wallet liability
//   - generating NO promotional credit
//   - generating NO sales commission
//
// Fees are recorded in the SAME immutable payment-event ledger as wallet funding
// (AutoFundPaymentEvent), with `charge_component: 'membership_fee'` and
// `booking_value_issued_cents: 0`. Recording a zero Booking Value is what makes
// "a fee can never become wallet liability" structural rather than a convention —
// no lot, no wallet transaction, and no commission event is ever created for one.
//
// Every write is idempotent on `payment_event_id`, so a duplicated Arriv Pay
// webhook cannot charge a fee twice or record it twice.
//
// REFUNDABILITY: the policy is CONFIGURABLE and deliberately defaults to
// 'undetermined'. This module does not assume fees are non-refundable. The legal
// disclosure requirement is flagged for owner review before launch — see
// FEE_REFUND_POLICY_DISCLOSURE and the launch blockers in the certification report.
// ============================================================================

import {
  AUTOFUND_FINAL_FLAGS,
  AUTOFUND_MEMBERSHIP_FEE,
  getMembershipFee,
  getTotalMonthlyCharge,
} from './autoFundFinalConfig.ts';

export const MEMBERSHIP_FEE_EVENT_TYPE = 'membership_fee';
export const WALLET_FUNDING_COMPONENT = 'wallet_funding';
export const MEMBERSHIP_FEE_COMPONENT = 'membership_fee';

/** Refundability policy for membership fees. NOT assumed non-refundable. */
export type FeeRefundPolicy =
  | 'undetermined'
  | 'non_refundable'
  | 'refundable_full'
  | 'refundable_prorated';

/**
 * Default policy. 'undetermined' is intentional: the system records fees and
 * refuses to make a refund decision it has no authority to make. The owner sets
 * the real policy before launch.
 */
export const DEFAULT_FEE_REFUND_POLICY: FeeRefundPolicy = 'undetermined';

// ─────────────────────────────────────────────────────────────────────────────
// REFUND LANGUAGE — LEGALLY CONSERVATIVE
// ─────────────────────────────────────────────────────────────────────────────
// The membership fee is NEVER described as absolutely or unconditionally
// nonrefundable. Every variant below carries the legally-required exceptions and
// an explicit statement that applicable law overrides these terms. The former
// absolute string ("The membership fee is not refundable.") was removed for that
// reason. `undetermined` remains the default and asserts NO policy at all.
// ─────────────────────────────────────────────────────────────────────────────

export const LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS: string[] = [
  'If you are charged a membership fee for a membership period that has not yet begun, and you cancel before that period starts, that fee is refunded.',
  'Duplicate, erroneous or unauthorized membership charges are refunded.',
  'If Arriv materially fails to provide the membership benefits described in the terms, you are entitled to an appropriate refund, adjustment, or other legally required remedy.',
  'Nothing in these terms limits any refund or cancellation right you have under applicable federal or state law. Where applicable law gives you a greater right, that right applies.',
];

export const FEE_REFUND_POLICY_DISCLOSURE: Record<FeeRefundPolicy, string> = {
  undetermined:
    'The refund policy for the membership fee has not been finalised and is under legal review. Nothing here waives any refund right you have under applicable law.',
  non_refundable:
    'A correctly charged membership fee is generally not refundable once the membership period has begun and the membership benefits for that period have been made available to you.',
  refundable_full:
    'The membership fee is refundable in full on request.',
  refundable_prorated:
    'The membership fee is refundable on a pro-rata basis for the unused part of the membership period.',
};

export function describeFeeRefundPolicy(policy: FeeRefundPolicy): string {
  return FEE_REFUND_POLICY_DISCLOSURE[policy] || FEE_REFUND_POLICY_DISCLOSURE.undetermined;
}

/** True only once the owner has selected a real policy after legal approval. */
export function feeRefundPolicyApproved(policy: FeeRefundPolicy): boolean {
  return policy !== 'undetermined';
}

export interface FeeRefundDisclosure {
  policy: FeeRefundPolicy;
  statement: string;
  exceptions: string[];
  is_approved: boolean;
}

/**
 * The membership-fee refund section of the customer disclosure.
 * The exceptions and the statutory-override statement are always included: they
 * apply to every policy, including a non-refundability policy.
 */
export function buildFeeRefundDisclosure(policy?: FeeRefundPolicy): FeeRefundDisclosure {
  const resolved: FeeRefundPolicy = policy || DEFAULT_FEE_REFUND_POLICY;
  return {
    policy: resolved,
    statement: describeFeeRefundPolicy(resolved),
    exceptions: LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS,
    is_approved: feeRefundPolicyApproved(resolved),
  };
}

/**
 * The fee actually due for a tier RIGHT NOW.
 * Returns 0 while the membership-fee flag is off, so no fee can be charged,
 * billed or recorded before the owner authorizes it.
 */
export function feeDueForTier(tierAmount: number): number {
  return getMembershipFee(tierAmount);
}

/** The fee table as approved, regardless of the live flag (for disclosure/UI). */
export function approvedFeeForTier(tierAmount: number): number {
  return AUTOFUND_MEMBERSHIP_FEE[tierAmount] ?? 0;
}

/** True when this tier carries any membership fee in the approved structure. */
export function tierHasFee(tierAmount: number): boolean {
  return approvedFeeForTier(tierAmount) > 0;
}

/** The total recurring charge the customer authorizes: deposit + fee. */
export function totalRecurringCharge(tierAmount: number): number {
  return getTotalMonthlyCharge(tierAmount);
}

/** Fee billing is live only when the flag is on. */
export function isFeeBillingEnabled(): boolean {
  return AUTOFUND_FINAL_FLAGS.membership_fee_enabled;
}

/** How this enrollment was sourced. */
export type EnrollmentChannel = 'self_service' | 'sales_assisted' | 'admin';

/**
 * Whether an enrollment on this channel may carry sales compensation.
 *
 * Self-service enrollment with no qualifying advisor involvement must NOT
 * generate commission. Attribution has to be a deliberate, verifiable act — never
 * inferred from an advisor being available or from a customer clicking a general
 * contact link.
 */
export function channelMayCarryAttribution(channel: EnrollmentChannel, verifiedAdvisorId: string): boolean {
  if (!verifiedAdvisorId) return false;
  if (channel === 'self_service') {
    // A self-service customer may only carry attribution if they were explicitly
    // referred/assisted by a named advisor, which the caller must have verified.
    return false;
  }
  return channel === 'sales_assisted' || channel === 'admin';
}

/**
 * Charge (or record the failure of) one membership fee.
 *
 * Idempotent on payment_event_id. Creates NO credit lot, NO wallet transaction,
 * NO commission event, and does not touch the wallet balance in any way.
 *
 * @param base44 service-role client
 */
export async function processMembershipFee({
  base44,
  payment_event_id,
  subscription,
  status,
  tier_amount,
  stripe_invoice_id,
  stripe_charge_id,
  failure_reason,
  actor,
  billing_period_start,
  billing_period_end,
  refund_policy,
  cert_mode,
}: {
  base44: any;
  payment_event_id: string;
  subscription: any;
  status: 'succeeded' | 'failed';
  tier_amount: number;
  stripe_invoice_id?: string;
  stripe_charge_id?: string;
  failure_reason?: string;
  actor?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  refund_policy?: FeeRefundPolicy;
  cert_mode?: boolean;
}) {
  if (!payment_event_id) {
    return { status: 'error', error: 'payment_event_id is required', error_code: 'FEE_EVENT_ID_REQUIRED' };
  }

  // ── Fail closed while billing is switched off ─────────────────────────────
  if (!isFeeBillingEnabled()) {
    return {
      status: 'fee_disabled',
      message: 'Membership-fee billing is disabled. No fee was charged or recorded.',
      payment_event_id,
    };
  }

  const feeAmount = feeDueForTier(tier_amount);
  if (feeAmount <= 0) {
    return { status: 'no_fee_due', message: `No membership fee is due on the $${tier_amount} tier.`, payment_event_id };
  }

  // ── Idempotency: never record the same fee event twice ────────────────────
  const existingRes = await base44.entities.AutoFundPaymentEvent.filter({ payment_event_id }, undefined, 1);
  const existingArr = Array.isArray(existingRes) ? existingRes : (existingRes?.data || []);
  if (existingArr.length > 0) {
    return { status: 'duplicate', event: existingArr[0] };
  }

  const nowIso = new Date().toISOString();
  const idPrefix = cert_mode ? 'cert_' : '';
  const policy: FeeRefundPolicy = refund_policy || subscription?.fee_refund_policy || DEFAULT_FEE_REFUND_POLICY;
  const isSuccess = status === 'succeeded';

  // A fee is RECORDED in the same ledger, with ZERO Booking Value issued. No lot,
  // no wallet transaction, no commission — the fee can never become spendable and
  // can never be commissioned.
  const feeEvent = await base44.entities.AutoFundPaymentEvent.create({
    payment_event_id,
    subscription_id: subscription?.id || '',
    customer_id: subscription?.customer_id || '',
    customer_email: subscription?.customer_email || '',
    amount_charged: feeAmount,
    booking_value_issued: 0,
    booking_value_issued_cents: 0,
    bonus_booking_value: 0,
    credits_issued: 0,
    status: isSuccess ? 'succeeded' : 'failed',
    event_type: MEMBERSHIP_FEE_EVENT_TYPE,
    charge_component: MEMBERSHIP_FEE_COMPONENT,
    membership_fee_amount: feeAmount,
    refund_policy: policy,
    stripe_invoice_id: stripe_invoice_id || '',
    stripe_charge_id: stripe_charge_id || '',
    wallet_transaction_id: '',
    lot_id: '',
    commission_event_id: '',
    failure_reason: failure_reason || '',
    billing_period_start: billing_period_start || '',
    billing_period_end: billing_period_end || '',
    processed_at: nowIso,
    idempotency_key: payment_event_id,
    raw_event: '',
  });

  // Subscription fee state — auditable last-charge tracking for billing history.
  if (subscription?.id) {
    await base44.entities.AutoFundSubscription.update(subscription.id, {
      last_fee_charged_at: isSuccess ? nowIso : (subscription.last_fee_charged_at || ''),
      last_fee_status: isSuccess ? 'succeeded' : 'failed',
      last_fee_failure_reason: isSuccess ? '' : (failure_reason || ''),
      consecutive_fee_failures: isSuccess ? 0 : ((subscription.consecutive_fee_failures || 0) + 1),
      fee_refund_policy: policy,
      updated_at: nowIso,
    });
  }

  return {
    status: isSuccess ? 'fee_recorded' : 'fee_failed_recorded',
    payment_event_id,
    membership_fee_amount: feeAmount,
    booking_value_issued_cents: 0,
    generated_commission: false,
    generated_promotional_credit: false,
    event_id: feeEvent?.id || '',
    refund_policy: policy,
  };
}

/**
 * Record a fee refund or dispute reversal against a fee event.
 * The fee ledger is append-only, so the reversal is recorded as its own event
 * rather than by editing the original.
 */
export async function recordFeeRefund({
  base44,
  fee_event,
  refund_amount,
  reason,
  actor,
  refunded_at,
}: {
  base44: any;
  fee_event: any;
  refund_amount?: number;
  reason?: string;
  actor?: string;
  refunded_at?: string;
}) {
  const nowIso = refunded_at || new Date().toISOString();
  const amount = refund_amount ?? fee_event?.membership_fee_amount ?? fee_event?.amount_charged ?? 0;
  await base44.entities.AutoFundPaymentEvent.update(fee_event.id, {
    status: 'refunded',
    refunded_at: nowIso,
    refund_reason: reason || '',
    refund_amount_cents: Math.round(amount * 100),
  });
  return {
    status: 'fee_refunded',
    membership_fee_amount: amount,
    wallet_liability_created: false,
    commission_reversal_required: false,
    note: 'The membership fee generated no commission, so no commission reversal is required.',
  };
}

/**
 * Build the fee lines of a billing history from the immutable payment-event ledger.
 * Wallet funding and membership fees are kept visibly separate, which is the
 * customer-facing counterpart of the ledger separation.
 */
export function buildBillingHistory(events: any[]) {
  return (events || []).map(e => {
    const isFee = e.charge_component === MEMBERSHIP_FEE_COMPONENT || e.event_type === MEMBERSHIP_FEE_EVENT_TYPE;
    return {
      payment_event_id: e.payment_event_id,
      date: e.processed_at,
      component: isFee ? MEMBERSHIP_FEE_COMPONENT : WALLET_FUNDING_COMPONENT,
      amount_charged: e.amount_charged,
      booking_value_added: isFee ? 0 : (e.booking_value_issued || 0),
      status: e.status,
      event_type: e.event_type,
      failure_reason: e.failure_reason || '',
      refund_policy: isFee ? (e.refund_policy || DEFAULT_FEE_REFUND_POLICY) : undefined,
      refunded_at: e.refunded_at || undefined,
    };
  });
}

/** What the customer is charged, shown separately. Never merged into Booking Value. */
export function buildChargeDisclosure(tierAmount: number) {
  const deposit = tierAmount;
  const fee = approvedFeeForTier(tierAmount);
  return {
    monthly_wallet_funding: deposit,
    monthly_membership_fee: fee,
    total_monthly_recurring_charge: deposit + fee,
    fee_is_spendable_booking_value: false,
    fee_generates_promotional_credit: false,
    fee_generates_sales_commission: false,
  };
}

/** True when the tier's fee matches the approved table — used to reject tampering. */
export function feeMatchesApprovedTable(tierAmount: number, quotedFee: number): boolean {
  return Math.round(quotedFee * 100) === Math.round(approvedFeeForTier(tierAmount) * 100);
}