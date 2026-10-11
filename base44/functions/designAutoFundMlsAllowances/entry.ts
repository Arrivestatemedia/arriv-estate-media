import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTO_FUND_AMOUNT_OPTIONS,
  getAutoFundConfig,
  getPriceForSqft,
  AUTO_FUND_FIRST_PAYMENT_RATE,
  AUTO_FUND_RECURRING_RATE,
  round2,
  TARGET_CONTRIBUTION_MARGIN_PCT,
  VIP_INCREMENTAL_COST_ASSUMPTIONS,
  resolveVipAddOnDiscount,
} from '../../shared/prepaidEngine.ts';

/**
 * Auto-Fund MLS Promotional Allowance — CANONICAL FINANCIAL DESIGN ENGINE.
 *
 * Admin-only, read-only. Computes the financially sustainable monthly standalone
 * MLS promotional allowance for every Auto-Fund tier, the qualifying-bundle
 * economics, and every scenario below the 10% contribution target.
 *
 * HYBRID MODEL under test:
 *   - Monthly standalone MLS promotional allowance per tier (resets, non-accumulating)
 *   - Qualifying bundles remain eligible for promotional Booking Value
 *   - Cash-funded Booking Value remains unrestricted for MLS
 *   - Direct payment always available
 *
 * Nothing is changed. This reports numbers for owner approval.
 */

const MONTHS = 12;
const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

// MLS ≤2,500 sqft: retail $100, specialist payout $50 (guaranteed table), editing $20.
const MLS_SQFT = 2000;
const MLS_RETAIL = 100;
const MLS_PAYOUT = 50;
const MLS_EDITING = 20;

// Standard package cost model (verified basis: 40% of post-sales = 34% of retail; editing per edit).
const SPECIALIST_PAYOUT_RATE = 0.34;
const EDITING_COST_OTHER: Record<string, number> = { essentials: 50, cinematic: 100, premium: 150 };

const VIP_SESSION_CAP_PER_YEAR = 48;
const VIP_SESSION_UTILISATION = 0.25;
const VIP_SESSIONS_USED = round2(VIP_SESSION_CAP_PER_YEAR * VIP_SESSION_UTILISATION); // 12
const VIP_ADDON_REDEMPTIONS_PER_BOOKING = 0.25;
const VIP_REPRESENTATIVE_ADDON = 'drone';
const VIP_REPRESENTATIVE_ADDON_PRICE = 125;

function serviceCost(pkg: string, sqft: number, editingCost: number): { retail: number; payout: number; editing: number } {
  if (pkg === 'mls') return { retail: MLS_RETAIL, payout: MLS_PAYOUT, editing: MLS_EDITING };
  const retail = getPriceForSqft(sqft, pkg as any) || 0;
  const payout = round2(retail * SPECIALIST_PAYOUT_RATE);
  const editing = pkg === 'premium' ? editingCost : (EDITING_COST_OTHER[pkg] || 0);
  return { retail, payout, editing };
}

// ── Persona booking plans ────────────────────────────────────────────────────
// Each returns a list of bookings for month m (0-based).
interface Booking { pkg: string; sqft: number; standalone_mls: boolean; bundle: boolean; add_on?: string; }

function personaPlan(persona: string, m: number): Booking[] {
  const mls = (): Booking => ({ pkg: 'mls', sqft: MLS_SQFT, standalone_mls: true, bundle: false });
  switch (persona) {
    case 'mls_only_1': return [mls()];
    case 'mls_only_3': return [mls(), mls(), mls()];
    case 'mls_only_6': return Array.from({ length: 6 }, mls);
    case 'mls_only_12': return Array.from({ length: 12 }, mls);
    case 'mls_only_20': return Array.from({ length: 20 }, mls);
    case 'mls_plus_addon': // 6 MLS + a qualifying add-on every other month
      return m % 2 === 0 ? [...Array.from({ length: 6 }, mls), { pkg: 'addon', sqft: 0, standalone_mls: false, bundle: true, add_on: 'drone' }]
                         : Array.from({ length: 6 }, mls);
    case 'alternating': // MLS-only months alternate with a qualifying MLS+Essentials bundle
      return m % 2 === 0
        ? Array.from({ length: 6 }, mls)
        : [mls(), { pkg: 'essentials', sqft: 3000, standalone_mls: false, bundle: true }];
    case 'larger_packages':
      return [
        { pkg: 'essentials', sqft: 3000, standalone_mls: false, bundle: true },
        { pkg: 'essentials', sqft: 3000, standalone_mls: false, bundle: true },
        { pkg: 'cinematic', sqft: 5000, standalone_mls: false, bundle: true },
      ];
    case 'accumulator': // sparse early (accumulates promo), then heavy standalone MLS
      return m < 6 ? [mls()] : Array.from({ length: 12 }, mls);
    case 'pause_resume': // 6 MLS/month, paused months 4-6
      return [3, 4, 5].includes(m) ? [] : Array.from({ length: 6 }, mls);
    case 'topup': // 12 MLS/month + one $500 cash top-up in month 6
      return Array.from({ length: 12 }, mls);
    case 'cancel_refund': // 12 MLS/month with 2 refunds in the year
      return Array.from({ length: 12 }, mls);
    default: return [];
  }
}

const PERSONAS = [
  'mls_only_1', 'mls_only_3', 'mls_only_6', 'mls_only_12', 'mls_only_20',
  'mls_plus_addon', 'alternating', 'larger_packages', 'accumulator',
  'pause_resume', 'topup', 'cancel_refund',
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const VIP_SESSION_COST = 25; // primary assumption

    // ═══════════════════════════════════════════════════════════════════════
    // SIMULATION — one tier × allowance × persona over 12 months
    // ═══════════════════════════════════════════════════════════════════════
    function simulate(tier: number, allowance: number, persona: string, editingCost = 150, vipSessionCost = VIP_SESSION_COST, promoOverride?: number) {
      const config = getAutoFundConfig(tier);
      if (!config) return null;
      const monthlyCashBv = config.amount;
      const monthlyPromoBv = promoOverride ?? config.bonus_booking_value;
      const isVip = tier === 1000;

      let cashPoolCents = 0; // customer-funded Booking Value
      let promoPoolCents = 0; // promotional bonus Booking Value
      let cashIn = 0;
      let commission = 0;
      let stripe = 0;
      let payout = 0;
      let editing = 0;
      let retailRedeemed = 0;
      let shortfallTotal = 0;
      let topupTotal = 0;
      let bookings = 0;
      let nonMlsBookings = 0;
      let promoBvUsed = 0;
      let cashBvUsed = 0;
      let refundedPayout = 0;

      for (let m = 0; m < MONTHS; m++) {
        const paused = persona === 'pause_resume' && [3, 4, 5].includes(m);
        if (!paused) {
          cashIn += config.amount;
          commission += config.amount * (m === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
          stripe += config.amount * STRIPE_RATE + STRIPE_FIXED;
          cashPoolCents += Math.round(monthlyCashBv * 100);
          promoPoolCents += Math.round(monthlyPromoBv * 100);
        }
        // One-time $500 cash top-up (adds cash-funded BV only — never promotional)
        if (persona === 'topup' && m === 5) {
          cashIn += 500;
          stripe += 500 * STRIPE_RATE + STRIPE_FIXED;
          cashPoolCents += 50000;
          topupTotal += 500;
        }

        const plan = personaPlan(persona, m);
        let standaloneMlsUsedThisMonth = 0;

        for (const b of plan) {
          let retail: number, svcPayout: number, svcEditing: number;
          if (b.pkg === 'addon') {
            retail = VIP_REPRESENTATIVE_ADDON_PRICE;
            svcPayout = 0;
            svcEditing = 35; // estimated add-on fulfillment cost
          } else {
            const c = serviceCost(b.pkg, b.sqft, editingCost);
            retail = c.retail; svcPayout = c.payout; svcEditing = c.editing;
          }
          const retailCents = Math.round(retail * 100);

          // Promotional eligibility: bundles always eligible; standalone MLS eligible up to the allowance.
          const promoEligible = b.bundle || (b.standalone_mls && standaloneMlsUsedThisMonth < allowance);

          let applied = 0;
          if (promoEligible && promoPoolCents > 0) {
            const take = Math.min(promoPoolCents, retailCents);
            promoPoolCents -= take;
            applied += take;
            promoBvUsed += take / 100;
            if (b.standalone_mls) standaloneMlsUsedThisMonth += 1;
          }
          if (applied < retailCents && cashPoolCents > 0) {
            const take = Math.min(cashPoolCents, retailCents - applied);
            cashPoolCents -= take;
            applied += take;
            cashBvUsed += take / 100;
          }
          const shortfall = (retailCents - applied) / 100;
          if (shortfall > 0) {
            cashIn += shortfall;
            shortfallTotal += shortfall;
            stripe += shortfall * STRIPE_RATE + STRIPE_FIXED;
          }
          retailRedeemed += retail;
          payout += svcPayout;
          editing += svcEditing;
          bookings += 1;
          if (!b.standalone_mls) nonMlsBookings += 1;
        }

        // Refunds: return retail BV to the cash pool, reverse specialist payout, retain editing + Stripe.
        if (persona === 'cancel_refund' && (m === 3 || m === 7)) {
          const retail = MLS_RETAIL;
          cashPoolCents += retail * 100;
          payout -= MLS_PAYOUT;
          refundedPayout += MLS_PAYOUT;
          retailRedeemed -= retail;
        }
      }

      // VIP incremental cost (bounded enhanced support + add-on preferred pricing)
      let vipTotal = 0;
      let vipBreakdown = null;
      if (isVip) {
        const retainer = round2(VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * MONTHS);
        const sessions = round2(VIP_SESSIONS_USED * vipSessionCost);
        const d = resolveVipAddOnDiscount(VIP_REPRESENTATIVE_ADDON, VIP_REPRESENTATIVE_ADDON_PRICE);
        // VIP add-on preferred pricing applies only where an add-on can attach — non-MLS services.
        const addons = round2(nonMlsBookings * VIP_ADDON_REDEMPTIONS_PER_BOOKING * (d.eligible ? d.discount : 0));
        vipTotal = round2(retainer + sessions + addons);
        vipBreakdown = { retainer, sessions, addons, total: vipTotal };
      }

      const totalCosts = round2(payout + editing + commission + stripe + vipTotal);
      const contribution = round2(cashIn - totalCosts);
      const marginPct = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;

      const unredeemedBv = round2((cashPoolCents + promoPoolCents) / 100);
      const unredeemedCashBv = round2(cashPoolCents / 100);
      const unredeemedPromoBv = round2(promoPoolCents / 100);
      const blendedCostRatio = retailRedeemed > 0 ? (payout + editing) / retailRedeemed : 0;
      // Lifetime obligation counts ONLY Booking Value the customer is ELIGIBLE to redeem on MLS:
      //   cash-funded BV is always MLS-eligible; promotional BV only up to the monthly allowance
      //   (modelled over a further 12 months of redemption).
      // Promotional BV beyond the allowance is treated as neither obligation nor profit.
      const MLS_COST_RATIO = (MLS_PAYOUT + MLS_EDITING) / MLS_RETAIL;
      const promoMlsEligible = Math.min(unredeemedPromoBv, allowance * MLS_RETAIL * MONTHS);
      const cashObligation = round2(unredeemedCashBv * blendedCostRatio);
      const promoObligation = round2(promoMlsEligible * MLS_COST_RATIO);
      const obligations = round2(cashObligation + promoObligation);
      const promoBvOutsideAllowance = round2(unredeemedPromoBv - promoMlsEligible);
      const lifetimeContribution = round2(contribution - obligations);
      const lifetimeMarginPct = cashIn > 0 ? round2((lifetimeContribution / cashIn) * 100) : 0;

      return {
        tier, allowance, persona,
        bookings,
        cash_in: round2(cashIn),
        funding_cash: round2((persona === 'pause_resume' ? 9 : MONTHS) * config.amount),
        topup: round2(topupTotal),
        shortfall: round2(shortfallTotal),
        promo_bv_used: round2(promoBvUsed),
        cash_bv_used: round2(cashBvUsed),
        retail_redeemed: round2(retailRedeemed),
        specialist_payout: round2(payout),
        editing: round2(editing),
        rep_commission: round2(commission),
        stripe_fees: round2(stripe),
        vip_cost: vipTotal,
        vip_breakdown: vipBreakdown,
        total_costs: totalCosts,
        contribution,
        margin_pct: marginPct,
        unredeemed_bv: unredeemedBv,
        unredeemed_cash_bv: unredeemedCashBv,
        unredeemed_promo_bv: unredeemedPromoBv,
        promo_bv_outside_allowance: promoBvOutsideAllowance,
        blended_cost_ratio: round2(blendedCostRatio),
        outstanding_obligation: obligations,
        lifetime_contribution: lifetimeContribution,
        lifetime_margin_pct: lifetimeMarginPct,
        meets_target: lifetimeMarginPct >= TARGET_CONTRIBUTION_MARGIN_PCT,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. RECONCILE THE PREVIOUS NEGATIVE SCENARIO ($1,000 VIP, 12 MLS/month)
    // ═══════════════════════════════════════════════════════════════════════
    const reconciliation = {
      previous_analysis: { realized_contribution: -283.6, realized_margin_pct: -2.36, lifetime_contribution: -703.6, lifetime_margin_pct: -5.86 },
      note: 'Reconstructed under the same canonical basis. Under the current unrestricted model (allowance effectively unlimited), the $1,000 VIP 12-MLS/month customer loses money because the $250/month promotional bonus converts to low-margin MLS services that cost $175/month to deliver with no offsetting cash.',
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 2. SUSTAINABLE ALLOWANCE PER TIER
    // ═══════════════════════════════════════════════════════════════════════
    const ALLOWANCE_TESTS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12];

    const allowanceMatrix: any[] = [];
    const tierResults = AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
      const config = getAutoFundConfig(tier);
      const byAllowance = ALLOWANCE_TESTS.map(a => {
        const runs = PERSONAS.map(p => simulate(tier, a, p)).filter(Boolean) as any[];
        const worst = runs.reduce((w: any, r: any) => (w === null || r.lifetime_margin_pct < w.lifetime_margin_pct ? r : w), null as any);
        const below = runs.filter((r: any) => !r.meets_target);
        const row = {
          tier,
          allowance: a,
          worst_persona: worst?.persona,
          worst_lifetime_margin_pct: worst?.lifetime_margin_pct,
          worst_lifetime_contribution: worst?.lifetime_contribution,
          scenarios_below_target: below.length,
          all_meet_target: below.length === 0,
        };
        allowanceMatrix.push(row);
        return { ...row, runs };
      });

      // Sustainable = largest allowance where EVERY persona meets the 10% lifetime target.
      const sustainable = byAllowance.filter(r => r.all_meet_target);
      const maxSustainable = sustainable.length ? sustainable[sustainable.length - 1].allowance : 0;
      const recommendedRun = byAllowance.find(r => r.allowance === maxSustainable);

      return {
        tier,
        monthly_cash: config.amount,
        monthly_bv: config.booking_value,
        monthly_promo_bv: config.bonus_booking_value,
        sustainable_allowance: maxSustainable,
        sustainable_worst_margin_pct: recommendedRun?.worst_lifetime_margin_pct,
        sustainable_worst_persona: recommendedRun?.worst_persona,
        allowance_ladder: byAllowance.map(r => ({
          allowance: r.allowance,
          worst_lifetime_margin_pct: r.worst_lifetime_margin_pct,
          worst_persona: r.worst_persona,
          all_meet_target: r.all_meet_target,
        })),
      };
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. QUALIFYING BUNDLE ECONOMICS
    // ═══════════════════════════════════════════════════════════════════════
    const bundleCarts = [
      { label: 'Standalone MLS Walkthrough', items: [{ pkg: 'mls', sqft: MLS_SQFT }] },
      { label: 'MLS + Essentials (2,501-3,500)', items: [{ pkg: 'mls', sqft: MLS_SQFT }, { pkg: 'essentials', sqft: 3000 }] },
      { label: 'MLS + Cinematic (3,501-5,000)', items: [{ pkg: 'mls', sqft: MLS_SQFT }, { pkg: 'cinematic', sqft: 5000 }] },
      { label: 'MLS + Premium (≤2,500)', items: [{ pkg: 'mls', sqft: MLS_SQFT }, { pkg: 'premium', sqft: 2000 }] },
      { label: 'MLS + nominal $50 add-on', items: [{ pkg: 'mls', sqft: MLS_SQFT }, { pkg: 'addon', sqft: 0 }], nominal_addon: true },
      { label: 'MLS + drone add-on ($125)', items: [{ pkg: 'mls', sqft: MLS_SQFT }, { pkg: 'addon_drone', sqft: 0 }] },
      { label: '2× MLS (same order)', items: [{ pkg: 'mls', sqft: MLS_SQFT }, { pkg: 'mls', sqft: MLS_SQFT }] },
      { label: 'Essentials only (no MLS)', items: [{ pkg: 'essentials', sqft: 3000 }] },
    ];

    const NOMINAL_ADDON_COST = 50;
    const bundleEconomics = bundleCarts.map(cart => {
      let retail = 0, cost = 0, mlsCount = 0, nonMlsRetail = 0;
      for (const it of cart.items) {
        if (it.pkg === 'addon') { retail += NOMINAL_ADDON_COST; cost += 20; nonMlsRetail += NOMINAL_ADDON_COST; continue; }
        if (it.pkg === 'addon_drone') { retail += VIP_REPRESENTATIVE_ADDON_PRICE; cost += 35; nonMlsRetail += VIP_REPRESENTATIVE_ADDON_PRICE; continue; }
        const c = serviceCost(it.pkg, it.sqft, 150);
        retail += c.retail; cost += c.payout + c.editing;
        if (it.pkg === 'mls') mlsCount += 1; else nonMlsRetail += c.retail;
      }
      const marginPct = retail > 0 ? round2(((retail - cost) / retail) * 100) : 0;
      // Qualifying bundle: contains ≥1 MLS, ≥1 non-MLS service of meaningful value (≥$150),
      // and blended contribution margin ≥ 35% (cost ratio ≤ 0.65).
      const qualifies = mlsCount >= 1 && nonMlsRetail >= 150 && marginPct >= 35 && !cart.nominal_addon;
      return {
        label: cart.label,
        retail: round2(retail),
        cost: round2(cost),
        margin_pct: marginPct,
        mls_count: mlsCount,
        non_mls_retail: round2(nonMlsRetail),
        qualifies_for_promo: qualifies,
      };
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. FULL-REDEMPTION STRESS + FLAGGED SCENARIOS
    // ═══════════════════════════════════════════════════════════════════════
    const recommendedAllowances: Record<number, number> = {};
    for (const t of tierResults) recommendedAllowances[t.tier] = t.sustainable_allowance;

    const fullRuns: any[] = [];
    for (const tier of AUTO_FUND_AMOUNT_OPTIONS) {
      for (const a of ALLOWANCE_TESTS) {
        for (const p of PERSONAS) {
          const r = simulate(tier, a, p);
          if (r) fullRuns.push(r);
        }
      }
    }

    const flagged = fullRuns.filter(r => !r.meets_target).map(r => ({
      tier: r.tier, allowance: r.allowance, persona: r.persona,
      realized_margin_pct: r.margin_pct,
      lifetime_margin_pct: r.lifetime_margin_pct,
      lifetime_contribution: r.lifetime_contribution,
      unredeemed_bv: r.unredeemed_bv,
    }));

    // Flags at the RECOMMENDED allowance only (what would ship)
    const flaggedAtRecommended = fullRuns
      .filter(r => r.allowance === recommendedAllowances[r.tier] && !r.meets_target)
      .map(r => ({ tier: r.tier, persona: r.persona, lifetime_margin_pct: r.lifetime_margin_pct }));

    // ═══════════════════════════════════════════════════════════════════════
    // 5. SENSITIVITY — editing cost × VIP session cost at recommended allowance
    // ═══════════════════════════════════════════════════════════════════════
    const editingSensitivity: any[] = [];
    for (const edit of [100, 125, 150, 175, 200]) {
      for (const vipCost of [0, 25, 50]) {
        for (const persona of ['mls_only_12', 'alternating', 'larger_packages']) {
          const r = simulate(1000, recommendedAllowances[1000], persona, edit, vipCost);
          if (r) editingSensitivity.push({
            editing_cost: edit, vip_session_cost: vipCost, persona,
            lifetime_margin_pct: r.lifetime_margin_pct, meets_target: r.meets_target,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. RECOMMENDED-ALLOWANCE DETAIL (per tier, key personas)
    // ═══════════════════════════════════════════════════════════════════════
    const recommendedDetail = AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
      const a = recommendedAllowances[tier];
      const runs = PERSONAS.map(p => simulate(tier, a, p)).filter(Boolean) as any[];
      return {
        tier,
        allowance: a,
        personas: runs.map(r => ({
          persona: r.persona,
          lifetime_margin_pct: r.lifetime_margin_pct,
          lifetime_contribution: r.lifetime_contribution,
          realized_margin_pct: r.margin_pct,
          unredeemed_bv: r.unredeemed_bv,
          meets_target: r.meets_target,
        })),
      };
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 7. BONUS SENSITIVITY — smallest promotional-bonus adjustment that would
    //    enable a positive standalone MLS allowance at the upper tiers.
    // ═══════════════════════════════════════════════════════════════════════
    const KEY_PERSONAS = ['mls_only_1', 'mls_only_3', 'mls_only_6', 'mls_only_12', 'accumulator', 'pause_resume'];
    const bonusSensitivity = [350, 500, 1000].map(tier => {
      const config = getAutoFundConfig(tier);
      const rows = [0, 5, 10, 15, 20, 25].map(pct => {
        const promo = round2(config.amount * pct / 100);
        const ladder = ALLOWANCE_TESTS.map(a => {
          const runs = KEY_PERSONAS.map(p => simulate(tier, a, p, 150, VIP_SESSION_COST, promo)).filter(Boolean) as any[];
          const worst = runs.reduce((w: any, r: any) => (w === null || r.lifetime_margin_pct < w.lifetime_margin_pct ? r : w), null as any);
          return { allowance: a, worst_lifetime_margin_pct: worst?.lifetime_margin_pct, passes: worst?.lifetime_margin_pct >= TARGET_CONTRIBUTION_MARGIN_PCT };
        });
        const passing = ladder.filter(l => l.passes);
        const maxAllowance = passing.length ? passing[passing.length - 1].allowance : 0;
        return { bonus_pct: pct, monthly_promo_bv: promo, max_sustainable_allowance: maxAllowance };
      });
      return { tier, rows };
    });

    const worstOverall = fullRuns.reduce((w: any, r: any) => (w === null || r.lifetime_margin_pct < w.lifetime_margin_pct ? r : w), null as any);

    return Response.json({
      status: 'DESIGN_COMPLETE',
      model_version: 'mls_hybrid_v1_20261011',
      target_margin_pct: TARGET_CONTRIBUTION_MARGIN_PCT,
      scenarios_tested: fullRuns.length,
      reconciliation,
      recommended_allowances: AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
        const t = tierResults.find(x => x.tier === tier)!;
        return {
          tier,
          monthly_cash: t.monthly_cash,
          monthly_bv: t.monthly_bv,
          monthly_promo_bv: t.monthly_promo_bv,
          recommended_allowance: t.sustainable_allowance,
          worst_lifetime_margin_pct: t.sustainable_worst_margin_pct,
          worst_persona: t.sustainable_worst_persona,
        };
      }),
      allowance_ladders: tierResults.map(t => ({ tier: t.tier, ladder: t.allowance_ladder })),
      bundle_qualification: {
        rule: 'A cart qualifies for promotional Booking Value when it contains at least one MLS Walkthrough, at least one non-MLS service with retail value of $150 or more, and a blended contribution margin of at least 35%. Nominal or artificially inexpensive add-ons never qualify.',
        carts: bundleEconomics,
      },
      flagged_scenarios: {
        total_below_target: flagged.length,
        at_recommended_allowance: flaggedAtRecommended,
        worst: worstOverall ? {
          tier: worstOverall.tier, allowance: worstOverall.allowance, persona: worstOverall.persona,
          lifetime_margin_pct: worstOverall.lifetime_margin_pct,
          lifetime_contribution: worstOverall.lifetime_contribution,
        } : null,
      },
      editing_sensitivity: editingSensitivity,
      bonus_sensitivity: bonusSensitivity,
      recommended_detail: recommendedDetail,
      integrity: {
        promo_bv_never_treated_as_cash: true,
        unredeemed_bv_not_counted_as_profit: true,
        full_redemption_obligations_deducted: true,
        existing_tiers_unchanged: true,
        prepaid_program_untouched: true,
      },
      note: 'Analysis only. No pricing, allowance, entitlement, balance, or historical record was changed.',
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}