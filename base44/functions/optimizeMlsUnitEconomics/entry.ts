import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { AUTO_FUND_AMOUNT_OPTIONS, getAutoFundConfig, round2 } from '../../shared/prepaidEngine.ts';
import {
  simulate,
  maxSustainable,
  bundleEconomics,
  PERSONAS,
  PERSONA_DESCRIPTIONS,
  VIP_BASE,
  TARGET_PCT,
} from '../../shared/autoFundSimulator.ts';
import { analyzeSimplifiedPolicy } from './simplifiedPolicy.ts';
import { runFinalCertification } from './finalCertification.ts';
import { runOwnerSensitivity } from './ownerSensitivity.ts';

type Economics = { id: string; label: string; mls_price: number; mls_payout: number; mls_editing: number };

/**
 * Final MLS unit economics and allowance optimization — ANALYSIS ONLY.
 *
 * Admin-only and read-only. Changes no pricing, compensation, allowance,
 * enrollment, balance, or production setting.
 *
 *   Phase 1  reconcile the hybrid (17.29%) and corrected (1.83%) VIP figures
 *   Phase 2  per-walkthrough cost breakdown + operational evidence
 *   Phase 3  max sustainable allowance per tier under A / B / C
 *   Phase 4  stress grid: allowances 0-20 x 14 customer patterns x 6 tiers
 *   Phase 5  minimum-price search + recommended configuration
 */

const ECON: Record<string, Economics> = {
  A: { id: 'A', label: '$100 price / $70 delivery (current)', mls_price: 100, mls_payout: 50, mls_editing: 20 },
  B: { id: 'B', label: '$100 price / $60 delivery (unproven $10 editing saving)', mls_price: 100, mls_payout: 50, mls_editing: 10 },
  C: { id: 'C', label: '$120 price / $70 delivery', mls_price: 120, mls_payout: 50, mls_editing: 20 },
};

const MAX_ALLOWANCE = 20;

/** Allowance that lets a steady-state customer put every promotional dollar on standalone MLS. */
function meaningfulAllowance(tier: number, price: number): number {
  const cfg = getAutoFundConfig(tier)!;
  return cfg.bonus_booking_value > 0 ? Math.ceil(cfg.bonus_booking_value / price) : 0;
}

function rangeText(nums: number[]): string {
  if (!nums.length) return '';
  const out: string[] = [];
  let start = nums[0], prev = nums[0];
  for (let i = 1; i <= nums.length; i++) {
    if (i < nums.length && nums[i] === prev + 1) { prev = nums[i]; continue; }
    out.push(start === prev ? `${start}` : `${start}-${prev}`);
    if (i < nums.length) { start = nums[i]; prev = nums[i]; }
  }
  return out.join(',');
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const svc = base44.asServiceRole.entities;

    // Owner-requested operating-cost sensitivity. Returned on its own so the
    // standard analysis payload is unchanged for every existing caller.
    let scope = new URL(req.url).searchParams.get('scope');
    if (!scope && req.method !== 'GET') {
      try {
        const body = await req.clone().json();
        scope = body?.scope ?? null;
      } catch {
        scope = null;
      }
    }
    if (scope === 'owner_sensitivity') {
      return Response.json({
        status: 'OWNER_SENSITIVITY_COMPLETE',
        model_version: 'mls_unit_economics_v3_20261011',
        phase8_owner_sensitivity: runOwnerSensitivity(),
        note: 'Analysis only. No pricing, compensation, allowance, enrollment, balance, or production setting was changed.',
      });
    }

    // ═══ PHASE 1 — RECONCILIATION ($1,000 VIP, standalone MLS only, allowance 0) ═══
    const oldBundleRatio = 230.5 / 425; // v2 bundle: MLS (<=2,500) + Essentials (2,501-3,500)
    const newBundle = bundleEconomics(ECON.A);
    const hybrid = {
      funding_cash: 12000,
      direct_paid_walkthroughs: 24,
      direct_paid_cash: 2400,
      cash_in: 14400,
      walkthroughs_delivered: 144,
      specialist_and_editing: 144 * 70,
      funding_commission: round2(1000 * 0.15 + 11 * 1000 * 0.08),
      stripe_funding: round2(12 * (1000 * 0.029 + 0.30)),
      stripe_direct: round2(24 * (100 * 0.029 + 0.30)),
      vip_cost: 72 + 300,
      promotional_bv_charged: 0,
      promotional_bv_uncharged: 3000,
    };
    const hybridContribution = round2(hybrid.cash_in - hybrid.specialist_and_editing - hybrid.funding_commission
      - hybrid.stripe_funding - hybrid.stripe_direct - hybrid.vip_cost);
    const step1 = round2(-3000 * oldBundleRatio);
    const step2 = round2(-hybrid.direct_paid_cash + hybrid.direct_paid_walkthroughs * 70 + hybrid.stripe_direct);
    const v2Contribution = round2(hybridContribution + step1 + step2);
    const step3 = round2(-3000 * (newBundle.cost_ratio - oldBundleRatio));
    const finalRun = simulate(1000, 0, 'wallet_matched_mls', ECON.A)!;
    const reconciliation = {
      hybrid_ledger: { ...hybrid, contribution: hybridContribution, margin_pct: round2((hybridContribution / hybrid.cash_in) * 100) },
      bridge: [
        { step: 'Hybrid model as reported', contribution: hybridContribution, margin_pct: round2((hybridContribution / 14400) * 100), cash_in: 14400 },
        { step: '1. Charge the $3,000 of promotional Booking Value the hybrid never charged (redeemed through bundles at 54.24% cost)', change: step1 },
        { step: '2. Remove the 24 direct-paid walkthroughs the v2 ledger excluded (-$2,400 revenue, +$1,680 delivery, +$76.80 Stripe)', change: step2 },
        { step: 'Corrected v2 model', contribution: v2Contribution, margin_pct: round2((v2Contribution / 12000) * 100), cash_in: 12000, shortfall_vs_target: round2(1200 - v2Contribution) },
        { step: '3. Final model: bundle on ONE <=2,500 sqft property ($375 retail / $213.50 cost, 43.07%) instead of mixed size tiers', change: step3 },
        { step: 'Final model (wallet_matched_mls, allowance 0)', contribution: finalRun.contribution_lifetime, margin_pct: finalRun.margin_lifetime_pct, cash_in: finalRun.cash_in },
      ],
      hybrid_scenario_in_final_model: simulate(1000, 0, 'mls_12', ECON.A),
      hybrid_also_omitted: {
        marketplace_commission_on_direct_paid_walkthroughs: 24 * 15,
        note: 'A fully direct-paid booking is a standard marketplace booking and carries the 15% sales commission. The hybrid omitted it ($360). The final model includes it wherever a booking applies no wallet value.',
      },
    };

    // ═══ PHASE 2 — COST BREAKDOWN + OPERATIONAL EVIDENCE ═══
    const items = (r: any) => (Array.isArray(r) ? r : (r?.items || r?.data || []));
    const [mlsTaskCount, mlsTimedCount, editors, mlsSnapshots, mlsJobs] = await Promise.all([
      svc.EditingTask.count({ task_type: 'mls_walkthrough_edit' }),
      svc.EditingTask.count({ task_type: 'mls_walkthrough_edit', active_editing_minutes: { $gt: 0 } }),
      svc.EditorProfile.filter({}, { limit: 50, fields: ['editor_status', 'hourly_wage', 'verified_editor_capabilities'] }),
      svc.ProviderCompensationSnapshot.count({ package_id: 'mls_walkthrough' }),
      svc.Job.count({ package: { $in: ['mls_walkthrough', 'MLS Walkthrough'] } }),
    ]);
    const editorList = items(editors);
    const wages = editorList.map((x: any) => x.hourly_wage).filter((w: any) => typeof w === 'number' && w > 0);
    const wage = wages.length ? wages.reduce((a: number, b: number) => a + b, 0) / wages.length : null;
    const costBreakdown = {
      wallet_funded_walkthrough: [
        { component: 'Specialist payout', amount: 50, source: 'MLS guaranteed payout table, TIER_1 (<=2,500 sqft), AEM_MEDIA_PROVIDER_COMP_V1', evidence: 'contractual — code-verified' },
        { component: 'Editing', amount: 20, source: 'modelling assumption only (stress-test constant) — not a configured or paid rate', evidence: 'UNVERIFIED' },
        { component: 'Payment processing', amount: 0, source: 'no fee on a wallet redemption; Stripe is paid at funding (2.9% + $0.30 per charge) and carried in the tier ledger', evidence: 'code-verified' },
        { component: 'Booking-level sales commission', amount: 0, source: 'wallet-funded bookings are suppressed', evidence: 'code-verified' },
      ],
      direct_paid_walkthrough_extra: [
        { component: 'Stripe on direct payment', amount: 3.2 },
        { component: '15% marketplace sales commission (no wallet value applied)', amount: 15 },
      ],
      not_in_the_70: 'SMS notifications, calendar invites, file storage, and support time are not modelled. They are small but unmeasured, so $70 is a floor, not a ceiling.',
      operational_evidence: {
        mls_editing_tasks_ever_created: mlsTaskCount,
        mls_editing_tasks_with_tracked_minutes: mlsTimedCount,
        mls_compensation_snapshots: mlsSnapshots,
        mls_jobs: mlsJobs,
        active_editors: editorList.length,
        average_editor_hourly_wage: wage,
        implied_minutes_at_20: wage ? round2((20 / wage) * 60) : null,
        minutes_needed_for_10: wage ? round2((10 / wage) * 60) : null,
      },
    };

    // ═══ PHASE 3 + 4 — ALTERNATIVES A / B / C ═══
    const alternatives = Object.values(ECON).map(e => {
      const tiers = AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
        const life = maxSustainable(tier, e, VIP_BASE, MAX_ALLOWANCE, 'lifetime');
        const twelve = maxSustainable(tier, e, VIP_BASE, MAX_ALLOWANCE, '12m');
        const cfg = getAutoFundConfig(tier)!;
        return {
          tier,
          monthly_promo_bv: cfg.bonus_booking_value,
          meaningful_allowance: meaningfulAllowance(tier, e.mls_price),
          max_sustainable_lifetime: life.max_sustainable,
          max_sustainable_12m: twelve.max_sustainable,
          first_lifetime_failure: life.first_failure,
        };
      });

      const failures: any[] = [];
      let failingLifetime = 0, failing12 = 0, total = 0;
      for (const tier of AUTO_FUND_AMOUNT_OPTIONS) {
        for (const p of PERSONAS) {
          const failA: number[] = [];
          const fail12: number[] = [];
          let worstLife: any = null, worst12: any = null;
          for (let a = 0; a <= MAX_ALLOWANCE; a++) {
            const r = simulate(tier, a, p, e)!;
            total++;
            if (!r.meets_target) { failA.push(a); failingLifetime++; }
            if (!r.meets_target_12m) { fail12.push(a); failing12++; }
            if (worstLife === null || r.margin_lifetime_pct < worstLife.pct) worstLife = { pct: r.margin_lifetime_pct, c: r.contribution_lifetime, a };
            if (worst12 === null || r.margin_12m_pct < worst12.pct) worst12 = { pct: r.margin_12m_pct, c: r.contribution_12m, a };
          }
          if (failA.length || fail12.length) {
            failures.push({
              tier, persona: p,
              lifetime_fails_at: rangeText(failA),
              worst_lifetime_pct: worstLife.pct, worst_lifetime_contribution: worstLife.c,
              twelve_month_fails_at: rangeText(fail12),
              worst_12m_pct: worst12.pct,
            });
          }
        }
      }

      return {
        id: e.id,
        label: e.label,
        bundle: bundleEconomics(e),
        tiers,
        stress: { configurations_tested: total, below_target_lifetime: failingLifetime, below_target_12m: failing12, failures },
      };
    });

    // ═══ PHASE 5 — MINIMUM-PRICE SEARCH (editing $20 / $25 / $30) ═══
    const priceSweep: any[] = [];
    for (const editingCost of [20, 25, 30]) {
      for (let price = 100; price <= 140; price++) {
        const e: Economics = { id: `P${price}E${editingCost}`, label: '', mls_price: price, mls_payout: 50, mls_editing: editingCost };
        const perTier = AUTO_FUND_AMOUNT_OPTIONS.map(tier => ({
          tier,
          max: maxSustainable(tier, e, VIP_BASE, MAX_ALLOWANCE).max_sustainable,
          meaningful: meaningfulAllowance(tier, price),
        }));
        const allPassAtZero = perTier.every(t => t.max !== null);
        const allMeaningful = perTier.every(t => t.max !== null && t.max >= t.meaningful);
        priceSweep.push({ editing: editingCost, price, all_pass_at_zero: allPassAtZero, all_meaningful: allMeaningful, per_tier: perTier.map(t => t.max) });
      }
    }
    const minPrice = (editingCost: number, key: 'all_pass_at_zero' | 'all_meaningful') =>
      priceSweep.find(r => r.editing === editingCost && r[key])?.price ?? null;

    const recommendedPrice = minPrice(20, 'all_meaningful');
    const describeConfig = (price: number, editingCost = 20, vip = VIP_BASE) => {
      const e: Economics = { id: 'R', label: '', mls_price: price, mls_payout: 50, mls_editing: editingCost };
      return AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
        const max = maxSustainable(tier, e, vip, MAX_ALLOWANCE).max_sustainable;
        const meaningful = meaningfulAllowance(tier, price);
        const allowance = max === null ? null : Math.min(meaningful, max);
        if (allowance === null) {
          const worst0 = PERSONAS.map(p => simulate(tier, 0, p, e, vip)!).reduce((w, r) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null as any);
          return { tier, allowance: null, max_sustainable: null, worst_persona: worst0.persona, worst_lifetime_pct: worst0.margin_lifetime_pct, worst_lifetime_contribution: worst0.contribution_lifetime };
        }
        const runs = PERSONAS.map(p => simulate(tier, allowance, p, e, vip)!);
        const worst = runs.reduce((w, r) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null as any);
        const mixed = runs.find(r => r.persona === 'mixed_realistic')!;
        const matched = runs.find(r => r.persona === 'wallet_matched_mls')!;
        return {
          tier,
          allowance,
          max_sustainable: max,
          promo_funded_walkthroughs_per_year: round2((getAutoFundConfig(tier)!.bonus_booking_value * 12) / price),
          worst_persona: worst.persona,
          worst_lifetime_contribution: worst.contribution_lifetime,
          worst_lifetime_pct: worst.margin_lifetime_pct,
          worst_12m_pct: worst.margin_12m_pct,
          mls_only_customer: { contribution: matched.contribution_lifetime, pct: matched.margin_lifetime_pct },
          mixed_customer: { contribution: mixed.contribution_lifetime, pct: mixed.margin_lifetime_pct },
        };
      });
    };

    const recommendation = recommendedPrice === null ? null : {
      price: recommendedPrice,
      configuration: describeConfig(recommendedPrice),
      editing_25: describeConfig(recommendedPrice, 25),
      vip_full_session_ceiling: describeConfig(recommendedPrice, 20, { sessions_per_year: 48, cost_per_session: 25 }).find(t => t.tier === 1000),
    };
    const optionC = {
      configuration: describeConfig(120),
      editing_25: describeConfig(120, 25),
      vip_full_session_ceiling: describeConfig(120, 20, { sessions_per_year: 48, cost_per_session: 25 }).find(t => t.tier === 1000),
    };
    const optionA = { configuration: describeConfig(100) };

    // Break-evens: the highest editing cost, and the most VIP support sessions,
    // at which every tier still holds its meaningful allowance.
    const holdsAll = (price: number, editingCost: number, vip = VIP_BASE) => {
      const e: Economics = { id: 'X', label: '', mls_price: price, mls_payout: 50, mls_editing: editingCost };
      return AUTO_FUND_AMOUNT_OPTIONS.every(tier => {
        const max = maxSustainable(tier, e, vip, MAX_ALLOWANCE).max_sustainable;
        return max !== null && max >= meaningfulAllowance(tier, price);
      });
    };
    const breakEvens = [100, 118, 120].map(price => {
      let maxEditing: number | null = null;
      for (let ed = 0; ed <= 40; ed += 0.5) { if (holdsAll(price, ed)) maxEditing = ed; else if (maxEditing !== null) break; }
      let maxSessions: number | null = null;
      for (let s = 0; s <= 48; s++) { if (holdsAll(price, 20, { sessions_per_year: s, cost_per_session: 25 })) maxSessions = s; else break; }
      return { price, max_editing_cost: maxEditing, max_vip_sessions_per_year_at_25: maxSessions };
    });

    return Response.json({
      status: 'ANALYSIS_COMPLETE',
      phase6_simplified_policy: analyzeSimplifiedPolicy(),
      phase7_final_certification: runFinalCertification(),
      model_version: 'mls_unit_economics_v3_20261011',
      target_lifetime_margin_pct: TARGET_PCT,
      personas: PERSONA_DESCRIPTIONS,
      vip_cost_basis: { retainer_per_month: 6, sessions_per_year: VIP_BASE.sessions_per_year, cost_per_session: VIP_BASE.cost_per_session, ceiling_sessions_per_year: 48 },
      phase1_reconciliation: reconciliation,
      phase2_cost_breakdown: costBreakdown,
      phase3_4_alternatives: alternatives,
      phase5: {
        minimum_price: {
          editing_20: { all_tiers_pass_at_zero: minPrice(20, 'all_pass_at_zero'), all_tiers_meaningful_allowance: minPrice(20, 'all_meaningful') },
          editing_25: { all_tiers_pass_at_zero: minPrice(25, 'all_pass_at_zero'), all_tiers_meaningful_allowance: minPrice(25, 'all_meaningful') },
          editing_30: { all_tiers_pass_at_zero: minPrice(30, 'all_pass_at_zero'), all_tiers_meaningful_allowance: minPrice(30, 'all_meaningful') },
        },
        price_sweep: priceSweep,
        break_evens: breakEvens,
        recommendation,
        option_a_at_100: optionA,
        option_c_at_120: optionC,
      },
      note: 'Analysis only. No pricing, compensation, allowance, enrollment, balance, or production setting was changed.',
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}