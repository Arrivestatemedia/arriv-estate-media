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
 * FINANCIAL BASIS (see designAutoFundMlsAllowances / AUTOFUND_MLS_HYBRID_MODEL.md):
 *   target 10% lifetime contribution margin. Allowances below are the largest that
 *   hold that target across all tested customer profiles at the approved tier
 *   promotional bonuses.
 */

import {
  getAutoFundConfig,
  getPriceForSqft,
  AUTO_FUND_AMOUNT_OPTIONS,
  round2,
} from './prepaidEngine.ts';

export const MLS_ALLOWANCE_RULES_VERSION = 'mls_hybrid_v1_20261011';

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

// ── Canonical service unit economics ────────────────────────────────────────
export const MLS_RETAIL = 100;
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
  if (n === 0) {
    return `Your ${tierAmount === 1000 ? 'VIP ' : ''}$${tierAmount}/month Auto-Fund plan applies promotional Booking Value to qualifying bundles. Standalone MLS Walkthroughs are purchased with cash-funded Booking Value or by direct payment.`;
  }
  return `Your $${tierAmount}/month Auto-Fund plan includes ${n} standalone MLS Walkthrough${n === 1 ? '' : 's'} per billing cycle that may use promotional Booking Value. Unlimited further MLS Walkthroughs are available with cash-funded Booking Value or by direct payment.`;
}