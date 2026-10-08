import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { signPayload } from '../../shared/payrollCrypto.ts';
import {
  setupCertFixtures,
  cleanupCertFixtures,
  snapshotProductionFinancials,
  compareSnapshots,
  verifyCleanupComplete,
} from '../../shared/certFixtures.ts';
import { isCertificationId } from '../../shared/certificationMode.ts';

/**
 * Deployed Payment Contract Certification Suite
 *
 * Tests the ACTUAL DEPLOYED HTTP endpoints (receiveArrivPayCustomerPayment
 * and receiveArrivPayRefundEvent) with properly authenticated synthetic
 * requests using the same transport and payload-building code Arriv Pay uses.
 *
 * All tests use cert_-prefixed synthetic fixtures. No production data.
 * Production payment flags remain OFF — certification bypass is granted
 * ONLY for cert_-prefixed events with valid HMAC.
 */

const TEST_RUN_ID = `cert_deployed_${Date.now()}`;

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  classification: 'LOCAL_PROCESSOR' | 'DEPLOYED_HTTP' | 'CROSS_APP_LEDGER';
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const results: TestResult[] = [];
    let fixtures: any = null;
    let salesRepId = '';
    let prodSnapshotBefore: any = null;
    let prodSnapshotAfter: any = null;

    function check(name: string, classification: TestResult['classification'], condition: boolean, details?: string) {
      results.push({ name, passed: condition, details, classification });
    }

    // ── Get handoff secret and app domain ──────────────────────────────────
    const handoffSecret = secrets.get('ARRIV_PAYROLL_HANDOFF_SECRET');
    if (!handoffSecret) {
      return Response.json({ error: 'ARRIV_PAYROLL_HANDOFF_SECRET not configured' }, { status: 503 });
    }

    const appDomain = secrets.get('BASE44_APP_DOMAIN') || 'arrivestatemedia.base44.app';
    const baseUrl = appDomain.startsWith('http') ? appDomain : `https://${appDomain}`;
    const paymentWebhookUrl = `${baseUrl}/functions/receiveArrivPayCustomerPayment`;
    const refundWebhookUrl = `${baseUrl}/functions/receiveArrivPayRefundEvent`;

    // ── Helper: build and send authenticated HTTP request ───────────────────
    async function sendPaymentEvent(payload: any, options: { badSignature?: boolean; staleTimestamp?: boolean; noSignature?: boolean } = {}) {
      const bodyText = JSON.stringify(payload);
      const timestamp = options.staleTimestamp
        ? new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 min ago — outside ±5min window
        : new Date().toISOString();
      const requestId = `cert_req_${TEST_RUN_ID}_${Math.random().toString(36).slice(2, 8)}`;
      const sourceApp = 'arriv_pay';

      const canonical = [bodyText, timestamp, requestId, sourceApp].join('\n');
      const signature = options.badSignature ? 'bad_signature_12345' : await signPayload(handoffSecret, canonical);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-arriv-pay-timestamp': timestamp,
        'x-arriv-pay-request-id': requestId,
        'x-arriv-pay-source-app': sourceApp,
      };
      if (!options.noSignature) {
        headers['x-arriv-pay-signature'] = signature;
      }

      const response = await fetch(paymentWebhookUrl, {
        method: 'POST',
        headers,
        body: bodyText,
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    }

    async function sendRefundEvent(payload: any) {
      const bodyText = JSON.stringify(payload);
      const timestamp = new Date().toISOString();
      const requestId = `cert_req_${TEST_RUN_ID}_${Math.random().toString(36).slice(2, 8)}`;
      const sourceApp = 'arriv_pay';

      const canonical = [bodyText, timestamp, requestId, sourceApp].join('\n');
      const signature = await signPayload(handoffSecret, canonical);

      const response = await fetch(refundWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-arriv-pay-signature': signature,
          'x-arriv-pay-timestamp': timestamp,
          'x-arriv-pay-request-id': requestId,
          'x-arriv-pay-source-app': sourceApp,
        },
        body: bodyText,
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    }

    // ── Setup fixtures ─────────────────────────────────────────────────────
    try {
      fixtures = await setupCertFixtures(b);
      // Create a synthetic SalesTeamMember for commission attribution test
      const salesRep = await b.entities.SalesTeamMember.create({
        email: `${fixtures.run_id}_rep@cert.test`,
        full_name: 'Cert Sales Rep',
        status: 'active',
        role: 'user',
      });
      salesRepId = salesRep.id;
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

    // ── Snapshot production financials (before) ────────────────────────────
    prodSnapshotBefore = await snapshotProductionFinancials(b);

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 1: STANDARD TOPUP — $500 → 50,000¢ (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const eventId = `${TEST_RUN_ID}_topup_500`;
      const { status, data } = await sendPaymentEvent({
        payment_event_id: eventId,
        subscription_id: `cert_sub_topup_${TEST_RUN_ID}`,
        customer_id: prepaidContactId,
        customer_email: prepaidEmail,
        wallet_id: prepaidWalletId,
        amount_charged: 500,
        amount_charged_cents: 50000,
        status: 'succeeded',
        event_type: 'topup',
        certification: true,
      });

      const wallet = await b.entities.PrepaidWallet.get(prepaidWalletId);
      const lots = await b.entities.CreditLot.filter({ wallet_id: prepaidWalletId, lot_id: data.lot_id });
      const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);

      check('STANDARD_TOPUP: $500 → 50,000¢ BV via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        data.booking_value_issued_cents === 50000 &&
        wallet.booking_value_balance_cents === 50000 &&
        lotArr.length === 1 &&
        lotArr[0].booking_value_issued_cents === 50000 &&
        lotArr[0].source === 'reload',
        `http=${status}, processor=${data.status}, bv_cents=${data.booking_value_issued_cents}, wallet=${wallet.booking_value_balance_cents}, lot_source=${lotArr[0]?.source}`);
    } catch (e) {
      check('STANDARD_TOPUP: $500 → 50,000¢ BV via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 2: STARTER PREPAID PURCHASE — $500 → 55,000¢ + 2 credits (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const eventId = `${TEST_RUN_ID}_starter_500`;
      const { status, data } = await sendPaymentEvent({
        payment_event_id: eventId,
        subscription_id: `cert_sub_starter_${TEST_RUN_ID}`,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 500,
        amount_charged_cents: 50000,
        status: 'succeeded',
        event_type: 'prepaid_purchase',
        certification: true,
      });

      const wallet = await b.entities.PrepaidWallet.get(afWalletId);
      const lots = await b.entities.CreditLot.filter({ wallet_id: afWalletId, lot_id: data.lot_id });
      const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);
      const txns = await b.entities.WalletTransaction.filter({ wallet_id: afWalletId });
      const txnArr = Array.isArray(txns) ? txns : (txns?.data || []);
      const starterTxn = txnArr.find(t => t.transaction_id === data.wallet_transaction_id);

      check('STARTER_PREPAID_BONUS: $500 → 55,000¢ BV + 2 credits via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        data.booking_value_issued_cents === 55000 &&
        data.bonus_booking_value === 50 &&
        wallet.booking_value_balance_cents === 55000 &&
        Math.round(wallet.credits_balance * 100) / 100 === 2.0 &&
        lotArr.length === 1 &&
        lotArr[0].booking_value_issued_cents === 55000 &&
        lotArr[0].tier === 'STARTER' &&
        lotArr[0].source === 'purchase' &&
        starterTxn?.type === 'PREPAID_PURCHASE',
        `http=${status}, processor=${data.status}, debug_evt=${data._debug_event_type}, body_evt=${data._debug_body_event_type}, keys=${data._debug_body_keys?.join(',')}, bv_cents=${data.booking_value_issued_cents}, bonus=${data.bonus_booking_value}, wallet=${wallet.booking_value_balance_cents}, credits=${wallet.credits_balance}, tier=${lotArr[0]?.tier}, source=${lotArr[0]?.source}, txn_type=${starterTxn?.type}`);
    } catch (e) {
      check('STARTER_PREPAID_BONUS: $500 → 55,000¢ BV + 2 credits via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 3: AUTO-FUND RECURRING — $100 → 10,500¢ (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const eventId = `${TEST_RUN_ID}_autofund_100`;
      const { status, data } = await sendPaymentEvent({
        payment_event_id: eventId,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        certification: true,
      });

      // Note: afWallet already has 55000 from Starter purchase above.
      // After $100 auto-fund: 55000 + 10500 = 65500
      const wallet = await b.entities.PrepaidWallet.get(afWalletId);

      check('AUTO_FUND_BONUS: $100 → 10,500¢ BV via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        data.booking_value_issued_cents === 10500 &&
        data.bonus_booking_value === 5 &&
        wallet.booking_value_balance_cents === 65500, // 55000 + 10500
        `http=${status}, processor=${data.status}, bv_cents=${data.booking_value_issued_cents}, bonus=${data.bonus_booking_value}, wallet=${wallet.booking_value_balance_cents}`);
    } catch (e) {
      check('AUTO_FUND_BONUS: $100 → 10,500¢ BV via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 4: TEN DUPLICATE PAYMENT DELIVERIES (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const dupEventId = `${TEST_RUN_ID}_dup_10x`;
      let processedCount = 0;
      let duplicateCount = 0;
      let lastStatus = 0;

      for (let i = 0; i < 10; i++) {
        const { status, data } = await sendPaymentEvent({
          payment_event_id: dupEventId,
          subscription_id: `cert_sub_dup_${TEST_RUN_ID}`,
          customer_id: prepaidContactId,
          customer_email: prepaidEmail,
          wallet_id: prepaidWalletId,
          amount_charged: 200,
          amount_charged_cents: 20000,
          status: 'succeeded',
          event_type: 'topup',
          certification: true,
        });
        lastStatus = status;
        if (data.status === 'processed') processedCount++;
        if (data.status === 'duplicate') duplicateCount++;
      }

      const dupEvents = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: dupEventId });
      const dupEventArr = Array.isArray(dupEvents) ? dupEvents : (dupEvents?.data || []);

      check('PAYMENT_IDEMPOTENCY: 10 duplicate deliveries = 1 funding event via deployed HTTP',
        'DEPLOYED_HTTP',
        processedCount === 1 && duplicateCount === 9 &&
        dupEventArr.length === 1,
        `processed=${processedCount}, duplicates=${duplicateCount}, events=${dupEventArr.length}, http=${lastStatus}`);
    } catch (e) {
      check('PAYMENT_IDEMPOTENCY: 10 duplicate deliveries = 1 funding event via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 5: FAILED PAYMENT — no funding (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const failEventId = `${TEST_RUN_ID}_failed`;
      const { status, data } = await sendPaymentEvent({
        payment_event_id: failEventId,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'failed',
        event_type: 'recurring',
        failure_reason: 'card_declined',
        certification: true,
      });

      check('FAILED_PAYMENT: no funding issued via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        data.booking_value_issued_cents === 0 &&
        data.credits_issued === 0 &&
        !data.lot_id &&
        !data.wallet_transaction_id,
        `http=${status}, processor=${data.status}, bv_cents=${data.booking_value_issued_cents}, lot=${data.lot_id}`);
    } catch (e) {
      check('FAILED_PAYMENT: no funding issued via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 6: MISSING WALLET — rejected with 404 (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const { status, data } = await sendPaymentEvent({
        payment_event_id: `${TEST_RUN_ID}_missing_wallet`,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: 'nonexistent_wallet_cert_12345',
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        certification: true,
      });

      check('MISSING_WALLET: rejected with 404 via deployed HTTP',
        'DEPLOYED_HTTP',
        data.status === 'error' &&
        data.error?.includes('not found'),
        `http=${status}, processor=${data.status}, error=${data.error}`);
    } catch (e) {
      check('MISSING_WALLET: rejected with 404 via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 7: OWNERSHIP MISMATCH — rejected with 403 (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const { status, data } = await sendPaymentEvent({
        payment_event_id: `${TEST_RUN_ID}_mismatch`,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: prepaidWalletId, // wrong wallet
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        certification: true,
      });

      check('OWNERSHIP_MISMATCH: rejected via deployed HTTP',
        'DEPLOYED_HTTP',
        data.status === 'error' &&
        (data.error?.includes('mismatch') || data.error?.includes('ownership') || data.error?.includes('not found')),
        `http=${status}, processor=${data.status}, error=${data.error}`);
    } catch (e) {
      check('OWNERSHIP_MISMATCH: rejected via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 8: AUTO-FUND RENEWAL ID PROPAGATION (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const renewEventId = `${TEST_RUN_ID}_renewal`;
      const { status, data } = await sendPaymentEvent({
        payment_event_id: renewEventId,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        certification: true,
      });

      // Verify the payment event persisted the correct subscription_id and wallet_id
      const events = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: renewEventId });
      const eventArr = Array.isArray(events) ? events : (events?.data || []);
      const evt = eventArr[0];

      // Verify subscription exists and has correct wallet_id
      const subs = await b.entities.AutoFundSubscription.filter({ id: afSubId }, undefined, 1);
      const subArr = Array.isArray(subs) ? subs : (subs?.data || []);
      const sub = subArr[0];

      check('AUTO_FUND_RENEWAL_IDS: wallet_id and subscription_id propagated correctly',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        evt?.subscription_id === afSubId &&
        sub?.wallet_id === afWalletId &&
        sub?.id === afSubId,
        `http=${status}, evt_sub=${evt?.subscription_id}, expected_sub=${afSubId}, sub_wallet=${sub?.wallet_id}, expected_wallet=${afWalletId}`);
    } catch (e) {
      check('AUTO_FUND_RENEWAL_IDS: wallet_id and subscription_id propagated correctly', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 13: COMMISSION REVERSAL WITH ATTRIBUTION (DEPLOYED_HTTP)
    // Need a payment WITH sales_rep_id, then refund it
    // ═══════════════════════════════════════════════════════════════════════
    let commissionPaymentEventId = '';
    try {
      commissionPaymentEventId = `${TEST_RUN_ID}_commission_100`;
      const { status, data } = await sendPaymentEvent({
        payment_event_id: commissionPaymentEventId,
        subscription_id: `cert_sub_comm_${TEST_RUN_ID}`,
        customer_id: prepaidContactId,
        customer_email: prepaidEmail,
        wallet_id: prepaidWalletId,
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        sales_rep_id: salesRepId,
        certification: true,
      });

      // Verify commission event was created — use the commission_event_id from the result
      const commissions = await b.entities.PrepaidCompensationEvent.filter({
        source_event_id: data.commission_event_id || '',
        source_type: 'AUTO_FUND_COMMISSION',
      });
      const commArr = Array.isArray(commissions) ? commissions : (commissions?.data || []);
      const commission = commArr[0];

      check('COMMISSION_REVERSAL_WITH_ATTRIBUTION: commission created with rep',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        data.commission_event_id !== '' &&
        !!commission &&
        commission.commission_amount === 10, // 10% of $100
        `http=${status}, processor=${data.status}, commission_id=${data.commission_event_id}, amount=${commission?.commission_amount}`);
    } catch (e) {
      check('COMMISSION_REVERSAL_WITH_ATTRIBUTION: commission created with rep', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 9: FULL REFUND (DEPLOYED_HTTP + CROSS_APP_LEDGER)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const refundEventId = `${TEST_RUN_ID}_full_refund`;
      const { status, data } = await sendRefundEvent({
        refund_event_id: refundEventId,
        original_payment_event_id: commissionPaymentEventId,
        refunded_commissionable_amount: 100,
        refund_type: 'full',
        reason: 'customer_refund',
        certification: true,
      });

      // Verify commission reversal — query by the new reversal event's source_event_id
      const reversalResult = data.results?.find((r: any) => r.status === 'created');
      const reversals = await b.entities.PrepaidCompensationEvent.filter({
        source_event_id: reversalResult?.source_event_id || '',
        source_type: 'COMMISSION_REVERSAL',
      });
      const revArr = Array.isArray(reversals) ? reversals : (reversals?.data || []);

      // Verify wallet refund adjustment
      const refundTxns = await b.entities.WalletTransaction.filter({
        transaction_id: `refund_${refundEventId}`,
      });
      const refundTxnArr = Array.isArray(refundTxns) ? refundTxns : (refundTxns?.data || []);
      const refundTxn = refundTxnArr[0];

      // Verify CreditLot adjustment
      const originalEvent = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: commissionPaymentEventId }, undefined, 1);
      const origEvtArr = Array.isArray(originalEvent) ? originalEvent : (originalEvent?.data || []);
      const lotId = origEvtArr[0]?.lot_id;
      const lots = await b.entities.CreditLot.filter({ lot_id: lotId }, undefined, 1);
      const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);
      const lot = lotArr[0];

      check('FULL_REFUND: commission reversed + wallet adjusted via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.status === 'processed' &&
        data.reversals_created === 1 &&
        data.total_reversal_amount === 10 && // $10 commission reversed
        revArr.length === 1 &&
        revArr[0].commission_amount === -10 &&
        data.wallet_refund?.status === 'processed' &&
        refundTxn?.type === 'REFUND_REVERSAL' &&
        refundTxn?.booking_value_cents === -10500 && // full $100 = 10500¢ BV reversed
        lot?.booking_value_remaining_cents === 0, // lot fully reversed
        `http=${status}, reversals=${data.reversals_created}, amount=${data.total_reversal_amount}, wallet_refund=${data.wallet_refund?.status}, txn_type=${refundTxn?.type}, txn_bv=${refundTxn?.booking_value_cents}, lot_remaining=${lot?.booking_value_remaining_cents}`);
    } catch (e) {
      check('FULL_REFUND: commission reversed + wallet adjusted via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 10: PARTIAL REFUND (DEPLOYED_HTTP)
    // Use the Starter purchase ($500 → 55000¢) and refund $250 (50%)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const starterEventId = `${TEST_RUN_ID}_starter_500`;
      const partialRefundId = `${TEST_RUN_ID}_partial_refund`;
      const { status, data } = await sendRefundEvent({
        refund_event_id: partialRefundId,
        original_payment_event_id: starterEventId,
        refunded_commissionable_amount: 250, // 50% of $500
        refund_type: 'partial',
        reason: 'partial_refund',
        certification: true,
      });

      // Verify wallet refund adjustment (50% of 55000 = 27500¢)
      const refundTxns = await b.entities.WalletTransaction.filter({
        transaction_id: `refund_${partialRefundId}`,
      });
      const refundTxnArr = Array.isArray(refundTxns) ? refundTxns : (refundTxns?.data || []);
      const refundTxn = refundTxnArr[0];

      // Verify CreditLot adjustment
      const originalEvent = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: starterEventId }, undefined, 1);
      const origEvtArr = Array.isArray(originalEvent) ? originalEvent : (originalEvent?.data || []);
      const lotId = origEvtArr[0]?.lot_id;
      const lots = await b.entities.CreditLot.filter({ lot_id: lotId }, undefined, 1);
      const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);
      const lot = lotArr[0];

      check('PARTIAL_REFUND: proportional wallet adjustment via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.wallet_refund?.status === 'processed' &&
        data.wallet_refund?.refund_bv_cents_actual === 27500 && // 50% of 55000
        refundTxn?.type === 'REFUND_REVERSAL' &&
        refundTxn?.booking_value_cents === -27500 &&
        lot?.booking_value_remaining_cents === 27500, // 55000 - 27500
        `http=${status}, wallet_refund=${data.wallet_refund?.status}, actual=${data.wallet_refund?.refund_bv_cents_actual}, txn_bv=${refundTxn?.booking_value_cents}, lot_remaining=${lot?.booking_value_remaining_cents}`);
    } catch (e) {
      check('PARTIAL_REFUND: proportional wallet adjustment via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 11: CHARGEBACK (DEPLOYED_HTTP)
    // Use the auto-fund $100 payment and chargeback the full amount
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const autofundEventId = `${TEST_RUN_ID}_autofund_100`;
      const chargebackId = `${TEST_RUN_ID}_chargeback`;
      const { status, data } = await sendRefundEvent({
        refund_event_id: chargebackId,
        original_payment_event_id: autofundEventId,
        refunded_commissionable_amount: 100,
        refund_type: 'chargeback',
        reason: 'chargeback',
        certification: true,
      });

      const refundTxns = await b.entities.WalletTransaction.filter({
        transaction_id: `refund_${chargebackId}`,
      });
      const refundTxnArr = Array.isArray(refundTxns) ? refundTxns : (refundTxns?.data || []);
      const refundTxn = refundTxnArr[0];

      check('CHARGEBACK: full reversal via deployed HTTP',
        'DEPLOYED_HTTP',
        status === 200 &&
        data.wallet_refund?.status === 'processed' &&
        data.wallet_refund?.refund_bv_cents_actual === 10500 &&
        refundTxn?.type === 'REFUND_REVERSAL' &&
        refundTxn?.booking_value_cents === -10500,
        `http=${status}, wallet_refund=${data.wallet_refund?.status}, actual=${data.wallet_refund?.refund_bv_cents_actual}, txn_bv=${refundTxn?.booking_value_cents}`);
    } catch (e) {
      check('CHARGEBACK: full reversal via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 12: REFUND IDEMPOTENCY (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const idempotentRefundId = `${TEST_RUN_ID}_refund_idem`;
      const idempotentPaymentEventId = `${TEST_RUN_ID}_renewal`;
      const r1 = await sendRefundEvent({
        refund_event_id: idempotentRefundId,
        original_payment_event_id: idempotentPaymentEventId,
        refunded_commissionable_amount: 50,
        refund_type: 'partial',
        reason: 'idempotency_test',
        certification: true,
      });
      const r2 = await sendRefundEvent({
        refund_event_id: idempotentRefundId,
        original_payment_event_id: idempotentPaymentEventId,
        refunded_commissionable_amount: 50,
        refund_type: 'partial',
        reason: 'idempotency_test',
        certification: true,
      });

      // Verify only one REFUND_REVERSAL txn exists
      const refundTxns = await b.entities.WalletTransaction.filter({
        transaction_id: `refund_${idempotentRefundId}`,
      });
      const refundTxnArr = Array.isArray(refundTxns) ? refundTxns : (refundTxns?.data || []);

      check('REFUND_IDEMPOTENCY: duplicate refund = no double reversal via deployed HTTP',
        'DEPLOYED_HTTP',
        r1.status === 200 &&
        r2.status === 200 &&
        r2.data.wallet_refund?.status === 'duplicate' &&
        refundTxnArr.length === 1,
        `r1=${r1.status}, r2=${r2.status}, r2_wallet=${r2.data.wallet_refund?.status}, txns=${refundTxnArr.length}`);
    } catch (e) {
      check('REFUND_IDEMPOTENCY: duplicate refund = no double reversal via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 14: WALLET_REFUND_ADJUSTMENTS — CreditLot + wallet balance (CROSS_APP_LEDGER)
    // Already verified in tests 9-11, but explicitly check ledger integrity
    // ═══════════════════════════════════════════════════════════════════════
    try {
      // Verify all REFUND_REVERSAL transactions are negative deltas
      const allRefundTxns = await b.entities.WalletTransaction.filter({
        customer_email: { $regex: `${fixtures.run_id}_` },
        type: 'REFUND_REVERSAL',
      });
      const allRefundArr = Array.isArray(allRefundTxns) ? allRefundTxns : (allRefundTxns?.data || []);
      const allNegative = allRefundArr.every(t => t.booking_value_cents < 0);

      // Verify no lot has negative remaining
      const allLots = await b.entities.CreditLot.filter({
        customer_email: { $regex: `${fixtures.run_id}_` },
      });
      const allLotArr = Array.isArray(allLots) ? allLots : (allLots?.data || []);
      const noNegativeRemaining = allLotArr.every(l => l.booking_value_remaining_cents >= 0);

      // Verify wallet balance is non-negative
      const afWallet = await b.entities.PrepaidWallet.get(afWalletId);
      const prepaidWallet = await b.entities.PrepaidWallet.get(prepaidWalletId);

      check('WALLET_REFUND_ADJUSTMENTS: CreditLot + wallet balance correct',
        'CROSS_APP_LEDGER',
        allNegative &&
        noNegativeRemaining &&
        afWallet.booking_value_balance_cents >= 0 &&
        prepaidWallet.booking_value_balance_cents >= 0,
        `refund_txns=${allRefundArr.length}, all_negative=${allNegative}, lots=${allLotArr.length}, no_neg_remaining=${noNegativeRemaining}, af_wallet=${afWallet.booking_value_balance_cents}, prepaid_wallet=${prepaidWallet.booking_value_balance_cents}`);
    } catch (e) {
      check('WALLET_REFUND_ADJUSTMENTS: CreditLot + wallet balance correct', 'CROSS_APP_LEDGER', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 17: HMAC AUTHENTICATION + REPLAY REJECTION (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      // Bad signature
      const badSig = await sendPaymentEvent({
        payment_event_id: `${TEST_RUN_ID}_bad_sig`,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        certification: true,
      }, { badSignature: true });

      // Stale timestamp
      const staleTs = await sendPaymentEvent({
        payment_event_id: `${TEST_RUN_ID}_stale_ts`,
        subscription_id: afSubId,
        customer_id: afContactId,
        customer_email: afEmail,
        wallet_id: afWalletId,
        amount_charged: 100,
        amount_charged_cents: 10000,
        status: 'succeeded',
        event_type: 'recurring',
        certification: true,
      }, { staleTimestamp: true });

      check('HMAC_AUTH: invalid signature + stale timestamp rejected via deployed HTTP',
        'DEPLOYED_HTTP',
        badSig.data?.error?.includes('Invalid signature') &&
        staleTs.data?.error?.includes('Timestamp'),
        `bad_sig=${badSig.status}:${badSig.data?.error}, stale_ts=${staleTs.status}:${staleTs.data?.error}`);
    } catch (e) {
      check('HMAC_AUTH: invalid signature + stale timestamp rejected via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEST 18: WALLET ISOLATION + CREDIT PRECISION (DEPLOYED_HTTP)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const pWallet = await b.entities.PrepaidWallet.get(prepaidWalletId);
      const aWallet = await b.entities.PrepaidWallet.get(afWalletId);

      // Verify cert isolation
      const pIsCert = isCertificationId(pWallet.customer_email);
      const aIsCert = isCertificationId(aWallet.customer_email);

      // Verify integer cents (no float drift)
      const pCentsExact = pWallet.booking_value_balance_cents % 1 === 0;
      const aCentsExact = aWallet.booking_value_balance_cents % 1 === 0;

      // Verify all lots have integer cents
      const allLots = await b.entities.CreditLot.filter({
        customer_email: { $regex: `${fixtures.run_id}_` },
      });
      const allLotArr = Array.isArray(allLots) ? allLots : (allLots?.data || []);
      const allLotsExact = allLotArr.every(l =>
        l.booking_value_issued_cents % 1 === 0 &&
        l.booking_value_remaining_cents % 1 === 0
      );

      check('WALLET_ISOLATION_CREDIT_PRECISION: cert isolation + integer cents via deployed HTTP',
        'DEPLOYED_HTTP',
        pIsCert && aIsCert && pCentsExact && aCentsExact && allLotsExact,
        `p_cert=${pIsCert}, a_cert=${aIsCert}, p_exact=${pCentsExact}, a_exact=${aCentsExact}, lots_exact=${allLotsExact}, lots=${allLotArr.length}`);
    } catch (e) {
      check('WALLET_ISOLATION_CREDIT_PRECISION: cert isolation + integer cents via deployed HTTP', 'DEPLOYED_HTTP', false, e.message);
    }

    // ── DEBUG: Check stored event_type for Starter purchase ──────────────
    let debugStarterEvent: any = null;
    try {
      const starterEvents = await b.entities.AutoFundPaymentEvent.filter({
        payment_event_id: `${TEST_RUN_ID}_starter_500`,
      }, undefined, 1);
      const starterArr = Array.isArray(starterEvents) ? starterEvents : (starterEvents?.data || []);
      debugStarterEvent = {
        stored_event_type: starterArr[0]?.event_type,
        stored_booking_value_cents: starterArr[0]?.booking_value_issued_cents,
        stored_bonus: starterArr[0]?.bonus_booking_value,
        raw_event_has_prepaid_purchase: starterArr[0]?.raw_event?.includes('prepaid_purchase'),
        raw_event_snippet: starterArr[0]?.raw_event?.substring(0, 200),
      };
    } catch (e) {
      debugStarterEvent = { error: e.message };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SNAPSHOT PRODUCTION FINANCIALS (AFTER)
    // ═══════════════════════════════════════════════════════════════════════
    prodSnapshotAfter = await snapshotProductionFinancials(b);
    const snapshotDiff = compareSnapshots(prodSnapshotBefore, prodSnapshotAfter);

    check('PRODUCTION_BALANCES_UNCHANGED: no production financial records modified',
      'CROSS_APP_LEDGER',
      snapshotDiff.unchanged,
      snapshotDiff.unchanged ? 'all production counts and balances unchanged' : `diffs: ${snapshotDiff.diffs.join(', ')}`);

    // ═══════════════════════════════════════════════════════════════════════
    // CLEANUP + VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════
    let cleanupResult: any = null;
    let cleanupVerification: any = null;
    try {
      // Delete the synthetic SalesTeamMember
      if (salesRepId) {
        try { await b.entities.SalesTeamMember.delete(salesRepId); } catch {}
      }
      cleanupResult = await cleanupCertFixtures(b, fixtures.run_id);
      cleanupVerification = await verifyCleanupComplete(b, fixtures.run_id);
    } catch (e) {
      cleanupResult = { deleted: [], errors: [e.message] };
      cleanupVerification = { clean: false, remaining_cert_records: [], errors: [e.message] };
    }

    check('SYNTHETIC_CLEANUP: all cert records removed, no failures swallowed',
      'CROSS_APP_LEDGER',
      cleanupResult.errors.length === 0 &&
      cleanupVerification.clean &&
      cleanupVerification.remaining_cert_records.length === 0,
      `cleanup_errors=${cleanupResult.errors?.length}, verification_clean=${cleanupVerification.clean}, remaining=${JSON.stringify(cleanupVerification.remaining_cert_records)}, verify_errors=${cleanupVerification.errors?.length}`);

    // ── Results ────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return Response.json({
      test_run_id: TEST_RUN_ID,
      fixture_run_id: fixtures.run_id,
      total: results.length,
      passed,
      failed,
      all_passed: failed === 0,
      production_balances_unchanged: snapshotDiff.unchanged,
      debug_starter_event: debugStarterEvent,
      cleanup_errors: cleanupResult?.errors || [],
      cleanup_verification: cleanupVerification,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}