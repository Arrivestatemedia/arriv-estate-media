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
} from './prepaidEngine.ts';
import { resolveMlsPromoEligibility } from './autoFundMlsAllowance.ts';
import { MLS_SQFT_BANDS, mlsLadderFor, type MlsPriceVersion } from './mlsPricing.ts';

/**
 * THE SINGLE Auto-Fund financial simulation core.
 *
 * Every financial certification of the Auto-Fund program runs through `simulate()`
 * below — the standalone-trend study, the membership certification, the owner
 * sensitivity analysis, and the stress test. It lives in `base44/shared/` precisely
 * because more than one function needs it: a second, independently written simulator
 * previously produced margins that could not be compared with these, because it
 * merged cash-funded and promotional Booking Value, priced MLS at a different version,
 * and had no concept of the promotional restriction. One core removes that class of
 * error permanently.
 *
 * Month-by-month Auto-Fund ledger simulator.
 *
 * Redemption mechanics (owner rules):
 *   - A standalone MLS Walkthrough inside the monthly allowance draws promotional
 *     Booking Value FIRST and may be covered 100% by it. No dollar cap, no percentage
 *     cap, no minimum cash on the non-VIP tiers.
 *   - Any shortfall is covered automatically by cash-funded Booking Value, then by
 *     direct payment. The customer is never blocked.
 *   - Bundles and non-MLS packages may always use promotional value.
 *
 * Verified production rules applied:
 *   - Specialist payout: MLS guaranteed table ($50 at <=2,500 sqft); standard
 *     packages 40% of post-sales value. Sales compensation comes out FIRST, so a
 *     wallet-funded booking (no booking commission) pays 40% of the package and a
 *     standard marketplace booking pays 40% of the remaining 85% = 34% of retail.
 *   - Funding commission: 15% first payment, 8% recurring and top-ups.
 *   - Booking commission: 0% when ANY wallet value is applied; a fully direct-paid
 *     booking is a standard marketplace booking and carries 15%.
 *   - Stripe: 2.9% + $0.30 on every funding charge, top-up, and direct payment.
 *     Wallet redemptions incur no processing fee.
 *   - Refunds: Booking Value returns to the pool it came from, specialist payout is
 *     reversed, editing and Stripe are retained.
 *
 * WALLET MODEL (matches the implemented ledger):
 *   Cash-funded and promotional Booking Value are held as SEPARATE pools, exactly as
 *   CreditLot distinguishes a `purchase`/`reload` lot from a `promotional` lot. A
 *   booking draws promotional value first (where permitted), then cash-funded value,
 *   then direct payment. Promotional value can never be mistaken for collected cash.
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
/**
 * Authoritative partner share of POST-SALES value. The sales person is paid out of
 * the package FIRST, and the partner then takes 40% of what remains.
 */
const PARTNER_RATE = 0.40;
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
   */
  editing_burden_rate?: number;
  /** Quality-control expense per MLS Walkthrough. */
  mls_qc?: number;
  /**
   * Partner payout rate for non-MLS packages, as a share of POST-SALES value.
   * Defaults to the authoritative 0.40 (mediaCompensationEngine).
   */
  partner_rate?: number;
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

export interface Svc {
  retail: number;
  /** Partner payout when the booking carries no sales commission (wallet-funded). */
  payout: number;
  /** Partner payout when a 15% marketplace commission is paid out of the package first. */
  payout_marketplace: number;
  editing: number;
  standalone: boolean;
  /** True when this service includes an MLS Walkthrough (so QC applies). */
  has_mls: boolean;
  /**
   * Retail of the services in this cart that are NOT MLS Walkthroughs. When a tier
   * has the MLS promotional restriction, promotional credit may be applied only up
   * to this amount — which is also the anti-bypass guard, because a token add-on
   * unlocks only its own retail value.
   */
  eligible_retail: number;
}

export function serviceCatalog(e: Economics): Record<string, Svc> {
  const ess = getPriceForSqft(PROPERTY_SQFT, 'essentials') as number;
  const cin = getPriceForSqft(PROPERTY_SQFT, 'cinematic') as number;
  const prm = getPriceForSqft(PROPERTY_SQFT, 'premium') as number;
  const pr = e.partner_rate ?? PARTNER_RATE;
  // Sales compensation is paid out of the package FIRST; the partner then receives
  // its share of what remains. A wallet-funded booking pays no booking commission,
  // so the partner's base is the full package.
  const prMkt = pr * (1 - MARKETPLACE_COMMISSION_RATE);
  const essPayout = round2(ess * pr);
  const cinPayout = round2(cin * pr);
  const essPayoutMkt = round2(ess * prMkt);
  const cinPayoutMkt = round2(cin * prMkt);
  const prmPayout = round2(prm * pr);
  const prmPayoutMkt = round2(prm * prMkt);
  // Editing is payroll labour: gross editing cost plus employer burden. QC is a
  // separate per-walkthrough expense on any cart carrying an MLS Walkthrough.
  const bur = 1 + (e.editing_burden_rate ?? 0);
  const qc = e.mls_qc ?? 0;
  const ed = (gross: number, hasMls: boolean) => round2(gross * bur + (hasMls ? qc : 0));
  return {
    S: { retail: e.mls_price, payout: e.mls_payout, payout_marketplace: e.mls_payout, editing: ed(e.mls_editing, true), standalone: true, has_mls: true, eligible_retail: 0 },
    B: { retail: e.mls_price + ess, payout: e.mls_payout + essPayout, payout_marketplace: e.mls_payout + essPayoutMkt, editing: ed(e.mls_editing + 50, true), standalone: false, has_mls: true, eligible_retail: ess },
    E: { retail: ess, payout: essPayout, payout_marketplace: essPayoutMkt, editing: ed(50, false), standalone: false, has_mls: false, eligible_retail: ess },
    C: { retail: cin, payout: cinPayout, payout_marketplace: cinPayoutMkt, editing: ed(100, false), standalone: false, has_mls: false, eligible_retail: cin },
    // Premium package. Priced on the canonical ladder; its editing cost is the
    // premium per-edit figure, which scenario overrides may replace.
    P: { retail: prm, payout: prmPayout, payout_marketplace: prmPayoutMkt, editing: ed(150, false), standalone: false, has_mls: false, eligible_retail: prm },
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

/** Cost ratio of a single service: what it costs to fulfil, over what it sells for. */
export function serviceCostRatio(s: Svc): number {
  return (s.payout + s.editing) / s.retail;
}

/**
 * The promotional close-out ratio: the cost ratio of the LOWEST-MARGIN service on
 * which the tier is PERMITTED to redeem promotional value. This is the honest
 * close-out assumption, because promotional credit is never assumed to be spent on a
 * higher-margin service than the rules allow.
 *
 * `keys` names the services to consider, so a caller always STATES its convention
 * instead of silently inheriting one. When `restricted` is true, standalone MLS is
 * excluded — which is the VIP rule — so a restricted tier's promotional liability is
 * closed out against the lowest-margin service it may still legally buy.
 */
export function promoCloseoutRatio(e: Economics, keys: string[], restricted: boolean): number {
  const cat = serviceCatalog(e);
  const considered = keys.filter(k => cat[k]).filter(k => !(restricted && cat[k].standalone));
  if (!considered.length) return 0;
  return round2(Math.max(...considered.map(k => serviceCostRatio(cat[k]))));
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
  churn_after_1: 'funds 1 month then cancels; every remaining balance still redeemable',
  churn_after_3: 'funds 3 months then cancels; every remaining balance still redeemable',
  churn_after_4: 'funds 4 months then cancels; every remaining balance still redeemable',
};

/** Certification persona set: the base patterns plus an explicit churn pattern. */
export const CERT_PERSONAS = [...PERSONAS, 'churn_after_4'];

/** Early-termination stress cycles: fund 1, 3 or 4 months, then cancel with the whole balance still redeemable. */
export const CHURN_PERSONAS = ['churn_after_1', 'churn_after_3', 'churn_after_4'];

/** Certification patterns plus the two additional early-churn cycles requested by the owner. */
export const OWNER_PERSONAS = [...CERT_PERSONAS, 'churn_after_1', 'churn_after_3'];

/** The certification patterns with every churn pattern removed — isolates operating-cost effects. */
export const NO_CHURN_PERSONAS = CERT_PERSONAS.filter(p => !p.startsWith('churn_after'));

/**
 * The canonical MLS Walkthrough price for a square footage band under a chosen
 * pricing version. Resolves from mlsPricing.ts only — it never reads or changes the
 * LIVE MediaPricingConfig, so V2 can be valued in an analysis without activating it.
 */
export function mlsPriceForSqft(sqft: number, version: MlsPriceVersion): number {
  const band = MLS_SQFT_BANDS.find(b => sqft >= b.min && sqft <= b.max) ?? MLS_SQFT_BANDS[0];
  return mlsLadderFor(version)[band.tier];
}

/** Canonical specialist payout tier for a square footage band (verified table). */
export const MLS_PAYOUT_TABLE = [
  { max: 2500, payout: 50 },
  { max: 3500, payout: 60 },
  { max: 5000, payout: 70 },
  { max: 7500, payout: 90 },
  { max: 10000, payout: 120 },
] as const;

export function mlsPayoutForSqft(sqft: number): number {
  const t = MLS_PAYOUT_TABLE.find(t => sqft <= t.max);
  return t ? t.payout : 120;
}

/**
 * Options for a certification run. All default to the earlier behaviour so the
 * original analysis is reproduced exactly.
 */
export interface SimOptions {
  /** Monthly membership fee in dollars. Not spendable, not a wallet liability. */
  membership_fee?: number;
  /** Incremental monthly cost of delivering the membership benefits (priority support etc). */
  membership_benefit_cost?: number;
  /**
   * Explicit promotional-restriction override. ABSENT = derive it from the same
   * authoritative resolver the transaction engine uses (`resolveMlsPromoEligibility`),
   * so a simulation cannot permit a redemption production would reject. An explicit
   * value still wins, so historical pre-restriction runs reproduce exactly.
   */
  vip_promo_on_standalone?: boolean;
  /** Cost ratio to use when closing out outstanding promotional credit. */
  promo_closeout_ratio?: number;
  /**
   * Months in which the 'refunds' pattern refunds one standalone Walkthrough.
   * Defaults to the conservative [3, 7] pair.
   */
  refund_months?: number[];
  /**
   * Extra/overriding service definitions merged over the default catalogue, so a
   * caller can model scenario-specific carts (premium packages, odd square footages,
   * a different MLS payout tier) through this same core. Defaults to none.
   */
  services?: Record<string, Svc>;
  /**
   * An explicit monthly booking plan given as service keys, repeated every month.
   * Absent = use the persona's own plan. Present = the persona is only a label, so
   * every scenario arm runs through the identical wallet, eligibility and margin code.
   */
  plan?: string[];
  /**
   * When set, the refund reversal applies to the LAST booking of the month rather
   * than only to a standalone Walkthrough, so a premium-package refund arm can run
   * through this same core. Defaults to off (the earlier behaviour).
   */
  refund_scenario?: boolean;
}

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
    case 'churn_after_1': return m < 1 ? rep('S', 6) : [];
    case 'churn_after_3': return m < 3 ? rep('S', 6) : [];
    case 'churn_after_4': return m < 4 ? rep('S', 6) : [];
    default: return [];
  }
}

export function simulate(tier: number, allowance: number, persona: string, e: Economics, vip: VipCost = VIP_BASE, opts: SimOptions = {}) {
  const cfg = getAutoFundConfig(tier);
  if (!cfg) return null;
  const cat = { ...serviceCatalog(e), ...(opts.services || {}) };
  const bundleRatio = bundleEconomics(e).cost_ratio;
  const isVip = isVipAutoFundTier(tier);
  const addon = resolveVipAddOnDiscount('drone', 125);
  const vipAddonDiscount = addon.eligible ? addon.discount : 0;
  // The MLS promotional restriction. When the caller does not state it explicitly,
  // it is derived from the SAME authoritative resolver the transaction engine uses,
  // so a simulation cannot permit a redemption production would reject. An explicit
  // flag still wins, so historical pre-restriction runs reproduce exactly.
  const vipPromoRestricted = opts.vip_promo_on_standalone !== undefined
    ? (isVip && opts.vip_promo_on_standalone === false)
    : (isVip && !resolveMlsPromoEligibility({
        tier_amount: tier,
        items: [{ pkg: 'mls', sqft: PROPERTY_SQFT }],
        is_standalone_mls: true,
        allowance_used_this_cycle: 0,
      }).promo_eligible);
  const monthlyFee = opts.membership_fee ?? 0;
  const monthlyBenefitCost = opts.membership_benefit_cost ?? 0;

  let cashPool = 0;  // cents of cash-funded Booking Value
  let promoPool = 0; // cents of promotional Booking Value
  let cashIn = 0, fundingCommission = 0, bookingCommission = 0, stripe = 0;
  let payout = 0, editing = 0, retailDelivered = 0;
  let directPaid = 0, topups = 0, promoOnStandalone = 0, promoElsewhere = 0, cashBvUsed = 0;
  let activeMonths = 0, payments = 0, bookings = 0, nonMlsBookings = 0, refunds = 0;
  let membershipRevenue = 0, membershipProcessing = 0;
  const refundMonths = opts.refund_months ?? REFUND_MONTHS;

  for (let m = 0; m < MONTHS; m++) {
    if (persona === 'pause_resume' && PAUSE_MONTHS.includes(m)) continue;
    const churnAfter = /^churn_after_(\d+)$/.exec(persona);
    if (churnAfter && m >= Number(churnAfter[1])) continue;
    activeMonths++;

    cashIn += cfg.amount;
    fundingCommission += cfg.amount * (payments === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
    payments++;
    stripe += cfg.amount * STRIPE_RATE + STRIPE_FIXED;
    cashPool += Math.round(cfg.amount * 100);
    promoPool += Math.round(cfg.bonus_booking_value * 100);

    // Membership fee: collected revenue, NOT wallet liability and NOT promotional credit.
    if (monthlyFee > 0) {
      cashIn += monthlyFee;
      membershipRevenue += monthlyFee;
      const feeProcessing = monthlyFee * STRIPE_RATE + STRIPE_FIXED;
      stripe += feeProcessing;
      membershipProcessing += feeProcessing;
    }

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
      // Promotional-credit cap. On a restricted tier promotional credit may not pay
      // for the MLS Walkthrough, so a standalone walkthrough has a cap of zero and a
      // bundle is capped at its eligible non-MLS portion.
      const promoCapC = vipPromoRestricted
        ? (s.standalone ? 0 : Math.round(s.eligible_retail * 100))
        : priceC;
      let promo = 0, cash = 0, consumed = false;
      const promoEligible = s.standalone ? allowanceUsed < allowance : true;
      if (promoEligible && promoPool > 0 && promoCapC > 0) {
        promo = Math.min(promoPool, promoCapC);
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
      // The sales person is paid out of the package first, so a commissioned
      // booking leaves the partner a 40% share of the remainder (34% of retail).
      payout += bc > 0 ? s.payout_marketplace : s.payout;
      editing += s.editing;
      retailDelivered += s.retail;
      if (s.standalone) promoOnStandalone += promo / 100;
      else { promoElsewhere += promo / 100; nonMlsBookings++; }
      cashBvUsed += cash / 100;
      bookings++;
      monthBookings.push({ key, promo, cash, direct, consumed, bc, payout: bc > 0 ? s.payout_marketplace : s.payout, retail: s.retail });
    };

    const plan = Array.isArray(opts.plan) ? opts.plan : monthlyPlan(persona, m);
    if (plan === null) {
      const priceC = Math.round(cat.S.retail * 100);
      let guard = 0;
      // Promotional credit is only usable toward this booking when the tier permits it.
      const usablePromo = vipPromoRestricted ? 0 : (allowanceUsed < allowance ? promoPool : 0);
      while (cashPool + usablePromo >= priceC && guard < 60) {
        book('S');
        guard++;
      }
    } else {
      for (const k of plan) book(k);
    }

    if ((persona === 'refunds' || opts.refund_scenario) && refundMonths.includes(m)) {
      const b = opts.refund_scenario
        ? monthBookings[monthBookings.length - 1]
        : monthBookings.filter(x => x.key === 'S').pop();
      if (b) {
        promoPool += b.promo;
        cashPool += b.cash;
        if (b.direct > 0) { cashIn -= b.direct / 100; directPaid -= b.direct / 100; }
        bookingCommission -= b.bc;
        payout -= b.payout;          // specialist payout reversed
        retailDelivered -= b.retail; // editing + Stripe retained
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

  const realizedCosts = payout + editing + fundingCommission + bookingCommission + stripe + vipCost + monthlyBenefitCost * activeMonths;
  const contribution12 = cashIn - realizedCosts;

  const mlsRatio = (cat.S.payout + cat.S.editing) / cat.S.retail;
  const personaRatio = retailDelivered > 0 ? (payout + editing) / retailDelivered : mlsRatio;
  const outstandingPromo = promoPool / 100;
  const outstandingCash = cashPool / 100;
  const promoRatio = opts.promo_closeout_ratio ?? bundleRatio;
  const closeout = outstandingPromo * promoRatio + outstandingCash * personaRatio;
  const lifetime = contribution12 - closeout;

  const lifetimePct = cashIn > 0 ? (lifetime / cashIn) * 100 : 0;
  return {
    tier,
    allowance,
    persona,
    vip_tier: isVip,
    cash_in: round2(cashIn),
    funding_cash: round2(cfg.amount * activeMonths),
    topups: round2(topups),
    direct_paid: round2(directPaid),
    promo_issued: round2(cfg.bonus_booking_value * activeMonths),
    promo_on_standalone_mls: round2(promoOnStandalone),
    vip_promo_restricted: vipPromoRestricted,
    // Hard invariant: a restricted tier must never record promotional spend on a
    // standalone MLS Walkthrough. A false here means the simulation permitted a
    // redemption the production booking engine would have rejected.
    no_prohibited_promo_redemptions: !(vipPromoRestricted && promoOnStandalone > 0),
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
    membership_revenue: round2(membershipRevenue),
    membership_processing: round2(membershipProcessing),
    membership_benefit_cost: round2(monthlyBenefitCost * activeMonths),
    active_months: activeMonths,
    promo_closeout_ratio_used: round2(promoRatio),
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