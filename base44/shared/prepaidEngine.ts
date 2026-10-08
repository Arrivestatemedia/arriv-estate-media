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
  { label: "≤2,500", min: 0, max: 2500, mls: 100, essentials: 275, cinematic: 475, premium: 675 },
  { label: "2,501–3,500", min: 2501, max: 3500, mls: 125, essentials: 325, cinematic: 525, premium: 750 },
  { label: "3,501–5,000", min: 3501, max: 5000, mls: 150, essentials: 375, cinematic: 575, premium: 825 },
  { label: "5,001–7,500", min: 5001, max: 7500, mls: 200, essentials: 450, cinematic: 650, premium: 950 },
  { label: "7,501–10,000", min: 7501, max: 10000, mls: 275, essentials: 575, cinematic: 775, premium: 1100 },
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
}

/**
 * Auto-Fund amounts. Customer pays monthly; booking value added to wallet.
 * $50 = no bonus. $100+ = 5% bonus booking value.
 * Credits = booking_value / 275 (canonical, full precision).
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
    booking_value: 210,
    bonus_pct: 5,
    bonus_booking_value: 10,
    credits: 210 / 275,
    support_tier: "AUTOFUND_200",
    support_priority: "priority",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "5% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "Priority Arriv Assist support",
    ],
    validity_months: 12,
  },
  350: {
    amount: 350,
    plan_id: "autofund_350",
    booking_value: 367.50,
    bonus_pct: 5,
    bonus_booking_value: 17.50,
    credits: 367.50 / 275,
    support_tier: "AUTOFUND_350",
    support_priority: "priority",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "5% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "Priority Arriv Assist support",
      "Priority Booking",
    ],
    validity_months: 12,
  },
  500: {
    amount: 500,
    plan_id: "autofund_500",
    booking_value: 525,
    bonus_pct: 5,
    bonus_booking_value: 25,
    credits: 525 / 275,
    support_tier: "AUTOFUND_500",
    support_priority: "priority_high",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "5% monthly bonus Booking Value",
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
    booking_value: 1050,
    bonus_pct: 5,
    bonus_booking_value: 50,
    credits: 1050 / 275,
    support_tier: "AUTOFUND_1000",
    support_priority: "highest_autofund",
    benefits: [
      "Customer 360",
      "Arriv Wallet",
      "Automatic monthly funding",
      "Rollover Booking Value",
      "5% monthly bonus Booking Value",
      "Qualifying free rescheduling",
      "Priority Arriv Assist support",
      "Priority Booking",
      "Priority Processing when operational capacity allows",
      "Eligible Early Access to new Estate Media services",
    ],
    validity_months: 12,
  },
};

export const AUTO_FUND_AMOUNT_OPTIONS = [50, 100, 200, 350, 500, 1000];

export function getAutoFundConfig(amount: number): AutoFundAmountConfig | null {
  return AUTO_FUND_AMOUNTS[amount] || null;
}

/** Auto-Fund commission: 10% of actual cash collected, same as prepaid. */
export function calculateAutoFundCommission(cashCollected: number): number {
  return round2(cashCollected * 0.10);
}