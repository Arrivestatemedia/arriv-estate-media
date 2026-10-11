import { AUTO_FUND_AMOUNT_OPTIONS, getAutoFundConfig, round2 } from '../../shared/prepaidEngine.ts';
import { AUTOFUND_MEMBERSHIP_FEE } from '../../shared/autoFundFinalConfig.ts';
import {
  simulate,
  serviceCatalog,
  CERT_PERSONAS,
  NO_CHURN_PERSONAS,
  PERSONA_DESCRIPTIONS,
  VIP_BASE,
  TARGET_PCT,
  UNLIMITED,
} from '../../shared/autoFundSimulator.ts';

/**
 * ARRIV AUTO-FUND — OWNER-REQUESTED OPERATING-COST SENSITIVITY
 *
 * ANALYSIS ONLY. Read-only. Changes no pricing, compensation, allowance,
 * enrollment, balance, or production setting.
 *
 * Purpose: the owner supplied provisional planning figures for the operating
 * costs the earlier certification had to assume. This module re-runs the approved
 * final structure against those figures, tests the editing labour question
 * directly (wage x active minutes x QC), stress-tests early churn, support
 * utilisation and acquisition cost, and reports the exact thresholds at which the
 * $500 and VIP tiers stop contributing.
 *
 * EVERY figure the owner supplied is PROVISIONAL AND UNVERIFIED. Nothing here is
 * an observed operating result, and nothing here is an approved wage. The
 * approved tier structure, bonuses and the $25 VIP fee are held unchanged.
 *
 * Cost realism note. The earlier model charged $70 per wallet-funded Walkthrough
 * ($50 contractual payout + $20 editing) with no employer burden and no QC. The
 * $20 came from 52 minutes at a $23/hr rate that was itself an assumption. This
 * module treats the $23 rate as one candidate among three, not as the truth.
 */

const MLS_PAYOUT = 50;
const PRIORITY_SUPPORT_COST_PER_MONTH = 6;
const VIP_TIER = 1000;
const REFUND_BASE_MONTHS = [3, 7];

/** Owner-supplied provisional planning assumptions, 2026-10-11. All UNVERIFIED. */
export const PROVISIONAL = {
  label: 'Owner-supplied provisional planning assumptions — UNVERIFIED',
  payroll_burden_rate: 0.15,
  payroll_burden_label: '15% provisional employer payroll burden on editing labour — unverified',
  qc_per_walkthrough: 5,
  qc_label: '$5 per Walkthrough quality control — provisional, actual cost unmeasured',
  wage_candidates: [16, 18, 23],
  wage_label:
    'The $23/hr rate used previously was an unverified modelling assumption, NOT an approved wage. $16-$18 are candidate in-house editor rates, subject to experience, wage requirements and production quality, and are not finalized.',
  active_minutes_candidates: [30, 45, 60, 90],
  minutes_label:
    'Active hands-on editing minutes per MLS Walkthrough are UNMEASURED. Founder editing of 3-4 hours elapsed includes interruptions and is NOT employee production time. 30/45/60/90 are scenarios, not observations.',
  equal_quality_warning:
    'A lower wage is NOT assumed to buy faster editing or equivalent quality. Every scenario holds active minutes and QC constant and varies only the wage.',
  refund_label:
    'No measured refund or cancellation rate exists. Modelled on an explicit, disclosed refund-intensity basis instead.',
  churn_label:
    'No measured subscription churn rate exists. Modelled as early termination after 1, 3 or 4 funding cycles with the whole remaining balance still redeemable.',
  support_label:
    'Actual VIP support utilisation is unknown. Both an expected-utilisation view and the maximum-support view are reported.',
  acquisition_label:
    'Actual customer acquisition and onboarding cost is not established. Reported as a maximum absorbable cost, not as an estimate.',
  chargeback_label:
    'Chargeback, no-show and standby-dispatch frequency is unmeasured. Modelled as a flat per-member cost, which is the honest equivalent when no frequency data exists.',
  stripe_label:
    '2.9% + $0.30 is still an ASSUMPTION inside this model. Verify the connected account with the verifyStripeProcessingFees function before treating it as confirmed.',
  overhead_label:
    'General overhead is NOT allocated per subscriber. Every margin reported here is a CONTRIBUTION margin. See contribution_vs_net_profit for the separate view.',
} as const;

interface Basis {
  id: string;
  label: string;
  wage: number;
  minutes: number;
  burden: number;
  qc: number;
}

const basis = (id: string, label: string, wage: number, minutes: number, burden: number, qc: number): Basis =>
  ({ id, label, wage, minutes, burden, qc });

/** The four named operating bases. `mid` is the owner's provisional planning point. */
const BASES: Record<string, Basis> = {
  low: basis('low', '$16/hr, 30 active min, 15% burden, $5 QC', 16, 30, 0.15, 5),
  mid: basis('mid', '$18/hr, 60 active min, 15% burden, $5 QC', 18, 60, 0.15, 5),
  high: basis('high', '$23/hr, 90 active min, 15% burden, $8 QC', 23, 90, 0.15, 8),
  prior: basis('prior', 'Prior model: $23/hr, 52 min, no burden, no QC', 23, 52, 0, 0),
};

const grossEditing = (minutes: number, wage: number) => round2((minutes / 60) * wage);
const totalMlsEditing = (b: Basis) => round2(grossEditing(b.minutes, b.wage) * (1 + b.burden) + b.qc);

const econFor = (price: number, b: Basis) => ({
  id: b.id,
  label: b.label,
  mls_price: price,
  mls_payout: MLS_PAYOUT,
  mls_editing: grossEditing(b.minutes, b.wage),
  editing_burden_rate: b.burden,
  mls_qc: b.qc,
  partner_rate: 0.40,
});

const ratioOf = (s: { payout: number; editing: number; retail: number }) => (s.payout + s.editing) / s.retail;

/**
 * Promotional close-out ratios and the wallet-funded Walkthrough cost.
 * Non-VIP: promotional credit may buy anything, so the worst permitted service is
 *   the highest-ratio service on the menu.
 * VIP: standalone MLS is barred, so the worst permitted service is the
 *   highest-ratio ELIGIBLE one.
 */
function economicsFor(price: number, b: Basis) {
  const cat = serviceCatalog(econFor(price, b));
  const all = { S: ratioOf(cat.S), B: ratioOf(cat.B), E: ratioOf(cat.E), C: ratioOf(cat.C) };
  return {
    services: {
      standalone_mls: round2(all.S),
      mls_essentials_bundle: round2(all.B),
      photo_essentials: round2(all.E),
      photo_cinematic: round2(all.C),
    },
    non_vip_promo_closeout_ratio: round2(Math.max(all.S, all.B, all.E, all.C)),
    vip_promo_closeout_ratio: round2(Math.max(all.E, all.C)),
    wallet_funded_walkthrough_cost: round2(cat.S.payout + cat.S.editing),
    wallet_funded_walkthrough_cost_ratio: round2(all.S),
  };
}

interface RunOpts {
  vipSessions?: { sessions_per_year: number; cost_per_session: number };
  refundMonths?: number[];
  withRuns?: boolean;
}

/**
 * Runs one tier across a persona set under the approved final structure:
 * no standalone allowance, the $25 fee collected as revenue, VIP promotional
 * credit barred from standalone MLS, and the conservative promotional close-out.
 */
function runTier(tier: number, price: number, b: Basis, personas: string[], runOpts: RunOpts = {}) {
  const e = econFor(price, b);
  const econ = economicsFor(price, b);
  const isVip = tier === VIP_TIER;
  const fee = AUTOFUND_MEMBERSHIP_FEE[tier] ?? 0;
  const opts = {
    membership_fee: fee,
    membership_benefit_cost: isVip || fee === 0 ? 0 : PRIORITY_SUPPORT_COST_PER_MONTH,
    vip_promo_on_standalone: isVip ? false : undefined,
    promo_closeout_ratio: isVip ? econ.vip_promo_closeout_ratio : econ.non_vip_promo_closeout_ratio,
    refund_months: runOpts.refundMonths,
  };
  const vip = runOpts.vipSessions ?? VIP_BASE;
  const runs = personas
    .map(p => simulate(tier, UNLIMITED, p, e, vip, opts))
    .filter(Boolean) as any[];
  const worst = runs.reduce(
    (w: any, x: any) => (w === null || x.margin_lifetime_pct < w.margin_lifetime_pct ? x : w),
    null as any,
  );
  const negatives = runs.filter((x: any) => x.contribution_lifetime < 0);
  return {
    tier,
    price,
    membership_fee: fee,
    wallet_funded_walkthrough_cost: econ.wallet_funded_walkthrough_cost,
    worst_persona: worst.persona,
    worst_pct: worst.margin_lifetime_pct,
    worst_contribution: worst.contribution_lifetime,
    worst_cash_in: worst.cash_in,
    worst_active_months: worst.active_months,
    meets_target_10pct: worst.margin_lifetime_pct >= TARGET_PCT,
    negative_contribution: worst.contribution_lifetime < 0,
    negative_patterns: negatives.map((x: any) => ({
      persona: x.persona,
      margin_pct: x.margin_lifetime_pct,
      contribution: x.contribution_lifetime,
    })),
    runs: runOpts.withRuns
      ? runs.map((x: any) => ({
          persona: x.persona,
          description: PERSONA_DESCRIPTIONS[x.persona] ?? x.persona,
          margin_pct: x.margin_lifetime_pct,
          contribution: x.contribution_lifetime,
          cash_in: x.cash_in,
          active_months: x.active_months,
        }))
      : undefined,
  };
}

const compact = (r: any) => ({
  worst_persona: r.worst_persona,
  worst_pct: r.worst_pct,
  contribution: r.worst_contribution,
  meets_target_10pct: r.meets_target_10pct,
  negative_pattern_count: r.negative_patterns.length,
});

/**
 * Largest value of a single lever at which the criterion still holds, by bisection.
 * Every lever here is monotone: more editing minutes, a higher wage, more QC, more
 * support sessions or a longer churn horizon all strictly reduce contribution.
 */
function maxValueFor(
  tier: number,
  price: number,
  build: (v: number) => Basis,
  sessions: (v: number) => { sessions_per_year: number; cost_per_session: number },
  from: number,
  to: number,
  criterion: 'positive' | 'target',
): number | null {
  const ok = (v: number) => {
    const r = runTier(tier, price, build(v), CERT_PERSONAS, { vipSessions: sessions(v) });
    return criterion === 'positive' ? r.worst_contribution >= 0 : r.worst_pct >= TARGET_PCT;
  };
  if (!ok(from)) return null;
  if (ok(to)) return to;
  let lo = from;
  let hi = to;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Smallest MLS price at which the criterion first holds, by bisection. */
function minPriceFor(tier: number, b: Basis, criterion: 'positive' | 'target'): number | null {
  const ok = (p: number) => {
    const r = runTier(tier, p, b, CERT_PERSONAS);
    return criterion === 'positive' ? r.worst_contribution >= 0 : r.worst_pct >= TARGET_PCT;
  };
  if (ok(60)) return 60;
  if (!ok(300)) return null;
  let lo = 60;
  let hi = 300;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

const PRICES = [100, 120];
const FOCUS_TIERS = [500, VIP_TIER];

/** Refund intensities. [3,7] is the earlier disclosed pair; longer lists raise the rate. */
const REFUND_INTENSITIES = [
  { id: 'disclosed_base', label: '2 refunds a year on 6 walkthroughs a month (the earlier disclosed assumption)', months: REFUND_BASE_MONTHS },
  { id: 'double', label: '4 refunds a year', months: [2, 4, 7, 10] },
  { id: 'tripled', label: '6 refunds a year', months: [1, 3, 5, 7, 9, 11] },
  { id: 'every_month', label: '12 refunds a year (one a month, an extreme stress case)', months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export function runOwnerSensitivity() {
  // ═══ 1. EDITING LABOUR GRID — wage x active minutes x QC, at both prices ═══
  const editingGrid: any[] = [];
  for (const price of PRICES) {
    for (const wage of PROVISIONAL.wage_candidates) {
      for (const minutes of PROVISIONAL.active_minutes_candidates) {
        for (const qc of [5, 8]) {
          const b = basis(`w${wage}_m${minutes}_q${qc}`, `${wage}/hr, ${minutes} min, ${qc} QC`, wage, minutes, PROVISIONAL.payroll_burden_rate, qc);
          const econ = economicsFor(price, b);
          const t500 = runTier(500, price, b, CERT_PERSONAS);
          const tvip = runTier(VIP_TIER, price, b, CERT_PERSONAS);
          const otherTiers: Record<string, number> = {};
          for (const t of [150, 250, 350]) otherTiers[String(t)] = runTier(t, price, b, CERT_PERSONAS).worst_pct;
          const t500NoChurn = runTier(500, price, b, NO_CHURN_PERSONAS);
          const tvipNoChurn = runTier(VIP_TIER, price, b, NO_CHURN_PERSONAS);
          editingGrid.push({
            price,
            wage_per_hour: wage,
            active_minutes: minutes,
            qc_per_walkthrough: qc,
            payroll_burden_rate: PROVISIONAL.payroll_burden_rate,
            mls_editing_gross: grossEditing(minutes, wage),
            mls_editing_total: totalMlsEditing(b),
            wallet_funded_walkthrough_cost: econ.wallet_funded_walkthrough_cost,
            tier_500: compact(t500),
            tier_1000_vip: compact(tvip),
            other_tiers_worst_pct: otherTiers,
            excluding_churn: { tier_500: compact(t500NoChurn), tier_1000_vip: compact(tvipNoChurn) },
          });
        }
      }
    }
  }

  // ═══ 2. CHURN STRESS — fund 1, 3 or 4 cycles, then full redemption ═══
  const churnStress: any[] = [];
  for (const price of PRICES) {
    for (const tier of FOCUS_TIERS) {
      for (const b of [BASES.low, BASES.mid, BASES.high, BASES.prior]) {
        const byCycle: Record<string, any> = {};
        for (const cycles of [1, 3, 4]) {
          const r = runTier(tier, price, b, [`churn_after_${cycles}`], { withRuns: true });
          byCycle[String(cycles)] = {
            cycles_funded: cycles,
            margin_pct: r.worst_pct,
            contribution: r.worst_contribution,
            cash_in: r.worst_cash_in,
            active_months: r.worst_active_months,
            negative_contribution: r.negative_contribution,
            max_acquisition_and_onboarding_cost: r.worst_contribution,
            headroom_to_a_10pct_margin: round2(r.worst_contribution - (TARGET_PCT / 100) * r.worst_cash_in),
          };
        }
        churnStress.push({ price, tier, basis_id: b.id, basis_label: b.label, by_cycles_funded: byCycle });
      }
    }
  }

  // ═══ 3. VIP SUPPORT — expected utilisation vs the maximum the tier can absorb ═══
  const vipSupport: any[] = [];
  for (const price of PRICES) {
    for (const b of [BASES.low, BASES.mid, BASES.high]) {
      const bySessions = [0, 6, 12, 24, 36, 48].map(s => {
        const r = runTier(VIP_TIER, price, b, CERT_PERSONAS, { vipSessions: { sessions_per_year: s, cost_per_session: 25 } });
        return { sessions_per_year: s, annual_support_cost: round2(72 + s * 25), worst_pct: r.worst_pct, contribution: r.worst_contribution, negative_contribution: r.negative_contribution };
      });
      const maxSessionsPositive = maxValueFor(
        VIP_TIER, price,
        () => b,
        (v) => ({ sessions_per_year: v, cost_per_session: 25 }),
        0, 200, 'positive',
      );
      const maxSessionsTarget = maxValueFor(
        VIP_TIER, price,
        () => b,
        (v) => ({ sessions_per_year: v, cost_per_session: 25 }),
        0, 200, 'target',
      );
      vipSupport.push({
        price,
        basis_id: b.id,
        basis_label: b.label,
        modelled_expected_utilisation: { sessions_per_year: VIP_BASE.sessions_per_year, cost_per_session: VIP_BASE.cost_per_session },
        by_utilisation: bySessions,
        max_sessions_before_contribution_negative: maxSessionsPositive,
        max_sessions_before_margin_drops_below_10pct: maxSessionsTarget,
        sessions_note: 'The published VIP support terms set no session entitlement, so the ceiling below is the tier\'s financial limit rather than a promised allowance.',
      });
    }
  }

  // ═══ 4. ACQUISITION AND ONBOARDING HEADROOM — per member, per pattern ═══
  const acquisitionHeadroom: any[] = [];
  for (const price of PRICES) {
    for (const tier of FOCUS_TIERS) {
      const r = runTier(tier, price, BASES.mid, NO_CHURN_PERSONAS, { withRuns: true });
      const runs = (r.runs ?? []).slice().sort((a: any, b2: any) => a.contribution - b2.contribution);
      const worst = runs[0];
      const churnRuns = [1, 3, 4].map(c => {
        const cr = runTier(tier, price, BASES.mid, [`churn_after_${c}`], { withRuns: true });
        return { cycles_funded: c, max_cost_before_negative: cr.worst_contribution, margin_pct: cr.worst_pct };
      });
      acquisitionHeadroom.push({
        price,
        tier,
        basis_id: BASES.mid.id,
        maximum_acquisition_and_onboarding_cost_before_contribution_turns_negative: worst.contribution,
        tightest_pattern: { persona: worst.persona, description: worst.description, contribution: worst.contribution, cash_in: worst.cash_in, active_months: worst.active_months },
        maximum_cost_and_still_hold_a_10pct_margin: round2(worst.contribution - (TARGET_PCT / 100) * worst.cash_in),
        early_churn_variants: churnRuns,
        by_pattern: runs.map((x: any) => ({ persona: x.persona, contribution: x.contribution, cash_in: x.cash_in, max_acquisition_cost: x.contribution })),
      });
    }
  }

  // ═══ 5. FLAT PER-MEMBER COST — chargebacks, no-shows, standby, overhead ═══
  const flatCostLadder = [0, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  const flatCostSensitivity = PRICES.flatMap(price =>
    FOCUS_TIERS.map(tier => {
      const r = runTier(tier, price, BASES.mid, CERT_PERSONAS);
      return {
        price,
        tier,
        basis_id: BASES.mid.id,
        worst_pattern_contribution: r.worst_contribution,
        worst_pattern_cash_in: r.worst_cash_in,
        worst_pattern_active_months: r.worst_active_months,
        ladder: flatCostLadder.map(cost => ({
          flat_cost_per_member: cost,
          contribution_after: round2(r.worst_contribution - cost),
          margin_after_pct: r.worst_cash_in > 0 ? round2(((r.worst_contribution - cost) / r.worst_cash_in) * 100) : 0,
          turns_negative: r.worst_contribution - cost < 0,
        })),
      };
    }),
  );

  // ═══ 6. CONTRIBUTION MARGIN vs FULLY ALLOCATED NET PROFIT (kept separate) ═══
  const contributionVsNet = PRICES.flatMap(price =>
    FOCUS_TIERS.map(tier => {
      const r = runTier(tier, price, BASES.mid, CERT_PERSONAS);
      const months = r.worst_active_months;
      return {
        price,
        tier,
        worst_persona: r.worst_persona,
        cash_in: r.worst_cash_in,
        contribution_margin_pct: r.worst_pct,
        contribution_dollars: r.worst_contribution,
        active_months: months,
        net_profit_view: [0, 2, 5, 10, 20, 30].map(overhead => {
          const allocated = round2(overhead * months);
          const net = round2(r.worst_contribution - allocated);
          return {
            unallocated_overhead_per_subscriber_per_month: overhead,
            overhead_allocated_to_this_member: allocated,
            net_after_overhead: net,
            net_margin_pct: r.worst_cash_in > 0 ? round2((net / r.worst_cash_in) * 100) : 0,
          };
        }),
        note: 'No overhead has been allocated per subscriber anywhere in this model. The net view is arithmetic on a hypothetical allocation, not an allocated cost.',
      };
    }),
  );

  // ═══ 7. THRESHOLDS — the exact points at which $500 and VIP stop contributing ═══
  const b0 = BASES.mid;
  const thresholds = PRICES.flatMap(price => [
    {
      price,
      tier: 500,
      basis_id: b0.id,
      basis_label: b0.label,
      max_active_editing_minutes_at_16_hr: {
        for_positive_contribution: maxValueFor(500, price, (v) => basis('x', '', 16, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(500, price, (v) => basis('x', '', 16, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_at_18_hr: {
        for_positive_contribution: maxValueFor(500, price, (v) => basis('x', '', 18, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(500, price, (v) => basis('x', '', 18, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_at_23_hr: {
        for_positive_contribution: maxValueFor(500, price, (v) => basis('x', '', 23, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(500, price, (v) => basis('x', '', 23, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_at_18_hr_with_no_qc: {
        for_positive_contribution: maxValueFor(500, price, (v) => basis('x', '', 18, v, b0.burden, 0), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(500, price, (v) => basis('x', '', 18, v, b0.burden, 0), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_with_no_payroll_burden: {
        for_positive_contribution: maxValueFor(500, price, (v) => basis('x', '', 18, v, 0, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(500, price, (v) => basis('x', '', 18, v, 0, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_qc_cost_per_walkthrough_at_18_hr_60min: {
        for_positive_contribution: maxValueFor(500, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'positive') === null ? null : maxValueFor(500, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'positive')! / 2,
        for_a_10pct_margin: maxValueFor(500, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'target') === null ? null : maxValueFor(500, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'target')! / 2,
      },
      minimum_mls_price_at_18_hr_60min: {
        for_positive_contribution: minPriceFor(500, basis('x', '', 18, 60, b0.burden, b0.qc), 'positive'),
        for_a_10pct_margin: minPriceFor(500, basis('x', '', 18, 60, b0.burden, b0.qc), 'target'),
      },
    },
    {
      price,
      tier: VIP_TIER,
      basis_id: b0.id,
      basis_label: b0.label,
      max_active_editing_minutes_at_16_hr: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 16, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 16, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_at_18_hr: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_at_23_hr: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 23, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 23, v, b0.burden, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_at_18_hr_with_no_qc: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, v, b0.burden, 0), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, v, b0.burden, 0), () => VIP_BASE, 1, 240, 'target'),
      },
      max_active_editing_minutes_with_no_payroll_burden: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, v, 0, b0.qc), () => VIP_BASE, 1, 240, 'positive'),
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, v, 0, b0.qc), () => VIP_BASE, 1, 240, 'target'),
      },
      max_qc_cost_per_walkthrough_at_18_hr_60min: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'positive') === null ? null : maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'positive')! / 2,
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'target') === null ? null : maxValueFor(VIP_TIER, price, (v) => basis('x', '', 18, 60, b0.burden, v / 2), () => VIP_BASE, 0, 240, 'target')! / 2,
      },
      max_vip_support_sessions_per_year_at_25_each: {
        for_positive_contribution: maxValueFor(VIP_TIER, price, () => b0, (v) => ({ sessions_per_year: v, cost_per_session: 25 }), 0, 200, 'positive'),
        for_a_10pct_margin: maxValueFor(VIP_TIER, price, () => b0, (v) => ({ sessions_per_year: v, cost_per_session: 25 }), 0, 200, 'target'),
      },
      minimum_mls_price_at_18_hr_60min: {
        for_positive_contribution: minPriceFor(VIP_TIER, basis('x', '', 18, 60, b0.burden, b0.qc), 'positive'),
        for_a_10pct_margin: minPriceFor(VIP_TIER, basis('x', '', 18, 60, b0.burden, b0.qc), 'target'),
      },
    },
  ]);

  // ═══ 8. REFUND INTENSITY — no measured rate exists, so a disclosed basis ═══
  const refundSensitivity = PRICES.flatMap(price =>
    FOCUS_TIERS.map(tier => ({
      price,
      tier,
      basis_id: BASES.mid.id,
      by_intensity: REFUND_INTENSITIES.map(intensity => {
        const r = runTier(tier, price, BASES.mid, ['refunds'], { refundMonths: intensity.months });
        return {
          intensity_id: intensity.id,
          label: intensity.label,
          margin_pct: r.worst_pct,
          contribution: r.worst_contribution,
          negative_contribution: r.negative_contribution,
        };
      }),
    })),
  );

  // ═══ 9. WHICH OPERATING MEASUREMENTS MOVE PROFITABILITY MOST ═══
  const at120 = (tier: number, b: Basis) => runTier(tier, 120, b, CERT_PERSONAS);
  const vipMid = at120(VIP_TIER, BASES.mid);
  const vipMin30 = at120(VIP_TIER, basis('x', '', 18, 30, 0.15, 5));
  const vipMin90 = at120(VIP_TIER, basis('x', '', 18, 90, 0.15, 5));
  const vipW16 = at120(VIP_TIER, basis('x', '', 16, 60, 0.15, 5));
  const vipW23 = at120(VIP_TIER, basis('x', '', 23, 60, 0.15, 5));
  const vipQc0 = at120(VIP_TIER, basis('x', '', 18, 60, 0.15, 0));
  const vipQc20 = at120(VIP_TIER, basis('x', '', 18, 60, 0.15, 20));
  const vipSessions48 = runTier(VIP_TIER, 120, BASES.mid, CERT_PERSONAS, { vipSessions: { sessions_per_year: 48, cost_per_session: 25 } });
  const vipRefundHeavy = runTier(VIP_TIER, 120, BASES.mid, ['refunds'], { refundMonths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
  const vipChurn1 = runTier(VIP_TIER, 120, BASES.mid, ['churn_after_1']);
  const vipNoChurn = runTier(VIP_TIER, 120, BASES.mid, NO_CHURN_PERSONAS);

  // Like-for-like: both ends of a lever are measured on the SAME customer pattern,
  // so a swing is attributable to the lever rather than to the worst pattern changing.
  const c4 = ['churn_after_4'];
  const vipC4 = (b: Basis, sessions = VIP_BASE) => runTier(VIP_TIER, 120, b, c4, { vipSessions: sessions });
  const t500C4 = (b: Basis) => runTier(500, 120, b, c4);
  const mk = (wage: number, minutes: number, burden = 0.15, qc = 5) => basis('lever', '', wage, minutes, burden, qc);

  // The VIP tier's floor: a VIP member who buys larger packages and NO MLS
  // Walkthrough. No MLS editing saving of any size can move this, so it caps the
  // tier whatever the editing cost turns out to be.
  const vipNonMlsFloor = PRICES.map(price => {
    const r = runTier(VIP_TIER, price, BASES.mid, ['larger_packages']);
    return {
      price,
      pattern: 'larger_packages',
      description: PERSONA_DESCRIPTIONS['larger_packages'],
      buys_any_mls_walkthrough: false,
      margin_pct: r.worst_pct,
      contribution: r.worst_contribution,
      cash_in: r.worst_cash_in,
      note: 'Binding VIP floor when MLS editing is cheap. Cutting MLS editing cost cannot lift VIP past this figure.',
    };
  });

  const levers = [
    {
      measurement: 'Active editing minutes per Walkthrough',
      range: '30 to 90 minutes, wage held at $18/hr',
      vip_margin_swing_pct_points: round2(vipMin30.worst_pct - vipMin90.worst_pct),
      vip_margin_at_low_end: vipMin30.worst_pct,
      vip_margin_at_high_end: vipMin90.worst_pct,
      note: 'Unmeasured. The single largest unmeasured driver of both tier margins.',
    },
    {
      measurement: 'Editing wage per hour',
      range: '$16 to $23/hr, 60 active minutes held constant',
      vip_margin_swing_pct_points: round2(vipW16.worst_pct - vipW23.worst_pct),
      vip_margin_at_low_end: vipW16.worst_pct,
      vip_margin_at_high_end: vipW23.worst_pct,
      note: 'Moves the margin roughly half as much as editing time does, because the labour content is the multiplier.',
    },
    {
      measurement: 'Early churn, with the full remaining balance redeemed',
      range: 'churn after 4 cycles to churn after 1 cycle',
      vip_margin_swing_pct_points: round2(vipNoChurn.worst_pct - vipChurn1.worst_pct),
      vip_margin_at_low_end: vipNoChurn.worst_pct,
      vip_margin_at_high_end: vipChurn1.worst_pct,
      note: 'A member who funds one cycle and redeems the deposit plus the whole promotional bonus is the most expensive outcome in the model. No churn rate is measured.',
    },
    {
      measurement: 'VIP support sessions per member per year',
      range: '12 to 48 sessions at $25 each',
      vip_margin_swing_pct_points: round2(vipMid.worst_pct - vipSessions48.worst_pct),
      vip_margin_at_low_end: vipMid.worst_pct,
      vip_margin_at_high_end: vipSessions48.worst_pct,
      note: 'Utilisation is unknown. The published terms cap nothing, so the financial ceiling matters more than the expectation.',
    },
    {
      measurement: 'Refund and cancellation intensity',
      range: '2 to 12 refunds a year',
      vip_margin_swing_pct_points: round2(vipMid.worst_pct - vipRefundHeavy.worst_pct),
      vip_margin_at_low_end: vipMid.worst_pct,
      vip_margin_at_high_end: vipRefundHeavy.worst_pct,
      note: 'The refund reversal keeps editing and processing cost and reverses the payout, so a refund is a direct loss on that booking.',
    },
    {
      measurement: 'Quality-control cost per Walkthrough',
      range: '$0 to $20',
      vip_margin_swing_pct_points: round2(vipQc0.worst_pct - vipQc20.worst_pct),
      vip_margin_at_low_end: vipQc0.worst_pct,
      vip_margin_at_high_end: vipQc20.worst_pct,
      note: 'Small per walkthrough, but it applies to every walkthrough including the MLS component of bundles.',
    },
  ].sort((a, b2) => b2.vip_margin_swing_pct_points - a.vip_margin_swing_pct_points);

  // Like-for-like ranking: each operating lever measured on the SAME customer
  // pattern, so a swing is the lever's effect and not a change of worst pattern.
  const likeForLike = [
    {
      measurement: 'Active editing minutes per Walkthrough',
      range_tested: '30 to 90 minutes, wage held at $18/hr, 15% burden, $5 QC',
      vip_like_for_like: { low_end_pct: vipC4(mk(18, 30)).worst_pct, high_end_pct: vipC4(mk(18, 90)).worst_pct },
      tier500_like_for_like: { low_end_pct: t500C4(mk(18, 30)).worst_pct, high_end_pct: t500C4(mk(18, 90)).worst_pct },
      why_it_matters: 'Unmeasured. The largest single lever on the $500 tier and a large one on VIP.',
    },
    {
      measurement: 'Employer payroll burden on editing labour',
      range_tested: '0% to 30% at $18/hr and 60 active minutes',
      vip_like_for_like: { low_end_pct: vipC4(mk(18, 60, 0)).worst_pct, high_end_pct: vipC4(mk(18, 60, 0.3)).worst_pct },
      tier500_like_for_like: { low_end_pct: t500C4(mk(18, 60, 0)).worst_pct, high_end_pct: t500C4(mk(18, 60, 0.3)).worst_pct },
      why_it_matters: 'Provisional at 15% and unverified. It scales with every editing minute, so it multiplies the editing-time measurement rather than standing alone.',
    },
    {
      measurement: 'Editing wage per hour',
      range_tested: '$16 to $23/hr, 60 active minutes, 15% burden and $5 QC held constant',
      vip_like_for_like: { low_end_pct: vipC4(mk(16, 60)).worst_pct, high_end_pct: vipC4(mk(23, 60)).worst_pct },
      tier500_like_for_like: { low_end_pct: t500C4(mk(16, 60)).worst_pct, high_end_pct: t500C4(mk(23, 60)).worst_pct },
      why_it_matters: 'A lower wage is NOT credited with faster editing or equivalent quality. Only the wage moves here.',
    },
    {
      measurement: 'Quality-control cost per Walkthrough',
      range_tested: '$0 to $20 at $18/hr and 60 active minutes',
      vip_like_for_like: { low_end_pct: vipC4(mk(18, 60, 0.15, 0)).worst_pct, high_end_pct: vipC4(mk(18, 60, 0.15, 20)).worst_pct },
      tier500_like_for_like: { low_end_pct: t500C4(mk(18, 60, 0.15, 0)).worst_pct, high_end_pct: t500C4(mk(18, 60, 0.15, 20)).worst_pct },
      why_it_matters: 'Small per Walkthrough, but it applies to every Walkthrough including the MLS component of a bundle.',
    },
    {
      measurement: 'Early churn, with the whole remaining balance redeemed',
      range_tested: 'churn after 4 funding cycles to churn after 1',
      vip_like_for_like: { low_end_pct: vipC4(BASES.mid).worst_pct, high_end_pct: vipChurn1.worst_pct },
      tier500_like_for_like: { low_end_pct: t500C4(BASES.mid).worst_pct, high_end_pct: runTier(500, 120, BASES.mid, ['churn_after_1']).worst_pct },
      why_it_matters: 'No churn rate is measured. A member who funds one cycle and redeems the deposit plus the entire promotional bonus is the most expensive outcome in the model.',
    },
    {
      measurement: 'VIP support sessions per member per year',
      range_tested: '12 to 48 sessions at $25 each, VIP tier only',
      vip_like_for_like: { low_end_pct: vipC4(BASES.mid).worst_pct, high_end_pct: vipC4(BASES.mid, { sessions_per_year: 48, cost_per_session: 25 }).worst_pct },
      tier500_like_for_like: null,
      why_it_matters: 'Utilisation is unknown and the published VIP terms cap nothing, so the financial ceiling matters more than the expectation.',
    },
    {
      measurement: 'Refund and cancellation intensity',
      range_tested: '2 to 12 refunds a year, on the refunds pattern',
      vip_like_for_like: {
        low_end_pct: runTier(VIP_TIER, 120, BASES.mid, ['refunds'], { refundMonths: REFUND_BASE_MONTHS }).worst_pct,
        high_end_pct: vipRefundHeavy.worst_pct,
      },
      tier500_like_for_like: {
        low_end_pct: runTier(500, 120, BASES.mid, ['refunds'], { refundMonths: REFUND_BASE_MONTHS }).worst_pct,
        high_end_pct: runTier(500, 120, BASES.mid, ['refunds'], { refundMonths: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }).worst_pct,
      },
      why_it_matters: 'A refund reverses the payout but keeps editing and processing cost, so it is a direct loss on that booking.',
    },
  ]
    .map(row => ({
      ...row,
      vip_margin_swing_pct_points: round2(row.vip_like_for_like.low_end_pct - row.vip_like_for_like.high_end_pct),
      tier500_margin_swing_pct_points: row.tier500_like_for_like
        ? round2(row.tier500_like_for_like.low_end_pct - row.tier500_like_for_like.high_end_pct)
        : null,
    }))
    .sort((a, b2) => b2.vip_margin_swing_pct_points - a.vip_margin_swing_pct_points);

  const topThree = likeForLike.slice(0, 3);
  const topThreeTierWorst = levers.slice(0, 3).map(l => ({
    measurement: l.measurement,
    vip_margin_swing_pct_points: l.vip_margin_swing_pct_points,
    vip_margin_at_low_end: l.vip_margin_at_low_end,
    vip_margin_at_high_end: l.vip_margin_at_high_end,
  }));

  return {
    status: 'OWNER_SENSITIVITY_COMPLETE',
    request_date: '2026-10-11',
    provisional_assumptions: PROVISIONAL,
    preserved_structure: {
      note: 'The approved tier structure, bonuses, the $50 MLS payout and the $25 VIP fee are held exactly as approved. Nothing here redesigns a tier or proposes a fee.',
      tiers: AUTO_FUND_AMOUNT_OPTIONS.map(t => {
        const cfg = getAutoFundConfig(t)!;
        return {
          deposit: cfg.amount,
          membership_fee: AUTOFUND_MEMBERSHIP_FEE[t] ?? 0,
          promotional_bonus_pct: cfg.bonus_pct,
          promotional_bonus_value: cfg.bonus_booking_value,
          is_vip: t === VIP_TIER,
        };
      }),
      vip_promotional_credit_on_standalone_mls: false,
      standalone_mls_allowance: 'none — unlimited with the customer\'s own funds',
    },
    operating_bases: Object.values(BASES).map(b => ({
      id: b.id,
      label: b.label,
      gross_editing_per_walkthrough: grossEditing(b.minutes, b.wage),
      payroll_burden_amount: round2(grossEditing(b.minutes, b.wage) * b.burden),
      qc_per_walkthrough: b.qc,
      total_mls_editing_per_walkthrough: totalMlsEditing(b),
      wallet_funded_walkthrough_cost_at_100: economicsFor(100, b).wallet_funded_walkthrough_cost,
      wallet_funded_walkthrough_cost_at_120: economicsFor(120, b).wallet_funded_walkthrough_cost,
    })),
    editing_cost_grid: editingGrid,
    churn_stress: churnStress,
    vip_support_sensitivity: vipSupport,
    acquisition_headroom: acquisitionHeadroom,
    flat_per_member_cost_sensitivity: flatCostSensitivity,
    contribution_vs_net_profit: contributionVsNet,
    refund_intensity_sensitivity: refundSensitivity,
    thresholds: thresholds,
    lever_ranking: levers,
    like_for_like_lever_ranking: likeForLike,
    top_three_tier_worst_view: topThreeTierWorst,
    vip_non_mls_floor: vipNonMlsFloor,
    top_three_measurements: topThree,
    notes: [
      'Analysis only. No pricing, compensation, allowance, enrollment, balance or production setting was changed.',
      'Every owner-supplied figure is provisional and unverified. Nothing here is an observed operating result and no wage is approved.',
      'Contribution margin excludes general overhead. Fully allocated net profitability is a separate view that assumes an allocation, because none exists.',
      'Chargebacks, no-shows and standby dispatch are modelled as a flat per-member cost, because no frequency data exists to model them as events.',
      '2.9% + $0.30 processing remains an assumption until the connected Stripe account is verified.',
    ],
  };
}