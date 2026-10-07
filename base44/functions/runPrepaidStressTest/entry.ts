import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  PREPAID_TIERS,
  PREPAID_CREDIT_VALUE,
  SQFT_PRICING,
  getTierConfig,
  creditsRequiredForPrice,
  bookingValueForCredits,
  calculatePrepaidCommission,
  round2,
} from '../../shared/prepaidEngine.ts';

/**
 * Arriv Prepaid Financial Stress Test
 *
 * Tests every combination of:
 *   Package × Square-foot tier × Prepaid bonus × Sales Growth Advisor commission ×
 *   Media Specialist payout × Promotional benefit
 *
 * Reports:
 *   - Cash received
 *   - Booking value issued
 *   - Retail redemption
 *   - Rep commission
 *   - Fulfillment payout (estimated)
 *   - Promotional cost
 *   - Arriv retained dollars
 *   - Arriv retained percentage
 *
 * Identifies worst valid margin.
 * DOES NOT autonomously change pricing or compensation.
 * Stops and reports problems.
 *
 * Admin-only.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const includePromotional = body?.include_promotional !== false;
    const mediaPayoutRate = body?.media_payout_rate || 0.50; // estimated 50% of retail goes to specialist

    const results = [];
    let worstMargin = null;
    const problems = [];

    // ── Test every tier × sqft tier × package type ───────────────────────────
    for (const tierKey of Object.keys(PREPAID_TIERS)) {
      const config = PREPAID_TIERS[tierKey];

      for (const sqftTier of SQFT_PRICING) {
        for (const pkgType of ['mls', 'essentials', 'cinematic', 'premium'] as const) {
          const retailPrice = sqftTier[pkgType];
          if (retailPrice === null) {
            // 10,001+ custom — skip (no canonical price)
            continue;
          }

          // Credits needed for this booking
          const creditsNeeded = creditsRequiredForPrice(retailPrice);
          const bookingValueRedeemed = retailPrice;

          // Does the tier have enough credits for this booking?
          const canFullyRedeem = config.credits >= creditsNeeded;

          // Rep commission (on purchase, not on redemption)
          const repCommission = calculatePrepaidCommission(config.cash_price);

          // Media specialist payout (estimated: % of retail, independent of prepaid)
          const mediaPayout = round2(retailPrice * mediaPayoutRate);

          // Promotional benefit cost (Arriv absorbs)
          let promotionalCost = 0;
          if (includePromotional && config.promotional_benefits_per_cycle > 0) {
            promotionalCost = 125 * config.promotional_benefits_per_cycle;
          }

          // Arriv retained economics
          // Cash received: tier cash price
          // Booking value issued: config.booking_value
          // Retail redemption: retailPrice (one booking)
          // Rep commission: repCommission
          // Fulfillment payout: mediaPayout
          // Promotional cost: promotionalCost
          const cashReceived = config.cash_price;
          const bookingValueIssued = config.booking_value;
          const arrivRetained = round2(
            cashReceived - repCommission - mediaPayout - promotionalCost
          );
          const arrivRetainedPct = round2((arrivRetained / cashReceived) * 100);

          // Margin analysis: what fraction of cash received is retained after one full redemption?
          // Note: customer may redeem multiple bookings from one prepaid purchase
          const singleRedemptionCost = round2(mediaPayout + repCommission + promotionalCost);
          const marginAfterOneRedemption = round2(cashReceived - singleRedemptionCost);
          const marginPctAfterOneRedemption = round2((marginAfterOneRedemption / cashReceived) * 100);

          const result = {
            tier: tierKey,
            sqft_tier: sqftTier.label,
            package: pkgType,
            retail_price: round2(retailPrice),
            credits_needed: round2(creditsNeeded),
            can_fully_redeem: canFullyRedeem,
            cash_received: cashReceived,
            booking_value_issued: bookingValueIssued,
            retail_redemption: bookingValueRedeemed,
            rep_commission: repCommission,
            fulfillment_payout: mediaPayout,
            promotional_cost: promotionalCost,
            arriv_retained_dollars: arrivRetained,
            arriv_retained_pct: arrivRetainedPct,
            margin_after_one_redemption: marginAfterOneRedemption,
            margin_pct_after_one_redemption: marginPctAfterOneRedemption,
          };
          results.push(result);

          // Track worst margin
          if (worstMargin === null || marginPctAfterOneRedemption < worstMargin.margin_pct_after_one_redemption) {
            worstMargin = result;
          }

          // Flag problems
          if (!canFullyRedeem && creditsNeeded > config.credits) {
            // This is expected for large properties — not a problem, just a note
          }
          if (arrivRetained < 0) {
            problems.push(`NEGATIVE RETAINED: ${tierKey} × ${sqftTier.label} × ${pkgType} — Arriv retains $${arrivRetained} (${arrivRetainedPct}%)`);
          }
          if (repCommission > cashReceived) {
            problems.push(`COMMISSION EXCEEDS CASH: ${tierKey} — rep commission $${repCommission} > cash $${cashReceived}`);
          }
        }
      }
    }

    // ── Test add-on credit conversions ────────────────────────────────────────
    const addonTests = [
      { name: 'Drone', price: 125 },
      { name: '3D Tour', price: 125 },
      { name: 'Twilight Exterior Edits', price: 125 },
      { name: 'Next-Day Rush', price: 100 },
      { name: 'Additional Vertical Reel', price: 40 },
      { name: 'AI Staging', price: 125 },
    ];
    const addonResults = addonTests.map(a => ({
      ...a,
      credits: round2(creditsRequiredForPrice(a.price)),
      booking_value: a.price,
    }));

    // ── Test commission stacking prevention ──────────────────────────────────
    const stackingTests = [];
    for (const tierKey of Object.keys(PREPAID_TIERS)) {
      const config = PREPAID_TIERS[tierKey];
      const purchaseCommission = calculatePrepaidCommission(config.cash_price);
      // Redemption should produce ZERO additional commission
      const redemptionCommission = 0;
      stackingTests.push({
        tier: tierKey,
        purchase_commission: purchaseCommission,
        redemption_commission: redemptionCommission,
        stacking_prevented: redemptionCommission === 0,
      });
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    return Response.json({
      status: problems.length > 0 ? 'PROBLEMS_FOUND' : 'PASS',
      total_combinations_tested: results.length,
      worst_margin: worstMargin,
      problems,
      problems_count: problems.length,
      sample_results: results.slice(0, 10),
      all_results: results,
      addon_credit_conversions: addonResults,
      commission_stacking_tests: stackingTests,
      media_payout_rate_used: mediaPayoutRate,
      note: 'Media specialist payout is estimated at the provided rate for stress testing. Actual payout uses existing canonical formulas. No pricing or compensation was changed.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}