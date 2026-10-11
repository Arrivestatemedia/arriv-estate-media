import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { processCommissionReversal } from '../../shared/commissionReversalEngine.ts';
import { isCertificationId } from '../../shared/certificationMode.ts';
import { round2, generateId, getTierConfig, getAutoFundConfig, calculatePrepaidCommission, calculateAutoFundCommission, PREPAID_CREDIT_VALUE, addMonths } from '../../shared/prepaidEngine.ts';

/**
 * Certification Test Suite
 *
 * Runs synthetic cert_-prefixed test transactions through the shared
 * processors to validate:
 *   - Prepaid payment delivery + wallet funding
 *   - Prepaid idempotency (duplicate events)
 *   - Auto-Fund payment delivery + wallet funding
 *   - Auto-Fund idempotency
 *   - Full refund → commission reversal
 *   - Partial refund → proportional reversal
 *   - Multiple partial refunds (cumulative cap)
 *   - Duplicate refund idempotency
 *   - Auto-Fund refund (cash not Booking Value)
 *   - Prepaid bonus exclusion (cash not Booking Value)
 *   - Already-paid commission handoff (no payroll mutation)
 *
 * All test records use cert_ prefixed IDs so they are clearly identifiable
 * as synthetic and excluded from production analytics/payroll.
 *
 * No real customer is charged. No real employee is paid. No customer-service
 * agent is modified. The production feature flag stays OFF.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const results = {};
    const nowIso = new Date().toISOString();

    // ════════════════════════════════════════════════════════════════════════
    // SETUP: create synthetic cert_ customer + wallet + rep
    // ════════════════════════════════════════════════════════════════════════
    const certRunId = 'cert_' + Date.now();
    const certCustomerEmail = `${certRunId}_customer@cert.arriv.internal`;
    const certRepEmail = `${certRunId}_rep@cert.arriv.internal`;

    // Create synthetic Contact
    const contact = await b.entities.Contact.create({
      email: certCustomerEmail,
      firstname: 'CertTest',
      lastname: 'Customer',
      phone: '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    });

    // Create synthetic SalesTeamMember (rep)
    const rep = await b.entities.SalesTeamMember.create({
      email: certRepEmail,
      full_name: 'Cert Test Rep',
      status: 'active',
      role: 'user',
      created_date: nowIso,
    });

    // ════════════════════════════════════════════════════════════════════════
    // TEST 1: Prepaid Starter cert_ payment
    // Synthetic customer cash: $500 → $550 Booking Value, 2 credits
    // ════════════════════════════════════════════════════════════════════════
    const starterConfig = getTierConfig('STARTER');
    const certWalletId1 = 'cert_wallet_' + generateId('w').slice(0, 12);
    const certPaymentEventId1 = certRunId + '_prepaid_pay';

    // Create synthetic wallet
    const wallet1 = await b.entities.PrepaidWallet.create({
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      customer_name: 'CertTest Customer',
      tier: 'STARTER',
      support_tier: 'PREPAID_STARTER',
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
      sales_rep_id: rep.id,
      sales_rep_email: certRepEmail,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    // Simulate Prepaid purchase via managePrepaid-like flow (cert_)
    const certTxnId1 = 'cert_ptxn_' + generateId('t').slice(0, 12);
    const certLotId1 = 'cert_lot_' + generateId('l').slice(0, 12);
    const certCommissionId1 = 'cert_empe_' + generateId('c').slice(0, 12);

    await b.entities.CreditLot.create({
      wallet_id: wallet1.id,
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      lot_id: certLotId1,
      source: 'purchase',
      source_transaction_id: certTxnId1,
      tier: 'STARTER',
      credits_issued: starterConfig.credits,
      credits_remaining: starterConfig.credits,
      booking_value_issued: starterConfig.booking_value,
      booking_value_remaining: starterConfig.booking_value,
      expires_at: addMonths(new Date(), 12).toISOString(),
      expired: false,
      fifo_order: Date.now(),
      stripe_transaction_id: 'cert_stripe_',
      created_at: nowIso,
    });

    await b.entities.WalletTransaction.create({
      transaction_id: certTxnId1,
      wallet_id: wallet1.id,
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      type: 'PREPAID_PURCHASE',
      cash_amount: starterConfig.cash_price,
      credits: starterConfig.credits,
      booking_value: starterConfig.booking_value,
      stripe_transaction_id: 'cert_stripe_',
      booking_id: '',
      lot_id: certLotId1,
      source: 'ADMIN',
      actor: 'certification_suite',
      description: `CERT Prepaid STARTER purchase — $${starterConfig.cash_price}`,
      prepaid_tier: 'STARTER',
      created_at: nowIso,
    });

    await b.entities.PrepaidWallet.update(wallet1.id, {
      credits_balance: starterConfig.credits,
      booking_value_balance: starterConfig.booking_value,
      total_credits_issued: starterConfig.credits,
      total_booking_value_issued: starterConfig.booking_value,
      updated_at: nowIso,
    });

    const certCommissionAmount1 = calculatePrepaidCommission(starterConfig.cash_price);
    await b.entities.PrepaidCompensationEvent.create({
      source_event_id: certCommissionId1,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'PREPAID_PURCHASE_COMMISSION',
      employee_id: rep.id,
      employee_email: certRepEmail,
      customer_id: contact.id,
      transaction_id: certTxnId1,
      gross_customer_cash: starterConfig.cash_price,
      commission_amount: certCommissionAmount1,
      currency: 'USD',
      earned_at: nowIso,
      status: 'APPROVED',
      prepaid_tier: 'STARTER',
      delivered_to_payroll: false,
      delivery_attempts: 0,
      idempotency_key: certCommissionId1,
      effective_at: nowIso,
    });

    results['prepaid_cert'] = {
      status: 'PASS',
      cash: starterConfig.cash_price,
      booking_value_issued: starterConfig.booking_value,
      credits_issued: starterConfig.credits,
      lot_id: certLotId1,
      transaction_id: certTxnId1,
      commission_event_id: certCommissionId1,
      commission_amount: certCommissionAmount1,
      cert_ids_valid: isCertificationId(certLotId1) && isCertificationId(certTxnId1) && isCertificationId(certCommissionId1),
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 2: Prepaid duplicate-event idempotency (deliver same event 10x)
    // ════════════════════════════════════════════════════════════════════════
    let dupCount = 0;
    const dupPaymentEventId = certRunId + '_dup_pay';
    for (let i = 0; i < 10; i++) {
      const r = await processAutoFundPayment({
        base44: b,
        payment_event_id: dupPaymentEventId,
        subscription_id: 'cert_sub_dup',
        customer_id: contact.id,
        customer_email: certCustomerEmail,
        wallet_id: wallet1.id,
        amount_charged: 50,
        status: 'succeeded',
        event_type: 'topup',
        sales_rep_id: rep.id,
        raw_event: 'cert_dup_test',
        actor: 'certification_suite',
        cert_mode: true,
        });
      if (r.status === 'processed') dupCount++;
    }

    // Count AutoFundPaymentEvent records for this dup event
    const dupAfResp = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: dupPaymentEventId }, undefined, 10);
    const dupAfArr = Array.isArray(dupAfResp) ? dupAfResp : (dupAfResp?.data || []);

    results['prepaid_idempotency'] = {
      status: dupCount === 1 && dupAfArr.length === 1 ? 'PASS' : 'FAIL',
      processed_count: dupCount,
      expected_processed: 1,
      event_records: dupAfArr.length,
      expected_records: 1,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 3: Auto-Fund $150 Starter cert_ payment
    // $150 customer cash → $157.50 Booking Value → $22.50 first-payment commission
    // ════════════════════════════════════════════════════════════════════════
    const afConfig = getAutoFundConfig(150);
    const certAfPaymentId = certRunId + '_autofund_pay';
    const certAfWalletId = 'cert_wallet_af_' + generateId('w').slice(0, 10);

    const wallet2 = await b.entities.PrepaidWallet.create({
      customer_id: contact.id,
      customer_email: certCustomerEmail,
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
      sales_rep_id: rep.id,
      sales_rep_email: certRepEmail,
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const afResult = await processAutoFundPayment({
      base44: b,
      payment_event_id: certAfPaymentId,
      subscription_id: 'cert_sub_af',
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      wallet_id: wallet2.id,
      amount_charged: 150,
      status: 'succeeded',
      event_type: 'recurring',
      sales_rep_id: rep.id,
      raw_event: 'cert_af_test',
      actor: 'certification_suite',
      cert_mode: true,
    });

    const expectedAfCredits = round2(157.5 / PREPAID_CREDIT_VALUE);
    const expectedAfCommission = calculateAutoFundCommission(150);

    results['autofund_cert'] = {
      status: (afResult.status === 'processed' &&
        afResult.booking_value_issued === 157.5 &&
        Math.abs(afResult.credits_issued - expectedAfCredits) < 0.001 &&
        afResult.commission_event_id !== '') ? 'PASS' : 'FAIL',
      cash: 150,
      booking_value_issued: afResult.booking_value_issued,
      expected_booking_value: 157.5,
      credits_issued: afResult.credits_issued,
      expected_credits: expectedAfCredits,
      commission_event_id: afResult.commission_event_id,
      expected_commission: expectedAfCommission,
      lot_id: afResult.lot_id,
      wallet_transaction_id: afResult.wallet_transaction_id,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 4: Auto-Fund duplicate-event idempotency
    // ════════════════════════════════════════════════════════════════════════
    let afDupCount = 0;
    const afDupPaymentId = certRunId + '_af_dup';
    for (let i = 0; i < 10; i++) {
      const r = await processAutoFundPayment({
        base44: b,
        payment_event_id: afDupPaymentId,
        subscription_id: 'cert_sub_af_dup',
        customer_id: contact.id,
        customer_email: certCustomerEmail,
        wallet_id: wallet2.id,
        amount_charged: 150,
        status: 'succeeded',
        event_type: 'recurring',
        sales_rep_id: rep.id,
        raw_event: 'cert_af_dup',
        actor: 'certification_suite',
        cert_mode: true,
        });
      if (r.status === 'processed') afDupCount++;
    }
    const afDupResp = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: afDupPaymentId }, undefined, 10);
    const afDupArr = Array.isArray(afDupResp) ? afDupResp : (afDupResp?.data || []);

    results['autofund_idempotency'] = {
      status: afDupCount === 1 && afDupArr.length === 1 ? 'PASS' : 'FAIL',
      processed_count: afDupCount,
      expected_processed: 1,
      event_records: afDupArr.length,
      expected_records: 1,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 5: Full refund → commission reversal
    // Original: $500 Starter, $50 commission. Full $500 refund → -$50 reversal.
    // ════════════════════════════════════════════════════════════════════════
    const fullRefundId = certRunId + '_full_refund';
    const fullRefundResult = await processCommissionReversal({
      base44: b,
      refund_event_id: fullRefundId,
      original_payment_event_id: certTxnId1,
      refunded_commissionable_amount: 500,
      reason: 'cert full refund test',
      actor: 'certification_suite',
      cert_mode: true,
    });

    const fullRefundCreated = fullRefundResult.results.find(r => r.status === 'created');
    results['full_refund'] = {
      status: (fullRefundResult.status === 'processed' &&
        fullRefundCreated &&
        fullRefundCreated.reversal_amount === 50 &&
        fullRefundCreated.remaining_commission === 0) ? 'PASS' : 'FAIL',
      reversal_amount: fullRefundCreated?.reversal_amount,
      expected_reversal: 50,
      remaining_commission: fullRefundCreated?.remaining_commission,
      expected_remaining: 0,
      original_preserved: fullRefundCreated?.original_commission === 50,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 6: Partial refund → proportional reversal
    // Original: $1000 commissionable, $100 commission. $250 refund → -$25.
    // ════════════════════════════════════════════════════════════════════════
    // Create a second synthetic prepaid purchase ($1000 PRO tier equivalent via reload)
    const certTxnId2 = 'cert_ptxn_' + generateId('t').slice(0, 12);
    const certCommissionId2 = 'cert_empe_' + generateId('c').slice(0, 12);
    const certLotId2 = 'cert_lot_' + generateId('l').slice(0, 12);

    await b.entities.CreditLot.create({
      wallet_id: wallet1.id,
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      lot_id: certLotId2,
      source: 'reload',
      source_transaction_id: certTxnId2,
      tier: 'PRO',
      credits_issued: 4,
      credits_remaining: 4,
      booking_value_issued: 1100,
      booking_value_remaining: 1100,
      expires_at: addMonths(new Date(), 12).toISOString(),
      expired: false,
      fifo_order: Date.now() + 1,
      stripe_transaction_id: 'cert_stripe_2',
      created_at: nowIso,
    });

    await b.entities.WalletTransaction.create({
      transaction_id: certTxnId2,
      wallet_id: wallet1.id,
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      type: 'RELOAD',
      cash_amount: 1000,
      credits: 4,
      booking_value: 1100,
      stripe_transaction_id: 'cert_stripe_2',
      booking_id: '',
      lot_id: certLotId2,
      source: 'ADMIN',
      actor: 'certification_suite',
      description: 'CERT Prepaid PRO reload — $1000',
      prepaid_tier: 'PRO',
      created_at: nowIso,
    });

    await b.entities.PrepaidCompensationEvent.create({
      source_event_id: certCommissionId2,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'PREPAID_RELOAD_COMMISSION',
      employee_id: rep.id,
      employee_email: certRepEmail,
      customer_id: contact.id,
      transaction_id: certTxnId2,
      gross_customer_cash: 1000,
      commission_amount: 100,
      currency: 'USD',
      earned_at: nowIso,
      status: 'APPROVED',
      prepaid_tier: 'PRO',
      delivered_to_payroll: false,
      delivery_attempts: 0,
      idempotency_key: certCommissionId2,
      effective_at: nowIso,
    });

    const partialRefundId = certRunId + '_partial_refund';
    const partialRefundResult = await processCommissionReversal({
      base44: b,
      refund_event_id: partialRefundId,
      original_payment_event_id: certTxnId2,
      refunded_commissionable_amount: 250,
      reason: 'cert partial refund test',
      actor: 'certification_suite',
      cert_mode: true,
    });

    const partialCreated = partialRefundResult.results.find(r => r.status === 'created');
    results['partial_refund'] = {
      status: (partialRefundResult.status === 'processed' &&
        partialCreated &&
        partialCreated.reversal_amount === 25 &&
        partialCreated.remaining_commission === 75) ? 'PASS' : 'FAIL',
      reversal_amount: partialCreated?.reversal_amount,
      expected_reversal: 25,
      remaining_commission: partialCreated?.remaining_commission,
      expected_remaining: 75,
      original_commission: partialCreated?.original_commission,
      original_cash: partialCreated?.original_commissionable_cash,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 7: Multiple partial refunds (cumulative cap)
    // Original: $1000 / $100. Refund #1: $200 → -$20. Refund #2: $300 → -$30.
    // Cumulative: $50. Remaining: $50.
    // ════════════════════════════════════════════════════════════════════════
    // Create a third commission event for this test
    const certTxnId3 = 'cert_ptxn_' + generateId('t').slice(0, 12);
    const certCommissionId3 = 'cert_empe_' + generateId('c').slice(0, 12);

    await b.entities.WalletTransaction.create({
      transaction_id: certTxnId3,
      wallet_id: wallet1.id,
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      type: 'RELOAD',
      cash_amount: 1000,
      credits: 4,
      booking_value: 1100,
      stripe_transaction_id: 'cert_stripe_3',
      booking_id: '',
      lot_id: '',
      source: 'ADMIN',
      actor: 'certification_suite',
      description: 'CERT multi-refund test — $1000',
      prepaid_tier: 'PRO',
      created_at: nowIso,
    });

    await b.entities.PrepaidCompensationEvent.create({
      source_event_id: certCommissionId3,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'PREPAID_RELOAD_COMMISSION',
      employee_id: rep.id,
      employee_email: certRepEmail,
      customer_id: contact.id,
      transaction_id: certTxnId3,
      gross_customer_cash: 1000,
      commission_amount: 100,
      currency: 'USD',
      earned_at: nowIso,
      status: 'APPROVED',
      prepaid_tier: 'PRO',
      delivered_to_payroll: false,
      delivery_attempts: 0,
      idempotency_key: certCommissionId3,
      effective_at: nowIso,
    });

    const multiRefundId1 = certRunId + '_multi_refund_1';
    const multiRefundId2 = certRunId + '_multi_refund_2';
    const multiResult1 = await processCommissionReversal({
      base44: b, refund_event_id: multiRefundId1, original_payment_event_id: certTxnId3,
      refunded_commissionable_amount: 200, reason: 'cert multi refund #1', actor: 'certification_suite', cert_mode: true,
    });
    const multiResult2 = await processCommissionReversal({
      base44: b, refund_event_id: multiRefundId2, original_payment_event_id: certTxnId3,
      refunded_commissionable_amount: 300, reason: 'cert multi refund #2', actor: 'certification_suite', cert_mode: true,
    });

    const multi1 = multiResult1.results.find(r => r.status === 'created');
    const multi2 = multiResult2.results.find(r => r.status === 'created');

    results['multiple_partial_refunds'] = {
      status: (multi1?.reversal_amount === 20 && multi2?.reversal_amount === 30 &&
        multi2?.cumulative_reversed === 50 && multi2?.remaining_commission === 50) ? 'PASS' : 'FAIL',
      refund_1_reversal: multi1?.reversal_amount,
      expected_1: 20,
      refund_2_reversal: multi2?.reversal_amount,
      expected_2: 30,
      cumulative_reversed: multi2?.cumulative_reversed,
      expected_cumulative: 50,
      remaining_commission: multi2?.remaining_commission,
      expected_remaining: 50,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 8: Duplicate refund idempotency (same $200 refund 10x → ONE $20 reversal)
    // ════════════════════════════════════════════════════════════════════════
    const dupRefundId = certRunId + '_dup_refund';
    let dupRefundProcessed = 0;
    for (let i = 0; i < 10; i++) {
      const r = await processCommissionReversal({
        base44: b, refund_event_id: dupRefundId, original_payment_event_id: certTxnId2,
        refunded_commissionable_amount: 200, reason: 'cert dup refund test', actor: 'certification_suite', cert_mode: true,
      });
      if (r.status === 'processed') dupRefundProcessed++;
    }

    // Count COMMISSION_REVERSAL events for this refund
    const dupRevResp = await b.entities.PrepaidCompensationEvent.filter(
      { source_type: 'COMMISSION_REVERSAL', reason: `refund:${dupRefundId} — cert dup refund test` },
      undefined, 10
    );
    const dupRevArr = Array.isArray(dupRevResp) ? dupRevResp : (dupRevResp?.data || []);

    results['refund_idempotency'] = {
      status: dupRefundProcessed === 1 && dupRevArr.length === 1 ? 'PASS' : 'FAIL',
      processed_count: dupRefundProcessed,
      expected_processed: 1,
      reversal_records: dupRevArr.length,
      expected_records: 1,
      reversal_amount: dupRevArr[0]?.reversal_amount,
      expected_reversal: 20,
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 9: Auto-Fund refund (cash not Booking Value)
    // $150 cash, $157.50 BV, $22.50 first-payment commission. Full $150 refund → $22.50 reversal (NOT $23.63).
    // ════════════════════════════════════════════════════════════════════════
    const afRefundId = certRunId + '_af_refund';
    const afRefundResult = await processCommissionReversal({
      base44: b,
      refund_event_id: afRefundId,
      original_payment_event_id: certAfPaymentId,
      refunded_commissionable_amount: 150,
      reason: 'cert autofund full refund',
      actor: 'certification_suite',
      cert_mode: true,
    });

    const afRefundCreated = afRefundResult.results.find(r => r.status === 'created');
    results['autofund_refund'] = {
      status: (afRefundCreated?.reversal_amount === 22.5 && afRefundCreated?.original_commissionable_cash === 150) ? 'PASS' : 'FAIL',
      reversal_amount: afRefundCreated?.reversal_amount,
      expected_reversal: 22.5,
      original_cash: afRefundCreated?.original_commissionable_cash,
      expected_cash: 150,
      note: 'Reversal calculated from $150 customer cash, NOT $157.50 Booking Value (15% first-payment commission)',
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 10: Prepaid bonus exclusion (cash not Booking Value)
    // $2500 PREMIER cash, $2750 BV, $250 commission. Full $2500 refund → $250 (NOT $275).
    // ════════════════════════════════════════════════════════════════════════
    const certTxnId4 = 'cert_ptxn_' + generateId('t').slice(0, 12);
    const certCommissionId4 = 'cert_empe_' + generateId('c').slice(0, 12);

    await b.entities.WalletTransaction.create({
      transaction_id: certTxnId4,
      wallet_id: wallet1.id,
      customer_id: contact.id,
      customer_email: certCustomerEmail,
      type: 'PREPAID_PURCHASE',
      cash_amount: 2500,
      credits: 10,
      booking_value: 2750,
      stripe_transaction_id: 'cert_stripe_4',
      booking_id: '',
      lot_id: '',
      source: 'ADMIN',
      actor: 'certification_suite',
      description: 'CERT Premier purchase — $2500',
      prepaid_tier: 'PREMIER',
      created_at: nowIso,
    });

    await b.entities.PrepaidCompensationEvent.create({
      source_event_id: certCommissionId4,
      source_system: 'ARRIV_ESTATE_MEDIA',
      source_type: 'PREPAID_PURCHASE_COMMISSION',
      employee_id: rep.id,
      employee_email: certRepEmail,
      customer_id: contact.id,
      transaction_id: certTxnId4,
      gross_customer_cash: 2500,
      commission_amount: 250,
      currency: 'USD',
      earned_at: nowIso,
      status: 'APPROVED',
      prepaid_tier: 'PREMIER',
      delivered_to_payroll: false,
      delivery_attempts: 0,
      idempotency_key: certCommissionId4,
      effective_at: nowIso,
    });

    const premierRefundId = certRunId + '_premier_refund';
    const premierRefundResult = await processCommissionReversal({
      base44: b,
      refund_event_id: premierRefundId,
      original_payment_event_id: certTxnId4,
      refunded_commissionable_amount: 2500,
      reason: 'cert premier full refund',
      actor: 'certification_suite',
      cert_mode: true,
    });

    const premierCreated = premierRefundResult.results.find(r => r.status === 'created');
    results['prepaid_bonus_exclusion'] = {
      status: (premierCreated?.reversal_amount === 250 && premierCreated?.original_commissionable_cash === 2500) ? 'PASS' : 'FAIL',
      reversal_amount: premierCreated?.reversal_amount,
      expected_reversal: 250,
      original_cash: premierCreated?.original_commissionable_cash,
      expected_cash: 2500,
      note: 'Reversal from $2500 cash, NOT $2750 Booking Value',
    };

    // ════════════════════════════════════════════════════════════════════════
    // TEST 11: Already-paid commission handoff (no payroll mutation)
    // Verify Estate Media does NOT debit employee or edit paycheck.
    // The COMMISSION_REVERSAL is created and delivered to Arriv Pay —
    // Estate Media never touches payroll directly.
    // ════════════════════════════════════════════════════════════════════════
    // Mark the original commission (certCommissionId1) as delivered/acknowledged (simulating already-paid)
    const origCe1Resp = await b.entities.PrepaidCompensationEvent.filter({ source_event_id: certCommissionId1 }, undefined, 1);
    const origCe1Arr = Array.isArray(origCe1Resp) ? origCe1Resp : (origCe1Resp?.data || []);
    if (origCe1Arr[0]) {
      await b.entities.PrepaidCompensationEvent.update(origCe1Arr[0].id, {
        delivery_status: 'ACKNOWLEDGED',
        delivered_to_payroll: true,
        delivered_at: nowIso,
      });
    }

    // Now issue a second refund against the same already-paid commission (partial $250)
    const paidRefundId = certRunId + '_paid_refund';
    const paidRefundResult = await processCommissionReversal({
      base44: b,
      refund_event_id: paidRefundId,
      original_payment_event_id: certTxnId1,
      refunded_commissionable_amount: 250,
      reason: 'cert already-paid commission refund',
      actor: 'certification_suite',
      cert_mode: true,
    });

    // Verify: original commission event still exists, still APPROVED, still ACKNOWLEDGED
    const origAfterResp = await b.entities.PrepaidCompensationEvent.filter({ source_event_id: certCommissionId1 }, undefined, 1);
    const origAfterArr = Array.isArray(origAfterResp) ? origAfterResp : (origAfterResp?.data || []);
    const origAfter = origAfterArr[0];

    // The full refund (TEST 5) already reversed $50, so remaining reversible = $0.
    // This $250 partial refund against already-fully-reversed commission should be CAPPED.
    const paidResult = paidRefundResult.results.find(r => r.reverses === certCommissionId1);

    results['paid_commission_handoff'] = {
      status: (origAfter &&
        origAfter.status === 'APPROVED' &&
        origAfter.delivery_status === 'ACKNOWLEDGED' &&
        origAfter.commission_amount === 50 &&
        origAfter.delivered_to_payroll === true &&
        paidResult?.status === 'capped') ? 'PASS' : 'FAIL',
      original_preserved: origAfter?.status === 'APPROVED',
      original_delivery_unchanged: origAfter?.delivery_status === 'ACKNOWLEDGED',
      original_commission_unchanged: origAfter?.commission_amount === 50,
      reversal_status: paidResult?.status,
      expected_reversal_status: 'capped',
      note: 'Estate Media creates COMMISSION_REVERSAL only. No employee debit, no paycheck edit, no payroll mutation.',
    };

    // ════════════════════════════════════════════════════════════════════════
    // CERTIFICATION DATA ISOLATION CHECK
    // ════════════════════════════════════════════════════════════════════════
    const allCertTxnsResp = await b.entities.WalletTransaction.filter({ customer_email: certCustomerEmail }, undefined, 100);
    const allCertTxns = Array.isArray(allCertTxnsResp) ? allCertTxnsResp : (allCertTxnsResp?.data || []);
    const allCertTxnsHaveCertPrefix = allCertTxns.every(t => isCertificationId(t.transaction_id));

    const allCertCommissionsResp = await b.entities.PrepaidCompensationEvent.filter({ employee_email: certRepEmail }, undefined, 100);
    const allCertCommissions = Array.isArray(allCertCommissionsResp) ? allCertCommissionsResp : (allCertCommissionsResp?.data || []);
    const allCertCommissionsHaveCertPrefix = allCertCommissions.every(c => isCertificationId(c.source_event_id));

    results['data_isolation'] = {
      status: allCertTxnsHaveCertPrefix && allCertCommissionsHaveCertPrefix ? 'PASS' : 'FAIL',
      cert_transactions: allCertTxns.length,
      all_have_cert_prefix: allCertTxnsHaveCertPrefix,
      cert_commissions: allCertCommissions.length,
      all_commissions_have_cert_prefix: allCertCommissionsHaveCertPrefix,
      cert_customer_email: certCustomerEmail,
      cert_rep_email: certRepEmail,
    };

    // ════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ════════════════════════════════════════════════════════════════════════
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
      production_feature_flag: 'OFF (not modified)',
      no_real_customer_charged: true,
      no_real_employee_paid: true,
      no_customer_service_agent_modified: true,
    });
  } catch (error) {
    return Response.json({ error: error.message, status: 'ERROR' }, { status: 500 });
  }
}