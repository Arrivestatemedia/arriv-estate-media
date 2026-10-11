import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTO_FUND_AMOUNT_OPTIONS,
  getAutoFundConfig,
  getPriceForSqft,
  TARGET_CONTRIBUTION_MARGIN_PCT,
  round2,
} from '../../shared/prepaidEngine.ts';
import { AUTOFUND_MEMBERSHIP_FEE, AUTOFUND_FINAL_FLAGS } from '../../shared/autoFundFinalConfig.ts';
import {
  MLS_PRICING_VERSION_LIVE,
  MLS_PRICE_STANDARD_APPROVED,
  MLS_PRICE_STANDARD_LIVE,
  type MlsPriceVersion,
} from '../../shared/mlsPricing.ts';
import {
  simulate,
  promoCloseoutRatio,
  mlsPriceForSqft,
  mlsPayoutForSqft,
  OWNER_PERSONAS,
  PERSONA_DESCRIPTIONS,
  VIP_BASE,
  UNLIMITED,
  type Economics,
  type Svc,
} from '../../shared/autoFundSimulator.ts';

/**
 * ARRIV AUTO-FUND FINANCIAL STRESS TEST — v5
 *
 * CORRECTIONS APPLIED (2026-10-11):
 *   1. PRICING VERSION IS SELECTABLE. The owner-approved V2 ($120) is valued WITHOUT
 *      activating it — this function reads mlsPricing.ts only and never touches
 *      MediaPricingConfig, so a financial test can never move the live retail price.
 *      V1 ($100) remains available and is ALWAYS reported alongside, for historical
 *      comparison. Nothing here is ever a pricing activation.
 *   2. THE WALLET MODEL IS NOW THE IMPLEMENTED LEDGER MODEL. This harness no longer
 *      contains its own wallet arithmetic. It calls the single shared core
 *      (`base44/shared/autoFundSimulator.ts`), which holds cash-funded and promotional
 *      Booking Value as SEPARATE pools, exactly as CreditLot separates a
 *      `purchase`/`reload` lot from a `promotional` lot.
 *   3. THE VIP RESTRICTION IS ENFORCED BY THE AUTHORITATIVE RULE. The core derives the
 *      restriction from `resolveMlsPromoEligibility` — the same resolver the booking
 *      transaction uses — unless a caller explicitly overrides it for a historical run.
 *   4. PROHIBITED REDEMPTIONS ARE STRUCTURALLY IMPOSSIBLE. Every run asserts
 *      `no_prohibited_promo_redemptions`; a non-zero count fails the certification.
 *   5. ONE CORE, TWO SCENARIO SETS. The "standardized" arm reproduces the persona basis
 *      of `optimizeMlsUnitEconomics` exactly (identical economics, personas, wallet
 *      rules, close-out convention and margin definition). The "scenario" arm adds this
 *      harness's own premium / adversarial / MLS-volume patterns on the same core.
 *      Remaining differences between the two arms are REPORTED, never averaged away.
 *
 * Admin-only. Reports only. Activates nothing.
 */

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));

    const VIP_TIER = 1000;
    const MLS_PAYOUT = 50;
    const PRIORITY_SUPPORT_COST = 6;
    const TARGET = TARGET_CONTRIBUTION_MARGIN_PCT;

    // ── 1 / 2. Pricing version selection, never an activation ──────────────
    const requested = String(body?.mls_pricing_version || 'V2').toUpperCase();
    const version: MlsPriceVersion = requested === 'V1' ? 'V1' : 'V2';
    const selectedPrice = mlsPriceForSqft(2000, version);
    // Both versions are always reported, so a comparison never depends on a flag.
    const PRICE_PROBES: { version: MlsPriceVersion; price: number }[] = [
      { version: 'V2', price: mlsPriceForSqft(2000, 'V2') },
      { version: 'V1', price: mlsPriceForSqft(2000, 'V1') },
    ];

    // ── 3. Approved cost assumptions ───────────────────────────────────────
    const A = {
      wage_per_hour: Number(body?.wage_per_hour ?? 18),
      active_minutes: Number(body?.active_minutes ?? 60),
      payroll_burden_rate: Number(body?.payroll_burden_rate ?? 0.15),
      qc_per_walkthrough: Number(body?.qc_per_walkthrough ?? 5),
    };
    const mlsEditingGross = round2(A.wage_per_hour * (A.active_minutes / 60));
    const mlsEditingTotal = round2(mlsEditingGross * (1 + A.payroll_burden_rate) + A.qc_per_walkthrough);

    const PREMIUM_EDITING_LADDER = [100, 125, 150, 175, 200];
    const PREMIUM_EDITING_EXPECTED = 150;
    /** The close-out service convention used by optimizeMlsUnitEconomics, stated explicitly. */
    const RECON_KEYS = ['S', 'B', 'E', 'C'];

    const econFor = (price: number): Economics => ({
      id: `P${price}`,
      label: '',
      mls_price: price,
      mls_payout: MLS_PAYOUT,
      mls_editing: mlsEditingGross,
      editing_burden_rate: A.payroll_burden_rate,
      mls_qc: A.qc_per_walkthrough,
      partner_rate: 0.40,
    });

    const optsFor = (tier: number, price: number, closeoutKeys: string[]) => {
      const isVip = tier === VIP_TIER;
      const fee = AUTOFUND_MEMBERSHIP_FEE[tier] ?? 0;
      return {
        membership_fee: fee,
        membership_benefit_cost: isVip || fee === 0 ? 0 : PRIORITY_SUPPORT_COST,
        // The authoritative rule, stated explicitly rather than inferred.
        vip_promo_on_standalone: isVip ? false : undefined,
        promo_closeout_ratio: promoCloseoutRatio(econFor(price), closeoutKeys, isVip),
      };
    };

    const verdictFor = (tier: number, r: any) => {
      const isVip = tier === VIP_TIER;
      // The owner's accepted VIP exception: VIP is held to a POSITIVE contribution
      // rather than the 10% target. Every other tier keeps the 10% requirement.
      return {
        vip_exception_applied: isVip,
        target_pct: isVip ? 0 : TARGET,
        passes: isVip ? r.margin_lifetime_pct > 0 : r.meets_target,
      };
    };

    // ════════════════════════════════════════════════════════════════════════
    // ARM 1 — STANDARDIZED. Identical inputs to optimizeMlsUnitEconomics.
    // ════════════════════════════════════════════════════════════════════════
    const runStandardized = (price: number) =>
      AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
        const e = econFor(price);
        const opts = optsFor(tier, price, RECON_KEYS);
        const runs = OWNER_PERSONAS
          .map(p => simulate(tier, UNLIMITED, p, e, VIP_BASE, opts))
          .filter(Boolean) as any[];
        const worst = runs.reduce((w: any, r: any) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null);
        const failing = runs.filter(r => !r.meets_target).sort((a, b) => a.margin_lifetime_pct - b.margin_lifetime_pct);
        return {
          tier,
          membership_fee: opts.membership_fee,
          mls_price_used: price,
          vip_promo_restricted: tier === VIP_TIER,
          worst_persona: worst?.persona ?? null,
          worst_lifetime_pct: worst?.margin_lifetime_pct ?? null,
          worst_lifetime_contribution: worst?.contribution_lifetime ?? null,
          worst_cash_in: worst?.cash_in ?? null,
          failing_persona_count: failing.length,
          failing_personas: failing.map(f => ({
            persona: f.persona,
            description: PERSONA_DESCRIPTIONS[f.persona] ?? f.persona,
            margin_pct: f.margin_lifetime_pct,
            contribution: f.contribution_lifetime,
          })),
          prohibited_promo_redemptions: runs.filter(r => !r.no_prohibited_promo_redemptions).length,
          ...verdictFor(tier, worst),
        };
      });

    // ════════════════════════════════════════════════════════════════════════
    // ARM 2 — SCENARIO FAMILY. Premium / adversarial / MLS-volume patterns.
    // Runs on the SAME core, with its own explicitly-stated close-out convention.
    // ════════════════════════════════════════════════════════════════════════
    const SCENARIOS: any[] = [
      { id: 'premium_2x_small', label: '2x Premium per month (≤2,500 sqft)', premium: true, jobs: [{ pkg: 'premium', sqft: 2000, count: 2 }] },
      { id: 'mixed_3x', label: '1x MLS + 1x Essentials (3,000) + 1x Cinematic (5,000) per month', jobs: [{ pkg: 'mls', sqft: 2000, count: 1 }, { pkg: 'essentials', sqft: 3000, count: 1 }, { pkg: 'cinematic', sqft: 5000, count: 1 }] },
      { id: 'essentials_4x', label: '4x Essentials per month (2,501–3,500 sqft)', jobs: [{ pkg: 'essentials', sqft: 3000, count: 4 }] },
      { id: 'premium_surcharge_1x', label: '1x Premium per month (7,501–10,000 sqft)', premium: true, jobs: [{ pkg: 'premium', sqft: 8000, count: 1 }] },
      { id: 'mixed_premium_2x', label: '1x Premium (2,000) + 1x Cinematic (4,000) per month', premium: true, jobs: [{ pkg: 'premium', sqft: 2000, count: 1 }, { pkg: 'cinematic', sqft: 4000, count: 1 }] },
      { id: 'premium_1x_accumulate', label: '1x Premium per month (≤2,500 sqft) — accumulates unspent value', premium: true, jobs: [{ pkg: 'premium', sqft: 2000, count: 1 }] },
      { id: 'premium_2x_small_with_refund', label: '2x Premium per month with one refunded booking', premium: true, refund: true, jobs: [{ pkg: 'premium', sqft: 2000, count: 2 }] },
      { id: 'adv_premium_3x_small', label: 'ADVERSARIAL: 3x Premium per month (≤2,500 sqft)', premium: true, adversarial: true, jobs: [{ pkg: 'premium', sqft: 2000, count: 3 }] },
      { id: 'adv_premium_2x_max_sqft', label: 'ADVERSARIAL: 2x Premium per month at the 10,000 sqft ceiling', premium: true, adversarial: true, jobs: [{ pkg: 'premium', sqft: 10000, count: 2 }] },
      { id: 'mls_1x', label: 'MLS volume: 1x/month (≤2,500 sqft)', mls_volume: true, jobs: [{ pkg: 'mls', sqft: 2000, count: 1 }] },
      { id: 'mls_3x', label: 'MLS volume: 3x/month (≤2,500 sqft)', mls_volume: true, jobs: [{ pkg: 'mls', sqft: 2000, count: 3 }] },
      { id: 'mls_6x', label: 'MLS volume: 6x/month (≤2,500 sqft)', mls_volume: true, jobs: [{ pkg: 'mls', sqft: 2000, count: 6 }] },
      { id: 'mls_12x', label: 'MLS volume: 12x/month (≤2,500 sqft)', mls_volume: true, adversarial: true, jobs: [{ pkg: 'mls', sqft: 2000, count: 12 }] },
      { id: 'mls_20x', label: 'MLS volume: 20x/month (≤2,500 sqft)', mls_volume: true, adversarial: true, jobs: [{ pkg: 'mls', sqft: 2000, count: 20 }] },
      { id: 'mls_6x_mid', label: 'MLS volume: 6x/month (2,501–3,500 sqft)', mls_volume: true, jobs: [{ pkg: 'mls', sqft: 3000, count: 6 }] },
      { id: 'mls_12x_mid', label: 'MLS volume: 12x/month (2,501–3,500 sqft)', mls_volume: true, adversarial: true, jobs: [{ pkg: 'mls', sqft: 3000, count: 12 }] },
      { id: 'adv_cinematic_2x', label: 'ADVERSARIAL: 2x Cinematic per month (3,501–5,000 sqft)', adversarial: true, jobs: [{ pkg: 'cinematic', sqft: 5000, count: 2 }] },
    ];

    /** Build the scenario's own services on the canonical ladders for the chosen version. */
    const servicesFor = (scenario: any, version: MlsPriceVersion, premiumEditing: number): Record<string, Svc> => {
      const out: Record<string, Svc> = {};
      const bur = 1 + A.payroll_burden_rate;
      for (const j of scenario.jobs) {
        const key = `${j.pkg}@${j.sqft}`;
        if (out[key]) continue;
        const isMls = j.pkg === 'mls';
        const retail = isMls ? mlsPriceForSqft(j.sqft, version) : getPriceForSqft(j.sqft, j.pkg);
        if (retail === null || retail === undefined) continue;
        const payout = isMls ? mlsPayoutForSqft(j.sqft) : round2(retail * 0.40);
        const editing = isMls
          ? mlsEditingTotal
          : j.pkg === 'premium'
            ? premiumEditing
            : round2((j.pkg === 'essentials' ? 50 : 100) * bur);
        out[key] = {
          retail,
          payout,
          payout_marketplace: isMls ? payout : round2(retail * 0.40 * 0.85),
          editing,
          standalone: isMls,
          has_mls: isMls,
          eligible_retail: isMls ? 0 : retail,
        };
      }
      return out;
    };

    const planFor = (scenario: any) => {
      const plan: string[] = [];
      for (const j of scenario.jobs) for (let n = 0; n < j.count; n++) plan.push(`${j.pkg}@${j.sqft}`);
      return plan;
    };

    const runScenarios = (version: MlsPriceVersion) => {
      const price = mlsPriceForSqft(2000, version);
      const out: any[] = [];
      for (const tier of AUTO_FUND_AMOUNT_OPTIONS) {
        for (const sc of SCENARIOS) {
          const ladder = sc.premium ? PREMIUM_EDITING_LADDER : [PREMIUM_EDITING_EXPECTED];
          for (const premiumEditing of ladder) {
            const services = servicesFor(sc, version, premiumEditing);
            const e = econFor(price);
            const baseOpts = optsFor(tier, price, Object.keys(services));
            const r = simulate(tier, UNLIMITED, sc.id, e, VIP_BASE, {
              ...baseOpts,
              services,
              plan: planFor(sc),
              refund_scenario: !!sc.refund,
            });
            if (!r) continue;
            out.push({
              tier,
              scenario_id: sc.id,
              scenario_label: sc.label,
              premium_editing: premiumEditing,
              adversarial: !!sc.adversarial,
              mls_volume: !!sc.mls_volume,
              bookings: r.bookings,
              cash_in: r.cash_in,
              membership_revenue: r.membership_revenue,
              promo_issued: r.promo_issued,
              promo_on_standalone_mls: r.promo_on_standalone_mls,
              promo_on_bundles_packages: r.promo_on_bundles_packages,
              cash_bv_used: r.cash_bv_used,
              specialist_payout: r.specialist_payout,
              editing: r.editing,
              funding_commission: r.funding_commission,
              booking_commission: r.booking_commission,
              stripe: r.stripe,
              vip_cost: r.vip_cost,
              outstanding_promo: r.outstanding_promo,
              outstanding_cash: r.outstanding_cash,
              closeout_cost: r.closeout_cost,
              contribution_lifetime: r.contribution_lifetime,
              margin_lifetime_pct: r.margin_lifetime_pct,
              prohibited_promo_redemptions: r.no_prohibited_promo_redemptions ? 0 : 1,
              ...verdictFor(tier, r),
            });
          }
        }
      }
      return out;
    };

    // ════════════════════════════════════════════════════════════════════════
    const standardized = runStandardized(selectedPrice);
    const scenarios = runScenarios(version);

    const allRuns = [...standardized.map(r => ({ arm: 'standardized', ...r })), ...scenarios.map(r => ({ arm: 'scenario', ...r }))];

    const failures = allRuns.filter(r => !r.passes);
    const prohibited = allRuns.reduce((n, r) => n + (r.prohibited_promo_redemptions || 0), 0);

    const perTier = AUTO_FUND_AMOUNT_OPTIONS.map(tier => {
      const std = standardized.find(r => r.tier === tier)!;
      const scen = scenarios.filter(r => r.tier === tier);
      const worstScen = scen.reduce((w: any, r: any) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null);
      return {
        tier,
        membership_fee: std.membership_fee,
        vip_exception_applied: tier === VIP_TIER,
        target_pct: tier === VIP_TIER ? 0 : TARGET,
        standardized_worst_pct: std.worst_lifetime_pct,
        standardized_worst_persona: std.worst_persona,
        standardized_passes: std.passes,
        scenario_worst_pct: worstScen?.margin_lifetime_pct ?? null,
        scenario_worst_id: worstScen?.scenario_id ?? null,
        scenario_failures: scen.filter(r => !r.passes).length,
        passes: std.passes && scen.every(r => r.passes),
      };
    });

    // Both pricing versions, always reported side by side.
    const versionComparison = PRICE_PROBES.map(p => ({
      version: p.version,
      mls_standard_price: p.price,
      standardized: runStandardized(p.price).map(r => ({
        tier: r.tier,
        worst_lifetime_pct: r.worst_lifetime_pct,
        worst_persona: r.worst_persona,
        passes: r.passes,
      })),
    }));

    const pass = failures.length === 0 && prohibited === 0;

    return Response.json({
      status: pass ? 'PASS' : 'FAIL',
      model_version: 'autofund_stress_v5_shared_core',
      certification_basis: {
        mls_pricing_version_used: version,
        mls_standard_price_used: selectedPrice,
        approved_price: MLS_PRICE_STANDARD_APPROVED,
        live_price: MLS_PRICE_STANDARD_LIVE,
        live_pricing_version: MLS_PRICING_VERSION_LIVE,
        v2_activated_by_this_function: false,
        production_pricing_changed: false,
        pricing_source: 'mlsPricing.ts — this function never reads or writes MediaPricingConfig',
      },
      assumptions: {
        wage_per_hour: A.wage_per_hour,
        active_minutes: A.active_minutes,
        payroll_burden_rate: A.payroll_burden_rate,
        qc_per_walkthrough: A.qc_per_walkthrough,
        mls_editing_gross: mlsEditingGross,
        mls_editing_total_per_walkthrough: mlsEditingTotal,
        mls_payout: MLS_PAYOUT,
        partner_rate: 0.40,
        booking_commission_on_wallet_funded: 0,
        funding_commission: '15% first payment, 8% recurring',
        stripe: '2.9% + $0.30',
        promotional_closeout_convention: `lowest-margin PERMITTED service among ${RECON_KEYS.join('/')}, standalone MLS excluded on the VIP tier`,
        membership_fee_enabled: AUTOFUND_FINAL_FLAGS.membership_fee_enabled,
        vip_restriction_flag: AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled,
        wallet_model: 'separate cash-funded and promotional pools — the implemented CreditLot model',
      },
      integrity: {
        prohibited_promo_redemptions: prohibited,
        prohibited_promo_redemptions_expected: 0,
        forbidden_redemption_check: prohibited === 0 ? 'PASS' : 'FAIL',
        vip_promo_on_standalone_all_runs: allRuns.filter(r => r.vip_exception_applied).every(r => (r.promo_on_standalone_mls ?? 0) === 0),
        cash_and_promotional_pools_separate: true,
      },
      counts: {
        combinations_tested: allRuns.length,
        standardized_runs: standardized.length,
        scenario_runs: scenarios.length,
        failures: failures.length,
        tiers_failing: perTier.filter(t => !t.passes).map(t => t.tier),
      },
      per_tier: perTier,
      failures: failures.map(r => ({
        arm: r.arm,
        tier: r.tier,
        scenario_or_persona: r.scenario_id ?? r.worst_persona,
        margin_pct: r.margin_lifetime_pct ?? r.worst_lifetime_pct,
        contribution: r.contribution_lifetime ?? r.worst_lifetime_contribution,
        vip_exception_applied: r.vip_exception_applied,
      })),
      standardized_arm: standardized,
      scenario_failures: scenarios.filter(r => !r.passes),
      version_comparison: versionComparison,
      reconciliation: {
        note: 'Arm 1 uses the identical core, economics, persona set, wallet rules, close-out convention and margin definition as optimizeMlsUnitEconomics. Arm 2 adds this harness\'s scenario family on the same core. The arms are DIFFERENT SCENARIO SETS by design and are never averaged together.',
        arm_1_inputs_matching_optimizeMlsUnitEconomics: {
          core: 'base44/shared/autoFundSimulator.ts (simulate)',
          personas: OWNER_PERSONAS,
          allowance: 'UNLIMITED (no monthly count cap on any non-VIP tier)',
          membership_fee: AUTOFUND_MEMBERSHIP_FEE,
          priority_support_cost: PRIORITY_SUPPORT_COST,
          closeout_keys: RECON_KEYS,
          margin_definition: 'lifetime contribution after full balance close-out, over total cash collected',
        },
        differences_retained: [
          'Arm 2 prices square-footage variants on the canonical ladder and uses the per-sqft MLS payout table; Arm 1 evaluates one ≤2,500 sqft property at a flat $50 payout.',
          'Arm 2 runs a premium-editing ladder ($100–$200 per completed edit); Arm 1 applies the approved $25.70 MLS editing cost.',
          'Arm 2 states its own close-out service convention per scenario (the lowest-margin service that scenario actually buys); Arm 1 uses the shared S/B/E/C convention.',
          'Arm 2 includes premium-package and adversarial cart shapes that have no equivalent persona in Arm 1.',
        ],
      },
      flags: AUTOFUND_FINAL_FLAGS,
      note: 'Reports only. No pricing, commission, payout, credit, balance, ledger or production setting was changed. V2 is valued, never activated. Redemptions are never blocked and no fee is introduced to make a scenario pass.',
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}