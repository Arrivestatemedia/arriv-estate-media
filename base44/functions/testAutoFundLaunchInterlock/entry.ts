import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { createCertHarness } from '../../shared/autoFundCertificationHarness.ts';
import { AUTOFUND_ENROLLMENT_FLAG_KEY, AUTOFUND_MEMBERSHIP_FEE } from '../../shared/autoFundFinalConfig.ts';
import { AUTO_FUND_AMOUNT_OPTIONS } from '../../shared/prepaidEngine.ts';
import { AUTOFUND_TERMS_VERSION } from '../../shared/autoFundComplianceDisclosure.ts';
import { AUTOFUND_PROCESSOR_CAPABILITIES } from '../../shared/autoFundProcessor.ts';
import {
  evaluateLaunchInterlock,
  readLaunchConfiguration,
  REQUIRED_PROCESSOR_CONTRACT_VERSION,
} from '../../shared/autoFundLaunchInterlock.ts';

// ============================================================================
// AUTO-FUND LAUNCH INTERLOCK — VERIFICATION SUITE
// ============================================================================
// Admin-only. Proves the fail-closed interlock actually fails closed.
//
// Two things must BOTH be true for the interlock to be worth anything:
//
//   1. A COMPLETE configuration PERMITS enrollment. An interlock that refuses
//      everything is not a safety control, it is a broken feature — so the
//      complete configuration is asserted to permit, on all five tiers, with
//      each tier's disclosure equal to the amount to be charged.
//
//   2. EVERY broken configuration REFUSES enrollment, naming the unmet
//      requirement. Each failure mode is injected deliberately rather than
//      assumed to be caught.
//
// The injections are explicit, declared test inputs. The live feature flags,
// AppSettings and pricing records are never modified, and the real configuration
// is asserted to still refuse enrollment.
//
// Production records are fingerprinted before and after the run, so a regression
// that mutated a subscription, a wallet balance or a payment record cannot pass.
//
// Passing software tests are NOT legal certification.
// ============================================================================

const GA_ADDRESS = { line1: '1 Peachtree St NE', city: 'Atlanta', state: 'GA', postal_code: '30301', country: 'US' };

/** A complete configuration. A DECLARED TEST ASSUMPTION, never a claim of approval. */
const COMPLETE_CONFIGURATION = {
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
  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  // Shared certification scaffolding — the same harness the membership compliance
  // suite runs on, so the two cannot drift on fixture creation or cleanup.
  const harness = createCertHarness();
  const { check, fail, blocked, track, cleanupAll, fingerprint, enrollCert } = harness;

  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    harness.configure({
      svc,
      adminEmail: user.email,
      launchConfiguration: COMPLETE_CONFIGURATION,
      customerName: 'Cert Interlock',
    });

    const before = await fingerprint();
    const realConfig = await readLaunchConfiguration(svc);
    const real = evaluateLaunchInterlock(realConfig);

    // ─────────────────────────────────────────────────────────────────────
    // K1. THE REAL CONFIGURATION REFUSES
    // ─────────────────────────────────────────────────────────────────────
    const realCodes = real.blockers.map(b => b.code);
    check('K1 · The real configuration refuses enrollment and names every remaining unmet requirement',
      real.permitted === false
        && realCodes.includes('ENROLLMENT_NOT_ENABLED')
        && realCodes.includes('LEGAL_TERMS_NOT_APPROVED')
        && realCodes.includes('WALLET_TERMS_NOT_APPROVED')
        // Satisfied prerequisites must NOT appear as blockers: the fee refund policy is
        // OWNER-ADOPTED, and the membership-fee switch and the VIP MLS promo restriction
        // were activated on 2026-10-11 under owner authorization (activation STEP 6). Each
        // failure mode stays injectable — K5a, K5d and K5f cover them.
        && !realCodes.includes('FEE_REFUND_POLICY_UNDETERMINED')
        && !realCodes.includes('FEE_NOT_ENABLED')
        && !realCodes.includes('VIP_RESTRICTION_INACTIVE'),
      `${real.blockers.length} unmet requirement(s): ${realCodes.join(', ')} — fee billing and the VIP restriction are LIVE; the legal approvals and the enrollment gate are the remaining blockers`);

    const realRefusal = track(await enrollCert({
      email: 'cert_interlock_real@example.com',
      amount: 250,
      billing: GA_ADDRESS,
      launch_configuration: realConfig,
    }));
    check('K1b · The engine refuses enrollment on the real system, even on a fee-free tier',
      realRefusal.status === 'launch_interlock_blocked',
      `status=${realRefusal.status}${realRefusal.error ? ` — ${String(realRefusal.error).slice(0, 140)}` : ''}`);

    // ─────────────────────────────────────────────────────────────────────
    // K2. A COMPLETE CONFIGURATION PERMITS — the interlock is not always-false
    // ─────────────────────────────────────────────────────────────────────
    const complete = evaluateLaunchInterlock(COMPLETE_CONFIGURATION);
    const tierOf = (amount) => complete.tiers.find(t => t.amount === amount);

    check('K2 · A complete configuration permits enrollment on all five tiers',
      complete.permitted === true && complete.tiers.length === AUTO_FUND_AMOUNT_OPTIONS.length,
      complete.permitted
        ? `${complete.checks.length} launch checks passed across ${complete.tiers.length} tiers`
        : `unexpected blockers: ${complete.blockers.map(b => b.code).join(', ')}`);

    check('K3 · Every tier\'s disclosure equals the amount to be charged',
      complete.tiers.every(t => t.agrees
        && t.disclosure_total === t.total_recurring_charge
        && t.compliance_total === t.total_recurring_charge
        && t.amount_to_be_charged === t.total_recurring_charge),
      complete.tiers.map(t => `$${t.amount}: fee $${t.chargeable_fee} · total $${t.total_recurring_charge}`).join(' · '));

    const feeFor = (amount: number) => AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
    check('K4 · The approved fee schedule is applied to every tier exactly',
      AUTO_FUND_AMOUNT_OPTIONS.every(a => tierOf(a)?.chargeable_fee === feeFor(a)
        && tierOf(a)?.total_recurring_charge === a + feeFor(a)),
      AUTO_FUND_AMOUNT_OPTIONS.map(a => `$${a}: fee $${tierOf(a)?.chargeable_fee} · total $${tierOf(a)?.total_recurring_charge}`).join(' · '));

    // ─────────────────────────────────────────────────────────────────────
    // K5. INJECTED FAILURE MODES — EACH MUST PREVENT ENROLLMENT
    // ─────────────────────────────────────────────────────────────────────
    const refusesWith = (config, code) => {
      const evaluation = evaluateLaunchInterlock(config);
      return !evaluation.permitted && evaluation.blockers.some(b => b.code === code);
    };

    check('K5a · A mismatched fee flag (billing off on a fee tier) prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, membership_fee_enabled: false }, 'FEE_NOT_ENABLED'),
      'the $25 tiers cannot be enrolled when membership-fee billing is not enabled');

    check('K5b · An uncoordinated launch prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, enrollment_switch_value: null }, 'ENROLLMENT_NOT_ENABLED')
        && refusesWith({ ...COMPLETE_CONFIGURATION, enrollment_enabled: false }, 'ENROLLMENT_NOT_ENABLED'),
      'the code flag and the owner switch must both be on, together');

    check('K5c · Missing approval of the versioned legal terms prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, terms_legally_approved: false }, 'LEGAL_TERMS_NOT_APPROVED')
        && refusesWith({ ...COMPLETE_CONFIGURATION, terms_version: 'autofund_membership_v0' }, 'LEGAL_TERMS_NOT_APPROVED'),
      'an unapproved version, or approval of a different version, both refuse');

    check('K5d · An undetermined membership-fee refund policy prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, fee_refund_policy: 'undetermined' }, 'FEE_REFUND_POLICY_UNDETERMINED'),
      'the system asserts no policy and will not invent one');

    check('K5e · Unapproved separate wallet terms prevent enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, wallet_terms_approved: false }, 'WALLET_TERMS_NOT_APPROVED'),
      'refund, expiry and unclaimed-property treatment must be resolved');

    check('K5f · A missing approved MLS V2 price configuration prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, mls_v2_configured: false }, 'MLS_V2_NOT_CONFIGURED'),
      'the approved pricing basis must exist as data before launch');

    check('K5g · A stale processor version prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, processor_contract_version: 'autofund_processor_v1' }, 'PROCESSOR_CONTRACT_STALE'),
      `required contract is ${REQUIRED_PROCESSOR_CONTRACT_VERSION}`);

    check('K5h · Broken component separation in the processor prevents enrollment',
      refusesWith(
        { ...COMPLETE_CONFIGURATION, processor_capabilities: { ...AUTOFUND_PROCESSOR_CAPABILITIES, membership_fee_issues_zero_booking_value: false } },
        'PROCESSOR_SEPARATION_BROKEN',
      ),
      'a fee that could issue Booking Value would become a wallet liability');

    check('K5i · A corrupted tier configuration prevents enrollment',
      !evaluateLaunchInterlock(COMPLETE_CONFIGURATION).blockers.some(b => b.code === 'TIER_CONFIGURATION_INVALID')
        && evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { tier_config_overrides: { 350: { booking_value: 999 } } })
          .blockers.some(b => b.code === 'TIER_CONFIGURATION_INVALID')
        && evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { tier_config_overrides: { 250: { bonus_booking_value: 999 } } })
          .blockers.some(b => b.code === 'TIER_CONFIGURATION_INVALID'),
      'a Booking Value that does not equal funding + bonus is refused; a clean configuration is unaffected');

    check('K5j · A disclosure that disagrees with the amount to be charged prevents enrollment',
      evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { charged_totals: { 350: 350 } }).blockers.some(b => b.code === 'DISCLOSURE_CHARGE_MISMATCH')
        && evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { charged_totals: { 250: 275 } }).blockers.some(b => b.code === 'DISCLOSURE_CHARGE_MISMATCH'),
      'authorizing $375 while $350 is raised is refused, in both directions');

    check('K5k · An inactive VIP promotional restriction prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, vip_mls_promo_restriction_enabled: false }, 'VIP_RESTRICTION_INACTIVE'),
      'the restriction must be live at the authoritative booking layer');

    // ─────────────────────────────────────────────────────────────────────
    // K6. REQUIREMENTS 2 AND 3 THROUGH THE REAL ENGINE
    // ─────────────────────────────────────────────────────────────────────
    const feeTierRefused = track(await enrollCert({
      email: 'cert_interlock_fee_tier@example.com',
      amount: 350,
      billing: GA_ADDRESS,
      launch_configuration: { ...COMPLETE_CONFIGURATION, membership_fee_enabled: false },
    }));
    check('K6 · The engine refuses a fee-bearing enrollment when its fee is not enabled',
      feeTierRefused.status === 'launch_interlock_blocked'
        && (feeTierRefused.interlock?.blockers || []).some(b => b.code === 'FEE_NOT_ENABLED'),
      `status=${feeTierRefused.status} — the customer is not enrolled against a disclosed $375 that would be billed as $350`);

    // With the FINAL approved schedule every tier carries a fee, so the membership-fee
    // switch gates the whole ladder: no tier — not even the smallest — can be enrolled
    // while fee billing is off. (Before the final schedule, Starter and Growth were
    // fee-free and could be enrolled with fee billing off.)
    const lowTierRefused = track(await enrollCert({
      email: 'cert_interlock_low_tier@example.com',
      amount: 150,
      billing: GA_ADDRESS,
      launch_configuration: { ...COMPLETE_CONFIGURATION, membership_fee_enabled: false },
    }));
    check('K6b · No tier is fee-free — $150 is refused while fee billing is off',
      lowTierRefused.status === 'launch_interlock_blocked'
        && (lowTierRefused.interlock?.blockers || []).some(b => b.code === 'FEE_NOT_ENABLED'),
      `status=${lowTierRefused.status} — no tier can be enrolled while its fee cannot be billed`);

    const zeroFee = track(await enrollCert({
      email: 'cert_interlock_zero_fee@example.com',
      amount: 250,
      billing: GA_ADDRESS,
    }));
    const zeroFeeSub = zeroFee.status === 'enrolled'
      ? await svc.entities.AutoFundSubscription.get(zeroFee.subscription_id)
      : null;
    // NOTE (final schedule): the $250 tier now carries a $10 membership fee, so no tier
    // is fee-free any more — every enrollment carries its approved fee. This verifies the
    // component split on a low tier: deposit + fee = the recurring charge.
    check('K7 · A $250 enrollment carries exactly its approved fee in the payment request',
      zeroFee.status === 'enrolled'
        && zeroFeeSub.membership_fee === (AUTOFUND_MEMBERSHIP_FEE[250] ?? 0)
        && zeroFeeSub.total_monthly_charge === 250 + (AUTOFUND_MEMBERSHIP_FEE[250] ?? 0)
        && zeroFee.checkout_handoff.membership_fee_cents === Math.round((AUTOFUND_MEMBERSHIP_FEE[250] ?? 0) * 100)
        && zeroFee.checkout_handoff.wallet_funding_cents === 25000
        && zeroFee.checkout_handoff.recurring_charge_cents === 25000 + Math.round((AUTOFUND_MEMBERSHIP_FEE[250] ?? 0) * 100),
      zeroFee.status === 'enrolled'
        ? `fee $${zeroFeeSub.membership_fee} · handoff ${zeroFee.checkout_handoff.wallet_funding_cents}+${zeroFee.checkout_handoff.membership_fee_cents}=${zeroFee.checkout_handoff.recurring_charge_cents} cents`
        : `status=${zeroFee.status}`);

    const noApproval = await enrollCert({
      email: 'cert_interlock_no_approval@example.com',
      amount: 250,
      billing: GA_ADDRESS,
      launch_configuration: { ...COMPLETE_CONFIGURATION, terms_legally_approved: false },
    });
    check('K8 · The engine refuses enrollment when legal approval is missing',
      noApproval.status === 'launch_interlock_blocked'
        && (noApproval.interlock?.blockers || []).some(b => b.code === 'LEGAL_TERMS_NOT_APPROVED'),
      `status=${noApproval.status}`);

    const retired = await enrollCert({
      email: 'cert_interlock_retired@example.com',
      amount: 50,
      billing: GA_ADDRESS,
    });
    check('K9 · A retired tier is refused even under a complete configuration',
      retired.status === 'invalid',
      `status=${retired.status} — $50 stays unsellable while remaining resolvable for existing contracts`);

    check('K10 · Retired tiers are unsellable and legacy contracted terms are intact',
      real.checks.find(c => c.id === 'RETIRED_TIERS_NOT_ENROLLABLE')?.ok === true
        && real.checks.find(c => c.id === 'LEGACY_TERMS_PRESERVED')?.ok === true,
      'absent from the enrollable list, still resolvable at their contracted Booking Value');

    // ─────────────────────────────────────────────────────────────────────
    // K11. THE LAUNCH PROCEDURE REFUSES TO ENABLE ANYTHING
    // ─────────────────────────────────────────────────────────────────────
    if (!real.permitted) {
      try {
        const res = await base44.functions.invoke('manageAutoFundLaunch', { action: 'preflight' });
        const report = res?.data || res;
        check('K11 · The launch procedure reports refusal rather than enabling anything',
          report?.permitted === false && report?.blocker_count > 0,
          `preflight reports ${report?.blocker_count} unmet requirement(s)`);
      } catch (e) {
        blocked('K11 · The launch procedure reports refusal rather than enabling anything',
          `preflight could not be invoked from this context: ${String(e.message).slice(0, 140)}`);
      }
    } else {
      fail('K11 · The launch procedure reports refusal rather than enabling anything',
        'guard failed: the real configuration reported as launchable, so preflight was not invoked');
    }

    const switchRows = await (async () => {
      const res = await svc.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
      return Array.isArray(res) ? res : (res?.data || []);
    })();
    check('K12 · No test wrote the enrollment switch',
      switchRows.length === 0 || switchRows[0].value !== 'true',
      `autofund_enrollment_enabled=${switchRows.length ? switchRows[0].value : 'absent'} — enrollment remains closed`);

    // ─────────────────────────────────────────────────────────────────────
    // CLEANUP AND REQUIREMENT 12
    // ─────────────────────────────────────────────────────────────────────
    const cleanup = await cleanupAll();
    const after = await fingerprint();

    check('K13 · Existing subscriptions, wallets, balances and payment records are unchanged',
      JSON.stringify(before) === JSON.stringify(after),
      JSON.stringify(before) === JSON.stringify(after)
        ? `${after.subscriptions} subscription(s) · ${after.wallets} wallet(s) · $${(after.wallet_balance_cents / 100).toFixed(2)} balance · ${after.payment_events} payment record(s) — identical before and after`
        : `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);

    check('K14 · Certification fixtures were fully removed',
      cleanup.ok === true,
      `removed ${cleanup.deleted.subscriptions} subscription(s), ${cleanup.deleted.wallets} wallet(s), ${cleanup.deleted.contacts} customer record(s)`);

    return Response.json(harness.summarize({
      real_configuration_verdict: {
        permitted: real.permitted,
        unmet_requirements: real.blockers.map(b => ({ code: b.code, requirement: b.requirement, detail: b.detail })),
      },
      production_fingerprint: { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) },
      approved_fee_schedule: AUTOFUND_MEMBERSHIP_FEE,
      certification_note:
        'Results verify software behaviour only. The declared complete configuration is a test assumption, not a claim of legal approval, and no feature was activated.',
      cleanup,
    }));
  } catch (error) {
    const cleanup = await cleanupAll().catch(() => ({ ok: false }));
    return Response.json({ error: error.message, results: harness.results, cleanup }, { status: 500 });
  }
}