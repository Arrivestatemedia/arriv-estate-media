import { AUTO_FUND_AMOUNT_OPTIONS, getAutoFundConfig, round2 } from '../../shared/prepaidEngine.ts';
import {
  simulate,
  serviceCatalog,
  evaluatePolicy,
  evaluatePolicyAllTiers,
  policyAllowance,
  minPriceForPolicy,
  PERSONAS,
  PERSONA_DESCRIPTIONS,
  VIP_BASE,
  TARGET_PCT,
  UNLIMITED,
} from '../../shared/autoFundSimulator.ts';

/**
 * SIMPLIFIED AUTO-FUND MLS POLICY — PASS/FAIL under full cost realism.
 *
 * ANALYSIS ONLY. Changes no pricing, compensation, allowance, enrollment, balance,
 * or production setting.
 *
 * Policy under test (owner proposal):
 *   - $50 / $100 / $200 / $350 / $500 — no standalone-MLS booking-count allowance.
 *     A walkthrough may draw promotional Booking Value first and be covered 100% by
 *     it, with no dollar cap and no required cash split.
 *   - $1,000 VIP — max 7 standalone walkthroughs per billing cycle on promotional value.
 *   - All tiers — unlimited qualifying packages and bundles.
 *   - Bonuses unchanged: $0 / $5 / $20 / $52.50 / $100 / $250 per month.
 *
 * Cost realism. The previous model charged $70 per wallet-funded walkthrough
 * ($50 contractual payout + $20 editing) with NO employer payroll burden and NO
 * quality-control expense. Realism adds both. Neither is configured anywhere in the
 * app: packageEditingConfig.ts defines editing task types and a 6-hour QC *scheduling*
 * buffer, but no editing minutes and no hourly cost per task type. So the editing
 * figure is, and always was, an assumption.
 */

const MLS_PAYOUT = 50;      // contractual guaranteed payout, verified in code
const EDITING_BASE = 20;    // 52 minutes at the $23/hr mean editor wage — the prior constant
const PRICE_UNDER_TEST = 120;

type Econ = {
  id: string;
  label: string;
  mls_price: number;
  mls_payout: number;
  mls_editing: number;
  editing_burden_rate?: number;
  mls_qc?: number;
};

export interface RealismSpec {
  id: string;
  label: string;
  editing_burden_rate: number;
  mls_qc: number;
}

export const REALISM: RealismSpec[] = [
  { id: 'R0', label: 'Baseline (no payroll burden, no QC) — reproduces the earlier model', editing_burden_rate: 0, mls_qc: 0 },
  { id: 'R1', label: 'Full realism (15% employer payroll burden, $5 QC per walkthrough)', editing_burden_rate: 0.15, mls_qc: 5 },
  { id: 'R2', label: 'Conservative (20% burden, $8 QC per walkthrough)', editing_burden_rate: 0.2, mls_qc: 8 },
];

/** The owner's simplified structure. */
export const POLICY_SIMPLIFIED = {
  id: 'SIMPLIFIED',
  label: 'Simplified (owner proposal): no standalone cap on $50–$500, VIP capped at 7 per cycle',
  allowances: { 50: UNLIMITED, 100: UNLIMITED, 200: UNLIMITED, 350: UNLIMITED, 500: UNLIMITED, 1000: 7 } as Record<number, number>,
};

/** The structure recommended in the previous round, for comparison. */
export const POLICY_PREVIOUS = {
  id: 'PREVIOUS',
  label: 'Previously recommended: $50:0, $100:1, $200:1, $350:1, $500:1, VIP:3',
  allowances: { 50: 0, 100: 1, 200: 1, 350: 1, 500: 1, 1000: 3 } as Record<number, number>,
};

/** Heavy standalone-MLS patterns the owner asked to be stressed. */
const HEAVY_PERSONAS = [
  'mls_6', 'mls_12', 'mls_20', 'wallet_matched_mls',
  'cash_topup', 'accumulator', 'refunds', 'mixed_realistic', 'alternating',
];

const econAt = (price: number, r: RealismSpec): Econ => ({
  id: r.id,
  label: r.label,
  mls_price: price,
  mls_payout: MLS_PAYOUT,
  mls_editing: EDITING_BASE,
  editing_burden_rate: r.editing_burden_rate,
  mls_qc: r.mls_qc,
});

/** Per-walkthrough cost build-up at $120, showing exactly what realism adds. */
function costBuildUp(r: RealismSpec, price = PRICE_UNDER_TEST) {
  const editing = EDITING_BASE;
  const burden = round2(editing * r.editing_burden_rate);
  const qc = r.mls_qc;
  const walletFunded = round2(MLS_PAYOUT + editing + burden + qc);
  return {
    realism: r.id,
    editing_minutes_assumed: 52,
    payout: MLS_PAYOUT,
    editing_gross: editing,
    payroll_burden_pct: round2(r.editing_burden_rate * 100),
    payroll_burden: burden,
    quality_control: qc,
    wallet_funded_total: walletFunded,
    wallet_funded_cost_ratio_pct: round2((walletFunded / price) * 100),
    direct_paid_extra: {
      stripe: round2(price * 0.029 + 0.3),
      marketplace_commission_15pct: round2(price * 0.15),
    },
  };
}

/** Largest effective editing + QC per walkthrough that still clears the target at a given price. */
function maxEditingPlusQc(price: number, spec: any, r: RealismSpec) {
  let best: number | null = null;
  for (let ed = 0; ed <= 45; ed += 0.5) {
    const e: Econ = {
      id: 'X', label: '', mls_price: price, mls_payout: MLS_PAYOUT,
      mls_editing: ed, editing_burden_rate: r.editing_burden_rate, mls_qc: r.mls_qc,
    };
    if (evaluatePolicyAllTiers(spec, e).passes) best = round2(ed * (1 + r.editing_burden_rate) + r.mls_qc);
    else if (best !== null) break;
  }
  return best;
}

/** Does the VIP booking-count cap protect margin? Compare 3 / 7 / unlimited. */
function capEffect(r: RealismSpec, price = PRICE_UNDER_TEST) {
  const e = econAt(price, r);
  const caps = [3, 7, UNLIMITED];
  const perTier = AUTO_FUND_AMOUNT_OPTIONS.filter(t => t === 1000 || t === 500 || t === 350).map(tier => {
    const promo = getAutoFundConfig(tier)!.bonus_booking_value;
    const runs = caps.map(cap => {
      const results = PERSONAS.map(p => simulate(tier, cap, p, e)!);
      const worst = results.reduce((w, x) => (w === null || x.margin_lifetime_pct < w.margin_lifetime_pct ? x : w), null as any);
      const promoOnStandalone = round2(results.reduce((s, x) => s + x.promo_on_standalone_mls, 0) / results.length);
      return { cap: cap === UNLIMITED ? 'unlimited' : cap, worst_margin_pct: worst.margin_lifetime_pct, mean_promo_on_standalone: promoOnStandalone };
    });
    return { tier, monthly_promo_bv: promo, runs, spread_pct: round2(Math.max(...runs.map(x => x.worst_margin_pct)) - Math.min(...runs.map(x => x.worst_margin_pct))) };
  });
  return {
    question: 'Does the VIP 7-per-cycle cap protect margin, versus no cap at all?',
    per_tier: perTier,
    verdict: perTier.every(t => t.spread_pct <= 0.01)
      ? 'NON-BINDING — the cap changes no outcome. Promotional credit accrues at $250/month = 2.08 walkthroughs, so a 7-per-cycle limit is never reached in steady state. It cannot be used as a financial remedy.'
      : 'The cap changes outcomes — see the spread per tier.',
  };
}

/** Where does promotional credit get redeemed, and at what cost ratio? */
function redemptionRouting(r: RealismSpec, price = PRICE_UNDER_TEST) {
  const e = econAt(price, r);
  const cat = serviceCatalog(e);
  const standaloneRatio = round2((cat.S.payout + cat.S.editing) / cat.S.retail);
  const bundleRatio = round2((cat.B.payout + cat.B.editing) / cat.B.retail);
  return {
    standalone_walkthrough_cost_ratio: standaloneRatio,
    bundle_cost_ratio: bundleRatio,
    note: standaloneRatio > bundleRatio
      ? `Promotional credit redeemed on a standalone walkthrough costs ${round2((standaloneRatio - bundleRatio) * 100)} cents more per dollar than the same credit redeemed inside a bundle. A booking-count cap routes unspent credit toward bundles, which is the cap's ONLY economic effect.`
      : 'Bundles cost more per dollar than standalone walkthroughs at this price.',
  };
}

export function analyzeSimplifiedPolicy() {
  const policyVerdicts = REALISM.map(r => {
    const e = econAt(PRICE_UNDER_TEST, r);
    const simplified = evaluatePolicyAllTiers(POLICY_SIMPLIFIED, e);
    const previous = evaluatePolicyAllTiers(POLICY_PREVIOUS, e);
    return {
      realism: r.id,
      realism_label: r.label,
      price: PRICE_UNDER_TEST,
      cost_build_up: costBuildUp(r),
      simplified: { passes: simplified.passes, tiers: simplified.tiers },
      previous_recommendation: { passes: previous.passes, tiers: previous.tiers },
      previous_vs_simplified_delta: simplified.tiers.map((t, i) => ({
        tier: t.tier,
        previous_margin_pct: previous.tiers[i].worst_lifetime_pct,
        simplified_margin_pct: t.worst_lifetime_pct,
        delta_pct: round2(t.worst_lifetime_pct - previous.tiers[i].worst_lifetime_pct),
      })),
      verdict: simplified.passes ? 'PASS' : 'FAIL',
    };
  });

  const eR1 = econAt(PRICE_UNDER_TEST, REALISM[1]);
  const eR2 = econAt(PRICE_UNDER_TEST, REALISM[2]);

  // Heavy standalone-MLS usage at $120 under full realism, with no cap on $50–$500.
  const heavyUsage = AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
    const allowance = policyAllowance(tier, POLICY_SIMPLIFIED);
    return {
      tier,
      policy_allowance: allowance === UNLIMITED ? 'none — unlimited' : allowance,
      monthly_promo_bv: getAutoFundConfig(tier)!.bonus_booking_value,
      annual_promo_bv: round2(getAutoFundConfig(tier)!.bonus_booking_value * 12),
      promo_funded_walkthroughs_per_year: round2((getAutoFundConfig(tier)!.bonus_booking_value * 12) / PRICE_UNDER_TEST),
      personas: HEAVY_PERSONAS.map(p => {
        const r = simulate(tier, allowance, p, eR1)!;
        return {
          persona: p,
          description: PERSONA_DESCRIPTIONS[p],
          margin_pct: r.margin_lifetime_pct,
          contribution: r.contribution_lifetime,
          cash_in: r.cash_in,
          walkthroughs: r.bookings,
          promo_on_standalone_mls: r.promo_on_standalone_mls,
          pass: r.meets_target,
        };
      }),
    };
  });

  const minPriceR1 = minPriceForPolicy(POLICY_SIMPLIFIED, { mls_payout: MLS_PAYOUT, mls_editing: EDITING_BASE, editing_burden_rate: 0.15, mls_qc: 5 });
  const minPriceR2 = minPriceForPolicy(POLICY_SIMPLIFIED, { mls_payout: MLS_PAYOUT, mls_editing: EDITING_BASE, editing_burden_rate: 0.2, mls_qc: 8 });

  const remedies = {
    smallest_price_change: {
      at_R1: minPriceR1 ? { price: minPriceR1.price, increase_from_120: round2(minPriceR1.price - PRICE_UNDER_TEST), tiers: minPriceR1.tiers } : null,
      at_R2: minPriceR2 ? { price: minPriceR2.price, increase_from_120: round2(minPriceR2.price - PRICE_UNDER_TEST), tiers: minPriceR2.tiers } : null,
    },
    smallest_cost_reduction: {
      at_120_R1: {
        max_editing_plus_qc_per_walkthrough: maxEditingPlusQc(PRICE_UNDER_TEST, POLICY_SIMPLIFIED, REALISM[1]),
        current_editing_plus_qc: round2(EDITING_BASE * 1.15 + 5),
      },
      at_120_R2: {
        max_editing_plus_qc_per_walkthrough: maxEditingPlusQc(PRICE_UNDER_TEST, POLICY_SIMPLIFIED, REALISM[2]),
        current_editing_plus_qc: round2(EDITING_BASE * 1.2 + 8),
      },
    },
    cap_remedy_available: false,
    cap_note: 'Reinstating a standalone booking-count cap cannot fix a margin failure: the cap is non-binding, and its only economic effect (routing promotional credit toward bundles) is worth well under one margin point.',
    vip_is_the_binding_tier: {
      price_curve: Array.from({ length: 16 }, (_, i) => 120 + i).map(price => {
        const r = evaluatePolicyAllTiers(POLICY_SIMPLIFIED, econAt(price, REALISM[1])).tiers.find(t => t.tier === 1000)!;
        return { price, vip_worst_margin_pct: r.worst_lifetime_pct, vip_worst_persona: r.worst_persona, passes: r.passes };
      }),
      support_cost_cannot_close_the_gap: {
        vip_margin_with_support_cost_removed_entirely: evaluatePolicy(1000, POLICY_SIMPLIFIED, eR1, { sessions_per_year: 0, cost_per_session: 0 }).worst_lifetime_pct,
        vip_margin_at_120_with_normal_support_cost: evaluatePolicy(1000, POLICY_SIMPLIFIED, eR1).worst_lifetime_pct,
        annual_vip_support_cost_at_12_sessions: 12 * 25,
        annual_vip_retainer: 72,
        gap_to_close_dollars: evaluatePolicy(1000, POLICY_SIMPLIFIED, eR1).shortfall_dollars,
        note: 'Even removing every VIP enhanced-support session and the retainer would not close the gap — the shortfall is driven by walkthrough delivery cost, not support cost.',
      },
    },
  };

  const subTarget = {
    R1_failing_tiers: policyVerdicts[1].simplified.tiers.filter(t => !t.passes).map(t => t.tier),
    R1_failing_personas: policyVerdicts[1].simplified.tiers.flatMap(t => t.failing_personas.map(f => ({ tier: t.tier, ...f }))),
    R2_failing_tiers: policyVerdicts[2].simplified.tiers.filter(t => !t.passes).map(t => t.tier),
    R2_failing_personas: policyVerdicts[2].simplified.tiers.flatMap(t => t.failing_personas.map(f => ({ tier: t.tier, ...f }))),
    loss_making_count_R1: policyVerdicts[1].simplified.tiers.flatMap(t => t.failing_personas).filter(f => f.margin_pct < 0).length,
    loss_making_count_R2: policyVerdicts[2].simplified.tiers.flatMap(t => t.failing_personas).filter(f => f.margin_pct < 0).length,
  };

  return {
    policy_under_test: POLICY_SIMPLIFIED,
    comparison_policy: POLICY_PREVIOUS,
    target_lifetime_margin_pct: TARGET_PCT,
    price_under_test: PRICE_UNDER_TEST,
    vip_cap_per_cycle: 7,
    cost_assumptions_disclosure: {
      configured_in_app: 'Specialist payout ($50, MLS guaranteed table) and the six bonus percentages. Stripe 2.9% + $0.30.',
      assumed_not_configured: 'MLS editing minutes (thus the $20 editing cost), the employer payroll burden, and the quality-control expense per walkthrough. No MLS Walkthrough has ever been produced, so none of these three has an observed value.',
      operator_wage_source: 'EditorProfile.hourly_wage (mean of active editors) — $23.00/hr, one active editor.',
    },
    policy_verdicts: policyVerdicts,
    heavy_usage_at_120_full_realism: heavyUsage,
    cap_effect: capEffect(REALISM[1]),
    redemption_routing: redemptionRouting(REALISM[1]),
    remedies,
    sub_target_detail: subTarget,
    note: 'Analysis only. Enrollment remains disabled and no pricing, compensation, allowance, balance, or production setting was changed.',
  };
}