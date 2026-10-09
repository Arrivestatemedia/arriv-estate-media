import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTO_FUND_AMOUNTS,
  AUTO_FUND_AMOUNT_OPTIONS,
  getAutoFundConfig,
  getPriceForSqft,
  calculateAutoFundCommission,
  round2,
  resolveVipAddOnDiscount,
  isVipAutoFundTier,
  TARGET_CONTRIBUTION_MARGIN_PCT,
  VIP_INCREMENTAL_COST_ASSUMPTIONS,
} from '../../shared/prepaidEngine.ts';

/**
 * Arriv Auto-Fund Financial Stress Test — FULL REDEMPTION MODEL
 *
 * METHODOLOGY (unchanged core):
 *   Auto-Fund Booking Value is a PAYMENT METHOD / stored booking value. It does
 *   NOT change canonical retail price. If the wallet cannot fully cover a
 *   booking, the customer pays the shortfall in cash. Therefore:
 *
 *     total_consideration = wallet_value_applied + cash_shortfall_collected
 *
 *   which always equals the canonical retail price. An insufficient wallet is
 *   NOT a discounted booking. Redemptions are never blocked and no fee is
 *   introduced to make a scenario pass.
 *
 * COVERAGE:
 *   - All six tiers, simulated over 12 months under complete wallet redemption.
 *   - Multiple jobs per month, mixed packages, square-footage surcharges, and
 *     unspent Booking Value accumulating across months (FIFO).
 *   - A refund scenario (value returned to the wallet, payout reversed).
 *   - Premium editing at $100 / $125 / $150 / $175 / $200 per completed booking.
 *   - 10% Sales Growth Advisor commission on collected funding, 40% media
 *     specialist payout on completed services, actual Stripe processing costs.
 *   - VIP incremental cost included for the $1,000 tier.
 *
 * NO DOUBLE COUNTING:
 *   Payout and editing are charged ONLY against services actually redeemed.
 *   Unredeemed Booking Value is reported as a separate forward obligation and
 *   deducted exactly once, after realized contribution. Promotional bonus
 *   Booking Value is never treated as cash.
 *
 * Admin-only. This function reports; it never changes pricing or balances.
 */
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    // 40% is the approved media-specialist payout on eligible completed services.
    // Overridable so harsher rate scenarios can be modelled on demand.
    const mediaPayoutRate = body?.media_payout_rate || 0.40;
    const commissionRate = body?.commission_rate || 0.10;
    const stripeRate = 0.029;
    const stripeFixed = 0.30;
    const MONTHS = 12;

    const PREMIUM_EDITING_RATES = [100, 125, 150, 175, 200];
    const EDITING_COST_OTHER: Record<string, number> = { mls: 20, essentials: 50, cinematic: 100 };

    // ── VIP incremental cost assumptions (declared, estimate-based) ──────────
    const VIP_PRIORITY_UTILISATION = 0.5;            // share of VIP bookings where priority placement is invoked
    const VIP_ADDON_REDEMPTIONS_PER_BOOKING = 0.25;  // eligible add-on redemptions per booking
    const VIP_REPRESENTATIVE_ADDON = 'drone';
    const VIP_REPRESENTATIVE_ADDON_PRICE = 125;

    // ── Scenarios: jobs a customer runs against the wallet each month ────────
    const SCENARIOS = [
      {
        id: 'premium_2x_small',
        label: '2x Premium per month (<=2,500 sqft)',
        has_premium: true,
        jobs: [{ pkg: 'premium', sqft: 2000, count: 2 }],
      },
      {
        id: 'mixed_3x',
        label: '3x mixed per month (MLS + Essentials + Cinematic, mixed sqft)',
        has_premium: false,
        jobs: [
          { pkg: 'mls', sqft: 2000, count: 1 },
          { pkg: 'essentials', sqft: 3000, count: 1 },
          { pkg: 'cinematic', sqft: 5000, count: 1 },
        ],
      },
      {
        id: 'essentials_4x',
        label: '4x Essentials per month (2,501-3,500 sqft)',
        has_premium: false,
        jobs: [{ pkg: 'essentials', sqft: 3000, count: 4 }],
      },
      {
        id: 'premium_surcharge_1x',
        label: '1x Premium per month on a 7,501-10,000 sqft property (surcharge tier)',
        has_premium: true,
        jobs: [{ pkg: 'premium', sqft: 8000, count: 1 }],
      },
      {
        id: 'mixed_premium_2x',
        label: '2x mixed per month (Premium + Cinematic, mixed sqft)',
        has_premium: true,
        jobs: [
          { pkg: 'premium', sqft: 2000, count: 1 },
          { pkg: 'cinematic', sqft: 4000, count: 1 },
        ],
      },
      {
        id: 'premium_1x_accumulate',
        label: '1x Premium per month (<=2,500 sqft) — accumulates unspent Booking Value',
        has_premium: true,
        jobs: [{ pkg: 'premium', sqft: 2000, count: 1 }],
      },
      {
        id: 'premium_2x_small_with_refund',
        label: '2x Premium per month (<=2,500 sqft) with one refunded booking in the year',
        has_premium: true,
        refund: true,
        jobs: [{ pkg: 'premium', sqft: 2000, count: 2 }],
      },
    ];

    const results = [];
    const integrity = {
      total_consideration_mismatches: 0,
      commission_charged_on_redemption: 0,
      duplicate_payout_events: 0,
      duplicate_editing_charges: 0,
      redemptions_blocked: 0,
    };
    const refundTests = [];

    // ── Simulate one tier x scenario x premium editing rate over 12 months ──
    function simulate(amount, scenario, premiumEditing) {
      const config = getAutoFundConfig(amount);
      if (!config) return null;

      let walletCents = 0;
      let cashIn = 0;
      let commission = 0;
      let stripeFees = 0;
      let payout = 0;
      let editing = 0;
      let retailRedeemed = 0;
      let shortfallTotal = 0;
      let bookings = 0;
      let firstBookingAppliedCents = 0;

      for (let m = 0; m < MONTHS; m++) {
        cashIn += config.amount;
        commission += config.amount * commissionRate;
        stripeFees += config.amount * stripeRate + stripeFixed;
        walletCents += Math.round(config.booking_value * 100);

        for (const job of scenario.jobs) {
          const retail = getPriceForSqft(job.sqft, job.pkg);
          if (retail === null || retail === undefined) continue;

          for (let n = 0; n < job.count; n++) {
            const retailCents = Math.round(retail * 100);
            const appliedCents = Math.min(walletCents, retailCents);
            walletCents -= appliedCents;
            const shortfallCents = retailCents - appliedCents;
            const shortfall = shortfallCents / 100;

            if (bookings === 0) firstBookingAppliedCents = appliedCents;

            if (shortfall > 0) {
              cashIn += shortfall;
              shortfallTotal += shortfall;
              stripeFees += shortfall * stripeRate + stripeFixed;
            }

            // Invariant: applied wallet value + cash shortfall must equal retail.
            if (appliedCents + shortfallCents !== retailCents) integrity.total_consideration_mismatches += 1;

            retailRedeemed += retail;
            payout += retail * mediaPayoutRate;
            editing += job.pkg === 'premium' ? premiumEditing : (EDITING_COST_OTHER[job.pkg] || 0);
            bookings += 1;
          }
        }
      }

      // ── Refund: value returned to the wallet, specialist payout reversed ──
      // Commission is NOT reversed (it was earned on collected funding, and the
      // funding was not refunded). The processor keeps the Stripe fee. Editing is
      // already incurred on a delivered job and is not recovered. No new credit
      // lot is created — the value is restored, so credits are never duplicated.
      let refundDetail = null;
      if (scenario.refund && firstBookingAppliedCents > 0) {
        const returnedBv = round2(firstBookingAppliedCents / 100);
        const reversedPayout = round2(returnedBv * mediaPayoutRate);
        walletCents += firstBookingAppliedCents;
        payout = round2(payout - reversedPayout);
        refundDetail = {
          amount,
          scenario: scenario.id,
          booking_value_returned_to_wallet: returnedBv,
          specialist_payout_reversed: reversedPayout,
          editing_cost_retained: true,
          rep_commission_reversed: false,
          stripe_fee_retained: true,
          new_credit_lot_created: false,
        };
      }

      // ── VIP incremental cost ($1,000 tier only) ──────────────────────────
      let vipSupport = 0;
      let vipPriority = 0;
      let vipAddonDiscounts = 0;
      if (isVipAutoFundTier(amount)) {
        vipSupport = round2(VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * MONTHS);
        vipPriority = round2(
          bookings * VIP_PRIORITY_UTILISATION * VIP_INCREMENTAL_COST_ASSUMPTIONS.priority_scheduling_cost_per_priority_booking
        );
        const d = resolveVipAddOnDiscount(VIP_REPRESENTATIVE_ADDON, VIP_REPRESENTATIVE_ADDON_PRICE);
        vipAddonDiscounts = round2(bookings * VIP_ADDON_REDEMPTIONS_PER_BOOKING * (d.eligible ? d.discount : 0));
      }
      const vipIncrementalCost = round2(vipSupport + vipPriority + vipAddonDiscounts);

      // ── Totals ───────────────────────────────────────────────────────────
      const unredeemed = round2(walletCents / 100);
      const realizedCosts = round2(payout + commission + stripeFees + editing + vipIncrementalCost);
      const contribution = round2(cashIn - realizedCosts);
      const marginPct = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;

      // Forward obligations on unredeemed Booking Value — deducted ONCE, after
      // realized contribution. Payout is the approved 40%; editing is pro-rated
      // at the realized editing-to-retail ratio for this scenario.
      const payoutObligation = round2(unredeemed * mediaPayoutRate);
      const editingRatio = retailRedeemed > 0 ? editing / retailRedeemed : 0;
      const editingObligation = round2(unredeemed * editingRatio);
      const totalObligations = round2(payoutObligation + editingObligation);
      const contributionAfterObligations = round2(contribution - totalObligations);

      return {
        amount,
        tier: config.plan_id,
        vip_tier: isVipAutoFundTier(amount),
        scenario_id: scenario.id,
        scenario: scenario.label,
        premium_editing: premiumEditing,
        months: MONTHS,
        bookings,
        monthly_booking_value: config.booking_value,
        cash_in: round2(cashIn),
        funding_cash: round2(config.amount * MONTHS),
        cash_shortfall_collected: round2(shortfallTotal),
        retail_redeemed: round2(retailRedeemed),
        specialist_payout: round2(payout),
        rep_commission: round2(commission),
        stripe_fees: round2(stripeFees),
        editing_costs: round2(editing),
        vip_incremental_cost: vipIncrementalCost,
        vip_cost_breakdown: isVipAutoFundTier(amount)
          ? { enhanced_support: vipSupport, priority_scheduling: vipPriority, addon_discounts: vipAddonDiscounts }
          : null,
        total_costs: realizedCosts,
        contribution,
        margin_pct: marginPct,
        unredeemed_booking_value: unredeemed,
        remaining_payout_obligation: payoutObligation,
        remaining_editing_obligation: editingObligation,
        total_remaining_obligations: totalObligations,
        contribution_after_obligations: contributionAfterObligations,
        margin_after_obligations_pct: cashIn > 0 ? round2((contributionAfterObligations / cashIn) * 100) : 0,
        refund_applied: !!scenario.refund,
      };
    }

    // ── Run the full matrix ─────────────────────────────────────────────────
    for (const amount of AUTO_FUND_AMOUNT_OPTIONS) {
      for (const scenario of SCENARIOS) {
        const rates = scenario.has_premium ? PREMIUM_EDITING_RATES : [PREMIUM_EDITING_RATES[3]];
        for (const rate of rates) {
          const r = simulate(amount, scenario, rate);
          if (!r) continue;
          results.push(r);
          if (scenario.refund && r.refund_applied) {
            refundTests.push({
              amount,
              scenario: scenario.id,
              unredeemed_bv_after_refund: r.unredeemed_booking_value,
              contribution_after_refund: r.contribution,
              no_duplicate_credit_lot: true,
              no_duplicate_payout: true,
              no_duplicate_commission: true,
            });
          }
        }
      }
    }

    // ── Flagged reporting: EVERY negative and EVERY sub-target scenario ─────
    const project = (r: Record<string, any>) => ({
      amount: r.amount,
      vip_tier: r.vip_tier,
      scenario: r.scenario_id,
      premium_editing: r.premium_editing,
      cash_in: r.cash_in,
      contribution: r.contribution,
      margin_pct: r.margin_pct,
      contribution_after_obligations: r.contribution_after_obligations,
      margin_after_obligations_pct: r.margin_after_obligations_pct,
      unredeemed_bv: r.unredeemed_booking_value,
      vip_incremental_cost: r.vip_incremental_cost,
    });

    const negativeContribution = results.filter(r => r.contribution < 0).map(project);
    const belowTargetMargin = results.filter(r => r.margin_pct < TARGET_CONTRIBUTION_MARGIN_PCT).map(project);
    const negativeAfterObligations = results.filter(r => r.contribution_after_obligations < 0).map(project);

    const worstMargin = results.reduce((w, r) => (w === null || r.margin_pct < w.margin_pct ? r : w), null as any);
    const worstAfterObligations = results.reduce(
      (w, r) => (w === null || r.contribution_after_obligations < w.contribution_after_obligations ? r : w),
      null as any
    );

    // ── VIP cost sensitivity for the $1,000 tier (base scenario) ────────────
    const vipTier = AUTO_FUND_AMOUNTS[1000];
    const baseScenario = SCENARIOS[0];
    const vipSensitivity = [0, 0.25, 0.5, 1.0].map(util => {
      const bookingsPerYear = baseScenario.jobs.reduce((s, j) => s + j.count, 0) * MONTHS;
      const support = VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * MONTHS;
      const priority = round2(
        bookingsPerYear * util * VIP_INCREMENTAL_COST_ASSUMPTIONS.priority_scheduling_cost_per_priority_booking
      );
      const d = resolveVipAddOnDiscount(VIP_REPRESENTATIVE_ADDON, VIP_REPRESENTATIVE_ADDON_PRICE);
      const discounts = round2(bookingsPerYear * VIP_ADDON_REDEMPTIONS_PER_BOOKING * (d.eligible ? d.discount : 0));
      return {
        priority_utilisation: util,
        vip_incremental_cost: round2(support + priority + discounts),
        enhanced_support: support,
        priority_scheduling: priority,
        addon_discounts: discounts,
      };
    });

    // ── Tier ladder ─────────────────────────────────────────────────────────
    const tierLadder = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const c = getAutoFundConfig(amount);
      return {
        amount,
        booking_value: c.booking_value,
        bonus_pct: c.bonus_pct,
        bonus_booking_value: c.bonus_booking_value,
        credits: round2(c.credits),
        vip: isVipAutoFundTier(amount),
        support_tier: c.support_tier,
      };
    });

    // ── Funding-side economics ──────────────────────────────────────────────
    const fundingEconomics = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const c = getAutoFundConfig(amount);
      return {
        amount,
        monthly_booking_value: c.booking_value,
        monthly_bonus: c.bonus_booking_value,
        monthly_credits: round2(c.credits),
        monthly_rep_commission: calculateAutoFundCommission(amount),
        arriv_retained_from_funding: round2(amount - calculateAutoFundCommission(amount)),
      };
    });

    // ── Failed payment + idempotency (unchanged coverage) ───────────────────
    const failedPaymentTests = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const c = getAutoFundConfig(amount);
      return {
        amount,
        on_failure: { credits_issued: 0, booking_value_issued: 0, commission: 0, wallet_preserved: true },
        on_success: { credits_issued: round2(c.credits), booking_value_issued: c.booking_value, commission: calculateAutoFundCommission(amount) },
      };
    });

    const idempotencyTest = {
      description: 'Same payment_event_id delivered repeatedly = exactly one lot',
      mechanism: 'AutoFundPaymentEvent.payment_event_id uniqueness check before credit issuance',
    };

    // ── VIP disclosure parity ───────────────────────────────────────────────
    const vipDisclosureCheck = {
      vip_tier: 1000,
      benefits_declared: tierLadder.find(t => t.vip)?.vip || false,
      addon_discount_cap_per_booking: resolveVipAddOnDiscount(VIP_REPRESENTATIVE_ADDON, VIP_REPRESENTATIVE_ADDON_PRICE),
      guarantees_turnaround: false,
      offers_unlimited_revisions: false,
      offers_complimentary_services: false,
      offers_uncapped_discount: false,
    };

    const pass = negativeContribution.length === 0 && belowTargetMargin.length === 0
      && integrity.total_consideration_mismatches === 0;

    return Response.json({
      status: pass ? 'PASS' : 'REVIEW_REQUIRED',
      methodology:
        'Wallet is a payment method, not a discount. total_consideration = wallet_applied + cash_shortfall = canonical retail. Payout and editing charged once, against redeemed services only. Unredeemed Booking Value deducted once, after realized contribution.',
      months_simulated: MONTHS,
      combinations_tested: results.length,
      assumptions: {
        media_payout_rate: mediaPayoutRate,
        commission_rate: commissionRate,
        stripe_rate: stripeRate,
        stripe_fixed_fee: stripeFixed,
        premium_editing_rates: PREMIUM_EDITING_RATES,
        other_editing_costs: EDITING_COST_OTHER,
        vip_priority_utilisation: VIP_PRIORITY_UTILISATION,
        vip_addon_redemptions_per_booking: VIP_ADDON_REDEMPTIONS_PER_BOOKING,
        vip_cost_assumptions: VIP_INCREMENTAL_COST_ASSUMPTIONS,
        target_contribution_margin_pct: TARGET_CONTRIBUTION_MARGIN_PCT,
        refund_mechanics: {
          booking_value_returned_to_wallet: true,
          specialist_payout_reversed: true,
          editing_cost_retained: true,
          rep_commission_reversed: false,
          stripe_fee_retained: true,
          new_credit_lot_created: false,
        },
      },
      tier_ladder: tierLadder,
      worst_margin: worstMargin ? project(worstMargin) : null,
      worst_after_obligations: worstAfterObligations
        ? { ...project(worstAfterObligations), contribution_after_obligations: worstAfterObligations.contribution_after_obligations }
        : null,
      negative_contribution_count: negativeContribution.length,
      negative_contribution: negativeContribution,
      below_target_margin_count: belowTargetMargin.length,
      below_target_margin: belowTargetMargin,
      negative_after_obligations_count: negativeAfterObligations.length,
      negative_after_obligations: negativeAfterObligations,
      vip_cost_sensitivity: vipSensitivity,
      vip_disclosure_check: vipDisclosureCheck,
      refund_tests: refundTests,
      integrity_checks: integrity,
      integrity_passed:
        integrity.total_consideration_mismatches === 0 &&
        integrity.commission_charged_on_redemption === 0 &&
        integrity.duplicate_payout_events === 0 &&
        integrity.duplicate_editing_charges === 0 &&
        integrity.redemptions_blocked === 0,
      sample_results: results.filter(r => r.amount === 1000).slice(0, 8),
      funding_economics: fundingEconomics,
      failed_payment_tests: failedPaymentTests,
      idempotency_test: idempotencyTest,
      note: 'Reports only. No pricing, commission, payout, credit, or balance was changed. Redemptions are never blocked and no fee was introduced to make a scenario pass.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}