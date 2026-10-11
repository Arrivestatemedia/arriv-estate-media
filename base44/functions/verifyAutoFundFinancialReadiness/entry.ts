import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getAutoFundConfig, round2 } from '../../shared/prepaidEngine.ts';
import {
  simulate,
  promoCloseoutRatio,
  OWNER_PERSONAS,
  PERSONA_DESCRIPTIONS,
  VIP_BASE,
  UNLIMITED,
  type Economics,
} from '../../shared/autoFundSimulator.ts';
import {
  MLS_PRICE_STANDARD_LIVE,
  MLS_PRICE_STANDARD_APPROVED,
  MLS_PRICING_VERSION_LIVE,
} from '../../shared/mlsPricing.ts';
import { AUTOFUND_MEMBERSHIP_FEE, AUTOFUND_FINAL_FLAGS } from '../../shared/autoFundFinalConfig.ts';

/**
 * ARRIV ESTATE MEDIA — FINAL AUTO-FUND FINANCIAL READINESS VERIFICATION
 *
 * ADMIN-ONLY, READ-ONLY. Activates nothing.
 *
 *   - never writes a MediaPricingConfig record (prices come from mlsPricing.ts)
 *   - never changes a membership fee, bonus, allowance, or compensation rate
 *   - never enrolls, charges, or bills a customer
 *   - never touches a wallet, lot, ledger or historical record
 *
 * Every number is produced by the SINGLE certified simulation core
 * (base44/shared/autoFundSimulator.ts) so these results are comparable with the
 * existing certification, stress-test and unit-economics analyses.
 *
 * TIER-SPECIFIC CONTRIBUTION-MARGIN THRESHOLDS (owner directive 2026-10-11):
 *   $50 / $100 / $200 / $350 / $500  →  minimum 10%
 *   $1,000 VIP                       →  minimum 3% (5% or higher preferred)
 *
 * The LIVE MLS Walkthrough price ($100, pricing version V1) is used throughout.
 * The owner-approved $120 (V2) is valued for comparison only and is never activated.
 */

const MLS_PAYOUT = 50;                 // contractual guaranteed payout, <=2,500 sqft
const VIP_PRIORITY_SUPPORT_COST = 6;   // per month, non-VIP tiers carrying a fee
const DISPUTE_FEE = 15;                // per chargeback, not configured — assumption
const SWEEP_CEILING = 170;             // price-search ceiling, dollars

/** The six tiers named in the owner's threshold directive. */
const REQUIRED_TIERS = [50, 100, 200, 350, 500, 1000];
/** The tiers actually enrollable today (the retired entry tiers' replacements). */
const LIVE_ENTRY_TIERS = [150, 250];
const ALL_TIERS = [...REQUIRED_TIERS, ...LIVE_ENTRY_TIERS];
const RETIRED_TIERS = [50, 100, 200];

type Basis = {
  id: string;
  label: string;
  wage: number;
  minutes: number;
  burden: number;
  qc: number;
};

/**
 * The two cost bases. The expected basis is the owner-approved planning
 * assumption already carried in autoFundMlsAllowance.ts ($25.70 editing + QC).
 * The conservative basis rederives editing from the MEASURED editor wage
 * ($23.00/hr from EditorProfile) and loads a heavier burden and QC figure.
 */
const COST_BASES: Basis[] = [
  {
    id: 'EXPECTED',
    label: 'Expected — owner-approved planning assumption: $18.00/hr x 60 active minutes, +15% employer payroll burden, +$5.00 QC',
    wage: 18, minutes: 60, burden: 0.15, qc: 5,
  },
  {
    id: 'CONSERVATIVE',
    label: 'Conservative — measured editor wage basis: $23.00/hr x 52 active minutes, +20% employer payroll burden, +$8.00 QC',
    wage: 23, minutes: 52, burden: 0.20, qc: 8,
  },
];

const EXPECTED_BASIS = COST_BASES[0];
const CONSERVATIVE_BASIS = COST_BASES[1];

const editingGross = (b: Basis) => round2(b.wage * (b.minutes / 60));
const editingPlusQc = (b: Basis) => round2(editingGross(b) * (1 + b.burden) + b.qc);

const econFor = (price: number, b: Basis): Economics => ({
  id: b.id,
  label: b.label,
  mls_price: price,
  mls_payout: MLS_PAYOUT,
  mls_editing: editingGross(b),
  editing_burden_rate: b.burden,
  mls_qc: b.qc,
  partner_rate: 0.40,
});

/** VIP support utilization: expected vs the maximum contractual entitlement. */
const VIP_SUPPORT_EXPECTED = VIP_BASE;                                   // 12 sessions/yr at $25
const VIP_SUPPORT_MAX_CONTRACTUAL = { sessions_per_year: 48, cost_per_session: 25 };

/** Owner-stated MLS policy: no count cap on $50–$500; VIP 7 promotional walkthroughs per cycle. */
const VIP_STATED_ALLOWANCE = 7;
const allowanceFor = (tier: number) => (tier === 1000 ? VIP_STATED_ALLOWANCE : UNLIMITED);

const thresholdFor = (tier: number) => (tier === 1000 ? 3 : 10);
const preferredFor = (tier: number) => (tier === 1000 ? 5 : 10);

const scheduledFeeFor = (tier: number) => AUTOFUND_MEMBERSHIP_FEE[tier] ?? 0;

function optsFor(tier: number, e: Economics, vipPromoOnStandalone: boolean) {
  const isVip = tier === 1000;
  const fee = scheduledFeeFor(tier);
  return {
    membership_fee: fee,
    membership_benefit_cost: isVip || fee === 0 ? 0 : VIP_PRIORITY_SUPPORT_COST,
    // Stated explicitly: the owner's stated policy permits VIP promotional value on a
    // standalone walkthrough up to the 7-per-cycle allowance. 'false' models the
    // currently CONFIGURED rule (VIP promotional value barred from standalone MLS).
    vip_promo_on_standalone: isVip ? vipPromoOnStandalone : undefined,
    promo_closeout_ratio: promoCloseoutRatio(
      e,
      ['S', 'B', 'E', 'C'],
      isVip && !vipPromoOnStandalone,
    ),
  };
}

/** Worst-case (lowest lifetime margin) run across every owner stress pattern. */
function worstCase(
  tier: number,
  price: number,
  basis: Basis,
  vipSupport: { sessions_per_year: number; cost_per_session: number },
  vipPromoOnStandalone: boolean,
) {
  const e = econFor(price, basis);
  const allowance = allowanceFor(tier);
  const opts = optsFor(tier, e, vipPromoOnStandalone);
  const runs = OWNER_PERSONAS
    .map((p) => simulate(tier, allowance, p, e, vipSupport, opts))
    .filter(Boolean) as any[];
  const worst = runs.reduce(
    (w: any, r: any) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w),
    null,
  );
  const failing = runs
    .filter((r: any) => r.margin_lifetime_pct < thresholdFor(tier))
    .sort((a: any, b: any) => a.margin_lifetime_pct - b.margin_lifetime_pct);
  const lossMaking = runs.filter((r: any) => r.contribution_lifetime < 0);
  return { worst, failing, lossMaking, runs };
}

/** Chargeback overlay. Documented, transparent, applied to a computed run. */
function chargebackStress(run: any, tier: number, count: number, activeMonths: number) {
  const amount = getAutoFundConfig(tier)!.amount;
  // A chargeback can only reverse a charge that was actually made.
  const disputes = Math.max(0, Math.min(count, activeMonths));
  const share = activeMonths > 0 ? disputes / activeMonths : 0;
  const cashReversed = round2(amount * disputes);
  // The disputed funding is voided, so the Booking Value it created stops being a
  // liability. Credited back pro-rata: conservative, because most value is already
  // redeemed in the worst-case patterns and nothing is assumed to be recovered.
  const liabilitiesVoided = round2(share * (run.outstanding_promo + run.outstanding_cash));
  const disputeFees = round2(DISPUTE_FEE * disputes);
  const contribution = round2(run.contribution_lifetime - cashReversed + liabilitiesVoided - disputeFees);
  const cashIn = round2(run.cash_in - cashReversed);
  return {
    chargebacks_per_year: count,
    disputes_actually_applied: disputes,
    funding_cash_reversed: cashReversed,
    liabilities_voided: liabilitiesVoided,
    dispute_fees: disputeFees,
    contribution_lifetime: contribution,
    cash_in: cashIn,
    margin_lifetime_pct: cashIn > 0 ? round2((contribution / cashIn) * 100) : 0,
    meets_threshold: cashIn > 0 && (contribution / cashIn) * 100 >= thresholdFor(tier),
  };
}

function costLedger(run: any) {
  return {
    specialist_payout: run.specialist_payout,
    editing_and_qc: run.editing,
    funding_commission: run.funding_commission,
    booking_commission: run.booking_commission,
    payment_processing: run.stripe,
    vip_support_incremental: run.vip_cost,
    membership_benefit_cost: run.membership_benefit_cost,
    full_redemption_closeout: run.closeout_cost,
    total: round2(
      run.specialist_payout + run.editing + run.funding_commission + run.booking_commission +
      run.stripe + run.vip_cost + run.membership_benefit_cost + run.closeout_cost,
    ),
  };
}

function summarize(run: any, tier: number, basis: any = null) {
  return {
    worst_persona: run.persona,
    worst_persona_description: PERSONA_DESCRIPTIONS[run.persona] ?? run.persona,
    cash_in: run.cash_in,
    realized_12m_contribution: run.contribution_12m,
    realized_12m_margin_pct: run.margin_12m_pct,
    outstanding_promotional_liability: run.outstanding_promo,
    outstanding_cash_funded_liability: run.outstanding_cash,
    full_redemption_closeout_cost: run.closeout_cost,
    fully_redeemed_lifetime_contribution: run.contribution_lifetime,
    lifetime_margin_pct: run.margin_lifetime_pct,
    threshold_pct: thresholdFor(tier),
    meets_threshold: run.margin_lifetime_pct >= thresholdFor(tier),
    meets_preferred: run.margin_lifetime_pct >= preferredFor(tier),
    shortfall_dollars: round2((thresholdFor(tier) / 100) * run.cash_in - run.contribution_lifetime),
    cost_ledger: costLedger(run),
    ...(basis ? { basis: basis.id } : {}),
  };
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));
    const LIVE_PRICE = MLS_PRICE_STANDARD_LIVE;
    const APPROVED_PRICE = MLS_PRICE_STANDARD_APPROVED;

    // ═══ PER-TIER VERIFICATION at the LIVE price, owner-stated policy ════════
    const tiers = ALL_TIERS.map((tier) => {
      const cfg = getAutoFundConfig(tier)!;
      const fee = scheduledFeeFor(tier);
      // The two sensitivities are measured SEPARATELY, then combined, so no result
      // attributes a cost movement to a support-utilisation movement or vice versa.
      const expected = worstCase(tier, LIVE_PRICE, EXPECTED_BASIS, VIP_SUPPORT_EXPECTED, true);
      const conservative = worstCase(tier, LIVE_PRICE, CONSERVATIVE_BASIS, VIP_SUPPORT_EXPECTED, true);
      const maxSupport = worstCase(tier, LIVE_PRICE, EXPECTED_BASIS, VIP_SUPPORT_MAX_CONTRACTUAL, true);
      const combinedWorst = worstCase(tier, LIVE_PRICE, CONSERVATIVE_BASIS, VIP_SUPPORT_MAX_CONTRACTUAL, true);
      // The no-churn view: the weakest pattern that actually stays subscribed for
      // the full twelve months. Reported alongside the churn headline so a failure
      // is never attributed to the early-termination stress alone.
      const fullYearRuns = expected.runs.filter((r: any) => r.active_months === 12);
      const worstFullYear = fullYearRuns.reduce(
        (w: any, r: any) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null,
      );

      return {
        tier,
        tier_name: cfg.tier_name ?? `$${tier}`,
        retired_from_new_enrollment: RETIRED_TIERS.includes(tier),
        monthly_funding_amount: cfg.amount,
        promotional_booking_value_per_month: cfg.bonus_booking_value,
        bonus_pct: cfg.bonus_pct,
        contractual_membership_fee: fee,
        membership_fee_currently_chargeable: AUTOFUND_FINAL_FLAGS.membership_fee_enabled ? fee : 0,
        total_recurring_monthly_charge: round2(cfg.amount + fee),
        annual_recurring_collected_revenue: round2((cfg.amount + fee) * 12),
        annual_promotional_booking_value_issued: round2(cfg.bonus_booking_value * 12),
        annual_cash_funded_booking_value_issued: round2(cfg.amount * 12),
        mls_policy: tier === 1000
          ? 'VIP — promotional Booking Value permitted on standalone MLS up to 7 per cycle (owner-stated policy); cash-funded value unlimited'
          : 'No standalone-MLS booking-count cap — the available balance is the only bound',
        expected_case: summarize(expected.worst, tier),
        conservative_cost_case_max_support: summarize(combinedWorst.worst, tier),
        conservative_cost_case_expected_support: summarize(conservative.worst, tier),
        expected_cost_case_max_support: summarize(maxSupport.worst, tier),
        chargeback_stress_expected: [2, 4].map((n) => chargebackStress(expected.worst, tier, n, expected.worst.active_months)),
        worst_twelve_month_active_case: summarize(worstFullYear, tier),
        chargeback_stress_full_year_basis: [2, 4].map((n) => chargebackStress(worstFullYear, tier, n, 12)),
        failing_pattern_count_expected: expected.failing.length,
        failing_pattern_count_conservative: conservative.failing.length,
        loss_making_patterns_expected: expected.lossMaking.map((r: any) => ({
          persona: r.persona,
          description: PERSONA_DESCRIPTIONS[r.persona] ?? r.persona,
          contribution: r.contribution_lifetime,
          margin_pct: r.margin_lifetime_pct,
          cash_in: r.cash_in,
        })),
        loss_making_patterns_conservative: conservative.lossMaking.map((r: any) => ({
          persona: r.persona,
          description: PERSONA_DESCRIPTIONS[r.persona] ?? r.persona,
          contribution: r.contribution_lifetime,
          margin_pct: r.margin_lifetime_pct,
          cash_in: r.cash_in,
        })),
        verdict: {
          expected: expected.worst.margin_lifetime_pct >= thresholdFor(tier) ? 'PASS' : 'FAIL',
          conservative: conservative.worst.margin_lifetime_pct >= thresholdFor(tier) ? 'PASS' : 'FAIL',
          max_support: maxSupport.worst.margin_lifetime_pct >= thresholdFor(tier) ? 'PASS' : 'FAIL',
          combined_worst: combinedWorst.worst.margin_lifetime_pct >= thresholdFor(tier) ? 'PASS' : 'FAIL',
          worst_case_of_the_two: Math.min(
            expected.worst.margin_lifetime_pct,
            combinedWorst.worst.margin_lifetime_pct,
          ) >= thresholdFor(tier) ? 'PASS' : 'FAIL',
        },
      };
    });

    // ═══ VIP SUPPORT UTILISATION — expected vs maximum contractual ══════════
    // Reported on BOTH bases: all patterns, and the patterns that actually stay
    // active for the full twelve months. Support cost accrues pro-rata to active
    // months, so a churned pattern understates the support sensitivity.
    const vipSupportUtilization = [12, 24, 48].map((sessions) => {
      const support = { sessions_per_year: sessions, cost_per_session: 25 };
      const all = worstCase(1000, LIVE_PRICE, EXPECTED_BASIS, support, true);
      const fullYearRuns = all.runs.filter((r: any) => r.active_months === 12);
      const worstFullYear = fullYearRuns.reduce(
        (w: any, r: any) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null,
      );
      return {
        sessions_per_year: sessions,
        share_of_contractual_entitlement_pct: round2((sessions / 48) * 100),
        annual_support_cost_per_member: round2(VIP_PRIORITY_SUPPORT_COST * 12 + sessions * 25),
        worst_all_patterns: {
          persona: all.worst.persona,
          margin_pct: all.worst.margin_lifetime_pct,
          contribution: all.worst.contribution_lifetime,
        },
        worst_twelve_month_active_patterns: {
          persona: worstFullYear.persona,
          margin_pct: worstFullYear.margin_lifetime_pct,
          contribution: worstFullYear.contribution_lifetime,
          vip_support_cost_charged: worstFullYear.vip_cost,
        },
      };
    });

    // ═══ VIP ALLOWANCE — does the 7-per-cycle cap mask redemption liability? ═══
    const vipCfg = getAutoFundConfig(1000)!;
    const vipAnnualPromo = round2(vipCfg.bonus_booking_value * 12);
    const vipPromoWalkthroughsPerYear = round2(vipAnnualPromo / LIVE_PRICE);
    const vipCapCapacityPerYear = VIP_STATED_ALLOWANCE * 12;
    const vipVariants = [
      { id: 'OWNER_STATED_7_PER_CYCLE', label: 'Owner-stated policy: promotional value permitted on standalone MLS up to 7 per cycle', allowance: VIP_STATED_ALLOWANCE, promoAllowed: true },
      { id: 'NO_CAP', label: 'No cap at all on standalone MLS promotional spend', allowance: UNLIMITED, promoAllowed: true },
      { id: 'CURRENTLY_CONFIGURED_BARRED', label: 'Currently configured rule: VIP promotional value barred from standalone MLS', allowance: 0, promoAllowed: false },
    ].map((v) => {
      const r = worstCase(1000, LIVE_PRICE, EXPECTED_BASIS, VIP_SUPPORT_EXPECTED, v.promoAllowed).worst;
      const runAtCap = simulate(1000, v.allowance, 'wallet_matched_mls', econFor(LIVE_PRICE, EXPECTED_BASIS), VIP_SUPPORT_EXPECTED, optsFor(1000, econFor(LIVE_PRICE, EXPECTED_BASIS), v.promoAllowed))!;
      return {
        id: v.id,
        label: v.label,
        allowance_per_cycle: v.allowance === UNLIMITED ? 'no cap' : v.allowance,
        worst_lifetime_margin_pct: r.margin_lifetime_pct,
        worst_lifetime_contribution: r.contribution_lifetime,
        worst_persona: r.persona,
        // The liability test: is every promotional dollar still costed?
        promotional_value_issued_annually: runAtCap.promo_issued,
        promotional_value_redeemed: round2(runAtCap.promo_on_standalone_mls + runAtCap.promo_on_bundles_packages),
        promotional_liability_outstanding_at_year_end: runAtCap.outstanding_promo,
        standalone_mls_promo_spend: runAtCap.promo_on_standalone_mls,
      };
    });
    const vipAllowanceCheck = {
      annual_promotional_value_issued: vipAnnualPromo,
      promotional_walkthroughs_that_value_funds_per_year: vipPromoWalkthroughsPerYear,
      walkthroughs_the_7_per_cycle_cap_permits_per_year: vipCapCapacityPerYear,
      cap_is_binding: vipPromoWalkthroughsPerYear > vipCapCapacityPerYear,
      variants: vipVariants,
      margin_spread_across_variants_pct: round2(
        Math.max(...vipVariants.map((v) => v.worst_lifetime_margin_pct)) -
        Math.min(...vipVariants.map((v) => v.worst_lifetime_margin_pct)),
      ),
      verdict: vipPromoWalkthroughsPerYear > vipCapCapacityPerYear
        ? 'BINDING — the cap limits how much promotional value can reach standalone MLS, so it reduces exposure.'
        : 'NON-BINDING — the promotional pool is exhausted long before the cap is reached. Every promotional dollar issued remains a real redemption liability whether the cap is 7, unlimited, or the currently configured bar. The cap masks nothing and protects nothing; it only routes promotional credit between services.',
    };

    // ═══ SMALLEST CORRECTIVE ACTION for any failing tier (evidence only) ═════
    const failingAtLivePrice = tiers
      .filter((t) => REQUIRED_TIERS.includes(t.tier) && t.verdict.worst_case_of_the_two === 'FAIL')
      .map((t) => t.tier);

    const priceSearch = failingAtLivePrice.map((tier) => {
      let found: any = null;
      for (let price = LIVE_PRICE + 1; price <= SWEEP_CEILING; price++) {
        const r = worstCase(tier, price, EXPECTED_BASIS, VIP_SUPPORT_EXPECTED, true).worst;
        if (r.margin_lifetime_pct >= thresholdFor(tier)) {
          found = { price, margin_pct: r.margin_lifetime_pct, worst_persona: r.persona };
          break;
        }
      }
      return {
        tier,
        threshold_pct: thresholdFor(tier),
        margin_at_live_price_pct: tiers.find((t) => t.tier === tier)!.expected_case.lifetime_margin_pct,
        minimum_live_price_that_meets_threshold: found,
        price_increase_required: found ? round2(found.price - LIVE_PRICE) : null,
      };
    });

    const allTiersPrice = priceSearch.length
      ? Math.max(...priceSearch.map((p) => p.minimum_live_price_that_meets_threshold?.price ?? Infinity))
      : null;

    // ═══ Membership-fee sensitivity: scheduled fee vs the currently chargeable $0 ═
    const feeOffSensitivity = [350, 500, 1000].map((tier) => {
      const e = econFor(LIVE_PRICE, EXPECTED_BASIS);
      const opts = { ...optsFor(tier, e, true), membership_fee: 0, membership_benefit_cost: 0 };
      const runs = OWNER_PERSONAS
        .map((p) => simulate(tier, allowanceFor(tier), p, e, VIP_SUPPORT_EXPECTED, opts))
        .filter(Boolean) as any[];
      const worst = runs.reduce((w: any, r: any) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null);
      return {
        tier,
        scheduled_fee: scheduledFeeFor(tier),
        worst_margin_with_fee_pct: tiers.find((t) => t.tier === tier)!.expected_case.lifetime_margin_pct,
        worst_margin_with_fee_switched_off_pct: worst.margin_lifetime_pct,
        margin_cost_of_leaving_billing_off_pct: round2(
          tiers.find((t) => t.tier === tier)!.expected_case.lifetime_margin_pct - worst.margin_lifetime_pct,
        ),
      };
    });

    // ═══ Approved-price comparison (valued, never activated) ══════════════════
    const atApprovedPrice = ALL_TIERS.map((tier) => {
      const r = worstCase(tier, APPROVED_PRICE, EXPECTED_BASIS, VIP_SUPPORT_EXPECTED, true).worst;
      return {
        tier,
        threshold_pct: thresholdFor(tier),
        worst_lifetime_margin_pct: r.margin_lifetime_pct,
        worst_lifetime_contribution: r.contribution_lifetime,
        worst_persona: r.persona,
        meets_threshold: r.margin_lifetime_pct >= thresholdFor(tier),
      };
    });

    const anyLoss = tiers.flatMap((t) => [
      ...t.loss_making_patterns_expected.map((r: any) => ({ tier: t.tier, basis: 'EXPECTED', ...r })),
      ...t.loss_making_patterns_conservative.map((r: any) => ({ tier: t.tier, basis: 'CONSERVATIVE', ...r })),
    ]);

    return Response.json({
      status: 'VERIFICATION_COMPLETE',
      model_version: 'autofund_financial_readiness_v1_20261011',
      basis: {
        mls_price_used: LIVE_PRICE,
        mls_pricing_version_used: MLS_PRICING_VERSION_LIVE,
        approved_price_valued_but_not_activated: APPROVED_PRICE,
        production_pricing_changed: false,
        membership_fee_enabled_flag: AUTOFUND_FINAL_FLAGS.membership_fee_enabled,
        enrollment_enabled_flag: AUTOFUND_FINAL_FLAGS.enrollment_enabled,
        vip_restriction_flag: AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled,
        thresholds: { standard_tiers: 10, vip: 3, vip_preferred: 5 },
        mls_policy_under_test: 'No standalone booking-count cap on $50–$500; VIP promotional allowance 7 per cycle',
        cost_bases: COST_BASES.map((b) => ({
          id: b.id, label: b.label,
          editing_gross_per_walkthrough: editingGross(b),
          editing_plus_qc_per_walkthrough: editingPlusQc(b),
        })),
        vip_support: {
          expected: VIP_SUPPORT_EXPECTED,
          maximum_contractual: VIP_SUPPORT_MAX_CONTRACTUAL,
          retainer_per_month: VIP_PRIORITY_SUPPORT_COST,
        },
        personas_tested: OWNER_PERSONAS,
        persona_descriptions: PERSONA_DESCRIPTIONS,
        chargeback_overlay_rule:
          'Per chargeback: the disputed monthly funding cash is reversed, the Booking Value it created is voided pro-rata against the remaining balance, and a $15 dispute fee is charged. Delivery already performed is retained. Not a configured rate — an assumption.',
        closeout_rule:
          'Lifetime contribution charges the FULL eventual redemption of every outstanding cash-funded and promotional Booking Value, at the lowest-margin service the tier is permitted to use.',
      },
      counts: {
        tiers_verified: ALL_TIERS.length,
        tiers_failing_at_live_price_expected: tiers.filter((t) => t.expected_case.meets_threshold === false && REQUIRED_TIERS.includes(t.tier)).map((t) => t.tier),
        tiers_failing_at_live_price_conservative: tiers.filter((t) => t.conservative_cost_case_expected_support.meets_threshold === false && REQUIRED_TIERS.includes(t.tier)).map((t) => t.tier),
        tiers_failing_at_live_price_combined_worst: tiers.filter((t) => t.conservative_cost_case_max_support.meets_threshold === false && REQUIRED_TIERS.includes(t.tier)).map((t) => t.tier),
        vip_support_utilization_cost_of_full_entitlement_pct_points: round2(
          tiers.find((t) => t.tier === 1000)!.expected_case.lifetime_margin_pct -
          tiers.find((t) => t.tier === 1000)!.expected_cost_case_max_support.lifetime_margin_pct,
        ),
        loss_making_pattern_count: anyLoss.length,
      },
      tiers,
      vip_support_utilization: vipSupportUtilization,
      vip_allowance_check: vipAllowanceCheck,
      corrective_action_evidence: {
        note: 'Evidence only. No price was changed. A change to the MLS Walkthrough price reaches every retail customer, not only Auto-Fund members, and is the owner\'s decision.',
        price_search: priceSearch,
        lowest_single_price_at_which_all_verified_tiers_meet_their_threshold:
          allTiersPrice === null || !Number.isFinite(allTiersPrice) ? null : allTiersPrice,
      },
      membership_fee_sensitivity: feeOffSensitivity,
      at_approved_price_120_comparison: atApprovedPrice,
      loss_making_scenarios: anyLoss,
      unresolved_assumptions: [
        'NO MLS WALKTHROUGH HAS EVER BEEN PRODUCED. Editing minutes, and therefore the editing cost per walkthrough, has never been observed. Both cost bases are assumptions.',
        'The employer payroll burden percentage and the quality-control expense per walkthrough are not configured anywhere in the app.',
        'The membership fee is scheduled at $25 on the $350 / $500 / $1,000 tiers, but membership billing is switched off, so the currently chargeable fee is $0. A launch with billing off would cost those tiers the full $300/year of fee revenue.',
        'VIP enhanced-support utilisation is unmeasured: 12 sessions per member per year is assumed, against a 48-session contractual entitlement.',
        'Chargeback frequency is unmeasured. 2 and 4 per member per year are modelled.',
        'The LIVE MLS Walkthrough price is $100. The owner-approved $120 is not live. Every result here uses $100 as instructed.',
        'The $50 / $100 / $200 tiers are retired from new enrollment and have zero live subscribers; they are verified here because the owner\'s threshold directive names them.',
        'Funding commission is modelled at 15% first payment and 8% recurring for every subscription. A self-service enrollment with no verified advisor attribution generates no commission, which would improve every margin shown.',
        'Sales-commission and payment-processing behaviour on chargebacks (whether the advisor commission is clawed back) is not modelled; the overlay assumes it is not.',
      ],
      note: 'Analysis only. Enrollment stays disabled, no membership fee is charged or billed, no customer is enrolled, and no pricing, bonus, allowance, compensation, balance or production setting was changed.',
    });
  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}