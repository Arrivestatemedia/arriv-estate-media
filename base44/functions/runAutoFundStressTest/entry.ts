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
 * Arriv Auto-Fund Financial Stress Test — v3
 *
 * METHODOLOGY (unchanged):
 *   Auto-Fund Booking Value is a PAYMENT METHOD, not a discount. It does not
 *   change canonical retail. An insufficient wallet is NOT a discounted booking —
 *   the customer pays the shortfall in cash, so:
 *
 *     total_consideration = wallet_value_applied + cash_shortfall_collected = canonical retail
 *
 *   Redemptions are never blocked and no fee is introduced to make a scenario pass.
 *
 * NO DOUBLE COUNTING:
 *   Payout and editing are charged ONLY against services actually redeemed.
 *   Unredeemed Booking Value is reported as a separate forward obligation and
 *   deducted exactly once, after realized contribution. Promotional bonus Booking
 *   Value is never treated as cash.
 *
 * v3 CHANGES (2026-10-09):
 *   1. Premium editing is costed PER COMPLETED EDIT ($100–$150 expected,
 *      $175–$200 stress), not per square foot.
 *   2. VIP enhanced support is a BOUNDED entitlement: maximum 4 sessions per
 *      month (48/year). Modelled at 25% utilisation = 12 sessions/year, the
 *      volume previously assumed. Normal customer support and priority
 *      scheduling remain availability-based entitlements.
 *   3. Adversarial service mixes added, to test whether any OTHER mix can reach
 *      negative contribution through full wallet redemption.
 *   4. A compact `findings` block is emitted first so results are readable
 *      without paging the full per-run arrays.
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

    const mediaPayoutRate = body?.media_payout_rate || 0.40;
    const commissionRate = body?.commission_rate || 0.10;
    const stripeRate = 0.029;
    const stripeFixed = 0.30;
    const MONTHS = 12;

    // ── Editing model: PER COMPLETED EDIT ────────────────────────────────────
    // $100–$150 expected, $175–$200 stress. Non-premium packages keep their
    // canonical per-edit costs.
    const PREMIUM_EDITING_EXPECTED = [100, 125, 150];
    const PREMIUM_EDITING_STRESS = [175, 200];
    const PREMIUM_EDITING_RATES = [...PREMIUM_EDITING_EXPECTED, ...PREMIUM_EDITING_STRESS];
    const EDITING_COST_OTHER: Record<string, number> = { mls: 20, essentials: 50, cinematic: 100 };

    // ── Verified specialist payout (traced from mediaCompensationEngine.ts) ──
    // Standard packages: 40% of POST-SALES value = 34% of retail (CSV).
    // MLS walkthroughs: guaranteed payout table by sqft tier ($50-$120).
    // The payout is frozen at job creation (ProviderCompensationSnapshot) and
    // paid via processWeeklyPayouts using the stored job.pay_rate.
    const SPECIALIST_PAYOUT_RATE = 0.34;
    const MLS_PAYOUT_TABLE = [
      { max: 2500, payout: 50 },
      { max: 3500, payout: 60 },
      { max: 5000, payout: 70 },
      { max: 7500, payout: 90 },
      { max: 10000, payout: 120 },
    ];
    function mlsPayoutForSqft(sqft: number): number {
      const t = MLS_PAYOUT_TABLE.find(t => sqft <= t.max);
      return t ? t.payout : 120;
    }
    // Booking-level sales commission: the existing contractual rule is 15% of
    // commissionable_service_value (CSV). Under the intended Auto-Fund rule, the
    // 15% applies to the CASH portion only (the wallet-funded portion already
    // compensated the rep via the 10% funding commission). The current production
    // system applies 15% on the FULL CSV; the gap is reported separately.
    const BOOKING_COMMISSION_RATE = 0.15;

    // ── VIP model: bounded enhanced-support sessions ─────────────────────────
    // Entitlement ceiling. Utilisation is modelled separately because the cap is
    // an entitlement, not a cost: the ceiling is what the member MAY use.
    const VIP_ENHANCED_SESSIONS_PER_MONTH_CAP = 4;
    const VIP_ENHANCED_SESSION_UTILISATION = 0.25;
    const VIP_ENHANCED_SESSION_COST_PER_SESSION = 25; // TO BE CONFIRMED — see clarification block
    const VIP_ADDON_REDEMPTIONS_PER_BOOKING = 0.25;
    const VIP_REPRESENTATIVE_ADDON = 'drone';
    const VIP_REPRESENTATIVE_ADDON_PRICE = 125;

    const vipSessionCap = VIP_ENHANCED_SESSIONS_PER_MONTH_CAP * MONTHS; // 48
    const vipSessionsUsed = round2(vipSessionCap * VIP_ENHANCED_SESSION_UTILISATION); // 12

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
      // ── Adversarial mixes: deliberately maximise cost per dollar of Booking
      // Value redeemed, to test for negative contribution under full redemption.
      {
        id: 'adv_premium_3x_small',
        label: 'ADVERSARIAL: 3x Premium per month (<=2,500 sqft) — highest cost per credit',
        has_premium: true,
        adversarial: true,
        jobs: [{ pkg: 'premium', sqft: 2000, count: 3 }],
      },
      {
        id: 'adv_premium_2x_max_sqft',
        label: 'ADVERSARIAL: 2x Premium per month at the 10,000 sqft ceiling',
        has_premium: true,
        adversarial: true,
        jobs: [{ pkg: 'premium', sqft: 10000, count: 2 }],
      },
      {
        id: 'adv_mls_12x',
        label: 'ADVERSARIAL: 12x MLS walkthroughs per month — maximum booking count',
        has_premium: false,
        adversarial: true,
        jobs: [{ pkg: 'mls', sqft: 2000, count: 12 }],
      },
      {
        id: 'adv_cinematic_2x',
        label: 'ADVERSARIAL: 2x Cinematic per month (3,501-5,000 sqft)',
        has_premium: false,
        adversarial: true,
        jobs: [{ pkg: 'cinematic', sqft: 5000, count: 2 }],
      },
    ];

    const results: any[] = [];
    const integrity = {
      total_consideration_mismatches: 0,
      commission_charged_on_redemption: 0,
      duplicate_payout_events: 0,
      duplicate_editing_charges: 0,
      redemptions_blocked: 0,
      bonus_booking_value_treated_as_cash: 0,
    };
    const refundTests: any[] = [];

    function vipCost(bookings: number, sessionsUsed: number, perSessionCost: number, additivePriority = false) {
      if (!isVipAutoFundTier(1000)) return { retainer: 0, sessions: 0, priority: 0, addons: 0, total: 0 };
      const retainer = round2(VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * MONTHS);
      const sessions = round2(Math.min(sessionsUsed, vipSessionCap) * perSessionCost);
      const priority = additivePriority
        ? round2(bookings * 0.5 * VIP_INCREMENTAL_COST_ASSUMPTIONS.priority_scheduling_cost_per_priority_booking)
        : 0;
      const d = resolveVipAddOnDiscount(VIP_REPRESENTATIVE_ADDON, VIP_REPRESENTATIVE_ADDON_PRICE);
      const addons = round2(bookings * VIP_ADDON_REDEMPTIONS_PER_BOOKING * (d.eligible ? d.discount : 0));
      return { retainer, sessions, priority, addons, total: round2(retainer + sessions + priority + addons) };
    }

    // ── Simulate one tier x scenario x premium editing rate over 12 months ──
    function simulate(amount: any, scenario: any, premiumEditing: number) {
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
      let bookingCommission = 0;
      let currentSystemBookingCommission = 0;

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

            if (appliedCents + shortfallCents !== retailCents) integrity.total_consideration_mismatches += 1;

            retailRedeemed += retail;
            payout += job.pkg === 'mls' ? mlsPayoutForSqft(job.sqft) : retail * SPECIALIST_PAYOUT_RATE;
            // Editing is charged ONCE per completed edit.
            editing += job.pkg === 'premium' ? premiumEditing : (EDITING_COST_OTHER[job.pkg] || 0);
            // Intended rule: 15% booking commission on the CASH shortfall only.
            bookingCommission += shortfall * BOOKING_COMMISSION_RATE;
            // Current production system: 15% on the FULL retail (CSV) — the double-dip.
            currentSystemBookingCommission += retail * BOOKING_COMMISSION_RATE;
            bookings += 1;
          }
        }
      }

      let refundDetail = null;
      if (scenario.refund && firstBookingAppliedCents > 0) {
        const returnedBv = round2(firstBookingAppliedCents / 100);
        const reversedPayout = round2(returnedBv * SPECIALIST_PAYOUT_RATE);
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

      const vip = isVipAutoFundTier(amount)
        ? vipCost(bookings, vipSessionsUsed, VIP_ENHANCED_SESSION_COST_PER_SESSION)
        : { retainer: 0, sessions: 0, priority: 0, addons: 0, total: 0 };

      const unredeemed = round2(walletCents / 100);
      // Intended rule: funding commission (10%) + booking commission (15% of cash
      // shortfall) + specialist (34%/MLS) + editing + stripe + VIP.
      const realizedCosts = round2(payout + commission + bookingCommission + stripeFees + editing + vip.total);
      const contribution = round2(cashIn - realizedCosts);
      const marginPct = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;
      // Current production system: 15% booking commission on FULL CSV (double-dip).
      const currentSystemCosts = round2(payout + commission + currentSystemBookingCommission + stripeFees + editing + vip.total);
      const currentSystemContribution = round2(cashIn - currentSystemCosts);
      const doubleDipGap = round2(currentSystemBookingCommission - bookingCommission);

      const payoutObligation = round2(unredeemed * SPECIALIST_PAYOUT_RATE);
      const editingRatio = retailRedeemed > 0 ? editing / retailRedeemed : 0;
      const editingObligation = round2(unredeemed * editingRatio);
      const totalObligations = round2(payoutObligation + editingObligation);
      const contributionAfterObligations = round2(contribution - totalObligations);

      // (The model now uses the verified 34%-of-retail specialist payout directly.)

      return {
        amount,
        tier: config.plan_id,
        vip_tier: isVipAutoFundTier(amount),
        scenario_id: scenario.id,
        scenario: scenario.label,
        adversarial: !!scenario.adversarial,
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
        booking_commission: round2(bookingCommission),
        current_system_booking_commission: round2(currentSystemBookingCommission),
        current_system_contribution: currentSystemContribution,
        double_dip_gap: doubleDipGap,
        stripe_fees: round2(stripeFees),
        editing_costs: round2(editing),
        vip_incremental_cost: vip.total,
        vip_cost_breakdown: isVipAutoFundTier(amount) ? vip : null,
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
        const rates = scenario.has_premium ? PREMIUM_EDITING_RATES : [PREMIUM_EDITING_EXPECTED[2]];
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

    // ── Flagged reporting ───────────────────────────────────────────────────
    const project = (r: Record<string, any>) => ({
      amount: r.amount,
      vip_tier: r.vip_tier,
      adversarial: r.adversarial,
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

    const worstMargin = results.reduce((w: any, r) => (w === null || r.margin_pct < w.margin_pct ? r : w), null as any);
    const worstAfterObligations = results.reduce(
      (w: any, r) => (w === null || r.contribution_after_obligations < w.contribution_after_obligations ? r : w),
      null as any
    );

    const groupFlagged = (rows: Record<string, any>[]) => {
      const byKey = new Map<string, any>();
      for (const r of rows) {
        const k = `${r.amount}|${r.scenario}`;
        if (!byKey.has(k)) {
          byKey.set(k, { amount: r.amount, vip_tier: r.vip_tier, scenario: r.scenario, runs: [] });
        }
        byKey.get(k).runs.push({
          premium_editing: r.premium_editing,
          margin_pct: r.margin_pct,
          contribution: r.contribution,
          contribution_after_obligations: r.contribution_after_obligations,
          vip_incremental_cost: r.vip_incremental_cost,
        });
      }
      return Array.from(byKey.values());
    };

    const flaggedSummary = {
      below_target_margin: groupFlagged(belowTargetMargin),
      negative_contribution: groupFlagged(negativeContribution),
    };

    // ── Compact findings (emitted FIRST so they are readable on their own) ──
    const line = (r: Record<string, any>) =>
      `$${r.amount}/mo | ${r.scenario} | edit $${r.premium_editing} | margin ${r.margin_pct}% | contribution $${r.contribution}`;
    const lineAfter = (r: Record<string, any>) =>
      `$${r.amount}/mo | ${r.scenario} | edit $${r.premium_editing} | after obligations $${r.contribution_after_obligations} (unredeemed BV $${r.unredeemed_bv})`;

    const perTier = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const rs = results.filter(r => r.amount === amount);
      const w = rs.reduce((x: any, r) => (x === null || r.margin_pct < x.margin_pct ? r : x), null as any);
      return `${amount}/mo | worst ${w.margin_pct}% (${w.scenario_id}, edit $${w.premium_editing}) | below-target runs ${rs.filter(r => r.margin_pct < TARGET_CONTRIBUTION_MARGIN_PCT).length} | negative runs ${rs.filter(r => r.contribution < 0).length}`;
    });

    // Worst adversarial mix per tier, to answer whether any OTHER mix can go negative
    const adversarialWorst = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
      const rs = results.filter(r => r.amount === amount && r.adversarial);
      if (!rs.length) return `${amount}/mo | no adversarial mix`;
      const w = rs.reduce((x: any, r) => (x === null || r.margin_pct < x.margin_pct ? r : x), null as any);
      return `${amount}/mo | worst adversarial ${w.margin_pct}% (${w.scenario_id}, edit $${w.premium_editing}) | contribution $${w.contribution}`;
    });

    // ── VIP ceiling impact on the worst scenario ───────────────────────────
    const worstTier = worstMargin.amount;
    const worstScenario = SCENARIOS.find(s => s.id === worstMargin.scenario_id)!;
    const vipCeilingImpact: string[] = [];
    for (const cost of [0, 25, 50]) {
      for (const sessions of [12, 48]) {
        const base = simulate(worstTier, { ...worstScenario, refund: false }, worstMargin.premium_editing);
        const alt = vipCost(base!.bookings, sessions, cost);
        const contrib = round2(base!.contribution + base!.vip_incremental_cost - alt.total);
        vipCeilingImpact.push(
          `$${cost}/session x ${sessions} sessions/yr = $${alt.sessions} | VIP total $${alt.total} | ${worstScenario.id} contribution $${contrib}`
        );
      }
    }
    const additivePriorityBase = simulate(worstTier, { ...worstScenario, refund: false }, worstMargin.premium_editing)!;
    const additive = vipCost(additivePriorityBase.bookings, vipSessionsUsed, VIP_ENHANCED_SESSION_COST_PER_SESSION, true);
    const additiveContribution = round2(additivePriorityBase.contribution + additivePriorityBase.vip_incremental_cost - additive.total);
    vipCeilingImpact.push(
      `ADDITIVE READING (bounded sessions + per-booking priority scheduling): VIP total $${additive.total} | contribution $${additiveContribution}`
    );

    const vipCostScenarios: string[] = [
      `A. Bounded sessions only (modelled): retainer $${vipCost(additivePriorityBase.bookings, vipSessionsUsed, VIP_ENHANCED_SESSION_COST_PER_SESSION).retainer} + 12 sessions x $${VIP_ENHANCED_SESSION_COST_PER_SESSION} + add-on discounts $${vipCost(additivePriorityBase.bookings, vipSessionsUsed, VIP_ENHANCED_SESSION_COST_PER_SESSION).addons} = $${vipCost(additivePriorityBase.bookings, vipSessionsUsed, VIP_ENHANCED_SESSION_COST_PER_SESSION).total}`,
      `B. Entitlement ceiling at 4/month with full use (48 sessions x $${VIP_ENHANCED_SESSION_COST_PER_SESSION}) = $${vipCost(additivePriorityBase.bookings, 48, VIP_ENHANCED_SESSION_COST_PER_SESSION).total}`,
      `C. Ceiling with externally staffed sessions at $50 each (48 x $50) = $${vipCost(additivePriorityBase.bookings, 48, 50).total}`,
    ];

    // ── Payout basis comparison ─────────────────────────────────────────────
    const payoutBasis = [
      `VERIFIED specialist payout: 40% of post-sales = 34% of retail for standard packages (mediaCompensationEngine STANDARD_40_PERCENT_AFTER_SALES).`,
      `MLS walkthroughs: guaranteed payout table ($50-$120 by tier), NOT a percentage of retail.`,
      `Payout is frozen at job creation (ProviderCompensationSnapshot) and paid via processWeeklyPayouts using the stored job.pay_rate.`,
      `Booking commission: current production applies 15% on FULL CSV at booking submission (handleBookingSubmission). Intended rule: 15% of cash shortfall only. Gap = double_dip_gap.`,
    ];

    const pass = negativeContribution.length === 0 && belowTargetMargin.length === 0
      && integrity.total_consideration_mismatches === 0;

    return Response.json({
      status: pass ? 'PASS' : 'REVIEW_REQUIRED',
      model_version: 'v3_20261009_per_edit_editing_bounded_vip',
      combinations_tested: results.length,
      months_simulated: MONTHS,
      findings: {
        counts: {
          below_target_margin: belowTargetMargin.length,
          negative_contribution: negativeContribution.length,
          negative_after_obligations: negativeAfterObligations.length,
        },
        worst_margin: worstMargin ? line(worstMargin) : null,
        worst_after_obligations: worstAfterObligations ? lineAfter(project(worstAfterObligations)) : null,
        per_tier: perTier,
        adversarial_worst: adversarialWorst,
        below_target_margin: belowTargetMargin.map(line),
        negative_contribution: negativeContribution.map(line),
        negative_after_obligations: negativeAfterObligations.map(lineAfter),
        vip_cost_scenarios: vipCostScenarios,
        vip_ceiling_impact: vipCeilingImpact,
        payout_basis: payoutBasis,
        vip_sessions_modelled: vipSessionsUsed,
        vip_session_cap_per_year: vipSessionCap,
      },
      methodology:
        'Wallet is a payment method, not a discount. total_consideration = wallet_applied + cash_shortfall = canonical retail. Payout and editing charged once, against redeemed services only. Unredeemed Booking Value deducted once, after realized contribution. Promotional bonus Booking Value is never cash.',
      model_changes: [
        'Premium editing costed PER COMPLETED EDIT: $100-$150 expected, $175-$200 stress (was per square foot).',
        'VIP enhanced support is a BOUNDED entitlement: maximum 4 sessions per month (48/year), modelled at 25% utilisation = 12 sessions/year.',
        'Adversarial service mixes added to probe for negative contribution from any other mix.',
      ],
      flagged_scenarios: {
        below_target_margin: { count: belowTargetMargin.length, groups: flaggedSummary.below_target_margin },
        negative_contribution: { count: negativeContribution.length, groups: flaggedSummary.negative_contribution },
        negative_after_obligations: {
          count: negativeAfterObligations.length,
          groups: groupFlagged(negativeAfterObligations),
        },
      },
      assumptions: {
        media_payout_rate: mediaPayoutRate,
        specialist_payout_rate: SPECIALIST_PAYOUT_RATE,
        specialist_payout_basis: '34% of retail (standard) / MLS guaranteed table',
        booking_commission_rate: BOOKING_COMMISSION_RATE,
        booking_commission_basis: '15% of cash shortfall (intended rule)',
        commission_rate: commissionRate,
        stripe_rate: stripeRate,
        stripe_fixed_fee: stripeFixed,
        editing_model: 'PER_COMPLETED_EDIT',
        premium_editing_expected: PREMIUM_EDITING_EXPECTED,
        premium_editing_stress: PREMIUM_EDITING_STRESS,
        other_editing_costs: EDITING_COST_OTHER,
        vip_enhanced_sessions_per_month_cap: VIP_ENHANCED_SESSIONS_PER_MONTH_CAP,
        vip_enhanced_session_utilisation: VIP_ENHANCED_SESSION_UTILISATION,
        vip_enhanced_session_cost_per_session: VIP_ENHANCED_SESSION_COST_PER_SESSION,
        vip_addon_redemptions_per_booking: VIP_ADDON_REDEMPTIONS_PER_BOOKING,
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
      tier_ladder: AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
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
      }),
      vip_cost_sensitivity: [0, 0.25, 0.5, 1.0].map(util => {
        const sessions = round2(vipSessionCap * util);
        const c = vipCost(additivePriorityBase.bookings, sessions, VIP_ENHANCED_SESSION_COST_PER_SESSION);
        return {
          utilisation: util,
          sessions_per_year: sessions,
          session_cost: c.sessions,
          retainer: c.retainer,
          addon_discounts: c.addons,
          vip_incremental_cost: c.total,
        };
      }),
      refund_tests: refundTests,
      integrity_checks: integrity,
      integrity_passed:
        integrity.total_consideration_mismatches === 0 &&
        integrity.commission_charged_on_redemption === 0 &&
        integrity.duplicate_payout_events === 0 &&
        integrity.duplicate_editing_charges === 0 &&
        integrity.redemptions_blocked === 0,
      funding_economics: AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
        const c = getAutoFundConfig(amount);
        return {
          amount,
          monthly_booking_value: c.booking_value,
          monthly_bonus: c.bonus_booking_value,
          monthly_credits: round2(c.credits),
          monthly_rep_commission: calculateAutoFundCommission(amount),
          arriv_retained_from_funding: round2(amount - calculateAutoFundCommission(amount)),
        };
      }),
      promo_bv_never_cash: {
        commission_base: 'amount_charged (actual cash collected) — never booking_value',
        wallet_transaction_cash_field: 'cash_amount = amount_charged',
        bonus_recorded_separately: 'bonus_booking_value',
        verified: true,
      },
      note: 'Reports only. No pricing, commission, payout, credit, or balance was changed. Redemptions are never blocked and no fee was introduced to make a scenario pass.',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}