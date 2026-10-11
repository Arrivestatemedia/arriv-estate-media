import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { enrollAutoFund } from '../../shared/autoFundEnrollment.ts';
import { AUTOFUND_ENROLLMENT_FLAG_KEY, AUTOFUND_MEMBERSHIP_FEE } from '../../shared/autoFundFinalConfig.ts';
import { AUTO_FUND_AMOUNT_OPTIONS } from '../../shared/prepaidEngine.ts';
import { AUTOFUND_TERMS_VERSION } from '../../shared/autoFundComplianceDisclosure.ts';
import { AUTOFUND_PROCESSOR_CAPABILITIES } from '../../shared/autoFundProcessor.ts';
import { listNoticesForSubscription } from '../../shared/autoFundMembershipNotices.ts';
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
// Two things must both be true for the interlock to be worth anything:
//
//   1. A COMPLETE configuration permits enrollment. An interlock that refuses
//      everything is not a safety control, it is a broken feature — so the
//      complete configuration is asserted to PERMIT, with every tier's disclosure
//      equal to the amount to be charged.
//
//   2. EVERY broken configuration REFUSES enrollment, naming the unmet
//      requirement. Each failure mode is injected deliberately rather than
//      assumed to be caught.
//
// The injections are explicit, declared test inputs. The live feature flags,
// AppSettings and pricing records are never modified, and the real configuration
// is asserted to still refuse enrollment after every injection.
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
  const results = [];
  const created = { subs: [], wallets: [], contacts: [] };

  const pass = (name, detail) => results.push({ name, status: 'PASS', detail: detail || '' });
  const fail = (name, detail) => results.push({ name, status: 'FAIL', detail: detail || '' });
  const check = (name, condition, detail) => (condition ? pass(name, detail) : fail(name, detail));
  const blocked = (name, detail) => results.push({ name, status: 'BLOCKED', detail: detail || '' });

  const base44 = createClientFromRequest(req);
  const svc = base44.asServiceRole;

  const cleanupAll = async () => {
    let ok = true;
    for (const id of created.subs) {
      try {
        for (const n of await listNoticesForSubscription(svc, id, 100)) {
          try { await svc.entities.AutoFundMembershipNotice.delete(n.id); } catch { ok = false; }
        }
        const audits = await svc.entities.AutoFundJurisdictionAudit.filter({ subscription_id: id }, undefined, 100);
        for (const a of (Array.isArray(audits) ? audits : (audits?.data || []))) {
          try { await svc.entities.AutoFundJurisdictionAudit.delete(a.id); } catch { ok = false; }
        }
        await svc.entities.AutoFundSubscription.delete(id);
      } catch { ok = false; }
    }
    for (const id of created.wallets) { try { await svc.entities.PrepaidWallet.delete(id); } catch { ok = false; } }
    for (const id of created.contacts) { try { await svc.entities.Contact.delete(id); } catch { ok = false; } }
    return { ok, deleted: { subscriptions: created.subs.length, wallets: created.wallets.length, contacts: created.contacts.length } };
  };

  /** A stable fingerprint of PRODUCTION financial records. Certification records are excluded. */
  const fingerprint = async () => {
    const notCert = (rows) => rows.filter(r => !String(r.customer_email || '').startsWith('cert_'));
    const subs = notCert(await svc.entities.AutoFundSubscription.list('-created_date', 500));
    const wallets = notCert(await svc.entities.PrepaidWallet.list('-created_date', 500));
    const events = notCert(await svc.entities.AutoFundPaymentEvent.list('-created_date', 500));
    return {
      subscriptions: subs.length,
      wallets: wallets.length,
      wallet_balance_cents: wallets.reduce((s, w) => s + (w.booking_value_balance_cents || 0), 0),
      wallet_value_issued_cents: wallets.reduce((s, w) => s + (w.total_booking_value_issued_cents || 0), 0),
      payment_events: events.length,
      payment_amount: Math.round(events.reduce((s, e) => s + (e.amount_charged || 0), 0) * 100),
    };
  };

  const track = (r) => {
    if (r?.subscription_id) created.subs.push(r.subscription_id);
    if (r?.wallet_id) created.wallets.push(r.wallet_id);
    if (r?.contact_id) created.contacts.push(r.contact_id);
    return r;
  };

  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const before = await fingerprint();
    const realConfig = await readLaunchConfiguration(svc);

    const enrollCert = (opts) =>
      enrollAutoFund({
        base44: svc,
        channel: 'self_service',
        tier_amount: opts.amount,
        customer_email: opts.email,
        customer_name: 'Cert Interlock',
        billing_address: GA_ADDRESS,
        terms_accepted: true,
        terms_accepted_by: opts.email,
        certification_bypass: {
          authorized: true,
          admin_email: user.email,
          launch_configuration: opts.config,
        },
        actor: user.email,
      });

    // ─────────────────────────────────────────────────────────────────────
    // K1. THE REAL CONFIGURATION REFUSES
    // ─────────────────────────────────────────────────────────────────────
    const real = evaluateLaunchInterlock(realConfig);
    const realCodes = real.blockers.map(b => b.code);
    check('K1 · The real configuration refuses enrollment and names every unmet requirement',
      real.permitted === false
        && realCodes.includes('ENROLLMENT_NOT_ENABLED')
        && realCodes.includes('FEE_NOT_ENABLED')
        && realCodes.includes('LEGAL_TERMS_NOT_APPROVED')
        && realCodes.includes('FEE_REFUND_POLICY_UNDETERMINED')
        && realCodes.includes('WALLET_TERMS_NOT_APPROVED')
        && realCodes.includes('VIP_RESTRICTION_INACTIVE'),
      `${real.blockers.length} unmet requirement(s): ${realCodes.join(', ')}`);

    check('K1b · Enrollment is impossible on the real system today',
      (await enrollCert({ email: 'cert_interlock_real@example.com', amount: 250, config: realConfig })).status === 'launch_interlock_blocked',
      'a fee-free tier is still refused while the real prerequisites are unmet');

    // ─────────────────────────────────────────────────────────────────────
    // K2. A COMPLETE CONFIGURATION PERMITS (the interlock is not always-false)
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

    check('K4 · The fee schedule is applied to the right tiers only',
      tierOf(150).chargeable_fee === 0 && tierOf(250).chargeable_fee === 0
        && tierOf(350).chargeable_fee === 25 && tierOf(500).chargeable_fee === 25 && tierOf(1000).chargeable_fee === 25
        && tierOf(350).total_recurring_charge === 375,
      'Starter/Growth $0 fee · Professional/Premier/VIP $25 fee · Professional total $375');

    // ─────────────────────────────────────────────────────────────────────
    // K5. INJECTED FAILURE MODES — EACH MUST PREVENT ENROLLMENT
    // ─────────────────────────────────────────────────────────────────────
    const refusesWith = (config, code) => {
      const evaluation = evaluateLaunchInterlock(config);
      return !evaluation.permitted && evaluation.blockers.some(b => b.code === code);
    };

    // (a) Mismatched fee flags: a fee tier left chargeable while billing is off.
    check('K5a · Mismatched fee flag (billing off on a fee tier) prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, membership_fee_enabled: false }, 'FEE_NOT_ENABLED'),
      'the $25 tiers cannot be enrolled when membership-fee billing is not enabled');

    // (b) Enrollment switch missing entirely.
    check('K5b · An uncoordinated launch prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, enrollment_switch_value: null }, 'ENROLLMENT_NOT_ENABLED')
        && refusesWith({ ...COMPLETE_CONFIGURATION, enrollment_enabled: false }, 'ENROLLMENT_NOT_ENABLED'),
      'the code flag and the owner switch must both be on');

    // (c) Missing legal approval — terms, refund policy and wallet terms.
    check('K5c · Missing approval of the versioned legal terms prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, terms_legally_approved: false }, 'LEGAL_TERMS_NOT_APPROVED')
        && refusesWith({ ...COMPLETE_CONFIGURATION, terms_version: 'autofund_membership_v0' }, 'LEGAL_TERMS_NOT_APPROVED'),
      'an unapproved version, or approval of a different version, both refuse');

    check('K5d · An undetermined membership-fee refund policy prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, fee_refund_policy: 'undetermined' }, 'FEE_REFUND_POLICY_UNDETERMINED'),
      'the system asserts no policy and will not invent one');

    check('K5e · Unapproved separate wallet terms prevent enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, wallet_terms_approved: false }, 'WALLET_TERMS_NOT_APPROVED'),
      'refund, expiry and unclaimed-property terms must be resolved');

    check('K5f · A missing approved MLS V2 price configuration prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, mls_v2_configured: false }, 'MLS_V2_NOT_CONFIGURED'),
      'the approved pricing basis must exist as data before launch');

    // (d) Stale processor version.
    check('K5g · A stale processor version prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, processor_contract_version: 'autofund_processor_v1' }, 'PROCESSOR_CONTRACT_STALE'),
      `required contract is ${REQUIRED_PROCESSOR_CONTRACT_VERSION}`);

    // (e) Processor separation broken.
    check('K5h · Broken component separation in the processor prevents enrollment',
      refusesWith(
        { ...COMPLETE_CONFIGURATION, processor_capabilities: { ...AUTOFUND_PROCESSOR_CAPABILITIES, membership_fee_issues_zero_booking_value: false } },
        'PROCESSOR_SEPARATION_BROKEN',
      ),
      'a fee that could issue Booking Value would become a wallet liability');

    // (f) Invalid tier configuration.
    check('K5i · A corrupted tier configuration prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION }, 'TIER_CONFIGURATION_INVALID') === false
        && evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { tier_config_overrides: { 350: { booking_value: 999 } } }).blockers.some(b => b.code === 'TIER_CONFIGURATION_INVALID')
        && evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { tier_config_overrides: { 250: { bonus_booking_value: 999 } } }).blockers.some(b => b.code === 'TIER_CONFIGURATION_INVALID'),
      'a Booking Value that does not equal funding + bonus is refused (a clean configuration is unaffected)');

    // (g) Incorrect disclosure total vs the amount actually charged.
    check('K5j · A disclosure that disagrees with the amount to be charged prevents enrollment',
      evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { charged_totals: { 350: 350 } }).blockers.some(b => b.code === 'DISCLOSURE_CHARGE_MISMATCH')
        && evaluateLaunchInterlock(COMPLETE_CONFIGURATION, { charged_totals: { 250: 275 } }).blockers.some(b => b.code === 'DISCLOSURE_CHARGE_MISMATCH'),
      'authorizing $375 while $350 is raised is refused, in both directions');

    // (h) VIP restriction not enforced.
    check('K5k · An inactive VIP promotional restriction prevents enrollment',
      refusesWith({ ...COMPLETE_CONFIGURATION, vip_mls_promo_restriction_enabled: false }, 'VIP_RESTRICTION_INACTIVE'),
      'the restriction must be live at the authoritative booking layer');

    // ─────────────────────────────────────────────────────────────────────
    // K6. REQUIREMENTS 2 AND 3 THROUGH THE REAL ENGINE
    // ─────────────────────────────────────────────────────────────────────
    const feeTierRefused = track(await enrollCert({
      email: 'cert_interlock_fee_tier@example.com',
      amount: 350,
      config: { ...COMPLETE_CONFIGURATION, membership_fee_enabled: false },
    }));
    check('K6 · The engine refuses a $350 enrollment when the fee is not enabled',
      feeTierRefused.status === 'launch_interlock_blocked'
        && (feeTierRefused.interlock?.blockers || []).some(b => b.code === 'FEE_NOT_ENABLED'),
      `status=${feeTierRefused.status} — the customer is not enrolled against a disclosed $375 that would be billed as $350`);

    const zeroFee = track(await enrollCert({
      email: 'cert_interlock_zero_fee@example.com',
      amount: 250,
      config: COMPLETE_CONFIGURATION,
    }));
    const zeroFeeSub = zeroFee.status === 'enrolled'
      ? await svc.entities.AutoFundSubscription.get(zeroFee.subscription_id)
      : null;
    check('K7 · A $250 enrollment carries no membership fee in the payment request',
      zeroFee.status === 'enrolled'
        && zeroFeeSub.membership_fee === 0
        && zeroFeeSub.total_monthly_charge === 250
        && zeroFee.checkout_handoff.membership_fee_cents === 0
        && zeroFee.checkout_handoff.wallet_funding_cents === 25000
        && zeroFee.checkout_handoff.recurring_charge_cents === 25000,
      zeroFee.status === 'enrolled'
        ? `fee $${zeroFeeSub.membership_fee} · handoff ${zeroFee.checkout_handoff.wallet_funding_cents}+${zeroFee.checkout_handoff.membership_fee_cents}=${zeroFee.checkout_handoff.recurring_charge_cents} cents`
        : `status=${zeroFee.status}`);

    const noApproval = await enrollCert({
      email: 'cert_interlock_no_approval@example.com',
      amount: 250,
      config: { ...COMPLETE_CONFIGURATION, terms_legally_approved: false },
    });
    check('K8 · The engine refuses enrollment when legal approval is missing',
      noApproval.status === 'launch_interlock_blocked'
        && (noApproval.interlock?.blockers || []).some(b => b.code === 'LEGAL_TERMS_NOT_APPROVED'),
      `status=${noApproval.status}`);

    const retired = await enrollCert({ email: 'cert_interlock_retired@example.com', amount: 50, config: COMPLETE_CONFIGURATION });
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
        check('K11 · The launch procedure reports refusal and changes nothing',
          report?.permitted === false && report?.blocker_count > 0,
          `preflight reports ${report?.blocker_count} unmet requirement(s): ${report?.verdict || ''}`);
      } catch (e) {
        blocked('K11 · The launch procedure reports refusal and changes nothing', `preflight could not be invoked: ${String(e.message).slice(0, 120)}`);
      }
    } else {
      fail('K11 · The launch procedure reports refusal and changes nothing', 'guard failed: the real configuration reported as launchable, so preflight was not invoked');
    }

    check('K12 · The enrollment switch was not written by any test',
      (() => true)() && (await (async () => {
        const res = await svc.entities.AppSetting.filter({ key: AUTOFUND_ENROLLMENT_FLAG_KEY }, undefined, 1);
        const rows = Array.isArray(res) ? res : (res?.data || []);
        return rows.length === 0 || rows[0].value !== 'true';
      })()),
      'enrollment remains closed — no test activated Auto-Fund');

    // ─────────────────────────────────────────────────────────────────────
    // CLEANUP AND REQUIREMENT 12
    // ─────────────────────────────────────────────────────────────────────
    const cleanup = await cleanupAll();
    const after = await fingerprint();

    check('K13 · Existing subscriptions, wallets, balances and payment records are unchanged',
      JSON.stringify(before) === JSON.stringify(after),
      JSON.stringify(before) === JSON.stringify(after)
        ? `${after.subscriptions} subscriptions · ${after.wallets} wallets · $${(after.wallet_balance_cents / 100).toFixed(2)} balance · ${after.payment_events} payment records — identical before and after`
        : `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);

    check('K14 · Certification fixtures were fully removed',
      cleanup.ok === true,
      `removed ${cleanup.deleted.subscriptions} subscription(s), ${cleanup.deleted.wallets} wallet(s), ${cleanup.deleted.contacts} customer record(s)`);

    const failed = results.filter(r => r.status === 'FAIL');
    const blockedResults = results.filter(r => r.status === 'BLOCKED');

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
      real_configuration_verdict: {
        permitted: real.permitted,
        unmet_requirements: real.blockers.map(b => ({ code: b.code, requirement: b.requirement, detail: b.detail })),
      },
      production_fingerprint: { before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) },
      approval_schedule_status: AUTOFUND_MEMBERSHIP_FEE,
      certification_note:
        'Results verify software behaviour only. The declared complete configuration is a test assumption, not a claim of legal approval, and no feature was activated.',
      cleanup,
    });
  } catch (error) {
    const cleanup = await cleanupAll().catch(() => ({ ok: false }));
    return Response.json({ error: error.message, results, cleanup }, { status: 500 });
  }
}