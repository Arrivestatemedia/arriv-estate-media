// ============================================================================
// ARRIV AUTO-FUND — SHARED ENROLLMENT ENGINE
// ============================================================================
// ONE enrollment path for both customer channels, so self-service and
// sales-assisted enrollment can never diverge on price, benefits or disclosure:
//
//   self_service   — the customer enrolls themselves from the website.
//   sales_assisted — an advisor guides the customer through the same checkout.
//   admin           — an administrator provisions the membership.
//
// Rules enforced here, at the server, not in the interface:
//
//   • Every price is read from the canonical configuration. Nothing about money
//     is ever taken from the request, so a salesperson cannot modify a bonus, a
//     membership fee or a tier price — there is no parameter that would let them.
//   • The customer must authorize their own recurring charge. A sales-assisted
//     enrollment cannot supply that on the customer's behalf.
//   • No advisor stores or transmits card data. Enrollment returns a checkout
//     handoff; it never accepts payment-instrument details.
//   • Advisor attribution must be a deliberate, verified act. A self-service
//     enrollment with no verified advisor generates NO commission, and an advisor
//     is never credited merely for being available or for a general contact click.
// ============================================================================

import {
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  getMembershipFee,
  getTotalMonthlyCharge,
  isEnrollmentOpen,
  buildEnrollmentDisclosure,
} from './autoFundFinalConfig.ts';
import {
  DEFAULT_FEE_REFUND_POLICY,
  buildChargeDisclosure,
  describeFeeRefundPolicy,
  processMembershipFee,
  type EnrollmentChannel,
  type FeeRefundPolicy,
} from './autoFundMembershipBilling.ts';
import { AUTO_FUND_AMOUNTS, generateId, getAutoFundConfig } from './prepaidEngine.ts';

export const CURRENT_TERMS_VERSION = 'autofund_terms_2026_10';

export interface EnrollmentRequest {
  base44: any;
  channel: EnrollmentChannel;
  tier_amount: number;
  customer_email: string;
  customer_name?: string;
  customer_phone?: string;
  /** Advisor attribution, only honoured when it can be verified. */
  sales_rep_id?: string;
  attribution_source?: '' | 'customer_selected_advisor' | 'advisor_enrolled' | 'admin_assigned';
  /** Customer's own authorization of the recurring charge. */
  terms_accepted?: boolean;
  terms_accepted_by?: string;
  fee_refund_policy?: FeeRefundPolicy;
  /** Arriv Pay identifiers, when checkout already produced a subscription. */
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  billing_day?: number;
  actor?: string;
}

/** Resolve verified advisor attribution. Never inferred — it must be earned. */
async function resolveAttribution(base44: any, req: EnrollmentRequest) {
  const none = { sales_rep_id: '', sales_rep_email: '', verified: false, source: '' as const };
  if (!req.sales_rep_id) return none;

  // Self-service may only carry attribution when the customer deliberately named
  // an advisor. Any other self-service path stays unattributed.
  const source = req.attribution_source || '';
  if (req.channel === 'self_service' && source !== 'customer_selected_advisor') return none;
  if (req.channel === 'sales_assisted' && source !== 'advisor_enrolled') return none;
  if (req.channel === 'admin' && source !== 'admin_assigned') return none;

  let rep: any = null;
  try {
    const reps = await base44.entities.SalesTeamMember.filter({ id: req.sales_rep_id }, undefined, 1);
    rep = Array.isArray(reps) ? reps[0] : (reps?.data || [])[0];
  } catch { /* fall through to unattributed */ }
  if (!rep) return none;

  const active = rep.status === 'active' || rep.status === 'ACTIVE' || !rep.status;
  if (!active) return none;

  return {
    sales_rep_id: rep.id,
    sales_rep_email: rep.email || '',
    verified: true,
    source,
  };
}

export interface EnrollmentResult {
  status: 'enrolled' | 'enrollment_closed' | 'invalid' | 'already_enrolled';
  error?: string;
  subscription_id?: string;
  wallet_id?: string;
  contact_id?: string;
  tier_amount?: number;
  plan_id?: string;
  membership_fee?: number;
  total_monthly_charge?: number;
  booking_value_per_cycle?: number;
  benefits?: any[];
  attribution?: { verification: string; advisor_email: string };
  /** The customer must complete payment through the existing checkout. */
  checkout_handoff?: any;
  disclosure?: any;
}

/**
 * Enroll a customer into Auto-Fund on either channel.
 *
 * This function never charges a card and never accepts payment-instrument data.
 * It creates the membership, records the customer's authorization of the
 * recurring charge, and returns a checkout handoff. Funding is processed by the
 * shared payment processor when Arriv Pay confirms the payment.
 */
export async function enrollAutoFund(req: EnrollmentRequest): Promise<EnrollmentResult> {
  const { base44 } = req;

  // ── Owner launch gate ─────────────────────────────────────────────────────
  const flagRes = await base44.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
  const flagArr = Array.isArray(flagRes) ? flagRes : (flagRes?.data || []);
  if (!isEnrollmentOpen(flagArr.length > 0 ? flagArr[0].value : null)) {
    return { status: 'enrollment_closed', error: 'Auto-Fund enrollment is closed pending owner launch authorization.' };
  }

  // ── Server-side pricing: nothing financial is read from the request ───────
  const config = getAutoFundConfig(req.tier_amount);
  if (!config) {
    return { status: 'invalid', error: 'Invalid tier. Must be one of: ' + AUTO_FUND_AMOUNTS.join(', ') };
  }
  if (!req.customer_email) return { status: 'invalid', error: 'customer_email is required' };

  // ── The customer authorizes their own recurring charge ───────────────────
  if (!req.terms_accepted) {
    return {
      status: 'invalid',
      error: 'The customer must review and authorize the recurring payment terms before enrollment.',
    };
  }
  const acceptedBy = (req.terms_accepted_by || '').toLowerCase().trim();
  if (acceptedBy !== req.customer_email.toLowerCase().trim()) {
    return {
      status: 'invalid',
      error: 'Recurring-charge authorization must come from the customer being enrolled. An advisor cannot accept these terms on the customer\'s behalf.',
    };
  }

  const isVip = config.amount === 1000;
  const membershipFee = getMembershipFee(config.amount);
  const totalMonthly = getTotalMonthlyCharge(config.amount);
  const feePolicy = req.fee_refund_policy || DEFAULT_FEE_REFUND_POLICY;

  // ── Contact (Customer 360) ───────────────────────────────────────────────
  const contactRes = await base44.entities.Contact.filter({ email: req.customer_email }, undefined, 1);
  const contactArr = Array.isArray(contactRes) ? contactRes : (contactRes?.data || []);
  let contact = contactArr[0];
  if (!contact) {
    const parts = (req.customer_name || '').trim().split(/\s+/);
    contact = await base44.entities.Contact.create({
      email: req.customer_email,
      firstname: parts[0] || req.customer_name || '',
      lastname: parts.slice(1).join(' ') || '',
      phone: req.customer_phone || '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    });
  }

  const existingRes = await base44.entities.AutoFundSubscription.filter(
    { customer_id: contact.id, status: { $in: ['active', 'paused'] } },
    undefined,
    1
  );
  const existingArr = Array.isArray(existingRes) ? existingRes : (existingRes?.data || []);
  if (existingArr.length > 0) {
    return {
      status: 'already_enrolled',
      error: 'Customer already has an active Auto-Fund subscription.',
      subscription_id: existingArr[0].id,
    };
  }

  // ── Attribution (verified, never inferred) ───────────────────────────────
  const attribution = await resolveAttribution(base44, req);

  // ── Wallet ───────────────────────────────────────────────────────────────
  const walletRes = await base44.entities.PrepaidWallet.filter({ customer_id: contact.id }, undefined, 1);
  const walletArr = Array.isArray(walletRes) ? walletRes : (walletRes?.data || []);
  let wallet = walletArr[0];
  const nowIso = new Date().toISOString();

  if (!wallet) {
    wallet = await base44.entities.PrepaidWallet.create({
      customer_id: contact.id,
      customer_email: contact.email,
      customer_name: req.customer_name || `${contact.firstname || ''} ${contact.lastname || ''}`.trim(),
      tier: 'STARTER',
      support_tier: config.support_tier,
      credits_balance: 0, booking_value_balance: 0,
      total_credits_issued: 0, total_booking_value_issued: 0,
      total_credits_redeemed: 0, total_booking_value_redeemed: 0,
      total_credits_expired: 0, total_booking_value_expired: 0,
      promotional_benefits_available: 0, promotional_benefits_used: 0,
      sales_rep_id: attribution.sales_rep_id,
      sales_rep_email: attribution.sales_rep_email,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso, updated_at: nowIso,
    });
  }

  const billingDay = req.billing_day || new Date().getDate();
  const nextBilling = new Date();
  nextBilling.setDate(billingDay);
  if (nextBilling <= new Date()) nextBilling.setMonth(nextBilling.getMonth() + 1);

  const subscription = await base44.entities.AutoFundSubscription.create({
    customer_id: contact.id,
    customer_email: contact.email,
    customer_name: req.customer_name || wallet.customer_name || '',
    wallet_id: wallet.id,
    amount: config.amount,
    // Money fields come from the canonical configuration only.
    membership_fee: membershipFee,
    total_monthly_charge: totalMonthly,
    fee_refund_policy: feePolicy,
    plan_id: config.plan_id,
    status: 'active',
    enrollment_channel: req.channel,
    attribution_source: attribution.verified ? attribution.source : '',
    attribution_verified: attribution.verified,
    attribution_verified_at: attribution.verified ? nowIso : undefined,
    terms_accepted_at: nowIso,
    terms_accepted_by: acceptedBy,
    terms_version: CURRENT_TERMS_VERSION,
    stripe_subscription_id: req.stripe_subscription_id || '',
    stripe_customer_id: req.stripe_customer_id || '',
    sales_rep_id: attribution.sales_rep_id,
    sales_rep_email: attribution.sales_rep_email,
    billing_day_of_month: billingDay,
    next_billing_date: nextBilling.toISOString(),
    feature_flag_enabled: true,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return {
    status: 'enrolled',
    subscription_id: subscription.id,
    wallet_id: wallet.id,
    contact_id: contact.id,
    tier_amount: config.amount,
    plan_id: config.plan_id,
    membership_fee: membershipFee,
    total_monthly_charge: totalMonthly,
    booking_value_per_cycle: config.booking_value,
    benefits: config.benefits,
    attribution: attribution.verified
      ? { verification: 'verified', advisor_email: attribution.sales_rep_email }
      : { verification: 'none — no commission will be generated', advisor_email: '' },
    checkout_handoff: {
      // The customer pays the TOTAL recurring charge: wallet funding + membership fee.
      recurring_charge_cents: Math.round(totalMonthly * 100),
      wallet_funding_cents: Math.round(config.amount * 100),
      membership_fee_cents: Math.round(membershipFee * 100),
      billing_day_of_month: billingDay,
      next_billing_date: nextBilling.toISOString(),
      note: 'Recurring charge is authorized by the customer. No card data is accepted or stored by this system.',
    },
    disclosure: {
      ...buildEnrollmentDisclosure(config.amount, isVip),
      ...buildChargeDisclosure(config.amount),
      fee_refund_policy: feePolicy,
      fee_refund_policy_statement: describeFeeRefundPolicy(feePolicy),
    },
  };
}

/** Charge the membership fee for one billing cycle. Idempotent. */
export async function chargeMembershipFeeForCycle({
  base44, subscription, payment_event_id, status, stripe_invoice_id, stripe_charge_id,
  failure_reason, actor, billing_period_start, billing_period_end, cert_mode,
}: any) {
  return processMembershipFee({
    base44,
    payment_event_id,
    subscription,
    status,
    tier_amount: subscription?.amount,
    stripe_invoice_id,
    stripe_charge_id,
    failure_reason,
    actor,
    billing_period_start,
    billing_period_end,
    cert_mode,
  });
}

export { generateId };