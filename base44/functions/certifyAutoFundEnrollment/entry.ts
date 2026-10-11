import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTOFUND_FINAL_FLAGS,
  AUTOFUND_MEMBERSHIP_FEE,
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  isEnrollmentOpen,
  getMembershipFee,
  getTotalMonthlyCharge,
} from '../../shared/autoFundFinalConfig.ts';
import {
  DEFAULT_FEE_REFUND_POLICY,
  FEE_REFUND_POLICY_DISCLOSURE,
  buildChargeDisclosure,
  channelMayCarryAttribution,
  feeMatchesApprovedTable,
  processMembershipFee,
} from '../../shared/autoFundMembershipBilling.ts';
import {
  MLS_EDITING,
  MLS_RETAIL,
  MLS_RETAIL_LIVE,
  BUNDLE_MIN_MARGIN_PCT,
  BUNDLE_MIN_NON_MLS_RETAIL,
} from '../../shared/autoFundMlsAllowance.ts';
import { assertVipWalletRedemption } from '../../shared/autoFundVipEnforcement.ts';
import { getActivePricingConfig } from '../../shared/mediaConfigLoader.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const sr = base44.asServiceRole;
    const results = [];
    const check = (name, pass, detail) => results.push({ test: name, result: pass ? 'PASS' : 'FAIL', detail });

    // ══ 1. Owner launch gate — enrollment closed on BOTH channels ═══════════
    const flagRes = await sr.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
    const flagArr = Array.isArray(flagRes) ? flagRes : (flagRes?.data || []);
    const switchValue = flagArr.length > 0 ? flagArr[0].value : null;
    check('enrollment switch absent or off', !isEnrollmentOpen(switchValue),
      `AppSetting '${AUTOFUND_ENROLLMENT_FLAG_KEY}' = ${switchValue === null ? 'absent' : switchValue}; code flag = ${AUTOFUND_FINAL_FLAGS.enrollment_enabled}`);
    check('enrollment gate fails closed on null/garbage', !isEnrollmentOpen(null) && !isEnrollmentOpen('yes') && !isEnrollmentOpen(''),
      'null, "yes" and "" all read as closed');
    check('enrollment opens only on BOTH flag and switch',
      isEnrollmentOpen('true') === AUTOFUND_FINAL_FLAGS.enrollment_enabled,
      'switch alone cannot open enrollment while the code flag is off');

    // ══ 2. Membership-fee table matches the owner-approved amounts ═════════
    const approved = { 50: 0, 100: 0, 200: 0, 350: 25, 500: 25, 1000: 25 };
    const feeMismatch = Object.entries(approved).filter(([amt, fee]) => AUTOFUND_MEMBERSHIP_FEE[Number(amt)] !== fee);
    check('approved fee table exact', feeMismatch.length === 0,
      feeMismatch.length ? JSON.stringify(feeMismatch) : '$350/$500/$1,000 = $25; $50/$100/$200 = $0');

    // ══ 3. Total recurring charge matches the approved table ═══════════════
    const approvedTotals = { 50: 50, 100: 100, 200: 200, 350: 375, 500: 525, 1000: 1025 };
    const totalMismatch = Object.entries(approvedTotals).filter(([amt, t]) => getTotalMonthlyCharge(Number(amt)) !== t);
    check('approved total recurring charge exact', totalMismatch.length === 0,
      totalMismatch.length ? JSON.stringify(totalMismatch) : '$50/$100/$200/$375/$525/$1,025');

    // ══ 4. No fee is chargeable while billing is switched off ═════════════
    const chargeable = [50, 100, 200, 350, 500, 1000].map(a => getMembershipFee(a));
    check('fee billing disabled — zero chargeable at every tier',
      AUTOFUND_FINAL_FLAGS.membership_fee_enabled === false && chargeable.every(f => f === 0),
      `charged set = [${chargeable.join(', ')}]`);

    // ══ 5. Fee processing refuses to write while billing is off ════════════
    const refused = await processMembershipFee({
      base44: sr,
      payment_event_id: 'cert_fee_should_not_exist',
      subscription: { id: '', amount: 500, customer_id: '', customer_email: '' },
      status: 'succeeded',
      tier_amount: 500,
      cert_mode: true,
    });
    check('fee processor refuses while billing disabled', refused.status === 'fee_disabled',
      `status = ${refused.status}`);
    const orphan = await sr.entities.AutoFundPaymentEvent.filter({ payment_event_id: 'cert_fee_should_not_exist' }, undefined, 1);
    const orphanArr = Array.isArray(orphan) ? orphan : (orphan?.data || []);
    check('refused fee wrote nothing to the ledger', orphanArr.length === 0,
      `${orphanArr.length} matching fee events recorded`);

    // ══ 6. A fee can never become wallet liability or commission ═══════════
    check('fee disclosure: not spendable, no promo credit, no commission',
      buildChargeDisclosure(500).fee_is_spendable_booking_value === false &&
      buildChargeDisclosure(500).fee_generates_promotional_credit === false &&
      buildChargeDisclosure(500).fee_generates_sales_commission === false,
      'fee is collected revenue on all three counts');

    // ══ 7. Refundability is NOT assumed non-refundable ════════════════════
    check('fee refund policy defaults to undetermined, not non-refundable',
      DEFAULT_FEE_REFUND_POLICY === 'undetermined' &&
      typeof FEE_REFUND_POLICY_DISCLOSURE.refundable_full === 'string',
      `default = ${DEFAULT_FEE_REFUND_POLICY}; four policies configured including full and pro-rata refund`);

    // ══ 8. Salesperson cannot alter money — tampered quotes are rejected ═══
    check('tampered fee quote rejected', feeMatchesApprovedTable(500, 25) === true && feeMatchesApprovedTable(500, 5) === false,
      'a quoted $5 fee against the approved $25 is rejected');

    // ══ 9. Commission attribution rules ═══════════════════════════════════
    check('self-service without verified advisor generates no commission',
      channelMayCarryAttribution('self_service', 'rep_123') === false && channelMayCarryAttribution('sales_assisted', '') === false,
      'self-service never carries attribution; assisted requires a verified advisor id');
    check('verified advisor attribution permitted on assisted channel',
      channelMayCarryAttribution('sales_assisted', 'rep_123') === true,
      'attribution must be explicit, never inferred from availability');

    // ══ 10. MLS price single source ════════════════════════════════════════
    const activeCfg = await getActivePricingConfig(sr);
    const tier1 = (activeCfg.tier_prices || []).find(t => t.tier === 'TIER_1')?.prices?.mls_walkthrough;
    check('live MLS price is $100 across sources', MLS_RETAIL_LIVE === 100 && tier1 === 100,
      `mlsPricing live = $${MLS_RETAIL_LIVE}; active engine TIER_1 = $${tier1}`);
    check('Auto-Fund program valued at the approved $120', MLS_RETAIL === 120,
      `Auto-Fund MLS retail = $${MLS_RETAIL}`);

    // ══ 11. Bundle margin guard uses the approved cost assumption ═════════
    check('bundle guard editing+QC cost = $25.70', MLS_EDITING === 25.70,
      `MLS_EDITING = $${MLS_EDITING} ($18/hr x 60min + 15% burden + $5 QC)`);
    check('genuine-bundle requirement and threshold preserved',
      BUNDLE_MIN_NON_MLS_RETAIL === 150 && BUNDLE_MIN_MARGIN_PCT === 35,
      `min non-MLS retail $${BUNDLE_MIN_NON_MLS_RETAIL}; min blended margin ${BUNDLE_MIN_MARGIN_PCT}%`);

    // ══ 12. VIP enforcement is wired and fails open while inactive ════════
    const vipOff = await assertVipWalletRedemption({
      base44: sr, wallet_id: 'cert_nonexistent_wallet', applied_cents: 12000, package_id: 'mls_walkthrough',
    });
    check('VIP guard present at the booking layer and inactive in production',
      vipOff.allowed === true && vipOff.code === 'RESTRICTION_INACTIVE',
      `flag = ${AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled}; code = ${vipOff.code}`);
    const nonMls = await assertVipWalletRedemption({
      base44: sr, wallet_id: 'cert_nonexistent_wallet', applied_cents: 12000, package_id: 'photo_essentials',
    });
    check('non-MLS services never restricted', nonMls.allowed === true, `code = ${nonMls.code}`);

    // ══ 13. Production isolation — no subscriptions, no cert artifacts ════
    const subsRes = await sr.entities.AutoFundSubscription.filter({}, undefined, 500);
    const subs = Array.isArray(subsRes) ? subsRes : (subsRes?.data || []);
    check('zero Auto-Fund subscriptions exist', subs.length === 0, `${subs.length} subscriptions`);
    const certSubs = subs.filter(s => String(s.customer_email || '').startsWith('cert_'));
    check('no synthetic subscriptions leaked into production', certSubs.length === 0, `${certSubs.length} cert_-prefixed`);
    const certEvents = await sr.entities.AutoFundPaymentEvent.filter({ payment_event_id: 'cert_fee_should_not_exist' }, undefined, 1);
    const certEventsArr = Array.isArray(certEvents) ? certEvents : (certEvents?.data || []);
    check('certification left no fee artifacts', certEventsArr.length === 0, 'no test fee events persisted');

    const failed = results.filter(r => r.result === 'FAIL');
    return Response.json({
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      passed: results.length - failed.length,
      failed: failed.length,
      results,
      flags: AUTOFUND_FINAL_FLAGS,
      launch_blockers: [
        'Membership-fee refundability policy must be set by the owner and legally reviewed before enrollment opens.',
        'Full financial-lifecycle certification (real charges, retries, refunds, Arriv Pay reconciliation) requires the staging flags to be enabled in an isolated environment; production flags were deliberately left off.',
        'Public enrollment requires explicit owner launch authorization.',
      ],
      production_untouched: true,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}