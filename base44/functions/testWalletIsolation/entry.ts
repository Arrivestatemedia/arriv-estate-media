import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { isCertificationId } from '../../shared/certificationMode.ts';
import { generateId } from '../../shared/prepaidEngine.ts';

/**
 * Wallet Isolation Test — verifies that certification events cannot
 * operate on production wallets and vice versa.
 *
 * Tests:
 *   1. Synthetic-to-synthetic acceptance (cert event → cert wallet = PASS)
 *   2. Synthetic-to-production rejection (cert event → production wallet = REJECT)
 *   3. Production-to-cert rejection (production event → cert wallet = REJECT)
 *   4. Mismatched ownership rejection (cert event with wrong customer_id = REJECT)
 *   5. Mismatched email rejection (cert event with wrong email = REJECT)
 *
 * Uses safe fixtures only. Does not mutate real production wallets.
 * All fixtures are cert_-prefixed and clearly synthetic.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const nowIso = new Date().toISOString();
    const certRunId = 'cert_' + Date.now();
    const results = {};

    // ── Create fixtures ──────────────────────────────────────────────────
    // 1. Synthetic cert_ customer + wallet
    const certEmail = `${certRunId}_customer@cert.arriv.internal`;
    const certContact = await b.entities.Contact.create({
      email: certEmail,
      firstname: 'CertTest',
      lastname: 'Customer',
      phone: '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    });

    const certWallet = await b.entities.PrepaidWallet.create({
      customer_id: certContact.id,
      customer_email: certEmail,
      customer_name: 'CertTest Customer',
      tier: 'STARTER',
      support_tier: 'AUTOFUND_150',
      credits_balance: 0,
      booking_value_balance: 0,
      total_credits_issued: 0,
      total_booking_value_issued: 0,
      total_credits_redeemed: 0,
      total_booking_value_redeemed: 0,
      total_credits_expired: 0,
      total_booking_value_expired: 0,
      promotional_benefits_available: 0,
      promotional_benefits_used: 0,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // 2. Simulated "production" customer + wallet (non-cert email to simulate real production)
    const prodEmail = `isolation_prod_${Date.now()}@arriv.internal`;
    const prodContact = await b.entities.Contact.create({
      email: prodEmail,
      firstname: 'ProdTest',
      lastname: 'Customer',
      phone: '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    });

    const prodWallet = await b.entities.PrepaidWallet.create({
      customer_id: prodContact.id,
      customer_email: prodEmail,
      customer_name: 'ProdTest Customer',
      tier: 'STARTER',
      support_tier: 'AUTOFUND_150',
      credits_balance: 0,
      booking_value_balance: 0,
      total_credits_issued: 0,
      total_booking_value_issued: 0,
      total_credits_redeemed: 0,
      total_booking_value_redeemed: 0,
      total_credits_expired: 0,
      total_booking_value_expired: 0,
      promotional_benefits_available: 0,
      promotional_benefits_used: 0,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // ── TEST 1: Synthetic-to-synthetic acceptance ──────────────────────
    const r1 = await processAutoFundPayment({
      base44: b,
      payment_event_id: certRunId + '_iso_test_1',
      subscription_id: 'cert_sub_iso_1',
      customer_id: certContact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      raw_event: 'cert_iso_test_1',
      actor: 'isolation_test',
      cert_mode: true,
    });
    results['synthetic_to_synthetic'] = {
      status: r1.status === 'processed' ? 'PASS' : 'FAIL',
      result: r1.status,
      expected: 'processed',
    };

    // ── TEST 2: Synthetic-to-production rejection ────────────────────────
    // cert_mode=true but targeting a "production" wallet (non-cert email)
    const r2 = await processAutoFundPayment({
      base44: b,
      payment_event_id: certRunId + '_iso_test_2',
      subscription_id: 'cert_sub_iso_2',
      customer_id: prodContact.id,
      customer_email: prodEmail,  // NOT cert_-prefixed
      wallet_id: prodWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      raw_event: 'cert_iso_test_2',
      actor: 'isolation_test',
      cert_mode: true,
    });
    results['synthetic_to_production'] = {
      status: r2.status === 'error' ? 'PASS' : 'FAIL',
      result: r2.status,
      error: r2.error,
      expected: 'error (cert mode cannot operate on production wallet)',
    };

    // ── TEST 3: Production-to-cert rejection ─────────────────────────────
    // cert_mode=false but targeting a cert wallet (cert_-prefixed email)
    const r3 = await processAutoFundPayment({
      base44: b,
      payment_event_id: certRunId + '_iso_test_3',
      subscription_id: 'cert_sub_iso_3',
      customer_id: certContact.id,
      customer_email: certEmail,  // cert_-prefixed
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      raw_event: 'cert_iso_test_3',
      actor: 'isolation_test',
      cert_mode: false,
    });
    results['production_to_cert'] = {
      status: r3.status === 'error' ? 'PASS' : 'FAIL',
      result: r3.status,
      error: r3.error,
      expected: 'error (production event cannot operate on cert wallet)',
    };

    // ── TEST 4: Mismatched ownership rejection ───────────────────────────
    // cert_mode=true, cert email, but wallet_id belongs to a different customer
    const r4 = await processAutoFundPayment({
      base44: b,
      payment_event_id: certRunId + '_iso_test_4',
      subscription_id: 'cert_sub_iso_4',
      customer_id: certContact.id,
      customer_email: certEmail,
      wallet_id: prodWallet.id,  // Wrong wallet — belongs to prodContact
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      raw_event: 'cert_iso_test_4',
      actor: 'isolation_test',
      cert_mode: true,
    });
    results['mismatched_ownership'] = {
      status: r4.status === 'error' ? 'PASS' : 'FAIL',
      result: r4.status,
      error: r4.error,
      expected: 'error (wallet not found or ownership mismatch)',
    };

    // ── TEST 5: Mismatched email rejection ───────────────────────────────
    // cert_mode=true, correct wallet_id and customer_id, but wrong customer_email
    const r5 = await processAutoFundPayment({
      base44: b,
      payment_event_id: certRunId + '_iso_test_5',
      subscription_id: 'cert_sub_iso_5',
      customer_id: certContact.id,
      customer_email: 'cert_wrong@cert.arriv.internal',  // Wrong email
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      raw_event: 'cert_iso_test_5',
      actor: 'isolation_test',
      cert_mode: true,
    });
    results['mismatched_email'] = {
      status: r5.status === 'error' ? 'PASS' : 'FAIL',
      result: r5.status,
      error: r5.error,
      expected: 'error (wallet email mismatch)',
    };

    // ── Verify no production wallet was credited ─────────────────────────
    const prodWalletAfter = await b.entities.PrepaidWallet.get(prodWallet.id);
    results['production_wallet_protected'] = {
      status: (prodWalletAfter.credits_balance === 0 && prodWalletAfter.booking_value_balance === 0) ? 'PASS' : 'FAIL',
      credits_balance: prodWalletAfter.credits_balance,
      booking_value_balance: prodWalletAfter.booking_value_balance,
      expected: '0 / 0 (no credits or booking value added to production wallet)',
    };

    // ── Summary ─────────────────────────────────────────────────────────
    const testNames = Object.keys(results);
    const passCount = testNames.filter(n => results[n].status === 'PASS').length;
    const failCount = testNames.filter(n => results[n].status === 'FAIL').length;

    return Response.json({
      status: failCount === 0 ? 'PASS' : 'FAIL',
      cert_run_id: certRunId,
      tests_passed: passCount,
      tests_failed: failCount,
      total_tests: testNames.length,
      results,
      production_wallet_untouched: prodWalletAfter.credits_balance === 0 && prodWalletAfter.booking_value_balance === 0,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: 'ERROR' }, { status: 500 });
  }
}