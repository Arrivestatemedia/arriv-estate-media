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
import { AUTO_FUND_AMOUNTS, AUTO_FUND_AMOUNT_OPTIONS, generateId, getAutoFundConfig } from './prepaidEngine.ts';
import { buildComplianceDisclosure, AUTOFUND_TERMS_VERSION } from './autoFundComplianceDisclosure.ts';
import {
  describeInterlockRefusal,
  evaluateLaunchInterlock,
  readLaunchConfiguration,
  type InterlockBlocker,
  type LaunchConfiguration,
} from './autoFundLaunchInterlock.ts';
import {
  resolveBillingJurisdiction,
  recordJurisdictionAudit,
  describeJurisdictionRequirement,
  type BillingAddressInput,
} from './autoFundJurisdiction.ts';

/**
 * The terms version the customer accepts at enrollment.
 * V1 of the membership terms (`ARRIV_AUTOFUND_MEMBERSHIP_TERMS_V1.md`), which
 * incorporates the membership-fee refund policy and the separate wallet terms.
 * Any material change requires a new label AND refreshed customer consent —
 * see the versioned-consent requirements in the terms document.
 */
export const CURRENT_TERMS_VERSION = AUTOFUND_TERMS_VERSION;

export interface EnrollmentRequest {
  base44: any;
  channel: EnrollmentChannel;
  tier_amount: number;
  customer_email: string;
  customer_name?: string;
  customer_phone?: string;
  /**
   * Customer-provided billing address. REQUIRED — it is the source of the
   * billing jurisdiction that the renewal-notice rules depend on.
   */
  billing_address?: BillingAddressInput;
  /** State reported by the payment method, when one is available. Used only to corroborate or conflict-flag the customer's own address. */
  payment_method_state?: string;
  /**
   * Certification-only launch-gate bypass. Supplied EXCLUSIVELY by the
   * admin-only compliance suite; no user-facing route forwards it. See the gate
   * in `enrollAutoFund` — public enrollment is not opened by this.
   *
   * It must carry the launch configuration it intends to exercise. That
   * configuration is an explicit, declared TEST INPUT, not a claim about reality:
   * the live flags are never touched, and the suite separately asserts that the
   * REAL configuration refuses enrollment. Production callers must omit this field
   * entirely, which makes the engine read the real configuration instead.
   */
  certification_bypass?: {
    authorized: boolean;
    admin_email: string;
    launch_configuration?: LaunchConfiguration;
  };
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
  status: 'enrolled' | 'enrollment_closed' | 'launch_interlock_blocked' | 'invalid' | 'already_enrolled';
  error?: string;
  /** Present only when the launch interlock refused. Names every unmet requirement. */
  interlock?: { version: string; permitted: boolean; blockers: InterlockBlocker[] };
  subscription_id?: string;
  wallet_id?: string;
  contact_id?: string;
  tier_amount?: number;
  plan_id?: string;
  membership_fee?: number;
  total_monthly_charge?: number;
  booking_value_per_cycle?: number;
  benefits?: any[];
  jurisdiction?: {
    state: string;
    resolution: string;
    needs_review: boolean;
    review_reason: string;
    customer_record_mirrored: boolean;
    audit_recorded: boolean;
  };
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
  // ── Certification-only bypass ─────────────────────────────────────────────
  // Lets the admin-only compliance suite exercise enrollment while PUBLIC
  // enrollment stays closed. Three independent conditions must ALL hold, so no
  // customer request can reach this path:
  //   1. an explicit bypass object marked authorized,
  //   2. a named admin, which the CALLING function verifies before passing it,
  //   3. a synthetic cert_-prefixed enrolled address.
  // No user-facing route forwards `certification_bypass`, so (1) cannot be
  // supplied from outside. This does not open public enrollment.
  // ── Certification-only bypass ─────────────────────────────────────────────
  // Lets the admin-only compliance suite exercise enrollment while PUBLIC
  // enrollment stays closed. Four independent conditions must ALL hold, so no
  // customer request can reach this path:
  //   1. an explicit bypass object marked authorized,
  //   2. a named admin, which the CALLING function verifies before passing it,
  //   3. a synthetic cert_-prefixed enrolled address,
  //   4. a DECLARED launch configuration to evaluate the interlock against.
  // No user-facing route forwards `certification_bypass`, so (1) cannot be
  // supplied from outside. This does not open public enrollment.
  const bypass = req.certification_bypass;
  const isCertificationRun =
    bypass?.authorized === true &&
    !!bypass?.admin_email &&
    !!bypass?.launch_configuration &&
    /^cert_/i.test(String(req.customer_email || ''));

  if (!isCertificationRun && !isEnrollmentOpen(flagArr.length > 0 ? flagArr[0].value : null)) {
    return { status: 'enrollment_closed', error: 'Auto-Fund enrollment is closed pending owner launch authorization.' };
  }

  // ── Fail-closed launch interlock ──────────────────────────────────────────
  // Requirement 1 of the launch interlock: enrollment is IMPOSSIBLE unless the
  // configuration that would charge this customer agrees, on every approved tier,
  // with the configuration that would disclose the charge — including the
  // membership fee, and including the legal and processor prerequisites. This
  // replaces the previous behaviour where a customer could be enrolled while an
  // internal charge disagreed with its own disclosed breakdown.
  const launchConfig: LaunchConfiguration = isCertificationRun
    ? (bypass!.launch_configuration as LaunchConfiguration)
    : await readLaunchConfiguration(base44);

  const interlock = evaluateLaunchInterlock(launchConfig);
  if (!interlock.permitted) {
    return {
      status: 'launch_interlock_blocked',
      error: describeInterlockRefusal(interlock),
      interlock: {
        version: interlock.version,
        permitted: false,
        blockers: interlock.blockers,
      },
    };
  }

  // ── Server-side pricing: nothing financial is read from the request ───────
  const config = getAutoFundConfig(req.tier_amount);
  if (!config) {
    return { status: 'invalid', error: 'Invalid tier. Must be one of: ' + AUTO_FUND_AMOUNTS.join(', ') };
  }

  // ── Enrollable-tier gate ─────────────────────────────────────────────────
  // getAutoFundConfig also resolves the RETIRED $50 / $100 / $200 tiers, which
  // exist ONLY so an existing contract keeps its contracted funding amount. The
  // resolvable list is therefore wider than the sellable list, and using it as
  // the enrollment guard silently re-opened the retired tiers to new business.
  // The ENROLLABLE list governs new enrollment; the retired tiers stay
  // resolvable but cannot be sold.
  if (!AUTO_FUND_AMOUNT_OPTIONS.includes(config.amount)) {
    return {
      status: 'invalid',
      error: `The $${config.amount} tier is closed to new enrollment. Choose one of: $${AUTO_FUND_AMOUNT_OPTIONS.join(', $')}.`,
    };
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
  // Resolved from the configuration the interlock has just approved, so the amount
  // RECORDED, the amount DISCLOSED and the amount CHARGED are one resolution. The
  // interlock refuses to reach this point when they would disagree.
  const feeEnabled = launchConfig.membership_fee_enabled;
  const membershipFee = getMembershipFee(config.amount, feeEnabled);
  const totalMonthly = getTotalMonthlyCharge(config.amount, feeEnabled);
  const feePolicy = req.fee_refund_policy || DEFAULT_FEE_REFUND_POLICY;

  // ── Billing jurisdiction (REQUIRED) ──────────────────────────────────────
  // Which renewal-notice rule applies depends on the customer's billing
  // jurisdiction, so it is captured from the customer's OWN billing address
  // before anything is created. It is never inferred from IP geolocation, a
  // phone number or an advisor's location.
  //
  // A missing or invalid jurisdiction BLOCKS enrollment. It is not silently
  // replaced with a generic default: a notice sent under the wrong cadence
  // looks like compliance while being none. The customer is asked to correct
  // it, and the requirement is stated to them.
  const jurisdiction = resolveBillingJurisdiction({
    billing_address: req.billing_address,
    payment_method_state: req.payment_method_state,
  });
  if (!jurisdiction.ok) {
    return {
      status: 'invalid',
      error: jurisdiction.error || describeJurisdictionRequirement(),
    };
  }
  const jurisdictionState = jurisdiction.state as string;

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
    // The customer's own billing address, preserved exactly as provided, plus
    // the VALIDATED jurisdiction that drives this subscription's renewal rule.
    billing_address_line1: req.billing_address?.line1 || '',
    billing_city: req.billing_address?.city || '',
    billing_state: String(req.billing_address?.state || '').trim().toUpperCase(),
    billing_postal_code: req.billing_address?.postal_code || '',
    billing_country: String(req.billing_address?.country || 'US').trim().toUpperCase(),
    jurisdiction_state: jurisdictionState,
    jurisdiction_resolution: jurisdiction.method || '',
    jurisdiction_captured_at: jurisdiction.captured_at,
    jurisdiction_updated_at: jurisdiction.captured_at,
    jurisdiction_needs_review: jurisdiction.needs_review,
    jurisdiction_review_reason: jurisdiction.review_reason,
    certification_mode: isCertificationRun,
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

  // ── Jurisdiction audit trail ─────────────────────────────────────────────
  // Opens the trail for this subscription with the capture decision, so the
  // basis for every later notice is reconstructable. A conflicting or unusual
  // case is recorded as a FLAGGED entry rather than quietly accepted.
  await recordJurisdictionAudit({
    base44,
    change_type: jurisdiction.needs_review ? 'flagged_conflict' : 'initial_capture',
    subscription_id: subscription.id,
    customer_id: contact.id,
    customer_email: contact.email,
    new_state: jurisdictionState,
    resolution_method: jurisdiction.method,
    needs_review: jurisdiction.needs_review,
    review_reason: jurisdiction.review_reason,
    billing_address: req.billing_address,
    payment_state: jurisdiction.payment_state,
    actor: req.actor || req.customer_email,
    note: jurisdiction.needs_review
      ? 'Jurisdiction captured from the customer-provided billing address and flagged for human review.'
      : 'Jurisdiction captured from the customer-provided billing address.',
  });

  // Mirror the billing jurisdiction onto the customer record so it is visible
  // wherever the customer is viewed. The subscription stays authoritative for
  // billing; the outcome is reported rather than swallowed.
  let customerRecordMirrored = true;
  try {
    await base44.entities.Contact.update(contact.id, {
      billing_address_line1: req.billing_address?.line1 || '',
      billing_city: req.billing_address?.city || '',
      billing_state: String(req.billing_address?.state || '').trim().toUpperCase(),
      billing_postal_code: req.billing_address?.postal_code || '',
      billing_country: String(req.billing_address?.country || 'US').trim().toUpperCase(),
      billing_jurisdiction_state: jurisdictionState,
    });
  } catch {
    customerRecordMirrored = false;
  }

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
    jurisdiction: {
      state: jurisdictionState,
      resolution: jurisdiction.method || '',
      needs_review: jurisdiction.needs_review,
      review_reason: jurisdiction.review_reason,
      customer_record_mirrored: customerRecordMirrored,
      audit_recorded: true,
    },
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
      ...buildEnrollmentDisclosure(config.amount, isVip, feeEnabled),
      ...buildChargeDisclosure(config.amount, feeEnabled),
      fee_refund_policy: feePolicy,
      fee_refund_policy_statement: describeFeeRefundPolicy(feePolicy),
      // The authoritative compliance package: every material pre-authorization
      // disclosure item, resolved from the canonical configuration. The same
      // package drives the tier catalog the interface renders, so the customer
      // sees identical material disclosures on both enrollment channels.
      compliance: buildComplianceDisclosure({
        tierAmount: config.amount,
        termsVersion: CURRENT_TERMS_VERSION,
        billingDay,
        nextRenewalDate: nextBilling.toDateString(),
        feePolicy,
        feeEnabled,
      }),
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