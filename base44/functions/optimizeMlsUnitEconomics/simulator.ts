import {
  AUTO_FUND_AMOUNT_OPTIONS,
  getAutoFundConfig,
  getPriceForSqft,
  AUTO_FUND_FIRST_PAYMENT_RATE,
  AUTO_FUND_RECURRING_RATE,
  round2,
  VIP_INCREMENTAL_COST_ASSUMPTIONS,
  resolveVipAddOnDiscount,
  isVipAutoFundTier,
} from '../../shared/prepaidEngine.ts';

/**
 * Month-by-month Auto-Fund ledger simulator for the MLS unit-economics study.
 *
 * Redemption mechanics (owner rules):
 *   - A standalone MLS Walkthrough inside the monthly allowance draws promotional
 *     Booking Value FIRST and may be covered 100% by it. One unit is consumed when
 *     promotional value is used. No dollar cap, no percentage cap, no minimum cash.
 *   - Any shortfall is covered automatically by cash-funded Booking Value, then by
 *     direct payment. The customer is never blocked.
 *   - Beyond the allowance, standalone MLS uses cash-funded value or direct payment.
 *   - Bundles and non-MLS packages may always use promotional value.
 *
 * Verified production rules applied:
 *   - Specialist payout: MLS guaranteed table ($50 at <=2,500 sqft); standard
 *     packages 40% of post-sales value = 34% of retail.
 *   - Funding commission: 15% first payment, 8% recurring and top-ups.
 *   - Booking commission: 0% when ANY wallet value is applied; a fully direct-paid
 *     booking is a standard marketplace booking and carries 15%.
 *   - Stripe: 2.9% + $0.30 on every funding charge, top-up, and direct payment.
 *     Wallet redemptions incur no processing fee.
 *   - Refunds: Booking Value returns to the pool it came from, specialist payout is
 *     reversed, editing and Stripe are retained, the allowance unit is restored.
 *
 * Lifetime close-out (full eventual redemption, nothing counted as profit):
 *   - outstanding promotional value is redeemed through qualifying bundles;
 *   - outstanding cash-funded value is redeemed at the customer's own service mix.
 */

export const MONTHS = 12;
export const TARGET_PCT = 10;

const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;
const MARKETPLACE_COMMISSION_RATE = 0.15;
const SPECIALIST_RATE = 0.34;
const PROPERTY_SQFT = 2000; // every service priced on one <=2,500 sqft property
const TOPUP_MONTH = 5;
const TOPUP_AMOUNT = 500;
const REFUND_MONTHS = [3, 7];
const PAUSE_MONTHS = [3, 4, 5];

export interface Economics {
  id: string;
  label: string;
  mls_price: number;
  mls_payout: number;
  mls_editing: number;
  /**
   * Employer payroll burden on EDITING labour (0.15 = 15%). Editing is performed by
   * Arriv payroll editors, so employer taxes and administration apply. Capture
   * specialists are independent contractors and carry no employer burden.
   * Defaults to 0 so every earlier result is reproduced exactly.
   */
  editing_burden_rate?: number;
  /**
   * Quality-control expense per MLS Walkthrough — applied to a standalone walkthrough
   * and to the MLS component of a bundle. Defaults to 0.
   */
  mls_qc?: number;
}

/** A standalone-MLS promotional allowance so large it never binds. */
export const UNLIMITED = 999;

export interface PolicySpec {
  id: string;
  label: string;
  /** Standalone-MLS promotional allowance per billing cycle, by tier. UNLIMITED = no cap. */
  allowances: Record<number, number>;
}

export interface VipCost {
  sessions_per_year: number;
  cost_per_session: number;
}

export const VIP_BASE: VipCost = { sessions_per_year: 12, cost_per_session: 25 };

interface Svc {
  retail: number;
  payout: number;
  editing: number;
  standalone: boolean;
  /** True when this service includes an MLS Walkthrough (so QC applies). */
  has_mls: boolean;
}

export function serviceCatalog(e: Economics): Record<string, Svc> {
  const ess = getPriceForSqft(PROPERTY_SQFT, 'essentials') as number;
  const cin = getPriceForSqft(PROPERTY_SQFT, 'cinematic') as number;
  const essPayout = round2(ess * SPECIALIST_RATE);
  const cinPayout = round2(cin * SPECIALIST_RATE);
  // Editing is payroll labour: gross editing cost plus employer burden. QC is a
  // separate per-walkthrough expense on any cart carrying an MLS Walkthrough.
  const bur = 1 + (e.editing_burden_rate ?? 0);
  const qc = e.mls_qc ?? 0;
  const ed = (gross: number, hasMls: boolean) => round2(gross * bur + (hasMls ? qc : 0));
  return {
    S: { retail: e.mls_price, payout: e.mls_payout, editing: ed(e.mls_editing, true), standalone: true, has_mls: true },
    B: { retail: e.mls_price + ess, payout: e.mls_payout + essPayout, editing: ed(e.mls_editing + 50, true), standalone: false, has_mls: true },
    E: { retail: ess, payout: essPayout, editing: ed(50, false), standalone: false, has_mls: false },
    C: { retail: cin, payout: cinPayout, editing: ed(100, false), standalone: false, has_mls: false },
  };
}

export function bundleEconomics(e: Economics) {
  const b = serviceCatalog(e).B;
  const cost = b.payout + b.editing;
  return {
    retail: round2(b.retail),
    cost: round2(cost),
    cost_ratio: cost / b.retail,
    margin_pct: round2(((b.retail - cost) / b.retail) * 100),
  };
}

export const PERSONAS = [
  'mls_1', 'mls_3', 'mls_6', 'mls_12', 'mls_20', 'wallet_matched_mls',
  'mixed_realistic', 'alternating', 'bundle_heavy', 'larger_packages',
  'cash_topup', 'accumulator', 'refunds', 'pause_resume',
];

export const PERSONA_DESCRIPTIONS: Record<string, string> = {
  mls_1: '1 standalone walkthrough / month',
  mls_3: '3 standalone walkthroughs / month',
  mls_6: '6 standalone walkthroughs / month',
  mls_12: '12 standalone walkthroughs / month (direct pay beyond wallet)',
  mls_20: '20 standalone walkthroughs / month (heavy direct pay)',
  wallet_matched_mls: 'spends the entire wallet on standalone walkthroughs every month',
  mixed_realistic: '4 standalone walkthroughs + 1 MLS/Essentials bundle / month',
  alternating: '6 walkthroughs one month, a bundle + Essentials the next',
  bundle_heavy: '2 bundles + 1 Essentials / month',
  larger_packages: '1 Essentials + 1 Cinematic / month',
  cash_topup: '6 walkthroughs / month + one $500 cash-funded deposit',
  accumulator: '1 walkthrough / month for 6 months, then 15 / month',
  refunds: '6 walkthroughs / month with 2 refunded bookings',
  pause_resume: '6 walkthroughs / month, paused 3 months',
};

const rep = (k: string, n: number) => Array.from({ length: n }, () => k);

/** Returns the month's bookings, or null for the wallet-matched persona. */
function monthlyPlan(persona: string, m: number): string[] | null {
  switch (persona) {
    case 'mls_1': return rep('S', 1);
    case 'mls_3': return rep('S', 3);
    case 'mls_6': return rep('S', 6);
    case 'mls_12': return rep('S', 12);
    case 'mls_20': return rep('S', 20);
    case 'wallet_matched_mls': return null;
    case 'mixed_realistic': return [...rep('S', 4), 'B'];
    case 'alternating': return m % 2 === 0 ? rep('S', 6) : ['B', 'E'];
    case 'bundle_heavy': return ['B', 'B', 'E'];
    case 'larger_packages': return ['E', 'C'];
    case 'cash_topup': return rep('S', 6);
    case 'accumulator': return m < 6 ? rep('S', 1) : rep('S', 15);
    case 'refunds': return rep('S', 6);
    case 'pause_resume': return PAUSE_MONTHS.includes(m) ? [] : rep('S', 6);
    default: return [];
  }
}

export function simulate(tier: number, allowance: number, persona: string, e: Economics, vip: VipCost = VIP_BASE) {
  const cfg = getAutoFundConfig(tier);
  if (!cfg) return null;
  const cat = serviceCatalog(e);
  const bundleRatio = bundleEconomics(e).cost_ratio;
  const isVip = isVipAutoFundTier(tier);
  const addon = resolveVipAddOnDiscount('drone', 125);
  const vipAddonDiscount = addon.eligible ? addon.discount : 0;

  let cashPool = 0;  // cents of cash-funded Booking Value
  let promoPool = 0; // cents of promotional Booking Value
  let cashIn = 0, fundingCommission = 0, bookingCommission = 0, stripe = 0;
  let payout = 0, editing = 0, retailDelivered = 0;
  let directPaid = 0, topups = 0, promoOnStandalone = 0, promoElsewhere = 0, cashBvUsed = 0;
  let activeMonths = 0, payments = 0, bookings = 0, nonMlsBookings = 0, refunds = 0;

  for (let m = 0; m < MONTHS; m++) {
    if (persona === 'pause_resume' && PAUSE_MONTHS.includes(m)) continue;
    activeMonths++;

    cashIn += cfg.amount;
    fundingCommission += cfg.amount * (payments === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
    payments++;
    stripe += cfg.amount * STRIPE_RATE + STRIPE_FIXED;
    cashPool += Math.round(cfg.amount * 100);
    promoPool += Math.round(cfg.bonus_booking_value * 100);

    if (persona === 'cash_topup' && m === TOPUP_MONTH) {
      cashIn += TOPUP_AMOUNT;
      topups += TOPUP_AMOUNT;
      fundingCommission += TOPUP_AMOUNT * AUTO_FUND_RECURRING_RATE;
      stripe += TOPUP_AMOUNT * STRIPE_RATE + STRIPE_FIXED;
      cashPool += TOPUP_AMOUNT * 100;
    }

    let allowanceUsed = 0;
    const monthBookings: any[] = [];

    const book = (key: string) => {
      const s = cat[key];
      const priceC = Math.round(s.retail * 100);
      let promo = 0, cash = 0, consumed = false;
      const promoEligible = s.standalone ? allowanceUsed < allowance : true;
      if (promoEligible && promoPool > 0) {
        promo = Math.min(promoPool, priceC);
        promoPool -= promo;
        if (s.standalone) { allowanceUsed++; consumed = true; }
      }
      if (promo < priceC && cashPool > 0) {
        cash = Math.min(cashPool, priceC - promo);
        cashPool -= cash;
      }
      const direct = priceC - promo - cash;
      if (direct > 0) {
        cashIn += direct / 100;
        directPaid += direct / 100;
        stripe += (direct / 100) * STRIPE_RATE + STRIPE_FIXED;
      }
      const bc = promo + cash === 0 ? s.retail * MARKETPLACE_COMMISSION_RATE : 0;
      bookingCommission += bc;
      payout += s.payout;
      editing += s.editing;
      retailDelivered += s.retail;
      if (s.standalone) promoOnStandalone += promo / 100;
      else { promoElsewhere += promo / 100; nonMlsBookings++; }
      cashBvUsed += cash / 100;
      bookings++;
      monthBookings.push({ key, promo, cash, direct, consumed, bc });
    };

    const plan = monthlyPlan(persona, m);
    if (plan === null) {
      const priceC = Math.round(cat.S.retail * 100);
      let guard = 0;
      while (cashPool + (allowanceUsed < allowance ? promoPool : 0) >= priceC && guard < 60) {
        book('S');
        guard++;
      }
    } else {
      for (const k of plan) book(k);
    }

    if (persona === 'refunds' && REFUND_MONTHS.includes(m)) {
      const b = monthBookings.filter(x => x.key === 'S').pop();
      if (b) {
        promoPool += b.promo;
        cashPool += b.cash;
        if (b.direct > 0) { cashIn -= b.direct / 100; directPaid -= b.direct / 100; }
        bookingCommission -= b.bc;
        payout -= cat.S.payout;          // specialist payout reversed
        retailDelivered -= cat.S.retail; // editing + Stripe retained
        promoOnStandalone -= b.promo / 100;
        cashBvUsed -= b.cash / 100;
        if (b.consumed) allowanceUsed--;
        refunds++;
      }
    }
  }

  let vipCost = 0;
  if (isVip) {
    const retainer = VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * activeMonths;
    const sessions = vip.sessions_per_year * vip.cost_per_session * (activeMonths / MONTHS);
    vipCost = retainer + sessions + nonMlsBookings * 0.25 * vipAddonDiscount;
  }

  const realizedCosts = payout + editing + fundingCommission + bookingCommission + stripe + vipCost;
  const contribution12 = cashIn - realizedCosts;

  const mlsRatio = (cat.S.payout + cat.S.editing) / cat.S.retail;
  const personaRatio = retailDelivered > 0 ? (payout + editing) / retailDelivered : mlsRatio;
  const outstandingPromo = promoPool / 100;
  const outstandingCash = cashPool / 100;
  const closeout = outstandingPromo * bundleRatio + outstandingCash * personaRatio;
  const lifetime = contribution12 - closeout;

  const lifetimePct = cashIn > 0 ? (lifetime / cashIn) * 100 : 0;
  return {
    tier,
    allowance,
    persona,
    cash_in: round2(cashIn),
    funding_cash: round2(cfg.amount * activeMonths),
    topups: round2(topups),
    direct_paid: round2(directPaid),
    promo_issued: round2(cfg.bonus_booking_value * activeMonths),
    promo_on_standalone_mls: round2(promoOnStandalone),
    promo_on_bundles_packages: round2(promoElsewhere),
    cash_bv_used: round2(cashBvUsed),
    bookings,
    refunds,
    specialist_payout: round2(payout),
    editing: round2(editing),
    funding_commission: round2(fundingCommission),
    booking_commission: round2(bookingCommission),
    stripe: round2(stripe),
    vip_cost: round2(vipCost),
    contribution_12m: round2(contribution12),
    margin_12m_pct: cashIn > 0 ? round2((contribution12 / cashIn) * 100) : 0,
    outstanding_promo: round2(outstandingPromo),
    outstanding_cash: round2(outstandingCash),
    closeout_cost: round2(closeout),
    contribution_lifetime: round2(lifetime),
    margin_lifetime_pct: round2(lifetimePct),
    meets_target: lifetimePct >= TARGET_PCT,
    meets_target_12m: cashIn > 0 && (contribution12 / cashIn) * 100 >= TARGET_PCT,
  };
}

/** Largest allowance N (0..max) for which every allowance 0..N passes for every persona. */
export function maxSustainable(tier: number, e: Economics, vip: VipCost = VIP_BASE, max = 20, basis: 'lifetime' | '12m' = 'lifetime') {
  let best: number | null = null;
  let firstFailure: any = null;
  for (let a = 0; a <= max; a++) {
    let worst: any = null;
    for (const p of PERSONAS) {
      const r = simulate(tier, a, p, e, vip)!;
      const pct = basis === 'lifetime' ? r.margin_lifetime_pct : r.margin_12m_pct;
      if (worst === null || pct < worst.pct) worst = { persona: p, pct, contribution: basis === 'lifetime' ? r.contribution_lifetime : r.contribution_12m, cash_in: r.cash_in };
    }
    if (worst.pct >= TARGET_PCT) { best = a; continue; }
    firstFailure = {
      allowance: a,
      persona: worst.persona,
      margin_pct: worst.pct,
      contribution: worst.contribution,
      shortfall_dollars: round2((TARGET_PCT / 100) * worst.cash_in - worst.contribution),
    };
    break;
  }
  return { max_sustainable: best, first_failure: firstFailure };
}

// ── Simplified-policy helpers ────────────────────────────────────────────────

export function policyAllowance(tier: number, spec: PolicySpec): number {
  return spec.allowances[tier] ?? UNLIMITED;
}

export interface PolicyTierResult {
  tier: number;
  allowance: number;
  passes: boolean;
  worst_persona: string;
  worst_lifetime_contribution: number;
  worst_lifetime_pct: number;
  worst_cash_in: number;
  shortfall_dollars: number;
  failing_personas: { persona: string; description: string; margin_pct: number; contribution: number; cash_in: number }[];
}

/** Exact test of a policy: every persona, at the tier's own allowance, must clear the target. */
export function evaluatePolicy(tier: number, spec: PolicySpec, e: Economics, vip: VipCost = VIP_BASE): PolicyTierResult {
  const allowance = policyAllowance(tier, spec);
  const runs = PERSONAS.map(p => simulate(tier, allowance, p, e, vip)!).filter(Boolean);
  const worst = runs.reduce((w, r) => (w === null || r.margin_lifetime_pct < w.margin_lifetime_pct ? r : w), null as any);
  const failing = runs.filter(r => !r.meets_target).sort((a, b) => a.margin_lifetime_pct - b.margin_lifetime_pct);
  return {
    tier,
    allowance,
    passes: failing.length === 0,
    worst_persona: worst.persona,
    worst_lifetime_contribution: worst.contribution_lifetime,
    worst_lifetime_pct: worst.margin_lifetime_pct,
    worst_cash_in: worst.cash_in,
    shortfall_dollars: round2((TARGET_PCT / 100) * worst.cash_in - worst.contribution_lifetime),
    failing_personas: failing.map(f => ({
      persona: f.persona,
      description: PERSONA_DESCRIPTIONS[f.persona],
      margin_pct: f.margin_lifetime_pct,
      contribution: f.contribution_lifetime,
      cash_in: f.cash_in,
    })),
  };
}

export function evaluatePolicyAllTiers(spec: PolicySpec, e: Economics, vip: VipCost = VIP_BASE) {
  const tiers = AUTO_FUND_AMOUNT_OPTIONS.map(t => evaluatePolicy(t, spec, e, vip));
  return { tiers, passes: tiers.every(t => t.passes) };
}

/** Smallest whole-dollar price at which the policy clears the target for every tier and persona. */
export function minPriceForPolicy(
  spec: PolicySpec,
  base: { mls_payout: number; mls_editing: number; editing_burden_rate?: number; mls_qc?: number },
  vip: VipCost = VIP_BASE,
  from = 100,
  to = 200,
) {
  for (let price = from; price <= to; price++) {
    const e: Economics = { id: `P${price}`, label: '', mls_price: price, ...base };
    const r = evaluatePolicyAllTiers(spec, e, vip);
    if (r.passes) return { price, tiers: r.tiers };
  }
  return null;
}