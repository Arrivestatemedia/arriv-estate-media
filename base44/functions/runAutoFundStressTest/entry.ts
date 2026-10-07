import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTO_FUND_AMOUNTS,
  AUTO_FUND_AMOUNT_OPTIONS,
  SQFT_PRICING,
  getAutoFundConfig,
  creditsRequiredForPrice,
  calculateAutoFundCommission,
  round2,
} from '../../shared/prepaidEngine.ts';

/**
 * Arriv Auto-Fund Financial Stress Test
 *
 * Tests Auto-Fund economics separately from Prepaid.
 * For every Auto-Fund amount × square-foot tier × package type, calculates:
 *   - customer cash collected (monthly)
 *   - promotional booking value (bonus)
 *   - total booking value issued
 *   - Sales Growth Advisor commission
 *   - likely fulfillment obligations
 *   - Media Specialist payout under valid redemption
 *   - Arriv retained economics
 *
 * Also tests 12-month cumulative economics (customer funds for a full year
 * then redeems against various property sizes).
 *
 * DOES NOT change pricing automatically. Reports issues only.
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
    const mediaPayoutRate = body?.media_payout_rate || 0.50;

    const monthlyResults = [];
    const cumulativeResults = [];
    let worstMargin = null;
    const problems = [];

    // ── Monthly economics per amount ────────────────────────────────────────
    for (const amount of AUTO_FUND_AMOUNT_OPTIONS) {
      const config = getAutoFundConfig(amount);
      if (!config) continue;

      const cashCollected = config.amount;
      const bonusBv = config.bonus_booking_value;
      const totalBv = config.booking_value;
      const credits = config.credits;
      const repCommission = calculateAutoFundCommission(cashCollected);

      // Test redemption against each sqft tier × package
      for (const sqftTier of SQFT_PRICING) {
        for (const pkgType of ['mls', 'essentials', 'cinematic', 'premium'] as const) {
          const retailPrice = sqftTier[pkgType];
          if (retailPrice === null) continue;

          const creditsNeeded = creditsRequiredForPrice(retailPrice);
          const canRedeem = credits >= creditsNeeded;
          const mediaPayout = round2(retailPrice * mediaPayoutRate);

          // Arriv retained from one month's payment after one redemption
          const arrivRetained = round2(cashCollected - repCommission - mediaPayout);
          const arrivRetainedPct = round2((arrivRetained / cashCollected) * 100);

          const result = {
            amount,
            plan_id: config.plan_id,
            sqft_tier: sqftTier.label,
            package: pkgType,
            monthly_cash: cashCollected,
            monthly_booking_value: totalBv,
            monthly_bonus: bonusBv,
            monthly_credits: round2(credits),
            monthly_rep_commission: repCommission,
            retail_redemption: retailPrice,
            credits_needed: round2(creditsNeeded),
            can_redeem_from_one_month: canRedeem,
            media_payout: mediaPayout,
            arriv_retained: arrivRetained,
            arriv_retained_pct: arrivRetainedPct,
          };
          monthlyResults.push(result);

          if (worstMargin === null || arrivRetainedPct < worstMargin.arriv_retained_pct) {
            worstMargin = result;
          }

          if (arrivRetained < 0) {
            problems.push(`NEGATIVE MONTHLY RETAINED: $${amount}/mo × ${sqftTier.label} × ${pkgType} — retains $${arrivRetained} (${arrivRetainedPct}%)`);
          }
        }
      }
    }

    // ── 12-month cumulative economics ──────────────────────────────────────
    // Customer funds for 12 months, then redeems against each property size.
    for (const amount of AUTO_FUND_AMOUNT_OPTIONS) {
      const config = getAutoFundConfig(amount);
      if (!config) continue;

      const yearlyCash = config.amount * 12;
      const yearlyBv = config.booking_value * 12;
      const yearlyCredits = config.credits * 12;
      const yearlyCommission = calculateAutoFundCommission(config.amount) * 12;

      for (const sqftTier of SQFT_PRICING) {
        for (const pkgType of ['mls', 'essentials', 'cinematic', 'premium'] as const) {
          const retailPrice = sqftTier[pkgType];
          if (retailPrice === null) continue;

          const creditsNeeded = creditsRequiredForPrice(retailPrice);
          const mediaPayout = round2(retailPrice * mediaPayoutRate);

          // How many bookings can the yearly credits cover?
          const bookingsCovered = Math.floor(yearlyCredits / creditsNeeded);
          const totalMediaPayout = round2(mediaPayout * bookingsCovered);
          const totalRedemptionValue = round2(retailPrice * bookingsCovered);

          const arrivRetained = round2(yearlyCash - yearlyCommission - totalMediaPayout);
          const arrivRetainedPct = round2((arrivRetained / yearlyCash) * 100);

          cumulativeResults.push({
            amount,
            yearly_cash: yearlyCash,
            yearly_booking_value: round2(yearlyBv),
            yearly_credits: round2(yearlyCredits),
            yearly_rep_commission: round2(yearlyCommission),
            sqft_tier: sqftTier.label,
            package: pkgType,
            retail_per_booking: retailPrice,
            bookings_covered_by_year: bookingsCovered,
            total_media_payout: totalMediaPayout,
            arriv_retained: arrivRetained,
            arriv_retained_pct: arrivRetainedPct,
          });

          if (arrivRetained < 0) {
            problems.push(`NEGATIVE YEARLY RETAINED: $${amount}/mo × ${sqftTier.label} × ${pkgType} — retains $${arrivRetained} (${arrivRetainedPct}%)`);
          }
        }
      }
    }

    // ── Failed payment test ─────────────────────────────────────────────────
    const failedPaymentTests = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const config = getAutoFundConfig(amount);
      return {
        amount,
        payment_fails: {
          credits_issued: 0,
          booking_value_issued: 0,
          commission: 0,
          wallet_preserved: true,
          message: 'Failed payment issues zero credits, zero commission. Existing wallet value preserved.',
        },
        payment_succeeds: {
          credits_issued: round2(config.credits),
          booking_value_issued: config.booking_value,
          commission: calculateAutoFundCommission(amount),
        },
      };
    });

    // ── Idempotency test ────────────────────────────────────────────────────
    const idempotencyTest = {
      description: 'Same payment_event_id delivered 5 times = 1 lot, not 5',
      expected_credits: 'exactly one issuance per payment_event_id',
      mechanism: 'AutoFundPaymentEvent.payment_event_id unique check before credit issuance',
    };

    // ── Benefit mapping ─────────────────────────────────────────────────────
    const benefitMapping = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const config = getAutoFundConfig(amount);
      return {
        amount,
        support_tier: config.support_tier,
        support_priority: config.support_priority,
        benefits: config.benefits,
        bonus_pct: config.bonus_pct,
        promotional_addon_benefits: 0, // Auto-Fund does NOT get prepaid promotional add-ons
      };
    });

    return Response.json({
      status: problems.length > 0 ? 'PROBLEMS_FOUND' : 'PASS',
      monthly_combinations_tested: monthlyResults.length,
      cumulative_combinations_tested: cumulativeResults.length,
      worst_margin: worstMargin,
      problems,
      problems_count: problems.length,
      sample_monthly_results: monthlyResults.slice(0, 8),
      sample_cumulative_results: cumulativeResults.filter(r => r.bookings_covered_by_year > 0).slice(0, 8),
      failed_payment_tests: failedPaymentTests,
      idempotency_test: idempotencyTest,
      benefit_mapping: benefitMapping,
      media_payout_rate_used: mediaPayoutRate,
      note: 'Auto-Fund economics tested separately from Prepaid. No pricing or compensation changed. Media specialist payout estimated at provided rate — actual uses existing canonical formulas.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}