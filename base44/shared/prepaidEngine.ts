/**
 * Arriv Prepaid Engine — canonical tier definitions, credit math, FIFO consumption,
 * and commission calculation for the Arriv Estate Media Prepaid system.
 *
 * This module is the SINGLE SOURCE OF TRUTH for prepaid tier configuration,
 * credit-to-booking-value conversion, and FIFO credit consumption logic.
 *
 * Ownership boundary: Estate Media owns prepaid pricing, credits, wallet,
 * expiration, redemption, and commission calculation. Arriv Pay owns payroll
 * treatment. This engine calculates commissions; it does NOT deliver them.
 */

// ┌────────────────────────────────────────────────────────────────────────────
// CANONICAL CONSTANTS
// └────────────────────────────────────────────────────────────────────────────

/** 1 credit = $275 of standard retail booking value. Canonical conversion. */
export const PREPAID_CREDIT_VALUE = 275;

/** Feature flag key in AppSetting entity. */
export const PREPAID_FEATURE_FLAG_KEY = "prepaid_enabled";

// ┌────────────────────────────────────────────────────────────────────────────
// PREPAID TIER CONFIGURATION — canonical, authoritative
// └────────────────────────────────────────────────────────────────────────────

export interface PrepaidTierConfig {
  tier: string;
  cash_price: number;
  credits: number;
  booking_value: number;
  validity_months: number;
  support_tier: string;
  benefits: string[];
  promotional_benefits_per_cycle: number;
  priority_booking: boolean;
  priority_processing: boolean;
}

export const PREPAID_TIERS: Record<string, PrepaidTierConfig> = {
  STARTER: {
    tier: "STARTER",
    cash_price: 500,
    credits: 2.0,
    booking_value: 550,
    validity_months: 12,
    support_tier: "PREPAID_STARTER",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Customer 360-aware Arriv Assist",
    ],
    promotional_benefits_per_cycle: 0,
    priority_booking: false,
    priority_processing: false,
  },
  PRO: {
    tier: "PRO",
    cash_price: 1000,
    credits: 4.0,
    booking_value: 1100,
    validity_months: 12,
    support_tier: "PREPAID_PRO",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Priority Booking",
      "Priority Arriv Assist routing",
      "Priority human-support escalation",
    ],
    promotional_benefits_per_cycle: 0,
    priority_booking: true,
    priority_processing: false,
  },
  PREMIER: {
    tier: "PREMIER",
    cash_price: 2500,
    credits: 10.0,
    booking_value: 2750,
    validity_months: 15,
    support_tier: "PREPAID_PREMIER",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Priority Booking",
      "Priority Processing when capacity allows",
      "Priority Arriv Assist",
      "Higher-priority human escalation",
      "Eligible early access",
      "1 promotional Add-On Benefit per prepaid cycle",
    ],
    promotional_benefits_per_cycle: 1,
    priority_booking: true,
    priority_processing: true,
  },
  ELITE: {
    tier: "ELITE",
    cash_price: 5000,
    credits: 20.0,
    booking_value: 5500,
    validity_months: 18,
    support_tier: "PREPAID_ELITE",
    benefits: [
      "10% additional booking value",
      "Customer 360 Arriv Wallet",
      "Qualifying free rescheduling",
      "Highest prepaid Priority Booking",
      "Priority Processing when capacity allows",
      "VIP Arriv Assist routing",
      "Highest prepaid human-support priority",
      "Eligible early access",
      "2 promotional Add-On Benefits per prepaid cycle",
    ],
    promotional_benefits_per_cycle: 2,
    priority_booking: true,
    priority_processing: true,
  },
};

export function getTierConfig(tier: string): PrepaidTierConfig | null {
  return PREPAID_TIERS[tier] || null;
}

export function getAllTierKeys(): string[] {
  return Object.keys(PREPAID_TIERS);
}

// ┌────────────────────────────────────────────────────────────────────────────
// CREDIT MATH
// └────────────────────────────────────────────────────────────────────────────

/**
 * Convert a canonical retail dollar price to required credits.
 * Dollar price is determined FIRST, conversion to credits is SECOND.
 * Never reverse-engineer retail pricing from credits.
 */
export function creditsRequiredForPrice(retailPrice: number): number {
  return retailPrice / PREPAID_CREDIT_VALUE;
}

/** Convert credits to booking value (display). */
export function bookingValueForCredits(credits: number): number {
  return Math.round(credits * PREPAID_CREDIT_VALUE * 100) / 100;
}

/** Round to 2 decimal places for currency/credit precision. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Convert dollars to integer cents (authoritative — no floating-point loss). */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Convert integer cents to dollars (display only). */
export function fromCents(cents: number): number {
  return round2(cents / 100);
}

/** Convert integer cents to credits (display only). 1 credit = 27500 cents. */
export function creditsFromCents(cents: number): number {
  return round2(cents / (PREPAID_CREDIT_VALUE * 100));
}

/** Convert credits to integer cents (for display-derived amounts). */
export function centsFromCredits(credits: number): number {
  return Math.round(credits * PREPAID_CREDIT_VALUE * 100);
}

// ┌────────────────────────────────────────────────────────────────────────────
// COMMISSION CALCULATION
// └────────────────────────────────────────────────────────────────────────────

/**
 * Calculate prepaid Sales Growth Advisor commission.
 * 10% of actual prepaid cash collected.
 * No additional booking commission when credits are redeemed (prevents stacking).
 */
export function calculatePrepaidCommission(cashCollected: number): number {
  return round2(cashCollected * 0.10);
}

// ┌────────────────────────────────────────────────────────────────────────────
// FIFO CREDIT CONSUMPTION
// └────────────────────────────────────────────────────────────────────────────

export interface CreditLotLike {
  lot_id: string;
  credits_remaining: number;
  fifo_order: number;
  expired: boolean;
  expires_at: string;
}

export interface ConsumptionEntry {
  lot_id: string;
  credits: number;
  booking_value: number;
}

export interface ConsumptionResult {
  consumption: ConsumptionEntry[];
  credits_shortfall: number;
  total_consumed: number;
  booking_value_consumed: number;
}

/**
 * Consume credits from lots using FIFO (oldest eligible first).
 * Eligible = not expired, credits_remaining > 0, not past expiry date.
 * Does NOT mutate input lots — returns a consumption plan.
 */
export function consumeFIFO(lots: CreditLotLike[], creditsNeeded: number): ConsumptionResult {
  const now = new Date().toISOString();
  const eligible = lots
    .filter(l => !l.expired && l.credits_remaining > 0 && new Date(l.expires_at) > new Date(now))
    .sort((a, b) => (a.fifo_order || 0) - (b.fifo_order || 0));

  const consumption: ConsumptionEntry[] = [];
  let remaining = creditsNeeded;
  let totalConsumed = 0;
  let bookingValueConsumed = 0;

  for (const lot of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(lot.credits_remaining, remaining);
    if (take <= 0) continue;
    const bv = bookingValueForCredits(take);
    consumption.push({ lot_id: lot.lot_id, credits: take, booking_value: bv });
    remaining -= take;
    totalConsumed += take;
    bookingValueConsumed += bv;
  }

  return {
    consumption,
    credits_shortfall: round2(Math.max(0, remaining)),
    total_consumed: round2(totalConsumed),
    booking_value_consumed: round2(bookingValueConsumed),
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// FIFO CREDIT CONSUMPTION — INTEGER CENTS (authoritative, no precision loss)
// └────────────────────────────────────────────────────────────────────────────

export interface CreditLotCentsLike {
  lot_id: string;
  booking_value_remaining_cents: number;
  fifo_order: number;
  expired: boolean;
  expires_at: string;
}

export interface ConsumptionEntryCents {
  lot_id: string;
  booking_value_cents: number;
  credits: number;
  booking_value: number;
}

export interface ConsumptionResultCents {
  consumption: ConsumptionEntryCents[];
  booking_value_shortfall_cents: number;
  total_consumed_cents: number;
  total_consumed: number;
  booking_value_consumed: number;
  credits_consumed: number;
}

/**
 * Consume booking value from lots using FIFO (oldest eligible first).
 * Works in INTEGER CENTS — no floating-point precision loss.
 * Eligible = not expired, booking_value_remaining_cents > 0, not past expiry date.
 * Does NOT mutate input lots — returns a consumption plan.
 *
 * Falls back to booking_value_remaining * 100 when booking_value_remaining_cents
 * is missing (legacy lots created before the cents migration).
 */
export function consumeFIFOCents(lots: CreditLotCentsLike[], centsNeeded: number): ConsumptionResultCents {
  const now = new Date().toISOString();
  const eligible = lots
    .filter(l => {
      const remaining = l.booking_value_remaining_cents ?? Math.round((l as any).booking_value_remaining * 100);
      return !l.expired && remaining > 0 && new Date(l.expires_at) > new Date(now);
    })
    .sort((a, b) => (a.fifo_order || 0) - (b.fifo_order || 0));

  const consumption: ConsumptionEntryCents[] = [];
  let remaining = Math.round(centsNeeded);
  let totalConsumedCents = 0;

  for (const lot of eligible) {
    if (remaining <= 0) break;
    const lotRemaining = lot.booking_value_remaining_cents ?? Math.round((lot as any).booking_value_remaining * 100);
    const take = Math.min(lotRemaining, remaining);
    if (take <= 0) continue;
    const credits = take / (PREPAID_CREDIT_VALUE * 100);
    consumption.push({
      lot_id: lot.lot_id,
      booking_value_cents: take,
      credits: round2(credits),
      booking_value: fromCents(take),
    });
    remaining -= take;
    totalConsumedCents += take;
  }

  return {
    consumption,
    booking_value_shortfall_cents: Math.max(0, remaining),
    total_consumed_cents: totalConsumedCents,
    total_consumed: fromCents(totalConsumedCents),
    booking_value_consumed: fromCents(totalConsumedCents),
    credits_consumed: round2(totalConsumedCents / (PREPAID_CREDIT_VALUE * 100)),
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// DATE UTILITIES
// └────────────────────────────────────────────────────────────────────────────

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

// ┌────────────────────────────────────────────────────────────────────────────
// CANONICAL SQUARE-FOOTAGE PRICING (preserved — prepaid honors sqft)
// └────────────────────────────────────────────────────────────────────────────

export interface SqftTier {
  label: string;
  min: number;
  max: number;
  mls: number | null;
  essentials: number | null;
  cinematic: number | null;
  premium: number | null;
}

export const SQFT_PRICING: SqftTier[] = [
  { label: "≤2,500", min: 0, max: 2500, mls: MLS_PRICE_V1_BY_TIER.TIER_1, essentials: 275, cinematic: 475, premium: 675 },
  { label: "2,501–3,500", min: 2501, max: 3500, mls: MLS_PRICE_V1_BY_TIER.TIER_2, essentials: 325, cinematic: 525, premium: 750 },
  { label: "3,501–5,000", min: 3501, max: 5000, mls: MLS_PRICE_V1_BY_TIER.TIER_3, essentials: 375, cinematic: 575, premium: 825 },
  { label: "5,001–7,500", min: 5001, max: 7500, mls: MLS_PRICE_V1_BY_TIER.TIER_4, essentials: 450, cinematic: 650, premium: 950 },
  { label: "7,501–10,000", min: 7501, max: 10000, mls: MLS_PRICE_V1_BY_TIER.TIER_5, essentials: 575, cinematic: 775, premium: 1100 },
  { label: "10,001+", min: 10001, max: Infinity, mls: null, essentials: null, cinematic: null, premium: null },
];

export function getPriceForSqft(sqft: number, packageType: "mls" | "essentials" | "cinematic" | "premium"): number | null {
  const tier = SQFT_PRICING.find(t => sqft >= t.min && sqft <= t.max);
  if (!tier) return null;
  return tier[packageType];
}

// ┌────────────────────────────────────────────────────────────────────────────
// ELIGIBLE PROMOTIONAL ADD-ONS (Premier/Elite cycles)
// └────────────────────────────────────────────────────────────────────────────

export const PROMOTIONAL_ADDON_CATEGORIES = ["Drone", "3D Tour", "Twilight Exterior Edits"];
export const PROMOTIONAL_MAX_BENEFIT_VALUE = 125;

// ┌────────────────────────────────────────────────────────────────────────────
// ARRIV AUTO-FUND — recurring wallet funding (extends Prepaid, does not replace)
// ┌────────────────────────────────────────────────────────────────────────────

export interface AutoFundAmountConfig {
  amount: number;
  plan_id: string;
  booking_value: number;
  bonus_pct: number;
  bonus_booking_value: number;
  credits: number;
  support_tier: string;
  support_priority: "standard" | "priority" | "priority_high" | "highest_autofund";
  benefits: string[];
  validity_months: number;
  /** True only for the $1,000 tier — carries the VIP benefits program. */
  vip?: boolean;
}

/**
 * Auto-Fund amounts. Customer pays monthly; booking value added to wallet.
 *
 * FINAL APPROVED bonus structure: $50 = 0%, $100 = 5%, $200 = 10%,
 * $350 = 15%, $500 = 20%, $1,000 = 25% (VIP tier).
 *
 * Bonus Booking Value is promotional and is NEVER charged to the customer as a
 * booking shortfall. Credits = booking_value / 275 (canonical, full precision).
 *
 * Changing a tier's booking_value affects FUTURE issuances only. Existing
 * CreditLots, wallet balances, issued/ redeemed totals, and financial history
 * are never rewritten — entitlements already granted stay exactly as granted.
 */
export const AUTO_FUND_AMOUNTS: Record<number, AutoFundAmountConfig> = {
  50: {
    amount: 50,
    plan_id: "autofund_50",
    booking_value: 50,
    bonus_pct: 0,
    bonus_booking_value: 0,
    credits: 50 / 275,
    support_tier: "AUTOFUND_50",
    support_priority: "standard",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
    ],
    validity_months: 12,
  },
  100: {
    amount: 100,
    plan_id: "autofund_100",
    booking_value: 105,
    bonus_pct: 5,
    bonus_booking_value: 5,
    credits: 105 / 275,
    support_tier: "AUTOFUND_100",
    support_priority: "standard",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "5% monthly bonus Booking Value",
      "Qualifying free rescheduling",
    ],
    validity_months: 12,
  },
  200: {
    amount: 200,
    plan_id: "autofund_200",
    booking_value: 220,
    bonus_pct: 10,
    bonus_booking_value: 20,
    credits: 220 / 275,
    support_tier: "AUTOFUND_200",
    support_priority: "priority",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "10% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "Priority Arriv Assist support",
    ],
    validity_months: 12,
  },
  350: {
    amount: 350,
    plan_id: "autofund_350",
    booking_value: 402.5,
    bonus_pct: 15,
    bonus_booking_value: 52.5,
    credits: 402.5 / 275,
    support_tier: "AUTOFUND_350",
    support_priority: "priority",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "15% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "Priority Arriv Assist support",
      "Priority Booking",
    ],
    validity_months: 12,
  },
  500: {
    amount: 500,
    plan_id: "autofund_500",
    booking_value: 600,
    bonus_pct: 20,
    bonus_booking_value: 100,
    credits: 600 / 275,
    support_tier: "AUTOFUND_500",
    support_priority: "priority_high",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "20% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "Priority Arriv Assist support",
      "Priority Booking",
      "Priority Processing when operational capacity allows",
    ],
    validity_months: 12,
  },
  1000: {
    amount: 1000,
    plan_id: "autofund_1000",
    booking_value: 1250,
    bonus_pct: 25,
    bonus_booking_value: 250,
    credits: 1250 / 275,
    support_tier: "AUTOFUND_1000",
    support_priority: "highest_autofund",
    vip: true,
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "25% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "VIP priority scheduling, subject to specialist availability",
      "VIP Arriv Assist routing",
      "VIP highest-priority human-support escalation",
      "Preferred pricing on selected add-ons when margin requirements are met",
    ],
    validity_months: 12,
  },
};

import { MLS_PRICE_V1_BY_TIER } from './mlsPricing.ts';

export const AUTO_FUND_AMOUNT_OPTIONS = [50, 100, 200, 350, 500, 1000];

export function getAutoFundConfig(amount: number): AutoFundAmountConfig | null {
  return AUTO_FUND_AMOUNTS[amount] || null;
}

// ┌────────────────────────────────────────────────────────────────────────────
// ARRIV AUTO-FUND VIP BENEFITS — $1,000 tier only
// ─────────────────────────────────────────────────────────────────────────────
// Three benefits, each with an explicit limit. Deliberately EXCLUDED: guaranteed
// turnaround times, unlimited revisions, complimentary services, and uncapped
// discounts. Every VIP term is disclosed to the customer at enrollment.

/** Only the $1,000 Auto-Fund tier carries VIP benefits. */
export const AUTO_FUND_VIP_AMOUNT = 1000;

/** Required contribution margin. A VIP add-on discount is granted ONLY when the
 *  post-discount add-on contribution still meets this margin. */
export const TARGET_CONTRIBUTION_MARGIN_PCT = 10;

export const VIP_PRIORITY_SCHEDULING = {
  enabled: true,
  disclosure:
    "VIP priority scheduling: your booking request is sequenced ahead of standard requests in the scheduling queue.",
  constraint:
    "Subject to specialist availability. Priority scheduling does not guarantee a specific date, time, or specialist, and does not guarantee a faster delivery turnaround.",
};

export const VIP_ENHANCED_SUPPORT = {
  enabled: true,
  disclosure:
    "VIP enhanced support: Arriv Assist routing is prioritised and human-support escalation carries the highest priority available on the support queue.",
  constraint:
    "Support priority places your request ahead of standard requests in the queue. It does not provide a dedicated agent, a guaranteed response time, or 24/7 coverage.",
};

export const VIP_ADDON_DISCOUNT_PCT = 10;
export const VIP_ADDON_DISCOUNT_CAP_PER_BOOKING = 25;
/** Selected add-ons only — VIP preferred pricing is not site-wide. */
export const VIP_ADDON_ELIGIBLE_IDS = ["drone", "3d_tour", "twilight", "ai_staging", "vertical_reel"];
export const VIP_ADDON_EXCLUDED_IDS = ["rush_delivery"];

/** Estimated incremental fulfillment cost per add-on redemption. Used ONLY for
 *  the margin guard and the financial stress model — never charged to a customer. */
export const VIP_ADDON_ESTIMATED_FULFILLMENT_COST: Record<string, number> = {
  drone: 35,
  "3d_tour": 45,
  twilight: 30,
  ai_staging: 10,
  vertical_reel: 12,
};

export const VIP_ADDON_PRICING_DISCLOSURE =
  "VIP preferred pricing: 10% off selected add-ons, capped at $25 per booking, applied only when the discounted price still meets Arriv's required contribution margin. Add-ons that cannot meet the margin receive no discount. Not cumulative with other add-on promotions.";

export const VIP_EXCLUSIONS = [
  "No guaranteed turnaround times.",
  "No unlimited revisions.",
  "No complimentary services.",
  "No uncapped discounts.",
];

/** VIP incremental cost assumptions — ESTIMATES used for the financial model only. */
export const VIP_INCREMENTAL_COST_ASSUMPTIONS = {
  enhanced_support_per_subscriber_per_month: 6,
  priority_scheduling_cost_per_priority_booking: 25,
  note:
    "Estimates for financial modelling only. Priority scheduling cost reflects occasional incremental specialist travel/coordination when priority placement requires a specialist outside the standard coverage radius.",
};

export function isVipAutoFundTier(amount: number): boolean {
  return amount === AUTO_FUND_VIP_AMOUNT;
}

export interface VipAddOnDiscountResult {
  addon_id: string;
  eligible: boolean;
  base_price: number;
  discount: number;
  vip_price: number;
  estimated_fulfillment_cost: number;
  contribution: number;
  margin_pct: number;
  reason: string;
}

/**
 * Resolve VIP preferred pricing for ONE add-on redemption.
 * Grants a discount ONLY when the post-discount price still yields at least
 * TARGET_CONTRIBUTION_MARGIN_PCT contribution margin. Fails closed to no discount.
 */
export function resolveVipAddOnDiscount(addonId: string, basePrice: number): VipAddOnDiscountResult {
  const cost = VIP_ADDON_ESTIMATED_FULFILLMENT_COST[addonId] ?? 0;
  const withheld = (reason: string): VipAddOnDiscountResult => ({
    addon_id: addonId,
    eligible: false,
    base_price: round2(basePrice),
    discount: 0,
    vip_price: round2(basePrice),
    estimated_fulfillment_cost: cost,
    contribution: round2(basePrice - cost),
    margin_pct: basePrice > 0 ? round2(((basePrice - cost) / basePrice) * 100) : 0,
    reason,
  });

  if (!VIP_ADDON_ELIGIBLE_IDS.includes(addonId)) {
    return withheld('Add-on is not included in VIP preferred pricing.');
  }
  if (!basePrice || basePrice <= 0) return withheld('Invalid add-on price.');

  const discount = Math.min(round2(basePrice * (VIP_ADDON_DISCOUNT_PCT / 100)), VIP_ADDON_DISCOUNT_CAP_PER_BOOKING);
  const vipPrice = round2(basePrice - discount);
  const contribution = round2(vipPrice - cost);
  const marginPct = round2((contribution / vipPrice) * 100);

  if (marginPct < TARGET_CONTRIBUTION_MARGIN_PCT) {
    return withheld(
      `Discount withheld: post-discount margin ${marginPct}% is below the required ${TARGET_CONTRIBUTION_MARGIN_PCT}%.`
    );
  }

  return {
    addon_id: addonId,
    eligible: true,
    base_price: round2(basePrice),
    discount,
    vip_price: vipPrice,
    estimated_fulfillment_cost: cost,
    contribution,
    margin_pct: marginPct,
    reason: 'Discount applied — margin requirement met.',
  };
}

export interface AutoFundVipTerms {
  amount: number;
  vip: boolean;
  priority_scheduling: { enabled: boolean; disclosure: string; constraint: string };
  enhanced_support: { enabled: boolean; disclosure: string; constraint: string };
  preferred_addon_pricing: {
    enabled: boolean;
    discount_pct: number;
    cap_per_booking: number;
    eligible_addon_ids: string[];
    excluded_addon_ids: string[];
    margin_guard_pct: number;
    disclosure: string;
  };
  exclusions: string[];
}

/** Full customer-facing VIP terms for a tier — null when the tier is not VIP. */
export function getAutoFundVipTerms(amount: number): AutoFundVipTerms | null {
  if (!isVipAutoFundTier(amount)) return null;
  return {
    amount,
    vip: true,
    priority_scheduling: { ...VIP_PRIORITY_SCHEDULING },
    enhanced_support: { ...VIP_ENHANCED_SUPPORT },
    preferred_addon_pricing: {
      enabled: true,
      discount_pct: VIP_ADDON_DISCOUNT_PCT,
      cap_per_booking: VIP_ADDON_DISCOUNT_CAP_PER_BOOKING,
      eligible_addon_ids: [...VIP_ADDON_ELIGIBLE_IDS],
      excluded_addon_ids: [...VIP_ADDON_EXCLUDED_IDS],
      margin_guard_pct: TARGET_CONTRIBUTION_MARGIN_PCT,
      disclosure: VIP_ADDON_PRICING_DISCLOSURE,
    },
    exclusions: [...VIP_EXCLUSIONS],
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// FINAL AUTO-FUND SALES COMMISSION POLICY (owner-approved — supersedes flat 10%)
// ─────────────────────────────────────────────────────────────────────────────
//   First successful Auto-Fund payment, genuinely NEW Auto-Fund customer: 15%
//   Every subsequent successful monthly Auto-Fund payment:                8%
//   Every Auto-Fund booking (wallet redemption):                          0%
//
// Commission is ALWAYS on actual successfully collected cash — never on
// promotional bonus Booking Value. Acquisition eligibility is CUSTOMER-level and
// persistent: it does not reset on pause/resume, cancel/reactivate, tier change,
// payment-method replacement, failed-then-retry, migration, or a replacement
// subscription for the same customer identity.
export const AUTO_FUND_FIRST_PAYMENT_RATE = 0.15;
export const AUTO_FUND_RECURRING_RATE = 0.08;

/**
 * Auto-Fund Sales Growth Advisor commission.
 * @param cashCollected actual successfully collected cash (never bonus Booking Value)
 * @param isFirstPayment true ONLY for the customer's first successful Auto-Fund payment
 */
export function calculateAutoFundCommission(cashCollected: number, isFirstPayment = false): number {
  const rate = isFirstPayment ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE;
  return round2(cashCollected * rate);
}