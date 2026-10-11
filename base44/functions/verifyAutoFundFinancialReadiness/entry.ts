import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTO_FUND_AMOUNT_OPTIONS,
  AUTO_FUND_FIRST_PAYMENT_RATE,
  AUTO_FUND_RECURRING_RATE,
  getAutoFundConfig,
  round2,
} from '../../shared/prepaidEngine.ts';
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
 * ARRIV ESTATE MEDIA — CORRECTED AUTO-FUND FINANCIAL VERIFICATION
 *
 * ADMIN-ONLY, READ-ONLY. Activates nothing.
 *
 *   - never writes a MediaPricingConfig record (the live price is READ from the
 *     active record and from mlsPricing.ts, then compared — never set)
 *   - never changes a tier, membership fee, bonus, allowance or compensation rate
 *   - never enrolls, charges or bills a customer
 *   - never touches a wallet, lot, ledger or historical record
 *
 * CORRECTED TIER SET. The $50 / $100 / $200 tiers are EXCLUDED: they are retired
 * from new enrollment and are not part of the current program. The tiers verified
 * are the authoritative enrollable set — AUTO_FUND_AMOUNT_OPTIONS = [150, 250,
 * 350, 500, 1000] — read directly from prepaidEngine.ts, together with each tier's
 * promotional bonus and the membership-fee schedule. Nothing is reconstructed from
 * an earlier report.
 *
 * PASS CRITERION (owner direction 2026-10-11): a tier PASSES when its contribution
 * is a POSITIVE DOLLAR AMOUNT after every included cost and liability — media
 * specialist compensation, editing labour plus employer payroll burden, QC,
 * payment processing, support, chargebacks and refunds with unrecoverable
 * commissions, and the full eventual redemption of every outstanding cash-funded
 * and promotional balance. Margin percentages are reported but no longer decide
 * PASS/FAIL.
 *
 * COMMISSION RECOVERY. Refunds and chargebacks reverse the sales commission
 * attributable to the reversed revenue, traced to CUSTOMER CASH from the ORIGINAL
 * compensation event (commissionReversalEngine.ts), and delivered to Arriv Pay as
 * immutable reversal events. Estate Media does NOT debit employees or alter
 * completed payroll, so a commission already paid out may NOT be recovered. The
 * conservative and maximum-utilisation scenarios therefore count unrecovered
 * commission as a cost.
 *
 * Every number comes from the SINGLE certified simulation core
 * (base44/shared/autoFundSimulator.ts) so these results are comparable with the
 * existing certification, stress-test and unit-economics analyses.
 */

const MLS_PAYOUT = 50;                 // contractual guaranteed payout, <=2,500 sqft, unchanged
const VIP_PRIORITY_SUPPORT_COST = 6;   // per month, non-VIP tiers carrying a fee
const DISPUTE_FEE = 15;                // per chargeback, not a configured rate — assumption

/** Authoritative enrollable tiers, read from the engine. Retired tiers excluded. */
const TIERS = [...AUTO_FUND_AMOUNT_OPTIONS];
const RETIRED_EXCLUDED = [50, 100, 200];

type Basis = { id: string; label: string; wage: number; minutes: number; burden: number; qc: number };

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

/** VIP support utilisation: expected vs the maximum contractual entitlement. */
const VIP_SUPPORT_EXPECTED = VIP_BASE;                                  // 12 sessions/yr at $25
const VIP_SUPPORT_MAX_CONTRACTUAL = { sessions_per_year: 48, cost_per_session: 25 };

/** Owner-stated MLS policy: no count cap below VIP; VIP 7 promotional walkthroughs per cycle. */
const VIP_STATED_ALLOWANCE = 7;
const allowanceFor = (tier: number) => (tier === 1000 ? VIP_STATED_ALLOWANCE : UNLIMITED);

/** Informational only. These no longer decide PASS/FAIL. */
const thresholdFor = (tier: number) => (tier === 1000 ? 3 : 10);

const scheduledFeeFor = (tier: number) => AUTOFUND_MEMBERSHIP_FEE[tier] ?? 0;

function optsFor(tier: number, e: Economics) {
  const isVip = tier === 1000;
  const fee = scheduledFeeFor(tier);
  return {
    membership_fee: fee,
    membership_benefit_cost: isVip || fee === 0 ? 0 : VIP_PRIORITY_SUPPORT_COST,
    // Stated explicitly: the owner's policy permits VIP promotional value on a
    // standalone walkthrough up to the 7-per-cycle allowance.
    vip_promo_on_standalone: isVip ? true : undefined,
    promo_closeout_ratio: promoCloseoutRatio(e, ['S', 'B', 'E', 'C'], false),
  };
}

/**
 * Sales commission that the simulator credits back on a refund. If that reversal
 * is NOT recovered, the credit must be undone and the commission carried as a cost.
 * Isolated by re-running the identical persona with refunds suppressed.
 */
function refundedBookingCommissionExposure(run: any, e: Economics, vipSupport: any, opts: any): number {
  if (!run || run.refunds <= 0) return 0;
  const noRefund = simulate(run.tier, run.allowance, run.persona, e, vipSupport, { ...opts, refund_months: [] });
  if (!noRefund) return 0;
  return round2(Math.max(0, noRefund.booking_commission - run.booking_commission));
}

/**
 * Chargeback overlay. Per dispute: the disputed monthly funding cash is reversed,
 * the Booking Value it created is voided pro-rata against the remaining balance,
 * and a $15 dispute fee is charged. Delivery already performed is retained.
 *
 * Commission treatment, verified against the real reversal logic:
 *   - the simulator already carries the FULL funding commission as a cost (it never
 *     assumes a recovery), so an unrecovered funding commission needs no adjustment
 *     and is already counted. A RECOVERED funding commission is credited back.
 *   - the simulator DOES credit back the booking commission on a refunded booking,
 *     so an UNRECOVERED booking commission is added back as a cost.
 */
function applyChargebacks(
  run: any,
  tier: number,
  chargebacksPerYear: number,
  commissionRecoverable: boolean,
  unrecoveredBookingCommission: number,
) {
  const amount = getAutoFundConfig(tier)!.amount;
  const disputes = Math.max(0, Math.min(chargebacksPerYear, run.active_months));
  const share = run.active_months > 0 ? disputes / run.active_months : 0;
  const cashReversed = round2(amount * disputes);
  const liabilitiesVoided = round2(share * (run.outstanding_promo + run.outstanding_cash));
  const disputeFees = round2(DISPUTE_FEE * disputes);

  // Funding commission on the disputed charges, traced from the ORIGINAL events:
  // 15% on a first payment, 8% on each later charge. Disputes are assumed to hit
  // the earliest, highest-rate charges — the conservative assumption.
  let fundingCommissionAtRisk = 0;
  for (let i = 0; i < disputes; i++) {
    fundingCommissionAtRisk += amount * (i === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
  }
  fundingCommissionAtRisk = round2(fundingCommissionAtRisk);
  const commissionRecovered = commissionRecoverable ? fundingCommissionAtRisk : 0;
  const unrecoveredFundingCommission = commissionRecoverable ? 0 : fundingCommissionAtRisk;
  const unrecoveredBooking = commissionRecoverable ? 0 : round2(unrecoveredBookingCommission);

  const contribution = round2(
    run.contribution_lifetime
    - cashReversed
    + liabilitiesVoided
    - disputeFees
    + commissionRecovered            // a successful reversal restores the paid commission
    - unrecoveredBooking,            // undo the simulator's refund credit when it cannot be recovered
  );
  const cashIn = round2(run.cash_in - cashReversed);
  // Margin is reported against GROSS collected revenue. Dividing by the post-dispute
  // figure collapses the denominator when a large monthly charge is reversed, which
  // produces percentages (hundreds or thousands of percent) that describe nothing.
  // The contribution DOLLARS are the decisive figure and are unaffected by this.
  const marginBasis = run.cash_in;

  return {
    chargebacks_per_year: chargebacksPerYear,
    disputes_actually_applied: disputes,
    commission_recoverable: commissionRecoverable,
    funding_cash_reversed: cashReversed,
    liabilities_voided: liabilitiesVoided,
    dispute_fees: disputeFees,
    funding_commission_at_risk: fundingCommissionAtRisk,
    funding_commission_recovered: commissionRecovered,
    funding_commission_unrecovered_cost: unrecoveredFundingCommission,
    booking_commission_unrecovered_cost: unrecoveredBooking,
    cash_in: cashIn,
    net_cash_in_after_reversals: cashIn,
    contribution_dollars: contribution,
    margin_pct: marginBasis > 0 ? round2((contribution / marginBasis) * 100) : 0,
    margin_pct_basis: 'gross collected revenue before any chargeback reversal',
    passes: contribution > 0,
  };
}

function costLedger(run: any, overlaid: any) {
  const total = round2(
    run.specialist_payout + run.editing + run.funding_commission + run.booking_commission +
    run.stripe + run.vip_cost + run.membership_benefit_cost + run.closeout_cost +
    overlaid.dispute_fees + overlaid.booking_commission_unrecovered_cost - overlaid.funding_commission_recovered,
  );
  return {
    specialist_payout: run.specialist_payout,
    editing_labour_and_burden_and_qc: run.editing,
    funding_commission: run.funding_commission,
    booking_commission: run.booking_commission,
    payment_processing: run.stripe,
    vip_support_incremental: run.vip_cost,
    membership_benefit_cost: run.membership_benefit_cost,
    full_redemption_closeout: run.closeout_cost,
    chargeback_dispute_fees: overlaid.dispute_fees,
    unrecovered_booking_commission: overlaid.booking_commission_unrecovered_cost,
    recovered_funding_commission_credit: -overlaid.funding_commission_recovered,
    unrecovered_funding_commission_already_carried: overlaid.funding_commission_unrecovered_cost,
    total_cost_and_liabilities: total,
  };
}

function summarize(run: any, tier: number, overlaid: any) {
  return {
    worst_persona: run.persona,
    worst_persona_description: PERSONA_DESCRIPTIONS[run.persona] ?? run.persona,
    active_months: run.active_months,
    cash_in: overlaid.cash_in,
    outstanding_promotional_liability: run.outstanding_promo,
    outstanding_cash_funded_liability: run.outstanding_cash,
    full_redemption_closeout_cost: run.closeout_cost,
    contribution_dollars: overlaid.contribution_dollars,
    margin_pct: overlaid.margin_pct,
    informational_threshold_pct: thresholdFor(tier),
    passes_positive_contribution: overlaid.passes,
    meets_informational_threshold: overlaid.margin_pct >= thresholdFor(tier),
    chargeback_detail: overlaid,
    cost_ledger: costLedger(run, overlaid),
  };
}

/** One scenario arm: cost basis + VIP support utilisation + chargeback treatment. */
function runScenario(
  tier: number,
  price: number,
  basis: Basis,
  vipSupport: { sessions_per_year: number; cost_per_session: number },
  chargebacksPerYear: number,
  commissionRecoverable: boolean,
) {
  const e = econFor(price, basis);
  const allowance = allowanceFor(tier);
  const opts = optsFor(tier, e);
  const runs = OWNER_PERSONAS
    .map((p) => simulate(tier, allowance, p, e, vipSupport, opts))
    .filter(Boolean) as any[];

  // The worst case is selected AFTER the chargeback and commission overlay, because
  // the overlay's cost depends on the pattern (how many charges were actually made,
  // and what was still outstanding). Selecting on the pre-overlay figure could name
  // a pattern that is not actually the worst outcome.
  let worst: any = null;
  for (const run of runs) {
    const exposure = commissionRecoverable ? 0 : refundedBookingCommissionExposure(run, e, vipSupport, opts);
    const overlaid = applyChargebacks(run, tier, chargebacksPerYear, commissionRecoverable, exposure);
    if (!worst || overlaid.contribution_dollars < worst.overlaid.contribution_dollars) {
      worst = { run, overlaid };
    }
  }
  return { worst: worst.run, overlaid: worst.overlaid, runs, e, opts, vipSupport };
}

const SCENARIO_DEFINITIONS = {
  expected:
    'Expected: owner-approved planning cost basis, expected VIP support (12 sessions/yr), refunds as modelled, no chargeback assumed, commissions recovered on reversal.',
  conservative:
    'Conservative: measured editor-wage cost basis, expected VIP support, refunds as modelled plus 2 chargebacks/yr with commission treated as UNRECOVERED and therefore carried as a cost.',
  max_benefit_utilization:
    'Maximum benefit utilisation: measured editor-wage cost basis, FULL contractual VIP support (48 sessions/yr), refunds as modelled plus 4 chargebacks/yr with commission UNRECOVERED. The harshest simultaneous bundling.',
} as const;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const sr = base44.asServiceRole;

    // ═══ 1. PRICE VERIFICATION — production vs configuration vs simulation ══
    const priceRecords = await sr.entities.MediaPricingConfig.list('-effective_date', 20);
    const standardFromJson = (rec: any): number | null => {
      try {
        const json = typeof rec.config_json === 'string' ? JSON.parse(rec.config_json) : rec.config_json;
        const t1 = (json?.tier_prices || []).find((t: any) => t.tier === 'TIER_1');
        return t1?.prices?.mls_walkthrough ?? null;
      } catch {
        return null;
      }
    };

    const activeRecord = priceRecords.find((r: any) => r.is_active === true) || null;
    const approvedRecord = priceRecords.find((r: any) => String(r.pricing_version || '').includes('V2')) || null;
    const productionStandardPrice = activeRecord ? standardFromJson(activeRecord) : null;
    const approvedRecordPrice = approvedRecord ? standardFromJson(approvedRecord) : null;

    const priceVerification = {
      production: {
        source: 'MediaPricingConfig record with is_active = true (the record every booking path reads)',
        record_id: activeRecord?.id ?? null,
        pricing_version: activeRecord?.pricing_version ?? null,
        effective_date: activeRecord?.effective_date ?? null,
        standard_mls_walkthrough_price: productionStandardPrice,
        is_active: activeRecord?.is_active ?? null,
      },
      approved_configuration: {
        source: 'the owner-approved V2 record, PRESENT BUT NOT ACTIVATED',
        record_id: approvedRecord?.id ?? null,
        pricing_version: approvedRecord?.pricing_version ?? null,
        effective_date: approvedRecord?.effective_date ?? null,
        standard_mls_walkthrough_price: approvedRecordPrice,
        is_active: approvedRecord?.is_active ?? null,
        activated: approvedRecord?.is_active === true,
      },
      all_config_records: priceRecords.map((r: any) => ({
        record_id: r.id,
        pricing_version: r.pricing_version,
        is_active: r.is_active,
        effective_date: r.effective_date,
        standard_mls_walkthrough_price: standardFromJson(r),
      })),
      simulation_default: {
        pricing_version_constant: MLS_PRICING_VERSION_LIVE,
        standard_mls_walkthrough_price: MLS_PRICE_STANDARD_LIVE,
      },
      approved_price_constant: MLS_PRICE_STANDARD_APPROVED,
      production_matches_simulation: productionStandardPrice === MLS_PRICE_STANDARD_LIVE,
      approved_price_is_live: productionStandardPrice === MLS_PRICE_STANDARD_APPROVED,
      discrepancy:
        productionStandardPrice === MLS_PRICE_STANDARD_APPROVED
          ? 'None: the approved price is the live price in production and in simulation.'
          : `The owner-approved $${MLS_PRICE_STANDARD_APPROVED} is NOT the published price. The $${MLS_PRICE_STANDARD_APPROVED} configuration record exists (effective ${approvedRecord?.effective_date ?? 'n/a'}) but was never activated: is_active is ${approvedRecord?.is_active}. Production resolves the active ${activeRecord?.pricing_version} record at $${productionStandardPrice}, and the simulation default (${MLS_PRICING_VERSION_LIVE}) also resolves $${MLS_PRICE_STANDARD_LIVE}. Production and simulation therefore AGREE at $${productionStandardPrice}; the discrepancy is between the approval and the configuration, not between production and simulation.`,
    };

    // The price used for the headline calculation is the VERIFIED PRODUCTION price.
    const PRICE_IN_PRODUCTION = productionStandardPrice ?? MLS_PRICE_STANDARD_LIVE;
    const PRICE_APPROVED = MLS_PRICE_STANDARD_APPROVED;

    // ═══ 2. PER-TIER VERIFICATION at the production price ════════════════════
    const buildTier = (tier: number, price: number) => {
      const cfg = getAutoFundConfig(tier)!;
      const fee = scheduledFeeFor(tier);
      const expected = runScenario(tier, price, EXPECTED_BASIS, VIP_SUPPORT_EXPECTED, 0, true);
      const conservative = runScenario(tier, price, CONSERVATIVE_BASIS, VIP_SUPPORT_EXPECTED, 2, false);
      const maxUtilization = runScenario(tier, price, CONSERVATIVE_BASIS, VIP_SUPPORT_MAX_CONTRACTUAL, 4, false);
      const supportOnly = runScenario(tier, price, EXPECTED_BASIS, VIP_SUPPORT_MAX_CONTRACTUAL, 0, true);
      // Isolating arms, so each risk is quantified on its own instead of being
      // bundled: the cost basis alone, and the chargeback/unrecovered-commission
      // load alone. Their sum is what makes the conservative scenario so much worse.
      const costBasisOnly = runScenario(tier, price, CONSERVATIVE_BASIS, VIP_SUPPORT_EXPECTED, 0, true);
      const chargebackOnly = runScenario(tier, price, EXPECTED_BASIS, VIP_SUPPORT_EXPECTED, 2, false);

      return {
        tier,
        tier_name: cfg.tier_name ?? `$${tier}`,
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
        expected: summarize(expected.worst, tier, expected.overlaid),
        conservative: summarize(conservative.worst, tier, conservative.overlaid),
        max_benefit_utilization: summarize(maxUtilization.worst, tier, maxUtilization.overlaid),
        max_vip_support_only_expected_costs: summarize(supportOnly.worst, tier, supportOnly.overlaid),
        conservative_cost_basis_no_chargebacks: summarize(costBasisOnly.worst, tier, costBasisOnly.overlaid),
        expected_cost_basis_with_chargebacks: summarize(chargebackOnly.worst, tier, chargebackOnly.overlaid),
        risk_decomposition: {
          note: 'Dollar effect of each risk measured on its own against the expected scenario at this price.',
          cost_basis_effect_dollars: round2(costBasisOnly.overlaid.contribution_dollars - expected.overlaid.contribution_dollars),
          chargeback_and_unrecovered_commission_effect_dollars: round2(chargebackOnly.overlaid.contribution_dollars - expected.overlaid.contribution_dollars),
          vip_support_utilisation_effect_dollars: round2(supportOnly.overlaid.contribution_dollars - expected.overlaid.contribution_dollars),
        },
        verdict: {
          expected: expected.overlaid.passes ? 'PASS' : 'FAIL',
          conservative: conservative.overlaid.passes ? 'PASS' : 'FAIL',
          max_benefit_utilization: maxUtilization.overlaid.passes ? 'PASS' : 'FAIL',
          positive_in_all_three_scenarios:
            expected.overlaid.passes && conservative.overlaid.passes && maxUtilization.overlaid.passes
              ? 'PASS' : 'FAIL',
        },
      };
    };

    const tiers = TIERS.map((t) => buildTier(t, PRICE_IN_PRODUCTION));
    const tiersAtApprovedPrice = TIERS.map((t) => buildTier(t, PRICE_APPROVED));

    // ═══ 3. Concise PASS/FAIL table ═════════════════════════════════════════
    const tableRow = (t: any) => ({
      tier: t.tier,
      tier_name: t.tier_name,
      monthly_funding: t.monthly_funding_amount,
      promotional_bv_per_month: t.promotional_booking_value_per_month,
      membership_fee: t.contractual_membership_fee,
      total_monthly_charge: t.total_recurring_monthly_charge,
      expected_contribution_dollars: t.expected.contribution_dollars,
      expected_margin_pct: t.expected.margin_pct,
      expected_pass: t.verdict.expected,
      conservative_contribution_dollars: t.conservative.contribution_dollars,
      conservative_margin_pct: t.conservative.margin_pct,
      conservative_pass: t.verdict.conservative,
      max_utilization_contribution_dollars: t.max_benefit_utilization.contribution_dollars,
      max_utilization_margin_pct: t.max_benefit_utilization.margin_pct,
      max_utilization_pass: t.verdict.max_benefit_utilization,
      positive_in_all_three_scenarios: t.verdict.positive_in_all_three_scenarios,
    });

    const tableAtProduction = tiers.map(tableRow);
    const tableAtApprovedPrice = tiersAtApprovedPrice.map(tableRow);

    // ═══ 4. Negative scenarios, identified explicitly ════════════════════════
    const negativeScenarios: any[] = [];
    for (const t of tiers) {
      for (const key of ['expected', 'conservative', 'max_benefit_utilization'] as const) {
        const s = (t as any)[key];
        if (!s.passes_positive_contribution) {
          negativeScenarios.push({
            price_basis: `production $${PRICE_IN_PRODUCTION}`,
            tier: t.tier,
            tier_name: t.tier_name,
            scenario: key,
            worst_persona: s.worst_persona,
            worst_persona_description: s.worst_persona_description,
            cash_in: s.cash_in,
            contribution_dollars: s.contribution_dollars,
            margin_pct: s.margin_pct,
          });
        }
      }
    }

    // Worst individual customer pattern per tier at the conservative scenario.
    const worstPatterns = tiers.map((t: any) => {
      const e = econFor(PRICE_IN_PRODUCTION, CONSERVATIVE_BASIS);
      const allowance = allowanceFor(t.tier);
      const opts = optsFor(t.tier, e);
      const runs = OWNER_PERSONAS
        .map((p) => simulate(t.tier, allowance, p, e, VIP_SUPPORT_EXPECTED, opts))
        .filter(Boolean) as any[];
      const losses = runs.filter((r: any) => r.contribution_lifetime < 0);
      return {
        tier: t.tier,
        tier_name: t.tier_name,
        loss_making_pattern_count: losses.length,
        patterns_tested: runs.length,
        worst_pattern: losses.length
          ? losses
              .sort((a: any, b: any) => a.contribution_lifetime - b.contribution_lifetime)
              .slice(0, 3)
              .map((r: any) => ({
                persona: r.persona,
                description: PERSONA_DESCRIPTIONS[r.persona] ?? r.persona,
                contribution_dollars: r.contribution_lifetime,
                margin_pct: r.margin_lifetime_pct,
                cash_in: r.cash_in,
              }))
          : [],
      };
    });

    // ═══ 5. Tier economics as configured (authoritative config read) ════════
    const configuredTiers = TIERS.map((tier) => {
      const c = getAutoFundConfig(tier)!;
      return {
        tier,
        tier_name: c.tier_name,
        plan_id: c.plan_id,
        monthly_funding_amount: c.amount,
        total_booking_value_issued_per_month: c.booking_value,
        promotional_bonus_pct: c.bonus_pct,
        promotional_booking_value_per_month: c.bonus_booking_value,
        annual_promotional_booking_value_issued: round2(c.bonus_booking_value * 12),
        contractual_membership_fee: scheduledFeeFor(tier),
        membership_fee_chargeable_today: AUTOFUND_FINAL_FLAGS.membership_fee_enabled ? scheduledFeeFor(tier) : 0,
        total_recurring_monthly_charge: round2(c.amount + scheduledFeeFor(tier)),
        validity_months: c.validity_months,
      };
    });

    const anyPositive = negativeScenarios.length === 0;

    return Response.json({
      status: 'VERIFICATION_COMPLETE',
      model_version: 'autofund_financial_readiness_v2_20261011',
      verdict_summary: {
        price_actually_calculated_at: PRICE_IN_PRODUCTION,
        approved_price_not_activated: PRICE_APPROVED,
        tiers_verified: TIERS.length,
        retired_tiers_excluded: RETIRED_EXCLUDED,
        pass_criterion: 'Positive contribution DOLLARS after every included cost and liability, including full eventual redemption of all cash-funded and promotional balances, chargebacks, refunds and unrecoverable commissions.',
        tiers_positive_in_expected_scenario: tableAtProduction.filter((r) => r.expected_pass === 'PASS').map((r) => r.tier),
        tiers_positive_in_conservative_scenario: tableAtProduction.filter((r) => r.conservative_pass === 'PASS').map((r) => r.tier),
        tiers_positive_in_max_utilization_scenario: tableAtProduction.filter((r) => r.max_utilization_pass === 'PASS').map((r) => r.tier),
        tiers_positive_in_all_three_scenarios: tableAtProduction.filter((r) => r.positive_in_all_three_scenarios === 'PASS').map((r) => r.tier),
        negative_scenario_count: negativeScenarios.length,
        no_negative_scenarios: anyPositive,
      },
      price_verification: priceVerification,
      scenario_definitions: SCENARIO_DEFINITIONS,
      table_at_production_price: tableAtProduction,
      table_at_approved_price_not_activated: tableAtApprovedPrice,
      tiers,
      tiers_at_approved_price_not_activated: tiersAtApprovedPrice,
      configured_tiers_authoritative: configuredTiers,
      negative_scenarios: negativeScenarios,
      worst_customer_patterns_conservative: worstPatterns,
      basis: {
        mls_payout_per_walkthrough: MLS_PAYOUT,
        mls_policy_under_test: 'No standalone booking-count cap below VIP; VIP promotional allowance 7 per cycle',
        vip_support: {
          expected: VIP_SUPPORT_EXPECTED,
          maximum_contractual: VIP_SUPPORT_MAX_CONTRACTUAL,
          retainer_per_month: VIP_PRIORITY_SUPPORT_COST,
        },
        cost_bases: COST_BASES.map((b) => ({
          id: b.id, label: b.label,
          editing_gross_per_walkthrough: editingGross(b),
          editing_plus_qc_per_walkthrough: editingPlusQc(b),
        })),
        charges_per_tier: {
          funding_commission_first_payment_rate: AUTO_FUND_FIRST_PAYMENT_RATE,
          funding_commission_recurring_rate: AUTO_FUND_RECURRING_RATE,
          marketplace_booking_commission_rate: 0.15,
          payment_processing: '2.9% + $0.30 per charge; none on a wallet redemption',
        },
        personas_tested: OWNER_PERSONAS,
        persona_descriptions: PERSONA_DESCRIPTIONS,
        commission_reversal_verified:
          'Refunds and chargebacks reverse the commission attributable to the reversed revenue, calculated from the ORIGINAL compensation event (proportional to the refunded commissionable CASH, never Booking Value), capped cumulatively at the original commission, recorded as immutable COMMISSION_REVERSAL events and delivered to Arriv Pay. Estate Media does NOT debit employees or alter completed payroll, so an already-paid commission may NOT be recovered.',
        closeout_rule:
          'Contribution charges the FULL eventual redemption of every outstanding cash-funded and promotional Booking Value, at the lowest-margin service the tier is permitted to use. Unredeemed promotional value is never counted as profit.',
      },
      unresolved_assumptions_and_risks: [
        'NO MLS WALKTHROUGH HAS EVER BEEN PRODUCED. Editing minutes, and therefore editing cost per walkthrough, has never been observed; this single number moves tier results by 6-7 margin points.',
        'The employer payroll burden percentage and the QC expense per walkthrough are not configured anywhere in the app.',
        'Membership billing is switched off, so the currently chargeable fee is $0 on every tier; the fee tiers would lose $300/year each of fee revenue if launched in that state.',
        'VIP enhanced-support utilisation is unmeasured: 12 sessions per member per year is assumed against a 48-session contractual entitlement.',
        'Chargeback frequency is unmeasured (2 and 4 per member per year modelled) and the $15 dispute fee is not a configured rate.',
        'Whether a commission already paid out is actually recovered depends on Arriv Pay payroll treatment. Estate Media creates and delivers the reversal but does not debit employees; the conservative scenarios therefore treat it as unrecovered.',
        'The published MLS Walkthrough price is $' + PRICE_IN_PRODUCTION + '. The owner-approved $' + PRICE_APPROVED + ' exists only as an inactive configuration record.',
        'Funding commission is modelled at 15% first payment and 8% recurring on every subscription; a self-service enrollment with no verified advisor attribution generates no commission, which would improve every figure shown.',
      ],
      note: 'Analysis only. Enrollment stays disabled, no membership fee is charged or billed, no customer is enrolled, and no price, tier, benefit, commission or feature flag was changed.',
    });
  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}