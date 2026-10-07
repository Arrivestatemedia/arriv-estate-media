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