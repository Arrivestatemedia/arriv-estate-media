// ============================================================================
// B2B CREDIT COST RESOLVER
//
// Resolves the Media Credit requirement for a package + sqft + add-ons using
// the LOCKED contract-version configuration. Never uses the current active
// config for an existing signed contract.
//
// Uses b2bSqftResolver.ts (NOT propertyDataProvider.ts) for tier resolution.
// All credit values are in integer units (1 credit = 100 units).
//
// ADD-ON CREDIT CONVERSION (Addendum §1):
//   B2B_MEDIA_CREDIT_COST = ROUND_TO_2_DECIMALS(RETAIL_ADDON_PRICE / 275)
//
// Resolution precedence for each add-on:
//   1. Contract-specific locked override (contract_specific_addon_overrides)
//   2. Config-level explicit override (addon_overrides)
//   3. Retail price conversion: ROUND(retail_price / divisor, 2)
//
// Studio products are NEVER converted — they are in excluded_addon_ids.
// Only add-ons in eligible_addon_ids are converted.
// ============================================================================

import { determineB2BTier, isB2BCustomTier, isB2BLargeTier, B2BTier } from './b2bSqftResolver.ts';
import { creditsToUnits, unitsToCredits, CREDIT_SCALE } from './b2bCreditUnits.ts';
import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface AddOnInput {
  id: string;
  retail_price: number;
}

export interface AddOnCreditBreakdown {
  addon_id: string;
  addon_name: string;
  retail_reference_price: number;       // in DOLLARS (read-only from retail config)
  calculation_method: "ADDON_OVERRIDE" | "RETAIL_PRICE_CONVERSION" | "EXCLUDED" | "NOT_ELIGIBLE";
  divisor_used: number | null;
  override_used: number | null;          // in credit units (if override applied)
  credit_cost_units: number;            // in integer credit units
  credit_cost_display: number;           // in decimal credits (2 dp)
}

export interface CreditCostResult {
  b2b_sqft_tier: B2BTier;
  property_sqft: number;
  base_credit_requirement: number;       // in credit units
  addon_credit_requirement: number;      // in credit units
  total_credit_requirement: number;      // in credit units
  total_credit_requirement_display: number; // in decimal credits
  requires_custom_quote: boolean;
  non_credit_charges: string[];
  addon_breakdown: AddOnCreditBreakdown[];
}

/**
 * Resolve the credit cost for a package + sqft + add-ons using a locked config snapshot.
 * Returns credit amounts in integer units (1 credit = 100 units).
 *
 * Retail add-on prices are passed in via AddOnInput.retail_price. The caller is
 * responsible for reading these READ-ONLY from the active MediaPricingConfig.
 * This module NEVER reads or mutates the retail pricing config directly.
 */
export function resolveCreditCost(
  lockedSnapshots: LockedConfigSnapshots,
  packageName: string,
  sqft: number,
  addOns: AddOnInput[] = []
): CreditCostResult {
  const tier = determineB2BTier(sqft);
  const creditConfig = lockedSnapshots.media_credit.snapshot;
  const nonCreditCharges: string[] = creditConfig.non_credit_charges || [];

  if (isB2BCustomTier(tier)) {
    return {
      b2b_sqft_tier: tier,
      property_sqft: sqft,
      base_credit_requirement: 0,
      addon_credit_requirement: 0,
      total_credit_requirement: 0,
      total_credit_requirement_display: 0,
      requires_custom_quote: true,
      non_credit_charges: nonCreditCharges,
      addon_breakdown: [],
    };
  }

  const tierMatrix = creditConfig.credit_matrix[tier];
  if (!tierMatrix) {
    return {
      b2b_sqft_tier: tier,
      property_sqft: sqft,
      base_credit_requirement: 0,
      addon_credit_requirement: 0,
      total_credit_requirement: 0,
      total_credit_requirement_display: 0,
      requires_custom_quote: true,
      non_credit_charges: nonCreditCharges,
      addon_breakdown: [],
    };
  }

  const baseCostRaw = tierMatrix[packageName];
  if (baseCostRaw === 'CUSTOM' || baseCostRaw == null) {
    return {
      b2b_sqft_tier: tier,
      property_sqft: sqft,
      base_credit_requirement: 0,
      addon_credit_requirement: 0,
      total_credit_requirement: 0,
      total_credit_requirement_display: 0,
      requires_custom_quote: true,
      non_credit_charges: nonCreditCharges,
      addon_breakdown: [],
    };
  }

  const baseUnits = creditsToUnits(baseCostRaw);

  // --- Add-on credit conversion (Addendum §1, §3) ---
  const divisor = creditConfig.addon_default_divisor || 275;
  const eligibleAddonIds: string[] = creditConfig.eligible_addon_ids || [];
  const excludedAddonIds: string[] = creditConfig.excluded_addon_ids || [];
  const configOverrides: Record<string, number> = creditConfig.addon_overrides || {};
  const contractOverrides: Record<string, number> = creditConfig.contract_specific_addon_overrides || {};

  let addonUnits = 0;
  const addonBreakdown: AddOnCreditBreakdown[] = [];

  for (const addon of addOns) {
    const addonId = addon.id;
    const retailPrice = addon.retail_price || 0;

    // Check exclusion first — excluded add-ons (Studio products) are NEVER converted
    if (excludedAddonIds.includes(addonId)) {
      addonBreakdown.push({
        addon_id: addonId,
        addon_name: addonId,
        retail_reference_price: retailPrice,
        calculation_method: "EXCLUDED",
        divisor_used: null,
        override_used: null,
        credit_cost_units: 0,
        credit_cost_display: 0,
      });
      continue;
    }

    // Check eligibility — only eligible add-ons are converted
    if (eligibleAddonIds.length > 0 && !eligibleAddonIds.includes(addonId)) {
      addonBreakdown.push({
        addon_id: addonId,
        addon_name: addonId,
        retail_reference_price: retailPrice,
        calculation_method: "NOT_ELIGIBLE",
        divisor_used: null,
        override_used: null,
        credit_cost_units: 0,
        credit_cost_display: 0,
      });
      continue;
    }

    // Resolution precedence:
    // 1. Contract-specific locked override
    // 2. Config-level explicit override
    // 3. Retail price conversion: ROUND(retail_price / divisor, 2)
    let creditUnits: number;
    let calculationMethod: "ADDON_OVERRIDE" | "RETAIL_PRICE_CONVERSION";
    let overrideUsed: number | null = null;
    let divisorUsed: number | null = null;

    if (contractOverrides[addonId] != null) {
      creditUnits = creditsToUnits(contractOverrides[addonId]);
      overrideUsed = creditUnits;
      calculationMethod = "ADDON_OVERRIDE";
    } else if (configOverrides[addonId] != null) {
      creditUnits = creditsToUnits(configOverrides[addonId]);
      overrideUsed = creditUnits;
      calculationMethod = "ADDON_OVERRIDE";
    } else if (retailPrice > 0 && divisor > 0) {
      // ROUND_TO_2_DECIMALS(retail_price / divisor) in credit units
      creditUnits = Math.round((retailPrice / divisor) * CREDIT_SCALE);
      divisorUsed = divisor;
      calculationMethod = "RETAIL_PRICE_CONVERSION";
    } else {
      creditUnits = 0;
      calculationMethod = "RETAIL_PRICE_CONVERSION";
      divisorUsed = divisor;
    }

    addonUnits += creditUnits;
    addonBreakdown.push({
      addon_id: addonId,
      addon_name: addonId,
      retail_reference_price: retailPrice,
      calculation_method: calculationMethod,
      divisor_used: divisorUsed,
      override_used: overrideUsed,
      credit_cost_units: creditUnits,
      credit_cost_display: unitsToCredits(creditUnits),
    });
  }

  const totalUnits = baseUnits + addonUnits;

  return {
    b2b_sqft_tier: tier,
    property_sqft: sqft,
    base_credit_requirement: baseUnits,
    addon_credit_requirement: addonUnits,
    total_credit_requirement: totalUnits,
    total_credit_requirement_display: unitsToCredits(totalUnits),
    requires_custom_quote: false,
    non_credit_charges: nonCreditCharges,
    addon_breakdown: addonBreakdown,
  };
}

/**
 * Calculate the large-property surcharge for a B2B_LARGE tier.
 * Surcharge = large_property_retail[tier][package] - base_retail_prices[package]
 * Returns the surcharge amount in DOLLARS.
 *
 * 25,001+ sqft (B2B_CUSTOM) requires custom treatment — returns null.
 */
export function calculateB2BLargePropertySurcharge(
  lockedSnapshots: LockedConfigSnapshots,
  packageName: string,
  sqft: number
): { surcharge_amount: number; requires_custom_quote: boolean; large_property_tier: B2BTier } {
  const tier = determineB2BTier(sqft);
  const surchargeConfig = lockedSnapshots.sqft_surcharge.snapshot;

  if (isB2BCustomTier(tier)) {
    return { surcharge_amount: 0, requires_custom_quote: true, large_property_tier: tier };
  }

  if (!isB2BLargeTier(tier)) {
    return { surcharge_amount: 0, requires_custom_quote: false, large_property_tier: tier };
  }

  const basePrices = surchargeConfig.base_retail_prices;
  const largePrices = surchargeConfig.large_property_retail[tier];

  if (!basePrices || !largePrices) {
    return { surcharge_amount: 0, requires_custom_quote: true, large_property_tier: tier };
  }

  const basePrice = basePrices[packageName];
  const largePrice = largePrices[packageName];

  if (basePrice == null || largePrice == null) {
    return { surcharge_amount: 0, requires_custom_quote: true, large_property_tier: tier };
  }

  return {
    surcharge_amount: largePrice - basePrice,
    requires_custom_quote: false,
    large_property_tier: tier,
  };
}