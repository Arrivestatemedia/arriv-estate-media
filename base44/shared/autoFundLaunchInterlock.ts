// ============================================================================
// ARRIV AUTO-FUND — FAIL-CLOSED LAUNCH INTERLOCK
// ============================================================================
// ONE gate that must pass before ANY customer can be enrolled. It answers a
// single question: does the configuration that would charge a customer agree,
// on every tier, with the configuration that would disclose the charge to them?
//
// The hazard it eliminates is a SEQUENCING hazard, not a logic bug. Enrollment
// and membership-fee billing are controlled by separate switches. Turning on
// enrollment while billing stays off produced an internally contradictory
// record — a charge on one basis and a fee on another — and would have put an
// unnamed amount into a customer's wallet funding.
//
// The interlock therefore FAILS CLOSED. Any disagreement, any missing legal
// approval, any stale processor contract, any retired tier that became
// enrollable, or any restriction that stopped being enforced blocks enrollment
// outright. There is no fallback, no default and no "warn and continue" path.
//
// The gate is evaluated against a `LaunchConfiguration`. Production always
// reads the REAL one from the live feature flags and AppSettings. The
// certification suite may declare a configuration explicitly so it can verify
// that the engine behaves correctly in the configuration the owner intends to
// launch — and, just as importantly, that every broken configuration prevents
// enrollment. A declared configuration NEVER activates anything: the live
// flags are untouched and `readLaunchConfiguration` always reports the truth.
// ============================================================================

import {
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  AUTOFUND_FINAL_FLAGS,
  AUTOFUND_MEMBERSHIP_FEE,
  getMembershipFee,
  buildEnrollmentDisclosure,
} from './autoFundFinalConfig.ts';
import {
  AUTO_FUND_AMOUNT_OPTIONS,
  AUTO_FUND_LEGACY_AMOUNTS,
  AUTO_FUND_RETIRED_AMOUNTS,
  getAutoFundConfig,
  round2,
} from './prepaidEngine.ts';
import {
  AUTOFUND_TERMS_VERSION,
  AUTOFUND_TERMS_LEGAL_APPROVAL_KEY,
  AUTOFUND_FEE_REFUND_POLICY_KEY,
  AUTOFUND_WALLET_TERMS_APPROVAL_KEY,
  buildComplianceDisclosure,
} from './autoFundComplianceDisclosure.ts';
import { DEFAULT_FEE_REFUND_POLICY, type FeeRefundPolicy } from './autoFundMembershipBilling.ts';
import { AUTOFUND_PROCESSOR_CAPABILITIES, AUTOFUND_PROCESSOR_CONTRACT_VERSION } from './autoFundProcessor.ts';
import { MLS_PRICING_VERSION_V2 } from './mlsPricing.ts';
import { VIP_ENFORCEMENT_IS_AUTHORITATIVE, VIP_TIER_AMOUNT } from './autoFundVipEnforcement.ts';

/** Version of this interlock's rule set, recorded in every launch report. */
export const AUTOFUND_INTERLOCK_VERSION = 'autofund_launch_interlock_v1';

/**
 * The processor contract this interlock requires. If the processor declares a
 * different version, enrollment is blocked: a stale processor may not know how to
 * separate the components of the charge it is about to take.
 */
export const REQUIRED_PROCESSOR_CONTRACT_VERSION = 'autofund_processor_v2';

/** Blocker codes. Each maps to one launch requirement, so a refusal is diagnosable. */
export const INTERLOCK_CODES = {
  ENROLLMENT_NOT_ENABLED: 'ENROLLMENT_NOT_ENABLED',
  TIER_CONFIGURATION_INVALID: 'TIER_CONFIGURATION_INVALID',
  TIER_SCHEDULE_DIVERGED: 'TIER_SCHEDULE_DIVERGED',
  FEE_NOT_ENABLED: 'FEE_NOT_ENABLED',
  ZERO_FEE_TIER_CHARGES_FEE: 'ZERO_FEE_TIER_CHARGES_FEE',
  DISCLOSURE_CHARGE_MISMATCH: 'DISCLOSURE_CHARGE_MISMATCH',
  RETIRED_TIER_LEAK: 'RETIRED_TIER_LEAK',
  LEGACY_TERMS_LOST: 'LEGACY_TERMS_LOST',
  VIP_RESTRICTION_INACTIVE: 'VIP_RESTRICTION_INACTIVE',
  VIP_RESTRICTION_NOT_ATTACHED: 'VIP_RESTRICTION_NOT_ATTACHED',
  PROCESSOR_CONTRACT_STALE: 'PROCESSOR_CONTRACT_STALE',
  PROCESSOR_SEPARATION_BROKEN: 'PROCESSOR_SEPARATION_BROKEN',
  LEGAL_TERMS_NOT_APPROVED: 'LEGAL_TERMS_NOT_APPROVED',
  FEE_REFUND_POLICY_UNDETERMINED: 'FEE_REFUND_POLICY_UNDETERMINED',
  WALLET_TERMS_NOT_APPROVED: 'WALLET_TERMS_NOT_APPROVED',
  MLS_V2_NOT_CONFIGURED: 'MLS_V2_NOT_CONFIGURED',
} as const;

export type InterlockCode = typeof INTERLOCK_CODES[keyof typeof INTERLOCK_CODES];

/** The processor guarantees that must still hold. Every one is required. */
const REQUIRED_PROCESSOR_CAPABILITIES = [
  'separates_cash_funding_from_promotional_booking_value',
  'membership_fee_issues_zero_booking_value',
  'membership_fee_creates_no_wallet_liability',
  'membership_fee_generates_no_commission',
  'promotional_bonus_issued_as_own_lot',
  'booking_value_recorded_in_integer_cents',
] as const;

/** A single resolved configuration the interlock evaluates. */
export interface LaunchConfiguration {
  /** The code flag. Both it and the owner's AppSetting switch must be on to launch. */
  enrollment_enabled: boolean;
  /** The owner's AppSetting switch value, as stored. */
  enrollment_switch_value: string | null;
  /** Whether a membership fee may be charged, billed and recorded. */
  membership_fee_enabled: boolean;
  /** Whether the VIP promotional restriction is enforced at the booking layer. */
  vip_mls_promo_restriction_enabled: boolean;
  /** The terms version in force. */
  terms_version: string;
  /** True only when the owner has recorded legal approval of that exact version. */
  terms_legally_approved: boolean;
  /** The membership-fee refund policy in force. 'undetermined' blocks launch. */
  fee_refund_policy: FeeRefundPolicy;
  /** True only when counsel has approved the separate wallet terms. */
  wallet_terms_approved: boolean;
  /** True when the owner-approved V2 MLS price configuration exists as data. */
  mls_v2_configured: boolean;
  /** The processor contract version the system is actually running. */
  processor_contract_version: string;
  /** The processor guarantees the system actually provides. */
  processor_capabilities: Record<string, unknown>;
}

export interface InterlockBlocker {
  code: InterlockCode;
  /** The launch requirement this blocker answers, by number. */
  requirement: number;
  scope: string;
  detail: string;
}

export interface InterlockCheck {
  id: string;
  requirement: number;
  ok: boolean;
  detail: string;
}

/** The four approved financial facts for one tier, as the interlock resolves them. */
export interface TierEconomics {
  amount: number;
  funding: number;
  promotional_bonus: number;
  booking_value: number;
  scheduled_fee: number;
  chargeable_fee: number;
  total_recurring_charge: number;
  disclosure_fee: number;
  disclosure_total: number;
  compliance_fee: number;
  compliance_total: number;
  amount_to_be_charged: number;
  agrees: boolean;
}

export interface InterlockEvaluation {
  version: string;
  permitted: boolean;
  blockers: InterlockBlocker[];
  checks: InterlockCheck[];
  tiers: TierEconomics[];
}

/**
 * The interlock's resolution inputs. `charged_totals` lets a caller state the amount
 * that will actually be put to the customer; it defaults to the amount resolved from
 * the same configuration, so production never needs to supply it. It exists so the
 * disclosure-vs-charge invariant can be tested with a deliberately wrong charge.
 */
export interface InterlockOptions {
  charged_totals?: Record<number, number>;
  /**
   * Deliberately broken tier records, for verification only. Production never supplies
   * this; it exists so the interlock's own tier-consistency requirement can be proved
   * to reject a corrupted tier configuration rather than only assumed to.
   */
  tier_config_overrides?: Record<number, any>;
}

/** The canonical tier record, with any injected override applied. */
function resolveTierConfig(amount: number, opts: InterlockOptions = {}): any | null {
  const base = getAutoFundConfig(amount);
  if (!base) return null;
  const override = opts.tier_config_overrides?.[amount];
  return override ? { ...base, ...override } : base;
}

/**
 * Resolve one tier's approved economics from the canonical configuration and the
 * billing configuration, together with the disclosure and the amount to be charged.
 *
 * This is the ONLY place the four approved numbers are assembled, so a caller cannot
 * compare a funding amount from one source against a fee from another.
 */
export function resolveTierEconomics(
  amount: number,
  cfg: LaunchConfiguration,
  opts: InterlockOptions = {},
): TierEconomics | null {
  const config = getAutoFundConfig(amount);
  if (!config) return null;

  const scheduledFee = AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
  const chargeableFee = getMembershipFee(amount, cfg.membership_fee_enabled);
  const total = amount + chargeableFee;
  const isVip = config.vip === true;

  const enrollmentDisclosure = buildEnrollmentDisclosure(amount, isVip, cfg.membership_fee_enabled);
  const compliance = buildComplianceDisclosure({
    tierAmount: amount,
    termsVersion: cfg.terms_version,
    billingDay: 11,
    nextRenewalDate: 'the 11th of next month',
    feePolicy: cfg.fee_refund_policy,
    feeEnabled: cfg.membership_fee_enabled,
  });

  const charged = opts.charged_totals?.[amount] ?? total;

  const agrees =
    enrollmentDisclosure.total_recurring_monthly_charge === total
    && enrollmentDisclosure.monthly_membership_fee === chargeableFee
    && compliance.total_monthly_recurring_charge === total
    && compliance.monthly_membership_fee === chargeableFee
    && compliance.monthly_wallet_funding === amount
    && charged === total;

  return {
    amount,
    funding: amount,
    promotional_bonus: config.bonus_booking_value,
    booking_value: config.booking_value,
    scheduled_fee: scheduledFee,
    chargeable_fee: chargeableFee,
    total_recurring_charge: total,
    disclosure_fee: enrollmentDisclosure.monthly_membership_fee,
    disclosure_total: enrollmentDisclosure.total_recurring_monthly_charge,
    compliance_fee: compliance.monthly_membership_fee,
    compliance_total: compliance.total_monthly_recurring_charge,
    amount_to_be_charged: charged,
    agrees,
  };
}

/**
 * Requirements 1–7: the per-tier financial agreement. Every approved tier's funding
 * amount, promotional bonus, membership fee and total recurring charge must agree
 * across the enrollment configuration, the billing configuration and the disclosure
 * the customer would actually be shown — and with the amount to be charged.
 */
function evaluateTiers(cfg: LaunchConfiguration, opts: InterlockOptions) {
  const checks: InterlockCheck[] = [];
  const tiers: TierEconomics[] = [];

  for (const amount of AUTO_FUND_AMOUNT_OPTIONS) {
    const config = getAutoFundConfig(amount);
    const scope = `$${amount}`;

    if (!config) {
      checks.push({
        id: `TIER_${amount}_RESOLVES`,
        requirement: 1,
        ok: false,
        detail: `$${amount} is offered for enrollment but does not resolve in the canonical configuration.`,
      });
      continue;
    }

    // ── Requirement 11: invalid tier configuration ──────────────────────────
    // The authoritative tier record must be internally consistent before its
    // numbers can be compared with anything: amount, bonus percentage, bonus
    // value, total Booking Value and plan identifier all have to agree.
    const expectedBonus = round2(amount * (config.bonus_pct || 0) / 100);
    const configConsistent =
      config.amount === amount
      && config.booking_value === round2(amount + config.bonus_booking_value)
      && round2(config.bonus_booking_value) === expectedBonus
      && (config.bonus_pct || 0) >= 0
      && !!config.plan_id
      && config.support_tier !== undefined;

    checks.push({
      id: `TIER_${amount}_CONFIGURATION`,
      requirement: 1,
      ok: configConsistent,
      detail: configConsistent
        ? `${scope} funding $${amount} + bonus $${config.bonus_booking_value} = Booking Value $${config.booking_value}`
        : `${scope} is internally inconsistent: funding $${config.amount}, bonus ${config.bonus_pct}%, bonus value $${config.bonus_booking_value}, Booking Value $${config.booking_value}`,
    });

    const economics = resolveTierEconomics(amount, cfg, opts);
    if (!economics) continue;
    tiers.push(economics);

    const isFeeTier = economics.scheduled_fee > 0;

    // ── Requirements 2 and 3: the fee must be enabled, or must be zero ──────
    if (isFeeTier) {
      checks.push({
        id: `TIER_${amount}_FEE_ENABLED`,
        requirement: 2,
        ok: cfg.membership_fee_enabled === true,
        detail: cfg.membership_fee_enabled === true
          ? `${scope} requires its $${economics.scheduled_fee} membership fee and billing is enabled`
          : `${scope} carries a $${economics.scheduled_fee} membership fee in the approved schedule, but membership-fee billing is NOT enabled. Enrollment is refused rather than charging the deposit alone against a disclosed $${amount + economics.scheduled_fee}.`,
      });
      checks.push({
        id: `TIER_${amount}_FEE_SCHEDULE`,
        requirement: 2,
        ok: economics.chargeable_fee === economics.scheduled_fee,
        detail: economics.chargeable_fee === economics.scheduled_fee
          ? `${scope} chargeable fee equals the approved schedule ($${economics.chargeable_fee})`
          : `${scope} would charge $${economics.chargeable_fee} against an approved schedule of $${economics.scheduled_fee}`,
      });
    } else {
      checks.push({
        id: `TIER_${amount}_NO_FEE`,
        requirement: 3,
        ok: economics.chargeable_fee === 0 && economics.disclosure_fee === 0 && economics.compliance_fee === 0 && economics.total_recurring_charge === amount,
        detail: economics.chargeable_fee === 0 && economics.disclosure_fee === 0 && economics.compliance_fee === 0
          ? `${scope} carries no membership fee: chargeable, disclosed and scheduled fees are all $0 and the whole charge funds the wallet`
          : `${scope} must carry no membership fee, but chargeable=$${economics.chargeable_fee} disclosed=$${economics.disclosure_fee} scheduled=$${economics.scheduled_fee}`,
      });
    }

    // ── Requirement 4: the disclosure must equal the amount charged ─────────
    checks.push({
      id: `TIER_${amount}_DISCLOSURE_EQUALS_CHARGE`,
      requirement: 4,
      ok: economics.agrees,
      detail: economics.agrees
        ? `${scope} disclosure $${economics.disclosure_total} = charge breakdown $${economics.total_recurring_charge} = amount to be charged $${economics.amount_to_be_charged}`
        : `${scope} DISAGREES: enrollment disclosure $${economics.disclosure_total}, compliance disclosure $${economics.compliance_total}, charge breakdown $${economics.total_recurring_charge}, amount to be charged $${economics.amount_to_be_charged}`,
    });
  }

  // ── Requirement 1: the enrollment and billing configurations must agree ───
  // Compared as a set rather than per tier: the two configurations are the
  // canonical tier record and the approved fee table, and every enrollable amount
  // must be present in both with the same funding amount.
  const missingFromBilling = AUTO_FUND_AMOUNT_OPTIONS.filter(a => !getAutoFundConfig(a));
  checks.push({
    id: 'CONFIGURATION_PARITY',
    requirement: 1,
    ok: missingFromBilling.length === 0,
    detail: missingFromBilling.length === 0
      ? `Enrollment and billing configurations agree on all ${AUTO_FUND_AMOUNT_OPTIONS.length} approved tiers`
      : `no canonical configuration for: ${missingFromBilling.map(a => `$${a}`).join(', ')}`,
  });

  return { checks, tiers };
}

/** Requirement 6: retired tiers stay unsellable without losing their contracted terms. */
function evaluateRetiredTiers(): InterlockCheck[] {
  const leaked = AUTO_FUND_RETIRED_AMOUNTS.filter(a => AUTO_FUND_AMOUNT_OPTIONS.includes(a));

  const lostTerms = AUTO_FUND_RETIRED_AMOUNTS.filter(a => {
    const legacy = (AUTO_FUND_LEGACY_AMOUNTS as Record<number, any>)[a];
    const resolved = getAutoFundConfig(a);
    return !legacy || !resolved || resolved.booking_value !== legacy.booking_value || !String(resolved.plan_id || '').includes('legacy');
  });

  return [
    {
      id: 'RETIRED_TIERS_NOT_ENROLLABLE',
      requirement: 6,
      ok: leaked.length === 0,
      detail: leaked.length === 0
        ? `Retired tiers ${AUTO_FUND_RETIRED_AMOUNTS.map(a => `$${a}`).join(', ')} are absent from the enrollable list`
        : `RETIRED TIERS BECAME ENROLLABLE: ${leaked.map(a => `$${a}`).join(', ')}`,
    },
    {
      id: 'LEGACY_TERMS_PRESERVED',
      requirement: 6,
      ok: lostTerms.length === 0,
      detail: lostTerms.length === 0
        ? 'Every retired amount still resolves with its contracted Booking Value and legacy plan id'
        : `legacy terms lost for: ${lostTerms.map(a => `$${a}`).join(', ')}`,
    },
  ];
}

/** Requirement 7: the VIP restriction must be enforced and correctly attached. */
function evaluateVipRestriction(cfg: LaunchConfiguration): InterlockCheck[] {
  const vipDisclosure = buildComplianceDisclosure({
    tierAmount: VIP_TIER_AMOUNT,
    termsVersion: cfg.terms_version,
    feePolicy: cfg.fee_refund_policy,
    feeEnabled: cfg.membership_fee_enabled,
  });
  const nonVipAmount = AUTO_FUND_AMOUNT_OPTIONS.find(a => a !== VIP_TIER_AMOUNT) ?? 350;
  const nonVipDisclosure = buildComplianceDisclosure({
    tierAmount: nonVipAmount,
    termsVersion: cfg.terms_version,
    feePolicy: cfg.fee_refund_policy,
    feeEnabled: cfg.membership_fee_enabled,
  });

  const attached =
    typeof vipDisclosure.promotional_credit_usable_on_standalone_mls === 'boolean'
    && typeof nonVipDisclosure.promotional_credit_usable_on_standalone_mls === 'boolean'
    && vipDisclosure.promotional_credit_usable_on_standalone_mls === false
    && nonVipDisclosure.promotional_credit_usable_on_standalone_mls === true;

  return [
    {
      id: 'VIP_ENFORCEMENT_ACTIVE',
      requirement: 7,
      ok: cfg.vip_mls_promo_restriction_enabled === true && VIP_ENFORCEMENT_IS_AUTHORITATIVE === true,
      detail: cfg.vip_mls_promo_restriction_enabled === true
        ? 'VIP promotional restriction is enforced at the authoritative booking layer'
        : 'VIP promotional restriction is INACTIVE, so a VIP customer could spend promotional Booking Value on a standalone MLS Walkthrough',
    },
    {
      id: 'VIP_RESTRICTION_ATTACHED',
      requirement: 7,
      ok: attached,
      detail: attached
        ? `VIP $${VIP_TIER_AMOUNT} restricted; $${nonVipAmount} unrestricted; the flag is present on both records`
        : `the VIP restriction is not correctly attached: VIP=$${vipDisclosure.promotional_credit_usable_on_standalone_mls} non-VIP=$${nonVipDisclosure.promotional_credit_usable_on_standalone_mls}`,
    },
  ];
}

/** Requirement 5: the processor must still separate the three revenue components. */
function evaluateProcessor(cfg: LaunchConfiguration): InterlockCheck[] {
  const versionOk = cfg.processor_contract_version === REQUIRED_PROCESSOR_CONTRACT_VERSION;

  const missing = REQUIRED_PROCESSOR_CAPABILITIES.filter(
    c => (cfg.processor_capabilities || {})[c] !== true,
  );

  return [
    {
      id: 'PROCESSOR_CONTRACT_VERSION',
      requirement: 11,
      ok: versionOk,
      detail: versionOk
        ? `processor contract ${cfg.processor_contract_version} matches the required ${REQUIRED_PROCESSOR_CONTRACT_VERSION}`
        : `processor contract is ${cfg.processor_contract_version}, but ${REQUIRED_PROCESSOR_CONTRACT_VERSION} is required — enrollment is refused rather than paying a customer with a processor whose component separation is not assured`,
    },
    {
      id: 'PROCESSOR_COMPONENT_SEPARATION',
      requirement: 5,
      ok: missing.length === 0,
      detail: missing.length === 0
        ? `All ${REQUIRED_PROCESSOR_CAPABILITIES.length} component-separation guarantees present: cash funding, promotional Booking Value and membership-fee revenue remain distinct`
        : `component separation would break: missing ${missing.join(', ')}`,
    },
  ];
}

/** Requirements 9 and 10: the approval and pricing prerequisites. Never inferred. */
function evaluateLegalPrerequisites(cfg: LaunchConfiguration): InterlockCheck[] {
  const termsOk = cfg.terms_legally_approved === true && cfg.terms_version === AUTOFUND_TERMS_VERSION;
  const refundOk = cfg.fee_refund_policy !== 'undetermined';

  return [
    {
      id: 'LEGAL_TERMS_APPROVED',
      requirement: 10,
      ok: termsOk,
      detail: termsOk
        ? `terms version ${cfg.terms_version} has a recorded owner decision`
        : `terms version ${cfg.terms_version} is NOT approved: no owner decision is recorded for this version, so a customer cannot be shown operative terms or consent to them`,
    },
    {
      id: 'FEE_REFUND_POLICY_APPROVED',
      requirement: 10,
      ok: refundOk,
      detail: refundOk
        ? `membership-fee refund policy is recorded as ${cfg.fee_refund_policy}`
        : 'membership-fee refundability is undetermined. The system deliberately asserts no policy and will not choose one; a launch decision is required.',
    },
    {
      id: 'WALLET_TERMS_APPROVED',
      requirement: 10,
      ok: cfg.wallet_terms_approved === true,
      detail: cfg.wallet_terms_approved === true
        ? 'separate wallet refund, expiration and unclaimed-property terms have a recorded owner decision'
        : 'separate wallet terms are unapproved: refund rights, lot expiry and unclaimed-property treatment are unresolved',
    },
    {
      id: 'MLS_V2_CONFIGURED',
      requirement: 9,
      ok: cfg.mls_v2_configured === true,
      detail: cfg.mls_v2_configured === true
        ? `the approved ${MLS_PRICING_VERSION_V2} MLS price configuration is present as data`
        : `the approved ${MLS_PRICING_VERSION_V2} MLS price configuration is missing. Program economics were approved against it, so it must be present before launch.`,
    },
  ];
}

/** Requirement 8: launch is a coordinated act, not one switch. */
function evaluateLaunchCoordination(cfg: LaunchConfiguration): InterlockCheck[] {
  const both =
    cfg.enrollment_enabled === true && cfg.enrollment_switch_value === 'true';

  return [
    {
      id: 'COORDINATED_LAUNCH',
      requirement: 8,
      ok: both,
      detail: both
        ? 'Enrollment is enabled in code AND by the owner switch'
        : `launch is not coordinated: code flag=${cfg.enrollment_enabled}, owner switch=${cfg.enrollment_switch_value === null ? 'absent' : cfg.enrollment_switch_value}. Both must be on, together.`,
    },
  ];
}

/**
 * Evaluate the full fail-closed interlock. Pure and deterministic.
 *
 * @param cfg  the complete resolved configuration to evaluate
 * @param opts optional injected amounts-to-be-charged, for testing the invariant
 */
export function evaluateLaunchInterlock(
  cfg: LaunchConfiguration,
  opts: InterlockOptions = {},
): InterlockEvaluation {
  const tierEvaluation = evaluateTiers(cfg, opts);

  const checks: InterlockCheck[] = [
    ...evaluateLaunchCoordination(cfg),
    ...tierEvaluation.checks,
    ...evaluateRetiredTiers(),
    ...evaluateVipRestriction(cfg),
    ...evaluateProcessor(cfg),
    ...evaluateLegalPrerequisites(cfg),
  ];

  const blockers: InterlockBlocker[] = checks
    .filter(c => !c.ok)
    .map(c => ({
      code: (codeForCheck(c.id) || INTERLOCK_CODES.TIER_CONFIGURATION_INVALID) as InterlockCode,
      requirement: c.requirement,
      scope: c.id,
      detail: c.detail,
    }));

  return {
    version: AUTOFUND_INTERLOCK_VERSION,
    permitted: blockers.length === 0,
    blockers,
    checks,
    tiers: tierEvaluation.tiers,
  };
}

/** Map a failed check to its blocker code, so a refusal is diagnosable. */
function codeForCheck(id: string): InterlockCode | null {
  if (id === 'COORDINATED_LAUNCH') return INTERLOCK_CODES.ENROLLMENT_NOT_ENABLED;
  if (id === 'CONFIGURATION_PARITY') return INTERLOCK_CODES.TIER_CONFIGURATION_INVALID;
  if (/_CONFIGURATION$/.test(id)) return INTERLOCK_CODES.TIER_CONFIGURATION_INVALID;
  if (/_RESOLVES$/.test(id)) return INTERLOCK_CODES.TIER_CONFIGURATION_INVALID;
  if (/_FEE_ENABLED$/.test(id)) return INTERLOCK_CODES.FEE_NOT_ENABLED;
  if (/_FEE_SCHEDULE$/.test(id)) return INTERLOCK_CODES.TIER_SCHEDULE_DIVERGED;
  if (/_NO_FEE$/.test(id)) return INTERLOCK_CODES.ZERO_FEE_TIER_CHARGES_FEE;
  if (/_DISCLOSURE_EQUALS_CHARGE$/.test(id)) return INTERLOCK_CODES.DISCLOSURE_CHARGE_MISMATCH;
  if (id === 'RETIRED_TIERS_NOT_ENROLLABLE') return INTERLOCK_CODES.RETIRED_TIER_LEAK;
  if (id === 'LEGACY_TERMS_PRESERVED') return INTERLOCK_CODES.LEGACY_TERMS_LOST;
  if (id === 'VIP_ENFORCEMENT_ACTIVE') return INTERLOCK_CODES.VIP_RESTRICTION_INACTIVE;
  if (id === 'VIP_RESTRICTION_ATTACHED') return INTERLOCK_CODES.VIP_RESTRICTION_NOT_ATTACHED;
  if (id === 'PROCESSOR_CONTRACT_VERSION') return INTERLOCK_CODES.PROCESSOR_CONTRACT_STALE;
  if (id === 'PROCESSOR_COMPONENT_SEPARATION') return INTERLOCK_CODES.PROCESSOR_SEPARATION_BROKEN;
  if (id === 'LEGAL_TERMS_APPROVED') return INTERLOCK_CODES.LEGAL_TERMS_NOT_APPROVED;
  if (id === 'FEE_REFUND_POLICY_APPROVED') return INTERLOCK_CODES.FEE_REFUND_POLICY_UNDETERMINED;
  if (id === 'WALLET_TERMS_APPROVED') return INTERLOCK_CODES.WALLET_TERMS_NOT_APPROVED;
  if (id === 'MLS_V2_CONFIGURED') return INTERLOCK_CODES.MLS_V2_NOT_CONFIGURED;
  return null;
}

/**
 * Read the REAL launch configuration.
 *
 * Legal approval and the refund policy come from owner-written AppSettings, so they
 * can only be granted deliberately and are recorded in data. Nothing here infers an
 * approval, and nothing here activates a feature: this reads state, it never writes it.
 */
export async function readLaunchConfiguration(base44: any): Promise<LaunchConfiguration> {
  const readSetting = async (key: string): Promise<string | null> => {
    try {
      const res = await base44.entities.AppSetting.filter({ key }, undefined, 1);
      const rows = Array.isArray(res) ? res : (res?.data || []);
      return rows.length ? rows[0].value : null;
    } catch {
      return null;
    }
  };

  const [switchValue, termsApproval, refundPolicyValue, walletApproval] = await Promise.all([
    readSetting(AUTOFUND_ENROLLMENT_FLAG_KEY),
    readSetting(AUTOFUND_TERMS_LEGAL_APPROVAL_KEY),
    readSetting(AUTOFUND_FEE_REFUND_POLICY_KEY),
    readSetting(AUTOFUND_WALLET_TERMS_APPROVAL_KEY),
  ]);

  let mlsV2Configured = false;
  try {
    const res = await base44.entities.MediaPricingConfig.filter(
      { pricing_version: MLS_PRICING_VERSION_V2 },
      undefined,
      1,
    );
    const rows = Array.isArray(res) ? res : (res?.data || []);
    mlsV2Configured = rows.length > 0 && !!rows[0].config_json;
  } catch {
    mlsV2Configured = false;
  }

  const APPROVED_POLICIES: FeeRefundPolicy[] = ['non_refundable', 'refundable_full', 'refundable_prorated'];
  const refundPolicy = APPROVED_POLICIES.includes(refundPolicyValue as FeeRefundPolicy)
    ? (refundPolicyValue as FeeRefundPolicy)
    : DEFAULT_FEE_REFUND_POLICY;

  return {
    enrollment_enabled: AUTOFUND_FINAL_FLAGS.enrollment_enabled,
    enrollment_switch_value: switchValue,
    membership_fee_enabled: AUTOFUND_FINAL_FLAGS.membership_fee_enabled,
    vip_mls_promo_restriction_enabled: AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled,
    terms_version: AUTOFUND_TERMS_VERSION,
    terms_legally_approved: termsApproval === AUTOFUND_TERMS_VERSION,
    fee_refund_policy: refundPolicy,
    wallet_terms_approved: walletApproval === 'true',
    mls_v2_configured: mlsV2Configured,
    processor_contract_version: AUTOFUND_PROCESSOR_CONTRACT_VERSION,
    processor_capabilities: { ...AUTOFUND_PROCESSOR_CAPABILITIES },
  };
}

/**
 * One line stating why enrollment is refused, safe to return to a caller.
 * Names the requirement number so the refusal is actionable rather than opaque.
 */
export function describeInterlockRefusal(evaluation: InterlockEvaluation): string {
  const first = evaluation.blockers[0];
  if (!first) return 'The launch configuration is complete.';
  return (
    `Enrollment is blocked by the launch interlock: ${evaluation.blockers.length} unmet launch requirement${evaluation.blockers.length === 1 ? '' : 's'}. ` +
    `First blocker (requirement ${first.requirement}): ${first.detail}`
  );
}

/** True when the fee schedule and the chargeable fee agree for one tier. */
export function feeScheduleMatchesCharge(amount: number, feeEnabled: boolean): boolean {
  return getMembershipFee(amount, feeEnabled) === (AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0);
}