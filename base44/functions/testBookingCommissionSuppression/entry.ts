import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  snapshotProductionFinancials,
  compareSnapshots,
} from '../../shared/certFixtures.ts';
import { isCertificationId } from '../../shared/certificationMode.ts';

/**
 * Booking-Commission Suppression Certification
 *
 * Verifies that wallet-funded bookings (Auto-Fund / Prepaid redemption) generate
 * ZERO booking-level sales commission through BOTH commission paths:
 *
 *   PATH A — handleBookingSubmission        → Commission (PAYOUT_V2 booking commission)
 *   PATH B — processPaymentConfirmation      → generateCommissionSourceRecord
 *             (the invoke at processPaymentConfirmation step 10) → CommissionSourceRecord
 *
 * Coverage: fully wallet-funded, partial wallet with a cash shortfall, retries,
 * and refunds. Standard marketplace bookings must keep their normal commission —
 * the suppression must be specific to wallet funding, never a blanket shutdown.
 *
 * All fixtures are cert_-prefixed synthetic records. The booking payloads are
 * submitted with past_shoot + pay_at_closing so handleBookingSubmission skips
 * every client/admin email and SMS and the invoice/Stripe block entirely — the
 * suite therefore produces no customer notifications and no payment objects.
 * Every record it creates is deleted at the end, and production financial
 * totals are snapshotted before/after to prove they are untouched.
 */

const PACKAGE_PRICE = 675; // premium_bundle fallback price, used only if the pricing engine is unavailable

interface TestResult {
  name: string;
  passed: boolean;
  classification: 'LOCAL_PROCESSOR' | 'CROSS_APP_LEDGER';
  details?: string;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const results: TestResult[] = [];
    const track = (entity: string, rec: any) => {
      if (rec?.id) tracked.push({ entity, id: rec.id });
      return rec;
    };
    function check(name: string, classification: TestResult['classification'], passed: boolean, details?: string) {
      results.push({ name, passed, classification, details });
    }
    const arr = (res: any) => (Array.isArray(res) ? res : (res?.items || res?.data || []));
    const out = (res: any) => (res?.data || res);

    const tracked: { entity: string; id: string }[] = [];
    let snapshotBefore: any = null;
    let snapshotAfter: any = null;

    // Per-invocation run id: a module-level constant is evaluated once per Deno
    // isolate, so a later invocation would silently reuse the earlier run id.
    const TEST_RUN_ID = `cert_booking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const contactEmail = `${TEST_RUN_ID}_booking@cert.test`;
    const repEmail = `${TEST_RUN_ID}_rep@cert.test`;
    const nowIso = new Date().toISOString();

    snapshotBefore = await snapshotProductionFinancials(b);

    // ── Fixtures ───────────────────────────────────────────────────────────
    const contact = track('Contact', await b.entities.Contact.create({
      email: contactEmail,
      firstname: 'CertBooking',
      lastname: 'Suppression',
      phone: '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    }));

    const rep = track('SalesTeamMember', await b.entities.SalesTeamMember.create({
      email: repEmail,
      full_name: 'Cert Booking Rep',
      status: 'active',
      role: 'user',
      arriv_employee_id: `cert_empe_${TEST_RUN_ID}`,
      commission_rate: 0.15,
    }));

    const wallet = track('PrepaidWallet', await b.entities.PrepaidWallet.create({
      customer_id: contact.id,
      customer_email: contactEmail,
      customer_name: 'CertBooking Suppression',
      tier: 'STARTER',
      support_tier: 'PREPAID_STARTER',
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
      sales_rep_id: '',
      sales_rep_email: '',
      status: 'active',
      feature_flag_enabled: true,
      created_at: nowIso,
      updated_at: nowIso,
    }));

    // Auto-Fund funds the wallet with 'reload' lots — labels the funding source.
    track('CreditLot', await b.entities.CreditLot.create({
      wallet_id: wallet.id,
      customer_id: contact.id,
      customer_email: contactEmail,
      lot_id: `${TEST_RUN_ID}_lot`,
      source: 'reload',
      tier: 'STARTER',
      credits_issued: 0,
      credits_remaining: 0,
      booking_value_issued: 0,
      booking_value_remaining: 0,
      booking_value_issued_cents: 32000,
      booking_value_remaining_cents: 32000,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      expired: false,
      fifo_order: 1,
      created_at: nowIso,
    }));

    // Inert submission: past_shoot skips every client/admin notification,
    // pay_at_closing skips invoice generation and the Stripe/payment block.
    const baseBooking = {
      client_name: 'CertBooking Suppression',
      client_email: contactEmail,
      client_phone: '0000000000',
      package: 'premium_bundle',
      add_ons: [],
      street_address: '1 Cert Test Way',
      city: 'Atlanta',
      state: 'GA',
      preferred_date: '2026-11-02',
      preferred_time: '10:00',
      notes: 'certification — booking commission suppression',
      property_sqft: 3000,
      total_price: PACKAGE_PRICE,
      sales_member_id: rep.id,
      past_shoot: true,
      request_pay_at_closing: true,
    };

    async function submitBooking(walletDecision: any) {
      const res = await b.functions.invoke('handleBookingSubmission', {
        booking: { ...baseBooking, wallet: walletDecision },
      });
      const data = out(res);
      const booking = data?.booking;
      if (!booking?.id) throw new Error(data?.error || 'booking submission returned no booking');
      track('Booking', booking);
      return booking;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PATH A — handleBookingSubmission
    // ═══════════════════════════════════════════════════════════════════════

    // A1: standard marketplace booking keeps its normal commission.
    let stdBooking: any = null;
    let stdCommissionAmount = 0;
    try {
      stdBooking = await submitBooking({ use_wallet: false, wallet_applied: 0, wallet_id: '' });
      const fresh = await b.entities.Booking.get(stdBooking.id);
      const csvCents = fresh.commissionable_service_value || 0;
      const expected = csvCents > 0
        ? Math.round(csvCents * 0.15) / 100
        : Math.round(PACKAGE_PRICE * 0.15 * 100) / 100;
      const commissions = arr(await b.entities.Commission.filter({ deal_id: stdBooking.id }));
      stdCommissionAmount = commissions[0]?.gross_amount || 0;

      check('BOOKING_COMMISSION_STANDARD: standard marketplace booking keeps its normal booking commission',
        'LOCAL_PROCESSOR',
        fresh.booking_funding_classification === 'standard_marketplace' &&
        fresh.wallet_applied_cents === 0 &&
        commissions.length === 1 &&
        commissions[0].employee_id === rep.id &&
        expected > 0 &&
        Math.abs(commissions[0].gross_amount - expected) < 0.01,
        `classification=${fresh.booking_funding_classification}, wallet_cents=${fresh.wallet_applied_cents}, records=${commissions.length}, amount=${commissions[0]?.gross_amount}, expected=${expected}, csv_cents=${csvCents}`);
    } catch (e) {
      check('BOOKING_COMMISSION_STANDARD: standard marketplace booking keeps its normal booking commission', 'LOCAL_PROCESSOR', false, e.message);
    }

    // A2: fully wallet-funded booking → zero booking commission.
    let fullWalletBooking: any = null;
    try {
      fullWalletBooking = await submitBooking({ use_wallet: true, wallet_applied: PACKAGE_PRICE, wallet_id: wallet.id });
      const fresh = await b.entities.Booking.get(fullWalletBooking.id);
      const commissions = arr(await b.entities.Commission.filter({ deal_id: fullWalletBooking.id }));

      check('BOOKING_COMMISSION_WALLET_FULL: fully wallet-funded booking creates ZERO booking commission',
        'LOCAL_PROCESSOR',
        fresh.booking_funding_classification === 'wallet_funded' &&
        fresh.wallet_applied_cents === PACKAGE_PRICE * 100 &&
        fresh.wallet_funding_source === 'auto_fund' &&
        commissions.length === 0,
        `classification=${fresh.booking_funding_classification}, wallet_cents=${fresh.wallet_applied_cents}, funding_source=${fresh.wallet_funding_source}, commission_records=${commissions.length}`);
    } catch (e) {
      check('BOOKING_COMMISSION_WALLET_FULL: fully wallet-funded booking creates ZERO booking commission', 'LOCAL_PROCESSOR', false, e.message);
    }

    // A3: partial wallet + cash shortfall → still zero (the advisor is paid at funding time).
    let partialWalletBooking: any = null;
    try {
      partialWalletBooking = await submitBooking({ use_wallet: true, wallet_applied: 200, wallet_id: wallet.id });
      const fresh = await b.entities.Booking.get(partialWalletBooking.id);
      const commissions = arr(await b.entities.Commission.filter({ deal_id: partialWalletBooking.id }));

      check('BOOKING_COMMISSION_WALLET_PARTIAL: partial wallet with cash shortfall creates ZERO booking commission',
        'LOCAL_PROCESSOR',
        fresh.booking_funding_classification === 'wallet_funded' &&
        fresh.wallet_applied_cents === 20000 &&
        fresh.wallet_applied_cents < PACKAGE_PRICE * 100 && // a real cash shortfall existed
        commissions.length === 0,
        `classification=${fresh.booking_funding_classification}, wallet_cents=${fresh.wallet_applied_cents}, retail_cents=${PACKAGE_PRICE * 100}, shortfall_cents=${PACKAGE_PRICE * 100 - (fresh.wallet_applied_cents || 0)}, commission_records=${commissions.length}`);
    } catch (e) {
      check('BOOKING_COMMISSION_WALLET_PARTIAL: partial wallet with cash shortfall creates ZERO booking commission', 'LOCAL_PROCESSOR', false, e.message);
    }

    // A4: retry — resubmitting the wallet-funded booking must not leak a commission.
    try {
      const retry = await submitBooking({ use_wallet: true, wallet_applied: PACKAGE_PRICE, wallet_id: wallet.id });
      const retryCommissions = arr(await b.entities.Commission.filter({ deal_id: retry.id }));
      const allWalletCommissions = arr(await b.entities.Commission.filter({
        employee_email: repEmail,
        compensation_type: 'commission',
      }));

      check('BOOKING_COMMISSION_RETRY: resubmission creates no commission and no duplicate',
        'LOCAL_PROCESSOR',
        retry.id !== fullWalletBooking?.id &&
        retryCommissions.length === 0 &&
        allWalletCommissions.length === 1, // only the standard marketplace booking earned one
        `retry_booking_is_new=${retry.id !== fullWalletBooking?.id}, retry_commission_records=${retryCommissions.length}, rep_commission_records_total=${allWalletCommissions.length}`);
    } catch (e) {
      check('BOOKING_COMMISSION_RETRY: resubmission creates no commission and no duplicate', 'LOCAL_PROCESSOR', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PATH B — processPaymentConfirmation → generateCommissionSourceRecord
    // (the invoke at step 10 of processPaymentConfirmation)
    // ═══════════════════════════════════════════════════════════════════════

    // Attribution requires a converted ClientSignupInvite owned by the rep.
    track('ClientSignupInvite', await b.entities.ClientSignupInvite.create({
      token: `${TEST_RUN_ID}_invite`,
      sales_member_id: rep.id,
      sales_member_name: 'Cert Booking Rep',
      sales_member_email: repEmail,
      contact_name: 'CertBooking Suppression',
      contact_email: contactEmail,
      client_name: 'CertBooking Suppression',
      client_email: contactEmail,
      package: 'premium_bundle',
      package_name: 'Premium Bundle Package',
      status: 'converted',
      booking_id: stdBooking?.id || '',
      converted_at: nowIso,
      created_at: nowIso,
    }));

    const stdInvoice = track('Invoice', await b.entities.Invoice.create({
      invoice_number: `${TEST_RUN_ID}-STD`,
      invoice_type: 'pay_up_front',
      client_name: 'CertBooking Suppression',
      client_email: contactEmail,
      job_address: '1 Cert Test Way, Atlanta, GA',
      amount: stdBooking ? (stdBooking.total_price || PACKAGE_PRICE) : PACKAGE_PRICE,
      payment_status: 'paid',
      booking_id: stdBooking?.id || '',
      paid_at: nowIso,
    }));

    const walletInvoice = track('Invoice', await b.entities.Invoice.create({
      invoice_number: `${TEST_RUN_ID}-WF`,
      invoice_type: 'pay_up_front',
      client_name: 'CertBooking Suppression',
      client_email: contactEmail,
      job_address: '1 Cert Test Way, Atlanta, GA',
      amount: PACKAGE_PRICE,
      payment_status: 'paid',
      booking_id: fullWalletBooking?.id || '',
      paid_at: nowIso,
    }));

    // B1: standard marketplace invoice keeps producing a payroll source record.
    let stdSourceRecordId = '';
    try {
      const res = out(await b.functions.invoke('generateCommissionSourceRecord', { invoiceId: stdInvoice.id }));
      const records = arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: stdInvoice.id }));
      stdSourceRecordId = records[0]?.source_record_id || '';

      check('COMMISSION_SOURCE_STANDARD: marketplace booking invoice still creates a payroll source record',
        'LOCAL_PROCESSOR',
        res.success === true &&
        records.length === 1 &&
        records[0].calculated_commission_amount > 0 &&
        isCertificationId(records[0].client_id),
        `success=${res.success}, records=${records.length}, amount=${records[0]?.calculated_commission_amount}, skipped_reason=${res.reason || ''}`);
    } catch (e) {
      check('COMMISSION_SOURCE_STANDARD: marketplace booking invoice still creates a payroll source record', 'LOCAL_PROCESSOR', false, e.message);
    }

    // B2: wallet-funded booking invoice → skipped, no source record.
    try {
      const res = out(await b.functions.invoke('generateCommissionSourceRecord', { invoiceId: walletInvoice.id }));
      const records = arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: walletInvoice.id }));

      check('COMMISSION_SOURCE_WALLET_FUNDED: wallet-funded booking invoice creates NO payroll source record',
        'LOCAL_PROCESSOR',
        res.skipped === true &&
        String(res.reason || '').includes('wallet-funded') &&
        records.length === 0,
        `skipped=${res.skipped}, reason=${res.reason || ''}, records=${records.length}`);
    } catch (e) {
      check('COMMISSION_SOURCE_WALLET_FUNDED: wallet-funded booking invoice creates NO payroll source record', 'LOCAL_PROCESSOR', false, e.message);
    }

    // B3: retry — re-invocation stays idempotent and suppression holds.
    try {
      const stdRetry = out(await b.functions.invoke('generateCommissionSourceRecord', { invoiceId: stdInvoice.id }));
      const stdRecords = arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: stdInvoice.id }));
      const wfRetry = out(await b.functions.invoke('generateCommissionSourceRecord', { invoiceId: walletInvoice.id }));
      const wfRecords = arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: walletInvoice.id }));

      check('COMMISSION_SOURCE_RETRY: re-invocation is idempotent and suppression holds',
        'LOCAL_PROCESSOR',
        stdRecords.length === 1 &&
        stdRecords[0].source_record_id === stdSourceRecordId &&
        wfRetry.skipped === true &&
        wfRecords.length === 0,
        `std_records=${stdRecords.length}, same_record=${stdRecords[0]?.source_record_id === stdSourceRecordId}, wf_skipped=${wfRetry.skipped}, wf_records=${wfRecords.length}`);
    } catch (e) {
      check('COMMISSION_SOURCE_RETRY: re-invocation is idempotent and suppression holds', 'LOCAL_PROCESSOR', false, e.message);
    }

    // B4: refund — a refunded invoice creates no commission and resurrects none.
    try {
      await b.entities.Invoice.update(stdInvoice.id, { payment_status: 'unpaid' });
      await b.entities.Invoice.update(walletInvoice.id, { payment_status: 'unpaid' });

      const stdAfter = out(await b.functions.invoke('generateCommissionSourceRecord', { invoiceId: stdInvoice.id }));
      const stdRecords = arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: stdInvoice.id }));
      const wfAfter = out(await b.functions.invoke('generateCommissionSourceRecord', { invoiceId: walletInvoice.id }));
      const wfRecords = arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: walletInvoice.id }));

      check('COMMISSION_SOURCE_REFUND: refunded invoice creates no new commission and no duplicate record',
        'LOCAL_PROCESSOR',
        stdAfter.success !== true &&
        String(stdAfter.reason || '').includes('not paid') &&
        stdRecords.length === 1 && // original preserved, not duplicated
        stdRecords[0].source_record_id === stdSourceRecordId &&
        wfRecords.length === 0,
        `refunded_std_status=${stdAfter.reason || stdAfter.skipped}, std_records=${stdRecords.length}, same_record=${stdRecords[0]?.source_record_id === stdSourceRecordId}, wf_records=${wfRecords.length}`);
    } catch (e) {
      check('COMMISSION_SOURCE_REFUND: refunded invoice creates no new commission and no duplicate record', 'LOCAL_PROCESSOR', false, e.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRODUCTION INTEGRITY + CLEANUP
    // ═══════════════════════════════════════════════════════════════════════
    snapshotAfter = await snapshotProductionFinancials(b);
    const snapshotDiff = compareSnapshots(snapshotBefore, snapshotAfter);

    check('PRODUCTION_BALANCES_UNCHANGED: no production financial records modified',
      'CROSS_APP_LEDGER',
      snapshotDiff.unchanged,
      snapshotDiff.unchanged ? 'all production counts and balances unchanged' : `diffs: ${snapshotDiff.diffs.join(', ')}`);

    const cleanupErrors: string[] = [];
    const certBookingIds = tracked.filter(x => x.entity === 'Booking').map(x => x.id);
    const certInvoiceIds = tracked.filter(x => x.entity === 'Invoice').map(x => x.id);

    // Both commission paths create records keyed to this run's own bookings and
    // invoices, so they are swept by those exact keys — never by a broad match.
    for (const dealId of certBookingIds) {
      try {
        for (const rec of arr(await b.entities.Commission.filter({ deal_id: dealId }))) {
          await b.entities.Commission.delete(rec.id);
        }
      } catch (e) { cleanupErrors.push(`Commission sweep: ${e.message}`); }
    }
    for (const invoiceId of certInvoiceIds) {
      try {
        for (const rec of arr(await b.entities.CommissionSourceRecord.filter({ customer_invoice_id: invoiceId }))) {
          await b.entities.CommissionSourceRecord.delete(rec.id);
        }
      } catch (e) { cleanupErrors.push(`CommissionSourceRecord sweep: ${e.message}`); }
    }

    // Booking children created inside handleBookingSubmission.
    for (const bookingId of certBookingIds) {
      for (const entity of ['Job', 'PricingSnapshot']) {
        try {
          for (const rec of arr(await b.entities[entity].filter({ booking_id: bookingId }))) {
            await b.entities[entity].delete(rec.id);
          }
        } catch (e) { cleanupErrors.push(`${entity}: ${e.message}`); }
      }
    }
    // Children before parents.
    const deleteOrder = ['CommissionSourceRecord', 'Commission', 'Invoice', 'CreditLot', 'PrepaidWallet', 'ClientSignupInvite', 'Contact', 'SalesTeamMember', 'Booking'];
    for (const entity of deleteOrder) {
      for (const t of tracked.filter(x => x.entity === entity)) {
        try { await b.entities[entity].delete(t.id); }
        catch (e) { cleanupErrors.push(`${entity} ${t.id}: ${e.message}`); }
      }
    }

    let remaining = 0;
    const verifyChecks: { entity: string; field: string }[] = [
      { entity: 'Booking', field: 'client_email' },
      { entity: 'Invoice', field: 'client_email' },
      { entity: 'Contact', field: 'email' },
      { entity: 'PrepaidWallet', field: 'customer_email' },
      { entity: 'CreditLot', field: 'customer_email' },
      { entity: 'SalesTeamMember', field: 'email' },
      { entity: 'Commission', field: 'employee_email' },
      { entity: 'CommissionSourceRecord', field: 'client_id' },
      { entity: 'ClientSignupInvite', field: 'token' },
      { entity: 'Job', field: 'client_email' },
    ];
    for (const { entity, field } of verifyChecks) {
      try {
        remaining += arr(await b.entities[entity].filter({ [field]: { $regex: `^${TEST_RUN_ID}` } })).length;
      } catch (e) { cleanupErrors.push(`verify ${entity}: ${e.message}`); }
    }

    check('SYNTHETIC_CLEANUP: all cert records removed, no failures swallowed',
      'CROSS_APP_LEDGER',
      cleanupErrors.length === 0 && remaining === 0,
      `cleanup_errors=${cleanupErrors.length}, remaining_cert_records=${remaining}${cleanupErrors.length ? `, first_error=${cleanupErrors[0]}` : ''}`);

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return Response.json({
      test_run_id: TEST_RUN_ID,
      total: results.length,
      passed,
      failed,
      all_passed: failed === 0,
      production_balances_unchanged: snapshotDiff.unchanged,
      coverage: {
        path_a: 'handleBookingSubmission → Commission',
        path_b: 'processPaymentConfirmation step 10 → generateCommissionSourceRecord → CommissionSourceRecord',
        cases: ['fully wallet-funded', 'partial wallet + cash shortfall', 'retry', 'refund', 'standard marketplace control'],
      },
      standard_marketplace_commission_amount: stdCommissionAmount,
      cleanup_errors: cleanupErrors,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}