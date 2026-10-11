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

export const MLS_ALLOWANCE_RULES_VERSION = 'mls_full_redemption_v2_20261011';

/** Feature flag key in the AppSetting entity. Distinct from `prepaid_enabled`. */
export const MLS_ALLOWANCE_FEATURE_FLAG_KEY = 'mls_promotional_allowance_enabled';

/**
 * Monthly standalone MLS promotional allowance per Auto-Fund tier.
 * Derived from the profitability model — see the report for the derivation.
 */
export const MLS_PROMOTIONAL_ALLOWANCE: Record<number, number> = {
  50: 0,   // no promotional Booking Value exists at this tier
  100: 1,  // $5/month bonus — too small to fund a $100 booking in one cycle
  200: 1,  // $20/month bonus — negligible impact (verified 11.4% margin floor)
  350: 0,  // any promotional redemption on standalone MLS breaches the target
  500: 0,  // any promotional redemption on standalone MLS breaches the target
  1000: 0, // any promotional redemption on standalone MLS breaches the target
};

export function getMlsPromotionalAllowance(tierAmount: number): number {
  return MLS_PROMOTIONAL_ALLOWANCE[tierAmount] ?? 0;
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
export const MLS_ALLOWANCE_IS_BOOKING_COUNT_ONLY = true;
export const MLS_ALLOWANCE_MECHANICS = {
  coverage_pct_of_walkthrough_price: MLS_PROMOTIONAL_COVERAGE_PCT,
  dollar_value_cap: null,
  percentage_cap: null,
  minimum_cash_contribution: null,
  mandatory_split_payment: false,
  consumption_rule: 'one eligible standalone walkthrough consumes one monthly allowance unit when promotional credits are used',
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
  | 'BASELINE_BELOW_TARGET';

export interface MlsAllowanceDerivation {
  max_sustainable_allowance: number | null;
  allowance_binds: boolean;
  reason: MlsAllowanceReason;
  lifetime_margin_at_allowance_1_pct: number | null;
  annual_shortfall_at_allowance_1: number | null;
  note: string;
}

export const MLS_ALLOWANCE_DERIVATION: Record<number, MlsAllowanceDerivation> = {
  50: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'NO_PROMOTIONAL_CREDITS',
    lifetime_margin_at_allowance_1_pct: null, annual_shortfall_at_allowance_1: null,
    note: 'This tier grants no promotional Booking Value, so no walkthrough can ever be promotional-funded. The allowance is not the constraint.',
  },
  100: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'POOL_LIMITED',
    lifetime_margin_at_allowance_1_pct: 14.72, annual_shortfall_at_allowance_1: null,
    note: 'Financially safe at any allowance — the $5/month promotional pool ($60/year) is the real constraint, not the count. Verified 14.72% lifetime margin with the full pool spent on standalone MLS.',
  },
  200: {
    max_sustainable_allowance: null, allowance_binds: false, reason: 'POOL_LIMITED',
    lifetime_margin_at_allowance_1_pct: 11.37, annual_shortfall_at_allowance_1: null,
    note: 'Financially safe at any allowance — the $20/month promotional pool ($240/year) is the real constraint. Verified 11.37% lifetime margin with the full pool spent on standalone MLS.',
  },
  350: {
    max_sustainable_allowance: 0, allowance_binds: true, reason: 'ALLOWANCE_HEADROOM_EXHAUSTED',
    lifetime_margin_at_allowance_1_pct: 7.93, annual_shortfall_at_allowance_1: 86.9,
    note: 'Baseline clears the target at 10.30% with only $12.42 of annual headroom. Moving the $630/year promotional pool onto standalone MLS adds $99.32 of delivery cost, taking the margin to 7.93% — $86.90 below target. Owner decision required.',
  },
  500: {
    max_sustainable_allowance: 0, allowance_binds: true, reason: 'BASELINE_BELOW_TARGET',
    lifetime_margin_at_allowance_1_pct: 4.46, annual_shortfall_at_allowance_1: 332.6,
    note: 'Below target even at a zero allowance (7.61%, $143.42 short per year) — the shortfall is the 20% promotional bonus meeting the 30% MLS margin, not the allowance. At an allowance of 1 the margin is 4.46%, $332.60 below target. Owner decision required.',
  },
  1000: {
    max_sustainable_allowance: 0, allowance_binds: true, reason: 'BASELINE_BELOW_TARGET',
    lifetime_margin_at_allowance_1_pct: 0.25, annual_shortfall_at_allowance_1: 1169.84,
    note: 'Below target even at a zero allowance (1.83%, $980.66 short per year). At an allowance of 1 the margin is 0.25%, $1,169.84 below target. The VIP tier only clears the target when cash-funded value is also redeemed through bundles (17.59%). Owner decision required.',
  },
};

// ── Canonical service unit economics ────────────────────────────────────────
// Owner-approved standard MLS Walkthrough price, 2026-10-10, is $120 (V2). The
// Auto-Fund program is valued against the approved price, so bundle-margin and
// disclosure math use $120. The live retail price remains governed by the active
// MediaPricingConfig record until the owner activates the V2 config.
export const MLS_RETAIL = 120;
/** The price that remains live for retail customers until V2 is activated. */
export const MLS_RETAIL_LIVE = 100;
export const MLS_PAYOUT = 50;
export const MLS_EDITING = 20;
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
  const remaining = Math.max(0, allowance - input.allowance_used_this_cycle);

  // Cash-funded Booking Value is always unrestricted — this resolver only governs
  // the PROMOTIONAL portion, so a non-MLS cart is eligible with no allowance cost.
  if (!input.is_standalone_mls) {
    const evaln = evaluateCart(input.items);
    if (evaln.mls_count >= 1 && evaln.qualifies_for_promo) {
      return {
        promo_eligible: true, consumes_allowance: false,
        reason: evaln.reason, allowance_granted: allowance, allowance_remaining: remaining,
      };
    }
    return {
      promo_eligible: true, consumes_allowance: false,
      reason: 'Non-standalone-MLS purchase — promotional Booking Value applies without an allowance.',
      allowance_granted: allowance, allowance_remaining: remaining,
    };
  }

  if (remaining > 0) {
    return {
      promo_eligible: true, consumes_allowance: true,
      reason: `Standalone MLS Walkthrough within the monthly promotional allowance (${remaining} remaining).`,
      allowance_granted: allowance, allowance_remaining: remaining,
    };
  }

  return {
    promo_eligible: false, consumes_allowance: false,
    reason: 'Monthly MLS promotional allowance is exhausted. Build a qualifying bundle, add funds, or pay directly to continue.',
    allowance_granted: allowance, allowance_remaining: 0,
  };
}

/** Tier options that carry any standalone MLS promotional allowance. */
export function tiersWithMlsAllowance(): number[] {
  return AUTO_FUND_AMOUNT_OPTIONS.filter(t => getMlsPromotionalAllowance(t) > 0);
}

/** Human-readable allowance summary for disclosure copy. */
export function describeAllowance(tierAmount: number): string {
  const n = getMlsPromotionalAllowance(tierAmount);
  const config = getAutoFundConfig(tierAmount);
  if (!config) return 'No Auto-Fund tier configured.';
  if (config.bonus_booking_value === 0) {
    return `Your $${tierAmount}/month Auto-Fund plan includes no promotional Booking Value. Standalone MLS Walkthroughs are purchased with cash-funded Booking Value, additional deposits, or direct payment. Unlimited MLS Walkthroughs are always available.`;
  }
  if (n === 0) {
    return `Your ${tierAmount === 1000 ? 'VIP ' : ''}$${tierAmount}/month Auto-Fund plan applies promotional Booking Value to qualifying bundles. Standalone MLS Walkthroughs are purchased with cash-funded Booking Value, additional deposits, or direct payment. Unlimited MLS Walkthroughs are always available.`;
  }
  return `Your $${tierAmount}/month Auto-Fund plan includes ${n} standalone MLS Walkthrough${n === 1 ? '' : 's'} per billing cycle that may be paid IN FULL — up to the entire walkthrough price — with your available Booking Value, including promotional bonus credits. If your promotional balance does not cover the whole price, your cash-funded Booking Value tops it up automatically; you are never required to split the payment. Unlimited further MLS Walkthroughs are available with cash-funded Booking Value, additional deposits, or by direct payment.`;
}