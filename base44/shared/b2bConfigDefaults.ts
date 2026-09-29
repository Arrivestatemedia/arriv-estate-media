// ============================================================================
// B2B CANONICAL CONFIGURATION DEFAULTS
//
// The single source of truth for all B2B seed configuration values.
// These constants are used by the seed function to create the initial active
// configuration records. They are NEVER used at calculation time — calculation
// always loads the active versioned config from the database so that signed
// contracts preserve the exact config that governed them.
//
// All monetary values are in DOLLARS (not cents) to match the existing retail
// config convention (mediaPricingEngine stores dollars in config).
// ============================================================================

// --- Plan Config (§II, §VIII) ---

export const B2B_PLAN_CONFIG_VERSION = "AEM_B2B_PLAN_V1";

export interface B2BPlanDefinition {
  plan_id: "business" | "portfolio" | "developer" | "enterprise";
  display_name: string;
  monthly_price: number;
  annual_prepaid_price: number;
  monthly_media_credits: number;
  included_full_seats: number;
  included_admin_seats: number;
  base_implementation_fee: number;
}

export const B2B_PLANS: B2BPlanDefinition[] = [
  {
    plan_id: "business",
    display_name: "Business",
    monthly_price: 1500,
    annual_prepaid_price: 16500,
    monthly_media_credits: 6,
    included_full_seats: 10,
    included_admin_seats: 2,
    base_implementation_fee: 1000,
  },
  {
    plan_id: "portfolio",
    display_name: "Portfolio",
    monthly_price: 3500,
    annual_prepaid_price: 38500,
    monthly_media_credits: 15,
    included_full_seats: 25,
    included_admin_seats: 5,
    base_implementation_fee: 1500,
  },
  {
    plan_id: "developer",
    display_name: "Developer",
    monthly_price: 7500,
    annual_prepaid_price: 82500,
    monthly_media_credits: 35,
    included_full_seats: 50,
    included_admin_seats: 10,
    base_implementation_fee: 2500,
  },
  {
    plan_id: "enterprise",
    display_name: "Enterprise",
    monthly_price: 12500,
    annual_prepaid_price: 137500,
    monthly_media_credits: 60,
    included_full_seats: 100,
    included_admin_seats: 15,
    base_implementation_fee: 4000,
  },
];

export const B2B_CREDIT_POLICY = {
  allocation_frequency: "monthly" as const,
  rollover: false,
  expiration: "end_of_monthly_entitlement_period" as const,
  annual_prepaid_allocation: "monthly" as const, // annual prepaid still allocates monthly
};

export const DEFAULT_B2B_PLAN_CONFIG = {
  config_version: B2B_PLAN_CONFIG_VERSION,
  plans: B2B_PLANS,
  credit_policy: B2B_CREDIT_POLICY,
};

// --- Reserved Capacity Config (§VII, §VIII, §IX) ---

export const B2B_CAPACITY_CONFIG_VERSION = "AEM_B2B_CAPACITY_V1";

export const B2B_CAPACITY_STANDARDS = {
  essentials: {
    display_name: "Essentials Capacity",
    bands: [
      { shoots: 40, monthly_price: 15000 },
      { shoots: 60, monthly_price: 21500 },
      { shoots: 100, monthly_price: 35000 },
    ],
  },
  cinematic: {
    display_name: "Cinematic Capacity",
    bands: [
      { shoots: 40, monthly_price: 22500 },
      { shoots: 60, monthly_price: 32000 },
      { shoots: 100, monthly_price: 50000 },
    ],
  },
  premium: {
    display_name: "Premium Capacity",
    bands: [
      { shoots: 40, monthly_price: 30000 },
      { shoots: 60, monthly_price: 43500 },
      { shoots: 100, monthly_price: 70000 },
    ],
  },
};

export const DEFAULT_B2B_CAPACITY_CONFIG = {
  config_version: B2B_CAPACITY_CONFIG_VERSION,
  product_name: "RESERVED MEDIA CAPACITY",
  standards: B2B_CAPACITY_STANDARDS,
  custom_enterprise_threshold: 100, // 100+ = CUSTOM ENTERPRISE
  annual_prepay_discount: 0.05, // ~5%
  min_term_months: 12,
  overage_rate_multiplier: 1.10, // contracted per-shoot rate × 1.10
  included_full_seats: 100,
  included_admin_seats: 15,
  base_implementation_fee: 5000,
  max_standard_sqft: 10000, // shoots cover eligible properties through 10,000 sqft
  rollover: false,
  expiration: "end_of_monthly_entitlement_period",
};

// --- Media Credit Config (§IV, §V, §X) ---

export const B2B_CREDIT_CONFIG_VERSION = "AEM_B2B_CREDIT_V1";

// Credit cost per package per B2B tier (credits are fractional)
export const B2B_CREDIT_MATRIX: Record<string, Record<string, number | "CUSTOM">> = {
  B2B_TIER_1: { mls_walkthrough: 0.45, photo_essentials: 1.0, photo_cinematic: 1.73, premium_bundle: 2.45 },
  B2B_TIER_2: { mls_walkthrough: 0.55, photo_essentials: 1.18, photo_cinematic: 1.91, premium_bundle: 2.73 },
  B2B_TIER_3: { mls_walkthrough: 0.65, photo_essentials: 1.36, photo_cinematic: 2.09, premium_bundle: 3.0 },
  B2B_TIER_4: { mls_walkthrough: 0.9, photo_essentials: 1.64, photo_cinematic: 2.36, premium_bundle: 3.45 },
  B2B_TIER_5: { mls_walkthrough: 1.25, photo_essentials: 2.09, photo_cinematic: 2.82, premium_bundle: 4.0 },
  B2B_LARGE_1: { mls_walkthrough: 1.6, photo_essentials: 2.45, photo_cinematic: 3.27, premium_bundle: 4.64 },
  B2B_LARGE_2: { mls_walkthrough: 1.95, photo_essentials: 2.82, photo_cinematic: 3.73, premium_bundle: 5.27 },
  B2B_LARGE_3: { mls_walkthrough: 2.3, photo_essentials: 3.18, photo_cinematic: 4.18, premium_bundle: 5.91 },
  B2B_LARGE_4: { mls_walkthrough: 2.65, photo_essentials: 3.55, photo_cinematic: 4.64, premium_bundle: 6.55 },
  B2B_LARGE_5: { mls_walkthrough: 3.2, photo_essentials: 4.18, photo_cinematic: 5.45, premium_bundle: 7.64 },
  B2B_CUSTOM: { mls_walkthrough: "CUSTOM", photo_essentials: "CUSTOM", photo_cinematic: "CUSTOM", premium_bundle: "CUSTOM" },
};

export const DEFAULT_B2B_CREDIT_CONFIG = {
  config_version: B2B_CREDIT_CONFIG_VERSION,
  credit_matrix: B2B_CREDIT_MATRIX,
  addon_default_divisor: 275, // eligible add-on retail price / $275 = Media Credits
  addon_rounding_rule: "ROUND_TO_2_DECIMALS" as const, // 2 decimal places (1 credit = 100 units)
  // Eligible Arriv Estate Media service add-ons that CAN be converted to Media Credits.
  // Studio products are NOT listed here — they remain separate cash purchases.
  eligible_addon_ids: [
    "drone",
    "3d_tour",
    "twilight",
    "rush_delivery",
    "vertical_reel",
    "ai_staging",
  ],
  // Explicitly excluded add-ons — these are NEVER converted to Media Credits.
  // Includes all Arriv Studio products (subscriptions and one-time productions).
  excluded_addon_ids: [
    "studio_creator_subscription",
    "studio_pro_subscription",
    "studio_brokerage_subscription",
    "listing_reel_studio",
    "property_promo_studio",
    "just_listed_video_studio",
    "social_content_pack_studio",
    "custom_studio_production",
  ],
  addon_overrides: {} as Record<string, number>, // add-on ID → explicit credit value (config-level override)
  // Contract-specific add-on credit overrides — populated per-contract at lock time.
  // Resolution precedence: contract_specific > config addon_overrides > retail conversion.
  contract_specific_addon_overrides: {} as Record<string, number>,
  // §XXIII: Explicit per-credit dollar rate for credit shortfall cash obligations.
  // When set, used directly instead of deriving from plan (monthly_price / monthly_media_credits).
  // null = derive from plan (legacy behavior).
  credit_shortfall_rate_per_credit: null as number | null,
  non_credit_charges: [
    "taxes",
    "travel",
    "cancellation_fees",
    "rescheduling_penalties",
    "administrative_fees",
    "rush_penalties",
    "other_non_production_charges",
  ],
};

// --- Seat Config (§XII, §XI) ---

export const B2B_SEAT_CONFIG_VERSION = "AEM_B2B_SEAT_V1";

export const DEFAULT_B2B_SEAT_CONFIG = {
  config_version: B2B_SEAT_CONFIG_VERSION,
  additional_full_seat_monthly: 10,
  booking_only_seat_monthly: 4,
  additional_admin_seat_monthly: 10,
};

// --- Implementation Config (§XI, §XII) ---

export const B2B_IMPLEMENTATION_CONFIG_VERSION = "AEM_B2B_IMPL_V1";

export const B2B_DEPLOYMENT_BANDS = [
  { min_users: 1, max_users: 25, additional_fee: 0, label: "Included" },
  { min_users: 26, max_users: 50, additional_fee: 500, label: "+$500" },
  { min_users: 51, max_users: 100, additional_fee: 1000, label: "+$1,000" },
  { min_users: 101, max_users: 250, additional_fee: 2000, label: "+$2,000" },
  { min_users: 251, max_users: 500, additional_fee: 3500, label: "+$3,500" },
  { min_users: 501, max_users: null, additional_fee: null, label: "CUSTOM" },
];

export const DEFAULT_B2B_IMPLEMENTATION_CONFIG = {
  config_version: B2B_IMPLEMENTATION_CONFIG_VERSION,
  base_implementation_fees: {
    business: 1000,
    portfolio: 1500,
    developer: 2500,
    enterprise: 4000,
    reserved_capacity: 5000,
  },
  deployment_bands: B2B_DEPLOYMENT_BANDS,
  bands_are_cumulative: false,
};

// --- Commission Plan Config (§XIX–§XXIII, §XIII) ---

export const B2B_COMMISSION_CONFIG_VERSION = "AEM_B2B_COMMISSION_V1";

export const DEFAULT_B2B_COMMISSION_CONFIG = {
  config_version: B2B_COMMISSION_CONFIG_VERSION,
  implementation_commission_rate: 0.6, // 60% of collected implementation revenue
  recurring: {
    first_month_rate: 0.15,
    months_2_12_rate: 0.08,
    month_13_plus_rate: 0.05,
  },
  annual_close_bonus: {
    month_to_month_rate: 0.0,
    twelve_month_billed_monthly_rate: 0.015, // 1.5% of first-year contracted value
    annual_prepaid_rate: 0.03, // 3% of first-year contracted value
    cap: 7500, // $7,500 max initial annual bonus
  },
  renewal_bonus: {
    rate: 0.01, // 1% of renewed ACV
    cap: 2500, // $2,500 max
  },
  expansion: {
    first_month_rate: 0.15,
    months_2_12_rate: 0.08,
    month_13_plus_rate: 0.05,
  },
  rep_departure: {
    future_recurring_stops: true,
    no_buyout: true,
    vested_amounts_preserved: true,
  },
};

// --- Sqft Surcharge Config (§X, §III retail reference) ---

export const B2B_SQFT_SURCHARGE_CONFIG_VERSION = "AEM_B2B_SQFT_SURCHARGE_V1";

// TIER_5 retail prices (7,501–10,000 sqft) — the base for surcharge calculation
export const B2B_TIER_5_RETAIL = {
  mls_walkthrough: 275,
  photo_essentials: 575,
  photo_cinematic: 775,
  premium_bundle: 1100,
};

// Large-property retail prices (from §III retail property pricing table)
export const B2B_LARGE_PROPERTY_RETAIL: Record<string, Record<string, number>> = {
  B2B_LARGE_1: { mls_walkthrough: 350, photo_essentials: 675, photo_cinematic: 900, premium_bundle: 1275 },
  B2B_LARGE_2: { mls_walkthrough: 425, photo_essentials: 775, photo_cinematic: 1025, premium_bundle: 1450 },
  B2B_LARGE_3: { mls_walkthrough: 500, photo_essentials: 875, photo_cinematic: 1150, premium_bundle: 1625 },
  B2B_LARGE_4: { mls_walkthrough: 575, photo_essentials: 975, photo_cinematic: 1275, premium_bundle: 1800 },
  B2B_LARGE_5: { mls_walkthrough: 700, photo_essentials: 1150, photo_cinematic: 1500, premium_bundle: 2100 },
};

export const DEFAULT_B2B_SQFT_SURCHARGE_CONFIG = {
  config_version: B2B_SQFT_SURCHARGE_CONFIG_VERSION,
  base_tier: "B2B_TIER_5",
  base_retail_prices: B2B_TIER_5_RETAIL,
  large_property_retail: B2B_LARGE_PROPERTY_RETAIL,
  custom_tier: "B2B_CUSTOM",
};

// --- Annual prepay examples (§VIII) for validation ---

export const B2B_ANNUAL_PREPAY_EXAMPLES = [
  { monthly: 15000, expected_annual: 171000 }, // $15,000 × 12 × 0.95 = $171,000
  { monthly: 30000, expected_annual: 342000 }, // $30,000 × 12 × 0.95 = $342,000
  { monthly: 70000, expected_annual: 798000 }, // $70,000 × 12 × 0.95 = $798,000
];

// --- Enterprise regression example (§XXIV) for validation ---

export const B2B_ENTERPRISE_REGRESSION = {
  plan: "enterprise",
  annual_prepaid: 137500,
  initial_users: 80, // 51–100 band
  base_implementation: 4000,
  deployment_fee: 1000, // 51–100 band
  total_implementation: 5000,
  rep_implementation_commission: 3000, // 60% of $5,000
  annual_close_bonus: 4125, // 3% × $137,500
  monthly_revenue_basis: 11458.33, // $137,500 / 12
  first_month_recurring: 1718.75, // 15% × $11,458.33
  initial_eligible_compensation: 8843.75, // $3,000 + $4,125 + $1,718.75
  months_2_12_monthly: 916.67, // 8% × $11,458.33
  month_13_plus_monthly: 572.92, // 5% × $11,458.33
  renewal_bonus: 1375, // 1% × $137,500
};