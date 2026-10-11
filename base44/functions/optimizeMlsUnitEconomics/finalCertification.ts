import { AUTO_FUND_AMOUNT_OPTIONS, getAutoFundConfig, round2 } from '../../shared/prepaidEngine.ts';
import { AUTOFUND_FINAL_FLAGS, AUTOFUND_MEMBERSHIP_FEE } from '../../shared/autoFundFinalConfig.ts';
import {
  simulate,
  serviceCatalog,
  CERT_PERSONAS,
  PERSONA_DESCRIPTIONS,
  VIP_BASE,
  TARGET_PCT,
  UNLIMITED,
} from '../../shared/autoFundSimulator.ts';

/**
 * ARRIV ESTATE MEDIA — FINAL AUTO-FUND MEMBERSHIP CERTIFICATION
 *
 * ANALYSIS ONLY. Read-only. Changes no pricing, compensation, allowance,
 * enrollment, balance, or production setting.
 *
 * Tests the approved final structure under full cost realism at both the live
 * $100 MLS price and the proposed $120 price, with:
 *   - the $25 membership fee as collected revenue (not a wallet liability),
 *   - no standalone MLS booking-count allowance at any tier,
 *   - promotional credit barred from standalone MLS on the VIP tier,
 *   - provider payouts at the authoritative 40% of post-sales value, which equals
 *     40% of retail on a wallet-funded booking (zero booking commission),
 *   - employer payroll burden and quality control on editing labour,
 *   - churn, refunds, rollover, and full eventual redemption of every balance.
 *
 * The promotional close-out ratio is the LOWEST-MARGIN service the customer is
 * permitted to buy, so promotional credit is never assumed to be spent on a
 * higher-margin service than the rules require.
 */

const MLS_PAYOUT = 50;
const EDITING_BASE = 20;          // 52 minutes at the $23/hr mean editor wage
const PRIORITY_SUPPORT_COST = 6;  // per month, for the fee-bearing non-VIP tiers
const VIP_TIER = 1000;

interface RealismSpec {
  id: string;
  label: string;
  editing_burden_rate: number;
  mls_qc: number;
}

export const REALISM: RealismSpec[] = [
  {
    id: 'R1',
    label: 'Full realism: 15% employer payroll burden, $5 QC per walkthrough, 40% partner payout',
    editing_burden_rate: 0.15,
    mls_qc: 5,
  },
  {
    id: 'R2',
    label: 'Conservative: 20% payroll burden, $8 QC per walkthrough, 40% partner payout',
    editing_burden_rate: 0.2,
    mls_qc: 8,
  },
];

const econAt = (price: number, r: RealismSpec) => ({
  id: r.id,
  label: r.label,
  mls_price: price,
  mls_payout: MLS_PAYOUT,
  mls_editing: EDITING_BASE,
  editing_burden_rate: r.editing_burden_rate,
  mls_qc: r.mls_qc,
  partner_rate: 0.40,
});

const ratio = (s: { payout: number; editing: number; retail: number }) =>
  round2((s.payout + s.editing) / s.retail);

/**
 * Cost ratios and the promotional close-out ratio for each tier class.
 * Non-VIP: promotional credit may buy anything, so the worst permitted is the
 *   highest-ratio service on the menu.
 * VIP: standalone MLS is barred, so the worst permitted is the highest-ratio
 *   ELIGIBLE service. A qualifying bundle only unlocks its own eligible portion,
 *   which carries the essentials ratio.
 */
function serviceEconomics(price: number, r: RealismSpec) {
  const e = econAt(price, r);
  const cat = serviceCatalog(e);
  const all = { S: ratio(cat.S), B: ratio(cat.B), E: ratio(cat.E), C: ratio(cat.C) };
  return {
    price,
    services: all,
    non_vip_promo_closeout_ratio: round2(Math.max(all.S, all.B, all.E, all.C)),
    vip_promo_closeout_ratio: round2(Math.max(all.E, all.C)),
    wallet_funded_mls_cost: round2(cat.S.payout + cat.S.editing),
  };
}

interface TierRun {
  tier: number;
  membership_fee: number;
  allowance: number | 'none (unlimited)';
  vip_promo_restricted: boolean;
  passes: boolean;
  worst_persona: string;
  worst_lifetime_pct: number;
  worst_lifetime_contribution: number;
  worst_cash_in: number;
  shortfall_dollars: number;
  failing_personas: { persona: string; description: string; margin_pct: number; contribution: number; cash_in: number }[];
}

function evaluateTier(
  tier: number,
  price: number,
  r: RealismSpec,
  feeFor: (t: number) => number,
  restrictVipPromo: boolean,
  personas: string[] = CERT_PERSONAS,
): TierRun {
  const e = econAt(price, r);
  const econ = serviceEconomics(price, r);
  const isVip = tier === VIP_TIER;
  const allowedTier = isVip ? restrictVipPromo : false;
  const opts = {
    membership_fee: feeFor(tier),
    membership_benefit_cost: isVip || feeFor(tier) === 0 ? 0 : PRIORITY_SUPPORT_COST,
    vip_promo_on_standalone: isVip ? !allowedTier : undefined,
    promo_closeout_ratio: isVip ? econ.vip_promo_closeout_ratio : econ.non_vip_promo_closeout_ratio,
  };
  const runs = personas.map(p => simulate(tier, UNLIMITED, p, e, VIP_BASE, opts)!).filter(Boolean);
  const worst = runs.reduce((w, x) => (w === null || x.margin_lifetime_pct < w.margin_lifetime_pct ? x : w), null as any);
  const failing = runs.filter(x => !x.meets_target).sort((a, b) => a.margin_lifetime_pct - b.margin_lifetime_pct);
  return {
    tier,
    membership_fee: feeFor(tier),
    allowance: 'none (unlimited)',
    vip_promo_restricted: allowedTier,
    passes: failing.length === 0,
    worst_persona: worst.persona,
    worst_lifetime_pct: worst.margin_lifetime_pct,
    worst_lifetime_contribution: worst.contribution_lifetime,
    worst_cash_in: worst.cash_in,
    shortfall_dollars: round2((TARGET_PCT / 100) * worst.cash_in - worst.contribution_lifetime),
    failing_personas: failing.map(x => ({
      persona: x.persona,
      description: PERSONA_DESCRIPTIONS[x.persona] ?? x.persona,
      margin_pct: x.margin_lifetime_pct,
      contribution: x.contribution_lifetime,
      cash_in: x.cash_in,
    })),
  };
}

function evaluateConfig(
  price: number,
  r: RealismSpec,
  feeFor: (t: number) => number,
  restrictVipPromo = true,
  personas: string[] = CERT_PERSONAS,
) {
  const tiers = AUTO_FUND_AMOUNT_OPTIONS.map(t => evaluateTier(t, price, r, feeFor, restrictVipPromo, personas));
  return { tiers, passes: tiers.every(t => t.passes) };
}

/** All certification patterns except churn, for a churn-excluded view. */
const NO_CHURN_PERSONAS = CERT_PERSONAS.filter(p => p !== 'churn_after_4');

const approvedFee = (t: number) => AUTOFUND_MEMBERSHIP_FEE[t] ?? 0;

/** The VIP tier alone, under a given promotional rule. */
function vipOnly(price: number, r: RealismSpec, restrictVipPromo: boolean, fee: number) {
  const t = evaluateTier(VIP_TIER, price, r, () => fee, restrictVipPromo);
  return { price, restrictVipPromo, membership_fee: fee, ...t };
}

export function runFinalCertification() {
  const priceResults = [100, 120].map(price =>
    REALISM.map(r => {
      const result = evaluateConfig(price, r, approvedFee, true);
      return {
        price,
        realism: r.id,
        realism_label: r.label,
        cost_economics: serviceEconomics(price, r),
        tiers: result.tiers,
        verdict: result.passes ? 'PASS' : 'FAIL',
        failing_tiers: result.tiers.filter(t => !t.passes).map(t => t.tier),
      };
    }),
  ).flat();

  // ── C. Membership economics ────────────────────────────────────────────────
  const membershipEconomics = [350, 500, 1000].map(tier => {
    const fee = AUTOFUND_MEMBERSHIP_FEE[tier];
    const processing = round2(fee * 0.029 + 0.30);
    const isVip = tier === VIP_TIER;
    const benefitCost = isVip ? 0 : PRIORITY_SUPPORT_COST;
    return {
      tier,
      monthly_fee: fee,
      annual_fee_revenue: round2(fee * 12),
      less_payment_processing: round2(processing * 12),
      less_incremental_benefit_cost: round2(benefitCost * 12),
      net_annual_contribution: round2((fee - processing - benefitCost) * 12),
      net_monthly_contribution: round2(fee - processing - benefitCost),
      benefit_cost_basis: isVip
        ? 'VIP support is fully costed inside the tier ledger ($72 retainer + 12 sessions at $25). The fee offsets it rather than adding a second cost.'
        : 'Priority Arriv Assist support and priority booking handling, at the same $6/month basis already used for VIP enhanced support.',
      vip_support_offset: isVip
        ? { vip_support_cost_per_year: 372, membership_fee_net_per_year: round2((fee - processing) * 12), share_of_vip_support_funded: round2((((fee - processing) * 12) / 372) * 100) }
        : null,
    };
  });

  // ── D. Does the VIP promotional restriction solve the previous gap? ────────
  const vipCertification = [100, 120].map(price => {
    const r = REALISM[0];
    const finalStructure = vipOnly(price, r, true, 25);
    const feeOnlyNoRestriction = vipOnly(price, r, false, 25);
    const priorStructure = vipOnly(price, r, false, 0);
    return {
      price,
      prior_structure_no_restriction_no_fee: { worst_pct: priorStructure.worst_lifetime_pct, worst_persona: priorStructure.worst_persona, passes: priorStructure.passes },
      membership_fee_only: { worst_pct: feeOnlyNoRestriction.worst_lifetime_pct, worst_persona: feeOnlyNoRestriction.worst_persona, passes: feeOnlyNoRestriction.passes },
      final_structure_restricted_with_fee: { worst_pct: finalStructure.worst_lifetime_pct, worst_persona: finalStructure.worst_persona, passes: finalStructure.passes, failing_personas: finalStructure.failing_personas },
      value_of_the_restriction_pct_points: round2(finalStructure.worst_lifetime_pct - feeOnlyNoRestriction.worst_lifetime_pct),
      total_improvement_vs_prior_pct_points: round2(finalStructure.worst_lifetime_pct - priorStructure.worst_lifetime_pct),
      promotional_closeout_ratio_vip: serviceEconomics(price, r).vip_promo_closeout_ratio,
      promotional_closeout_ratio_if_unrestricted: serviceEconomics(price, r).non_vip_promo_closeout_ratio,
    };
  });

  // ── F. Remedy: the single smallest financially sufficient adjustment ───────
  const remedySearch: any[] = [];
  for (const price of [100, 120]) {
    const r = REALISM[0];
    // (i) VIP membership fee only, other tiers unchanged
    let vipFee: number | null = null;
    for (let f = 25; f <= 200; f++) {
      if (evaluateConfig(price, r, (t) => (t === VIP_TIER ? f : approvedFee(t)), true).passes) { vipFee = f; break; }
    }
    // (ii) all three fee-bearing tiers raised together
    let allFees: number | null = null;
    for (let f = 25; f <= 200; f++) {
      if (evaluateConfig(price, r, (t) => (approvedFee(t) > 0 ? f : 0), true).passes) { allFees = f; break; }
    }
    // (iii) MLS price, membership fees left at the approved $25
    let minPrice: number | null = null;
    for (let p = price; p <= 250; p++) {
      if (evaluateConfig(p, r, approvedFee, true).passes) { minPrice = p; break; }
    }
    const priceProbe = [120, 130, 140, 150, 175, 200, 250].map(p => {
      const res = evaluateConfig(p, r, approvedFee, true);
      return {
        price: p,
        passes: res.passes,
        failing: res.tiers.filter(t => !t.passes).map(t => ({
          tier: t.tier,
          worst_lifetime_pct: t.worst_lifetime_pct,
          worst_persona: t.worst_persona,
        })),
      };
    });
    // (iv) VIP fee needed if the churn pattern is excluded entirely
    let vipFeeNoChurn: number | null = null;
    for (let f = 25; f <= 200; f++) {
      if (evaluateConfig(price, r, (t) => (t === VIP_TIER ? f : approvedFee(t)), true, NO_CHURN_PERSONAS).passes) { vipFeeNoChurn = f; break; }
    }
    remedySearch.push({
      price_probe: priceProbe,
      vip_membership_fee_needed_excluding_churn: vipFeeNoChurn === null ? null : { monthly_fee: vipFeeNoChurn, increase_from_approved: round2(vipFeeNoChurn - 25) },
      price,
      vip_membership_fee_only: vipFee === null ? null : { monthly_fee: vipFee, increase_from_approved: round2(vipFee - 25), annual_increase: round2((vipFee - 25) * 12) },
      all_fee_tiers_raised: allFees === null ? null : { monthly_fee: allFees, increase_from_approved: round2(allFees - 25), annual_increase: round2((allFees - 25) * 12) },
      mls_price: minPrice === null ? null : { price: minPrice, increase_from_tested_price: round2(minPrice - price) },
    });
  }

  const r1At120 = priceResults.find(x => x.price === 120 && x.realism === 'R1')!;
  const r1At100 = priceResults.find(x => x.price === 100 && x.realism === 'R1')!;

  return {
    flags: AUTOFUND_FINAL_FLAGS,
    approved_fee_schedule: AUTOFUND_MEMBERSHIP_FEE,
    approved_configuration: AUTO_FUND_AMOUNT_OPTIONS.map(t => {
      const cfg = getAutoFundConfig(t)!;
      return {
        deposit: cfg.amount,
        membership_fee: AUTOFUND_MEMBERSHIP_FEE[t] ?? 0,
        total_monthly_charge: cfg.amount + (AUTOFUND_MEMBERSHIP_FEE[t] ?? 0),
        promotional_bonus_pct: cfg.bonus_pct,
        promotional_bonus_value: cfg.bonus_booking_value,
        total_booking_value: cfg.booking_value,
        standalone_mls_allowance: 'none — unlimited with the customer\'s own funds',
        promo_usable_on_standalone_mls: t !== VIP_TIER,
      };
    }),
    personas_used: CERT_PERSONAS.map(p => ({ persona: p, description: PERSONA_DESCRIPTIONS[p] ?? p })),
    target_lifetime_margin_pct: TARGET_PCT,
    results_by_price_and_realism: priceResults,
    membership_economics: membershipEconomics,
    vip_certification: vipCertification,
    remedy_search: remedySearch,
    verdict: {
      at_100_full_realism: r1At100.verdict,
      at_120_full_realism: r1At120.verdict,
      overall: r1At100.verdict === 'PASS' && r1At120.verdict === 'PASS' ? 'PASS' : 'FAIL',
      failing_tiers_at_100: r1At100.failing_tiers,
      failing_tiers_at_120: r1At120.failing_tiers,
    },
    note: 'Analysis only. Enrollment stays disabled, production pricing is unchanged, and no membership fee is charged.',
  };
}