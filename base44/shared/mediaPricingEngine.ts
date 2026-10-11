// ============================================================================
// MEDIA PRICING ENGINE — The ONE authoritative server-side pricing calculator.
//
// This module is pure: it takes a versioned config + inputs and returns a
// deterministic result. It NEVER trusts frontend-submitted totals.
//
// Calculation order:
//   1. Determine property pricing tier from sqft
//   2. Look up package base price for that tier
//   3. Sum add-on customer prices
//   4. Apply Preferred discount (10% off non-MLS package, $5 off MLS)
//   5. Apply approved true discounts
//   6. commissionable_service_value = (pkg_price - preferred_discount) + add_ons - approved_discount
//   7. Referral tender does NOT reduce commissionable_service_value (it's tender, not a discount)
//   8. amount_due = commissionable_service_value - referral_tender
// ============================================================================

import {
  dollarsToCents,
  roundCents,
  applyRate,
  addCents,
  subtractCents,
} from "./moneyUtils.ts";
import { determinePricingTier } from "./propertyDataProvider.ts";
import { computeTenureBand, LifecyclePricingConfig, DEFAULT_LIFECYCLE_CONFIG } from "./customerLifecycleEngine.ts";

// --- Versioned Configuration Types ---

import {
  MLS_PRICE_V1_BY_TIER,
  MLS_PRICE_V2_BY_TIER,
  MLS_PRICING_VERSION_V2,
} from "./mlsPricing.ts";

// Re-exported so existing consumers keep working while there is only ONE
// definition of the MLS ladder (see mlsPricing.ts).
export { MLS_PRICE_V2_BY_TIER };

export interface PackageTierPrice {
  tier: string; // TIER_1, TIER_2, ..., CUSTOM
  prices: Record<string, number>; // package_id -> price in DOLLARS
}

export interface AddOnConfig {
  id: string;
  name: string;
  customer_price: number; // in DOLLARS
  active: boolean;
  package_eligibility: string[] | "all";
  preferred_eligible: boolean;
  commissionable: boolean;
  provider_compensation_treatment: "included" | "separate" | "none";
  required_capabilities: string[];
  fulfillment_type: "onsite" | "backend" | "mixed";
  display_order: number;
}

export interface PreferredConfig {
  monthly_price: number; // 29.99
  regular_discount_rate: number; // 0.10 (10%)
  mls_flat_discount: number; // 5.00 ($5 off MLS)
  mls_discount_type: "flat" | "percentage";
}

export interface MediaPricingConfig {
  pricing_version: string; // "AEM_MEDIA_PRICING_V1"
  is_active: boolean;
  effective_date: string;
  tier_prices: PackageTierPrice[];
  add_ons: AddOnConfig[];
  preferred: PreferredConfig;
}

// --- Pricing Input ---

export interface PricingInput {
  package_id: string;
  property_sqft: number | null;
  add_on_ids: string[];
  preferred_active: boolean;
  approved_discount_amount: number; // in DOLLARS (from approved DiscountApproval)
  referral_tender_amount: number; // in DOLLARS (from referral wallet)
  // Customer lifecycle tenure (optional — null/omitted means no adjustment)
  tenure_start_date: string | null; // ISO date of first completed+delivered+paid service
  lifecycle_config: LifecyclePricingConfig | null; // active lifecycle rules
  pricing_as_of: string | null; // ISO timestamp for tenure calc (defaults to now)
}

// --- Pricing Result ---

export interface PricingResult {
  status: "OK" | "CUSTOM_QUOTE_REQUIRED" | "INVALID_INPUT";
  pricing_version: string;
  package_id: string;
  property_pricing_tier: string;

  // All amounts in CENTS (integer)
  property_adjusted_package_price: number;
  add_ons_subtotal: number;
  preferred_discount: number;
  approved_discount_amount: number;
  commissionable_service_value: number;
  referral_tender_amount: number;
  customer_service_total: number; // = commissionable_service_value
  payment_amount_due: number; // = CSV - referral_tender

  // Breakdown detail
  selected_add_ons: { id: string; name: string; price: number }[];
  preferred_savings_display: number; // for "Save $X" display

  // Customer lifecycle adjustment (applied to package price only, not add-ons)
  customer_tenure_start_date: string | null;
  customer_tenure_band: string; // "INTRODUCTORY", "TIER_1", ..., "UNDETERMINED"
  customer_tenure_band_label: string;
  lifecycle_adjustment_cents: number; // added to the package price
  lifecycle_config_version: string;
}

// --- The Engine ---

export function calculateMediaPricing(
  config: MediaPricingConfig,
  input: PricingInput
): PricingResult {
  const { package_id, property_sqft, add_on_ids, preferred_active, approved_discount_amount, referral_tender_amount, tenure_start_date, lifecycle_config, pricing_as_of } = input;

  // 1. Determine tier (default to TIER_1 when sqft not yet available — matches legacy flat prices)
  const tier = property_sqft == null ? "TIER_1" : determinePricingTier(property_sqft);
  if (tier === "UNKNOWN" || tier === "CUSTOM") {
    return {
      status: tier === "CUSTOM" ? "CUSTOM_QUOTE_REQUIRED" : "INVALID_INPUT",
      pricing_version: config.pricing_version,
      package_id,
      property_pricing_tier: tier,
      property_adjusted_package_price: 0,
      add_ons_subtotal: 0,
      preferred_discount: 0,
      approved_discount_amount: 0,
      commissionable_service_value: 0,
      referral_tender_amount: 0,
      customer_service_total: 0,
      payment_amount_due: 0,
      selected_add_ons: [],
      preferred_savings_display: 0,
    };
  }

  // 2. Look up package price for tier
  const tierConfig = config.tier_prices.find((t) => t.tier === tier);
  if (!tierConfig) {
    return { ...emptyResult(config.pricing_version, package_id, tier), status: "INVALID_INPUT" };
  }
  const packagePriceDollars = tierConfig.prices[package_id];
  if (packagePriceDollars == null) {
    return { ...emptyResult(config.pricing_version, package_id, tier), status: "INVALID_INPUT" };
  }
  const basePackagePriceCents = dollarsToCents(packagePriceDollars);

  // 2b. Apply customer lifecycle adjustment to the PACKAGE price only.
  // This flows through Preferred discount, approved discount, and CSV.
  // Add-ons are NEVER adjusted by lifecycle.
  const lifecycleConfig = lifecycle_config || DEFAULT_LIFECYCLE_CONFIG;
  const tenureResult = computeTenureBand(
    tenure_start_date || null,
    pricing_as_of || new Date().toISOString(),
    lifecycleConfig
  );
  const lifecycleAdjustmentCents = tenureResult.adjustment_cents;
  const packagePriceCents = addCents(basePackagePriceCents, lifecycleAdjustmentCents);

  // 3. Sum add-on prices
  const selectedAddOns = (add_on_ids || [])
    .map((id) => config.add_ons.find((a) => a.id === id && a.active))
    .filter(Boolean) as AddOnConfig[];
  const addOnsSubtotalCents = selectedAddOns.reduce(
    (sum, a) => sum + dollarsToCents(a.customer_price),
    0
  );

  // 4. Apply Preferred discount (package only, not add-ons)
  let preferredDiscountCents = 0;
  if (preferred_active) {
    if (package_id === "mls_walkthrough") {
      preferredDiscountCents = dollarsToCents(config.preferred.mls_flat_discount);
    } else {
      preferredDiscountCents = applyRate(packagePriceCents, config.preferred.regular_discount_rate);
    }
  }

  // 5. Approved discount (true price discount, reduces commissionable value)
  const approvedDiscountCents = dollarsToCents(approved_discount_amount || 0);

  // 6. Commissionable service value
  const packageAfterPreferred = subtractCents(packagePriceCents, preferredDiscountCents);
  const commissionableServiceValue = subtractCents(
    addCents(packageAfterPreferred, addOnsSubtotalCents),
    approvedDiscountCents
  );

  // 7. Referral tender does NOT reduce CSV
  const referralTenderCents = dollarsToCents(referral_tender_amount || 0);

  // 8. Amount due = CSV - referral tender
  const amountDue = subtractCents(commissionableServiceValue, referralTenderCents);

  return {
    status: "OK",
    pricing_version: config.pricing_version,
    package_id,
    property_pricing_tier: tier,
    property_adjusted_package_price: packagePriceCents,
    add_ons_subtotal: addOnsSubtotalCents,
    preferred_discount: preferredDiscountCents,
    approved_discount_amount: approvedDiscountCents,
    commissionable_service_value: commissionableServiceValue,
    referral_tender_amount: referralTenderCents,
    customer_service_total: commissionableServiceValue,
    payment_amount_due: amountDue,
    selected_add_ons: selectedAddOns.map((a) => ({
      id: a.id,
      name: a.name,
      price: dollarsToCents(a.customer_price),
    })),
    preferred_savings_display: preferredDiscountCents,
    customer_tenure_start_date: tenureResult.tenure_start_date,
    customer_tenure_band: tenureResult.band,
    customer_tenure_band_label: tenureResult.band_label,
    lifecycle_adjustment_cents: lifecycleAdjustmentCents,
    lifecycle_config_version: lifecycleConfig.config_version,
  };
}

function emptyResult(version: string, packageId: string, tier: string): PricingResult {
  return {
    status: "INVALID_INPUT",
    pricing_version: version,
    package_id: packageId,
    property_pricing_tier: tier,
    property_adjusted_package_price: 0,
    add_ons_subtotal: 0,
    preferred_discount: 0,
    approved_discount_amount: 0,
    commissionable_service_value: 0,
    referral_tender_amount: 0,
    customer_service_total: 0,
    payment_amount_due: 0,
    selected_add_ons: [],
    preferred_savings_display: 0,
    customer_tenure_start_date: null,
    customer_tenure_band: "UNDETERMINED",
    customer_tenure_band_label: "",
    lifecycle_adjustment_cents: 0,
    lifecycle_config_version: "",
  };
}

// --- Default V1 Config ---

export const DEFAULT_PRICING_CONFIG: MediaPricingConfig = {
  pricing_version: "AEM_MEDIA_PRICING_V1",
  is_active: true,
  effective_date: "2026-09-07",
  tier_prices: [
    {
      tier: "TIER_1",
      prices: { mls_walkthrough: MLS_PRICE_V1_BY_TIER.TIER_1, photo_essentials: 275, photo_cinematic: 475, premium_bundle: 675 },
    },
    {
      tier: "TIER_2",
      prices: { mls_walkthrough: MLS_PRICE_V1_BY_TIER.TIER_2, photo_essentials: 325, photo_cinematic: 525, premium_bundle: 750 },
    },
    {
      tier: "TIER_3",
      prices: { mls_walkthrough: MLS_PRICE_V1_BY_TIER.TIER_3, photo_essentials: 375, photo_cinematic: 575, premium_bundle: 825 },
    },
    {
      tier: "TIER_4",
      prices: { mls_walkthrough: MLS_PRICE_V1_BY_TIER.TIER_4, photo_essentials: 450, photo_cinematic: 650, premium_bundle: 950 },
    },
    {
      tier: "TIER_5",
      prices: { mls_walkthrough: MLS_PRICE_V1_BY_TIER.TIER_5, photo_essentials: 575, photo_cinematic: 775, premium_bundle: 1100 },
    },
  ],
  add_ons: [
    { id: "drone", name: "Drone add-on (photos + short clips)", customer_price: 125, active: true, package_eligibility: "all", preferred_eligible: true, commissionable: true, provider_compensation_treatment: "included", required_capabilities: ["drone"], fulfillment_type: "onsite", display_order: 1 },
    { id: "3d_tour", name: "3D Tour", customer_price: 125, active: true, package_eligibility: "all", preferred_eligible: true, commissionable: true, provider_compensation_treatment: "included", required_capabilities: ["tour_3d"], fulfillment_type: "onsite", display_order: 2 },
    { id: "twilight", name: "Twilight exterior edits (up to 5 photos)", customer_price: 125, active: true, package_eligibility: "all", preferred_eligible: true, commissionable: true, provider_compensation_treatment: "included", required_capabilities: ["twilight_capture"], fulfillment_type: "onsite", display_order: 3 },
    { id: "rush_delivery", name: "Next-day rush delivery (when available)", customer_price: 100, active: true, package_eligibility: "all", preferred_eligible: true, commissionable: true, provider_compensation_treatment: "none", required_capabilities: [], fulfillment_type: "backend", display_order: 4 },
    { id: "vertical_reel", name: "Additional vertical reel", customer_price: 40, active: true, package_eligibility: "all", preferred_eligible: true, commissionable: true, provider_compensation_treatment: "none", required_capabilities: [], fulfillment_type: "backend", display_order: 5 },
    { id: "ai_staging", name: "AI Staging", customer_price: 125, active: true, package_eligibility: "all", preferred_eligible: true, commissionable: true, provider_compensation_treatment: "none", required_capabilities: [], fulfillment_type: "backend", display_order: 6 },
  ],
  preferred: {
    monthly_price: 29.99,
    regular_discount_rate: 0.10,
    mls_flat_discount: 5.00,
    mls_discount_type: "flat",
  },
};

// ============================================================================
// MLS WALKTHROUGH PRICE V2 — OWNER-APPROVED STANDARD PRICE $120
// ============================================================================
// Owner approval of 2026-10-10 sets the standard MLS Walkthrough price to $120.
//
// The V2 ladder PRESERVES the existing square-footage adjustments — the
// increments above the standard tier (+$25, +$25, +$50, +$75) are carried over
// unchanged, so the ladder stays monotonic and proportionate. Only the standard
// (≤2,500 sqft) base moves from $100 to $120.
//
// This constant is INERT. The live price is whatever MediaPricingConfig record
// has `is_active: true`, and V1 ($100) remains the active record. Activation is a
// data change (activate the V2 record), never a code deploy, so the live price
// cannot move as a side effect of shipping code.
// ============================================================================

/** The standard (≤2,500 sqft) MLS Walkthrough price now approved. */
export const MLS_PRICE_STANDARD_V2 = 120;

/** The price that remains live until the owner activates the V2 config. */
export const MLS_PRICE_STANDARD_CURRENT = 100;

/** Square-footage increments carried over unchanged from the V1 ladder. */
export const MLS_SQFT_ADJUSTMENTS = [0, 25, 25, 50, 75] as const;

// MLS_PRICE_V2_BY_TIER is defined once in mlsPricing.ts and imported above.

/**
 * The complete approved V2 pricing config: identical to V1 in every respect
 * except the MLS Walkthrough column. Seeded as an INACTIVE record so it can be
 * reviewed and activated in staging without touching the live price.
 */
export const MLS_PRICING_V2_CONFIG: MediaPricingConfig = {
  ...DEFAULT_PRICING_CONFIG,
  pricing_version: "AEM_MEDIA_PRICING_V2",
  is_active: false,
  effective_date: "2026-10-10",
  tier_prices: DEFAULT_PRICING_CONFIG.tier_prices.map((t) => ({
    ...t,
    prices: { ...t.prices, mls_walkthrough: MLS_PRICE_V2_BY_TIER[t.tier] ?? t.prices.mls_walkthrough },
  })),
};