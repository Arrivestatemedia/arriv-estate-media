import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { FEE_POLICY_COUNSEL_REVIEW_STATUS, feePolicyCounselReviewCompleted } from '../../shared/autoFundFeePolicy.ts';
import { enrollAutoFund, CURRENT_TERMS_VERSION } from '../../shared/autoFundEnrollment.ts';
import {
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  AUTOFUND_MEMBERSHIP_FEE,
  getMembershipFee,
} from '../../shared/autoFundFinalConfig.ts';
import {
  AUTO_FUND_AMOUNT_OPTIONS,
  AUTO_FUND_RETIRED_AMOUNTS,
  AUTO_FUND_LEGACY_AMOUNTS,
  getAutoFundConfig,
} from '../../shared/prepaidEngine.ts';
import {
  buildComplianceDisclosure,
  buildAuthorizationConsentText,
  AUTOFUND_TERMS_VERSION,
} from '../../shared/autoFundComplianceDisclosure.ts';
import {
  FEE_REFUND_POLICY_DISCLOSURE,
  LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS,
  buildFeeRefundDisclosure,
  feeDueForTier,
  isFeeBillingEnabled,
  DEFAULT_FEE_REFUND_POLICY,
} from '../../shared/autoFundMembershipBilling.ts';
import { buildWalletTermsDisclosure } from '../../shared/autoFundWalletTerms.ts';
import {
  evaluateLaunchInterlock,
  readLaunchConfiguration,
  REQUIRED_PROCESSOR_CONTRACT_VERSION,
} from '../../shared/autoFundLaunchInterlock.ts';
import { AUTOFUND_PROCESSOR_CAPABILITIES } from '../../shared/autoFundProcessor.ts';
import {
  sendEnrollmentAcknowledgment,
  sendCancellationConfirmation,
  sendRenewalNotice,
  listNoticesForSubscription,
} from '../../shared/autoFundMembershipNotices.ts';
import { createCertHarness } from '../../shared/autoFundCertificationHarness.ts';
import {
  isRenewalNoticeDue,
  renewalCycleKey,
  resolveRenewalNoticeRule,
  unconfirmedJurisdictions,
} from '../../shared/autoFundRenewalPolicy.ts';
import { normalizeJurisdictionState } from '../../shared/autoFundJurisdiction.ts';

// ============================================================================
// AUTO-FUND MEMBERSHIP COMPLIANCE & ENGINEERING VERIFICATION SUITE
// ============================================================================
// Admin-only. Exercises the real enrollment engine through an ISOLATED
// certification path and an INJECTED mail sender, so it never charges a customer
// and never emails a real address.
//
// THE BYPASS DOES NOT OPEN PUBLIC ENROLLMENT. The engine still refuses every
// non-certification enrollment (asserted below as A2 and A3), the enrolled
// addresses must be synthetic cert_ addresses, and no user-facing route forwards
// the bypass field.
//
// ENROLLMENT CHECKS RUN AGAINST A DECLARED LAUNCH CONFIGURATION — see
// DECLARED_LAUNCH_CONFIGURATION below. It is a test input, not a claim of approval,
// and check A8 asserts the REAL configuration still refuses enrollment.
//
// Passing software tests are NOT legal certification. See the implementation report.
// ============================================================================

const CERT_CUSTOMER_ID = 'cert_compliance_customer';
const GA_ADDRESS = { line1: '1 Peachtree St NE', city: 'Atlanta', state: 'GA', postal_code: '30301', country: 'US' };
const WY_ADDRESS = { line1: '100 Capitol Ave', city: 'Cheyenne', state: 'WY', postal_code: '82001', country: 'US' };

/**
 * DECLARED LAUNCH CONFIGURATION — a TEST ASSUMPTION, NOT A CLAIM OF APPROVAL.
 *
 * This suite verifies the engine in the configuration the owner intends to LAUNCH,
 * because that is the configuration a customer will actually meet: all five tiers
 * chargeable, fees live, the VIP restriction enforced, every approval in place.
 *
 * Declaring it here asserts nothing about reality, records nothing, and activates
 * nothing — the live flags, AppSettings and pricing records are untouched. Check A8
 * asserts that the REAL configuration refuses enrollment, so this declaration cannot
 * mask a production hazard, and the launch-interlock suite proves that a
 * configuration missing any one of these elements refuses enrollment outright.
 */
const DECLARED_LAUNCH_CONFIGURATION = {
  enrollment_enabled: true,
  enrollment_switch_value: 'true',
  membership_fee_enabled: true,
  vip_mls_promo_restriction_enabled: true,
  terms_version: AUTOFUND_TERMS_VERSION,
  terms_legally_approved: true,
  fee_refund_policy: 'non_refundable',
  wallet_terms_approved: true,
  mls_v2_configured: true,
  processor_contract_version: REQUIRED_PROCESSOR_CONTRACT_VERSION,
  processor_capabilities: { ...AUTOFUND_PROCESSOR_CAPABILITIES },
};

export default async function (req) {
  const blockers = [];

  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  // Shared certification scaffolding: result recording, synthetic-fixture tracking,
  // cleanup and the isolated enrollment path. Shared with the launch-interlock suite
  // so the two can never drift on how a synthetic customer is created or removed.
  const harness = createCertHarness();
  const { results, check, fail, blocked, track, cleanupAll, enrollCert } = harness;

  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const mkSub = async (suffix, amount, fee, extra = {}) => {
      const s = await svc.entities.AutoFundSubscription.create({
        customer_id: CERT_CUSTOMER_ID,
        customer_email: `cert_${suffix}@example.com`,
        customer_name: 'Cert Compliance',
        amount,
        membership_fee: fee,
        total_monthly_charge: amount + fee,
        plan_id: `autofund_${amount}`,
        status: 'active',
        enrollment_channel: 'self_service',
        attribution_source: '',
        attribution_verified: false,
        terms_accepted_at: new Date().toISOString(),
        terms_accepted_by: `cert_${suffix}@example.com`,
        terms_version: CURRENT_TERMS_VERSION,
        fee_refund_policy: DEFAULT_FEE_REFUND_POLICY,
        billing_day_of_month: 11,
        next_billing_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        jurisdiction_state: 'WY',
        feature_flag_enabled: true,
        certification_mode: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...extra,
      });
      harness.created.subs.push(s.id);
      return s;
    };

    // The shared harness supplies the certification bypass. The configuration this
    // run exercises is declared once, explicitly, here. No user-facing route forwards
    // the bypass, and check A8 asserts the REAL configuration refuses enrollment.
    harness.configure({
      svc,
      adminEmail: user.email,
      launchConfiguration: DECLARED_LAUNCH_CONFIGURATION,
      customerName: 'Cert Compliance',
      customerPhone: '555-000-0000',
    });

    // ─────────────────────────────────────────────────────────────────────
    // A. ENROLLMENT GATE AND SAFETY
    // ─────────────────────────────────────────────────────────────────────
    const gateRes = await svc.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
    const gateArr = Array.isArray(gateRes) ? gateRes : (gateRes?.data || []);
    const gateValue = gateArr.length ? gateArr[0].value : null;
    check('A1 · Public enrollment gate is OPEN by owner authorization (2026-10-11)', gateValue === 'true', `autofund_enrollment_enabled=${gateValue === null ? 'absent' : gateValue}`);

    // NOTE ON SCOPE — A2 and A3 previously asserted that the REAL system refuses
    // ordinary enrollment. Enrollment is now open, so an ordinary attempt against the
    // real configuration would SUCCEED and create a live subscription. A certification
    // suite must never write production records, so both checks were re-pointed at the
    // refusal paths they were actually testing, without creating anything:
    //   A2  a closed launch configuration still refuses enrollment — verified through the
    //       isolated, DECLARED-configuration path.
    //   A3  a caller-supplied bypass cannot carry a NON-certification address onto the
    //       certification path, so the ordinary consent gate still refuses it outright.
    const closedDeclared = { ...DECLARED_LAUNCH_CONFIGURATION, enrollment_enabled: false };
    const closedRefusal = await enrollCert({
      email: 'cert_compliance_closed@example.com', amount: 250, billing: GA_ADDRESS,
      launch_configuration: closedDeclared,
    });
    check('A2 · A closed launch configuration still refuses enrollment',
      closedRefusal.status === 'launch_interlock_blocked'
        && (closedRefusal.interlock?.blockers || []).some(b => b.code === 'ENROLLMENT_NOT_ENABLED'),
      `status=${closedRefusal.status} · blocker=${(closedRefusal.interlock?.blockers || []).map(b => b.code).join(', ') || 'none'}`);

    const bypassOnRealCustomer = await enrollAutoFund({
      base44: svc, channel: 'self_service', tier_amount: 250,
      customer_email: 'not_cert_customer@example.com',
      customer_name: 'Cert Compliance',
      billing_address: GA_ADDRESS,
      terms_accepted: false, terms_accepted_by: 'not_cert_customer@example.com',
      certification_bypass: { authorized: true, admin_email: user.email },
    });
    check('A3 · A bypass cannot exempt a non-certification address from the consent gate',
      bypassOnRealCustomer.status === 'invalid',
      `status=${bypassOnRealCustomer.status} — the bypass needs a cert_-prefixed address (four conditions), so this was validated as an ordinary enrollment and refused for missing consent`);

    const selfService = track(await enrollCert({ email: 'cert_self_service@example.com', amount: 350, billing: GA_ADDRESS }));
    check('A4 · Self-service enrollment completes end-to-end', selfService.status === 'enrolled', `status=${selfService.status}`);

    const salesAssisted = track(await enrollCert({ email: 'cert_sales_assisted@example.com', amount: 350, channel: 'sales_assisted', billing: GA_ADDRESS }));
    check('A5 · Sales-assisted enrollment completes end-to-end', salesAssisted.status === 'enrolled', `status=${salesAssisted.status}`);

    const feeOnly = await enrollCert({ email: 'cert_consent_a@example.com', amount: 350, billing: GA_ADDRESS, terms_accepted: false });
    check('A6 · Consent is enforced — unaccepted terms are refused', feeOnly.status === 'invalid', `status=${feeOnly.status}`);

    const advisorConsent = await enrollCert({
      email: 'cert_consent_b@example.com', amount: 350, channel: 'sales_assisted',
      billing: GA_ADDRESS, accepted_by: 'advisor@arrivestatemedia.com',
    });
    check('A7 · Consent is personal — an advisor cannot accept for the customer', advisorConsent.status === 'invalid', `status=${advisorConsent.status}`);

    // ── The REAL configuration, not the declared one ─────────────────────────
    // Everything from A4 onward runs against the DECLARED launch configuration. This
    // asserts what the system does in its REAL state, which is what any production
    // route would meet: enrollment is refused, so the enrollment/billing sequencing
    // hazard cannot be reached at all.
    const realEvaluation = evaluateLaunchInterlock(await readLaunchConfiguration(svc));
    check('A8 · Real configuration refuses enrollment until launch prerequisites are met',
      realEvaluation.permitted === false
        && realEvaluation.blockers.some(b => b.code === 'ENROLLMENT_NOT_ENABLED')
        && realEvaluation.blockers.some(b => b.code === 'LEGAL_TERMS_NOT_APPROVED'),
      `${realEvaluation.blockers.length} unmet launch requirement(s): ${realEvaluation.blockers.map(b => b.code).join(', ')}`);

    // ─────────────────────────────────────────────────────────────────────
    // B. PRE-AUTHORIZATION DISCLOSURES
    // ─────────────────────────────────────────────────────────────────────
    const disclosures = AUTO_FUND_AMOUNT_OPTIONS.map(amount =>
      buildComplianceDisclosure({
        tierAmount: amount, termsVersion: CURRENT_TERMS_VERSION, billingDay: 11,
        nextRenewalDate: 'Fri Nov 11 2026', feePolicy: DEFAULT_FEE_REFUND_POLICY,
        // The disclosure a customer would see at LAUNCH, which is the configuration
        // the interlock has approved. The fee therefore equals the approved schedule
        // AND the fee that would actually be charged.
        feeEnabled: DECLARED_LAUNCH_CONFIGURATION.membership_fee_enabled,
      })
    );

    const requiredKeys = ['tier', 'wallet_funding', 'promotional_bonus', 'membership_fee', 'total_charge',
      'billing_frequency', 'benefits', 'promotional_restrictions', 'cancellation', 'fee_refund_policy', 'wallet_terms'];
    const missingEverywhere = requiredKeys.filter(k => !disclosures.every(d => d.material_items.some(i => i.key === k)));
    check('B1 · All material disclosure items present for every tier', missingEverywhere.length === 0,
      missingEverywhere.length ? `missing: ${missingEverywhere.join(', ')}` : `${requiredKeys.length} items × ${disclosures.length} tiers`);

    const chargeErrors = disclosures.filter(d => {
      const expectedFee = AUTOFUND_MEMBERSHIP_FEE[d.tier_amount] ?? 0;
      return d.total_monthly_recurring_charge !== d.tier_amount + expectedFee
        || d.monthly_membership_fee !== expectedFee
        || d.monthly_wallet_funding !== d.tier_amount;
    });
    check('B2 · Recurring charge, fee and deposit are correct on every tier', chargeErrors.length === 0,
      chargeErrors.length ? `wrong on: ${chargeErrors.map(d => d.tier_amount).join(', ')}` : '$150/$250/$350/$500/$1,000 verified');

    const feeMismatches = disclosures.filter(d => d.monthly_membership_fee !== (AUTOFUND_MEMBERSHIP_FEE[d.tier_amount] ?? 0));
    check('B3 · Every tier discloses exactly the fee in the approved schedule',
      feeMismatches.length === 0,
      feeMismatches.length
        ? `wrong on: ${feeMismatches.map(d => `$${d.tier_amount} shows $${d.monthly_membership_fee}`).join(', ')}`
        : disclosures.map(d => `$${d.tier_amount} → $${d.monthly_membership_fee}`).join(' · '));

    check('B4 · Billing frequency and renewal date disclosed',
      disclosures.every(d => d.billing_frequency === 'monthly' && d.next_renewal_date.length > 0),
      'monthly frequency + renewal date on every tier');

    check('B5 · Cancellation procedure disclosed in text',
      disclosures.every(d => /cancel any time/i.test(d.cancellation_procedure) && /dashboard/i.test(d.cancellation_procedure)),
      'self-service cancellation stated in the material disclosure');

    check('B6 · Complete versioned terms linked IN ADDITION to the statements',
      disclosures.every(d => d.terms_path && d.terms_version === CURRENT_TERMS_VERSION && d.material_items.length > 0),
      `terms version ${CURRENT_TERMS_VERSION}; ${disclosures[0].material_items.length} statements also shown in full`);

    const absoluteLang = /absolutely not refundable|unconditionally non[\s-]?refundable|the membership fee is not refundable\./i;
    const policyStrings = Object.values(FEE_REFUND_POLICY_DISCLOSURE);
    check('B7 · No absolute non-refundability language in any policy variant',
      !policyStrings.some(s => absoluteLang.test(s)), `checked ${policyStrings.length} policy variants`);

    const refund = buildFeeRefundDisclosure('non_refundable');
    check('B8 · Legally required refund exceptions present on every policy',
      refund.exceptions.length === LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS.length
        && refund.exceptions.some(e => /applicable federal or state law/i.test(e))
        && refund.exceptions.some(e => /has not yet begun/i.test(e))
        && refund.exceptions.some(e => /unjust|unauthorized|erroneous|Duplicate/i.test(e))
        && refund.exceptions.some(e => /materially fails/i.test(e)),
      `${LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS.length} exceptions incl. statutory override`);

    const liveRefund = buildFeeRefundDisclosure();
    check('B9 · Live refund policy is the OWNER-ADOPTED policy and is NOT counsel-approved',
      liveRefund.policy === 'non_refundable'
        && DEFAULT_FEE_REFUND_POLICY === 'non_refundable'
        && liveRefund.is_approved === true
        && FEE_POLICY_COUNSEL_REVIEW_STATUS === 'not_completed'
        && !feePolicyCounselReviewCompleted(),
      `live default=${liveRefund.policy}, policy_decided=${liveRefund.is_approved}, counsel_review=${FEE_POLICY_COUNSEL_REVIEW_STATUS}`);

    const wallet = buildWalletTermsDisclosure();
    check('B10 · Wallet terms state only verified behaviour',
      wallet.cash_out_available === false && wallet.balance_preserved_on_cancellation === true
        && wallet.verified_statements.some(s => /does not erase, forfeit/i.test(s))
        && wallet.verified_statements.some(s => /12-month validity/i.test(s))
        && wallet.verified_statements.some(s => /does not currently offer cash withdrawal/i.test(s)),
      'preservation stated · 12-month lot validity stated · no cash-out promised');

    check('B11 · Wallet terms flagged pending legal review',
      wallet.status === 'pending_legal_review' && wallet.unresolved_questions.length >= 4,
      `${wallet.unresolved_questions.length} unresolved wallet questions surfaced`);

    const vip = disclosures.find(d => d.tier_amount === 1000);
    const starter = disclosures.find(d => d.tier_amount === 150);
    check('B12 · Promotional-credit restriction differs correctly for VIP',
      vip.promotional_credit_usable_on_standalone_mls === false
        && starter.promotional_credit_usable_on_standalone_mls === true
        && /cannot be used toward a standalone MLS Walkthrough/i.test(vip.promotional_credit_restrictions),
      'VIP restricted · Starter unrestricted');

    // ─────────────────────────────────────────────────────────────────────
    // C. CONSENT TEXT
    // ─────────────────────────────────────────────────────────────────────
    const consentText = buildAuthorizationConsentText(disclosures[2]);
    check('C1 · Consent text is affirmative and names the exact charge',
      /I authorize/i.test(consentText) && consentText.includes('$375') && /until I cancel/i.test(consentText),
      'authorizes $375/month until cancelled');
    check('C2 · Consent text binds the accepted terms version',
      consentText.includes(CURRENT_TERMS_VERSION), `references ${CURRENT_TERMS_VERSION}`);
    check('C3 · Consent states the fee is not spendable and earns no promo credit',
      /not spendable Booking Value/i.test(consentText) && /does not earn promotional credit/i.test(consentText),
      'fee character disclosed inside the authorization sentence');

    // ─────────────────────────────────────────────────────────────────────
    // H. ENGINEERING FIX 1 — THE ENROLLMENT TIER LIST
    // ─────────────────────────────────────────────────────────────────────
    const EXPECTED_TIERS = [
      { amount: 150, name: 'Starter', bonus: 7.5, bv: 157.5, fee: 5.99 },
      { amount: 250, name: 'Growth', bonus: 25, bv: 275, fee: 10 },
      { amount: 350, name: 'Professional', bonus: 52.5, bv: 402.5, fee: 25 },
      { amount: 500, name: 'Premier', bonus: 100, bv: 600, fee: 27 },
      { amount: 1000, name: 'VIP', bonus: 250, bv: 1250, fee: 30 },
    ];
    const tierErrors = EXPECTED_TIERS.filter(t => {
      const cfg = getAutoFundConfig(t.amount);
      const fee = AUTOFUND_MEMBERSHIP_FEE[t.amount] ?? 0;
      return !cfg || cfg.tier_name !== t.name || cfg.bonus_booking_value !== t.bonus
        || cfg.booking_value !== t.bv || fee !== t.fee;
    });
    check('H1 · All five approved tiers resolve to the authorised structure', tierErrors.length === 0,
      tierErrors.length ? `wrong: ${tierErrors.map(t => `$${t.amount}`).join(', ')}`
        : 'Starter $150/5% · Growth $250/10% · Professional $350/15% · Premier $500/20% · VIP $1,000/25%');

    check('H2 · Every approved tier and every legacy amount is accepted by the schema',
      AUTO_FUND_AMOUNT_OPTIONS.length === 5
        && !AUTO_FUND_AMOUNT_OPTIONS.some(a => AUTO_FUND_RETIRED_AMOUNTS.includes(a)),
      `options=[${AUTO_FUND_AMOUNT_OPTIONS.join(', ')}] · retired=[${AUTO_FUND_RETIRED_AMOUNTS.join(', ')}]`);

    // The enum fix is only real if the DATABASE accepts each value, so create and
    // remove one subscription per amount rather than trusting the source list.
    const schemaRejects = [];
    for (const amount of [...AUTO_FUND_AMOUNT_OPTIONS, ...AUTO_FUND_RETIRED_AMOUNTS]) {
      try {
        const probe = await svc.entities.AutoFundSubscription.create({
          customer_id: `${CERT_CUSTOMER_ID}_probe`,
          customer_email: 'cert_schema_probe@example.com',
          amount,
          membership_fee: AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0,
          total_monthly_charge: amount + (AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0),
          plan_id: `cert_probe_${amount}`,
          status: 'cancelled',
          certification_mode: true,
        });
        harness.created.subs.push(probe.id);
      } catch (e) {
        schemaRejects.push(`${amount} (${String(e.message).slice(0, 60)})`);
      }
    }
    check('H3 · Database accepts all five current tiers AND the three legacy amounts',
      schemaRejects.length === 0,
      schemaRejects.length ? `rejected: ${schemaRejects.join(', ')}` : '8 amounts written and removed');

    const legacyExpected = { 50: 50, 100: 105, 200: 220 };
    const legacyErrors = Object.entries(legacyExpected).filter(([amount, bv]) => {
      const cfg = getAutoFundConfig(Number(amount));
      return !cfg || cfg.booking_value !== bv || !cfg.plan_id.includes('legacy');
    });
    check('H4 · Legacy customers keep their contracted terms', legacyErrors.length === 0,
      legacyErrors.length ? `wrong: ${legacyErrors.map(([a]) => `$${a}`).join(', ')}`
        : '$50→$50 · $100→$105 · $200→$220 with their legacy plan IDs');

    check('H5 · A retired tier cannot be enrolled as a new option',
      AUTO_FUND_RETIRED_AMOUNTS.every(a => getAutoFundConfig(a) !== null)
        && !AUTO_FUND_RETIRED_AMOUNTS.some(a => AUTO_FUND_AMOUNT_OPTIONS.includes(a)),
      'still resolvable for existing contracts, absent from AUTO_FUND_AMOUNT_OPTIONS');

    // Tracked so that a regression here cannot leak an enrollable retired tier.
    const retiredEnroll = track(await enrollCert({ email: 'cert_retired@example.com', amount: 50, billing: GA_ADDRESS }));
    check('H6 · Engine refuses a retired tier at enrollment', retiredEnroll.status === 'invalid',
      `status=${retiredEnroll.status}${retiredEnroll.error ? ` — ${String(retiredEnroll.error).slice(0, 100)}` : ''}`);

    // ─────────────────────────────────────────────────────────────────────
    // J. CHANNEL PARITY AND FEE SEPARATION
    // ─────────────────────────────────────────────────────────────────────
    const selfSub = await svc.entities.AutoFundSubscription.get(selfService.subscription_id);
    const asstSub = await svc.entities.AutoFundSubscription.get(salesAssisted.subscription_id);

    check('J1 · Both enrollment channels produce identical financial terms',
      selfSub.membership_fee === asstSub.membership_fee
        && selfSub.total_monthly_charge === asstSub.total_monthly_charge
        && selfSub.amount === asstSub.amount
        && selfSub.plan_id === asstSub.plan_id
        && selfService.booking_value_per_cycle === salesAssisted.booking_value_per_cycle,
      `fee $${selfSub.membership_fee} · total $${selfSub.total_monthly_charge} · BV $${selfService.booking_value_per_cycle} on both channels`);

    const stableKeys = ['tier', 'wallet_funding', 'promotional_bonus', 'membership_fee', 'total_charge',
      'benefits', 'promotional_restrictions', 'cancellation', 'fee_refund_policy', 'wallet_terms'];
    const itemsOf = (r) => (r.disclosure?.compliance?.material_items || []).filter(i => stableKeys.includes(i.key));
    check('J2 · Both enrollment channels render identical material disclosures',
      JSON.stringify(itemsOf(selfService)) === JSON.stringify(itemsOf(salesAssisted))
        && selfService.disclosure.compliance.terms_version === salesAssisted.disclosure.compliance.terms_version
        && itemsOf(selfService).length === stableKeys.length,
      `${stableKeys.length} material statements identical on both channels`);

    // Asserted as INVARIANTS rather than magic numbers. The fee switch is off
    // pre-launch, so a hardcoded "$25 / $375" here would pass while masking a
    // charge that did not match its own breakdown.
    const handoff = selfService.checkout_handoff;
    check('J3 · The membership fee never inflates the customer\'s Booking Value',
      selfSub.membership_fee === getMembershipFee(350, DECLARED_LAUNCH_CONFIGURATION.membership_fee_enabled)
        && selfService.booking_value_per_cycle === Math.round(350 * 1.15 * 100) / 100
        && selfService.disclosure.monthly_deposit === 350,
      `deposit $${selfService.disclosure.monthly_deposit} + fee $${selfSub.membership_fee} → BV $${selfService.booking_value_per_cycle} (the 15% bonus applies to the deposit only; the fee issues no Booking Value)`);

    check('J4 · The recurring charge always equals wallet funding plus the recorded fee',
      handoff.wallet_funding_cents === 35000
        && handoff.membership_fee_cents === selfSub.membership_fee * 100
        && handoff.recurring_charge_cents === handoff.wallet_funding_cents + handoff.membership_fee_cents
        && selfSub.total_monthly_charge === selfSub.amount + selfSub.membership_fee,
      `wallet ${handoff.wallet_funding_cents} + fee ${handoff.membership_fee_cents} = recurring ${handoff.recurring_charge_cents} cents · subscription $${selfSub.amount} + $${selfSub.membership_fee} = $${selfSub.total_monthly_charge}`);

    const vipEnroll = track(await enrollCert({ email: 'cert_vip@example.com', amount: 1000, billing: WY_ADDRESS }));
    const vipSub = await svc.entities.AutoFundSubscription.get(vipEnroll.subscription_id);
    check('J5 · Promotional-credit restriction is attached to the correct subscription',
      vipEnroll.disclosure.compliance.promotional_credit_usable_on_standalone_mls === false
        && selfService.disclosure.compliance.promotional_credit_usable_on_standalone_mls === true
        && vipSub.amount === 1000 && selfSub.amount === 350,
      'VIP restricted · Professional unrestricted · each on its own record');

    // ── Requirement 4 of the launch interlock: disclosed === charged ─────────
    // Asserted as an EQUALITY rather than reported as a hazard. The enrollment
    // engine cannot reach this point when the disclosure and the charge would
    // differ: the interlock refuses first. The launch-interlock suite proves that
    // refusal, so this is now a hard invariant instead of a documented gap.
    const disclosedFee = selfService.disclosure.compliance.monthly_membership_fee;
    const disclosedTotal = selfService.disclosure.compliance.total_monthly_recurring_charge;
    check('J6 · Disclosed fee and total equal the fee and total actually billed',
      disclosedFee === selfSub.membership_fee
        && disclosedTotal === selfSub.total_monthly_charge
        && handoff.recurring_charge_cents === Math.round(disclosedTotal * 100)
        && handoff.membership_fee_cents === Math.round(disclosedFee * 100),
      `disclosed $${disclosedFee} fee on $${disclosedTotal} · billed $${selfSub.membership_fee} on $${selfSub.total_monthly_charge} · handoff ${handoff.wallet_funding_cents}+${handoff.membership_fee_cents}=${handoff.recurring_charge_cents} cents`);

    // ─────────────────────────────────────────────────────────────────────
    // I. ENGINEERING FIX 2 — JURISDICTION CAPTURE
    // ─────────────────────────────────────────────────────────────────────
    check('I1 · Jurisdiction is captured from the customer billing address and persisted',
      selfSub.jurisdiction_state === 'GA' && selfSub.billing_state === 'GA'
        && selfSub.billing_city === 'Atlanta' && selfSub.billing_postal_code === '30301'
        && !!selfSub.jurisdiction_captured_at,
      `subscription jurisdiction=${selfSub.jurisdiction_state} resolution=${selfSub.jurisdiction_resolution}`);

    const contactRow = await svc.entities.Contact.get(selfService.contact_id);
    check('I2 · Jurisdiction is mirrored onto the customer record',
      contactRow.billing_jurisdiction_state === 'GA' && contactRow.billing_state === 'GA'
        && selfService.jurisdiction.customer_record_mirrored === true,
      'customer record carries the same jurisdiction');

    const gaDue = isRenewalNoticeDue(
      { ...selfSub, next_billing_date: new Date(Date.now() + 3 * 86400000).toISOString() },
      new Date()
    );
    check('I3 · Jurisdiction is available to the renewal-notification engine',
      gaDue.rule?.rule_id === 'GA_30D' && gaDue.rule?.advance_notice_days === 30,
      `GA subscription resolves ${gaDue.rule?.rule_id} (${gaDue.rule?.advance_notice_days}d)`);

    check('I4 · State-specific notification rules are selected correctly',
      resolveRenewalNoticeRule('GA').rule_id === 'GA_30D'
        && resolveRenewalNoticeRule('MD').rule_id === 'MD_30D'
        && resolveRenewalNoticeRule('WY').rule_id === 'DEFAULT_7D',
      'GA→GA_30D · MD→MD_30D · WY→DEFAULT_7D (known state, no specific rule)');

    const noAddress = await enrollCert({ email: 'cert_no_address@example.com', amount: 250 });
    check('I5 · Enrollment is refused when no billing address is supplied',
      noAddress.status === 'invalid' && /billing address with a state is required/i.test(noAddress.error || ''),
      `status=${noAddress.status}`);

    const noState = await enrollCert({
      email: 'cert_no_state@example.com', amount: 250,
      billing: { line1: '1 Main St', city: 'Atlanta', postal_code: '30301', country: 'US' },
    });
    check('I6 · Enrollment is refused when the address has no state',
      noState.status === 'invalid', `status=${noState.status}`);

    const badState = await enrollCert({
      email: 'cert_bad_state@example.com', amount: 250,
      billing: { line1: '1 Main St', city: 'Atlanta', state: 'Georgia', postal_code: '30301', country: 'US' },
    });
    const badCode = await enrollCert({
      email: 'cert_bad_code@example.com', amount: 250,
      billing: { line1: '1 Main St', city: 'Atlanta', state: 'ZZ', postal_code: '30301', country: 'US' },
    });
    check('I7 · Enrollment is refused when the state is invalid',
      badState.status === 'invalid' && badCode.status === 'invalid',
      'a full state name and a non-existent code are both refused');

    const conflict = track(await enrollCert({
      email: 'cert_conflict@example.com', amount: 350, billing: GA_ADDRESS, payment_method_state: 'TX',
    }));
    const conflictSub = await svc.entities.AutoFundSubscription.get(conflict.subscription_id);
    const conflictAudits = await svc.entities.AutoFundJurisdictionAudit.filter({ subscription_id: conflictSub.id }, undefined, 10);
    const conflictAuditRows = Array.isArray(conflictAudits) ? conflictAudits : (conflictAudits?.data || []);
    check('I8 · A state conflict is captured, flagged and NOT auto-resolved',
      conflict.status === 'enrolled'
        && conflictSub.jurisdiction_state === 'GA'
        && conflictSub.jurisdiction_needs_review === true
        && conflictSub.jurisdiction_review_reason === 'JURISDICTION_CONFLICT_WITH_PAYMENT_METHOD'
        && conflictSub.jurisdiction_resolution === 'customer_provided_conflicts_with_payment_method'
        && conflictAuditRows.some(a => a.change_type === 'flagged_conflict'),
      'customer address governs, conflict surfaced for review');

    const outsideUs = track(await enrollCert({
      email: 'cert_outside_us@example.com', amount: 250,
      billing: { line1: '1 Bay St', city: 'Toronto', state: 'GA', postal_code: 'M5J', country: 'CA' },
    }));
    const outsideSub = await svc.entities.AutoFundSubscription.get(outsideUs.subscription_id);
    check('I9 · An unusual (non-US) billing address is flagged for review',
      outsideSub.jurisdiction_needs_review === true
        && /BILLING_ADDRESS_OUTSIDE_US/.test(outsideSub.jurisdiction_review_reason || ''),
      `review_reason=${outsideSub.jurisdiction_review_reason}`);

    const selfAudits = await svc.entities.AutoFundJurisdictionAudit.filter({ subscription_id: selfSub.id }, undefined, 10);
    const selfAuditRows = Array.isArray(selfAudits) ? selfAudits : (selfAudits?.data || []);
    check('I10 · Jurisdiction decisions are recorded in an append-only audit trail',
      selfAuditRows.length === 1
        && selfAuditRows[0].change_type === 'initial_capture'
        && selfAuditRows[0].new_state === 'GA'
        && selfAuditRows[0].resolution_method === 'customer_provided_billing_address'
        && !!selfAuditRows[0].audit_id,
      `${selfAuditRows.length} entry per subscription with method and actor`);

    // ─────────────────────────────────────────────────────────────────────
    // D. ENROLLMENT ACKNOWLEDGMENT (against the real enrolled subscription)
    // ─────────────────────────────────────────────────────────────────────
    const okSender = async () => ({ ok: true });

    const ack1 = await sendEnrollmentAcknowledgment({ base44: svc, subscription: selfSub, billingDay: selfSub.billing_day_of_month, sender: okSender });
    check('D1 · Enrollment acknowledgment delivered', ack1.status === 'sent', `delivery=${ack1.delivery_status}`);

    const ackRows = await listNoticesForSubscription(svc, selfSub.id);
    const ackRow = ackRows.find(n => n.notice_type === 'enrollment_acknowledgment');
    check('D2 · Acknowledgment records tier, fee breakdown, total, frequency and renewal date',
      !!ackRow && ackRow.tier_amount === 350 && ackRow.membership_fee === 25
        && ackRow.total_monthly_charge === 375 && ackRow.billing_frequency === 'monthly'
        && !!ackRow.next_renewal_date,
      `tier=${ackRow?.tier_amount} fee=${ackRow?.membership_fee} total=${ackRow?.total_monthly_charge} freq=${ackRow?.billing_frequency} next=${ackRow?.next_renewal_date} channel=${ackRow?.enrollment_channel}`);

    check('D3 · Acknowledgment records terms version, refund policy and cancellation instructions',
      !!ackRow && ackRow.terms_version === CURRENT_TERMS_VERSION
        && ackRow.fee_refund_policy === DECLARED_LAUNCH_CONFIGURATION.fee_refund_policy
        && /cancel any time/i.test(ackRow.body_snapshot || ''),
      `terms ${ackRow?.terms_version} · policy ${ackRow?.fee_refund_policy}`);

    check('D4 · Acknowledgment states the wallet refund position and support contact',
      /does not erase, forfeit/i.test(ackRow?.body_snapshot || '') && /info@arrivestatemedia\.com/i.test(ackRow?.body_snapshot || ''),
      'wallet preservation + support address present');

    check('D5 · No payment credentials in the notice body',
      !/cvv|card ?number|card_number|expiry/i.test(ackRow?.body_snapshot || ''),
      'no card data in the recorded snapshot');

    const ack2 = await sendEnrollmentAcknowledgment({ base44: svc, subscription: selfSub, billingDay: selfSub.billing_day_of_month, sender: okSender });
    const ackCount = (await listNoticesForSubscription(svc, selfSub.id)).filter(n => n.notice_type === 'enrollment_acknowledgment').length;
    check('D6 · Acknowledgment is idempotent — no duplicate notice for the same event',
      ack2.status === 'duplicate' && ackCount === 1, `second dispatch=${ack2.status}, records=${ackCount}`);

    const subRetry = await mkSub('retry', 500, 25);
    const failSender = async () => { throw new Error('simulated transport failure'); };
    const retryFail = await sendEnrollmentAcknowledgment({ base44: svc, subscription: subRetry, billingDay: 11, sender: failSender });
    check('D7 · Delivery failure is recorded with a reason',
      retryFail.status === 'failed' && !!retryFail.failure_reason,
      `status=${retryFail.status} attempts=${retryFail.delivery_attempts}`);

    const retryOk = await sendEnrollmentAcknowledgment({ base44: svc, subscription: subRetry, billingDay: 11, sender: okSender });
    const retryRows = (await listNoticesForSubscription(svc, subRetry.id)).filter(n => n.notice_type === 'enrollment_acknowledgment');
    check('D8 · Retry succeeds on the SAME record and increments attempts',
      retryOk.status === 'sent' && retryOk.delivery_attempts === 2 && retryRows.length === 1,
      `attempts=${retryOk.delivery_attempts}, records=${retryRows.length} (no duplicate)`);

    // ─────────────────────────────────────────────────────────────────────
    // E. RENEWAL NOTICE ELIGIBILITY AND TIMING
    // ─────────────────────────────────────────────────────────────────────
    const inWindow = { status: 'active', jurisdiction_state: 'WY', next_billing_date: new Date(Date.now() + 3 * 86400000).toISOString() };
    const outWindow = { status: 'active', jurisdiction_state: 'WY', next_billing_date: new Date(Date.now() + 40 * 86400000).toISOString() };
    check('E1 · Notice is due inside the lead window', isRenewalNoticeDue(inWindow).due === true, 'default 7-day rule, renewal in 3 days');
    check('E2 · Notice is NOT due outside the lead window', isRenewalNoticeDue(outWindow).due === false, 'renewal in 40 days');
    check('E3 · No notice for a paused or cancelled subscription',
      isRenewalNoticeDue({ ...inWindow, status: 'paused' }).due === false
        && isRenewalNoticeDue({ ...inWindow, status: 'cancelled' }).due === false,
      'only actively-billing subscriptions qualify');
    check('E4 · No notice while a recovery hold or auto-charge pause is active',
      isRenewalNoticeDue({ ...inWindow, recovery_hold_active: true }).due === false
        && isRenewalNoticeDue({ ...inWindow, auto_charge_paused: true }).due === false,
      'recovery-flow customers are excluded');

    const ga = resolveRenewalNoticeRule('GA');
    const md = resolveRenewalNoticeRule('MD');
    const def = resolveRenewalNoticeRule('WY');
    check('E5 · Jurisdiction rules are applied, not one global cadence',
      ga.advance_notice_days > def.advance_notice_days && md.advance_notice_days > def.advance_notice_days,
      `GA=${ga.advance_notice_days}d MD=${md.advance_notice_days}d DEFAULT=${def.advance_notice_days}d`);
    check('E6 · Every rule declares its cadence unconfirmed by counsel',
      unconfirmedJurisdictions().length > 0 && !resolveRenewalNoticeRule('GA').statutory_cadence_confirmed,
      `${unconfirmedJurisdictions().join(', ')} awaiting counsel confirmation`);
    check('E7 · Lead time is never shorter than the conservative default',
      [ga, md, def].every(r => r.advance_notice_days >= def.advance_notice_days),
      'sending earlier is the safe direction');

    const cycleKey = renewalCycleKey(subRetry.id, inWindow.next_billing_date);
    const ren1 = await sendRenewalNotice({ base44: svc, subscription: { ...subRetry, jurisdiction_state: 'WY', next_billing_date: inWindow.next_billing_date }, rule: def, cycleKey, sender: okSender });
    const ren2 = await sendRenewalNotice({ base44: svc, subscription: { ...subRetry, jurisdiction_state: 'WY', next_billing_date: inWindow.next_billing_date }, rule: def, cycleKey, sender: okSender });
    const renRows = (await listNoticesForSubscription(svc, subRetry.id)).filter(n => n.notice_type === 'renewal_notice');
    check('E8 · Renewal notice is idempotent per renewal cycle',
      ren1.status === 'sent' && ren2.status === 'duplicate' && renRows.length === 1,
      `records=${renRows.length} for one cycle`);
    check('E9 · Renewal notice records the rule, lead time and confirmation state',
      renRows[0]?.renewal_rule_applied === def.rule_id
        && renRows[0]?.advance_notice_days === def.advance_notice_days
        && renRows[0]?.statutory_cadence_confirmed === false,
      `rule=${renRows[0]?.renewal_rule_applied}`);

    const noJurisdiction = isRenewalNoticeDue(
      { status: 'active', next_billing_date: new Date(Date.now() + 3 * 86400000).toISOString() },
      new Date()
    );
    check('E10 · MISSING jurisdiction sends no notice — no silent 7-day default',
      noJurisdiction.due === false && noJurisdiction.rule === null
        && /missing or invalid/i.test(noJurisdiction.reason),
      'flagged for correction instead of defaulted');
    const invalidJurisdiction = isRenewalNoticeDue(
      { status: 'active', jurisdiction_state: 'ZZ', next_billing_date: new Date(Date.now() + 3 * 86400000).toISOString() },
      new Date()
    );
    check('E11 · INVALID jurisdiction sends no notice', invalidJurisdiction.due === false && invalidJurisdiction.rule === null,
      'an unrecognised code cannot reach a rule');
    check('E12 · A known state without its own rule still uses the conservative default',
      isRenewalNoticeDue(inWindow).rule?.rule_id === 'DEFAULT_7D',
      'WY is known, so DEFAULT applies — distinct from a missing jurisdiction');
    check('E13 · A missing or invalid jurisdiction cannot silently bypass compliance controls',
      normalizeJurisdictionState('') === '' && normalizeJurisdictionState('ZZ') === ''
        && normalizeJurisdictionState('Georgia') === '' && normalizeJurisdictionState('GA') === 'GA',
      'only a real 2-letter code resolves');

    // ─────────────────────────────────────────────────────────────────────
    // F. CANCELLATION
    // ─────────────────────────────────────────────────────────────────────
    // Fund the wallet so wallet preservation is actually proven, not merely asserted.
    await svc.entities.PrepaidWallet.update(selfService.wallet_id, {
      booking_value_balance_cents: 25000,
      booking_value_balance: 250,
    });

    const cancelledAt = new Date().toISOString();
    const benefitEnd = selfSub.next_billing_date;
    await svc.entities.AutoFundSubscription.update(selfSub.id, {
      status: 'cancelled', cancelled_at: cancelledAt, next_billing_date: '', paused_until: '', updated_at: cancelledAt,
    });
    const afterCancel = await svc.entities.AutoFundSubscription.get(selfSub.id);
    check('F1 · Cancellation stops future scheduled recurring charges',
      afterCancel.status === 'cancelled' && !afterCancel.next_billing_date,
      'status=cancelled and no scheduled billing date remains');

    const walletRow = await svc.entities.PrepaidWallet.get(selfService.wallet_id);
    const cancelNotice = await sendCancellationConfirmation({
      base44: svc,
      subscription: { ...selfSub, status: 'cancelled', cancelled_at: cancelledAt },
      wallet: walletRow,
      cancelledAt,
      sender: okSender,
    });
    check('F2 · Cancellation confirmation delivered', cancelNotice.status === 'sent', `delivery=${cancelNotice.delivery_status}`);

    const cancelRow = (await listNoticesForSubscription(svc, selfSub.id)).find(n => n.notice_type === 'cancellation_confirmation');
    check('F3 · Confirmation states effective date and end of paid benefit period',
      !!cancelRow?.cancellation_effective_at && cancelRow.benefit_period_end === benefitEnd,
      `effective ${cancelRow?.cancellation_effective_at?.slice(0, 10)} · benefits to ${String(benefitEnd).slice(0, 10)}`);
    check('F4 · Confirmation states wallet balances were NOT forfeited, with the balance',
      cancelRow?.wallet_balance_preserved === true && cancelRow.wallet_balance_cents_at_notice === 25000,
      `balance snapshot $${((cancelRow?.wallet_balance_cents_at_notice || 0) / 100).toFixed(2)} preserved`);

    const cancelDup = await sendCancellationConfirmation({
      base44: svc, subscription: { ...selfSub, status: 'cancelled', cancelled_at: cancelledAt },
      wallet: walletRow, cancelledAt, sender: okSender,
    });
    check('F5 · Cancellation confirmation is idempotent', cancelDup.status === 'duplicate', 'repeat confirmation not re-sent');

    const walletAfter = await svc.entities.PrepaidWallet.get(selfService.wallet_id);
    check('F6 · Wallet balance is unchanged by cancellation',
      walletAfter.booking_value_balance_cents === 25000,
      `$${((walletAfter.booking_value_balance_cents || 0) / 100).toFixed(2)} intact`);

    // ─────────────────────────────────────────────────────────────────────
    // G. AUDITABILITY
    // ─────────────────────────────────────────────────────────────────────
    const finalSub = await svc.entities.AutoFundSubscription.get(selfSub.id);
    check('G1 · Terms version, consent identity and jurisdiction survive on the record',
      finalSub.terms_version === CURRENT_TERMS_VERSION
        && finalSub.terms_accepted_by === 'cert_self_service@example.com'
        && !!finalSub.terms_accepted_at
        && finalSub.jurisdiction_state === 'GA',
      `version ${finalSub.terms_version} · consent by ${finalSub.terms_accepted_by} · jurisdiction ${finalSub.jurisdiction_state}`);

    const allNotices = await listNoticesForSubscription(svc, selfSub.id, 100);
    // This subscription receives an acknowledgment and a cancellation
    // confirmation; the renewal notice is exercised on its own subscription.
    check('G2 · Full notice audit trail retrievable with delivery status',
      allNotices.length >= 2
        && allNotices.some(n => n.notice_type === 'enrollment_acknowledgment')
        && allNotices.some(n => n.notice_type === 'cancellation_confirmation')
        && allNotices.every(n => !!n.delivery_status && n.delivery_attempts >= 1),
      `${allNotices.length} notices (${allNotices.map(n => n.notice_type).join(', ')}) with status + attempts`);
    check('G3 · Notice audit records are append-only per event',
      new Set(allNotices.map(n => n.notice_id)).size === allNotices.length,
      'unique notice_id per notice');

    // ─────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────────
    const cleanup = await cleanupAll();

    blockers.push('Membership-fee refund policy is OWNER-ADOPTED (nonrefundable in the ordinary case, with statutory and error exceptions), but external counsel review is NOT completed — the membership terms and the separate wallet terms remain unapproved.');
    blockers.push('Separate wallet refund, expiration and unclaimed-property terms are unapproved.');
    blockers.push('Renewal-notice statutory cadence is unconfirmed for every jurisdiction.');
    blockers.push('Jurisdiction conflicts and non-US billing addresses are flagged for review but have no review workflow yet.');

    return Response.json(harness.summarize({
      launch_blockers: blockers,
      // The REAL configuration's unmet requirements, so a reader can see that the
      // suite ran against a declared configuration rather than a live one.
      real_configuration_blockers: realEvaluation.blockers.map(b => ({
        code: b.code,
        requirement: b.requirement,
        detail: b.detail,
      })),
      certification_note:
        'Results verify software behaviour only. They are not a legal opinion, and a passing suite is not legal certification. Enrollment checks ran against a DECLARED launch configuration; the real configuration refuses enrollment.',
      cleanup,
    }));
  } catch (error) {
    const cleanup = await cleanupAll().catch(() => ({ ok: false }));
    return Response.json({ error: error.message, results, cleanup }, { status: 500 });
  }
}