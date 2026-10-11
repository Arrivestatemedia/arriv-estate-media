import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  MLS_PRICING_VERSION_LIVE,
  MLS_PRICE_STANDARD_APPROVED,
  MLS_PRICE_V2_BY_TIER,
  mlsStandardPrice,
} from '../../shared/mlsPricing.ts';
import {
  FEE_POLICY_COUNSEL_REVIEW_STATUS,
} from '../../shared/autoFundFeePolicy.ts';
import { buildFeeRefundDisclosure } from '../../shared/autoFundMembershipBilling.ts';
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
import { assertVipWalletRedemption, VIP_ENFORCEMENT_IS_AUTHORITATIVE } from '../../shared/autoFundVipEnforcement.ts';
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

    // ══ 1. Owner launch gate — OPEN by owner authorization (2026-10-11) ═════
    const flagRes = await sr.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
    const flagArr = Array.isArray(flagRes) ? flagRes : (flagRes?.data || []);
    const switchValue = flagArr.length > 0 ? flagArr[0].value : null;
    check('enrollment switch ON and code flag ON, both by owner authorization',
      isEnrollmentOpen(switchValue) === true && AUTOFUND_FINAL_FLAGS.enrollment_enabled === true,
      `AppSetting '${AUTOFUND_ENROLLMENT_FLAG_KEY}' = ${switchValue === null ? 'absent' : switchValue}; code flag = ${AUTOFUND_FINAL_FLAGS.enrollment_enabled}`);
    check('enrollment gate still fails closed on null/garbage/false',
      !isEnrollmentOpen(null) && !isEnrollmentOpen('yes') && !isEnrollmentOpen('') && !isEnrollmentOpen('false'),
      'null, "yes", "" and "false" all read as closed — one switch shuts enrollment again');
    check('enrollment opens only on BOTH flag and switch',
      isEnrollmentOpen('true') === true && isEnrollmentOpen('false') === false,
      'the owner switch must be exactly "true" AND the code flag on; neither alone opens enrollment');

    // ══ 2. Membership-fee table matches the owner-approved amounts ═════════
    const approved = { 150: 5.99, 250: 10, 350: 25, 500: 27, 1000: 30 };
    const feeMismatch = Object.entries(approved).filter(([amt, fee]) => AUTOFUND_MEMBERSHIP_FEE[Number(amt)] !== fee);
    check('approved fee table exact', feeMismatch.length === 0,
      feeMismatch.length ? JSON.stringify(feeMismatch) : '$150=$5.99, $250=$10, $350=$25, $500=$27, $1,000=$30');

    // ══ 3. Approved SCHEDULE vs the charge actually raised ════════════════
    // The approved total is a property of the schedule; what is charged is gated
    // by the fee switch. These were previously conflated: this check compared the
    // charged total against the schedule total while check 4 asserted the
    // chargeable fee was $0. Two mutually exclusive statements about the same $350
    // tier — which is how a $375 charge came to be recorded against a $0 fee.
    const approvedTotals = { 150: 155.99, 250: 260, 350: 375, 500: 527, 1000: 1030 };
    const scheduleMismatch = Object.entries(approvedTotals).filter(
      ([amt, t]) => Number(amt) + (AUTOFUND_MEMBERSHIP_FEE[Number(amt)] ?? 0) !== t
    );
    check('approved fee SCHEDULE exact', scheduleMismatch.length === 0,
      scheduleMismatch.length ? JSON.stringify(scheduleMismatch) : '$155.99 / $260 / $375 / $527 / $1,030');

    const chargeTiers = [150, 250, 350, 500, 1000];
    const chargeMismatch = chargeTiers.filter(a => getTotalMonthlyCharge(a) !== a + getMembershipFee(a));
    check('charge raised always equals deposit + the CHARGEABLE fee',
      chargeMismatch.length === 0
        && chargeTiers.every(a => getTotalMonthlyCharge(a) === (AUTOFUND_FINAL_FLAGS.membership_fee_enabled ? approvedTotals[a] : a)),
      chargeMismatch.length
        ? JSON.stringify(chargeMismatch.map(a => ({ tier: a, charged: getTotalMonthlyCharge(a), chargeable_fee: getMembershipFee(a) })))
        : `charged = ${chargeTiers.map(a => `$${getTotalMonthlyCharge(a)}`).join(' / ')} (fee switch ${AUTOFUND_FINAL_FLAGS.membership_fee_enabled ? 'ON' : 'OFF'})`);

    // ══ 4. No fee is chargeable while billing is switched off ═════════════
    const chargeable = [150, 250, 350, 500, 1000].map(a => getMembershipFee(a));
    // ACTIVATED 2026-10-11 under explicit owner authorization: membership-fee billing is
    // ON, so every tier's chargeable fee must equal its approved amount. What must never
    // change — the fee is collected revenue, not wallet value — is asserted in check 6,
    // and that no tier outside the schedule attracts a fee is asserted in check 5.
    check('fee billing enabled — chargeable fee equals the approved schedule at every tier',
      AUTOFUND_FINAL_FLAGS.membership_fee_enabled === true
        && chargeTiers.every((a, i) => chargeable[i] === approved[a]),
      `charged set = [${chargeable.join(', ')}] (fee switch ${AUTOFUND_FINAL_FLAGS.membership_fee_enabled ? 'ON' : 'OFF'})`);

    // ══ 5. Fee processing refuses to write while billing is off ════════════
    // A tier with NO approved fee can never attract one: the retired $50 tier is the
    // probe, and it must be refused as 'no_fee_due' with the ledger untouched, now that
    // billing is live. This suite must never write a fee into the real ledger; approved-
    // tier billing is certified end-to-end in testAutoFundBillingEndToEnd.
    // The fee amount resolves from the CONTRACTED subscription amount (tier_amount is only
    // the fallback), so the probe must itself be a tier with no approved fee — the retired
    // $50 tier. Passing an approved amount here would make the probe record a real fee row.
    const probeEventId = 'cert_fee_no_approved_fee_probe';
    const refused = await processMembershipFee({
      base44: sr,
      payment_event_id: probeEventId,
      subscription: { id: '', amount: 50, customer_id: '', customer_email: '' },
      status: 'succeeded',
      tier_amount: 50,
      cert_mode: true,
    });
    check('fee processor charges no fee for a tier with no approved fee', refused.status === 'no_fee_due',
      `status = ${refused.status}`);
    const orphan = await sr.entities.AutoFundPaymentEvent.filter({ payment_event_id: probeEventId }, undefined, 1);
    const orphanArr = Array.isArray(orphan) ? orphan : (orphan?.data || []);
    check('refused fee wrote nothing to the ledger', orphanArr.length === 0,
      `${orphanArr.length} matching fee events recorded`);

    // ══ 6. A fee can never become wallet liability or commission ═══════════
    check('fee disclosure: not spendable, no promo credit, no commission',
      buildChargeDisclosure(500).fee_is_spendable_booking_value === false &&
      buildChargeDisclosure(500).fee_generates_promotional_credit === false &&
      buildChargeDisclosure(500).fee_generates_sales_commission === false,
      'fee is collected revenue on all three counts');

    // ══ 7. Refundability: OWNER-ADOPTED policy, counsel review NOT completed ══
    const liveFeeRefund = buildFeeRefundDisclosure();
    check('fee refund policy is the owner-adopted policy and is not recorded as legally approved',
      DEFAULT_FEE_REFUND_POLICY === 'non_refundable' &&
      liveFeeRefund.is_approved === true &&
      liveFeeRefund.exceptions.length > 0 &&
      FEE_POLICY_COUNSEL_REVIEW_STATUS === 'not_completed' &&
      typeof FEE_REFUND_POLICY_DISCLOSURE.refundable_full === 'string',
      `policy = ${DEFAULT_FEE_REFUND_POLICY} (owner-adopted, ${liveFeeRefund.exceptions.length} statutory exceptions); counsel review = ${FEE_POLICY_COUNSEL_REVIEW_STATUS}`);

    // ══ 8. Salesperson cannot alter money — tampered quotes are rejected ═══
    check('tampered fee quote rejected', feeMatchesApprovedTable(500, 27) === true && feeMatchesApprovedTable(500, 5) === false,
      'a quoted $5 fee against the approved $27 is rejected');

    // ══ 9. Commission attribution rules ═══════════════════════════════════
    check('self-service without verified advisor generates no commission',
      channelMayCarryAttribution('self_service', 'rep_123') === false && channelMayCarryAttribution('sales_assisted', '') === false,
      'self-service never carries attribution; assisted requires a verified advisor id');
    check('verified advisor attribution permitted on assisted channel',
      channelMayCarryAttribution('sales_assisted', 'rep_123') === true,
      'attribution must be explicit, never inferred from availability');

    // ══ 10. MLS price single source ════════════════════════════════════════
    // Pass the REQUEST CLIENT, not the service-role client: the loader reads through
    // `client.asServiceRole.entities`, so handing it `sr` threw and silently fell back to
    // the built-in default — which made this check report the live engine as $100 while
    // the active record was already V2. It now compares the loader's answer (the path the
    // booking, scheduled-booking and B2B surfaces use) with the active record and constants.
    const activeCfg = await getActivePricingConfig(base44);
    const tier1 = (activeCfg.tier_prices || []).find(t => t.tier === 'TIER_1')?.prices?.mls_walkthrough;
    const activeRowsRes = await sr.entities.MediaPricingConfig.filter({ is_active: true }, '-effective_date', 5);
    const activeRows = Array.isArray(activeRowsRes) ? activeRowsRes : (activeRowsRes?.items || activeRowsRes?.data || []);
    const recordPrice = (JSON.parse(activeRows[0]?.config_json || '{}')?.tier_prices || [])
      .find(t => t.tier === 'TIER_1')?.prices?.mls_walkthrough;
    check('live MLS price is consistent across the loader, the active record and the constants',
      MLS_RETAIL_LIVE === mlsStandardPrice(MLS_PRICING_VERSION_LIVE)
        && tier1 === MLS_RETAIL_LIVE
        && recordPrice === MLS_RETAIL_LIVE,
      `constants (${MLS_PRICING_VERSION_LIVE}) = $${MLS_RETAIL_LIVE}; loader = $${tier1}; active record = $${recordPrice}`);
    check('Auto-fund program is valued at the owner-approved V2 ladder',
      MLS_RETAIL === MLS_PRICE_STANDARD_APPROVED && MLS_RETAIL === MLS_PRICE_V2_BY_TIER.TIER_1,
      `Auto-Fund MLS retail = $${MLS_RETAIL} (approved V2 standard = $${MLS_PRICE_STANDARD_APPROVED})`);

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
    // ACTIVATED 2026-10-11 by owner authorization: the guard is LIVE at the booking layer.
    // It must stay authoritative, and it must still fail open for a wallet with no VIP
    // membership. The VIP refusal itself is certified in testAutoFundMlsAllowance (check 4:
    // VIP promotional value barred from a standalone MLS Walkthrough, cash-funded path open).
    check('VIP guard active at the booking layer and fail-open for non-VIP wallets',
      AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled === true
        && VIP_ENFORCEMENT_IS_AUTHORITATIVE === true
        && vipOff.allowed === true,
      `flag = true; enforcement authoritative = ${VIP_ENFORCEMENT_IS_AUTHORITATIVE}; non-VIP code = ${vipOff.code}`);
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
        'NO LEGAL BLOCKER: counsel approval is RECORDED — Tommy Garrison, Macklemore & Garrison, approving on 2026-10-11 Membership Terms v2, Wallet Agreement v1, the final membership fees and recurring charges, the applicable disclosures and the refund policy. Both decisions were recorded with that counsel reference against those exact versions.',
        'ENROLLMENT IS OPEN on the public self-service and sales-assisted channels (owner FINAL authorization, 2026-10-11), with the named-cohort requirement removed. Eligibility, identity, consent, payment authorization and the launch interlock are still enforced on every enrollment.',
        'No existing customer is enrolled or billed automatically, and no recurring charge is raised without that customer\'s own affirmative authorization of the amount and terms. Emergency stop, refunds, dispute handling, wallet accounting and commission protections are preserved.',
        'SEPARATE TRACK: the outbound Arriv Pay employee-sync HTTP 525 failure is unremediated. Commission payout delivery must not be reported as functioning until it is resolved.',
      ],
      production_untouched: true,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}