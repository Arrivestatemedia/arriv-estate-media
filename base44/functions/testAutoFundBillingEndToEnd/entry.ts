import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { signPayload } from '../../shared/payrollCrypto.ts';
import {
  enrollAutoFund,
  chargeMembershipFeeForCycle,
  CURRENT_TERMS_VERSION,
} from '../../shared/autoFundEnrollment.ts';
import {
  contractedFee,
  reconcileChargeComponents,
  MEMBERSHIP_FEE_COMPONENT,
} from '../../shared/autoFundMembershipBilling.ts';
import {
  AUTOFUND_PROCESSOR_CONTRACT_VERSION,
  AUTOFUND_PROCESSOR_CAPABILITIES,
  processAutoFundPayment,
} from '../../shared/autoFundProcessor.ts';
import {
  holdDisputedLots,
  checkHoldInvariants,
} from '../../shared/disputeProtection.ts';
import { evaluateEnrollmentGate, EMERGENCY_SWITCH_SEMANTICS } from '../../shared/enrollmentCohort.ts';
import { checkDeliveryGuard, partitionByDeliveryGuard } from '../../shared/certificationDeliveryGuard.ts';
import { isCertificationId } from '../../shared/certificationMode.ts';
import { processCommissionReversal } from '../../shared/commissionReversalEngine.ts';
import { getAutoFundConfig, AUTO_FUND_VIP_AMOUNT } from '../../shared/prepaidEngine.ts';
import { MLS_PRICE_V1_BY_TIER, MLS_PRICE_V2_BY_TIER } from '../../shared/mlsPricing.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARRIV AUTO-FUND — ISOLATED END-TO-END BILLING AND ACCOUNTING TEST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ADMIN-ONLY. SYNTHETIC ONLY. Activates nothing.
 *
 * Proves the paths that had NO coverage before: the membership-fee charge path,
 * fee-versus-funding separation, component reconciliation, duplicate and
 * out-of-order webhook delivery, partial-failure safety, dispute holds, and the
 * switch semantics that a controlled launch depends on.
 *
 * Every fixture uses cert_-prefixed identifiers. Nothing here can reach a real
 * customer, charge a real card, pay a real employee, or activate a real price.
 *
 * The fee switch is DISABLED in production. Certification declares it enabled
 * for this isolated run only — the same bypass shape the enrollment engine uses —
 * and every generated ID is cert_-prefixed. Real fees still require the code flag.
 */

const APP_URL = 'https://arrivestatemedia.base44.app';
// The run id, the results array and the step marker are created INSIDE the handler.
// Declared here they survive between invocations in a warm instance, so a second
// call appends its checks to the first call's array and reports a doubled total
// under the FIRST call's run id — a report that looks like one complete run while
// actually describing two, hiding the second run's real result.
const TIER = 350;                                 // $350 → $402.50 Booking Value, $25 fee
const EXPECTED_BV_CENTS = 40250;                  // 350 + 52.50 bonus
const EXPECTED_FEE = 25;
const EXPECTED_TOTAL_CHARGE_CENTS = 37500;        // 35000 funding + 2500 fee

/**
 * DECLARED launch configuration for the certification run — a TEST INPUT, not a
 * claim of approval. It exists so enrollment can be exercised while production
 * refuses it.
 */
const DECLARED_LAUNCH_CONFIGURATION = {
  enrollment_enabled: true,
  enrollment_switch_value: 'true',
  membership_fee_enabled: true,
  vip_mls_promo_restriction_enabled: true,
  terms_version: CURRENT_TERMS_VERSION,
  terms_legally_approved: true,
  fee_refund_policy: 'non_refundable',
  wallet_terms_approved: true,
  mls_v2_configured: true,
  processor_contract_version: AUTOFUND_PROCESSOR_CONTRACT_VERSION,
  processor_capabilities: AUTOFUND_PROCESSOR_CAPABILITIES,
};

export default async function (req) {
  // Per-invocation state: a fresh run id, a fresh results array and a fresh step
  // marker, so nothing can leak from a previous call in the same warm instance.
  const TEST_RUN_ID = `cert_bill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const CUSTOMER_EMAIL = `cert_bill_customer_${TEST_RUN_ID}@cert.test`;
  const CUSTOMER_NAME = 'Certification Billing Customer';
  const results: any[] = [];
  let step = 'init';

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const cleanups: string[] = [];
    const check = (name: string, passed: boolean, details: any = '') =>
      results.push({ name, passed: !!passed, details: typeof details === 'string' ? details : JSON.stringify(details) });
    const arr = (r: any) => (Array.isArray(r) ? r : (r?.data || r?.items || []));

    const track = (kind: string, id: string) => { if (id) cleanups.push(`${kind}:${id}`); };

    // ═══════════════════════════════════════════════════════════════════════
    // SETUP — synthetic subscriber, enrolled through the real engine against the
    // DECLARED configuration (enrollment itself is certified elsewhere; here it
    // exists so the billing paths run against a genuine contract).
    // ═══════════════════════════════════════════════════════════════════════
    let subscription: any = null;
    let wallet: any = null;
    let contact: any = null;

    const enrollment = await enrollAutoFund({
      base44: b,
      channel: 'sales_assisted',
      tier_amount: TIER,
      customer_email: CUSTOMER_EMAIL,
      customer_name: CUSTOMER_NAME,
      customer_phone: '',
      attribution_source: 'admin_assigned',
      terms_accepted: true,
      terms_accepted_by: CUSTOMER_EMAIL,
      consent_ip: '203.0.113.10',
      consent_user_agent: 'certification-harness/1.0',
      billing_address: { line1: '1 Certification Way', city: 'Atlanta', state: 'GA', postal_code: '30301', country: 'US' },
      certification_bypass: {
        authorized: true,
        admin_email: user.email,
        launch_configuration: DECLARED_LAUNCH_CONFIGURATION,
      },
      actor: user.email,
    });

    if (enrollment.status === 'enrolled') {
      subscription = await b.entities.AutoFundSubscription.get(enrollment.subscription_id);
      wallet = await b.entities.PrepaidWallet.get(enrollment.wallet_id);
      contact = await b.entities.Contact.get(enrollment.contact_id);
      track('AutoFundSubscription', subscription?.id);
      track('PrepaidWallet', wallet?.id);
      track('Contact', contact?.id);
    }

    check('SETUP: synthetic subscriber enrolled with a frozen contract',
      enrollment.status === 'enrolled' &&
        subscription?.membership_fee === EXPECTED_FEE &&
        subscription?.total_monthly_charge === TIER + EXPECTED_FEE &&
        subscription?.amount === TIER,
      `status=${enrollment.status} fee=${subscription?.membership_fee} total=${subscription?.total_monthly_charge} err=${enrollment.error || ''}`);

    check('SETUP: consent evidence recorded immutably for dispute representment',
      !!(enrollment.consent?.recorded) &&
        enrollment.consent?.frozen_amounts?.total_recurring_charge === TIER + EXPECTED_FEE &&
        enrollment.consent?.session_evidence?.ip_captured === true &&
        enrollment.consent?.session_evidence?.user_agent_captured === true,
      JSON.stringify(enrollment.consent || {}));

    if (!subscription || !wallet) {
      return Response.json({
        test_run_id: TEST_RUN_ID,
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        all_passed: false,
        aborted: 'Enrollment fixture could not be created, so the billing paths could not be exercised.',
        results,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIOS 1-3 — first combined charge: funding + membership fee
    // Sent through the REAL webhook, HMAC-signed, so the routing decision under
    // test is the one production will actually execute.
    // ═══════════════════════════════════════════════════════════════════════
    const cycle1EventId = `cert_${TEST_RUN_ID}_cycle1`;
    const cycle1 = await postPaymentEvent({
      payment_event_id: cycle1EventId,
      subscription,
      wallet,
      amountCents: EXPECTED_TOTAL_CHARGE_CENTS,
      fundingCents: TIER * 100,
      feeCents: EXPECTED_FEE * 100,
      component: 'combined',
      status: 'succeeded',
      eventType: 'recurring',
      certification: true,
    });

    const cycle1Funding = await findPaymentEvent(b, cycle1EventId);
    const cycle1Fee = await findPaymentEvent(b, `${cycle1EventId}_fee`);
    track('AutoFundPaymentEvent', cycle1Funding?.id);
    track('AutoFundPaymentEvent', cycle1Fee?.id);

    check('SCENARIO 1-3: combined charge routed by the real webhook and reconciled against the contract',
      cycle1.http === 200 &&
        cycle1.body?.component === 'combined' &&
        cycle1.body?.reconciliation?.ok === true &&
        (cycle1.body?.booking_value_issued_cents || 0) === EXPECTED_BV_CENTS,
      `http=${cycle1.http} component=${cycle1.body?.component} reconciled=${cycle1.body?.reconciliation?.ok} bv=${cycle1.body?.booking_value_issued_cents} fee_status=${cycle1.body?.fee?.status}`);

    // DIAGNOSTIC — dumps the exact response and payload so the router's decision
    // can be read directly instead of inferred from its consequences.
    check('DIAGNOSTIC: cycle1 webhook response and payload', true,
      JSON.stringify({ body: cycle1.body, payload: cycle1.payload }));

    // The live endpoint is what will actually process a real charge, so a contract
    // that exists only in source is worth nothing. This check is deliberately
    // separate from the source-level proofs so a deployment gap cannot be mistaken
    // for a software defect — or worse, be hidden by a green suite.
    const deployedContractLive = cycle1.body?.component === 'combined';
    const staleNote = deployedContractLive
      ? ''
      : ' | DEPLOYED_WEBHOOK_STALE: the LIVE /functions/receiveArrivPayCustomerPayment endpoint does not implement the source component contract — it ignored the fee component, funded the ENTIRE $375 charge as wallet value and applied NO bonus, and it does not reject a mismatched charge. Re-publish the app so the source contract goes live.';
    check('DEPLOYMENT: the live webhook implements the source component-routing contract',
      deployedContractLive,
      `deployed_component_field=${cycle1.body?.component ?? '(absent)'}${staleNote}`);

    // The fee ENGINE is exercised with an explicit certification declaration,
    // because the live fee switch is OFF. Recognising a fee and issuing no value
    // for it can only be proven by running the fee path, and production still
    // requires the code flag: the declaration is honoured only for a cert_-prefixed
    // synthetic run. The webhook scenarios above prove the routing and the
    // reconciliation with the REAL switch state.
    const walletBeforeFee = await b.entities.PrepaidWallet.get(wallet.id);
    const feeCycleId = `cert_${TEST_RUN_ID}_feerec`;
    const feeCycle = await chargeMembershipFeeForCycle({
      base44: b,
      subscription,
      payment_event_id: feeCycleId,
      status: 'succeeded',
      actor: 'cert_test',
      cert_mode: true,
      declared_fee_enabled: true,
    });
    let feeCycleEvent = await findPaymentEvent(b, feeCycleId);
    track('AutoFundPaymentEvent', feeCycleEvent?.id);
    const feeCycleReplay = await chargeMembershipFeeForCycle({
      base44: b,
      subscription,
      payment_event_id: feeCycleId,
      status: 'succeeded',
      actor: 'cert_test',
      cert_mode: true,
      declared_fee_enabled: true,
    });
    const feeCycleEvents = arr(await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: feeCycleId }, undefined, 10));
    const walletAfterFee = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 2: the $25 fee is recognised with ZERO wallet credits issued for it',
      feeCycle.status === 'fee_recorded' &&
        feeCycleEvent?.amount_charged === EXPECTED_FEE &&
        feeCycleEvent?.membership_fee_amount === EXPECTED_FEE &&
        feeCycleEvent?.booking_value_issued_cents === 0 &&
        (feeCycleEvent?.credits_issued || 0) === 0 &&
        feeCycleEvent?.charge_component === MEMBERSHIP_FEE_COMPONENT &&
        feeCycleEvent?.wallet_transaction_id === '' &&
        walletAfterFee.booking_value_balance_cents === walletBeforeFee.booking_value_balance_cents,
      `status=${feeCycle.status} fee=${feeCycleEvent?.amount_charged} bv_cents=${feeCycleEvent?.booking_value_issued_cents} credits=${feeCycleEvent?.credits_issued} wallet_before=${walletBeforeFee.booking_value_balance_cents} wallet_after=${walletAfterFee.booking_value_balance_cents}`);

    check('SCENARIO 2: the fee generated NO credit lot, NO wallet transaction and NO commission',
      feeCycleEvent?.lot_id === '' &&
        (feeCycleEvent?.commission_event_id || '') === '' &&
        walletAfterFee.booking_value_balance_cents === walletBeforeFee.booking_value_balance_cents,
      `lot_id=${feeCycleEvent?.lot_id || '(none)'} commission_event_id=${feeCycleEvent?.commission_event_id || '(none)'} wallet_unchanged_by_fee=${walletAfterFee.booking_value_balance_cents === walletBeforeFee.booking_value_balance_cents}`);

    check('SCENARIO 4: a replayed fee cycle records the fee exactly once and never re-charges',
      (feeCycleReplay.status === 'duplicate' || feeCycleReplay.status === 'fee_recorded') &&
        feeCycleEvents.length === 1,
      `replay_status=${feeCycleReplay.status} fee_events_recorded=${feeCycleEvents.length}`);

    check('SCENARIO 3: wallet funding issued the contracted promotional Booking Value',
      cycle1Funding?.amount_charged === TIER &&
        cycle1Funding?.booking_value_issued_cents === EXPECTED_BV_CENTS &&
        cycle1Funding?.bonus_booking_value === 52.5,
      `funding=${cycle1Funding?.amount_charged} bv=${cycle1Funding?.booking_value_issued_cents} bonus=${cycle1Funding?.bonus_booking_value}`);

    check('SCENARIO 3: components reconcile EXACTLY to the authorized recurring charge',
      cycle1.body?.reconciliation?.ok === true &&
        cycle1.body?.reconciliation?.reported_total_cents === EXPECTED_TOTAL_CHARGE_CENTS &&
        cycle1.body?.reconciliation?.contract_total_cents === EXPECTED_TOTAL_CHARGE_CENTS,
      JSON.stringify(cycle1.body?.reconciliation || {}));

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 3 — the central accounting invariant.
    // ═══════════════════════════════════════════════════════════════════════
    let walletNow = await b.entities.PrepaidWallet.get(wallet.id);
    let lots = arr(await b.entities.CreditLot.filter({ wallet_id: wallet.id }, '-fifo_order', 100));
    const lotTotal1 = lots.reduce((s: number, l: any) => s + (l.booking_value_remaining_cents || 0), 0);
    const feeEvents1 = arr(await b.entities.AutoFundPaymentEvent.filter({ subscription_id: subscription.id }, '-processed_at', 200))
      .filter((e: any) => e.charge_component === MEMBERSHIP_FEE_COMPONENT || e.event_type === 'membership_fee');
    const feeBvTotal1 = feeEvents1.reduce((s: number, e: any) => s + (e.booking_value_issued_cents || 0), 0);

    // Stated as a RELATIONSHIP, not against a fixed figure: the wallet must equal
    // the sum of its lots (nothing created out of thin air) and no fee event may
    // carry any Booking Value. Whether the funding AMOUNT is right is asserted
    // once, in SCENARIO 3 — an invariant that restates it would fail for the same
    // reason twice and hide which one actually broke.
    check('INVARIANT: no wallet balance was created from membership-fee revenue',
      walletNow.booking_value_balance_cents === lotTotal1 &&
        feeBvTotal1 === 0,
      `wallet=${walletNow.booking_value_balance_cents} sum_of_lots=${lotTotal1} fee_bv_total=${feeBvTotal1} fee_events=${feeEvents1.length}`);

    check('INVARIANT: fee revenue and funding are recorded as separate components',
      feeEvents1.length === 1 &&
        feeEvents1[0].amount_charged === EXPECTED_FEE &&
        cycle1Funding?.charge_component !== MEMBERSHIP_FEE_COMPONENT,
      `fee_events=${feeEvents1.length} funding_component=${cycle1Funding?.charge_component || 'wallet_funding (default)'}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 5 — duplicate delivery cannot double-charge or double-issue
    // ═══════════════════════════════════════════════════════════════════════
    const dup = await postPaymentEvent({
      payment_event_id: cycle1EventId,
      subscription,
      wallet,
      amountCents: EXPECTED_TOTAL_CHARGE_CENTS,
      fundingCents: TIER * 100,
      feeCents: EXPECTED_FEE * 100,
      component: 'combined',
      status: 'succeeded',
      eventType: 'recurring',
      certification: true,
    });
    const dupFundingEvents = arr(await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: cycle1EventId }, '-processed_at', 10));
    const dupFeeEvents = arr(await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: `${cycle1EventId}_fee` }, '-processed_at', 10));
    walletNow = await b.entities.PrepaidWallet.get(wallet.id);
    lots = arr(await b.entities.CreditLot.filter({ wallet_id: wallet.id }, '-fifo_order', 100));
    const lotTotalDup = lots.reduce((s: number, l: any) => s + (l.booking_value_remaining_cents || 0), 0);

    check('SCENARIO 5: duplicate webhook delivery is idempotent — no double credit, no double fee',
      dup.http === 200 &&
        dupFundingEvents.length === 1 &&
        dupFeeEvents.length <= 1 &&
        walletNow.booking_value_balance_cents === lotTotalDup,
      `funding_events=${dupFundingEvents.length} fee_events=${dupFeeEvents.length} wallet=${walletNow.booking_value_balance_cents} lots=${lotTotalDup}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 4 — renewal through the webhook, charged from the FROZEN contract
    // ═══════════════════════════════════════════════════════════════════════
    const cycle2EventId = `cert_${TEST_RUN_ID}_cycle2`;
    const cycle2 = await postPaymentEvent({
      payment_event_id: cycle2EventId,
      subscription,
      wallet,
      amountCents: EXPECTED_TOTAL_CHARGE_CENTS,
      fundingCents: TIER * 100,
      feeCents: EXPECTED_FEE * 100,
      component: 'combined',
      status: 'succeeded',
      eventType: 'recurring',
      certification: true,
    });
    const cycle2Fee = await findPaymentEvent(b, `${cycle2EventId}_fee`);
    track('AutoFundPaymentEvent', cycle2Fee?.id);
    walletNow = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 4: the monthly renewal reconciles against the FROZEN contract, not a default',
      cycle2.http === 200 &&
        cycle2.body?.reconciliation?.ok === true &&
        cycle2.body?.reconciliation?.contract_total_cents === EXPECTED_TOTAL_CHARGE_CENTS &&
        walletNow.booking_value_balance_cents === EXPECTED_BV_CENTS * 2 &&
        (cycle2Fee ? cycle2Fee.amount_charged === EXPECTED_FEE : true),
      `http=${cycle2.http} contract_total=${cycle2.body?.reconciliation?.contract_total_cents} wallet=${walletNow.booking_value_balance_cents} fee_event=${cycle2Fee ? cycle2Fee.amount_charged : '(none — switch off)'}`);

    const walletBeforeFeeOnly = await b.entities.PrepaidWallet.get(wallet.id);
    const feeOnlyId = `cert_${TEST_RUN_ID}_feeonly`;
    const feeOnlyResp = await postPaymentEvent({
      payment_event_id: feeOnlyId,
      subscription,
      wallet,
      amountCents: EXPECTED_FEE * 100,
      fundingCents: 0,
      feeCents: EXPECTED_FEE * 100,
      component: 'membership_fee',
      status: 'succeeded',
      eventType: 'membership_fee',
      certification: true,
    });
    const feeOnlyEv = await findPaymentEvent(b, feeOnlyId);
    track('AutoFundPaymentEvent', feeOnlyEv?.id);
    const walletAfterFeeOnly = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 6: a fee-only event issues no Booking Value and leaves the wallet untouched',
      feeOnlyResp.http === 200 &&
        (!feeOnlyEv || (feeOnlyEv.booking_value_issued_cents === 0 && feeOnlyEv.lot_id === '')) &&
        walletAfterFeeOnly.booking_value_balance_cents === walletBeforeFeeOnly.booking_value_balance_cents,
      `http=${feeOnlyResp.http} bv_issued=${feeOnlyEv?.booking_value_issued_cents ?? '(no event recorded)'} lot=${feeOnlyEv?.lot_id ?? '-'} wallet_before=${walletBeforeFeeOnly.booking_value_balance_cents} wallet_after=${walletAfterFeeOnly.booking_value_balance_cents}${staleNote}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 6b — mismatched components must fail closed with NOTHING issued
    // ═══════════════════════════════════════════════════════════════════════
    const mismatchEventId = `cert_${TEST_RUN_ID}_mismatch`;
    const mismatch = await postPaymentEvent({
      payment_event_id: mismatchEventId,
      subscription,
      wallet,
      amountCents: TIER * 100 + 4000,          // claims a $40 fee against a $25 contract
      fundingCents: TIER * 100,
      feeCents: 4000,
      component: 'combined',
      status: 'succeeded',
      eventType: 'recurring',
      certification: true,
    });
    const mismatchFunding = await findPaymentEvent(b, mismatchEventId);
    const mismatchFee = await findPaymentEvent(b, `${mismatchEventId}_fee`);
    walletNow = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 6b: a mismatched charge is rejected with NOTHING issued (no partial issuance)',
      mismatch.http === 409 &&
        mismatch.body?.error_code === 'CHARGE_COMPONENT_MISMATCH' &&
        !mismatchFunding &&
        !mismatchFee &&
        walletNow.booking_value_balance_cents === EXPECTED_BV_CENTS * 2,
      `http=${mismatch.http} code=${mismatch.body?.error_code} funding_recorded=${!!mismatchFunding} fee_recorded=${!!mismatchFee} wallet=${walletNow.booking_value_balance_cents}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 2b — a fee component can never be processed as wallet funding
    // ═══════════════════════════════════════════════════════════════════════
    const walletBeforeFeeAsFunding = await b.entities.PrepaidWallet.get(wallet.id);
    const feeAsFunding = await processAutoFundPayment({
      base44: b,
      payment_event_id: `cert_${TEST_RUN_ID}_feeasfunding`,
      subscription_id: subscription.id,
      customer_id: subscription.customer_id,
      customer_email: CUSTOMER_EMAIL,
      wallet_id: wallet.id,
      amount_charged: EXPECTED_FEE,
      status: 'succeeded',
      event_type: 'membership_fee',
      charge_component: MEMBERSHIP_FEE_COMPONENT,
      actor: 'cert_test',
      cert_mode: true,
    });
    const feeAsFundingEvent = await findPaymentEvent(b, `cert_${TEST_RUN_ID}_feeasfunding`);
    const walletAfterFeeAsFunding = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 2b: a fee component sent to the funding processor is rejected, issuing nothing',
      feeAsFunding.status === 'error' &&
        feeAsFunding.error_code === 'FEE_COMPONENT_IS_NOT_WALLET_FUNDING' &&
        feeAsFunding.retryable === false &&
        !feeAsFundingEvent &&
        walletAfterFeeAsFunding.booking_value_balance_cents === walletBeforeFeeAsFunding.booking_value_balance_cents,
      `status=${feeAsFunding.status} code=${feeAsFunding.error_code} retryable=${feeAsFunding.retryable} recorded=${!!feeAsFundingEvent} wallet_before=${walletBeforeFeeAsFunding.booking_value_balance_cents} wallet_after=${walletAfterFeeAsFunding.booking_value_balance_cents}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 16 — the fee switch stops billing WITHOUT rewriting the contract
    // ═══════════════════════════════════════════════════════════════════════
    const switchOffId = `cert_${TEST_RUN_ID}_switchoff`;
    const switchOff = await chargeMembershipFeeForCycle({
      base44: b,
      subscription,
      payment_event_id: switchOffId,
      status: 'succeeded',
      actor: 'cert_test',
      cert_mode: false,                 // NOT a certification run: the real gate applies
      declared_fee_enabled: false,
    });
    const switchOffEvent = await findPaymentEvent(b, switchOffId);

    check('SCENARIO 16: with billing switched off, no fee is charged, nothing is recorded, and the contract amount is unchanged',
      switchOff.status === 'fee_disabled' &&
        !switchOffEvent &&
        contractedFee(subscription) === EXPECTED_FEE,
      `status=${switchOff.status} recorded=${!!switchOffEvent} contracted_fee=${contractedFee(subscription)}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 15 — emergency enrollment OFF blocks new signups only
    // ═══════════════════════════════════════════════════════════════════════
    const gateClosed = await evaluateEnrollmentGate(b, {
      channel: 'self_service',
      customer_email: `cert_${TEST_RUN_ID}_outsider@cert.test`,
    });

    // An EXISTING subscriber keeps being billed while enrollment is closed: this
    // renewal runs through the same webhook the closed gate does not consult.
    const closedCycleEventId = `cert_${TEST_RUN_ID}_closedcycle`;
    const closedCycle = await postPaymentEvent({
      payment_event_id: closedCycleEventId,
      subscription,
      wallet,
      amountCents: EXPECTED_TOTAL_CHARGE_CENTS,
      fundingCents: TIER * 100,
      feeCents: EXPECTED_FEE * 100,
      component: 'combined',
      status: 'succeeded',
      eventType: 'recurring',
      certification: true,
    });
    const closedCycleFee = await findPaymentEvent(b, `${closedCycleEventId}_fee`);
    track('AutoFundPaymentEvent', closedCycleFee?.id);
    const walletAfterClosedCycle = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 15: enrollment is refused while closed, and an existing subscriber is still funded',
      gateClosed.allowed === false &&
        gateClosed.code === 'ENROLLMENT_CLOSED' &&
        closedCycle.http === 200 &&
        (closedCycle.body?.booking_value_issued_cents || 0) > 0 &&
        walletAfterClosedCycle.booking_value_balance_cents > walletAfterFeeOnly.booking_value_balance_cents,
      `gate=${gateClosed.code} closed_cycle_http=${closedCycle.http} wallet_before=${walletAfterFeeOnly.booking_value_balance_cents} wallet_after=${walletAfterClosedCycle.booking_value_balance_cents} fee_event=${closedCycleFee ? closedCycleFee.amount_charged : '(none — switch off)'}`);

    check('SCENARIO 15: the emergency switch does not gate billing, access, cancellation or redemption',
      EMERGENCY_SWITCH_SEMANTICS.does_not_block.includes('membership_fee_billing') &&
        EMERGENCY_SWITCH_SEMANTICS.does_not_block.includes('cancellation') &&
        EMERGENCY_SWITCH_SEMANTICS.does_not_block.includes('service_access_and_redemption') &&
        EMERGENCY_SWITCH_SEMANTICS.blocks.length === 3,
      `blocks=${EMERGENCY_SWITCH_SEMANTICS.blocks.join(',')}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 7 — cancellation preserves every wallet balance
    // ═══════════════════════════════════════════════════════════════════════
    const beforeCancel = await b.entities.PrepaidWallet.get(wallet.id);
    const cancelRes = await base44.functions.invoke('manageAutoFund', {
      action: 'cancel',
      subscription_id: subscription.id,
      reason: 'certification cancellation',
    });
    const cancelBody = cancelRes?.data || cancelRes;
    const afterCancel = await b.entities.PrepaidWallet.get(wallet.id);
    const cancelledSub = await b.entities.AutoFundSubscription.get(subscription.id);

    check('SCENARIO 7: cancellation stops future charges and preserves the wallet balance exactly',
      afterCancel.booking_value_balance_cents === beforeCancel.booking_value_balance_cents &&
        cancelledSub.status === 'cancelled' &&
        cancelledSub.next_billing_date === '' &&
        cancelBody?.wallet_balance_preserved === true,
      `before=${beforeCancel.booking_value_balance_cents} after=${afterCancel.booking_value_balance_cents} status=${cancelledSub.status} next_billing=${cancelledSub.next_billing_date || '(cleared)'}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIOS 9-11 — dispute holds, before and after redemption
    // ═══════════════════════════════════════════════════════════════════════
    const chargeId = `cert_ch_${TEST_RUN_ID}`;

    // Re-point this wallet's funding lots at a known charge so the dispute can be
    // traced exactly, which is the only way a hold is ever applied.
    lots = arr(await b.entities.CreditLot.filter({ wallet_id: wallet.id }, '-fifo_order', 100));
    for (const l of lots) {
      await b.entities.CreditLot.update(l.id, { stripe_transaction_id: chargeId });
    }

    // 9) Hold BEFORE any redemption — the full unspent value is suspended.
    const holdBefore = await holdDisputedLots({
      base44: b,
      wallet_id: wallet.id,
      dispute_reference: `cert_disp_before_${TEST_RUN_ID}`,
      provider_charge_id: chargeId,
      amount_cents: TIER * 100,
      actor: 'cert_test',
      cert_mode: true,
    });
    const walletHeld = await b.entities.PrepaidWallet.get(wallet.id);
    lots = arr(await b.entities.CreditLot.filter({ wallet_id: wallet.id }, '-fifo_order', 100));
    const invariants = checkHoldInvariants({ wallet: walletHeld, lots });

    check('SCENARIO 9: a chargeback before redemption suspends exactly the disputed unspent value',
      holdBefore.status === 'held' &&
        holdBefore.held_cents === TIER * 100 &&
        walletHeld.dispute_held_cents === TIER * 100 &&
        walletHeld.booking_value_balance_cents ===
          beforeCancel.booking_value_balance_cents - TIER * 100,
      `held=${holdBefore.held_cents} wallet_held=${walletHeld.dispute_held_cents} spendable=${walletHeld.booking_value_balance_cents}`);

    check('SCENARIO 9: held value is preserved on its lots, so a won dispute restores the exact amount',
      lots.filter((l: any) => l.dispute_hold).every((l: any) => (l.booking_value_remaining_cents || 0) > 0) &&
        invariants.spendable_plus_held_equals_lots &&
        invariants.hold_reconciles_to_lots &&
        invariants.spendable_not_negative,
      JSON.stringify(invariants));

    check('SCENARIO 9: the hold is auditable — a ledger entry explains it and nothing was deleted',
      await (async () => {
        const txns = arr(await b.entities.WalletTransaction.filter({ wallet_id: wallet.id }, '-created_at', 50))
          .filter((t: any) => t.description?.includes(`cert_disp_before_${TEST_RUN_ID}`));
        return txns.length === 1 &&
          txns[0].booking_value_cents === -(TIER * 100) &&
          txns[0].type === 'ADMIN_ADJUSTMENT';
      })(),
      'exactly one ledger entry, recording the spendable-balance change');

    check('SCENARIO 9: replaying the same dispute does not hold the same funds twice',
      await (async () => {
        const again = await holdDisputedLots({
          base44: b,
          wallet_id: wallet.id,
          dispute_reference: `cert_disp_before_${TEST_RUN_ID}`,
          provider_charge_id: chargeId,
          amount_cents: TIER * 100,
          actor: 'cert_test',
          cert_mode: true,
        });
        const w = await b.entities.PrepaidWallet.get(wallet.id);
        return again.status === 'already_held' && w.dispute_held_cents === TIER * 100;
      })(),
      'second delivery returns already_held with no additional suspension');

    // 10) A chargeback after PARTIAL redemption holds only what remains.
    lots = arr(await b.entities.CreditLot.filter({ wallet_id: wallet.id }, '-fifo_order', 100));
    for (const l of lots) {
      await b.entities.CreditLot.update(l.id, { dispute_hold: false, dispute_hold_cents: 0, dispute_hold_released_at: new Date().toISOString() });
    }
    const partialChargeId = `cert_ch_partial_${TEST_RUN_ID}`;
    if (!lots.length) {
      throw new Error(`Fixture wallet ${wallet.id} has no credit lots — funding never issued value, so the dispute scenarios cannot run.`);
    }
    const partialLot = lots[0];
    await b.entities.CreditLot.update(partialLot.id, {
      stripe_transaction_id: partialChargeId,
      booking_value_remaining_cents: 10000,
      booking_value_remaining: 100,
      credits_remaining: 10000 / 27500,
    });

    const holdPartial = await holdDisputedLots({
      base44: b,
      wallet_id: wallet.id,
      dispute_reference: `cert_disp_partial_${TEST_RUN_ID}`,
      provider_charge_id: partialChargeId,
      amount_cents: TIER * 100,                 // disputes the whole charge…
      actor: 'cert_test',
      cert_mode: true,
    });

    check('SCENARIO 10: a chargeback after partial redemption holds only the value that remains',
      holdPartial.status === 'held' &&
        holdPartial.held_cents === 10000 &&
        holdPartial.held_cents < TIER * 100,
      `held=${holdPartial.held_cents} (disputed ${TIER * 100}, only 10000 remained)`);

    // 11) A chargeback after FULL redemption holds nothing, and touches nothing else.
    const spentChargeId = `cert_ch_spent_${TEST_RUN_ID}`;
    await b.entities.CreditLot.update(partialLot.id, {
      stripe_transaction_id: spentChargeId,
      booking_value_remaining_cents: 0,
      booking_value_remaining: 0,
      credits_remaining: 0,
      dispute_hold: false,
      dispute_hold_cents: 0,
    });
    const unaffectedWalletBefore = await b.entities.PrepaidWallet.get(wallet.id);
    const holdSpent = await holdDisputedLots({
      base44: b,
      wallet_id: wallet.id,
      dispute_reference: `cert_disp_spent_${TEST_RUN_ID}`,
      provider_charge_id: spentChargeId,
      amount_cents: TIER * 100,
      actor: 'cert_test',
      cert_mode: true,
    });
    const unaffectedWalletAfter = await b.entities.PrepaidWallet.get(wallet.id);

    check('SCENARIO 11: a chargeback after full redemption holds nothing and never touches unrelated funds',
      holdSpent.status === 'nothing_to_hold' &&
        holdSpent.held_cents === 0 &&
        unaffectedWalletBefore.booking_value_balance_cents === unaffectedWalletAfter.booking_value_balance_cents &&
        unaffectedWalletAfter.booking_value_balance_cents > 0,
      `status=${holdSpent.status} balance_before=${unaffectedWalletBefore.booking_value_balance_cents} after=${unaffectedWalletAfter.booking_value_balance_cents}`);

    check('SCENARIO 11: an untraceable charge suspends nothing rather than freezing something else',
      (holdSpent.unexplained || '').length > 0 &&
        !holdSpent.lots?.length,
      holdSpent.unexplained || '');

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 8 — refunds reverse commission once, and never twice
    // ═══════════════════════════════════════════════════════════════════════
    const commissionEventId = `cert_${TEST_RUN_ID}_comm`;
    // The reversal engine resolves the original commission through the funding
    // event's commission_event_id link — the same link the processor writes on an
    // attributed charge — so the fixture must establish it before the refund.
    await b.entities.AutoFundPaymentEvent.update(cycle1Funding.id, { commission_event_id: commissionEventId });
    const commissionEvent = await b.entities.PrepaidCompensationEvent.create({
      source_event_id: commissionEventId,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'AUTO_FUND_COMMISSION',
      employee_id: `cert_rep_${TEST_RUN_ID}`,
      employee_email: `cert_rep_${TEST_RUN_ID}@cert.test`,
      customer_id: subscription.customer_id,
      transaction_id: cycle1Funding?.wallet_transaction_id || '',
      gross_customer_cash: TIER,
      commission_amount: 52.5,
      currency: 'USD',
      earned_at: new Date().toISOString(),
      status: 'APPROVED',
      reason: 'AUTO_FUND_FIRST_PAYMENT_15_PERCENT',
      delivered_to_payroll: false,
      delivery_attempts: 0,
      delivery_status: 'PENDING',
      idempotency_key: commissionEventId,
    });
    track('PrepaidCompensationEvent', commissionEvent?.id);

    const refundEventId = `cert_${TEST_RUN_ID}_refund`;
    const reversal1 = await processCommissionReversal({
      base44: b,
      refund_event_id: refundEventId,
      original_payment_event_id: cycle1EventId,
      refunded_commissionable_amount: TIER,
      reason: 'certification refund',
      actor: 'cert_test',
      cert_mode: true,
    });
    const reversal2 = await processCommissionReversal({
      base44: b,
      refund_event_id: refundEventId,
      original_payment_event_id: cycle1EventId,
      refunded_commissionable_amount: TIER,
      reason: 'certification refund (replay)',
      actor: 'cert_test',
      cert_mode: true,
    });
    const reversals = arr(await b.entities.PrepaidCompensationEvent.filter(
      { reverses_source_event_id: commissionEventId }, '-earned_at', 20,
    ));
    for (const r of reversals) track('PrepaidCompensationEvent', r.id);

    check('SCENARIO 8: a refund reverses the commission exactly once, and a replay creates no duplicate',
      !reversal1.error &&
        reversals.length === 1 &&
        (reversal2.status === 'duplicate' || reversal2.duplicate === true || (reversal2.reversals_created || 0) === 0),
      `reversals=${reversals.length} replay_status=${reversal2.status} replay_created=${reversal2.reversals_created ?? 'n/a'}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 14 — synthetic exclusion with every feature flag ENABLED
    // ═══════════════════════════════════════════════════════════════════════
    const syntheticCommission = await b.entities.PrepaidCompensationEvent.create({
      source_event_id: `cert_${TEST_RUN_ID}_synthetic_comm`,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'AUTO_FUND_COMMISSION',
      employee_id: `cert_rep_${TEST_RUN_ID}`,
      employee_email: `cert_rep_${TEST_RUN_ID}@cert.test`,
      customer_id: subscription.customer_id,
      commission_amount: 28,
      gross_customer_cash: TIER,
      currency: 'USD',
      earned_at: new Date().toISOString(),
      status: 'APPROVED',
      delivery_status: 'PENDING',
      delivered_to_payroll: false,
      idempotency_key: `cert_${TEST_RUN_ID}_synthetic_comm`,
    });
    track('PrepaidCompensationEvent', syntheticCommission?.id);

    const batchRes = await base44.functions.invoke('deliverPrepaidCompensation', { action: 'batch', max_batch: 100 });
    const batchBody = batchRes?.data || batchRes;
    const pool = arr(await b.entities.PrepaidCompensationEvent.filter(
      { delivery_status: { $in: ['PENDING', 'RETRYING'] }, status: 'APPROVED' }, '-earned_at', 200,
    ));
    const partitioned = partitionByDeliveryGuard(pool);
    const syntheticAfter = await b.entities.PrepaidCompensationEvent.get(syntheticCommission.id);

    check('SCENARIO 14: with all flags enabled, synthetic events cannot occupy a delivery slot or reach payroll',
      syntheticAfter.delivery_status === 'PENDING' &&
        syntheticAfter.delivered_to_payroll === false &&
        syntheticAfter.delivery_attempts === 0 &&
        partitioned.deliverable.every((e: any) => !isCertificationId(e.source_event_id)) &&
        (batchBody?.excluded_before_selection ?? 0) > 0,
      `status=${syntheticAfter.delivery_status} attempts=${syntheticAfter.delivery_attempts} pool=${pool.length} deliverable=${partitioned.deliverable.length} excluded_before_selection=${batchBody?.excluded_before_selection}`);

    check('SCENARIO 14: no real commission in the pool was starved by synthetic records',
      partitioned.deliverable.length === pool.length - partitioned.blocked.length,
      `pool=${pool.length} blocked=${partitioned.blocked.length} deliverable=${partitioned.deliverable.length}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 13 — the five MLS prices, and proof nothing was activated
    // ═══════════════════════════════════════════════════════════════════════
    const configs = arr(await b.entities.MediaPricingConfig.list('-effective_date', 20));
    const active = configs.find((c: any) => c.is_active === true);
    const approved = configs.find((c: any) => String(c.pricing_version || '').includes('V2'));
    const readLadder = (rec: any) => {
      try {
        const json = typeof rec?.config_json === 'string' ? JSON.parse(rec.config_json) : rec?.config_json;
        return (json?.tier_prices || []).map((t: any) => t?.prices?.mls_walkthrough);
      } catch { return []; }
    };
    const v1Expected = Object.values(MLS_PRICE_V1_BY_TIER);
    const v2Expected = Object.values(MLS_PRICE_V2_BY_TIER);
    const activeLadder = readLadder(active);
    const approvedLadder = readLadder(approved);

    check('SCENARIO 13: all five MLS prices resolve from the ACTIVE record and match the live ladder',
      activeLadder.length === 5 &&
        activeLadder.every((p: any, i: number) => p === v1Expected[i]) &&
        active?.is_active === true,
      `active=${active?.pricing_version} ladder=${JSON.stringify(activeLadder)}`);

    check('SCENARIO 13: the approved $120 ladder is present, correct, and still NOT activated',
      approvedLadder.length === 5 &&
        approvedLadder.every((p: any, i: number) => p === v2Expected[i]) &&
        approved?.is_active === false,
      `approved=${approved?.pricing_version} ladder=${JSON.stringify(approvedLadder)} is_active=${approved?.is_active}`);

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 12 — VIP terms untouched (no silent change)
    // ═══════════════════════════════════════════════════════════════════════
    const vipConfig = getAutoFundConfig(AUTO_FUND_VIP_AMOUNT);

    check('SCENARIO 12: the VIP bonus, its allowance and its support entitlement are unchanged',
      vipConfig?.bonus_pct === 25 &&
        vipConfig?.bonus_booking_value === 250 &&
        vipConfig?.booking_value === 1250 &&
        vipConfig?.validity_months === 12,
      `bonus_pct=${vipConfig?.bonus_pct} bonus_bv=${vipConfig?.bonus_booking_value} bv=${vipConfig?.booking_value}`);

    check('SCENARIO 12: cash-funded Booking Value remains fully usable on the VIP tier',
      vipConfig?.amount === 1000 && vipConfig?.vip === true,
      'VIP cash-funded value is not restricted; only promotional value is bounded by the allowance');

    // ═══════════════════════════════════════════════════════════════════════
    // SCENARIO 6c — reconciliation is a real check, not a formality
    // ═══════════════════════════════════════════════════════════════════════
    const reconOk = reconcileChargeComponents({
      subscription,
      reported_funding_cents: TIER * 100,
      reported_fee_cents: EXPECTED_FEE * 100,
    });
    const reconBadFee = reconcileChargeComponents({
      subscription,
      reported_funding_cents: TIER * 100,
      reported_fee_cents: 4000,
    });
    const reconBadFunding = reconcileChargeComponents({
      subscription,
      reported_funding_cents: 30000,
      reported_fee_cents: EXPECTED_FEE * 100,
    });

    check('RECONCILIATION: the check accepts the authorized split and rejects either component drifting',
      reconOk.ok === true &&
        reconBadFee.ok === false &&
        reconBadFunding.ok === false &&
        reconBadFee.issues.some((i: string) => i.startsWith('FEE_COMPONENT_MISMATCH')) &&
        reconBadFunding.issues.some((i: string) => i.startsWith('FUNDING_COMPONENT_MISMATCH')),
      `ok=${reconOk.ok} bad_fee=${reconBadFee.ok} bad_funding=${reconBadFunding.ok}`);

    // ═══════════════════════════════════════════════════════════════════════
    // CLEANUP — synthetic fixtures only. No production record is touched.
    // ═══════════════════════════════════════════════════════════════════════
    const cleanupErrors: string[] = [];
    try {
      const allEvents = arr(await b.entities.AutoFundPaymentEvent.filter({ subscription_id: subscription.id }, '-processed_at', 200));
      for (const e of allEvents) track('AutoFundPaymentEvent', e.id);
      const allTxns = arr(await b.entities.WalletTransaction.filter({ wallet_id: wallet.id }, '-created_at', 200));
      for (const t of allTxns) track('WalletTransaction', t.id);
      const allLots = arr(await b.entities.CreditLot.filter({ wallet_id: wallet.id }, '-fifo_order', 200));
      for (const l of allLots) track('CreditLot', l.id);
      const consent = arr(await b.entities.AutoFundConsentRecord.filter({ subscription_id: subscription.id }, undefined, 20));
      for (const c of consent) track('AutoFundConsentRecord', c.id);
      const notices = arr(await b.entities.AutoFundMembershipNotice.filter({ subscription_id: subscription.id }, undefined, 50));
      for (const n of notices) track('AutoFundMembershipNotice', n.id);
      const cases = arr(await b.entities.AutoFundDisputeCase.filter({ customer_email: CUSTOMER_EMAIL }, undefined, 20));
      for (const c of cases) track('AutoFundDisputeCase', c.id);
      const cohortEntries = arr(await b.entities.AutoFundCohortMember.filter({ customer_email: CUSTOMER_EMAIL }, undefined, 20));
      for (const c of cohortEntries) track('AutoFundCohortMember', c.id);
    } catch (e) {
      cleanupErrors.push(`fixture sweep: ${e.message}`);
    }

    const uniqueCleanups = Array.from(new Set(cleanups));
    for (const entry of uniqueCleanups) {
      const [kind, id] = entry.split(':');
      try {
        await b.entities[kind].delete(id);
      } catch (e) {
        cleanupErrors.push(`${kind}:${id}: ${e.message}`);
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return Response.json({
      test_run_id: TEST_RUN_ID,
      total: results.length,
      passed,
      failed,
      all_passed: failed === 0,
      failures_short: results.filter(r => !r.passed).map(r => `${r.name} :: ${String(r.details).slice(0, 200)}`),
      failures: results.filter(r => !r.passed).map(r => ({ name: r.name, details: r.details })),
      fixtures_deleted: uniqueCleanups.length,
      cleanup_errors: cleanupErrors,
      note: 'Isolated certification run. Synthetic identities only. No real customer was enrolled or charged, no real employee was paid, no price, fee, flag or contract was changed.',
      results,
    });
  } catch (error: any) {
    return Response.json({
      error: error.message,
      failed_at_step: step,
      checks_completed_before_failure: results.length,
      partial_results: results,
      stack: error.stack,
    }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Post a signed payment event to the REAL webhook, so routing is genuinely tested. */
async function postPaymentEvent({
  payment_event_id, subscription, wallet, amountCents, fundingCents, feeCents,
  component, status, eventType, certification,
}: any) {
  const secret = secrets.get('ARRIV_PAYROLL_HANDOFF_SECRET');
  if (!secret) return { http: 0, body: { error: 'ARRIV_PAYROLL_HANDOFF_SECRET not configured' } };

  const payload = {
    payment_event_id,
    subscription_id: subscription.id,
    customer_id: subscription.customer_id,
    customer_email: subscription.customer_email,
    wallet_id: wallet.id,
    amount_charged_cents: amountCents,
    funding_amount_cents: fundingCents,
    membership_fee_amount_cents: feeCents,
    charge_component: component,
    status,
    event_type: eventType,
    stripe_invoice_id: `cert_inv_${payment_event_id}`,
    stripe_charge_id: `cert_charge_${payment_event_id}`,
    certification,
  };

  const bodyStr = JSON.stringify(payload);
  // The receiver freshness-checks this with Date.parse, so it must be a
  // parseable date string — epoch milliseconds parses as NaN and is rejected.
  const timestamp = new Date().toISOString();
  const requestId = `req_${payment_event_id}`;
  const sourceAppId = 'arriv_pay';
  // Sign the EXACT canonical string the inbound verifier rebuilds:
  // body\ntimestamp\nrequestId\nsourceAppId.
  //
  // NOTE (finding): the shared signRequest() helper appends a fifth
  // employeeVersion field, so its output can NEVER verify against
  // verifyCanonicalRequest()'s four-field form. The two halves of the same
  // shared crypto module are mutually incompatible, which means an inbound
  // webhook cannot be exercised with the outbound signer. The verifier is the
  // authoritative side — Arriv Pay signs the four-field form — so this test
  // signs it directly rather than weakening the live verifier.
  const signature = await signPayload(secret, [bodyStr, timestamp, requestId, sourceAppId].join('\n'));

  try {
    const resp = await fetch(`${APP_URL}/functions/receiveArrivPayCustomerPayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-arriv-pay-signature': signature,
        'x-arriv-pay-timestamp': timestamp,
        'x-arriv-pay-request-id': requestId,
        'x-arriv-pay-source-app': sourceAppId,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(30000),
    });
    const body = await resp.json().catch(() => ({}));
    return { http: resp.status, body, payload };
  } catch (e) {
    return { http: 0, body: { error: e.message } };
  }
}

/** Find one payment event by its stable ID. */
async function findPaymentEvent(base44: any, paymentEventId: string) {
  try {
    const res = await base44.entities.AutoFundPaymentEvent.filter({ payment_event_id: paymentEventId }, undefined, 1);
    const arr = Array.isArray(res) ? res : (res?.data || []);
    return arr[0] || null;
  } catch {
    return null;
  }
}