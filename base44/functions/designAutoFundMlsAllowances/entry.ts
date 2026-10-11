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
} from '../../shared/prepaidEngine.ts';

/**
 * Auto-Fund MLS Promotional Allowance — CANONICAL FINANCIAL DESIGN ENGINE (v2).
 *
 * Admin-only, read-only.
 *
 * v2 CORRECTION (2026-10-11) — FULL MLS CREDIT REDEMPTION
 *   The monthly MLS allowance is strictly a BOOKING-COUNT limit. It is NOT a
 *   dollar-value redemption limit. For every standalone MLS Walkthrough inside
 *   the allowance the FULL $100 retail may be covered by Booking Value including
 *   promotional bonus credits. There are NO promotional-dollar caps, NO
 *   percentage caps, NO minimum cash contribution and NO mandatory split payment.
 *   One eligible standalone walkthrough consumes one allowance unit.
 *
 * MODEL DEFINITION (explicit, so every number is reproducible)
 *   CASH IN      = 12 x tier amount (the recurring charge).
 *   BOOKING VALUE ISSUED = cash-funded BV (12 x amount) + promotional bonus BV
 *                          (12 x bonus_booking_value). Both are redeemed over
 *                          the lifetime — nothing is counted as profit while the
 *                          obligation to deliver it still exists.
 *
 *   REDEMPTION ALLOCATION, in the order the owner specified:
 *     1. The customer uses their FULL monthly standalone allowance: `A`
 *        standalone MLS Walkthroughs per month, each up to $100, funded entirely
 *        from promotional credits whenever the promotional balance covers it.
 *        Promotional value shifted onto standalone MLS is capped by
 *        min(A x $100 x 12, promotional BV granted in the year).
 *     2. ALL remaining promotional Booking Value is redeemed through qualifying
 *        bundles (MLS + Essentials, 45.8% margin) — never left unspent.
 *     3. Cash-funded Booking Value is redeemed over the lifetime. Two cases are
 *        reported because the owner permits unlimited cash-funded standalone MLS:
 *          - 'mls_heavy'  (BINDING / conservative): all cash-funded BV redeemed
 *            as standalone MLS Walkthroughs — the worst-margin service in the
 *            catalogue.
 *          - 'bundle_mix' (upside): all cash-funded BV redeemed through
 *            qualifying bundles.
 *
 *   CONTRIBUTION = CASH IN - specialist payout - editing - sales commission
 *                  - Stripe fees - VIP incremental cost.
 *   MARGIN is measured against CASH IN (lifetime contribution margin).
 *
 * PRESERVED, BY INSTRUCTION: all six funding amounts and bonus percentages
 * (including the $1,000 VIP 25% bonus), specialist payouts, editing costs,
 * funding commissions and VIP benefits. No retail price is changed here.
 *
 * ANALYSIS ONLY. Nothing is changed. The customer-facing feature stays gated off.
 */

const MONTHS = 12;
const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

// MLS Walkthrough <=2,500 sqft — canonical unit economics.
const MLS_RETAIL = 100;
const MLS_PAYOUT = 50;   // guaranteed payout table
const MLS_EDITING = 20;
const MLS_UNIT_COST = MLS_PAYOUT + MLS_EDITING; // $70

// VIP: preserved basis — retainer + 12 bounded enhanced-support sessions/yr.
const VIP_SESSIONS_PER_YEAR = 12;
const VIP_SESSION_COST = 25;
const VIP_ANNUAL_RETAINER = VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * MONTHS;

const ALLOWANCE_SCAN_MAX = 24;

// ── Canonical qualifying bundle: MLS + Essentials (2,501-3,500 sqft) ─────────
const ESSENTIALS_SQFT = 3000;
function bundleEconomics() {
  const essRetail = getPriceForSqft(ESSENTIALS_SQFT, 'essentials') || 0;
  const essCost = round2(essRetail * 0.34) + 50; // 34%-of-retail specialist + $50 editing
  const retail = round2(MLS_RETAIL + essRetail);
  const cost = round2(MLS_UNIT_COST + essCost);
  return {
    label: 'MLS Walkthrough + Essentials (2,501-3,500 sqft)',
    retail,
    cost,
    margin_pct: round2(((retail - cost) / retail) * 100),
    cost_ratio: cost / retail,
  };
}
const BUNDLE = bundleEconomics();

type CashBvMode = 'mls_heavy' | 'bundle_mix';

interface LedgerInput {
  tier: number;
  allowance: number;
  cashBvMode: CashBvMode;
  mlsRetail?: number;
  mlsUnitCost?: number;
  promoAnnualOverride?: number;
}

/**
 * One 12-month lifetime ledger: cash in, redemption allocation at full
 * redemption, service cost, and lifetime contribution margin.
 */
function lifetimeLedger(input: LedgerInput) {
  const config = getAutoFundConfig(input.tier);
  if (!config) return null;

  const mlsRetail = input.mlsRetail ?? MLS_RETAIL;
  const mlsUnitCost = input.mlsUnitCost ?? MLS_UNIT_COST;

  // ── Cash in and cash-side costs ──────────────────────────────────────────
  const cashIn = round2(MONTHS * config.amount);
  const commission = round2(
    config.amount * (AUTO_FUND_FIRST_PAYMENT_RATE + (MONTHS - 1) * AUTO_FUND_RECURRING_RATE)
  );
  const stripe = round2(MONTHS * (config.amount * STRIPE_RATE + STRIPE_FIXED));
  const vipCost = input.tier === 1000
    ? round2(VIP_ANNUAL_RETAINER + VIP_SESSIONS_PER_YEAR * VIP_SESSION_COST)
    : 0;

  // ── Booking Value issued, redeemed in full over the lifetime ─────────────
  const promoAnnual = input.promoAnnualOverride ?? round2(MONTHS * config.bonus_booking_value);
  const cashFundedAnnual = round2(MONTHS * config.amount);

  // 1. Full monthly standalone allowance, promotional-funded first.
  const allowanceCapacityRetail = round2(input.allowance * mlsRetail * MONTHS);
  const promoToMlsRetail = round2(Math.min(allowanceCapacityRetail, promoAnnual));
  const promoToBundlesRetail = round2(promoAnnual - promoToMlsRetail);

  // 3. Cash-funded Booking Value.
  const cashToMlsRetail = input.cashBvMode === 'mls_heavy' ? cashFundedAnnual : 0;
  const cashToBundlesRetail = round2(cashFundedAnnual - cashToMlsRetail);

  const mlsRetailTotal = round2(promoToMlsRetail + cashToMlsRetail);
  const bundleRetailTotal = round2(promoToBundlesRetail + cashToBundlesRetail);

  // ── Service delivery cost ────────────────────────────────────────────────
  const mlsUnits = mlsRetail > 0 ? mlsRetailTotal / mlsRetail : 0;
  const mlsServiceCost = round2(mlsUnits * mlsUnitCost);
  const bundleServiceCost = round2(bundleRetailTotal * BUNDLE.cost_ratio);
  const serviceCost = round2(mlsServiceCost + bundleServiceCost);

  const totalCosts = round2(serviceCost + commission + stripe + vipCost);
  const contribution = round2(cashIn - totalCosts);
  const marginPct = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;

  return {
    tier: input.tier,
    allowance: input.allowance,
    cash_bv_mode: input.cashBvMode,
    mls_retail: round2(mlsRetail),
    mls_unit_cost: round2(mlsUnitCost),
    cash_in: cashIn,
    promotional_bv_annual: promoAnnual,
    cash_funded_bv_annual: cashFundedAnnual,
    allowance_capacity_retail: allowanceCapacityRetail,
    promo_to_mls_retail: promoToMlsRetail,
    promo_to_bundles_retail: promoToBundlesRetail,
    cash_to_mls_retail: cashToMlsRetail,
    cash_to_bundles_retail: cashToBundlesRetail,
    mls_walkthroughs_per_year: round2(mlsUnits),
    mls_service_cost: mlsServiceCost,
    bundle_service_cost: bundleServiceCost,
    service_cost: serviceCost,
    sales_commission: commission,
    stripe_fees: stripe,
    vip_incremental_cost: vipCost,
    total_costs: totalCosts,
    lifetime_contribution: contribution,
    lifetime_margin_pct: marginPct,
    meets_target: marginPct >= TARGET_CONTRIBUTION_MARGIN_PCT,
    shortfall_vs_target_dollars: round2(Math.max(0, (TARGET_CONTRIBUTION_MARGIN_PCT / 100) * cashIn - contribution)),
    shortfall_vs_target_points: round2(Math.max(0, TARGET_CONTRIBUTION_MARGIN_PCT - marginPct)),
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const MODES: CashBvMode[] = ['mls_heavy', 'bundle_mix'];

    function sweep(tier: number, mode: CashBvMode) {
      const ladder: any[] = [];
      for (let a = 0; a <= ALLOWANCE_SCAN_MAX; a++) {
        const r = lifetimeLedger({ tier, allowance: a, cashBvMode: mode });
        if (!r) continue;
        ladder.push({
          allowance: a,
          lifetime_margin_pct: r.lifetime_margin_pct,
          lifetime_contribution: r.lifetime_contribution,
          promo_shifted_to_mls: r.promo_to_mls_retail,
          mls_walkthroughs_per_year: r.mls_walkthroughs_per_year,
          meets_target: r.meets_target,
        });
      }
      const passing = ladder.filter(l => l.meets_target);
      const maxSustainable = passing.length ? passing[passing.length - 1].allowance : 0;
      const baseline = ladder[0];
      const atMax = ladder.find(l => l.allowance === maxSustainable) || baseline;
      const atOne = ladder.find(l => l.allowance === 1) || baseline;
      return {
        ladder,
        baseline_margin_pct: baseline.lifetime_margin_pct,
        baseline_contribution: baseline.lifetime_contribution,
        baseline_passes: baseline.meets_target,
        max_sustainable_allowance: maxSustainable,
        scan_hit_ceiling: maxSustainable === ALLOWANCE_SCAN_MAX,
        allowance_is_binding: atOne.promo_shifted_to_mls > baseline.promo_shifted_to_mls,
        margin_at_max: atMax.lifetime_margin_pct,
        contribution_at_max: atMax.lifetime_contribution,
        worst_margin_across_ladder: ladder.reduce(
          (w: any, l: any) => (w === null || l.lifetime_margin_pct < w.lifetime_margin_pct ? l : w), null as any
        )?.lifetime_margin_pct,
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 1. MAXIMUM SUSTAINABLE FULLY-PROMOTIONAL-ELIGIBLE WALKTHROUGHS PER MONTH
    // ═══════════════════════════════════════════════════════════════════════
    const tierResults: any[] = [];
    for (const tier of AUTO_FUND_AMOUNT_OPTIONS) {
      const config = getAutoFundConfig(tier)!;
      const perMode: any = {};

      for (const mode of MODES) {
        const sw = sweep(tier, mode);
        const atOneFull = lifetimeLedger({ tier, allowance: 1, cashBvMode: mode })!;
        perMode[mode] = {
          ...sw,
          at_allowance_1: {
            lifetime_margin_pct: atOneFull.lifetime_margin_pct,
            lifetime_contribution: atOneFull.lifetime_contribution,
            meets_target: atOneFull.meets_target,
            shortfall_dollars: atOneFull.shortfall_vs_target_dollars,
            shortfall_points: atOneFull.shortfall_vs_target_points,
          },
        };
      }

      const binding = perMode.mls_heavy;
      const cfg = getAutoFundConfig(tier)!;

      tierResults.push({
        tier,
        monthly_cash: config.amount,
        monthly_booking_value: config.booking_value,
        monthly_promotional_bv: config.bonus_booking_value,
        bonus_pct: cfg.bonus_pct,
        promotional_credits_are_zero: cfg.bonus_booking_value === 0,
        pool_fundable_per_month: round2(cfg.bonus_booking_value / MLS_RETAIL),
        max_sustainable_allowance: binding.max_sustainable_allowance,
        allowance_is_binding: binding.allowance_is_binding,
        baseline_margin_pct: binding.baseline_margin_pct,
        baseline_passes: binding.baseline_passes,
        margin_at_max: binding.margin_at_max,
        zero_reason: cfg.bonus_booking_value === 0
          ? 'NO_PROMOTIONAL_CREDITS'
          : binding.max_sustainable_allowance > 0
            ? null
            : binding.baseline_passes
              ? 'ALLOWANCE_HEADROOM_EXHAUSTED'
              : 'BASELINE_BELOW_TARGET',
        results: perMode,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. EXACT SHORTFALLS FOR TIERS THAT CANNOT SUPPORT A POSITIVE ALLOWANCE
    // ═══════════════════════════════════════════════════════════════════════
    const shortfalls = tierResults
      .filter(t => t.max_sustainable_allowance === 0)
      .map(t => {
        const cfg = getAutoFundConfig(t.tier)!;
        const baseline = lifetimeLedger({ tier: t.tier, allowance: 0, cashBvMode: 'mls_heavy' })!;
        const atOne = lifetimeLedger({ tier: t.tier, allowance: 1, cashBvMode: 'mls_heavy' })!;
        const promoNow = Math.min(MLS_RETAIL * MONTHS, round2(MONTHS * cfg.bonus_booking_value));
        const costShift = round2(promoNow * (MLS_UNIT_COST / MLS_RETAIL - BUNDLE.cost_ratio));
        const headroom = round2(baseline.lifetime_contribution - (TARGET_CONTRIBUTION_MARGIN_PCT / 100) * baseline.cash_in);
        return {
          tier: t.tier,
          reason: t.zero_reason,
          promotional_bv_per_year: baseline.promotional_bv_annual,
          cash_in_per_year: baseline.cash_in,
          baseline_margin_pct: baseline.lifetime_margin_pct,
          baseline_contribution: baseline.lifetime_contribution,
          baseline_passes: baseline.meets_target,
          annual_headroom_dollars: headroom,
          at_allowance_1_margin_pct: atOne.lifetime_margin_pct,
          at_allowance_1_contribution: atOne.lifetime_contribution,
          shortfall_at_allowance_1_dollars: atOne.shortfall_vs_target_dollars,
          shortfall_at_allowance_1_points: atOne.shortfall_vs_target_points,
          notes: [
            baseline.meets_target
              ? `At a zero allowance this tier clears the ${TARGET_CONTRIBUTION_MARGIN_PCT}% target with only $${headroom} of annual headroom.`
              : `This tier does NOT clear the ${TARGET_CONTRIBUTION_MARGIN_PCT}% target even at a zero allowance. The shortfall is the promotional bonus itself, not the allowance.`,
            `Every $1 of promotional Booking Value moved off a qualifying bundle (45.8% margin) onto a standalone MLS Walkthrough (30% margin) costs an extra $${round2(MLS_UNIT_COST / MLS_RETAIL - BUNDLE.cost_ratio)}.`,
            `Moving the year's promotional value ($${promoNow}) onto standalone MLS adds $${costShift} of delivery cost.`,
            `Root cause: the standalone MLS Walkthrough's 30% gross margin ($${MLS_RETAIL} retail against $${MLS_UNIT_COST} delivery) combined with the tier bonus. The allowance is not the lever.`,
          ],
        };
      });

    // ═══════════════════════════════════════════════════════════════════════
    // 3. SOLUTIONS FOR OWNER CONSIDERATION
    // ═══════════════════════════════════════════════════════════════════════
    function requiredMlsRetail(tier: number, allowance: number, mode: CashBvMode): number | null {
      for (let r = MLS_RETAIL; r <= 400; r += 0.5) {
        const led = lifetimeLedger({ tier, allowance, cashBvMode: mode, mlsRetail: r });
        if (led && led.meets_target) return round2(r);
      }
      return null;
    }
    function requiredMlsUnitCost(tier: number, allowance: number, mode: CashBvMode): number | null {
      for (let c = MLS_UNIT_COST; c >= 0; c -= 0.25) {
        const led = lifetimeLedger({ tier, allowance, cashBvMode: mode, mlsUnitCost: c });
        if (led && led.meets_target) return round2(c);
      }
      return null;
    }
    function requiredBonusPct(tier: number, allowance: number, mode: CashBvMode): number | null {
      const cfg = getAutoFundConfig(tier)!;
      for (let p = cfg.bonus_pct; p >= 0; p -= 0.25) {
        const promo = round2((cfg.amount * p / 100) * MONTHS);
        const led = lifetimeLedger({ tier, allowance, cashBvMode: mode, promoAnnualOverride: promo });
        if (led && led.meets_target) return round2(p);
      }
      return null;
    }

    const solutions = AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
      const cfg = getAutoFundConfig(tier)!;
      return {
        tier,
        current_mls_retail: MLS_RETAIL,
        current_mls_delivery_cost: MLS_UNIT_COST,
        current_bonus_pct: cfg.bonus_pct,
        binding_case: [1, 2, 3].map(n => ({
          walkthroughs_per_month: n,
          required_mls_retail_price: requiredMlsRetail(tier, n, 'mls_heavy'),
          required_mls_delivery_cost: requiredMlsUnitCost(tier, n, 'mls_heavy'),
          required_promotional_bonus_pct: requiredBonusPct(tier, n, 'mls_heavy'),
        })),
        bundle_mix_case: [1, 2, 3].map(n => ({
          walkthroughs_per_month: n,
          required_mls_retail_price: requiredMlsRetail(tier, n, 'bundle_mix'),
          required_mls_delivery_cost: requiredMlsUnitCost(tier, n, 'bundle_mix'),
          required_promotional_bonus_pct: requiredBonusPct(tier, n, 'bundle_mix'),
        })),
      };
    });

    // MLS retail price that repairs the WHOLE ladder for a positive allowance.
    const ladderRepair = [1, 2].map(n => {
      const perTier = AUTO_FUND_AMOUNT_OPTIONS.map(tier => ({
        tier,
        required_mls_retail_price: requiredMlsRetail(tier, n, 'mls_heavy'),
      }));
      const worst = perTier.reduce(
        (w: any, x: any) => (w === null || (x.required_mls_retail_price ?? 9999) > (w.required_mls_retail_price ?? 9999) ? x : w),
        null as any
      );
      return {
        walkthroughs_per_month: n,
        worst_tier: worst?.tier,
        mls_retail_price_that_repairs_all_tiers: worst?.required_mls_retail_price,
        per_tier: perTier,
      };
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. QUALIFYING BUNDLE ECONOMICS (rule unchanged, re-verified)
    // ═══════════════════════════════════════════════════════════════════════
    const bundleCarts = [
      { label: 'Standalone MLS Walkthrough', retail: MLS_RETAIL, cost: MLS_UNIT_COST, qualifies: false },
      { label: 'MLS + Essentials (2,501-3,500)', retail: BUNDLE.retail, cost: BUNDLE.cost, qualifies: true },
      { label: 'MLS + nominal $50 add-on', retail: 150, cost: 90, qualifies: false },
      { label: 'MLS + drone add-on ($125)', retail: 225, cost: 105, qualifies: false },
      { label: '2x MLS (same order)', retail: 200, cost: 140, qualifies: false },
    ].map(c => ({
      label: c.label,
      retail: round2(c.retail),
      cost: round2(c.cost),
      margin_pct: round2(((c.retail - c.cost) / c.retail) * 100),
      non_mls_retail: round2(c.retail - MLS_RETAIL),
      qualifies_for_promo: c.qualifies,
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // 5. RECONCILIATION — the originally identified negative scenario
    // ═══════════════════════════════════════════════════════════════════════
    const reconciliation = {
      scenario: '$1,000 VIP tier, standalone MLS Walkthroughs only, full redemption',
      unrestricted: lifetimeLedger({ tier: 1000, allowance: ALLOWANCE_SCAN_MAX, cashBvMode: 'mls_heavy' }),
      unrestricted_note:
        'Reproduces the originally identified loss: the $250/month promotional bonus converts to low-margin MLS services costing $175/month to deliver with no offsetting cash.',
      bundle_optimal: lifetimeLedger({ tier: 1000, allowance: 0, cashBvMode: 'bundle_mix' }),
      bundle_optimal_note:
        'Even with zero promotional value on standalone MLS, the VIP tier only clears the target when cash-funded value is ALSO redeemed through bundles. The binding issue is the 30% MLS margin, not the allowance.',
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 6. SENSITIVITY
    // ═══════════════════════════════════════════════════════════════════════
    const sensitivity = AUTO_FUND_AMOUNT_OPTIONS.map(tier => ({
      tier,
      at_allowance_0: lifetimeLedger({ tier, allowance: 0, cashBvMode: 'mls_heavy' })?.lifetime_margin_pct,
      at_allowance_1: lifetimeLedger({ tier, allowance: 1, cashBvMode: 'mls_heavy' })?.lifetime_margin_pct,
      at_allowance_1_bundle_mix: lifetimeLedger({ tier, allowance: 1, cashBvMode: 'bundle_mix' })?.lifetime_margin_pct,
      at_allowance_1_mls_retail_120: lifetimeLedger({ tier, allowance: 1, cashBvMode: 'mls_heavy', mlsRetail: 120 })?.lifetime_margin_pct,
      at_allowance_1_mls_cost_60: lifetimeLedger({ tier, allowance: 1, cashBvMode: 'mls_heavy', mlsUnitCost: 60 })?.lifetime_margin_pct,
    }));

    return Response.json({
      status: 'DESIGN_COMPLETE',
      model_version: 'mls_full_redemption_v2_20261011',
      supersedes: 'mls_hybrid_v1_20261011 (treated promotional value beyond the allowance as neither obligation nor profit — too generous)',
      target_margin_pct: TARGET_CONTRIBUTION_MARGIN_PCT,

      redemption_mechanics: {
        allowance_is_a_booking_count_limit_only: true,
        promotional_dollar_caps: 'none',
        promotional_percentage_caps: 'none',
        minimum_cash_contribution: 'none',
        mandatory_split_payment: 'none',
        full_retail_coverage_by_promotional_credits: 'permitted — up to 100% of the $100 walkthrough price',
        allowance_consumption_rule: 'one eligible standalone walkthrough consumes one monthly allowance unit when promotional credits are used',
        after_allowance_exhausted: 'cash-funded Booking Value, additional cash-funded deposits, or direct payment — unlimited',
      },

      model_definition: {
        months: MONTHS,
        cash_in: '12 x tier amount',
        booking_value_issued: 'cash-funded BV (12 x amount) + promotional bonus BV (12 x bonus_booking_value)',
        full_redemption: 'all issued Booking Value is redeemed over the lifetime — unredeemed value is never counted as profit',
        step_1: 'full monthly allowance used on standalone MLS Walkthroughs, promotional-funded first (100% coverage permitted)',
        step_2: 'ALL remaining promotional Booking Value redeemed through qualifying bundles',
        step_3: 'cash-funded Booking Value redeemed over the lifetime (two cases reported)',
        binding_case: "'mls_heavy' — cash-funded value redeemed as standalone MLS Walkthroughs (30% margin). The owner permits unlimited cash-funded standalone MLS, so this is the realistic worst case and is the basis of the recommendation.",
        upside_case: "'bundle_mix' — cash-funded value redeemed through qualifying bundles (45.8% margin).",
        margin_basis: 'contribution / cash in',
        preserved: [
          'all six funding amounts',
          'all six bonus percentages (including the $1,000 VIP 25% bonus)',
          'specialist payouts and the MLS guaranteed payout table',
          'editing costs',
          'funding commissions (15% first payment, 8% recurring, 0% booking-level)',
          'VIP benefits and the VIP incremental cost basis',
        ],
      },

      mls_unit_economics: {
        retail: MLS_RETAIL,
        specialist_payout: MLS_PAYOUT,
        editing: MLS_EDITING,
        delivery_cost: MLS_UNIT_COST,
        gross_margin_pct: round2(((MLS_RETAIL - MLS_UNIT_COST) / MLS_RETAIL) * 100),
      },

      qualifying_bundle: {
        rule: 'at least one MLS Walkthrough + at least $150 of non-MLS services + a blended contribution margin of at least 35%. Nominal add-ons never qualify.',
        canonical_bundle: BUNDLE,
        carts: bundleCarts,
      },

      recommended_allowances: tierResults.map(t => ({
        tier: t.tier,
        monthly_cash: t.monthly_cash,
        monthly_booking_value: t.monthly_booking_value,
        monthly_promotional_bv: t.monthly_promotional_bv,
        bonus_pct: t.bonus_pct,
        pool_fundable_walkthroughs_per_month: t.pool_fundable_per_month,
        max_sustainable_allowance: t.max_sustainable_allowance,
        allowance_is_binding: t.allowance_is_binding,
        baseline_margin_pct: t.baseline_margin_pct,
        baseline_passes: t.baseline_passes,
        margin_at_max: t.margin_at_max,
        zero_reason: t.zero_reason,
      })),

      allowance_ladders: tierResults.map(t => ({
        tier: t.tier,
        mls_heavy: t.results.mls_heavy.ladder,
        bundle_mix: t.results.bundle_mix.ladder,
      })),

      shortfalls,
      solutions,
      ladder_repair: ladderRepair,
      reconciliation,
      sensitivity,

      integrity: {
        all_six_tiers_and_bonuses_preserved: true,
        specialist_payouts_preserved: true,
        editing_costs_preserved: true,
        funding_commissions_preserved: true,
        vip_benefits_preserved: true,
        retail_prices_unchanged: true,
        promotional_dollar_caps_introduced: false,
        minimum_cash_contribution_introduced: false,
        partial_credit_allowances_substituted: false,
        no_allowance_silently_zeroed: 'every zero is accompanied by its exact shortfall and reason',
        production_financial_behavior_changed: false,
      },

      note: 'Analysis only. The customer-facing feature remains gated by the mls_promotional_allowance_enabled AppSetting, which is unset. No pricing, commission, payout, entitlement, balance, or historical financial record was changed.',
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}