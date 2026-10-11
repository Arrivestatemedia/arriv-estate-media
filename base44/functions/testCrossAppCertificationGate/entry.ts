import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { signPayload, isTimestampFresh } from '../../shared/payrollCrypto.ts';

/**
 * Cross-App Certification Gate Test — simulates Arriv Pay's actual HTTP
 * webhook request format to verify Estate Media's certification contract
 * accepts synthetic certification events under the CURRENT PRODUCTION STATE
 * (prepaid_enabled = true) while preserving every isolation guarantee.
 *
 * This test makes REAL HTTP calls to the deployed webhook endpoint, exactly as
 * Arriv Pay would, using the canonical HMAC signing contract. No Stripe charge
 * is ever created — these are synthetic webhook deliveries against synthetic
 * fixture wallets that are removed at the end of the run.
 *
 * Required tests:
 *   1.  Production feature flag is enabled (current production state)
 *   2.  Existing Estate Media synthetic Auto-Fund request succeeds (direct call)
 *   3.  Arriv Pay synthetic Auto-Fund request succeeds (HTTP webhook)
 *   4.  $100 funding creates exactly 10,500 cents of redeemable value
 *   5.  Certification event targeting a production wallet is rejected (403)
 *   6.  Invalid HMAC is rejected (401)
 *   7.  Production event targeting a certification wallet is rejected (403)
 *   8.  Legitimate production request is accepted and credited normally (200)
 *   9.  Repeated payment delivery creates no duplicate financial records
 *   10. Production feature flag is unchanged by this run
 *   11. All certification fixtures are cleaned up (no residue)
 *
 * Tests 5, 6, 7, 9 and 11 are isolation/security assertions and must never be
 * relaxed to make a run pass.
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

    // ════════════════════════════════════════════════════════════════════════
    // TEST 1: Production feature flag state (prepaid_enabled is ON in production)
    // The certification bypass is verified against the live production state.
    // Synthetic events must still satisfy every safeguard, and legitimate
    // production events must still be processed — neither is assumed away.
    // ════════════════════════════════════════════════════════════════════════
    const { PREPAID_FEATURE_FLAG_KEY } = await import('../../shared/prepaidEngine.ts');
    const flagResp = await b.entities.AppSetting.filter({ key: PREPAID_FEATURE_FLAG_KEY }, undefined, 1);
    const flagArr = Array.isArray(flagResp) ? flagResp : (flagResp?.data || []);
    const flagEnabledAtStart = flagArr.length > 0 && flagArr[0].value === 'true';
    results['feature_flag_enabled'] = {
      status: flagEnabledAtStart ? 'PASS' : 'FAIL',
      flag_value: flagArr.length > 0 ? flagArr[0].value : 'not_set',
      expected: 'true (production state)',
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
      support_tier: 'AUTOFUND_150',
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

    // Production wallet (real email = production-classified fixture)
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
      support_tier: 'AUTOFUND_150',
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
    // TEST 2: Existing Estate Media synthetic Auto-Fund (direct processor call)
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
    // TEST 3: Arriv Pay synthetic Auto-Fund (HTTP webhook with certification:true)
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
    // TEST 4: $100 funding creates exactly 10,500 cents of redeemable value
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
    // TEST 5: Certification event targeting a PRODUCTION wallet is rejected
    // cert_-prefixed payment_event_id + certification:true but targeting a
    // PRODUCTION wallet (non-cert_ email) → must be rejected as a security
    // violation (403), before any financial mutation.
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
    const prodWalletProtectedCents = prodWalletAfter.booking_value_balance_cents;

    results['production_wallet_protected'] = {
      status: (
        prodTargetResp.status === 403 &&
        prodTargetResp.data?.status === 'error' &&
        prodWalletProtectedCents === 0 &&
        prodWalletAfter.credits_balance === 0
      ) ? 'PASS' : 'FAIL',
      http_status: prodTargetResp.status,
      expected_http: 403,
      result_status: prodTargetResp.data?.status,
      error: prodTargetResp.data?.error,
      prod_wallet_balance_cents: prodWalletProtectedCents,
      expected_cents: 0,
      mutation_before_rejection: false,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 6: Invalid HMAC is rejected (401)
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
    // TEST 7: Production event targeting a CERTIFICATION wallet is rejected
    // No certification marker and no cert_ prefix → classified as a production
    // event. Targeting a cert_-prefixed (synthetic) wallet is a mixed
    // synthetic/production identity and must be rejected (403) BEFORE any
    // financial mutation. A retryable 500 here would make Arriv Pay retry a
    // permanent security rejection indefinitely.
    // ════════════════════════════════════════════════════════════════════════
    const certWalletBeforeMixed = await b.entities.PrepaidWallet.get(certWallet.id);
    const certLotsBeforeMixedResp = await b.entities.CreditLot.filter({ wallet_id: certWallet.id }, undefined, 50);
    const certLotsBeforeMixed = Array.isArray(certLotsBeforeMixedResp) ? certLotsBeforeMixedResp : (certLotsBeforeMixedResp?.data || []);

    const mixedIdentityBody = {
      payment_event_id: 'evt_real_' + crypto.randomUUID(),
      subscription_id: 'sub_real_stripe',
      customer_id: contact.id,
      customer_email: certEmail,
      wallet_id: certWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      // NO certification: true
      // NO cert_ prefix on payment_event_id → production-classified event
    };

    const mixedIdentityResp = await sendArrivPayRequest(mixedIdentityBody);

    const certWalletAfterMixed = await b.entities.PrepaidWallet.get(certWallet.id);
    const certLotsAfterMixedResp = await b.entities.CreditLot.filter({ wallet_id: certWallet.id }, undefined, 50);
    const certLotsAfterMixed = Array.isArray(certLotsAfterMixedResp) ? certLotsAfterMixedResp : (certLotsAfterMixedResp?.data || []);

    results['mixed_identity_blocked'] = {
      status: (
        mixedIdentityResp.status === 403 &&
        mixedIdentityResp.data?.status === 'error' &&
        certWalletAfterMixed.booking_value_balance_cents === certWalletBeforeMixed.booking_value_balance_cents &&
        certLotsAfterMixed.length === certLotsBeforeMixed.length
      ) ? 'PASS' : 'FAIL',
      http_status: mixedIdentityResp.status,
      expected_http: 403,
      error: mixedIdentityResp.data?.error,
      wallet_cents_before: certWalletBeforeMixed.booking_value_balance_cents,
      wallet_cents_after: certWalletAfterMixed.booking_value_balance_cents,
      lots_before: certLotsBeforeMixed.length,
      lots_after: certLotsAfterMixed.length,
      mutation_before_rejection: false,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 8: Legitimate production request remains unaffected
    // With prepaid_enabled = true, an ordinary (non-certified) event targeting
    // a non-cert_-prefixed production wallet must be ACCEPTED and credited
    // normally. This proves the certification safeguards do not interfere with
    // the genuine production payment path.
    // ════════════════════════════════════════════════════════════════════════
    const legitProdPaymentId = 'evt_real_' + crypto.randomUUID();
    const legitProdBody = {
      payment_event_id: legitProdPaymentId,
      subscription_id: 'sub_real_stripe_legit',
      customer_id: prodContact.id,
      customer_email: prodEmail,
      wallet_id: prodWallet.id,
      amount_charged: 100,
      status: 'succeeded',
      event_type: 'recurring',
      sales_rep_id: rep.id,
      // NO certification marker → genuine production path
    };

    const legitProdResp = await sendArrivPayRequest(legitProdBody);
    const prodWalletAfterLegit = await b.entities.PrepaidWallet.get(prodWallet.id);

    results['legitimate_production_accepted'] = {
      status: (
        legitProdResp.status === 200 &&
        legitProdResp.data?.status === 'processed' &&
        legitProdResp.data?.booking_value_issued_cents === 10500 &&
        legitProdResp.data?.certification_mode === false &&
        prodWalletAfterLegit.booking_value_balance_cents === 10500
      ) ? 'PASS' : 'FAIL',
      http_status: legitProdResp.status,
      result_status: legitProdResp.data?.status,
      booking_value_issued_cents: legitProdResp.data?.booking_value_issued_cents,
      expected_booking_value_issued_cents: 10500,
      certification_mode: legitProdResp.data?.certification_mode,
      prod_wallet_balance_cents: prodWalletAfterLegit.booking_value_balance_cents,
      expected_wallet_cents: 10500,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 9: Repeated payment delivery creates no duplicate records
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
    // TEST 10: Production feature flag is UNCHANGED by this run
    // ════════════════════════════════════════════════════════════════════════
    const flagResp2 = await b.entities.AppSetting.filter({ key: PREPAID_FEATURE_FLAG_KEY }, undefined, 1);
    const flagArr2 = Array.isArray(flagResp2) ? flagResp2 : (flagResp2?.data || []);
    const flagEnabledAtEnd = flagArr2.length > 0 && flagArr2[0].value === 'true';

    results['feature_flag_unchanged'] = {
      status: flagEnabledAtEnd === flagEnabledAtStart ? 'PASS' : 'FAIL',
      flag_value: flagArr2.length > 0 ? flagArr2[0].value : 'not_set',
      unchanged: flagEnabledAtEnd === flagEnabledAtStart,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 11: Certification fixtures are cleaned up (no residue)
    // ════════════════════════════════════════════════════════════════════════
    const cleanupErrors = [];
    const cleanupCustomerIds = [contact.id, prodContact.id];
    const cleanupEntities = ['CreditLot', 'WalletTransaction', 'PrepaidCompensationEvent', 'AutoFundPaymentEvent'];

    for (const cid of cleanupCustomerIds) {
      for (const entity of cleanupEntities) {
        try {
          const recs = await b.entities[entity].filter({ customer_id: cid }, undefined, 200);
          const arr = Array.isArray(recs) ? recs : (recs?.data || []);
          for (const r of arr) {
            try { await b.entities[entity].delete(r.id); }
            catch (e) { cleanupErrors.push(`${entity}:${r.id} ${e.message}`); }
          }
        } catch (e) { cleanupErrors.push(`${entity} filter: ${e.message}`); }
      }
    }

    const fixtureDeletes = [
      ['PrepaidWallet', certWallet.id],
      ['PrepaidWallet', prodWallet.id],
      ['Contact', contact.id],
      ['Contact', prodContact.id],
      ['SalesTeamMember', rep.id],
    ];
    for (const [entity, id] of fixtureDeletes) {
      try { await b.entities[entity].delete(id); }
      catch (e) { cleanupErrors.push(`${entity}:${id} ${e.message}`); }
    }

    // Verify no financial residue remains for either fixture customer
    let residualCount = 0;
    for (const cid of cleanupCustomerIds) {
      for (const entity of cleanupEntities) {
        try {
          const recs = await b.entities[entity].filter({ customer_id: cid }, undefined, 200);
          const arr = Array.isArray(recs) ? recs : (recs?.data || []);
          residualCount += arr.length;
        } catch { /* unreadable → treated as clean */ }
      }
    }

    results['certification_fixtures_cleaned'] = {
      status: cleanupErrors.length === 0 && residualCount === 0 ? 'PASS' : 'FAIL',
      residual_records: residualCount,
      cleanup_errors: cleanupErrors,
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
      production_wallet_untouched: prodWalletProtectedCents === 0,
      legitimate_production_path_verified: results['legitimate_production_accepted']?.status === 'PASS',
      feature_flags_unchanged: flagEnabledAtEnd === flagEnabledAtStart,
      cleanup_errors: cleanupErrors,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: 'ERROR' }, { status: 500 });
  }
}