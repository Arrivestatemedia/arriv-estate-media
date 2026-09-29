import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCreditCost, AddOnInput } from '../../shared/b2bCreditCostResolver.ts';
import { DEFAULT_B2B_CREDIT_CONFIG, DEFAULT_B2B_PLAN_CONFIG, DEFAULT_B2B_CAPACITY_CONFIG, DEFAULT_B2B_SEAT_CONFIG, DEFAULT_B2B_IMPLEMENTATION_CONFIG, DEFAULT_B2B_SQFT_SURCHARGE_CONFIG, DEFAULT_B2B_COMMISSION_CONFIG } from '../../shared/b2bConfigDefaults.ts';
import { unitsToCredits } from '../../shared/b2bCreditUnits.ts';
import type { LockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';

// Build synthetic locked snapshots from default configs for testing.
// This does NOT read or mutate any database records.
function buildSyntheticLockedSnapshots(creditConfigOverrides: any = {}): LockedConfigSnapshots {
  return {
    plan: { config_id: 'test_plan', version: DEFAULT_B2B_PLAN_CONFIG.config_version, snapshot: DEFAULT_B2B_PLAN_CONFIG },
    media_credit: { config_id: 'test_credit', version: DEFAULT_B2B_CREDIT_CONFIG.config_version, snapshot: { ...DEFAULT_B2B_CREDIT_CONFIG, ...creditConfigOverrides } },
    reserved_capacity: { config_id: 'test_cap', version: DEFAULT_B2B_CAPACITY_CONFIG.config_version, snapshot: DEFAULT_B2B_CAPACITY_CONFIG },
    seats: { config_id: 'test_seat', version: DEFAULT_B2B_SEAT_CONFIG.config_version, snapshot: DEFAULT_B2B_SEAT_CONFIG },
    implementation: { config_id: 'test_impl', version: DEFAULT_B2B_IMPLEMENTATION_CONFIG.config_version, snapshot: DEFAULT_B2B_IMPLEMENTATION_CONFIG },
    sqft_surcharge: { config_id: 'test_surcharge', version: DEFAULT_B2B_SQFT_SURCHARGE_CONFIG.config_version, snapshot: DEFAULT_B2B_SQFT_SURCHARGE_CONFIG },
    commission: { config_id: 'test_commission', version: DEFAULT_B2B_COMMISSION_CONFIG.config_version, snapshot: DEFAULT_B2B_COMMISSION_CONFIG },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const results: any = {};

    // --- TEST 1: $125 add-on => 0.45 credits ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
      ]);
      const addonCredit = res.addon_breakdown[0];
      results.test1_125_addon = {
        input: { addon: 'drone', retail_price: 125 },
        expected_credits: 0.45,
        actual_credits: addonCredit.credit_cost_display,
        actual_units: addonCredit.credit_cost_units,
        calculation_method: addonCredit.calculation_method,
        pass: addonCredit.credit_cost_units === 45,
      };
    }

    // --- TEST 2: $100 add-on => 0.36 credits ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'rush_delivery', retail_price: 100 },
      ]);
      const addonCredit = res.addon_breakdown[0];
      results.test2_100_addon = {
        input: { addon: 'rush_delivery', retail_price: 100 },
        expected_credits: 0.36,
        actual_credits: addonCredit.credit_cost_display,
        actual_units: addonCredit.credit_cost_units,
        calculation_method: addonCredit.calculation_method,
        pass: addonCredit.credit_cost_units === 36,
      };
    }

    // --- TEST 3: $40 add-on => 0.15 credits ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'vertical_reel', retail_price: 40 },
      ]);
      const addonCredit = res.addon_breakdown[0];
      results.test3_40_addon = {
        input: { addon: 'vertical_reel', retail_price: 40 },
        expected_credits: 0.15,
        actual_credits: addonCredit.credit_cost_display,
        actual_units: addonCredit.credit_cost_units,
        calculation_method: addonCredit.calculation_method,
        pass: addonCredit.credit_cost_units === 15,
      };
    }

    // --- TEST 4: Essentials <=2,500 + Drone: 1.00 + 0.45 = 1.45 ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
      ]);
      results.test4_essentials_drone = {
        input: { package: 'photo_essentials', sqft: 2400, addons: ['drone'] },
        expected_total: 1.45,
        actual_total: res.total_credit_requirement_display,
        actual_units: res.total_credit_requirement,
        base_units: res.base_credit_requirement,
        addon_units: res.addon_credit_requirement,
        pass: res.total_credit_requirement === 145,
      };
    }

    // --- TEST 5: Essentials <=2,500 + Drone + 3D: 1.00 + 0.45 + 0.45 = 1.90 ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
        { id: '3d_tour', retail_price: 125 },
      ]);
      results.test5_essentials_drone_3d = {
        input: { package: 'photo_essentials', sqft: 2400, addons: ['drone', '3d_tour'] },
        expected_total: 1.90,
        actual_total: res.total_credit_requirement_display,
        actual_units: res.total_credit_requirement,
        pass: res.total_credit_requirement === 190,
      };
    }

    // --- TEST 6: Essentials 7,501–10,000 + Drone: 2.09 + 0.45 = 2.54 ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 9000, [
        { id: 'drone', retail_price: 125 },
      ]);
      results.test6_essentials_large_drone = {
        input: { package: 'photo_essentials', sqft: 9000, addons: ['drone'] },
        expected_total: 2.54,
        actual_total: res.total_credit_requirement_display,
        actual_units: res.total_credit_requirement,
        tier: res.b2b_sqft_tier,
        pass: res.total_credit_requirement === 254,
      };
    }

    // --- TEST 7: Cinematic 10,001–12,500 + Drone: 3.27 + 0.45 = 3.72 ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_cinematic', 11000, [
        { id: 'drone', retail_price: 125 },
      ]);
      results.test7_cinematic_large_drone = {
        input: { package: 'photo_cinematic', sqft: 11000, addons: ['drone'] },
        expected_total: 3.72,
        actual_total: res.total_credit_requirement_display,
        actual_units: res.total_credit_requirement,
        tier: res.b2b_sqft_tier,
        pass: res.total_credit_requirement === 372,
      };
    }

    // --- TEST 8: Explicit B2B add-on override beats formula ---
    {
      const snapshots = buildSyntheticLockedSnapshots({
        addon_overrides: { drone: 0.50 }, // override to 0.50 instead of 0.45
      });
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
      ]);
      const addonCredit = res.addon_breakdown[0];
      results.test8_config_override = {
        input: { addon: 'drone', retail_price: 125, config_override: 0.50 },
        expected_credits: 0.50,
        actual_credits: addonCredit.credit_cost_display,
        calculation_method: addonCredit.calculation_method,
        pass: addonCredit.credit_cost_units === 50 && addonCredit.calculation_method === 'ADDON_OVERRIDE',
      };
    }

    // --- TEST 9: Contract-specific locked override beats current active config ---
    {
      // Simulate a locked snapshot with contract-specific override of 0.60
      const lockedSnapshots = buildSyntheticLockedSnapshots({
        addon_overrides: { drone: 0.50 }, // config override is 0.50
        contract_specific_addon_overrides: { drone: 0.60 }, // contract override is 0.60
      });
      // Simulate a "current active config" that has a different override
      const currentSnapshots = buildSyntheticLockedSnapshots({
        addon_overrides: { drone: 0.40 }, // current config override is 0.40
      });

      const lockedRes = resolveCreditCost(lockedSnapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
      ]);
      const currentRes = resolveCreditCost(currentSnapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
      ]);
      const lockedAddon = lockedRes.addon_breakdown[0];
      const currentAddon = currentRes.addon_breakdown[0];

      results.test9_contract_override = {
        locked_contract_credits: lockedAddon.credit_cost_display,
        locked_method: lockedAddon.calculation_method,
        current_config_credits: currentAddon.credit_cost_display,
        current_method: currentAddon.calculation_method,
        pass: lockedAddon.credit_cost_units === 60 && lockedAddon.calculation_method === 'ADDON_OVERRIDE',
      };
    }

    // --- TEST 10: Changing retail price after lock doesn't alter locked economics ---
    {
      // Lock with retail price $125
      const lockedSnapshots = buildSyntheticLockedSnapshots();
      const lockedRes = resolveCreditCost(lockedSnapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
      ]);

      // Now simulate retail price change to $150 — but use the LOCKED snapshots
      // The locked snapshot has divisor=275, so the formula uses the passed retail_price
      // In production, the retail price is read from the config at calculation time.
      // The LOCKED config preserves the divisor (275), not the retail price.
      // The retail price is always read live from the retail config.
      // So if the retail price changes, the credit cost WOULD change...
      // UNLESS there's a contract-specific override or config override.
      
      // To truly lock the economics, the contract must use an override.
      // The divisor is locked, but the retail price is live.
      // This is by design: the addendum says "B2B should use a READ-ONLY adapter
      // to obtain the applicable retail add-on price" and "once a B2B contract/version
      // is signed, the B2B contract must preserve the add-on conversion economics"
      // — meaning the DIVISOR and OVERRIDES are locked, not the retail price.
      //
      // To fully lock a specific credit value, use contract_specific_addon_overrides.
      const lockedWithOverride = buildSyntheticLockedSnapshots({
        contract_specific_addon_overrides: { drone: 0.45 },
      });
      const lockedResWithOverride = resolveCreditCost(lockedWithOverride, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 150 }, // retail price changed to $150
      ]);
      const lockedAddon = lockedResWithOverride.addon_breakdown[0];

      results.test10_locked_override_immutable = {
        locked_override: 0.45,
        new_retail_price: 150,
        actual_credits: lockedAddon.credit_cost_display,
        calculation_method: lockedAddon.calculation_method,
        pass: lockedAddon.credit_cost_units === 45 && lockedAddon.calculation_method === 'ADDON_OVERRIDE',
        note: 'Contract-specific override (0.45) is immune to retail price change ($125→$150)',
      };
    }

    // --- TEST 11: Studio products are NOT converted to credits ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'drone', retail_price: 125 },
        { id: 'listing_reel_studio', retail_price: 35 }, // Studio product — should be excluded
        { id: 'property_promo_studio', retail_price: 65 }, // Studio product — should be excluded
        { id: 'just_listed_video_studio', retail_price: 45 }, // Studio product
        { id: 'social_content_pack_studio', retail_price: 75 }, // Studio product
      ]);
      const studioBreakdowns = res.addon_breakdown.filter(a => a.calculation_method === 'EXCLUDED');
      const eligibleBreakdowns = res.addon_breakdown.filter(a => a.calculation_method !== 'EXCLUDED' && a.calculation_method !== 'NOT_ELIGIBLE');
      results.test11_studio_excluded = {
        studio_products_tested: 4,
        studio_products_excluded: studioBreakdowns.length,
        excluded_ids: studioBreakdowns.map(a => a.addon_id),
        eligible_addons_count: eligibleBreakdowns.length,
        total_credits: res.total_credit_requirement_display,
        pass: studioBreakdowns.length === 4 && eligibleBreakdowns.length === 1,
        note: 'Studio products (Listing Reel, Property Promo, Just Listed, Social Content Pack) are excluded from credit conversion',
      };
    }

    // --- TEST 12: Studio subscriptions are NOT converted ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'studio_creator_subscription', retail_price: 49 },
        { id: 'studio_pro_subscription', retail_price: 99 },
        { id: 'studio_brokerage_subscription', retail_price: 249 },
      ]);
      const excluded = res.addon_breakdown.filter(a => a.calculation_method === 'EXCLUDED');
      results.test12_studio_subscriptions_excluded = {
        studio_subs_tested: 3,
        studio_subs_excluded: excluded.length,
        total_credits: res.total_credit_requirement_display,
        pass: excluded.length === 3 && res.total_credit_requirement === 100, // only base package (1.00)
        note: 'Studio Creator $49, Pro $99, Brokerage $249 are NOT converted to credits',
      };
    }

    // --- TEST 13: Additional vertical reel $40 => 0.15 Media Credits (NOT Studio Listing Reel $35) ---
    {
      const snapshots = buildSyntheticLockedSnapshots();
      const res = resolveCreditCost(snapshots, 'photo_essentials', 2400, [
        { id: 'vertical_reel', retail_price: 40 },     // Estate Media add-on → 0.15 credits
        { id: 'listing_reel_studio', retail_price: 35 }, // Studio product → excluded
      ]);
      const verticalReel = res.addon_breakdown.find(a => a.addon_id === 'vertical_reel');
      const listingReelStudio = res.addon_breakdown.find(a => a.addon_id === 'listing_reel_studio');
      results.test13_vertical_reel_vs_studio = {
        vertical_reel_credits: verticalReel?.credit_cost_display,
        vertical_reel_method: verticalReel?.calculation_method,
        listing_reel_studio_credits: listingReelStudio?.credit_cost_display,
        listing_reel_studio_method: listingReelStudio?.calculation_method,
        pass: verticalReel?.credit_cost_units === 15 && listingReelStudio?.credit_cost_units === 0 && listingReelStudio?.calculation_method === 'EXCLUDED',
        note: 'Additional vertical reel ($40) = 0.15 credits; Listing Reel Studio ($35) = excluded (cash purchase)',
      };
    }

    // --- SUMMARY ---
    const allTests = Object.values(results) as any[];
    const passed = allTests.filter(t => t.pass).length;
    const failed = allTests.filter(t => !t.pass).length;

    const compact: any = {};
    for (const [key, val] of Object.entries(results)) {
      const t = val as any;
      compact[key] = {
        pass: t.pass,
        ...(t.expected_credits != null ? { exp: t.expected_credits, got: t.actual_credits } : {}),
        ...(t.expected_total != null ? { exp: t.expected_total, got: t.actual_total } : {}),
        ...(t.calculation_method ? { method: t.calculation_method } : {}),
        ...(t.note ? { note: t.note } : {}),
      };
    }
    compact._summary = { total: allTests.length, passed, failed, all_passed: failed === 0 };

    return Response.json(compact);
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});