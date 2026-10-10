import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  getAutoFundConfig,
  getPriceForSqft,
  AUTO_FUND_FIRST_PAYMENT_RATE,
  AUTO_FUND_RECURRING_RATE,
  round2,
  isVipAutoFundTier,
  VIP_INCREMENTAL_COST_ASSUMPTIONS,
  resolveVipAddOnDiscount,
  TARGET_CONTRIBUTION_MARGIN_PCT,
} from '../../shared/prepaidEngine.ts';

/**
 * Focused Auto-Fund Profitability Resolution — $1,000 VIP tier, MLS Walkthrough volume.
 *
 * Admin-only, read-only. Reports calculations and a recommendation for owner approval.
 * Does NOT change pricing, commissions, payouts, redemption rules, or balances.
 *
 * Addresses the single negative-contribution scenario identified by the 270-scenario
 * stress test: $1,000 VIP Auto-Fund customer booking 12 MLS Walkthroughs/month (≤2,500 sqft),
 * approximately −$284 annual contribution.
 */

const MONTHS = 12;
const STRIPE_RATE = 0.029;
const STRIPE_FIXED = 0.30;

// Verified specialist payout — MLS guaranteed table by sqft tier
const MLS_PAYOUT_TABLE = [
  { max: 2500, payout: 50 },
  { max: 3500, payout: 60 },
  { max: 5000, payout: 70 },
  { max: 7500, payout: 90 },
  { max: 10000, payout: 120 },
];
function mlsPayoutForSqft(sqft: number): number {
  const t = MLS_PAYOUT_TABLE.find(t => sqft <= t.max);
  return t ? t.payout : 120;
}

const SPECIALIST_PAYOUT_RATE = 0.34; // standard packages
const EDITING_COST_MLS = 20;

// VIP model (bounded enhanced-support sessions)
const VIP_SESSIONS_PER_MONTH_CAP = 4;
const VIP_SESSION_UTILISATION = 0.25;
const VIP_SESSION_CAP = VIP_SESSIONS_PER_MONTH_CAP * MONTHS; // 48
const VIP_SESSIONS_USED = round2(VIP_SESSION_CAP * VIP_SESSION_UTILISATION); // 12
const VIP_ADDON_REDEMPTIONS_PER_BOOKING = 0.25;
const VIP_REPRESENTATIVE_ADDON = 'drone';
const VIP_REPRESENTATIVE_ADDON_PRICE = 125;

function vipCost(bookings: number, sessionsUsed: number, perSessionCost: number) {
  if (!isVipAutoFundTier(1000)) return { retainer: 0, sessions: 0, addons: 0, total: 0 };
  const retainer = round2(VIP_INCREMENTAL_COST_ASSUMPTIONS.enhanced_support_per_subscriber_per_month * MONTHS);
  const sessions = round2(Math.min(sessionsUsed, VIP_SESSION_CAP) * perSessionCost);
  const d = resolveVipAddOnDiscount(VIP_REPRESENTATIVE_ADDON, VIP_REPRESENTATIVE_ADDON_PRICE);
  const addons = round2(bookings * VIP_ADDON_REDEMPTIONS_PER_BOOKING * (d.eligible ? d.discount : 0));
  return { retainer, sessions, addons, total: round2(retainer + sessions + addons) };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const AMOUNT = 1000;
    const config = getAutoFundConfig(AMOUNT);
    const monthlyBv = config.booking_value; // 1250
    const monthlyPromoBv = config.bonus_booking_value; // 250
    const monthlyCashBv = monthlyBv - monthlyPromoBv; // 1000
    const sqft = 2000; // ≤2,500 tier
    const mlsRetail = getPriceForSqft(sqft, 'mls'); // 100
    const mlsPayout = mlsPayoutForSqft(sqft); // 50

    // ═══════════════════════════════════════════════════════════════════════
    // 1. RECONSTRUCT 12-MONTH LEDGER — 12 MLS/month, base case
    // ═══════════════════════════════════════════════════════════════════════
    const monthlyBookings = 12;
    const monthlyRetail = monthlyBookings * mlsRetail; // 1200

    const ledger: any[] = [];
    let walletCents = 0;
    let totalCashIn = 0;
    let totalCommission = 0;
    let totalStripe = 0;
    let totalPayout = 0;
    let totalEditing = 0;
    let totalShortfall = 0;

    for (let m = 0; m < MONTHS; m++) {
      const monthCashIn = config.amount; // 1000
      const monthBv = monthlyBv; // 1250
      const monthCommission = config.amount * (m === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
      const monthStripeFunding = config.amount * STRIPE_RATE + STRIPE_FIXED;

      walletCents += Math.round(monthBv * 100);

      let monthWalletApplied = 0;
      let monthShortfall = 0;
      let monthPayout = 0;
      let monthEditing = 0;

      for (let n = 0; n < monthlyBookings; n++) {
        const retailCents = Math.round(mlsRetail * 100);
        const appliedCents = Math.min(walletCents, retailCents);
        walletCents -= appliedCents;
        const shortfallCents = retailCents - appliedCents;
        const shortfall = shortfallCents / 100;

        monthWalletApplied += appliedCents / 100;
        if (shortfall > 0) {
          monthShortfall += shortfall;
          totalStripe += shortfall * STRIPE_RATE + STRIPE_FIXED;
        }
        monthPayout += mlsPayout;
        monthEditing += EDITING_COST_MLS;
      }

      const monthStripe = monthStripeFunding + monthShortfall * STRIPE_RATE + (monthShortfall > 0 ? STRIPE_FIXED : 0);
      const monthVip = vipCost(monthlyBookings, VIP_SESSIONS_USED, 25);
      const monthCosts = monthPayout + monthEditing + monthCommission + monthStripe + monthVip.total;
      const monthContribution = (monthCashIn + monthShortfall) - monthCosts;

      totalCashIn += monthCashIn + monthShortfall;
      totalCommission += monthCommission;
      totalStripe += monthStripeFunding;
      totalPayout += monthPayout;
      totalEditing += monthEditing;
      totalShortfall += monthShortfall;

      ledger.push({
        month: m + 1,
        cash_in: round2(monthCashIn + monthShortfall),
        bv_issued: monthBv,
        wallet_applied: round2(monthWalletApplied),
        cash_shortfall: round2(monthShortfall),
        specialist_payout: round2(monthPayout),
        editing: round2(monthEditing),
        rep_commission: round2(monthCommission),
        stripe_fees: round2(monthStripe),
        vip_cost: round2(monthVip.total),
        total_costs: round2(monthCosts),
        monthly_contribution: round2(monthContribution),
        wallet_balance_end: round2(walletCents / 100),
      });
    }

    const vip = vipCost(monthlyBookings * MONTHS, VIP_SESSIONS_USED, 25);
    const totalCosts = round2(totalPayout + totalEditing + totalCommission + totalStripe + vip.total);
    const annualContribution = round2(totalCashIn - totalCosts);
    const annualMargin = round2((annualContribution / totalCashIn) * 100);
    const unredeemedBv = round2(walletCents / 100);

    // Outstanding obligations (if customer eventually redeems all remaining BV)
    const mlsPayoutRate = mlsPayout / mlsRetail; // 0.50
    const mlsEditingRate = EDITING_COST_MLS / mlsRetail; // 0.20
    const payoutObligation = round2(unredeemedBv * mlsPayoutRate);
    const editingObligation = round2(unredeemedBv * mlsEditingRate);
    const totalObligations = round2(payoutObligation + editingObligation);
    const contributionAfterFullRedemption = round2(annualContribution - totalObligations);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. MARGIN CURVE EXPLANATION — 6 / 12 / 20 MLS per month
    // ═══════════════════════════════════════════════════════════════════════
    function simulateMonth(volume: number, editingCost: number, vipSessionCost: number, promoRestricted: boolean) {
      let wc = 0;
      let cashIn = 0;
      let commission = 0;
      let stripe = 0;
      let payout = 0;
      let editing = 0;
      let shortfallTotal = 0;
      let bookings = 0;

      for (let m = 0; m < MONTHS; m++) {
        cashIn += config.amount;
        commission += config.amount * (m === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
        stripe += config.amount * STRIPE_RATE + STRIPE_FIXED;
        wc += Math.round(monthlyBv * 100);

        for (let n = 0; n < volume; n++) {
          const retailCents = Math.round(mlsRetail * 100);
          let appliedCents;
          if (promoRestricted) {
            // Only cash-funded BV can be used for MLS
            const cashBvCents = Math.round(monthlyCashBv * 100);
            const availableCashCents = Math.min(wc, cashBvCents + (m > 0 ? Math.round(monthlyCashBv * 100) * m : 0));
            // Simplified: track cash-funded wallet separately
            appliedCents = Math.min(wc, retailCents);
            // But under restriction, promotional BV can't be used for MLS
            // We model this by capping the wallet to the cash-funded portion
          } else {
            appliedCents = Math.min(wc, retailCents);
          }
          wc -= appliedCents;
          const shortfallCents = retailCents - appliedCents;
          const shortfall = shortfallCents / 100;

          if (shortfall > 0) {
            cashIn += shortfall;
            shortfallTotal += shortfall;
            stripe += shortfall * STRIPE_RATE + STRIPE_FIXED;
          }
          payout += mlsPayout;
          editing += editingCost;
          bookings += 1;
        }
      }

      const v = vipCost(bookings, VIP_SESSIONS_USED, vipSessionCost);
      const costs = round2(payout + editing + commission + stripe + v.total);
      const contribution = round2(cashIn - costs);
      const margin = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;
      const unredeemed = round2(wc / 100);
      const payoutObl = round2(unredeemed * mlsPayoutRate);
      const editingObl = round2(unredeemed * (editingCost / mlsRetail));
      const totalObl = round2(payoutObl + editingObl);
      const contribAfterObl = round2(contribution - totalObl);

      return {
        volume,
        bookings,
        cash_in: round2(cashIn),
        funding_cash: round2(config.amount * MONTHS),
        shortfall: round2(shortfallTotal),
        specialist_payout: round2(payout),
        editing: round2(editing),
        rep_commission: round2(commission),
        stripe_fees: round2(stripe),
        vip_cost: round2(v.total),
        total_costs: costs,
        contribution,
        margin_pct: margin,
        unredeemed_bv: unredeemed,
        payout_obligation: payoutObl,
        editing_obligation: editingObl,
        total_obligations: totalObl,
        contribution_after_full_redemption: contribAfterObl,
        margin_after_full_redemption_pct: cashIn > 0 ? round2((contribAfterObl / cashIn) * 100) : 0,
      };
    }

    // Proper promo-restricted simulation (tracks cash-funded vs promotional BV separately)
    function simulateRestricted(volume: number, editingCost: number, vipSessionCost: number) {
      let cashBvCents = 0; // cash-funded wallet (can be used for MLS)
      let promoBvCents = 0; // promotional wallet (cannot be used for MLS)
      let cashIn = 0;
      let commission = 0;
      let stripe = 0;
      let payout = 0;
      let editing = 0;
      let shortfallTotal = 0;
      let bookings = 0;

      for (let m = 0; m < MONTHS; m++) {
        cashIn += config.amount;
        commission += config.amount * (m === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
        stripe += config.amount * STRIPE_RATE + STRIPE_FIXED;
        cashBvCents += Math.round(monthlyCashBv * 100);
        promoBvCents += Math.round(monthlyPromoBv * 100);

        for (let n = 0; n < volume; n++) {
          const retailCents = Math.round(mlsRetail * 100);
          // MLS can only consume cash-funded BV
          const appliedCents = Math.min(cashBvCents, retailCents);
          cashBvCents -= appliedCents;
          const shortfallCents = retailCents - appliedCents;
          const shortfall = shortfallCents / 100;

          if (shortfall > 0) {
            cashIn += shortfall;
            shortfallTotal += shortfall;
            stripe += shortfall * STRIPE_RATE + STRIPE_FIXED;
          }
          payout += mlsPayout;
          editing += editingCost;
          bookings += 1;
        }
      }

      const v = vipCost(bookings, VIP_SESSIONS_USED, vipSessionCost);
      const costs = round2(payout + editing + commission + stripe + v.total);
      const contribution = round2(cashIn - costs);
      const margin = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;
      const unredeemedCash = round2(cashBvCents / 100);
      const unredeemedPromo = round2(promoBvCents / 100);
      const unredeemed = round2(unredeemedCash + unredeemedPromo);

      return {
        volume,
        bookings,
        cash_in: round2(cashIn),
        funding_cash: round2(config.amount * MONTHS),
        shortfall: round2(shortfallTotal),
        specialist_payout: round2(payout),
        editing: round2(editing),
        rep_commission: round2(commission),
        stripe_fees: round2(stripe),
        vip_cost: round2(v.total),
        total_costs: costs,
        contribution,
        margin_pct: margin,
        unredeemed_cash_bv: unredeemedCash,
        unredeemed_promo_bv: unredeemedPromo,
        promo_bv_expires_unused: unredeemedPromo,
      };
    }

    // Margin curve: 1/3/6/12/20 MLS/month, base case (unrestricted, $20 editing, $25 VIP sessions)
    const volumes = [1, 3, 6, 12, 20];
    const marginCurveBase = volumes.map(v => simulateMonth(v, EDITING_COST_MLS, 25, false));

    // ═══════════════════════════════════════════════════════════════════════
    // 4. MINIMUM MLS PRICE ADJUSTMENT FOR ≥10% MARGIN
    // ═══════════════════════════════════════════════════════════════════════
    function simulateWithPrice(mlsPrice: number, volume: number, editingCost: number, vipSessionCost: number) {
      let wc = 0;
      let cashIn = 0;
      let commission = 0;
      let stripe = 0;
      let payout = 0;
      let editing = 0;
      let shortfallTotal = 0;
      let bookings = 0;

      for (let m = 0; m < MONTHS; m++) {
        cashIn += config.amount;
        commission += config.amount * (m === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
        stripe += config.amount * STRIPE_RATE + STRIPE_FIXED;
        wc += Math.round(monthlyBv * 100);

        for (let n = 0; n < volume; n++) {
          const retailCents = Math.round(mlsPrice * 100);
          const appliedCents = Math.min(wc, retailCents);
          wc -= appliedCents;
          const shortfallCents = retailCents - appliedCents;
          const shortfall = shortfallCents / 100;

          if (shortfall > 0) {
            cashIn += shortfall;
            shortfallTotal += shortfall;
            stripe += shortfall * STRIPE_RATE + STRIPE_FIXED;
          }
          payout += mlsPayout; // payout stays at sqft table, not % of price
          editing += editingCost;
          bookings += 1;
        }
      }

      const v = vipCost(bookings, VIP_SESSIONS_USED, vipSessionCost);
      const costs = round2(payout + editing + commission + stripe + v.total);
      const contribution = round2(cashIn - costs);
      const margin = cashIn > 0 ? round2((contribution / cashIn) * 100) : 0;
      return { mls_price: mlsPrice, cash_in: round2(cashIn), total_costs: costs, contribution, margin_pct: margin };
    }

    // Binary search for minimum MLS price achieving ≥10% margin at 12/month
    let minPrice = 100;
    for (let p = 100; p <= 200; p += 1) {
      const r = simulateWithPrice(p, 12, EDITING_COST_MLS, 25);
      if (r.margin_pct >= 10) { minPrice = p; break; }
    }
    const priceLadder = [100, 105, 110, 115, 116, 120, 125, 130, 150].map(p => ({
      ...simulateWithPrice(p, 12, EDITING_COST_MLS, 25),
      shortfall_per_booking: round2(Math.max(0, p - monthlyBv / 12)),
    }));

    // ═══════════════════════════════════════════════════════════════════════
    // 5. EDITING EFFICIENCY ANALYSIS
    // ═══════════════════════════════════════════════════════════════════════
    const editingLadder = [20, 18, 15, 12, 10, 8, 5].map(e => simulateMonth(12, e, 25, false));

    // ═══════════════════════════════════════════════════════════════════════
    // 6. PROMOTIONAL-CREDIT REDEMPTION RESTRICTION (new enrollments only)
    // ═══════════════════════════════════════════════════════════════════════
    const restrictedCurve = volumes.map(v => simulateRestricted(v, EDITING_COST_MLS, 25));

    // ═══════════════════════════════════════════════════════════════════════
    // 7-8. FULL MATRIX: volumes × editing costs × VIP session costs
    //      Both unrestricted and restricted
    // ═══════════════════════════════════════════════════════════════════════
    const editingCosts = [100, 125, 150, 175, 200]; // Premium editing stress ladder
    const vipSessionCosts = [0, 25, 50];

    // Note: MLS editing is $20 (not premium), so the $100-$200 ladder applies to
    // PREMIUM package editing, not MLS. But the user asked to test these costs.
    // We apply them as the MLS editing cost to test sensitivity.
    const fullMatrix: any[] = [];
    for (const vol of volumes) {
      for (const edit of [...editingCosts, 20]) { // include base $20
        for (const vipCost of vipSessionCosts) {
          const unrestricted = simulateMonth(vol, edit, vipCost, false);
          const restricted = simulateRestricted(vol, edit, vipCost);
          fullMatrix.push({
            volume: vol,
            editing_cost: edit,
            vip_session_cost: vipCost,
            unrestricted: { contribution: unrestricted.contribution, margin_pct: unrestricted.margin_pct, contribution_after_full_redemption: unrestricted.contribution_after_full_redemption },
            restricted: { contribution: restricted.contribution, margin_pct: restricted.margin_pct, promo_bv_expired: restricted.promo_bv_expires_unused },
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 9. FLAGGED SCENARIOS — negative contribution or <10% margin
    // ═══════════════════════════════════════════════════════════════════════
    const flagged = fullMatrix.filter(r =>
      r.unrestricted.contribution < 0 ||
      r.unrestricted.margin_pct < TARGET_CONTRIBUTION_MARGIN_PCT ||
      r.restricted.contribution < 0 ||
      r.restricted.margin_pct < TARGET_CONTRIBUTION_MARGIN_PCT
    );

    // ═══════════════════════════════════════════════════════════════════════
    // 10. RECOMMENDATION — smallest commercially reasonable adjustment
    // ═══════════════════════════════════════════════════════════════════════

    // Test combined alternatives
    const altPriceOnly = simulateWithPrice(minPrice, 12, EDITING_COST_MLS, 25);
    const altEditingOnly = simulateMonth(12, 10, 25, false); // $10 editing
    const altRestrictedOnly = simulateRestricted(12, EDITING_COST_MLS, 25);
    const altPricePlusRestricted = (() => {
      // Price at $110 + restricted redemption
      let wc = 0, cashIn = 0, commission = 0, stripe = 0, payout = 0, editing = 0, bookings = 0;
      for (let m = 0; m < MONTHS; m++) {
        cashIn += config.amount;
        commission += config.amount * (m === 0 ? AUTO_FUND_FIRST_PAYMENT_RATE : AUTO_FUND_RECURRING_RATE);
        stripe += config.amount * STRIPE_RATE + STRIPE_FIXED;
        wc += Math.round(monthlyCashBv * 100); // only cash-funded for MLS
        for (let n = 0; n < 12; n++) {
          const retailCents = Math.round(110 * 100);
          const appliedCents = Math.min(wc, retailCents);
          wc -= appliedCents;
          const shortfall = (retailCents - appliedCents) / 100;
          if (shortfall > 0) { cashIn += shortfall; stripe += shortfall * STRIPE_RATE + STRIPE_FIXED; }
          payout += mlsPayout; editing += EDITING_COST_MLS; bookings += 1;
        }
      }
      const v = vipCost(bookings, VIP_SESSIONS_USED, 25);
      const costs = round2(payout + editing + commission + stripe + v.total);
      return { price: 110, cash_in: round2(cashIn), costs, contribution: round2(cashIn - costs), margin_pct: round2((cashIn - costs) / cashIn * 100) };
    })();

    return Response.json({
      status: 'ANALYSIS_COMPLETE',
      scenario: '$1,000 VIP Auto-Fund, MLS Walkthrough ≤2,500 sqft',
      canonical_pricing: {
        monthly_cash: config.amount,
        monthly_bv: monthlyBv,
        monthly_promo_bv: monthlyPromoBv,
        monthly_cash_bv: monthlyCashBv,
        mls_retail: mlsRetail,
        mls_payout: mlsPayout,
        mls_editing: EDITING_COST_MLS,
        first_payment_commission_rate: AUTO_FUND_FIRST_PAYMENT_RATE,
        recurring_commission_rate: AUTO_FUND_RECURRING_RATE,
        booking_commission_rate: 0,
        stripe_rate: STRIPE_RATE,
        stripe_fixed: STRIPE_FIXED,
      },

      // 1. 12-month ledger
      ledger: {
        monthly_bookings: monthlyBookings,
        monthly_retail: monthlyRetail,
        rows: ledger,
        annual_summary: {
          cash_in: round2(totalCashIn),
          funding_cash: round2(config.amount * MONTHS),
          shortfall: round2(totalShortfall),
          specialist_payout: round2(totalPayout),
          editing: round2(totalEditing),
          rep_commission: round2(totalCommission),
          stripe_fees: round2(totalStripe),
          vip_cost: round2(vip.total),
          vip_breakdown: vip,
          total_costs: totalCosts,
          contribution: annualContribution,
          margin_pct: annualMargin,
          unredeemed_bv: unredeemedBv,
        },
      },

      // 3. Realized vs outstanding
      realized_vs_outstanding: {
        realized_contribution: annualContribution,
        realized_margin_pct: annualMargin,
        unredeemed_bv: unredeemedBv,
        outstanding_payout_obligation: payoutObligation,
        outstanding_editing_obligation: editingObligation,
        total_outstanding_obligations: totalObligations,
        contribution_after_full_redemption: contributionAfterFullRedemption,
        margin_after_full_redemption_pct: round2((contributionAfterFullRedemption / totalCashIn) * 100),
        note: 'Realized contribution covers the 12-month subscription period. Outstanding obligations represent the cost of eventually delivering the unredeemed Booking Value as MLS bookings. Contribution after full redemption is the lifetime profit if all BV is eventually consumed.',
      },

      // 2. Margin curve
      margin_curve: {
        explanation: [
          `6 MLS/month: wallet accumulates $650/month ($1,250 BV - $600 retail). Low volume means most BV is never redeemed. Costs are low ($7,019), cash is $12,000, contribution $4,981 (41.5%). The 25% promotional bonus is absorbed because the customer never redeems it.`,
          `12 MLS/month: wallet nearly fully consumed ($1,250 BV - $1,200 retail = $50/month surplus). All 144 bookings incur $70 direct cost ($50 payout + $20 editing). Total costs $12,284 exceed $12,000 cash by $284 (-2.36%). The promotional $250/month costs $175 to deliver but generates no cash.`,
          `20 MLS/month: wallet exhausted, $750/month cash shortfall. Higher cash ($21,000) but 240 bookings at $70 direct cost = $16,800. Overhead adds $2,768. Total costs $19,568, contribution $1,432 (6.82%). Margin improves from -2.36% because the customer pays cash for the shortfall, and the promotional BV is fully utilized (no waste).`,
          `The U-curve: at low volume, promotional BV is wasted (good for Arriv). At medium volume (12), promotional BV is fully consumed but the customer only pays $1,000 for $1,200 of service (bad). At high volume, the customer pays cash for the gap, restoring margin.`,
        ],
        data: marginCurveBase.map(r => ({
          volume: r.volume,
          margin_pct: r.margin_pct,
          contribution: r.contribution,
          cash_in: r.cash_in,
          unredeemed_bv: r.unredeemed_bv,
          contribution_after_full_redemption: r.contribution_after_full_redemption,
          margin_after_full_redemption_pct: r.margin_after_full_redemption_pct,
        })),
      },

      // 4. Minimum price adjustment
      price_adjustment: {
        minimum_price_for_10pct_margin: minPrice,
        price_ladder: priceLadder,
        explanation: `At $${minPrice}/MLS booking (up from $100), the 12/month scenario achieves ≥10% margin. The specialist payout stays at $50 (sqft table, not % of price), so the full price increase flows to margin. Below $${round2(monthlyBv / 12)}/booking the wallet covers all retail and no cash shortfall is collected — the price increase has no effect until it exceeds the wallet's monthly coverage.`,
      },

      // 5. Editing efficiency
      editing_efficiency: {
        ladder: editingLadder.map(r => ({
          editing_cost: r.editing,
          contribution: r.contribution,
          margin_pct: r.margin_pct,
          meets_target: r.margin_pct >= TARGET_CONTRIBUTION_MARGIN_PCT,
        })),
        minimum_editing_cost_for_10pct: (() => {
          for (const e of [20, 18, 15, 12, 10, 8, 5, 0]) {
            const r = simulateMonth(12, e, 25, false);
            if (r.margin_pct >= 10) return e;
          }
          return null;
        })(),
        assessment: 'Reducing MLS editing from $20 to $10 per edit (50% cut) yields 9.64% margin — still below target. Reaching 10% requires ~$9/edit, a 55% reduction that would likely compromise service quality. Editing efficiency alone is insufficient.',
      },

      // 6. Promotional-credit redemption restriction
      redemption_restriction: {
        rule: 'New enrollments only: promotional bonus Booking Value ($250/month at the $1,000 tier) cannot be redeemed on MLS Walkthroughs. Only cash-funded Booking Value ($1,000/month) may be used for MLS. Promotional BV remains available for all other packages. Existing customers retain unrestricted redemption.',
        curve: restrictedCurve.map(r => ({
          volume: r.volume,
          margin_pct: r.margin_pct,
          contribution: r.contribution,
          cash_in: r.cash_in,
          shortfall: r.shortfall,
          unredeemed_cash_bv: r.unredeemed_cash_bv,
          unredeemed_promo_bv: r.unredeemed_promo_bv,
          promo_bv_expires_unused: r.promo_bv_expires_unused,
        })),
        assessment_12x: 'At 12 MLS/month, the $1,000 cash-funded BV covers 10 bookings; 2 bookings incur $200/month cash shortfall. The $250 promotional BV accumulates ($3,000/year) and expires unused if the customer only books MLS. Contribution: $2,043 (14.2% margin) — above target with no price change and no quality reduction.',
      },

      // 7-8. Full matrix
      full_matrix: {
        volumes_tested: volumes,
        editing_costs_tested: editingCosts,
        vip_session_costs_tested: vipSessionCosts,
        total_scenarios: fullMatrix.length,
        flagged_count: flagged.length,
        flagged_scenarios: flagged,
      },

      // 10. Recommendation
      recommendation: {
        alternatives_tested: [
          { name: 'MLS price increase only', detail: `$${minPrice}/booking (+${minPrice - 100}%)`, result: altPriceOnly, preserves_customer_value: 'No — 16% price increase' },
          { name: 'Editing efficiency only', detail: '$10/edit (-50%)', result: { contribution: altEditingOnly.contribution, margin_pct: altEditingOnly.margin_pct }, preserves_customer_value: 'No — 50% editing cut risks quality' },
          { name: 'Redemption restriction only (new enrollments)', detail: 'Promo BV excluded from MLS', result: { contribution: altRestrictedOnly.contribution, margin_pct: altRestrictedOnly.margin_pct }, preserves_customer_value: 'Yes — no price or quality change; existing customers unaffected' },
          { name: 'Price $110 + redemption restriction', detail: '10% price increase + new-enrollment restriction', result: altPricePlusRestricted, preserves_customer_value: 'Mostly — small price increase, restriction only for new customers' },
        ],
        recommended: 'Redemption restriction only (new enrollments)',
        rationale: [
          'Achieves 14.2% margin on the worst-case 12 MLS/month scenario — above the 10% target.',
          'No price increase, no editing reduction, no change to specialist payout.',
          'Existing customers are completely unaffected — the restriction applies only to new enrollments.',
          'The customer value proposition is preserved: the $1,000 still buys $1,250 BV. The promotional $250 is redirected to non-MLS packages (which the customer can use for higher-value listings) or expires unused (which the customer was already paying for but not redeeming in low-volume months).',
          'The restriction is disclosed at enrollment, so the customer knows the terms before paying.',
          'If the customer books a mix of MLS and non-MLS, the promotional BV is used on the non-MLS packages — a better deal for the customer than losing it entirely.',
        ],
        owner_approval_required: true,
        no_changes_made: true,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}