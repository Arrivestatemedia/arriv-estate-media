/**
 * Arriv Auto-Fund — MLS Walkthrough Promotional Allowance (HYBRID MODEL).
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - the monthly standalone MLS promotional allowance per Auto-Fund tier,
 *   - qualifying-bundle economics,
 *   - promotional-vs-cash-funded redemption eligibility at checkout.
 *
 * HYBRID MODEL
 *   1. Each tier gets a monthly allowance of standalone MLS Walkthroughs that may
 *      use promotional Booking Value. It resets each cycle and never accumulates.
 *   2. Qualifying bundles (MLS + a meaningful non-MLS service) remain eligible for
 *      promotional Booking Value without consuming the standalone allowance.
 *   3. Cash-funded Booking Value is unrestricted for MLS Walkthroughs.
 *   4. Direct payment is always available.
 *
 * The allowance is NOT a cap on how many MLS Walkthroughs a customer may book —
 * only on how many standalone bookings may draw on promotional Booking Value.
 *
 * REDEMPTION MECHANICS — FULL MLS CREDIT REDEMPTION (owner correction, 2026-10-11)
 *   The allowance is a BOOKING-COUNT limit only. It is NOT a dollar-value limit.
 *   For every standalone MLS Walkthrough inside the allowance the FULL walkthrough
 *   price may be covered by Booking Value including promotional bonus credits —
 *   up to 100%. There are NO promotional-dollar caps, NO percentage caps, NO
 *   minimum cash contribution and NO mandatory split payment. One eligible
 *   standalone walkthrough consumes one allowance unit when promotional credits
 *   are used. Beyond the allowance the customer may keep booking standalone MLS
 *   Walkthroughs with cash-funded Booking Value, additional deposits, or direct
 *   payment.
 *
 * FINANCIAL BASIS (see designAutoFundMlsAllowances /
 * AUTOFUND_MLS_FULL_REDEMPTION_MODEL.md):
 *   target 10% LIFETIME contribution margin. Every tier's allowance is derived on
 *   full redemption: the full monthly allowance is used on standalone MLS, ALL
 *   remaining promotional Booking Value is redeemed through qualifying bundles,
 *   and all cash-funded Booking Value is redeemed over the lifetime. Allowances in
 *   MLS_PROMOTIONAL_ALLOWANCE are the largest that hold that target — see
 *   MLS_ALLOWANCE_DERIVATION for each tier's binding constraint. No zero is
 *   assigned silently: every zero carries its reason and its exact annual
 *   shortfall.
 */

import {
  getAutoFundConfig,
  getPriceForSqft,
  AUTO_FUND_AMOUNT_OPTIONS,
  round2,
} from './prepaidEngine.ts';
import { MLS_PRICE_STANDARD_APPROVED, MLS_PRICE_STANDARD_LIVE } from './mlsPricing.ts';

export const MLS_ALLOWANCE_RULES_VERSION = 'mls_full_redemption_v2_20261011';

/** Feature flag key in the AppSetting entity. Distinct from `prepaid_enabled`. */
export const MLS_ALLOWANCE_FEATURE_FLAG_KEY = 'mls_promotional_allowance_enabled';

/**
 * No booking-count cap. A tier set to this value may apply promotional Booking
 * Value to a standalone MLS Walkthrough without a monthly count limit — the
 * customer's available balance is the only bound.
 */
export const MLS_NO_COUNT_CAP = -1;

/**
 * Standalone MLS promotional policy per Auto-Fund tier.
 *
 * FINAL APPROVED FIVE-TIER STRUCTURE — there is NO booking-count allowance at any
 * tier. Starter, Growth, Professional and Premier may apply promotional Booking
 * Value to a standalone MLS Walkthrough with no count cap, no dollar cap and no
 * required cash split. VIP promotional Booking Value may NOT pay for a standalone
 * MLS Walkthrough; VIP cash-funded Booking Value remains fully usable there.
 */
export const MLS_PROMOTIONAL_ALLOWANCE: Record<number, number> = {
  150: MLS_NO_COUNT_CAP,
  250: MLS_NO_COUNT_CAP,
  350: MLS_NO_COUNT_CAP,
  500: MLS_NO_COUNT_CAP,
  1000: 0, // VIP — promotional credit is barred from standalone MLS Walkthroughs
};

export function getMlsPromotionalAllowance(tierAmount: number): number {
  return MLS_PROMOTIONAL_ALLOWANCE[tierAmount] ?? 0;
}

/** True when the tier places no monthly count limit on promotional MLS spend. */
export function isMlsAllowanceUncapped(tierAmount: number): boolean {
  return getMlsPromotionalAllowance(tierAmount) === MLS_NO_COUNT_CAP;
}

// ── Full-redemption mechanics ────────────────────────────────────────────────
/**
 * A standalone MLS Walkthrough inside the allowance may be paid in full from
 * available Booking Value, promotional bonus credits included. There is no
 * dollar cap, no percentage cap, no minimum cash contribution and no mandatory
 * split payment. When the promotional balance does not cover the whole price,
 * cash-funded Booking Value covers the remainder — the customer is never
 * required to split, and never blocked for doing so.
 */
export const MLS_PROMOTIONAL_COVERAGE_PCT = 100;
/** The approved structure is balance-governed, NOT count-governed. */
export const MLS_ALLOWANCE_IS_BOOKING_COUNT_ONLY = false;
export const MLS_ALLOWANCE_MECHANICS = {
  coverage_pct_of_walkthrough_price: MLS_PROMOTIONAL_COVERAGE_PCT,
  monthly_booking_count_cap: null,
  dollar_value_cap: null,
  percentage_cap: null,
  minimum_cash_contribution: null,
  mandatory_split_payment: false,
  consumption_rule: 'no monthly count is consumed — promotional spend on a standalone walkthrough is limited only by the available balance (non-VIP tiers)',
} as const;

/**
 * Per-tier derivation. A zero allowance is NEVER silent — it carries the binding
 * constraint and, where the tier's own economics fall short, the exact annual
 * shortfall against the 10% lifetime target.
 */
export type MlsAllowanceReason =
  | 'NO_PROMOTIONAL_CREDITS'
  | 'POOL_LIMITED'
  | 'ALLOWANCE_HEADROOM_EXHAUSTED'
  | 'BASELINE_BELOW_TARGET'
  | 'VIP_PROMO_BARRED_FROM_STANDALONE_MLS';

export interface MlsAllowanceDerivation {
  max_sustainable_allowance: number | null;
  allowance_binds: boolean;
  reason: MlsAllowanceReason;
  lifetime_margin_at_allowance_1_pct: number | null;
  annual_shortfall_at_allowance_1: number | null;
  note: string;
}

export const MLS_ALLOWANCE_DERIVATION: Record<number, MlsAllowanceDerivation> = {
  150: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'POOL_LIMITED',
    lifetime_margin_at_allowance_1_pct: null, annual_shortfall_at_allowance_1: null,
    note: 'No count cap. The $7.50/month promotional pool ($90/year) is the only bound — promotional spend is governed by the balance, never by a count.',
  },
  250: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'POOL_LIMITED',
    lifetime_margin_at_allowance_1_pct: null, annual_shortfall_at_allowance_1: null,
    note: 'No count cap. The $25/month promotional pool ($300/year) is the only bound.',
  },
  350: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'POOL_LIMITED',
    lifetime_margin_at_allowance_1_pct: null, annual_shortfall_at_allowance_1: null,
    note: 'No count cap. Promotional exposure is bounded by the $630/year bonus pool, offset by the $25/month membership fee, which is collected revenue and not spendable Booking Value. Certified against the approved planning assumptions.',
  },
  500: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'POOL_LIMITED',
    lifetime_margin_at_allowance_1_pct: null, annual_shortfall_at_allowance_1: null,
    note: 'No count cap. Promotional exposure is bounded by the $1,200/year bonus pool, offset by the $25/month membership fee. Certified against the approved planning assumptions.',
  },
  1000: {
    max_sustainable_allowance: 0, allowance_binds: true, reason: 'VIP_PROMO_BARRED_FROM_STANDALONE_MLS',
    lifetime_margin_at_allowance_1_pct: null, annual_shortfall_at_allowance_1: null,
    note: 'VIP promotional Booking Value may not pay for a standalone MLS Walkthrough. Enforced at the booking transaction against the promotional credit lot, never by a count. VIP cash-funded Booking Value remains fully usable there.',
  },
};

// ── Canonical service unit economics ────────────────────────────────────────
// Single-sourced from mlsPricing.ts. The Auto-Fund program is valued against the
// OWNER-APPROVED price, so bundle-margin and disclosure math use $120. The live
// retail price stays $100 until the owner activates the V2 pricing config.
export const MLS_RETAIL = MLS_PRICE_STANDARD_APPROVED;
/** The price that remains live for retail customers until V2 is activated. */
export const MLS_RETAIL_LIVE = MLS_PRICE_STANDARD_LIVE;
export const MLS_PAYOUT = 50;
// Owner-approved planning assumption (2026-10-10): $18/hour x 60 active minutes
// = $18.00 editing labour, plus 15% employer payroll burden ($2.70) and $5.00
// quality control = $25.70 combined editing and QC cost per Walkthrough.
// Previously $20.00, which understated fulfilment cost in the bundle guard.
export const MLS_EDITING = 25.70;
const SPECIALIST_PAYOUT_RATE = 0.34;
const EDITING_COST_OTHER: Record<string, number> = { essentials: 50, cinematic: 100, premium: 150 };

/** Bundle qualification thresholds (verified against catalog unit economics). */
export const BUNDLE_MIN_NON_MLS_RETAIL = 150;
export const BUNDLE_MIN_MARGIN_PCT = 35;

export interface CartItem {
  /** Canonical package id: mls | essentials | cinematic | premium | add-on id. */
  pkg: string;
  sqft?: number;
  /** Explicit retail value for add-ons / custom line items. */
  retail_override?: number;
  /** Explicit fulfilment cost for add-ons / custom line items. */
  cost_override?: number;
}

export interface CartEvaluation {
  retail: number;
  cost: number;
  margin_pct: number;
  mls_count: number;
  non_mls_retail: number;
  qualifies_for_promo: boolean;
  reason: string;
}

function unitEconomics(item: CartItem): { retail: number; cost: number } {
  if (item.retail_override !== undefined) {
    return { retail: round2(item.retail_override), cost: round2(item.cost_override ?? 0) };
  }
  if (item.pkg === 'mls') return { retail: MLS_RETAIL, cost: MLS_PAYOUT + MLS_EDITING };
  const sqft = item.sqft ?? 0;
  const retail = getPriceForSqft(sqft, item.pkg as any);
  if (retail === null || retail === undefined) return { retail: 0, cost: 0 };
  const editing = item.pkg === 'premium' ? 150 : (EDITING_COST_OTHER[item.pkg] || 0);
  return { retail, cost: round2(retail * SPECIALIST_PAYOUT_RATE + editing) };
}

/**
 * Evaluate a cart's promotional-bundle eligibility.
 * Qualifies only when it contains at least one MLS Walkthrough, at least one
 * non-MLS service with retail value of $150 or more, and a blended contribution
 * margin of at least 35%. A nominal or inexpensive add-on never qualifies.
 */
export function evaluateCart(items: CartItem[]): CartEvaluation {
  let retail = 0, cost = 0, mlsCount = 0, nonMlsRetail = 0;
  for (const it of items) {
    const u = unitEconomics(it);
    retail += u.retail;
    cost += u.cost;
    if (it.pkg === 'mls') mlsCount += 1;
    else nonMlsRetail += u.retail;
  }
  retail = round2(retail);
  cost = round2(cost);
  const marginPct = retail > 0 ? round2(((retail - cost) / retail) * 100) : 0;

  let qualifies = false;
  let reason = '';
  if (mlsCount < 1) {
    reason = 'No MLS Walkthrough in this cart — bundle eligibility does not apply.';
  } else if (nonMlsRetail < BUNDLE_MIN_NON_MLS_RETAIL) {
    reason = `A qualifying bundle needs at least $${BUNDLE_MIN_NON_MLS_RETAIL} of non-MLS services. This cart has $${round2(nonMlsRetail)}.`;
  } else if (marginPct < BUNDLE_MIN_MARGIN_PCT) {
    reason = `Blended margin ${marginPct}% is below the required ${BUNDLE_MIN_MARGIN_PCT}%.`;
  } else {
    qualifies = true;
    reason = 'Qualifying bundle — promotional Booking Value may be applied.';
  }
  return {
    retail,
    cost,
    margin_pct: marginPct,
    mls_count: mlsCount,
    non_mls_retail: round2(nonMlsRetail),
    qualifies_for_promo: qualifies,
    reason,
  };
}

export interface PromoEligibilityInput {
  tier_amount: number;
  items: CartItem[];
  is_standalone_mls: boolean;
  allowance_used_this_cycle: number;
}

export interface PromoEligibilityResult {
  promo_eligible: boolean;
  consumes_allowance: boolean;
  reason: string;
  allowance_granted: number;
  allowance_remaining: number;
  /** False when the tier places no monthly count limit on promotional MLS spend. */
  count_capped: boolean;
}

/**
 * Resolve whether a cart may draw on promotional Booking Value.
 *
 *   - A qualifying bundle is always promotional-eligible and never consumes the
 *     standalone allowance.
 *   - A standalone MLS Walkthrough is promotional-eligible only while the monthly
 *     allowance remains.
 *   - Anything else (non-MLS services) is eligible without consuming an allowance;
 *     promotional Booking Value is never restrictable outside standalone MLS.
 */
export function resolveMlsPromoEligibility(input: PromoEligibilityInput): PromoEligibilityResult {
  const allowance = getMlsPromotionalAllowance(input.tier_amount);
  const uncapped = allowance === MLS_NO_COUNT_CAP;
  const remaining = uncapped ? 0 : Math.max(0, allowance - input.allowance_used_this_cycle);
  const count_capped = !uncapped;

  // Cash-funded Booking Value is always unrestricted — this resolver only governs
  // the PROMOTIONAL portion, so a non-MLS cart is eligible with no allowance cost.
  if (!input.is_standalone_mls) {
    const evaln = evaluateCart(input.items);
    if (evaln.mls_count >= 1 && evaln.qualifies_for_promo) {
      return {
        promo_eligible: true, consumes_allowance: false,
        reason: evaln.reason, allowance_granted: allowance, allowance_remaining: remaining, count_capped,
      };
    }
    return {
      promo_eligible: true, consumes_allowance: false,
      reason: 'Non-standalone-MLS purchase — promotional Booking Value applies without an allowance.',
      allowance_granted: allowance, allowance_remaining: remaining, count_capped,
    };
  }

  // Non-VIP tiers carry NO monthly count cap on promotional standalone MLS spend.
  if (uncapped) {
    return {
      promo_eligible: true, consumes_allowance: false,
      reason: 'Promotional Booking Value may be applied to this standalone MLS Walkthrough. There is no monthly booking-count cap — the available balance is the only limit.',
      allowance_granted: allowance, allowance_remaining: remaining, count_capped: false,
    };
  }

  if (remaining > 0) {
    return {
      promo_eligible: true, consumes_allowance: true,
      reason: `Standalone MLS Walkthrough within the monthly promotional allowance (${remaining} remaining).`,
      allowance_granted: allowance, allowance_remaining: remaining, count_capped: true,
    };
  }

  return {
    promo_eligible: false, consumes_allowance: false,
    reason: 'VIP promotional Booking Value cannot be used on a standalone MLS Walkthrough. Use cash-funded Booking Value, add funds, pay directly, or build a qualifying bundle that includes eligible photography, video or a premium package.',
    allowance_granted: allowance, allowance_remaining: 0, count_capped: true,
  };
}

/** Tier options whose promotional credit may be applied to a standalone MLS Walkthrough. */
export function tiersWithMlsAllowance(): number[] {
  return AUTO_FUND_AMOUNT_OPTIONS.filter(t => getMlsPromotionalAllowance(t) !== 0);
}

/** Human-readable allowance summary for disclosure copy. */
export function describeAllowance(tierAmount: number): string {
  const config = getAutoFundConfig(tierAmount);
  if (!config) return 'No Auto-Fund tier configured.';
  const label = config.tier_name ? `${config.tier_name} ` : '';
  if (config.bonus_booking_value === 0) {
    return `Your ${label}$${tierAmount}/month Auto-Fund plan includes no promotional Booking Value. Standalone MLS Walkthroughs are purchased with cash-funded Booking Value, additional deposits, or direct payment. Unlimited MLS Walkthroughs are always available.`;
  }
  if (isMlsAllowanceUncapped(tierAmount)) {
    return `Your ${label}$${tierAmount}/month Auto-Fund plan may apply promotional Booking Value to a standalone MLS Walkthrough IN FULL — up to the entire walkthrough price — with no monthly booking-count cap. Your cash-funded Booking Value tops up automatically when the promotional balance does not cover the whole price; you are never required to split the payment.`;
  }
  return `Your ${label}$${tierAmount}/month Auto-Fund plan applies promotional Booking Value to eligible photography, video, premium packages and qualifying genuine bundles. VIP promotional Booking Value cannot be used on a standalone MLS Walkthrough. Your cash-funded Booking Value can be used on anything, including standalone MLS Walkthroughs, with no monthly booking-count cap.`;
}