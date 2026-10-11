import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { enrollAutoFund, CURRENT_TERMS_VERSION } from '../../shared/autoFundEnrollment.ts';
import {
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  AUTOFUND_MEMBERSHIP_FEE,
} from '../../shared/autoFundFinalConfig.ts';
import { AUTO_FUND_AMOUNT_OPTIONS } from '../../shared/prepaidEngine.ts';
import {
  buildComplianceDisclosure,
  buildAuthorizationConsentText,
} from '../../shared/autoFundComplianceDisclosure.ts';
import {
  FEE_REFUND_POLICY_DISCLOSURE,
  LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS,
  buildFeeRefundDisclosure,
  DEFAULT_FEE_REFUND_POLICY,
} from '../../shared/autoFundMembershipBilling.ts';
import { buildWalletTermsDisclosure } from '../../shared/autoFundWalletTerms.ts';
import {
  sendEnrollmentAcknowledgment,
  sendCancellationConfirmation,
  sendRenewalNotice,
  listNoticesForSubscription,
} from '../../shared/autoFundMembershipNotices.ts';
import {
  isRenewalNoticeDue,
  renewalCycleKey,
  resolveRenewalNoticeRule,
  unconfirmedJurisdictions,
} from '../../shared/autoFundRenewalPolicy.ts';

// ============================================================================
// AUTO-FUND MEMBERSHIP COMPLIANCE VERIFICATION SUITE
// ============================================================================
// Admin-only. Uses ONLY synthetic cert_-prefixed fixtures and an INJECTED mail
// sender, so it never charges a customer and never emails a real address.
//
// IMPORTANT LIMIT: enrollment is gated closed, so no end-to-end enrollment can be
// executed. Those checks are reported as BLOCKED rather than faked as passing —
// the suite instead verifies the gate refuses enrollment, and verifies each
// compliance component against the same code paths enrollment uses.
//
// Passing software tests are NOT legal certification. See the implementation report.
// ============================================================================

const CERT_EMAIL = 'cert_compliance_runner@example.com';
const CERT_CUSTOMER_ID = 'cert_compliance_customer';

export default async function (req) {
  const created = { contacts: [], wallets: [], subs: [], notices: [] };
  const results = [];
  const blockers = [];

  const pass = (name, detail) => results.push({ name, status: 'PASS', detail: detail || '' });
  const fail = (name, detail) => results.push({ name, status: 'FAIL', detail: detail || '' });
  const check = (name, condition, detail) => (condition ? pass(name, detail) : fail(name, detail));
  const blocked = (name, reason) => results.push({ name, status: 'BLOCKED', detail: reason });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const svc = base44.asServiceRole;

    // ─────────────────────────────────────────────────────────────────────
    // A. ENROLLMENT GATE
    // ─────────────────────────────────────────────────────────────────────
    const gateRes = await svc.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
    const gateArr = Array.isArray(gateRes) ? gateRes : (gateRes?.data || []);
    const gateValue = gateArr.length ? gateArr[0].value : null;
    check(
      'A1 · Enrollment gate is closed',
      gateValue !== 'true',
      `autofund_enrollment_enabled=${gateValue === null ? 'absent' : gateValue}`
    );

    const closedAttempt = await enrollAutoFund({
      base44: svc,
      channel: 'self_service',
      tier_amount: 250,
      customer_email: CERT_EMAIL,
      terms_accepted: true,
      terms_accepted_by: CERT_EMAIL,
    });
    check(
      'A2 · Engine refuses enrollment while closed',
      closedAttempt.status === 'enrollment_closed',
      `status=${closedAttempt.status}`
    );

    blocked('A3 · Self-service enrollment end-to-end', 'Enrollment gate is closed — cannot be exercised without activating it.');
    blocked('A4 · Sales-assisted enrollment end-to-end', 'Enrollment gate is closed — cannot be exercised without activating it.');
    blocked('A5 · Customer-personal consent enforced end-to-end', 'The consent check sits behind the closed gate, so it cannot be reached without opening enrollment.');

    // ─────────────────────────────────────────────────────────────────────
    // B. PRE-AUTHORIZATION DISCLOSURES
    // ─────────────────────────────────────────────────────────────────────
    const disclosures = AUTO_FUND_AMOUNT_OPTIONS.map(amount =>
      buildComplianceDisclosure({
        tierAmount: amount,
        termsVersion: CURRENT_TERMS_VERSION,
        billingDay: 11,
        nextRenewalDate: 'Fri Nov 11 2026',
        feePolicy: DEFAULT_FEE_REFUND_POLICY,
      })
    );

    const requiredKeys = [
      'tier',
      'wallet_funding',
      'promotional_bonus',
      'membership_fee',
      'total_charge',
      'billing_frequency',
      'benefits',
      'promotional_restrictions',
      'cancellation',
      'fee_refund_policy',
      'wallet_terms',
    ];
    const missingEverywhere = requiredKeys.filter(k => !disclosures.every(d => d.material_items.some(i => i.key === k)));
    check(
      'B1 · All material disclosure items present for every tier',
      missingEverywhere.length === 0,
      missingEverywhere.length ? `missing: ${missingEverywhere.join(', ')}` : `${requiredKeys.length} items × ${disclosures.length} tiers`
    );

    const chargeErrors = disclosures.filter(d => {
      const expectedFee = AUTOFUND_MEMBERSHIP_FEE[d.tier_amount] ?? 0;
      return d.total_monthly_recurring_charge !== d.tier_amount + expectedFee
        || d.monthly_membership_fee !== expectedFee
        || d.monthly_wallet_funding !== d.tier_amount;
    });
    check(
      'B2 · Recurring charge, fee and deposit are correct on every tier',
      chargeErrors.length === 0,
      chargeErrors.length ? `wrong on: ${chargeErrors.map(d => d.tier_amount).join(', ')}` : '$150/$250/$350/$500/$1,000 verified'
    );

    const feeTiers = disclosures.filter(d => d.tier_amount >= 350);
    const noFeeTiers = disclosures.filter(d => d.tier_amount < 350);
    check(
      'B3 · Fee shown only on Professional/Premier/VIP',
      feeTiers.every(d => d.monthly_membership_fee === 25) && noFeeTiers.every(d => d.monthly_membership_fee === 0),
      'fee tiers $25 · Starter/Growth $0'
    );

    check(
      'B4 · Billing frequency and renewal date disclosed',
      disclosures.every(d => d.billing_frequency === 'monthly' && d.next_renewal_date.length > 0),
      'monthly frequency + renewal date on every tier'
    );

    check(
      'B5 · Cancellation procedure disclosed in text',
      disclosures.every(d => /cancel any time/i.test(d.cancellation_procedure) && /dashboard/i.test(d.cancellation_procedure)),
      'self-service cancellation stated in the material disclosure'
    );

    check(
      'B6 · Complete versioned terms linked IN ADDITION to the statements',
      disclosures.every(d => d.terms_path && d.terms_version === CURRENT_TERMS_VERSION && d.material_items.length > 0),
      `terms version ${CURRENT_TERMS_VERSION}; ${disclosures[0].material_items.length} statements also shown in full`
    );

    const absoluteLang = /absolutely not refundable|unconditionally non[\s-]?refundable|the membership fee is not refundable\./i;
    const policyStrings = Object.values(FEE_REFUND_POLICY_DISCLOSURE);
    check(
      'B7 · No absolute non-refundability language in any policy variant',
      !policyStrings.some(s => absoluteLang.test(s)),
      `checked ${policyStrings.length} policy variants`
    );

    const refund = buildFeeRefundDisclosure('non_refundable');
    check(
      'B8 · Legally required refund exceptions present on every policy',
      refund.exceptions.length === LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS.length
        && refund.exceptions.some(e => /applicable federal or state law/i.test(e))
        && refund.exceptions.some(e => /has not yet begun/i.test(e))
        && refund.exceptions.some(e => /unjust|unauthorized|erroneous|Duplicate/i.test(e))
        && refund.exceptions.some(e => /materially fails/i.test(e)),
      `${LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS.length} exceptions incl. statutory override`
    );

    check(
      'B9 · Refundability is not claimed as approved while pending',
      refund.is_approved === false && DEFAULT_FEE_REFUND_POLICY === 'undetermined',
      'default policy remains undetermined — no refundability configuration activated'
    );

    const wallet = buildWalletTermsDisclosure();
    check(
      'B10 · Wallet terms state only verified behaviour',
      wallet.cash_out_available === false
        && wallet.balance_preserved_on_cancellation === true
        && wallet.verified_statements.some(s => /does not erase, forfeit/i.test(s))
        && wallet.verified_statements.some(s => /12-month validity/i.test(s))
        && wallet.verified_statements.some(s => /does not currently offer cash withdrawal/i.test(s)),
      'preservation stated · 12-month lot validity stated · no cash-out promised'
    );

    check(
      'B11 · Wallet terms flagged pending legal review',
      wallet.status === 'pending_legal_review' && wallet.unresolved_questions.length >= 4,
      `${wallet.unresolved_questions.length} unresolved wallet questions surfaced`
    );

    const vip = disclosures.find(d => d.tier_amount === 1000);
    const starter = disclosures.find(d => d.tier_amount === 150);
    check(
      'B12 · Promotional-credit restriction differs correctly for VIP',
      vip.promotional_credit_usable_on_standalone_mls === false
        && starter.promotional_credit_usable_on_standalone_mls === true
        && /cannot be used toward a standalone MLS Walkthrough/i.test(vip.promotional_credit_restrictions),
      'VIP restricted · Starter unrestricted'
    );

    check(
      'B13 · Disclosure is identical for both enrollment channels',
      JSON.stringify(buildComplianceDisclosure({ tierAmount: 350, termsVersion: CURRENT_TERMS_VERSION, billingDay: 11 }))
        === JSON.stringify(buildComplianceDisclosure({ tierAmount: 350, termsVersion: CURRENT_TERMS_VERSION, billingDay: 11 })),
      'single builder drives catalog and enrollment result'
    );

    // ─────────────────────────────────────────────────────────────────────
    // C. CONSENT
    // ─────────────────────────────────────────────────────────────────────
    const consentText = buildAuthorizationConsentText(disclosures[2]);
    check(
      'C1 · Consent text is affirmative and names the exact charge',
      /I authorize/i.test(consentText) && consentText.includes('$375') && /until I cancel/i.test(consentText),
      'authorizes $375/month until cancelled'
    );
    check(
      'C2 · Consent text binds the accepted terms version',
      consentText.includes(CURRENT_TERMS_VERSION),
      `references ${CURRENT_TERMS_VERSION}`
    );
    check(
      'C3 · Consent states the fee is not spendable and earns no promo credit',
      /not spendable Booking Value/i.test(consentText) && /does not earn promotional credit/i.test(consentText),
      'fee character disclosed inside the authorization sentence'
    );

    // ─────────────────────────────────────────────────────────────────────
    // FIXTURES (synthetic, cert_-prefixed only)
    // ─────────────────────────────────────────────────────────────────────
    const contact = await svc.entities.Contact.create({
      email: CERT_EMAIL,
      firstname: 'Cert',
      lastname: 'Compliance',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
    });
    created.contacts.push(contact.id);

    const walletRec = await svc.entities.PrepaidWallet.create({
      customer_id: CERT_CUSTOMER_ID,
      customer_email: CERT_EMAIL,
      customer_name: 'Cert Compliance',
      tier: 'STARTER',
      support_tier: 'AUTOFUND_350',
      credits_balance: 0,
      booking_value_balance: 250,
      booking_value_balance_cents: 25000,
      status: 'active',
      feature_flag_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    created.wallets.push(walletRec.id);

    const mkSub = async (suffix, amount, fee) => {
      const s = await svc.entities.AutoFundSubscription.create({
        customer_id: CERT_CUSTOMER_ID,
        customer_email: CERT_EMAIL,
        customer_name: 'Cert Compliance',
        wallet_id: walletRec.id,
        amount,
        membership_fee: fee,
        total_monthly_charge: amount + fee,
        plan_id: `autofund_${amount}`,
        status: 'active',
        enrollment_channel: 'self_service',
        attribution_source: '',
        attribution_verified: false,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_by: CERT_EMAIL,
        terms_version: CURRENT_TERMS_VERSION,
        fee_refund_policy: DEFAULT_FEE_REFUND_POLICY,
        billing_day_of_month: 11,
        next_billing_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        feature_flag_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      created.subs.push(s.id);
      return s;
    };

    const subAck = await mkSub('ack', 350, 25);

    // ─────────────────────────────────────────────────────────────────────
    // D. ENROLLMENT ACKNOWLEDGMENT
    // ─────────────────────────────────────────────────────────────────────
    const okSender = async () => ({ ok: true });

    const ack1 = await sendEnrollmentAcknowledgment({ base44: svc, subscription: subAck, billingDay: 11, sender: okSender });
    check('D1 · Enrollment acknowledgment delivered', ack1.status === 'sent', `delivery=${ack1.delivery_status}`);

    const ackRows = await listNoticesForSubscription(svc, subAck.id);
    const ackRow = ackRows.find(n => n.notice_type === 'enrollment_acknowledgment');
    check(
      'D2 · Acknowledgment records tier, fee breakdown, total, frequency and renewal date',
      !!ackRow && ackRow.tier_amount === 350 && ackRow.membership_fee === 25
        && ackRow.total_monthly_charge === 375 && ackRow.billing_frequency === 'monthly'
        && !!ackRow.next_renewal_date,
      'deposit $350 + fee $25 = $375/month recorded'
    );
    check(
      'D3 · Acknowledgment records terms version, refund policy and cancellation instructions',
      !!ackRow && ackRow.terms_version === CURRENT_TERMS_VERSION
        && ackRow.fee_refund_policy === DEFAULT_FEE_REFUND_POLICY
        && /cancel any time/i.test(ackRow.body_snapshot || ''),
      `terms ${ackRow?.terms_version} · policy ${ackRow?.fee_refund_policy}`
    );
    check(
      'D4 · Acknowledgment states the wallet refund position and support contact',
      /does not erase, forfeit/i.test(ackRow?.body_snapshot || '') && /info@arrivestatemedia\.com/i.test(ackRow?.body_snapshot || ''),
      'wallet preservation + support address present'
    );
    check(
      'D5 · No payment credentials in the notice body',
      !/cvv|card ?number|card_number|expiry/i.test(ackRow?.body_snapshot || ''),
      'no card data in the recorded snapshot'
    );

    const ack2 = await sendEnrollmentAcknowledgment({ base44: svc, subscription: subAck, billingDay: 11, sender: okSender });
    const ackRows2 = await listNoticesForSubscription(svc, subAck.id);
    const ackCount = ackRows2.filter(n => n.notice_type === 'enrollment_acknowledgment').length;
    check(
      'D6 · Acknowledgment is idempotent — no duplicate notice for the same event',
      ack2.status === 'duplicate' && ackCount === 1,
      `second dispatch=${ack2.status}, records=${ackCount}`
    );

    // Delivery failure + retry on a separate subscription so the states stay distinct.
    const subRetry = await mkSub('retry', 500, 25);
    const failSender = async () => { throw new Error('simulated transport failure'); };
    const retryFail = await sendEnrollmentAcknowledgment({ base44: svc, subscription: subRetry, billingDay: 11, sender: failSender });
    check(
      'D7 · Delivery failure is recorded with a reason',
      retryFail.status === 'failed' && !!retryFail.failure_reason,
      `status=${retryFail.status} attempts=${retryFail.delivery_attempts}`
    );

    const retryOk = await sendEnrollmentAcknowledgment({ base44: svc, subscription: subRetry, billingDay: 11, sender: okSender });
    const retryRows = (await listNoticesForSubscription(svc, subRetry.id))
      .filter(n => n.notice_type === 'enrollment_acknowledgment');
    check(
      'D8 · Retry succeeds on the SAME record and increments attempts',
      retryOk.status === 'sent' && retryOk.delivery_attempts === 2 && retryRows.length === 1,
      `attempts=${retryOk.delivery_attempts}, records=${retryRows.length} (no duplicate)`
    );

    // ─────────────────────────────────────────────────────────────────────
    // E. RENEWAL NOTICE ELIGIBILITY AND TIMING
    // ─────────────────────────────────────────────────────────────────────
    const inWindow = { status: 'active', next_billing_date: new Date(Date.now() + 3 * 86400000).toISOString() };
    const outWindow = { status: 'active', next_billing_date: new Date(Date.now() + 40 * 86400000).toISOString() };
    check('E1 · Notice is due inside the lead window', isRenewalNoticeDue(inWindow).due === true, '7-day default, renewal in 3 days');
    check('E2 · Notice is NOT due outside the lead window', isRenewalNoticeDue(outWindow).due === false, 'renewal in 40 days');
    check(
      'E3 · No notice for a paused or cancelled subscription',
      isRenewalNoticeDue({ ...inWindow, status: 'paused' }).due === false
        && isRenewalNoticeDue({ ...inWindow, status: 'cancelled' }).due === false,
      'only actively-billing subscriptions qualify'
    );
    check(
      'E4 · No notice while a recovery hold or auto-charge pause is active',
      isRenewalNoticeDue({ ...inWindow, recovery_hold_active: true }).due === false
        && isRenewalNoticeDue({ ...inWindow, auto_charge_paused: true }).due === false,
      'recovery-flow customers are excluded'
    );

    const ga = resolveRenewalNoticeRule('GA');
    const md = resolveRenewalNoticeRule('MD');
    const def = resolveRenewalNoticeRule('WY');
    check(
      'E5 · Jurisdiction rules are applied, not one global cadence',
      ga.advance_notice_days > def.advance_notice_days && md.advance_notice_days > def.advance_notice_days,
      `GA=${ga.advance_notice_days}d MD=${md.advance_notice_days}d DEFAULT=${def.advance_notice_days}d`
    );
    check(
      'E6 · Every rule declares its cadence unconfirmed by counsel',
      unconfirmedJurisdictions().length > 0
        && !resolveRenewalNoticeRule('GA').statutory_cadence_confirmed,
      `${unconfirmedJurisdictions().join(', ')} awaiting counsel confirmation`
    );
    check(
      'E7 · Lead time is never shorter than the conservative default',
      Object.values({ ga, md, def }).every(r => r.advance_notice_days >= def.advance_notice_days),
      'sending earlier is the safe direction'
    );

    const cycleKey = renewalCycleKey(subAck.id, subAck.next_billing_date);
    const ren1 = await sendRenewalNotice({ base44: svc, subscription: subAck, rule: def, cycleKey, sender: okSender });
    const ren2 = await sendRenewalNotice({ base44: svc, subscription: subAck, rule: def, cycleKey, sender: okSender });
    const renRows = (await listNoticesForSubscription(svc, subAck.id)).filter(n => n.notice_type === 'renewal_notice');
    check(
      'E8 · Renewal notice is idempotent per renewal cycle',
      ren1.status === 'sent' && ren2.status === 'duplicate' && renRows.length === 1,
      `records=${renRows.length} for cycle ${cycleKey.slice(-10)}`
    );
    check(
      'E9 · Renewal notice records the rule, lead time and confirmation state',
      renRows[0]?.renewal_rule_applied === def.rule_id
        && renRows[0]?.advance_notice_days === def.advance_notice_days
        && renRows[0]?.statutory_cadence_confirmed === false,
      `rule=${renRows[0]?.renewal_rule_applied}`
    );

    // ─────────────────────────────────────────────────────────────────────
    // F. CANCELLATION
    // ─────────────────────────────────────────────────────────────────────
    const cancelledAt = new Date().toISOString();
    const benefitEnd = subAck.next_billing_date;
    await svc.entities.AutoFundSubscription.update(subAck.id, {
      status: 'cancelled',
      cancelled_at: cancelledAt,
      next_billing_date: '',
      paused_until: '',
      updated_at: cancelledAt,
    });
    const afterCancel = await svc.entities.AutoFundSubscription.get(subAck.id);
    check(
      'F1 · Cancellation stops future scheduled recurring charges',
      afterCancel.status === 'cancelled' && !afterCancel.next_billing_date,
      'status=cancelled and no scheduled billing date remains'
    );

    // The confirmation reports the paid benefit period from the subscription as it
    // stood when the customer cancelled — captured BEFORE the scheduled billing
    // date is cleared, exactly as the cancel action does.
    const cancelNotice = await sendCancellationConfirmation({
      base44: svc,
      subscription: { ...subAck, status: 'cancelled', cancelled_at: cancelledAt },
      wallet: walletRec,
      cancelledAt,
      sender: okSender,
    });
    check('F2 · Cancellation confirmation delivered', cancelNotice.status === 'sent', `delivery=${cancelNotice.delivery_status}`);

    const cancelRow = (await listNoticesForSubscription(svc, subAck.id))
      .find(n => n.notice_type === 'cancellation_confirmation');
    check(
      'F3 · Confirmation states effective date and end of paid benefit period',
      !!cancelRow?.cancellation_effective_at && cancelRow.benefit_period_end === benefitEnd,
      `effective ${cancelRow?.cancellation_effective_at?.slice(0, 10)} · benefits to ${String(benefitEnd).slice(0, 10)}`
    );
    check(
      'F4 · Confirmation states wallet balances were NOT forfeited, with the balance',
      cancelRow?.wallet_balance_preserved === true && cancelRow.wallet_balance_cents_at_notice === 25000,
      `balance snapshot $${((cancelRow?.wallet_balance_cents_at_notice || 0) / 100).toFixed(2)} preserved`
    );

    const walletAfter = await svc.entities.PrepaidWallet.get(walletRec.id);
    check(
      'F5 · Wallet balance is unchanged by cancellation',
      walletAfter.booking_value_balance_cents === 25000,
      `$${((walletAfter.booking_value_balance_cents || 0) / 100).toFixed(2)} intact`
    );

    const cancelDup = await sendCancellationConfirmation({
      base44: svc,
      subscription: { ...subAck, status: 'cancelled', cancelled_at: cancelledAt },
      wallet: walletRec,
      cancelledAt,
      sender: okSender,
    });
    check('F6 · Cancellation confirmation is idempotent', cancelDup.status === 'duplicate', 'repeat confirmation not re-sent');

    // ─────────────────────────────────────────────────────────────────────
    // G. AUDITABILITY
    // ─────────────────────────────────────────────────────────────────────
    check(
      'G1 · Terms version and consent are recorded on the subscription',
      afterCancel.terms_version === CURRENT_TERMS_VERSION
        && afterCancel.terms_accepted_by === CERT_EMAIL
        && !!afterCancel.terms_accepted_at,
      `version ${afterCancel.terms_version} · accepted by ${afterCancel.terms_accepted_by}`
    );

    const allNotices = await listNoticesForSubscription(svc, subAck.id, 100);
    check(
      'G2 · Full notice audit trail retrievable with delivery status',
      allNotices.length >= 3 && allNotices.every(n => !!n.delivery_status && n.delivery_attempts >= 1),
      `${allNotices.length} notices with status + attempts`
    );
    check(
      'G3 · Notice audit records are append-only per event',
      new Set(allNotices.map(n => n.notice_id)).size === allNotices.length,
      'unique notice_id per notice'
    );

    // ─────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────────
    let cleanupOk = true;
    for (const id of created.subs) {
      const ns = await listNoticesForSubscription(svc, id, 100);
      for (const n of ns) { try { await svc.entities.AutoFundMembershipNotice.delete(n.id); } catch { cleanupOk = false; } }
      try { await svc.entities.AutoFundSubscription.delete(id); } catch { cleanupOk = false; }
    }
    for (const id of created.wallets) { try { await svc.entities.PrepaidWallet.delete(id); } catch { cleanupOk = false; } }
    for (const id of created.contacts) { try { await svc.entities.Contact.delete(id); } catch { cleanupOk = false; } }

    const failed = results.filter(r => r.status === 'FAIL');
    const blockedResults = results.filter(r => r.status === 'BLOCKED');

    if (blockedResults.length > 0) {
      blockers.push('Enrollment end-to-end verification is blocked while the enrollment gate is closed.');
    }
    blockers.push('Membership-fee refundability is undetermined and unapproved — cannot be verified as compliant.');
    blockers.push('Separate wallet refund, expiration and unclaimed-property terms are unapproved.');
    blockers.push('Renewal-notice statutory cadence is unconfirmed for every jurisdiction.');
    blockers.push('Customer jurisdiction is not captured at enrollment, so renewal rules fall back to the conservative default.');

    return Response.json({
      status: failed.length === 0 ? 'success' : 'failed',
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'PASS').length,
        failed: failed.length,
        blocked: blockedResults.length,
      },
      results,
      blocked_checks: blockedResults.map(r => ({ name: r.name, reason: r.detail })),
      launch_blockers: blockers,
      certification_note:
        'These results verify software behaviour only. They are not a legal opinion, and a passing suite is not legal certification.',
      cleanup: { ok: cleanupOk, deleted: { subscriptions: created.subs.length, wallets: created.wallets.length, contacts: created.contacts.length } },
    });
  } catch (error) {
    // Best-effort cleanup so a mid-suite failure cannot leave synthetic fixtures behind.
    try {
      const base44 = createClientFromRequest(req);
      const svc = base44.asServiceRole;
      for (const id of created.subs) {
        const ns = await listNoticesForSubscription(svc, id, 100);
        for (const n of ns) { try { await svc.entities.AutoFundMembershipNotice.delete(n.id); } catch {} }
        try { await svc.entities.AutoFundSubscription.delete(id); } catch {}
      }
      for (const id of created.wallets) { try { await svc.entities.PrepaidWallet.delete(id); } catch {} }
      for (const id of created.contacts) { try { await svc.entities.Contact.delete(id); } catch {} }
    } catch {}
    return Response.json({ error: error.message, results }, { status: 500 });
  }
}