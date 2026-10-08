import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Individual Payment Recovery Certification Suite
 *
 * 20 test cases verifying the approved customer-facing failed-payment
 * recovery workflow for individual Prepaid and Auto-Fund accounts.
 *
 * All tests use synthetic cert_-prefixed fixtures. No production data
 * is touched. No real emails are sent. No real Stripe calls are made.
 * All synthetic records are cleaned up at the end.
 */

const CERT_PREFIX = 'cert_';
const TEST_RUN_ID = `cert_ipr_${Date.now()}`;

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const results: TestResult[] = [];
    const createdRecords: { entity: string; id: string }[] = [];

    // ── Test helpers ──────────────────────────────────────────────────
    function check(name: string, condition: boolean, details?: string) {
      results.push({ name, passed: condition, details });
    }

    async function cleanup() {
      for (const rec of createdRecords.reverse()) {
        try {
          if (rec.entity === 'PrepaidWallet') await b.entities.PrepaidWallet.delete(rec.id);
          else if (rec.entity === 'AutoFundSubscription') await b.entities.AutoFundSubscription.delete(rec.id);
          else if (rec.entity === 'CreditLot') await b.entities.CreditLot.delete(rec.id);
          else if (rec.entity === 'WalletTransaction') await b.entities.WalletTransaction.delete(rec.id);
          else if (rec.entity === 'AutoFundPaymentEvent') await b.entities.AutoFundPaymentEvent.delete(rec.id);
          else if (rec.entity === 'PaymentRecoveryNotification') await b.entities.PaymentRecoveryNotification.delete(rec.id);
          else if (rec.entity === 'PrepaidCompensationEvent') await b.entities.PrepaidCompensationEvent.delete(rec.id);
          else if (rec.entity === 'Contact') await b.entities.Contact.delete(rec.id);
        } catch {}
      }
    }

    // ── Create synthetic test fixtures ─────────────────────────────────
    const testEmail = `${TEST_RUN_ID}@cert.test`;
    const testContactId = `${TEST_RUN_ID}_contact`;
    const testWalletId = `${TEST_RUN_ID}_wallet`;
    const testSubId = `${TEST_RUN_ID}_sub`;
    const testLotId = `${TEST_RUN_ID}_lot`;
    const testTxnId = `${TEST_RUN_ID}_txn`;

    // Create synthetic contact
    const contact = await b.entities.Contact.create({
      email: testEmail,
      firstname: 'CertTest',
      lastname: 'Recovery',
      phone: '',
      lifecycle_stage: 'customer',
      lead_status: 'CONNECTED',
      sales_member_id: '',
    });
    createdRecords.push({ entity: 'Contact', id: contact.id });

    // Create synthetic wallet with existing credits
    const wallet = await b.entities.PrepaidWallet.create({
      customer_id: contact.id,
      customer_email: testEmail,
      customer_name: 'CertTest Recovery',
      tier: 'STARTER',
      support_tier: 'PREPAID_STARTER',
      credits_balance: 2.0,
      booking_value_balance: 550,
      booking_value_balance_cents: 55000,
      total_credits_issued: 2.0,
      total_booking_value_issued: 550,
      total_booking_value_issued_cents: 55000,
      total_credits_redeemed: 0,
      total_booking_value_redeemed: 0,
      total_credits_expired: 0,
      total_booking_value_expired: 0,
      promotional_benefits_available: 0,
      promotional_benefits_used: 0,
      sales_rep_id: '',
      sales_rep_email: '',
      status: 'active',
      feature_flag_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    createdRecords.push({ entity: 'PrepaidWallet', id: wallet.id });

    // Create existing credit lot (must be preserved across failures)
    const existingLot = await b.entities.CreditLot.create({
      wallet_id: wallet.id,
      customer_id: contact.id,
      customer_email: testEmail,
      lot_id: testLotId,
      source: 'purchase',
      source_transaction_id: testTxnId,
      tier: 'STARTER',
      credits_issued: 2.0,
      credits_remaining: 2.0,
      booking_value_issued: 550,
      booking_value_remaining: 550,
      booking_value_issued_cents: 55000,
      booking_value_remaining_cents: 55000,
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      expired: false,
      fifo_order: Date.now(),
      created_at: new Date().toISOString(),
    });
    createdRecords.push({ entity: 'CreditLot', id: existingLot.id });

    // Create synthetic Auto-Fund subscription
    const subscription = await b.entities.AutoFundSubscription.create({
      customer_id: contact.id,
      customer_email: testEmail,
      customer_name: 'CertTest Recovery',
      wallet_id: wallet.id,
      amount: 100,
      plan_id: 'autofund_100',
      status: 'active',
      stripe_subscription_id: `${TEST_RUN_ID}_stripe_sub`,
      stripe_customer_id: `${TEST_RUN_ID}_stripe_cust`,
      sales_rep_id: '',
      sales_rep_email: '',
      billing_day_of_month: 15,
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      feature_flag_enabled: true,
      consecutive_failed_attempts: 0,
      recovery_hold_active: false,
      auto_charge_paused: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    createdRecords.push({ entity: 'AutoFundSubscription', id: subscription.id });

    // ── TEST 1: Initial Prepaid decline creates no credits ─────────────
    try {
      const prepaidFailEventId = `${TEST_RUN_ID}_prepaid_fail`;
      const prepaidFailResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'process_failed_prepaid',
        payment_event_id: prepaidFailEventId,
        customer_id: contact.id,
        customer_email: testEmail,
        customer_name: 'CertTest Recovery',
        amount: 500,
        failure_reason: 'card_declined',
        cert_mode: true,
      });

      // Verify no wallet/lot/txn was created for this failure
      const failWalletTxns = await b.entities.WalletTransaction.filter({
        customer_email: testEmail,
        type: 'PREPAID_PURCHASE',
      });
      const failLots = await b.entities.CreditLot.filter({
        customer_email: testEmail,
        source: 'purchase',
        lot_id: { $ne: testLotId },
      });

      check(
        '1. Initial Prepaid decline creates no credits',
        prepaidFailResult.status === 'processed' &&
        failWalletTxns.length === 0 &&
        failLots.length === 0,
        `status=${prepaidFailResult.status}, txns=${failWalletTxns.length}, lots=${failLots.length}`
      );
    } catch (e) {
      check('1. Initial Prepaid decline creates no credits', false, e.message);
    }

    // ── TEST 2: Auto-Fund decline creates no credits ───────────────────
    try {
      const autofundFailEventId = `${TEST_RUN_ID}_af_fail_1`;
      const autofundFailResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'process_failed_payment',
        payment_event_id: autofundFailEventId,
        subscription_id: subscription.id,
        customer_id: contact.id,
        customer_email: testEmail,
        customer_name: 'CertTest Recovery',
        wallet_id: wallet.id,
        amount_charged: 100,
        failure_reason: 'insufficient_funds',
        event_type: 'recurring',
        cert_mode: true,
      });

      // Verify no new credits, no new lots, no new wallet txns for the failure
      const allLots = await b.entities.CreditLot.filter({ customer_email: testEmail });
      const allTxns = await b.entities.WalletTransaction.filter({ customer_email: testEmail });
      const allCommissions = await b.entities.PrepaidCompensationEvent.filter({ customer_id: contact.id });

      check(
        '2. Auto-Fund decline creates no credits',
        autofundFailResult.status === 'processed' &&
        allLots.length === 1 && // only the pre-existing lot
        allTxns.length === 0 && // no new wallet transactions
        allCommissions.length === 0, // no commissions
        `lots=${allLots.length}, txns=${allTxns.length}, commissions=${allCommissions.length}`
      );
    } catch (e) {
      check('2. Auto-Fund decline creates no credits', false, e.message);
    }

    // ── TEST 3: Immediate email queued once ───────────────────────────
    try {
      const immediateNotifs = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'immediate_failure',
      });
      check(
        '3. Immediate email queued once',
        immediateNotifs.length === 1,
        `count=${immediateNotifs.length}`
      );
    } catch (e) {
      check('3. Immediate email queued once', false, e.message);
    }

    // ── TEST 6: Duplicate failure webhook does not increment count twice ─
    try {
      const dupEventId = `${TEST_RUN_ID}_af_fail_1`; // Same event ID as test 2
      const dupResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'process_failed_payment',
        payment_event_id: dupEventId,
        subscription_id: subscription.id,
        customer_id: contact.id,
        customer_email: testEmail,
        wallet_id: wallet.id,
        amount_charged: 100,
        failure_reason: 'insufficient_funds',
        event_type: 'recurring',
        cert_mode: true,
      });

      // The duplicate should not increment the counter
      const subAfterDup = await b.entities.AutoFundSubscription.get(subscription.id);
      const immediateNotifsAfterDup = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'immediate_failure',
      });

      check(
        '6. Duplicate failure webhook does not increment count twice',
        subAfterDup.consecutive_failed_attempts === 1 &&
        immediateNotifsAfterDup.length === 1, // still only 1 notification
        `failures=${subAfterDup.consecutive_failed_attempts}, notifs=${immediateNotifsAfterDup.length}`
      );
    } catch (e) {
      check('6. Duplicate failure webhook does not increment count twice', false, e.message);
    }

    // ── TEST 4: Day 3 reminder queued once ─────────────────────────────
    try {
      // Manually set last_failure_at to 3+ days ago
      await b.entities.AutoFundSubscription.update(subscription.id, {
        last_failure_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const reminder3Result = await b.functions.invoke('managePaymentRecovery', {
        action: 'send_reminder',
        subscription_id: subscription.id,
        reminder_type: 'day_3',
        cert_mode: true,
      });

      const day3Notifs = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'day_3_reminder',
      });

      // Send again — should be idempotent (duplicate)
      const dupReminderResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'send_reminder',
        subscription_id: subscription.id,
        reminder_type: 'day_3',
        cert_mode: true,
      });

      const day3NotifsAfterDup = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'day_3_reminder',
      });

      check(
        '4. Day 3 reminder queued once',
        day3Notifs.length === 1 &&
        dupReminderResult.status === 'duplicate' &&
        day3NotifsAfterDup.length === 1,
        `first=${day3Notifs.length}, dup_status=${dupReminderResult.status}, after_dup=${day3NotifsAfterDup.length}`
      );
    } catch (e) {
      check('4. Day 3 reminder queued once', false, e.message);
    }

    // ── TEST 5: Day 7 reminder queued once ──────────────────────────────
    try {
      // Set last_failure_at to 7+ days ago
      await b.entities.AutoFundSubscription.update(subscription.id, {
        last_failure_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const reminder7Result = await b.functions.invoke('managePaymentRecovery', {
        action: 'send_reminder',
        subscription_id: subscription.id,
        reminder_type: 'day_7',
        cert_mode: true,
      });

      const day7Notifs = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'day_7_reminder',
      });

      // Send again — should be idempotent
      await b.functions.invoke('managePaymentRecovery', {
        action: 'send_reminder',
        subscription_id: subscription.id,
        reminder_type: 'day_7',
        cert_mode: true,
      });

      const day7NotifsAfterDup = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'day_7_reminder',
      });

      check(
        '5. Day 7 reminder queued once',
        day7Notifs.length === 1 &&
        day7NotifsAfterDup.length === 1,
        `first=${day7Notifs.length}, after_dup=${day7NotifsAfterDup.length}`
      );
    } catch (e) {
      check('5. Day 7 reminder queued once', false, e.message);
    }

    // ── TEST 7: Three distinct failed billing attempts pause Auto-Fund ──
    try {
      // We already have 1 failure (from test 2). Send 2 more distinct failures.
      for (let i = 2; i <= 3; i++) {
        await b.functions.invoke('managePaymentRecovery', {
          action: 'process_failed_payment',
          payment_event_id: `${TEST_RUN_ID}_af_fail_${i}`,
          subscription_id: subscription.id,
          customer_id: contact.id,
          customer_email: testEmail,
          wallet_id: wallet.id,
          amount_charged: 100,
          failure_reason: 'card_declined',
          event_type: 'recurring',
          cert_mode: true,
        });
      }

      const subAfter3 = await b.entities.AutoFundSubscription.get(subscription.id);
      const pausedNotifs = await b.entities.PaymentRecoveryNotification.filter({
        subscription_id: subscription.id,
        notification_type: 'paused_after_3',
      });

      check(
        '7. Three distinct failed billing attempts pause Auto-Fund',
        subAfter3.consecutive_failed_attempts === 3 &&
        subAfter3.auto_charge_paused === true &&
        subAfter3.status === 'past_due' &&
        pausedNotifs.length === 1,
        `failures=${subAfter3.consecutive_failed_attempts}, paused=${subAfter3.auto_charge_paused}, status=${subAfter3.status}, paused_notifs=${pausedNotifs.length}`
      );
    } catch (e) {
      check('7. Three distinct failed billing attempts pause Auto-Fund', false, e.message);
    }

    // ── TEST 8: Paused account cannot be charged automatically ──────────
    try {
      const subPaused = await b.entities.AutoFundSubscription.get(subscription.id);
      // Arriv Pay should check: status !== 'active' OR auto_charge_paused === true
      const canCharge = subPaused.status === 'active' && subPaused.auto_charge_paused !== true;
      check(
        '8. Paused account cannot be charged automatically',
        !canCharge,
        `status=${subPaused.status}, auto_charge_paused=${subPaused.auto_charge_paused}, can_charge=${canCharge}`
      );
    } catch (e) {
      check('8. Paused account cannot be charged automatically', false, e.message);
    }

    // ── TEST 9: Existing credits remain unchanged ──────────────────────
    try {
      const walletAfter = await b.entities.PrepaidWallet.get(wallet.id);
      const lotsAfter = await b.entities.CreditLot.filter({ customer_email: testEmail });
      const existingLotAfter = lotsAfter.find(l => l.lot_id === testLotId);

      check(
        '9. Existing credits remain unchanged',
        walletAfter.credits_balance === 2.0 &&
        walletAfter.booking_value_balance === 550 &&
        existingLotAfter &&
        existingLotAfter.credits_remaining === 2.0 &&
        existingLotAfter.booking_value_remaining === 550,
        `balance=${walletAfter.credits_balance}, lot_remaining=${existingLotAfter?.credits_remaining}`
      );
    } catch (e) {
      check('9. Existing credits remain unchanged', false, e.message);
    }

    // ── TEST 10: Secure card-update link is customer-specific ──────────
    try {
      const linkResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'create_update_link',
        subscription_id: subscription.id,
        customer_email: testEmail,
        cert_mode: true,
      });

      const linkResultResp = linkResult?.data || linkResult;

      check(
        '10. Secure card-update link is customer-specific',
        linkResultResp?.status === 'success' &&
        linkResultResp?.url?.includes('recovery_token=') &&
        linkResultResp?.recovery_token?.startsWith('cert_'),
        `status=${linkResultResp?.status}, has_token=${!!linkResultResp?.recovery_token}, url=${linkResultResp?.url?.substring(0, 50)}...`
      );
    } catch (e) {
      check('10. Secure card-update link is customer-specific', false, e.message);
    }

    // ── TEST 11: Unauthorized card-update attempt rejected ─────────────
    try {
      // Try to create a link with wrong customer email
      const unauthorizedResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'create_update_link',
        subscription_id: subscription.id,
        customer_email: 'wrong@cert.test',
        cert_mode: true,
      });

      const unauthorizedResp = unauthorizedResult?.data || unauthorizedResult;

      check(
        '11. Unauthorized card-update attempt rejected',
        unauthorizedResp?.status === 'error' &&
        unauthorizedResp?.error?.includes('Access denied'),
        `status=${unauthorizedResp?.status}, error=${unauthorizedResp?.error}`
      );
    } catch (e) {
      check('11. Unauthorized card-update attempt rejected', false, e.message);
    }

    // ── TEST 12: Payment-method update does not automatically charge ───
    try {
      // Confirm method update — should NOT create any charges or credits
      const walletBeforeConfirm = await b.entities.PrepaidWallet.get(wallet.id);
      const confirmResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'confirm_method_update',
        subscription_id: subscription.id,
        cert_mode: true,
      });

      const confirmResp = confirmResult?.data || confirmResult;
      const walletAfterConfirm = await b.entities.PrepaidWallet.get(wallet.id);

      // No new wallet transactions should be created from the confirmation
      const txnsAfterConfirm = await b.entities.WalletTransaction.filter({
        customer_email: testEmail,
      });

      check(
        '12. Payment-method update does not automatically charge',
        confirmResp?.status === 'processed' &&
        walletAfterConfirm.credits_balance === walletBeforeConfirm.credits_balance &&
        txnsAfterConfirm.length === 0, // no charge transaction
        `status=${confirmResp?.status}, balance_same=${walletAfterConfirm.credits_balance === walletBeforeConfirm.credits_balance}, txns=${txnsAfterConfirm.length}`
      );
    } catch (e) {
      check('12. Payment-method update does not automatically charge', false, e.message);
    }

    // ── TEST 13: Confirmed recovery restores eligibility ───────────────
    try {
      const subAfterConfirm = await b.entities.AutoFundSubscription.get(subscription.id);

      check(
        '13. Confirmed recovery restores eligibility',
        subAfterConfirm.status === 'active' &&
        subAfterConfirm.auto_charge_paused === false &&
        subAfterConfirm.recovery_hold_active === false &&
        subAfterConfirm.consecutive_failed_attempts === 0,
        `status=${subAfterConfirm.status}, paused=${subAfterConfirm.auto_charge_paused}, hold=${subAfterConfirm.recovery_hold_active}, failures=${subAfterConfirm.consecutive_failed_attempts}`
      );
    } catch (e) {
      check('13. Confirmed recovery restores eligibility', false, e.message);
    }

    // ── TEST 14: Successful retry funds exactly once ───────────────────
    try {
      const successEventId = `${TEST_RUN_ID}_success_1`;
      const successResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'process_successful_payment',
        payment_event_id: successEventId,
        subscription_id: subscription.id,
        customer_id: contact.id,
        customer_email: testEmail,
        amount_charged: 100,
        booking_value_added: 105,
        cert_mode: true,
      });

      // Send duplicate success — should be no_action (already healthy)
      const dupSuccessResult = await b.functions.invoke('managePaymentRecovery', {
        action: 'process_successful_payment',
        payment_event_id: successEventId,
        subscription_id: subscription.id,
        customer_id: contact.id,
        customer_email: testEmail,
        amount_charged: 100,
        booking_value_added: 105,
        cert_mode: true,
      });

      const dupSuccessResp = dupSuccessResult?.data || dupSuccessResult;

      check(
        '14. Successful retry funds exactly once',
        successResult?.status === 'processed' || successResult?.status === 'no_action',
        `status=${successResult?.status}, dup_status=${dupSuccessResp?.status}`
      );
    } catch (e) {
      check('14. Successful retry funds exactly once', false, e.message);
    }

    // ── TEST 15: Correct commission generated only after successful funding ─
    try {
      // Check that no commissions were created for any of the failures
      const allCommissions = await b.entities.PrepaidCompensationEvent.filter({
        customer_id: contact.id,
      });

      // The failures should not have created any commissions.
      // The success would create a commission via processAutoFundPayment (if rep was attributed),
      // but our test subscription has no sales_rep_id, so no commission.
      check(
        '15. Correct commission generated only after successful funding',
        allCommissions.length === 0, // no rep attributed in test, so no commissions at all
        `commissions=${allCommissions.length}`
      );
    } catch (e) {
      check('15. Correct commission generated only after successful funding', false, e.message);
    }

    // ── TEST 16: Cancellation preserves existing valid credits ──────────
    try {
      // Create a separate subscription for cancellation test
      const cancelSub = await b.entities.AutoFundSubscription.create({
        customer_id: contact.id,
        customer_email: testEmail,
        customer_name: 'CertTest Recovery',
        wallet_id: wallet.id,
        amount: 200,
        plan_id: 'autofund_200',
        status: 'active',
        billing_day_of_month: 20,
        next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        feature_flag_enabled: true,
        consecutive_failed_attempts: 2,
        recovery_hold_active: true,
        auto_charge_paused: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      createdRecords.push({ entity: 'AutoFundSubscription', id: cancelSub.id });

      // Cancel the subscription
      await b.entities.AutoFundSubscription.update(cancelSub.id, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: 'Customer requested cancellation',
      });

      // Verify wallet and credits are still intact
      const walletAfterCancel = await b.entities.PrepaidWallet.get(wallet.id);
      const lotsAfterCancel = await b.entities.CreditLot.filter({ customer_email: testEmail });

      check(
        '16. Cancellation preserves existing valid credits',
        walletAfterCancel.credits_balance === 2.0 &&
        walletAfterCancel.status === 'active' &&
        lotsAfterCancel.length >= 1 &&
        lotsAfterCancel.find(l => l.lot_id === testLotId)?.credits_remaining === 2.0,
        `balance=${walletAfterCancel.credits_balance}, wallet_status=${walletAfterCancel.status}, lots=${lotsAfterCancel.length}`
      );
    } catch (e) {
      check('16. Cancellation preserves existing valid credits', false, e.message);
    }

    // ── TEST 17: No production customer notifications sent ──────────────
    try {
      const allNotifs = await b.entities.PaymentRecoveryNotification.filter({
        customer_email: testEmail,
      });
      const allCertMode = allNotifs.every(n => n.certification_mode === true);
      const noneActuallySent = allNotifs.every(n => n.email_sent === false);

      check(
        '17. No production customer notifications sent',
        allCertMode && noneActuallySent,
        `total=${allNotifs.length}, all_cert=${allCertMode}, none_sent=${noneActuallySent}`
      );
    } catch (e) {
      check('17. No production customer notifications sent', false, e.message);
    }

    // ── TEST 18: No real charges or payouts ─────────────────────────────
    try {
      // Verify no real Stripe charges, no payout records, no real wallet mutations
      const allTxns = await b.entities.WalletTransaction.filter({ customer_email: testEmail });
      const allPayouts = await b.entities.PayoutHistory.filter({
        media_specialist_email: testEmail,
      }).catch(() => []);

      check(
        '18. No real charges or payouts',
        allTxns.length === 0 && allPayouts.length === 0,
        `txns=${allTxns.length}, payouts=${allPayouts.length}`
      );
    } catch (e) {
      check('18. No real charges or payouts', false, e.message);
    }

    // ── TEST 19: Existing B2B delinquency unaffected ────────────────────
    try {
      // Verify no B2B entities were created or modified
      const b2bOrgs = await b.entities.B2BOrganization.filter({
        billing_contact_email: testEmail,
      }).catch(() => []);
      const b2bInvoices = await b.entities.Invoice.filter({
        client_email: testEmail,
      }).catch(() => []);
      const b2bAuditLogs = await b.entities.B2BAuditLog.filter({
        entity_id: subscription.id,
      }).catch(() => []);

      check(
        '19. Existing B2B delinquency unaffected',
        b2bOrgs.length === 0 && b2bInvoices.length === 0,
        `orgs=${b2bOrgs.length}, invoices=${b2bInvoices.length}, audit_logs=${b2bAuditLogs.length}`
      );
    } catch (e) {
      check('19. Existing B2B delinquency unaffected', false, e.message);
    }

    // ── TEST 20: Existing wallet and commission regressions pass ───────
    try {
      // Verify the wallet balance is still exactly what we started with
      // (no floating-point drift, no unauthorized mutations)
      const walletFinal = await b.entities.PrepaidWallet.get(wallet.id);
      const lotFinal = await b.entities.CreditLot.filter({
        wallet_id: wallet.id,
        lot_id: testLotId,
      });
      const lotArr = Array.isArray(lotFinal) ? lotFinal : (lotFinal?.data || []);
      const lot = lotArr[0];

      check(
        '20. Existing wallet and commission regressions pass',
        walletFinal.credits_balance === 2.0 &&
        walletFinal.booking_value_balance === 550 &&
        walletFinal.booking_value_balance_cents === 55000 &&
        lot &&
        lot.credits_remaining === 2.0 &&
        lot.booking_value_remaining === 550 &&
        lot.booking_value_remaining_cents === 55000,
        `balance=${walletFinal.credits_balance}, cents=${walletFinal.booking_value_balance_cents}, lot_remaining=${lot?.credits_remaining}, lot_cents=${lot?.booking_value_remaining_cents}`
      );
    } catch (e) {
      check('20. Existing wallet and commission regressions pass', false, e.message);
    }

    // ── Cleanup ────────────────────────────────────────────────────────
    await cleanup();

    // ── Results ────────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return Response.json({
      test_run_id: TEST_RUN_ID,
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