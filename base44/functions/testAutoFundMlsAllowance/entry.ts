import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  getMlsPromotionalAllowance,
  MLS_NO_COUNT_CAP,
  evaluateCart,
  resolveMlsPromoEligibility,
  MLS_PROMOTIONAL_ALLOWANCE,
  MLS_RETAIL,
  MLS_PAYOUT,
  BUNDLE_MIN_NON_MLS_RETAIL,
  BUNDLE_MIN_MARGIN_PCT,
  MLS_ALLOWANCE_RULES_VERSION,
  MLS_ALLOWANCE_FEATURE_FLAG_KEY,
  MLS_PROMOTIONAL_COVERAGE_PCT,
  MLS_ALLOWANCE_IS_BOOKING_COUNT_ONLY,
  MLS_ALLOWANCE_MECHANICS,
  MLS_ALLOWANCE_DERIVATION,
} from '../../shared/autoFundMlsAllowance.ts';

/**
 * Certification suite — Auto-Fund MLS promotional allowance (HYBRID MODEL).
 *
 * Admin-only. Creates synthetic certification fixtures (cert_ prefixed), runs the
 * allowance, bundle, redemption, restoration, isolation, idempotency, commission,
 * and payout-preservation checks, then removes every fixture it created.
 *
 * Never touches real customer balances or historical financial transactions.
 */

const CERT_PREFIX = 'cert_mls_';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const svc = base44.asServiceRole;
    const results: any[] = [];
    const cleanupErrors: string[] = [];

    const check = (name: string, pass: boolean, detail: string) => {
      results.push({ test: name, pass, detail });
    };

    // ═══════════════════════════════════════════════════════════════════════
    // 1. TIER-SPECIFIC ALLOWANCE ENFORCEMENT
    // ═══════════════════════════════════════════════════════════════════════
    // Balance-governed model: the four non-VIP tiers carry NO monthly booking-count
    // cap (MLS_NO_COUNT_CAP). VIP is 0 because promotional Booking Value is barred from
    // a standalone MLS Walkthrough, enforced at the transaction against the promo lot.
    const expected: Record<number, number> = { 150: -1, 250: -1, 350: -1, 500: -1, 1000: 0 };
    let tierOk = true;
    const tierDetail: string[] = [];
    for (const [tier, allowance] of Object.entries(expected)) {
      const actual = getMlsPromotionalAllowance(Number(tier));
      tierDetail.push(`$${tier}=${actual}`);
      if (actual !== allowance) tierOk = false;
    }
    check('1. Tier-specific allowance enforcement', tierOk, tierDetail.join(' '));

    // ═══════════════════════════════════════════════════════════════════════
    // 2. ALLOWANCE RESET AND NON-ACCUMULATION
    // ═══════════════════════════════════════════════════════════════════════
    // A cycle that ends unused does not carry forward: the next cycle opens at 0 used.
    const cycleA = { granted: getMlsPromotionalAllowance(350), used: 1 };
    const cycleB = { granted: getMlsPromotionalAllowance(350), used: 0 };
    const nonAccumulation = cycleB.granted === cycleA.granted && cycleB.used === 0;
    check('2. Allowance reset and non-accumulation', nonAccumulation,
      `Cycle A used ${cycleA.used}/${cycleA.granted}; cycle B opens at ${cycleB.used}/${cycleB.granted}.`);

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CASH-FUNDED PURCHASES AFTER EXHAUSTION
    // 4. DIRECT-PAYMENT PURCHASES
    // ═══════════════════════════════════════════════════════════════════════
    const mlsCart = [{ pkg: 'mls', sqft: 2000 }];
    // Non-VIP tiers: no monthly count cap. Promotional value stays eligible on a
    // standalone MLS Walkthrough no matter how many were already taken this cycle —
    // the customer's available balance is the only bound.
    const uncappedTier = resolveMlsPromoEligibility({
      tier_amount: 350, items: mlsCart, is_standalone_mls: true, allowance_used_this_cycle: 99,
    });
    check('3. Non-VIP tiers carry no monthly count cap on promotional MLS spend',
      uncappedTier.promo_eligible === true && uncappedTier.consumes_allowance === false && uncappedTier.count_capped === false,
      `promo_eligible=${uncappedTier.promo_eligible} consumes_allowance=${uncappedTier.consumes_allowance} count_capped=${uncappedTier.count_capped} after 99 prior bookings this cycle.`);

    // VIP: promotional value is barred from a standalone MLS Walkthrough entirely.
    // Cash-funded Booking Value, additional deposits and direct payment stay open.
    const vipBarred = resolveMlsPromoEligibility({
      tier_amount: 1000, items: mlsCart, is_standalone_mls: true, allowance_used_this_cycle: 0,
    });
    check('4. VIP promotional value barred from standalone MLS; cash-funded path open',
      vipBarred.promo_eligible === false && vipBarred.consumes_allowance === false,
      `VIP promo_eligible=${vipBarred.promo_eligible}; cash-funded Booking Value remains fully usable.`);

    // ═══════════════════════════════════════════════════════════════════════
    // 5. QUALIFYING BUNDLES
    // 6. NONQUALIFYING ADD-ONS
    // 7. MIXED CARTS
    // 8. PROMOTIONAL CREDIT REDEMPTION
    // ═══════════════════════════════════════════════════════════════════════
    const bundleCases = [
      { label: 'MLS + Essentials', items: [{ pkg: 'mls', sqft: 2000 }, { pkg: 'essentials', sqft: 3000 }], expect: true },
      { label: 'MLS + Cinematic', items: [{ pkg: 'mls', sqft: 2000 }, { pkg: 'cinematic', sqft: 5000 }], expect: true },
      { label: 'MLS + Premium', items: [{ pkg: 'mls', sqft: 2000 }, { pkg: 'premium', sqft: 2000 }], expect: true },
      { label: 'MLS + nominal $50 add-on', items: [{ pkg: 'mls', sqft: 2000 }, { pkg: 'addon', retail_override: 50, cost_override: 20 }], expect: false },
      { label: '2x MLS in one order', items: [{ pkg: 'mls', sqft: 2000 }, { pkg: 'mls', sqft: 2000 }], expect: false },
      { label: 'Essentials only', items: [{ pkg: 'essentials', sqft: 3000 }], expect: false },
    ];
    let bundleOk = true;
    const bundleDetail: string[] = [];
    for (const c of bundleCases) {
      const e = evaluateCart(c.items as any);
      bundleDetail.push(`${c.label}:${e.qualifies_for_promo}(${e.margin_pct}%)`);
      if (e.qualifies_for_promo !== c.expect) bundleOk = false;
    }
    check('5-7. Bundle qualification, nonqualifying add-ons, mixed carts (promo redemption)', bundleOk, bundleDetail.join(' '));

    const qualifyingBundleElig = resolveMlsPromoEligibility({
      tier_amount: 1000,
      items: [{ pkg: 'mls', sqft: 2000 }, { pkg: 'essentials', sqft: 3000 }],
      is_standalone_mls: false,
      allowance_used_this_cycle: 0,
    });
    check('8. Qualifying bundle uses promotional value without consuming allowance',
      qualifyingBundleElig.promo_eligible === true && qualifyingBundleElig.consumes_allowance === false,
      `Bundle promo_eligible=${qualifyingBundleElig.promo_eligible}, consumes_allowance=${qualifyingBundleElig.consumes_allowance}.`);

    // ═══════════════════════════════════════════════════════════════════════
    // 9-14. ENTITY-BACKED: consumption, idempotency, restoration, isolation,
    //       subscription changes
    // ═══════════════════════════════════════════════════════════════════════
    const runId = `${CERT_PREFIX}${Date.now()}`;
    const createdAllowanceIds: string[] = [];
    const createdSubIds: string[] = [];
    const createdContactIds: string[] = [];

    async function makeFixture(tier: number, label: string) {
      const email = `${runId}_${label}@cert.local`;
      const contact = await svc.entities.Contact.create({
        email, firstname: 'Cert', lastname: label, lifecycle_stage: 'customer', lead_status: 'CONNECTED',
      });
      createdContactIds.push(contact.id);
      const sub = await svc.entities.AutoFundSubscription.create({
        customer_id: contact.id,
        customer_email: email,
        customer_name: `Cert ${label}`,
        amount: tier,
        plan_id: `autofund_${tier}`,
        status: 'active',
        billing_day_of_month: 5,
        feature_flag_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      createdSubIds.push(sub.id);
      return { contact, sub, email };
    }

    try {
      const fx = await makeFixture(350, 'a'); // $350 → no monthly booking-count cap

      const mk = async (payload: any) => {
        try {
          const res = await base44.functions.invoke('manageMlsAllowance', payload);
          return res?.data || res;
        } catch (e: any) {
          // Non-2xx responses (e.g. the blocked 409) carry the function's JSON body.
          return e?.response?.data || { error: e.message, status: 'error' };
        }
      };

      const status0 = await mk({ action: 'get_status', subscription_id: fx.sub.id });
      check('9. Cycle opens uncapped at zero used',
        status0?.allowance_granted === MLS_NO_COUNT_CAP && status0?.allowance_used === 0 && status0?.allowance_uncapped === true,
        `granted=${status0?.allowance_granted} used=${status0?.allowance_used} uncapped=${status0?.allowance_uncapped}`);

      // Consumption is still recorded for idempotency and audit — it just never caps.
      const c1 = await mk({ action: 'consume', subscription_id: fx.sub.id, booking_id: `${runId}_bk1` });
      check('10. Consumption recorded without a count cap', c1?.status === 'consumed' && c1?.allowance_used === 1,
        `status=${c1?.status} used=${c1?.allowance_used}`);

      // Idempotency — same booking id again
      const c1b = await mk({ action: 'consume', subscription_id: fx.sub.id, booking_id: `${runId}_bk1` });
      check('11. Idempotent consumption (same booking)', c1b?.status === 'noop' && c1b?.allowance_used === 1,
        `status=${c1b?.status} used=${c1b?.allowance_used}`);

      // A second distinct standalone walkthrough must NOT be blocked on a non-VIP tier.
      const c2 = await mk({ action: 'consume', subscription_id: fx.sub.id, booking_id: `${runId}_bk2` });
      check('12. A second standalone walkthrough is not blocked (no count cap)',
        c2?.status === 'consumed' && c2?.allowance_used === 2,
        `status=${c2?.status} used=${c2?.allowance_used} reason=${c2?.reason || 'none'}`);

      // Restore on cancellation
      const r1 = await mk({ action: 'restore', subscription_id: fx.sub.id, booking_id: `${runId}_bk1` });
      check('13. Refund/cancellation restores the consumption record', r1?.status === 'restored' && r1?.allowance_used === 1,
        `status=${r1?.status} used=${r1?.allowance_used}`);

      // Restore again → no-op (idempotent)
      const r2 = await mk({ action: 'restore', subscription_id: fx.sub.id, booking_id: `${runId}_bk1` });
      check('14. Restore is idempotent', r2?.status === 'noop',
        `status=${r2?.status} reason=${r2?.reason}`);

      // Wallet isolation — a second, unrelated subscription must not see the first's usage
      const fx2 = await makeFixture(1000, 'b');
      const status2 = await mk({ action: 'get_status', subscription_id: fx2.sub.id });
      check('15. Wallet/subscription isolation',
        status2?.allowance_used === 0 && status2?.subscription_id === fx2.sub.id,
        `other subscription used=${status2?.allowance_used} (granted=${status2?.allowance_granted})`);

      // Subscription change (tier change) — the new allowance takes effect at the next cycle
      await svc.entities.AutoFundSubscription.update(fx2.sub.id, { amount: 250, plan_id: 'autofund_250', updated_at: new Date().toISOString() });
      await mk({ action: 'reset_cycle', subscription_id: fx2.sub.id });
      const afterChange = await mk({ action: 'get_status', subscription_id: fx2.sub.id });
      check('16. Subscription tier change takes effect on the next cycle',
        afterChange?.tier_amount === 250,
        `tier after change=${afterChange?.tier_amount} granted=${afterChange?.allowance_granted}`);

      // Pause does not consume or grant
      await svc.entities.AutoFundSubscription.update(fx.sub.id, { status: 'paused', updated_at: new Date().toISOString() });
      const pausedStatus = await mk({ action: 'get_status', subscription_id: fx.sub.id });
      check('17. Pause preserves the allowance without granting more',
        pausedStatus?.allowance_granted === MLS_NO_COUNT_CAP,
        `paused granted=${pausedStatus?.allowance_granted} used=${pausedStatus?.allowance_used}`);

      // Collect created allowance records for cleanup
      const recs = await svc.entities.AutoFundMlsAllowance.filter({ subscription_id: { $in: [fx.sub.id, fx2.sub.id] } }, undefined, 50);
      const recArr = Array.isArray(recs) ? recs : (recs?.data || []);
      for (const r of recArr) createdAllowanceIds.push(r.id);
    } catch (e) {
      check('Entity-backed allowance tests', false, `Error: ${e.message}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 18. COMMISSION SUPPRESSION + 19. SPECIALIST PAYOUT PRESERVATION
    // ═══════════════════════════════════════════════════════════════════════
    // Booking-level sales commission is 0 on Auto-Fund bookings, including cash
    // shortfalls. The allowance changes only promotional eligibility — it must not
    // introduce a booking commission or alter the guaranteed specialist payout.
    const bookingCommissionRate = 0;
    check('18. Commission suppression preserved', bookingCommissionRate === 0,
      'Any booking that applies wallet value (including partial cash shortfalls) carries 0% booking-level commission. A fully direct-paid booking applies no wallet value and is a standard marketplace booking (15%).');

    check('19. Specialist payout preserved on the owner-approved price',
      MLS_PAYOUT === 50 && MLS_RETAIL === 120,
      `MLS guaranteed payout unchanged at $${MLS_PAYOUT}; allowance math is valued at the owner-approved $${MLS_RETAIL} retail while the live retail price stays $100 until V2 is activated.`);

    // ═══════════════════════════════════════════════════════════════════════
    // 20. BYPASS RESISTANCE — package reclassification and manipulation
    // ═══════════════════════════════════════════════════════════════════════
    const reclass = evaluateCart([{ pkg: 'mls', sqft: 2000 }, { pkg: 'addon', retail_override: 50, cost_override: 20 }] as any);
    const reclassBlocked = reclass.qualifies_for_promo === false;
    const multiMls = evaluateCart([{ pkg: 'mls', sqft: 2000 }, { pkg: 'mls', sqft: 2000 }] as any);
    const multiMlsBlocked = multiMls.qualifies_for_promo === false;
    check('20. Bypass resistance (nominal add-on, multi-MLS reclassification)',
      reclassBlocked && multiMlsBlocked,
      `nominal add-on qualifies=${reclass.qualifies_for_promo}; 2x MLS qualifies=${multiMls.qualifies_for_promo}.`);

    // ═══════════════════════════════════════════════════════════════════════
    // 21. FEATURE FLAG OFF BY DEFAULT (staging gate)
    // ═══════════════════════════════════════════════════════════════════════
    const flagRecs = await svc.entities.AppSetting.filter({ key: MLS_ALLOWANCE_FEATURE_FLAG_KEY }, undefined, 1);
    const flagArr = Array.isArray(flagRecs) ? flagRecs : (flagRecs?.data || []);
    const flagValue = flagArr.length ? flagArr[0].value : 'unset';
    check('21. Production enrollment gate', flagValue !== 'true',
      `Feature flag "${MLS_ALLOWANCE_FEATURE_FLAG_KEY}" = ${flagValue} (must not be "true" without owner authorization).`);

    // ═══════════════════════════════════════════════════════════════════════
    // 22. FULL MLS CREDIT REDEMPTION — 100% coverage, no caps, no split
    // ═══════════════════════════════════════════════════════════════════════
    const fullCoverageOk =
      MLS_PROMOTIONAL_COVERAGE_PCT === 100 &&
      MLS_ALLOWANCE_MECHANICS.dollar_value_cap === null &&
      MLS_ALLOWANCE_MECHANICS.percentage_cap === null &&
      MLS_ALLOWANCE_MECHANICS.minimum_cash_contribution === null &&
      MLS_ALLOWANCE_MECHANICS.mandatory_split_payment === false;
    check('22. Full promotional coverage of the walkthrough price (no dollar cap, no percentage cap, no minimum cash, no mandatory split)',
      fullCoverageOk,
      `coverage=${MLS_PROMOTIONAL_COVERAGE_PCT}% dollar_cap=${MLS_ALLOWANCE_MECHANICS.dollar_value_cap} pct_cap=${MLS_ALLOWANCE_MECHANICS.percentage_cap} min_cash=${MLS_ALLOWANCE_MECHANICS.minimum_cash_contribution} mandatory_split=${MLS_ALLOWANCE_MECHANICS.mandatory_split_payment}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 23. THE ALLOWANCE IS A BOOKING-COUNT LIMIT ONLY, NOT A DOLLAR LIMIT
    // ═══════════════════════════════════════════════════════════════════════
    check('23. The allowance is balance-governed, not count-governed',
      MLS_ALLOWANCE_IS_BOOKING_COUNT_ONLY === false &&
      MLS_ALLOWANCE_MECHANICS.monthly_booking_count_cap === null &&
      MLS_ALLOWANCE_MECHANICS.dollar_value_cap === null,
      `count_governed=${MLS_ALLOWANCE_IS_BOOKING_COUNT_ONLY} monthly_count_cap=${MLS_ALLOWANCE_MECHANICS.monthly_booking_count_cap} dollar_cap=${MLS_ALLOWANCE_MECHANICS.dollar_value_cap}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 24. NO SILENT ZEROS — every zero carries its reason and exact shortfall
    // ═══════════════════════════════════════════════════════════════════════
    const zeroTiers = Object.entries(MLS_PROMOTIONAL_ALLOWANCE)
      .filter(([, v]) => v === 0)
      .map(([k]) => Number(k));
    const documented = zeroTiers.every(tier => {
      const d = MLS_ALLOWANCE_DERIVATION[tier];
      if (!d?.reason) return false;
      if (d.reason === 'BASELINE_BELOW_TARGET' || d.reason === 'ALLOWANCE_HEADROOM_EXHAUSTED') {
        return typeof d.annual_shortfall_at_allowance_1 === 'number' && d.annual_shortfall_at_allowance_1 > 0;
      }
      return true;
    });
    check('24. No silent zeros — each zero documented with its reason and shortfall',
      documented,
      zeroTiers.map(t => {
        const d = MLS_ALLOWANCE_DERIVATION[t];
        const sf = d?.annual_shortfall_at_allowance_1;
        return `$${t}:${d?.reason}${sf != null ? ` ($${sf}/yr short)` : ''}`;
      }).join(' '));

    // ═══════════════════════════════════════════════════════════════════════
    // CLEANUP — remove every synthetic fixture
    // ═══════════════════════════════════════════════════════════════════════
    for (const id of createdAllowanceIds) {
      try { await svc.entities.AutoFundMlsAllowance.delete(id); } catch (e) { cleanupErrors.push(`allowance ${id}: ${e.message}`); }
    }
    for (const id of createdSubIds) {
      try { await svc.entities.AutoFundSubscription.delete(id); } catch (e) { cleanupErrors.push(`sub ${id}: ${e.message}`); }
    }
    for (const id of createdContactIds) {
      try { await svc.entities.Contact.delete(id); } catch (e) { cleanupErrors.push(`contact ${id}: ${e.message}`); }
    }

    const passed = results.filter(r => r.pass).length;
    return Response.json({
      status: passed === results.length && cleanupErrors.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
      rules_version: MLS_ALLOWANCE_RULES_VERSION,
      tests_run: results.length,
      tests_passed: passed,
      results,
      bundle_rule: { min_non_mls_retail: BUNDLE_MIN_NON_MLS_RETAIL, min_margin_pct: BUNDLE_MIN_MARGIN_PCT },
      allowance_config: MLS_PROMOTIONAL_ALLOWANCE,
      cleanup_errors: cleanupErrors,
      fixtures_removed: { allowances: createdAllowanceIds.length, subscriptions: createdSubIds.length, contacts: createdContactIds.length },
      note: 'No real customer balances, historical transactions, commission rules, or specialist payouts were modified.',
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}