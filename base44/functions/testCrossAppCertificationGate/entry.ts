import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { signPayload, isTimestampFresh } from '../../shared/payrollCrypto.ts';

/**
 * Cross-App Certification Gate Test — simulates Arriv Pay's actual HTTP
 * webhook request format to verify Estate Media's certification contract
 * accepts synthetic certification events while production flags are OFF.
 *
 * This test makes REAL HTTP calls to the deployed webhook endpoint,
 * exactly as Arriv Pay would, using the canonical HMAC signing contract.
 *
 * Required tests:
 *   1. Existing Estate Media synthetic Auto-Fund request succeeds (direct call)
 *   2. Arriv Pay synthetic Auto-Fund request succeeds (HTTP webhook)
 *   3. $100 funding creates exactly 10,500 cents of redeemable value
 *   4. Production wallet targeting is rejected
 *   5. Invalid HMAC is rejected
 *   6. Ordinary non-cert requests remain blocked (503)
 *   7. Repeated payment delivery creates no duplicate financial records
 *   8. Production feature flags remain OFF
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

    // ── Verify production feature flag is OFF ───────────────────────────
    const { PREPAID_FEATURE_FLAG_KEY } = await import('../../shared/prepaidEngine.ts');
    const flagResp = await b.entities.AppSetting.filter({ key: PREPAID_FEATURE_FLAG_KEY }, undefined, 1);
    const flagArr = Array.isArray(flagResp) ? flagResp : (flagResp?.data || []);
    const flagOff = flagArr.length === 0 || flagArr[0].value !== 'true';
    results['feature_flag_off'] = {
      status: flagOff ? 'PASS' : 'FAIL',
      flag_value: flagArr.length > 0 ? flagArr[0].value : 'not_set',
      expected: 'false or not_set',
    };

    // ── Create cert fixtures ─────────────────────────────────────────────
    const certEmail = `${certRunId}_customer@cert.arriv.internal`;
    const certRepEmail = `${certRunId}_rep@cert.arriv.internal`;

    const contact = await b.entities.Contact.create({
      email: certEmail,
      firstname: 'CrossAppTest',
      lastname: 'Customer',
      phone: '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    });

    const rep = await b.entities.SalesTeamMember.create({
      email: certRepEmail,
      full_name: 'CrossApp Test Rep',
      status: 'active',
      role: 'user',
      created_date: nowIso,
    });

    // Synthetic cert wallet (cert_-prefixed email = synthetic fixture)
    const certWallet = await b.entities.PrepaidWallet.create({
      customer_id: contact.id,
      customer_email: certEmail,
      customer_name: 'CrossAppTest Customer',
      tier: 'STARTER',
      support_tier: 'AUTOFUND_100',
      credits_balance: 0,
      booking_value_balance: 0,
      booking_value_balance_cents: 0,
      total_credits_issued: 0,
      total_booking_value_issued: 0,
      total_booking_value_issued_cents: 0,
      total_credits_redeemed: 0,
      total_booking_value_redeemed: 0,
      total_booking_value_redeemed_cents: 0,
      total_credits_expired: 0,
      total_booking_value_expired: 0,
      total_booking_value_expired_cents: 0,
      promotional_benefits_available: 0,
      promotional_benefits_used: 0,
      sales_rep_id: rep.id,
      sales_rep_email: certRepEmail,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Production wallet (real email = production fixture)
    const prodEmail = `prod_test_${certRunId}@example.com`;
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
      support_tier: 'AUTOFUND_100',
      credits_balance: 0,
      booking_value_balance: 0,
      booking_value_balance_cents: 0,
      total_credits_issued: 0,
      total_booking_value_issued: 0,
      total_booking_value_issued_cents: 0,
      total_credits_redeemed: 0,
      total_booking_value_redeemed: 0,
      total_booking_value_redeemed_cents: 0,
      total_credits_expired: 0,
      total_booking_value_expired: 0,
      total_booking_value_expired_cents: 0,
      promotional_benefits_available: 0,
      promotional_benefits_used: 0,
      sales_rep_id: rep.id,
      sales_rep_email: certRepEmail,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // ── Helper: build Arriv Pay's HTTP request format ────────────────────
    const handoffSecret = secrets.get('ARRIV_PAYROLL_HANDOFF_SECRET');
    if (!handoffSecret) {
      return Response.json({ error: 'ARRIV_PAYROLL_HANDOFF_SECRET not configured' }, { status: 500 });
    }

    const webhookUrl = `https://arrivestatemedia.base44.app/functions/receiveArrivPayCustomerPayment`;

    async function sendArrivPayRequest(payload, options = {}) {
      const bodyText = JSON.stringify(payload);
      const timestamp = new Date().toISOString();
      const requestId = options.requestId || ('req_' + crypto.randomUUID());
      const sourceApp = 'arriv_pay';
      // Canonical signing: body\ntimestamp\nrequestId\nsourceApp
      const canonical = [bodyText, timestamp, requestId, sourceApp].join('\n');
      const signature = await signPayload(handoffSecret, canonical);

      const headers = {
        'Content-Type': 'application/json',
        'x-arriv-pay-signature': signature,
        'x-arriv-pay-timestamp': timestamp,
        'x-arriv-pay-request-id': requestId,
        'x-arriv-pay-source-app': sourceApp,
      };

      if (options.invalidHmac) {
        headers['x-arriv-pay-signature'] = 'invalid_signature_' + crypto.randomUUID();
      }

      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: bodyText,
        signal: AbortSignal.timeout(30000),
      });

      let data;
      try { data = await resp.json(); } catch { data = { raw: await resp.text() }; }
      return { status: resp.status, data };
    }

    // ════════════════════════════════════════════════════════════════════════
    // TEST 1: Existing Estate Media synthetic Auto-Fund (direct processor call)
    // ════════════════════════════════════════════════════════════════════════
    const { processAutoFundPayment } = await import('../../shared/autoFundProcessor.ts');
    const directPaymentId = certRunId + '_direct_af';
    const directResult = await processAutoFundPayment({
      base44: b,
      payment_event_id: directPaymentId,
      subscription_id: 'cert_sub_direct',
      customer_id: contact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      sales_rep_id: rep.id,
      raw_event: 'direct_test',
      actor: 'crossapp_test',
      cert_mode: true,
    });

    results['existing_em_synthetic_autofund'] = {
      status: directResult.status === 'processed' ? 'PASS' : 'FAIL',
      result: directResult.status,
      booking_value_issued: directResult.booking_value_issued,
      expected: 105,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 2: Arriv Pay synthetic Auto-Fund (HTTP webhook with certification:true)
    // This simulates EXACTLY what Arriv Pay sends: certification:true in body,
    // real subscription_id, cert_-prefixed payment_event_id, non-cert_ request ID.
    // ════════════════════════════════════════════════════════════════════════
    const arrivPayPaymentId = certRunId + '_arrivpay_af';
    const arrivPayBody = {
      payment_event_id: arrivPayPaymentId,
      subscription_id: 'sub_1AbCdEfGhIjKlMnOpQrStUv',  // real Stripe subscription ID
      customer_id: contact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      sales_rep_id: rep.id,
      certification: true,  // Arriv Pay's certification marker
    };

    const arrivPayResp = await sendArrivPayRequest(arrivPayBody, {
      requestId: 'req_' + crypto.randomUUID(),  // non-cert_ request ID (as Arriv Pay sends)
    });

    results['arrivpay_synthetic_autofund'] = {
      status: arrivPayResp.status === 200 && arrivPayResp.data?.status === 'processed' ? 'PASS' : 'FAIL',
      http_status: arrivPayResp.status,
      result_status: arrivPayResp.data?.status,
      certification_mode: arrivPayResp.data?.certification_mode,
      cert_id: arrivPayResp.data?.cert_id,
      expected_http: 200,
      expected_status: 'processed',
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 3: $100 funding creates exactly 10,500 cents of redeemable value
    // ════════════════════════════════════════════════════════════════════════
    const walletAfter = await b.entities.PrepaidWallet.get(certWallet.id);
    const lotsResp = await b.entities.CreditLot.filter({ wallet_id: certWallet.id }, 'fifo_order', 10);
    const lots = Array.isArray(lotsResp) ? lotsResp : (lotsResp?.data || []);
    const totalLotCents = lots.reduce((sum, l) => sum + (l.booking_value_remaining_cents ?? 0), 0);

    results['exact_10500_cents'] = {
      status: (
        arrivPayResp.data?.booking_value_issued === 105 &&
        arrivPayResp.data?.booking_value_issued_cents === 10500 &&
        walletAfter.booking_value_balance_cents === 21000 &&  // 10500 (direct) + 10500 (arrivpay)
        totalLotCents === 21000
      ) ? 'PASS' : 'FAIL',
      arrivpay_booking_value_issued: arrivPayResp.data?.booking_value_issued,
      arrivpay_booking_value_issued_cents: arrivPayResp.data?.booking_value_issued_cents,
      wallet_balance_cents: walletAfter.booking_value_balance_cents,
      expected_wallet_cents: 21000,
      total_lot_cents: totalLotCents,
      lot_count: lots.length,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 4: Production wallet targeting is rejected
    // cert_-prefixed payment_event_id + certification:true but targeting a
    // PRODUCTION wallet (non-cert_ email) → must be rejected by the processor.
    // ════════════════════════════════════════════════════════════════════════
    const prodTargetPaymentId = certRunId + '_prod_target';
    const prodTargetBody = {
      payment_event_id: prodTargetPaymentId,
      subscription_id: 'sub_real_stripe_id',
      customer_id: prodContact.id,
      customer_email: prodEmail,  // production email (not cert_-prefixed)
      wallet_id: prodWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      sales_rep_id: rep.id,
      certification: true,
    };

    const prodTargetResp = await sendArrivPayRequest(prodTargetBody);

    // Verify production wallet was NOT credited
    const prodWalletAfter = await b.entities.PrepaidWallet.get(prodWallet.id);

    results['production_wallet_protected'] = {
      status: (
        (prodTargetResp.data?.status === 'error' || prodTargetResp.status !== 200) &&
        prodWalletAfter.booking_value_balance_cents === 0 &&
        prodWalletAfter.credits_balance === 0
      ) ? 'PASS' : 'FAIL',
      http_status: prodTargetResp.status,
      result_status: prodTargetResp.data?.status,
      error: prodTargetResp.data?.error,
      prod_wallet_balance_cents: prodWalletAfter.booking_value_balance_cents,
      expected_cents: 0,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 5: Invalid HMAC is rejected (401)
    // ════════════════════════════════════════════════════════════════════════
    const invalidHmacBody = {
      payment_event_id: certRunId + '_invalid_hmac',
      subscription_id: 'sub_test',
      customer_id: contact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      certification: true,
    };

    const invalidHmacResp = await sendArrivPayRequest(invalidHmacBody, { invalidHmac: true });

    results['invalid_hmac_rejected'] = {
      status: invalidHmacResp.status === 401 ? 'PASS' : 'FAIL',
      http_status: invalidHmacResp.status,
      expected: 401,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 6: Ordinary non-cert request remains blocked (503)
    // No certification marker, no cert_ prefix, feature flag OFF → 503.
    // ════════════════════════════════════════════════════════════════════════
    const nonCertBody = {
      payment_event_id: 'evt_real_' + crypto.randomUUID(),
      subscription_id: 'sub_real_stripe',
      customer_id: contact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      // NO certification: true
      // NO cert_ prefix on payment_event_id
    };

    const nonCertResp = await sendArrivPayRequest(nonCertBody);

    results['non_cert_blocked'] = {
      status: nonCertResp.status === 503 ? 'PASS' : 'FAIL',
      http_status: nonCertResp.status,
      error: nonCertResp.data?.error,
      expected: 503,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 7: Repeated payment delivery creates no duplicate records
    // ════════════════════════════════════════════════════════════════════════
    const dupPaymentId = certRunId + '_dup_arrivpay';
    const dupBody = {
      payment_event_id: dupPaymentId,
      subscription_id: 'sub_dup_test',
      customer_id: contact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      sales_rep_id: rep.id,
      certification: true,
    };

    let dupProcessedCount = 0;
    for (let i = 0; i < 5; i++) {
      const r = await sendArrivPayRequest(dupBody);
      if (r.data?.status === 'processed') dupProcessedCount++;
    }

    const dupAfResp = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: dupPaymentId }, undefined, 10);
    const dupAfArr = Array.isArray(dupAfResp) ? dupAfResp : (dupAfResp?.data || []);

    results['idempotency_no_duplicates'] = {
      status: dupProcessedCount === 1 && dupAfArr.length === 1 ? 'PASS' : 'FAIL',
      processed_count: dupProcessedCount,
      expected: 1,
      event_records: dupAfArr.length,
      expected_records: 1,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 8: Production feature flags remain OFF (re-check after all tests)
    // ════════════════════════════════════════════════════════════════════════
    const flagResp2 = await b.entities.AppSetting.filter({ key: PREPAID_FEATURE_FLAG_KEY }, undefined, 1);
    const flagArr2 = Array.isArray(flagResp2) ? flagResp2 : (flagResp2?.data || []);
    const flagStillOff = flagArr2.length === 0 || flagArr2[0].value !== 'true';

    results['feature_flag_still_off'] = {
      status: flagStillOff ? 'PASS' : 'FAIL',
      flag_value: flagArr2.length > 0 ? flagArr2[0].value : 'not_set',
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
      production_wallet_untouched: prodWalletAfter.booking_value_balance_cents === 0,
      feature_flags_unchanged: flagStillOff,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: 'ERROR' }, { status: 500 });
  }
}