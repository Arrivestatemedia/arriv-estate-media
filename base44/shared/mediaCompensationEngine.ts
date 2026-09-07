// ============================================================================
// MEDIA COMPENSATION ENGINE — The ONE authoritative server-side calculator
// for sales commission, Media Partner payout, and Arriv contribution.
//
// All amounts in CENTS (integer). Deterministic rounding via moneyUtils.
//
// Rules:
//   STANDARD (non-MLS):
//     sales_commission = commissionable_service_value × 0.15
//     post_sales_value = CSV - sales_commission
//     media_partner_payout = post_sales_value × 0.40
//     arriv_contribution = CSV - sales_commission - media_partner_payout
//     Effective: 15% Sales / 34% Provider / 51% Arriv
//
//   MLS WALKTHROUGH:
//     sales_commission = CSV × 0.15 (standard 15%, same as all packages)
//     media_partner_payout = from MLS guaranteed payout table (FIXED by tier)
//     arriv_contribution = CSV - sales_commission - media_partner_payout
//     TIER_1 ($100): $15 Sales / $50 Provider / $35 Arriv
//     MLS does NOT use the standard 40%-of-remainder provider formula.
//
//   PREFERRED RESIDUAL ($10/month per active paid billing period):
//     Separate from transaction commission. Uses existing commission architecture.
// ============================================================================

import { dollarsToCents, applyRate, subtractCents, addCents, roundCents } from "./moneyUtils.ts";

// --- Versioned Configuration Types ---

export interface MlsPayoutTier {
  tier: string;
  payout: number; // in DOLLARS
}

export interface MediaCompensationConfig {
  compensation_version: string; // "AEM_MEDIA_PROVIDER_COMP_V1"
  is_active: boolean;
  effective_date: string;
  standard_sales_rate: number; // 0.15
  standard_partner_rate: number; // 0.40
  mls_payout_table: MlsPayoutTier[];
  preferred_monthly_price: number; // 29.99
  preferred_monthly_residual: number; // 10.00 (sales rep residual per active paid month)
  preferred_arriv_retention: number; // 19.99 (Arriv retains after residual)
}

// --- Compensation Input ---

export interface CompensationInput {
  commissionable_service_value: number; // in CENTS
  package_id: string;
  property_pricing_tier: string; // TIER_1..TIER_5, CUSTOM
  sales_member_id: string;
}

// --- Compensation Result ---

export interface CompensationResult {
  status: "OK" | "CUSTOM_QUOTE_REQUIRED" | "INVALID_INPUT";
  compensation_version: string;

  // All amounts in CENTS
  commissionable_service_value: number;
  sales_commission: number;
  sales_compensation_rule: string; // "STANDARD_15_PERCENT"
  post_sales_value: number;
  media_partner_payout: number;
  provider_compensation_rule: string; // "STANDARD_40_PERCENT_AFTER_SALES" | "MLS_GUARANTEED_PAYOUT"
  arriv_contribution: number;

  // Reconciliation
  reconciliation_check: number; // CSV - sales - partner - arriv (should be 0)
}

// --- The Engine ---

export function calculateMediaCompensation(
  config: MediaCompensationConfig,
  input: CompensationInput
): CompensationResult {
  const {
    commissionable_service_value,
    package_id,
    property_pricing_tier,
  } = input;

  const csv = roundCents(commissionable_service_value);

  if (property_pricing_tier === "CUSTOM") {
    return {
      status: "CUSTOM_QUOTE_REQUIRED",
      compensation_version: config.compensation_version,
      commissionable_service_value: csv,
      sales_commission: 0,
      sales_compensation_rule: "CUSTOM_QUOTE",
      post_sales_value: 0,
      media_partner_payout: 0,
      provider_compensation_rule: "CUSTOM_QUOTE",
      arriv_contribution: 0,
      reconciliation_check: 0,
    };
  }

  let salesCommission: number;
  let salesRule: string;
  let mediaPartnerPayout: number;
  let providerRule: string;

  if (package_id === "mls_walkthrough") {
    // MLS: use guaranteed payout table
    const mlsTier = config.mls_payout_table.find((t) => t.tier === property_pricing_tier);
    if (!mlsTier) {
      return {
        status: "INVALID_INPUT",
        compensation_version: config.compensation_version,
        commissionable_service_value: csv,
        sales_commission: 0,
        sales_compensation_rule: "INVALID",
        post_sales_value: 0,
        media_partner_payout: 0,
        provider_compensation_rule: "INVALID",
        arriv_contribution: 0,
        reconciliation_check: 0,
      };
    }
    mediaPartnerPayout = dollarsToCents(mlsTier.payout);
    providerRule = "MLS_GUARANTEED_PAYOUT";

    // MLS Walkthrough uses standard 15% sales commission (same as all packages).
    // The $40 new-customer MLS bonus was removed — no separate authorized rule exists.
    salesCommission = applyRate(csv, config.standard_sales_rate);
    salesRule = "STANDARD_15_PERCENT";
  } else {
    // Standard: 15% sales, 40% of remainder to partner
    salesCommission = applyRate(csv, config.standard_sales_rate);
    salesRule = "STANDARD_15_PERCENT";

    const postSales = subtractCents(csv, salesCommission);
    mediaPartnerPayout = applyRate(postSales, config.standard_partner_rate);
    providerRule = "STANDARD_40_PERCENT_AFTER_SALES";
  }

  const postSalesValue = package_id === "mls_walkthrough"
    ? subtractCents(csv, salesCommission)
    : subtractCents(csv, salesCommission);

  const arrivContribution = subtractCents(
    subtractCents(csv, salesCommission),
    mediaPartnerPayout
  );

  // Reconciliation: CSV must equal sales + partner + arriv
  const reconciliation = csv - addCents(salesCommission, mediaPartnerPayout, arrivContribution);

  return {
    status: "OK",
    compensation_version: config.compensation_version,
    commissionable_service_value: csv,
    sales_commission: salesCommission,
    sales_compensation_rule: salesRule,
    post_sales_value: postSalesValue,
    media_partner_payout: mediaPartnerPayout,
    provider_compensation_rule: providerRule,
    arriv_contribution: arrivContribution,
    reconciliation_check: reconciliation,
  };
}

// --- Default V1 Config ---

export const DEFAULT_COMPENSATION_CONFIG: MediaCompensationConfig = {
  compensation_version: "AEM_MEDIA_PROVIDER_COMP_V1",
  is_active: true,
  effective_date: "2026-09-07",
  standard_sales_rate: 0.15,
  standard_partner_rate: 0.40,
  mls_payout_table: [
    { tier: "TIER_1", payout: 50 },
    { tier: "TIER_2", payout: 60 },
    { tier: "TIER_3", payout: 70 },
    { tier: "TIER_4", payout: 90 },
    { tier: "TIER_5", payout: 120 },
  ],
  preferred_monthly_price: 29.99,
  preferred_monthly_residual: 10.00,
  preferred_arriv_retention: 19.99,
};