// ============================================================================
// B2B CREDIT COST RESOLVER
//
// Resolves the Media Credit requirement for a package + sqft + add-ons using
// the LOCKED contract-version configuration. Never uses the current active
// config for an existing signed contract.
//
// Uses b2bSqftResolver.ts (NOT propertyDataProvider.ts) for tier resolution.
// All credit values are in integer units (1 credit = 100 units).
// ============================================================================

import { determineB2BTier, isB2BCustomTier, isB2BLargeTier, B2BTier } from './b2bSqftResolver.ts';
import { creditsToUnits, divUnits, unitsToCredits, CREDIT_SCALE } from './b2bCreditUnits.ts';
import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface AddOnInput {
  id: string;
  retail_price: number;
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
}

/**
 * Resolve the credit cost for a package + sqft + add-ons using a locked config snapshot.
 * Returns credit amounts in integer units (1 credit = 100 units).
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
    };
  }

  const baseUnits = creditsToUnits(baseCostRaw);

  // Add-on credit conversion
  const addonOverrides = creditConfig.addon_overrides || {};
  const divisor = creditConfig.addon_default_divisor || 275;
  let addonUnits = 0;
  for (const addon of addOns) {
    if (addonOverrides[addon.id] != null) {
      addonUnits += creditsToUnits(addonOverrides[addon.id]);
    } else if (addon.retail_price && divisor > 0) {
      addonUnits += divUnits(creditsToUnits(addon.retail_price / 1), divisor);
      // Convert retail price to credit units: (price / divisor) * CREDIT_SCALE
      addonUnits += Math.round((addon.retail_price / divisor) * CREDIT_SCALE) - divUnits(creditsToUnits(addon.retail_price / 1), divisor);
      // The above is redundant; use the direct formula:
    }
    // Actually, let me simplify: addon credits = (retail_price / divisor)
    // In units: (retail_price / divisor) * CREDIT_SCALE = Math.round(retail_price * CREDIT_SCALE / divisor)
  }

  // Recalculate addon units cleanly
  addonUnits = 0;
  for (const addon of addOns) {
    if (addonOverrides[addon.id] != null) {
      addonUnits += creditsToUnits(addonOverrides[addon.id]);
    } else if (addon.retail_price && divisor > 0) {
      addonUnits += Math.round((addon.retail_price / divisor) * CREDIT_SCALE);
    }
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