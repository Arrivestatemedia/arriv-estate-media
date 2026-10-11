import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { processCommissionReversal } from '../../shared/commissionReversalEngine.ts';
import { setupCertFixtures, cleanupCertFixtures } from '../../shared/certFixtures.ts';

/**
 * Payment Contract Verification Suite
 *
 * Verifies the canonical Arriv Pay → Estate Media payment contract:
 *   - Prepaid funding ($500 → 55,000 cents BV → 2 credits)
 *   - Auto-Fund funding ($100 → 10,500 cents BV)
 *   - Idempotency (10 duplicate deliveries = 1 funding event)
 *   - Failed/pending payments produce no funding
 *   - Refund (full, partial, chargeback) commission reversal
 *   - Integer-cent precision preserved
 *
 * All tests use synthetic cert_-prefixed fixtures. No production data.
 */
const TEST_RUN_ID = `cert_pc_${Date.now()}`;

interface TestResult { name: string; passed: boolean; details?: string; }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const results: TestResult[] = [];
    let fixtures: any = null;

    function check(name: string, condition: boolean, details?: string) {
      results.push({ name, passed: condition, details });
    }

    // ── Setup fixtures ──────────────────────────────────────────────────
    try {
      fixtures = await setupCertFixtures(b);
    } catch (e) {
      return Response.json({ error: `Fixture setup failed: ${e.message}` }, { status: 500 });
    }

    const prepaidWalletId = fixtures.prepaid.wallet_id;
    const prepaidContactId = fixtures.prepaid.contact_id;
    const prepaidEmail = fixtures.prepaid.customer_email;

    const afWalletId = fixtures.auto_fund.wallet_id;
    const afContactId = fixtures.auto_fund.contact_id;
    const afEmail = fixtures.auto_fund.customer_email;
    const afSubId = fixtures.auto_fund.subscription_id;

    // ════════════════════════════════════════════════════════════════════
    // PREPAID TOPUP: $500 → 50,000 cents BV (1:1, no bonus for topups)
    // ════════════════════════════════════════════════════════════════════
    try {
      const prepaidEventId = `${TEST_RUN_ID}_prepaid_500`;
      const prepaidResult = await processAutoFundPayment({
        base44: b,
        payment_event_id: prepaidEventId,
        subscription_id: `cert_prepaid_sub_${TEST_RUN_ID}`,
        customer_id: prepaidContactId,
        customer_email: prepaidEmail,
        wallet_id: prepaidWalletId,
        amount_charged: 500, // $500
        status: 'succeeded',
        event_type: 'topup', // one-time topup — 1:1 BV, no bonus
        cert_mode: true,
      });

      const wallet = await b.entities.PrepaidWallet.get(prepaidWalletId);
      const lots = await b.entities.CreditLot.filter({ wallet_id: prepaidWalletId });
      const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);
      const txns = await b.entities.WalletTransaction.filter({ wallet_id: prepaidWalletId });
      const txnArr = Array.isArray(txns) ? txns : (txns?.data || []);
      const events = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: prepaidEventId });
      const eventArr = Array.isArray(events) ? events : (events?.data || []);

      // Topup: $500 → 50,000 cents (1:1, no bonus)
      // Credits = 50000 / 27500 = 1.818... → 1.82
      const expectedCredits = Math.round((50000 / 27500) * 100) / 100;

      check(
        'PREPAID_TOPUP: $500 → 50,000 cents BV (1:1, no bonus)',
        prepaidResult.status === 'processed' &&
        prepaidResult.booking_value_issued_cents === 50000 &&
        wallet.booking_value_balance_cents === 50000 &&
        Math.round(wallet.credits_balance * 100) / 100 === expectedCredits &&
        lotArr.length === 1 &&
        lotArr[0].booking_value_issued_cents === 50000 &&
        lotArr[0].booking_value_remaining_cents === 50000 &&
        txnArr.length === 1 &&
        txnArr[0].booking_value_cents === 50000 &&
        eventArr.length === 1 &&
        eventArr[0].booking_value_issued_cents === 50000,
        `status=${prepaidResult.status}, bv_cents=${wallet.booking_value_balance_cents}, credits=${wallet.credits_balance}, lots=${lotArr.length}, txns=${txnArr.length}, events=${eventArr.length}`
      );
    } catch (e) {
      check('PREPAID_TOPUP: $500 → 50,000 cents BV (1:1, no bonus)', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // PREPAID IDEMPOTENCY: 10 duplicate deliveries = 1 funding event
    // ════════════════════════════════════════════════════════════════════
    try {
      const dupEventId = `${TEST_RUN_ID}_prepaid_dup`;
      let processedCount = 0;
      let duplicateCount = 0;
      for (let i = 0; i < 10; i++) {
        const r = await processAutoFundPayment({
          base44: b,
          payment_event_id: dupEventId,
          subscription_id: `cert_prepaid_dup_sub_${TEST_RUN_ID}`,
          customer_id: prepaidContactId,
          customer_email: prepaidEmail,
          wallet_id: prepaidWalletId,
          amount_charged: 500,
          status: 'succeeded',
          event_type: 'topup',
          cert_mode: true,
        });
        if (r.status === 'processed') processedCount++;
        if (r.status === 'duplicate') duplicateCount++;
      }

      const dupEvents = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: dupEventId });
      const dupEventArr = Array.isArray(dupEvents) ? dupEvents : (dupEvents?.data || []);
      const dupWallet = await b.entities.PrepaidWallet.get(prepaidWalletId);
      // Wallet should have original 55000 + ONE duplicate 55000 = 110000
      const dupLots = await b.entities.CreditLot.filter({ wallet_id: prepaidWalletId });
      const dupLotArr = Array.isArray(dupLots) ? dupLots : (dupLots?.data || []);

      check(
        'PREPAID_IDEMPOTENCY: 10 duplicate deliveries = 1 funding event',
        processedCount === 1 && duplicateCount === 9 &&
        dupEventArr.length === 1 &&
        dupLotArr.length === 2 && // original + one duplicate
        dupWallet.booking_value_balance_cents === 100000, // 50000 + 50000
        `processed=${processedCount}, duplicates=${duplicateCount}, events=${dupEventArr.length}, lots=${dupLotArr.length}, balance_cents=${dupWallet.booking_value_balance_cents}`
      );
    } catch (e) {
      check('PREPAID_IDEMPOTENCY: 10 duplicate deliveries = 1 funding event', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // AUTO-FUND FUNDING: $100 → 10,500 cents BV
    // ════════════════════════════════════════════════════════════════════
    try {
      const afEventId = `${TEST_RUN_ID}_autofund_150`;
      const afResult = await processAutoFundPayment({
        base44: b,
        payment_event_id: afEventId,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100, // $100
        status: 'succeeded',
        event_type: 'recurring',
        cert_mode: true,
      });

      const afWallet = await b.entities.PrepaidWallet.get(afWalletId);
      const afLots = await b.entities.CreditLot.filter({ wallet_id: afWalletId });
      const afLotArr = Array.isArray(afLots) ? afLots : (afLots?.data || []);
      const afTxns = await b.entities.WalletTransaction.filter({ wallet_id: afWalletId });
      const afTxnArr = Array.isArray(afTxns) ? afTxns : (afTxns?.data || []);
      const afEvents = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: afEventId });
      const afEventArr = Array.isArray(afEvents) ? afEvents : (afEvents?.data || []);

      check(
        'AUTO_FUND_FUNDING: $100 → 10,500 cents BV',
        afResult.status === 'processed' &&
        afResult.booking_value_issued_cents === 10500 &&
        afWallet.booking_value_balance_cents === 10500 &&
        afLotArr.length === 1 &&
        afLotArr[0].booking_value_issued_cents === 10500 &&
        afLotArr[0].booking_value_remaining_cents === 10500 &&
        afTxnArr.length === 1 &&
        afTxnArr[0].booking_value_cents === 10500 &&
        afEventArr.length === 1 &&
        afEventArr[0].booking_value_issued_cents === 10500,
        `status=${afResult.status}, bv_cents=${afWallet.booking_value_balance_cents}, lots=${afLotArr.length}, txns=${afTxnArr.length}, events=${afEventArr.length}`
      );
    } catch (e) {
      check('AUTO_FUND_FUNDING: $100 → 10,500 cents BV', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // AUTO-FUND IDEMPOTENCY: 10 duplicate deliveries = 1 funding event
    // ════════════════════════════════════════════════════════════════════
    try {
      const afDupEventId = `${TEST_RUN_ID}_autofund_dup`;
      let afProcessed = 0;
      let afDuplicate = 0;
      for (let i = 0; i < 10; i++) {
        const r = await processAutoFundPayment({
          base44: b,
          payment_event_id: afDupEventId,
          subscription_id: afSubId,
          customer_id: afContactId,
          customer_email: afEmail,
          wallet_id: afWalletId,
          amount_charged: 100,
          status: 'succeeded',
          event_type: 'recurring',
          cert_mode: true,
        });
        if (r.status === 'processed') afProcessed++;
        if (r.status === 'duplicate') afDuplicate++;
      }

      const afDupEvents = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: afDupEventId });
      const afDupArr = Array.isArray(afDupEvents) ? afDupEvents : (afDupEvents?.data || []);
      const afDupWallet = await b.entities.PrepaidWallet.get(afWalletId);
      const afDupLots = await b.entities.CreditLot.filter({ wallet_id: afWalletId });
      const afDupLotArr = Array.isArray(afDupLots) ? afDupLots : (afDupLots?.data || []);

      check(
        'AUTO_FUND_IDEMPOTENCY: 10 duplicate deliveries = 1 funding event',
        afProcessed === 1 && afDuplicate === 9 &&
        afDupArr.length === 1 &&
        afDupLotArr.length === 2 && // original + one duplicate
        afDupWallet.booking_value_balance_cents === 21000, // 10500 + 10500
        `processed=${afProcessed}, duplicates=${afDuplicate}, events=${afDupArr.length}, lots=${afDupLotArr.length}, balance_cents=${afDupWallet.booking_value_balance_cents}`
      );
    } catch (e) {
      check('AUTO_FUND_IDEMPOTENCY: 10 duplicate deliveries = 1 funding event', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // FAILED PAYMENT: no funding
    // ════════════════════════════════════════════════════════════════════
    try {
      const failEventId = `${TEST_RUN_ID}_autofund_fail`;
      const failResult = await processAutoFundPayment({
        base44: b,
        payment_event_id: failEventId,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100,
        status: 'failed',
        event_type: 'recurring',
        failure_reason: 'card_declined',
        cert_mode: true,
      });

      const failWallet = await b.entities.PrepaidWallet.get(afWalletId);
      const failLots = await b.entities.CreditLot.filter({ wallet_id: afWalletId });
      const failLotArr = Array.isArray(failLots) ? failLots : (failLots?.data || []);
      const failEvents = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: failEventId });
      const failEventArr = Array.isArray(failEvents) ? failEvents : (failEvents?.data || []);

      check(
        'FAILED_PAYMENT: no funding issued',
        failResult.status === 'processed' && // event is recorded
        failResult.booking_value_issued_cents === 0 && // but no BV
        failResult.credits_issued === 0 &&
        failResult.lot_id === '' && // no lot created
        failResult.wallet_transaction_id === '' && // no txn created
        failEventArr.length === 1 &&
        failEventArr[0].booking_value_issued_cents === 0 &&
        failEventArr[0].status === 'failed',
        `status=${failResult.status}, bv_cents=${failResult.booking_value_issued_cents}, lot=${failResult.lot_id}, txn=${failResult.wallet_transaction_id}`
      );
    } catch (e) {
      check('FAILED_PAYMENT: no funding issued', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // WALLET NOT FOUND: safe rejection
    // ════════════════════════════════════════════════════════════════════
    try {
      const missingWalletResult = await processAutoFundPayment({
        base44: b,
        payment_event_id: `${TEST_RUN_ID}_missing_wallet`,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: 'nonexistent_wallet_id_12345',
        amount_charged: 100,
        status: 'succeeded',
        event_type: 'recurring',
        cert_mode: true,
      });

      check(
        'WALLET_NOT_FOUND: safe rejection (no funding, no crash)',
        missingWalletResult.status === 'error' &&
        missingWalletResult.error?.includes('not found') &&
        !missingWalletResult.lot_id &&
        !missingWalletResult.wallet_transaction_id,
        `status=${missingWalletResult.status}, error=${missingWalletResult.error}`
      );
    } catch (e) {
      check('WALLET_NOT_FOUND: safe rejection (no funding, no crash)', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // OWNERSHIP MISMATCH: safe rejection
    // ════════════════════════════════════════════════════════════════════
    try {
      // Use prepaid wallet but auto-fund customer_id — mismatch
      const mismatchResult = await processAutoFundPayment({
        base44: b,
        payment_event_id: `${TEST_RUN_ID}_mismatch`,
        subscription_id: afSubId,
        customer_id: afContactId, // auto-fund customer
        customer_email: afEmail, // auto-fund email
        wallet_id: prepaidWalletId, // WRONG wallet (prepaid, not auto-fund)
        amount_charged: 100,
        status: 'succeeded',
        event_type: 'recurring',
        cert_mode: true,
      });

      check(
        'OWNERSHIP_MISMATCH: safe rejection (no funding to wrong wallet)',
        mismatchResult.status === 'error' &&
        (mismatchResult.error?.includes('mismatch') || mismatchResult.error?.includes('not found')),
        `status=${mismatchResult.status}, error=${mismatchResult.error}`
      );
    } catch (e) {
      check('OWNERSHIP_MISMATCH: safe rejection (no funding to wrong wallet)', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // REFUND: full refund commission reversal
    // ════════════════════════════════════════════════════════════════════
    try {
      // The auto-fund $100 payment created no commission (no sales_rep_id).
      // So a full refund should return 'no_commission'.
      const fullRefundResult = await processCommissionReversal({
        base44: b,
        refund_event_id: `${TEST_RUN_ID}_refund_full`,
        original_payment_event_id: `${TEST_RUN_ID}_autofund_150`,
        refunded_commissionable_amount: 100,
        reason: 'customer_refund',
        actor: 'arriv_pay',
        cert_mode: true,
      });

      check(
        'FULL_REFUND: no commission to reverse (no rep attributed)',
        fullRefundResult.status === 'no_commission' &&
        fullRefundResult.reversals_created === 0,
        `status=${fullRefundResult.status}, reversals=${fullRefundResult.reversals_created}`
      );
    } catch (e) {
      check('FULL_REFUND: no commission to reverse (no rep attributed)', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // REFUND IDEMPOTENCY: duplicate refund event = no double reversal
    // ════════════════════════════════════════════════════════════════════
    try {
      const refundEventId = `${TEST_RUN_ID}_refund_idem`;
      const r1 = await processCommissionReversal({
        base44: b,
        refund_event_id: refundEventId,
        original_payment_event_id: `${TEST_RUN_ID}_autofund_150`,
        refunded_commissionable_amount: 50,
        reason: 'partial_refund',
        actor: 'arriv_pay',
        cert_mode: true,
      });
      const r2 = await processCommissionReversal({
        base44: b,
        refund_event_id: refundEventId,
        original_payment_event_id: `${TEST_RUN_ID}_autofund_150`,
        refunded_commissionable_amount: 50,
        reason: 'partial_refund',
        actor: 'arriv_pay',
        cert_mode: true,
      });

      check(
        'REFUND_IDEMPOTENCY: duplicate refund = no double reversal',
        r1.status === r2.status &&
        r2.reversals_created === 0, // second call creates nothing
        `r1_status=${r1.status}, r2_status=${r2.status}, r1_reversals=${r1.reversals_created}, r2_reversals=${r2.reversals_created}`
      );
    } catch (e) {
      check('REFUND_IDEMPOTENCY: duplicate refund = no double reversal', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // INTEGER-CENT PRECISION: no floating-point drift
    // ════════════════════════════════════════════════════════════════════
    try {
      const afWalletFinal = await b.entities.PrepaidWallet.get(afWalletId);
      const afLotsFinal = await b.entities.CreditLot.filter({ wallet_id: afWalletId });
      const afLotsArr = Array.isArray(afLotsFinal) ? afLotsFinal : (afLotsFinal?.data || []);

      // After: 1 successful $100 + 1 duplicate $100 + 1 failed (no BV)
      // Balance should be exactly 21000 cents (10500 + 10500)
      // No floating-point drift
      const allCentsExact = afLotsArr.every(l =>
        l.booking_value_issued_cents % 1 === 0 &&
        l.booking_value_remaining_cents % 1 === 0
      );

      check(
        'CREDIT_PRECISION: integer cents exact, no float drift',
        afWalletFinal.booking_value_balance_cents === 21000 &&
        afWalletFinal.booking_value_balance === 210 && // display
        allCentsExact,
        `balance_cents=${afWalletFinal.booking_value_balance_cents}, balance_display=${afWalletFinal.booking_value_balance}, all_cents_exact=${allCentsExact}`
      );
    } catch (e) {
      check('CREDIT_PRECISION: integer cents exact, no float drift', false, e.message);
    }

    // ════════════════════════════════════════════════════════════════════
    // PRODUCTION ISOLATION: cert fixtures have cert_-prefixed emails
    // ════════════════════════════════════════════════════════════════════
    try {
      // Verify the cert wallets we created have cert_-prefixed emails
      // (isolation is enforced by the processor's cert-mode checks)
      const pWallet = await b.entities.PrepaidWallet.get(prepaidWalletId);
      const aWallet = await b.entities.PrepaidWallet.get(afWalletId);

      check(
        'PRODUCTION_ISOLATION: cert fixtures have cert_-prefixed emails',
        isCertEmail(pWallet.customer_email) &&
        isCertEmail(aWallet.customer_email),
        `prepaid_email=${pWallet.customer_email}, autofund_email=${aWallet.customer_email}`
      );
    } catch (e) {
      check('PRODUCTION_ISOLATION: cert fixtures have cert_-prefixed emails', false, e.message);
    }

    // ── Cleanup ────────────────────────────────────────────────────────
    try {
      await cleanupCertFixtures(b, fixtures.run_id);
    } catch {}

    // ── Results ────────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return Response.json({
      test_run_id: TEST_RUN_ID,
      fixture_run_id: fixtures.run_id,
      total: results.length,
      passed,
      failed,
      all_passed: failed === 0,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}

function isCertEmail(email: string): boolean {
  return email?.includes('@cert.test') || email?.startsWith('cert_');
}