/**
 * Individual Payment Recovery Engine
 *
 * Implements the approved customer-facing failed-payment recovery workflow
 * for individual Prepaid and Auto-Fund accounts.
 *
 * Policy:
 *   - Failed Auto-Fund payments record the failure, send an immediate email,
 *     and increment the consecutive-failure counter.
 *   - Reminders are sent on day 3 and day 7 if the payment remains unresolved.
 *   - After 3 consecutive failed billing attempts, auto-charge is paused.
 *   - Customer must update/confirm their payment method before auto-charge resumes.
 *   - Existing credits, lots, and expiration dates are NEVER modified by failures.
 *   - No credits, bonus value, or commissions are issued on failed payments.
 *
 * Boundary:
 *   - Estate Media owns failure tracking, notifications, and recovery state.
 *   - Arriv Pay owns payment processing and charging.
 *   - Estate Media sets `auto_charge_paused` and `status='past_due'` on the
 *     subscription. Arriv Pay must respect these fields and NOT charge a
 *     subscription that is paused or past_due.
 *
 * Certification safety:
 *   - In cert mode, all child IDs are cert_-prefixed.
 *   - In cert mode, emails are queued (PaymentRecoveryNotification created)
 *     but NOT sent via Brevo — email_sent=false.
 *   - In cert mode, no real Stripe API calls are made.
 *   - Synthetic fixtures (cert_-prefixed emails) are isolated from production.
 */

import { sendBrevoEmail } from './brevoClient.ts';
import { isCertificationId, isCertificationRecord } from './certificationMode.ts';
import { generateId } from './prepaidEngine.ts';

// ┌────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ┌────────────────────────────────────────────────────────────────────────────

export const MAX_CONSECUTIVE_FAILURES = 3;

export const NOTIFICATION_TYPES = {
  IMMEDIATE_FAILURE: 'immediate_failure',
  DAY_3_REMINDER: 'day_3_reminder',
  DAY_7_REMINDER: 'day_7_reminder',
  PAUSED_AFTER_3: 'paused_after_3',
  METHOD_UPDATED: 'method_updated',
  PAYMENT_RECOVERED: 'payment_recovered',
  AUTO_FUND_RESUMED: 'auto_fund_resumed',
  PREPAID_PURCHASE_FAILED: 'prepaid_purchase_failed',
} as const;

const APP_DOMAIN_FALLBACK = 'https://app.arrivestatemedia.com';

// ┌────────────────────────────────────────────────────────────────────────────
// TYPES
// ┌────────────────────────────────────────────────────────────────────────────

export interface RecoveryResult {
  status: 'processed' | 'duplicate' | 'error' | 'no_action';
  subscription_id?: string;
  notification_id?: string;
  email_sent?: boolean;
  consecutive_failed_attempts?: number;
  auto_charge_paused?: boolean;
  recovery_hold_active?: boolean;
  message?: string;
  error?: string;
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Build notification idempotency key
// ┌────────────────────────────────────────────────────────────────────────────

function buildNotificationId(subscriptionId: string, type: string, paymentEventId?: string): string {
  const base = `${subscriptionId}_${type}`;
  return paymentEventId ? `${base}_${paymentEventId}` : `${base}_${Date.now()}`;
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Check if a notification already exists (idempotency)
// ┌────────────────────────────────────────────────────────────────────────────

async function findExistingNotification(base44: any, notificationId: string): Promise<any | null> {
  const results = await base44.entities.PaymentRecoveryNotification.filter(
    { notification_id: notificationId },
    undefined,
    1
  );
  const arr = Array.isArray(results) ? results : (results?.data || []);
  return arr[0] || null;
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Get app domain
// ┌────────────────────────────────────────────────────────────────────────────

function getAppDomain(): string {
  try {
    return (typeof Deno !== 'undefined' && Deno.env?.get('BASE44_APP_DOMAIN')) || APP_DOMAIN_FALLBACK;
  } catch {
    return APP_DOMAIN_FALLBACK;
  }
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Build recovery link
// ┌────────────────────────────────────────────────────────────────────────────

function buildRecoveryLink(token: string): string {
  return `${getAppDomain()}/AutoFund?recovery_token=${encodeURIComponent(token)}`;
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Generate recovery token
// ┌────────────────────────────────────────────────────────────────────────────

function generateRecoveryToken(certMode: boolean): string {
  const prefix = certMode ? 'cert_' : '';
  return `${prefix}rec_${crypto.randomUUID().replace(/-/g, '')}`;
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Find subscription by ID
// ┌────────────────────────────────────────────────────────────────────────────

async function getSubscription(base44: any, subscriptionId: string): Promise<any | null> {
  try {
    return await base44.entities.AutoFundSubscription.get(subscriptionId);
  } catch {
    // Fallback: filter by ID (in case .get throws on not-found)
    const results = await base44.entities.AutoFundSubscription.filter(
      { id: subscriptionId },
      undefined,
      1
    );
    const arr = Array.isArray(results) ? results : (results?.data || []);
    return arr[0] || null;
  }
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Send notification (idempotent)
// ┌────────────────────────────────────────────────────────────────────────────

async function sendNotification(
  base44: any,
  params: {
    subscription_id: string;
    customer_id: string;
    customer_email: string;
    customer_name?: string;
    notification_type: string;
    payment_event_id?: string;
    subject: string;
    html_body: string;
    recovery_link_url?: string;
    recovery_link_token?: string;
    cert_mode: boolean;
    idempotency_key?: string;
  }
): Promise<{ notification_id: string; email_sent: boolean; duplicate: boolean }> {
  const notificationId = params.idempotency_key || buildNotificationId(
    params.subscription_id,
    params.notification_type,
    params.payment_event_id
  );

  // Idempotency: check if already sent
  const existing = await findExistingNotification(base44, notificationId);
  if (existing) {
    return { notification_id: notificationId, email_sent: existing.email_sent, duplicate: true };
  }

  const nowIso = new Date().toISOString();
  let emailSent = false;

  // Only send real email in production mode (not cert mode)
  if (!params.cert_mode) {
    try {
      await sendBrevoEmail({
        to: params.customer_email,
        subject: params.subject,
        htmlContent: params.html_body,
      });
      emailSent = true;
    } catch (err) {
      console.error('Failed to send recovery email:', err.message);
      // Still record the notification attempt (email_sent=false)
    }
  }

  // Record the notification (idempotent — checked above)
  await base44.entities.PaymentRecoveryNotification.create({
    notification_id: notificationId,
    subscription_id: params.subscription_id,
    customer_id: params.customer_id || '',
    customer_email: params.customer_email,
    customer_name: params.customer_name || '',
    notification_type: params.notification_type,
    payment_event_id: params.payment_event_id || '',
    sent_at: nowIso,
    recovery_link_url: params.recovery_link_url || '',
    recovery_link_token: params.recovery_link_token || '',
    email_subject: params.subject,
    email_sent: emailSent,
    certification_mode: params.cert_mode,
  });

  return { notification_id: notificationId, email_sent: emailSent, duplicate: false };
}

// ┌────────────────────────────────────────────────────────────────────────────
// EMAIL BUILDERS
// ┌────────────────────────────────────────────────────────────────────────────

function buildFailureEmail(params: {
  customer_name: string;
  amount: number;
  failure_reason: string;
  recovery_link: string;
  consecutive_failures: number;
  is_paused: boolean;
}): { subject: string; html_body: string } {
  const pausedMsg = params.is_paused
    ? `<p style="margin:16px 0;padding:12px;background:#fff3cd;border:1px solid #ffe08a;border-radius:6px;"><strong>Important:</strong> Your Auto-Fund has been paused after ${params.consecutive_failures} consecutive failed payment attempts. Please update your payment method to resume automatic funding.</p>`
    : `<p style="margin:16px 0;color:#666;">This is attempt ${params.consecutive_failures} of ${MAX_CONSECUTIVE_FAILURES} before Auto-Fund is automatically paused.</p>`;

  return {
    subject: `Action Required: Auto-Fund Payment Failed — $${params.amount}/month`,
    html_body: `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1A1A1A;">Hi ${params.customer_name || 'there'},</h2>
<p>We were unable to process your Auto-Fund payment of <strong>$${params.amount}/month</strong>.</p>
<p style="color:#666;">Reason: ${params.failure_reason || 'Your payment method was declined.'}</p>
${pausedMsg}
<p>Your existing Arriv Wallet balance and credits are <strong>unaffected</strong> and remain available for booking.</p>
<p>To restore automatic funding, please update your payment method:</p>
<p style="margin:24px 0;">
  <a href="${params.recovery_link}" style="display:inline-block;background:#B8956A;color:#1A1A1A;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Update Payment Method</a>
</p>
<p style="color:#999;font-size:12px;margin-top:32px;">This link is specific to your account. Do not share it with others.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="color:#999;font-size:12px;">Arriv Estate Media | <a href="${getAppDomain()}" style="color:#B8956A;">app.arrivestatemedia.com</a></p>
</body></html>`,
  };
}

function buildReminderEmail(params: {
  customer_name: string;
  amount: number;
  day: number;
  recovery_link: string;
  is_final: boolean;
}): { subject: string; html_body: string } {
  const urgency = params.is_final
    ? '<p style="margin:16px 0;padding:12px;background:#f8d7da;border:1px solid #f5c2c7;border-radius:6px;"><strong>Final reminder:</strong> If you do not update your payment method soon, your Auto-Fund will remain paused.</p>'
    : '';

  return {
    subject: `Reminder (${params.day} days): Auto-Fund Payment Still Unresolved — $${params.amount}/month`,
    html_body: `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1A1A1A;">Hi ${params.customer_name || 'there'},</h2>
<p>This is a friendly reminder that your Auto-Fund payment of <strong>$${params.amount}/month</strong> is still unresolved (${params.day} days).</p>
${urgency}
<p>Your existing Arriv Wallet balance remains available for booking.</p>
<p>To restore automatic funding, please update your payment method:</p>
<p style="margin:24px 0;">
  <a href="${params.recovery_link}" style="display:inline-block;background:#B8956A;color:#1A1A1A;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Update Payment Method</a>
</p>
<p style="color:#999;font-size:12px;margin-top:32px;">This link is specific to your account. Do not share it with others.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="color:#999;font-size:12px;">Arriv Estate Media | <a href="${getAppDomain()}" style="color:#B8956A;">app.arrivestatemedia.com</a></p>
</body></html>`,
  };
}

function buildPausedEmail(params: {
  customer_name: string;
  amount: number;
  recovery_link: string;
}): { subject: string; html_body: string } {
  return {
    subject: `Auto-Fund Paused — Payment Method Update Required`,
    html_body: `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1A1A1A;">Hi ${params.customer_name || 'there'},</h2>
<p>Your Auto-Fund has been <strong>paused</strong> after ${MAX_CONSECUTIVE_FAILURES} consecutive failed payment attempts of $${params.amount}/month.</p>
<p style="margin:16px 0;padding:12px;background:#f8d7da;border:1px solid #f5c2c7;border-radius:6px;">Automatic charging will not resume until you update your payment method and confirm it.</p>
<p style="margin:16px 0;"><strong>Your account is not cancelled.</strong> Your existing Arriv Wallet balance and credits remain available for booking.</p>
<p>To resume automatic funding, please update your payment method:</p>
<p style="margin:24px 0;">
  <a href="${params.recovery_link}" style="display:inline-block;background:#B8956A;color:#1A1A1A;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Update Payment Method</a>
</p>
<p style="color:#999;font-size:12px;margin-top:32px;">This link is specific to your account. Do not share it with others.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="color:#999;font-size:12px;">Arriv Estate Media | <a href="${getAppDomain()}" style="color:#B8956A;">app.arrivestatemedia.com</a></p>
</body></html>`,
  };
}

function buildMethodUpdatedEmail(params: {
  customer_name: string;
  amount: number;
  next_billing_date: string;
}): { subject: string; html_body: string } {
  return {
    subject: `Payment Method Updated — Auto-Fund Resumed`,
    html_body: `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1A1A1A;">Hi ${params.customer_name || 'there'},</h2>
<p>Your payment method has been successfully updated. Your Auto-Fund is now active.</p>
<p style="margin:16px 0;padding:12px;background:#d4edda;border:1px solid #c3e6cb;border-radius:6px;">Automatic charging will resume on your next billing date: <strong>${params.next_billing_date}</strong></p>
<p>Your Auto-Fund amount: <strong>$${params.amount}/month</strong></p>
<p>Your existing Arriv Wallet balance and credits remain available for booking.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="color:#999;font-size:12px;">Arriv Estate Media | <a href="${getAppDomain()}" style="color:#B8956A;">app.arrivestatemedia.com</a></p>
</body></html>`,
  };
}

function buildPaymentRecoveredEmail(params: {
  customer_name: string;
  amount: number;
  booking_value_added: number;
}): { subject: string; html_body: string } {
  return {
    subject: `Payment Recovered — Auto-Fund Successful`,
    html_body: `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1A1A1A;">Hi ${params.customer_name || 'there'},</h2>
<p>Great news! Your Auto-Fund payment of <strong>$${params.amount}</strong> has been successfully processed.</p>
<p style="margin:16px 0;padding:12px;background:#d4edda;border:1px solid #c3e6cb;border-radius:6px;">$${params.booking_value_added} in booking value has been added to your Arriv Wallet.</p>
<p>Your consecutive failure counter has been reset. Automatic charging will continue on schedule.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="color:#999;font-size:12px;">Arriv Estate Media | <a href="${getAppDomain()}" style="color:#B8956A;">app.arrivestatemedia.com</a></p>
</body></html>`,
  };
}

function buildPrepaidFailureEmail(params: {
  customer_name: string;
  amount: number;
  failure_reason: string;
  retry_link: string;
}): { subject: string; html_body: string } {
  return {
    subject: `Payment Failed — Prepaid Purchase of $${params.amount}`,
    html_body: `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;max-width:600px;margin:0 auto;padding:20px;">
<h2 style="color:#1A1A1A;">Hi ${params.customer_name || 'there'},</h2>
<p>We were unable to process your Prepaid purchase of <strong>$${params.amount}</strong>.</p>
<p style="color:#666;">Reason: ${params.failure_reason || 'Your payment method was declined.'}</p>
<p style="margin:16px 0;padding:12px;background:#fff3cd;border:1px solid #ffe08a;border-radius:6px;">No charges have been made. No credits have been issued.</p>
<p>To complete your purchase, please update your payment method and try again:</p>
<p style="margin:24px 0;">
  <a href="${params.retry_link}" style="display:inline-block;background:#B8956A;color:#1A1A1A;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Update Payment Method</a>
</p>
<p style="color:#999;font-size:12px;margin-top:32px;">This link is specific to your account. Do not share it with others.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
<p style="color:#999;font-size:12px;">Arriv Estate Media | <a href="${getAppDomain()}" style="color:#B8956A;">app.arrivestatemedia.com</a></p>
</body></html>`,
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Process Failed Auto-Fund Payment
// ┌────────────────────────────────────────────────────────────────────────────

export async function processFailedAutoFundPayment(base44: any, params: {
  payment_event_id: string;
  subscription_id: string;
  customer_id: string;
  customer_email: string;
  customer_name?: string;
  wallet_id: string;
  amount_charged: number;
  failure_reason: string;
  event_type: string;
  cert_mode: boolean;
}): Promise<RecoveryResult> {
  const { payment_event_id, subscription_id, cert_mode } = params;

  // Only recurring and retry events apply the 3-strike rule.
  // Topup (one-time) events do NOT apply the 3-strike rule.
  const applyThreeStrikeRule = params.event_type === 'recurring' || params.event_type === 'retry';

  // Find the subscription
  const sub = await getSubscription(base44, subscription_id);
  if (!sub) {
    return {
      status: 'error',
      error: `Subscription not found: ${subscription_id}`,
      payment_event_id,
    };
  }

  // Cert mode isolation: verify subscription is synthetic
  if (cert_mode) {
    if (!isCertificationId(sub.customer_email)) {
      return {
        status: 'error',
        error: 'Certification mode cannot operate on a production subscription',
        payment_event_id,
      };
    }
  } else {
    // Production mode must not operate on cert fixtures
    if (isCertificationId(sub.customer_email)) {
      return {
        status: 'error',
        error: 'Production event cannot operate on a certification subscription',
        payment_event_id,
      };
    }
  }

  // Idempotency: check if this payment_event_id was already processed.
  // If a notification already exists for this event, this is a duplicate
  // webhook delivery — do NOT increment the counter or mutate state.
  if (applyThreeStrikeRule && payment_event_id) {
    const existingNotifResults = await base44.entities.PaymentRecoveryNotification.filter(
      { subscription_id, payment_event_id, notification_type: NOTIFICATION_TYPES.IMMEDIATE_FAILURE },
      undefined,
      1
    );
    const existingNotifArr = Array.isArray(existingNotifResults) ? existingNotifResults : (existingNotifResults?.data || []);
    if (existingNotifArr.length > 0) {
      return {
        status: 'duplicate',
        subscription_id,
        payment_event_id,
        consecutive_failed_attempts: sub.consecutive_failed_attempts || 0,
        auto_charge_paused: sub.auto_charge_paused || false,
        recovery_hold_active: sub.recovery_hold_active || false,
        message: 'Payment event already processed — duplicate ignored',
      };
    }
  }

  const nowIso = new Date().toISOString();

  // Increment consecutive failure counter (only for recurring/retry)
  const currentFailures = applyThreeStrikeRule
    ? (sub.consecutive_failed_attempts || 0) + 1
    : (sub.consecutive_failed_attempts || 0);

  const shouldPause = applyThreeStrikeRule && currentFailures >= MAX_CONSECUTIVE_FAILURES;
  const wasAlreadyPaused = sub.auto_charge_paused === true;

  // Generate recovery token and link
  const recoveryToken = generateRecoveryToken(cert_mode);
  const recoveryLink = buildRecoveryLink(recoveryToken);
  const recoveryLinkExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  // Update subscription with failure info
  const updateData: any = {
    consecutive_failed_attempts: currentFailures,
    last_failure_at: nowIso,
    last_failure_reason: params.failure_reason || 'Payment declined',
    recovery_hold_active: true,
    recovery_hold_at: sub.recovery_hold_at || nowIso,
    recovery_hold_reason: shouldPause ? 'THREE_FAILURE_PAUSE' : 'PAYMENT_FAILED',
    recovery_link_token: recoveryToken,
    recovery_link_expires_at: recoveryLinkExpires,
    updated_at: nowIso,
  };

  if (shouldPause && !wasAlreadyPaused) {
    updateData.auto_charge_paused = true;
    updateData.auto_charge_paused_at = nowIso;
    updateData.auto_charge_paused_reason = 'THREE_CONSECUTIVE_FAILURES';
    updateData.status = 'past_due';
  }

  await base44.entities.AutoFundSubscription.update(sub.id, updateData);

  // Send immediate failure notification (idempotent)
  const failureEmail = buildFailureEmail({
    customer_name: sub.customer_name || params.customer_name || '',
    amount: sub.amount || params.amount_charged,
    failure_reason: params.failure_reason || 'Payment declined',
    recovery_link: recoveryLink,
    consecutive_failures: currentFailures,
    is_paused: shouldPause,
  });

  const notificationResult = await sendNotification(base44, {
    subscription_id: subscription_id,
    customer_id: params.customer_id || sub.customer_id,
    customer_email: params.customer_email || sub.customer_email,
    customer_name: sub.customer_name || params.customer_name,
    notification_type: NOTIFICATION_TYPES.IMMEDIATE_FAILURE,
    payment_event_id: payment_event_id,
    subject: failureEmail.subject,
    html_body: failureEmail.html_body,
    recovery_link_url: recoveryLink,
    recovery_link_token: recoveryToken,
    cert_mode,
  });

  // If paused after 3 failures, send paused notification (idempotent)
  if (shouldPause && !wasAlreadyPaused) {
    const pausedEmail = buildPausedEmail({
      customer_name: sub.customer_name || params.customer_name || '',
      amount: sub.amount || params.amount_charged,
      recovery_link: recoveryLink,
    });

    await sendNotification(base44, {
      subscription_id: subscription_id,
      customer_id: params.customer_id || sub.customer_id,
      customer_email: params.customer_email || sub.customer_email,
      customer_name: sub.customer_name || params.customer_name,
      notification_type: NOTIFICATION_TYPES.PAUSED_AFTER_3,
      payment_event_id: payment_event_id,
      subject: pausedEmail.subject,
      html_body: pausedEmail.html_body,
      recovery_link_url: recoveryLink,
      recovery_link_token: recoveryToken,
      cert_mode,
    });
  }

  return {
    status: 'processed',
    subscription_id: subscription_id,
    notification_id: notificationResult.notification_id,
    email_sent: notificationResult.email_sent,
    consecutive_failed_attempts: currentFailures,
    auto_charge_paused: shouldPause,
    recovery_hold_active: true,
    message: shouldPause
      ? `Auto-Fund paused after ${MAX_CONSECUTIVE_FAILURES} consecutive failures`
      : `Failure recorded (${currentFailures}/${MAX_CONSECUTIVE_FAILURES})`,
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Process Successful Auto-Fund Payment (reset recovery state)
// ┌────────────────────────────────────────────────────────────────────────────

export async function processSuccessfulAutoFundPayment(base44: any, params: {
  payment_event_id: string;
  subscription_id: string;
  customer_id: string;
  customer_email: string;
  customer_name?: string;
  amount_charged: number;
  booking_value_added: number;
  cert_mode: boolean;
}): Promise<RecoveryResult> {
  const { payment_event_id, subscription_id, cert_mode } = params;

  const sub = await getSubscription(base44, subscription_id);
  if (!sub) {
    return {
      status: 'error',
      error: `Subscription not found: ${subscription_id}`,
      payment_event_id,
    };
  }

  // Cert mode isolation
  if (cert_mode) {
    if (!isCertificationId(sub.customer_email)) {
      return {
        status: 'error',
        error: 'Certification mode cannot operate on a production subscription',
        payment_event_id,
      };
    }
  } else {
    if (isCertificationId(sub.customer_email)) {
      return {
        status: 'error',
        error: 'Production event cannot operate on a certification subscription',
        payment_event_id,
      };
    }
  }

  // If no recovery state was active, no action needed
  const wasInRecovery = sub.recovery_hold_active === true || sub.auto_charge_paused === true;
  if (!wasInRecovery && (sub.consecutive_failed_attempts || 0) === 0) {
    return {
      status: 'no_action',
      subscription_id: subscription_id,
      message: 'No recovery state to clear — subscription was already healthy',
    };
  }

  const nowIso = new Date().toISOString();

  // Reset recovery state
  await base44.entities.AutoFundSubscription.update(sub.id, {
    consecutive_failed_attempts: 0,
    last_failure_at: '',
    last_failure_reason: '',
    recovery_hold_active: false,
    recovery_hold_at: '',
    recovery_hold_reason: '',
    auto_charge_paused: false,
    auto_charge_paused_at: '',
    auto_charge_paused_reason: '',
    status: 'active',
    recovery_link_token: '',
    recovery_link_expires_at: '',
    updated_at: nowIso,
  });

  // Send payment recovered notification (only if was in recovery)
  if (wasInRecovery) {
    const recoveredEmail = buildPaymentRecoveredEmail({
      customer_name: sub.customer_name || params.customer_name || '',
      amount: params.amount_charged,
      booking_value_added: params.booking_value_added,
    });

    await sendNotification(base44, {
      subscription_id: subscription_id,
      customer_id: params.customer_id || sub.customer_id,
      customer_email: params.customer_email || sub.customer_email,
      customer_name: sub.customer_name || params.customer_name,
      notification_type: NOTIFICATION_TYPES.PAYMENT_RECOVERED,
      payment_event_id: payment_event_id,
      subject: recoveredEmail.subject,
      html_body: recoveredEmail.html_body,
      cert_mode,
    });
  }

  return {
    status: 'processed',
    subscription_id: subscription_id,
    recovery_hold_active: false,
    auto_charge_paused: false,
    consecutive_failed_attempts: 0,
    message: wasInRecovery
      ? 'Recovery state cleared — payment recovered'
      : 'Failure counter reset',
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Send Recovery Reminder (day 3 or day 7)
// ┌────────────────────────────────────────────────────────────────────────────

export async function sendRecoveryReminder(base44: any, params: {
  subscription_id: string;
  reminder_type: 'day_3' | 'day_7';
  cert_mode: boolean;
}): Promise<RecoveryResult> {
  const { subscription_id, reminder_type, cert_mode } = params;

  const sub = await getSubscription(base44, subscription_id);
  if (!sub) {
    return { status: 'error', error: `Subscription not found: ${subscription_id}` };
  }

  // Only send reminders if recovery hold is still active
  if (!sub.recovery_hold_active) {
    return {
      status: 'no_action',
      subscription_id,
      message: 'Recovery hold is not active — no reminder needed',
    };
  }

  // Don't send reminders for cancelled subscriptions
  if (sub.status === 'cancelled') {
    return {
      status: 'no_action',
      subscription_id,
      message: 'Subscription is cancelled — no reminder sent',
    };
  }

  // Cert mode isolation
  if (cert_mode && !isCertificationId(sub.customer_email)) {
    return { status: 'error', error: 'Certification mode cannot operate on a production subscription' };
  }

  // Generate or reuse recovery link
  let recoveryToken = sub.recovery_link_token || '';
  let recoveryLinkExpires = sub.recovery_link_expires_at || '';
  const now = Date.now();
  const tokenExpired = !recoveryLinkExpires || new Date(recoveryLinkExpires).getTime() < now;

  if (!recoveryToken || tokenExpired) {
    recoveryToken = generateRecoveryToken(cert_mode);
    recoveryLinkExpires = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    await base44.entities.AutoFundSubscription.update(sub.id, {
      recovery_link_token: recoveryToken,
      recovery_link_expires_at: recoveryLinkExpires,
      updated_at: new Date().toISOString(),
    });
  }

  const recoveryLink = buildRecoveryLink(recoveryToken);
  const day = reminder_type === 'day_3' ? 3 : 7;
  const isFinal = reminder_type === 'day_7';

  const reminderEmail = buildReminderEmail({
    customer_name: sub.customer_name || '',
    amount: sub.amount,
    day,
    recovery_link: recoveryLink,
    is_final: isFinal,
  });

  const notifType = reminder_type === 'day_3' ? NOTIFICATION_TYPES.DAY_3_REMINDER : NOTIFICATION_TYPES.DAY_7_REMINDER;
  // Deterministic idempotency key per recovery cycle: subscription + type + recovery_hold_at.
  // When the hold is cleared (recovery) and a new failure starts, recovery_hold_at changes,
  // allowing a new reminder in the new cycle.
  const cycleKey = sub.recovery_hold_at || sub.last_failure_at || 'unknown';

  const notificationResult = await sendNotification(base44, {
    subscription_id: subscription_id,
    customer_id: sub.customer_id,
    customer_email: sub.customer_email,
    customer_name: sub.customer_name,
    notification_type: notifType,
    subject: reminderEmail.subject,
    html_body: reminderEmail.html_body,
    recovery_link_url: recoveryLink,
    recovery_link_token: recoveryToken,
    cert_mode,
    idempotency_key: `${subscription_id}_${notifType}_${cycleKey}`,
  });

  return {
    status: notificationResult.duplicate ? 'duplicate' : 'processed',
    subscription_id,
    notification_id: notificationResult.notification_id,
    email_sent: notificationResult.email_sent,
    message: notificationResult.duplicate ? 'Reminder already sent' : `${day}-day reminder sent`,
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Create Stripe Payment Method Update Session
// ┌────────────────────────────────────────────────────────────────────────────

export async function createPaymentMethodUpdateSession(base44: any, params: {
  subscription_id: string;
  customer_email: string;
  cert_mode: boolean;
}): Promise<{
  url: string;
  session_id: string;
  recovery_token: string;
  status: string;
  error?: string;
}> {
  const { subscription_id, cert_mode } = params;

  const sub = await getSubscription(base44, subscription_id);
  if (!sub) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: 'Subscription not found' };
  }

  // Verify customer owns this subscription
  if (sub.customer_email !== params.customer_email) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: 'Access denied — subscription does not belong to this customer' };
  }

  // Cert mode isolation
  if (cert_mode && !isCertificationId(sub.customer_email)) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: 'Certification mode cannot operate on a production subscription' };
  }
  if (!cert_mode && isCertificationId(sub.customer_email)) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: 'Production mode cannot operate on a certification subscription' };
  }

  // Generate recovery token
  const recoveryToken = generateRecoveryToken(cert_mode);
  const recoveryLinkExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // In cert mode, return a synthetic URL (no real Stripe call)
  if (cert_mode) {
    const syntheticUrl = `${getAppDomain()}/AutoFund?recovery_token=${encodeURIComponent(recoveryToken)}&cert_session=cert_stripe_setup_${Date.now()}`;
    await base44.entities.AutoFundSubscription.update(sub.id, {
      recovery_link_token: recoveryToken,
      recovery_link_expires_at: recoveryLinkExpires,
      updated_at: new Date().toISOString(),
    });
    return {
      url: syntheticUrl,
      session_id: `cert_setup_session_${Date.now()}`,
      recovery_token: recoveryToken,
      status: 'success',
    };
  }

  // Production: create Stripe Checkout Session in setup mode
  const stripeKey = typeof Deno !== 'undefined' ? Deno.env.get('STRIPE_SECRET_KEY') : '';
  if (!stripeKey) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: 'STRIPE_SECRET_KEY not configured' };
  }

  if (!sub.stripe_customer_id) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: 'Subscription has no Stripe customer ID — cannot create update session' };
  }

  const appDomain = getAppDomain();
  const successUrl = `${appDomain}/AutoFund?recovery=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appDomain}/AutoFund?recovery=cancelled`;

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'setup',
        customer: sub.stripe_customer_id,
        'payment_method_types[0]': 'card',
        success_url: successUrl,
        cancel_url: cancelUrl,
        'metadata[subscription_id]': subscription_id,
        'metadata[customer_id]': sub.customer_id,
        'metadata[recovery_token]': recoveryToken,
      }).toString(),
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      return { url: '', session_id: '', recovery_token: '', status: 'error', error: `Stripe error: ${errText}` };
    }

    const session = await stripeRes.json();

    // Save recovery token
    await base44.entities.AutoFundSubscription.update(sub.id, {
      recovery_link_token: recoveryToken,
      recovery_link_expires_at: recoveryLinkExpires,
      updated_at: new Date().toISOString(),
    });

    return {
      url: session.url,
      session_id: session.id,
      recovery_token: recoveryToken,
      status: 'success',
    };
  } catch (err) {
    return { url: '', session_id: '', recovery_token: '', status: 'error', error: `Stripe API error: ${err.message}` };
  }
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Confirm Payment Method Update
// ┌────────────────────────────────────────────────────────────────────────────

export async function confirmPaymentMethodUpdate(base44: any, params: {
  subscription_id: string;
  stripe_session_id?: string;
  recovery_token?: string;
  cert_mode: boolean;
}): Promise<RecoveryResult> {
  const { subscription_id, cert_mode } = params;

  const sub = await getSubscription(base44, subscription_id);
  if (!sub) {
    return { status: 'error', error: 'Subscription not found' };
  }

  // Verify recovery token if provided
  if (params.recovery_token && sub.recovery_link_token) {
    if (params.recovery_token !== sub.recovery_link_token) {
      return { status: 'error', error: 'Invalid recovery token' };
    }
    // Check token expiry
    if (sub.recovery_link_expires_at && new Date(sub.recovery_link_expires_at) < new Date()) {
      return { status: 'error', error: 'Recovery link has expired' };
    }
  }

  // Cert mode isolation
  if (cert_mode && !isCertificationId(sub.customer_email)) {
    return { status: 'error', error: 'Certification mode cannot operate on a production subscription' };
  }

  const nowIso = new Date().toISOString();

  // In cert mode, skip Stripe session verification
  if (!cert_mode && params.stripe_session_id) {
    // Verify the Stripe session was completed successfully
    const stripeKey = typeof Deno !== 'undefined' ? Deno.env.get('STRIPE_SECRET_KEY') : '';
    if (stripeKey) {
      try {
        const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${params.stripe_session_id}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        });
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.payment_status !== 'no_payment_required' && session.status !== 'complete') {
            return { status: 'error', error: 'Stripe session is not complete' };
          }
          // Verify the session belongs to this subscription
          if (session.metadata?.subscription_id !== subscription_id) {
            return { status: 'error', error: 'Stripe session does not belong to this subscription' };
          }
        }
      } catch (err) {
        return { status: 'error', error: `Stripe session verification failed: ${err.message}` };
      }
    }
  }

  // Clear recovery hold and resume auto-charge
  const wasPaused = sub.auto_charge_paused === true;
  const wasInRecovery = sub.recovery_hold_active === true;

  await base44.entities.AutoFundSubscription.update(sub.id, {
    recovery_hold_active: false,
    recovery_hold_at: '',
    recovery_hold_reason: '',
    auto_charge_paused: false,
    auto_charge_paused_at: '',
    auto_charge_paused_reason: '',
    consecutive_failed_attempts: 0,
    last_failure_at: '',
    last_failure_reason: '',
    payment_method_updated_at: nowIso,
    status: 'active',
    recovery_link_token: '',
    recovery_link_expires_at: '',
    updated_at: nowIso,
  });

  // Send method updated notification
  const nextBillingDate = sub.next_billing_date
    ? new Date(sub.next_billing_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'your next scheduled billing date';

  const updatedEmail = buildMethodUpdatedEmail({
    customer_name: sub.customer_name || '',
    amount: sub.amount,
    next_billing_date: nextBillingDate,
  });

  const notifResult = await sendNotification(base44, {
    subscription_id: subscription_id,
    customer_id: sub.customer_id,
    customer_email: sub.customer_email,
    customer_name: sub.customer_name,
    notification_type: NOTIFICATION_TYPES.METHOD_UPDATED,
    subject: updatedEmail.subject,
    html_body: updatedEmail.html_body,
    cert_mode,
  });

  // If was paused, also send auto-fund resumed notification
  if (wasPaused) {
    await sendNotification(base44, {
      subscription_id: subscription_id,
      customer_id: sub.customer_id,
      customer_email: sub.customer_email,
      customer_name: sub.customer_name,
      notification_type: NOTIFICATION_TYPES.AUTO_FUND_RESUMED,
      subject: 'Auto-Fund Resumed — Automatic Charging Active',
      html_body: updatedEmail.html_body, // Reuse the same body
      cert_mode,
    });
  }

  return {
    status: 'processed',
    subscription_id,
    notification_id: notifResult.notification_id,
    email_sent: notifResult.email_sent,
    recovery_hold_active: false,
    auto_charge_paused: false,
    consecutive_failed_attempts: 0,
    message: wasPaused
      ? 'Payment method updated, Auto-Fund resumed'
      : wasInRecovery
        ? 'Payment method updated, recovery hold cleared'
        : 'Payment method updated',
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Admin Override Recovery Hold
// ┌────────────────────────────────────────────────────────────────────────────

export async function adminOverrideRecoveryHold(base44: any, params: {
  subscription_id: string;
  reason: string;
  admin_email: string;
  cert_mode: boolean;
}): Promise<RecoveryResult> {
  const { subscription_id, cert_mode } = params;

  const sub = await getSubscription(base44, subscription_id);
  if (!sub) {
    return { status: 'error', error: 'Subscription not found' };
  }

  const nowIso = new Date().toISOString();

  await base44.entities.AutoFundSubscription.update(sub.id, {
    recovery_hold_active: false,
    recovery_hold_at: '',
    recovery_hold_reason: '',
    auto_charge_paused: false,
    auto_charge_paused_at: '',
    auto_charge_paused_reason: '',
    consecutive_failed_attempts: 0,
    status: 'active',
    updated_at: nowIso,
  });

  // Record audit via B2BAuditLog (reusing existing audit entity)
  try {
    await base44.entities.B2BAuditLog.create({
      actor: params.admin_email,
      actor_type: 'admin',
      action: 'RECOVERY_HOLD_OVERRIDE',
      reason: params.reason || 'Admin override of recovery hold',
      entity_type: 'AutoFundSubscription',
      entity_id: subscription_id,
      timestamp: nowIso,
    });
  } catch {}

  return {
    status: 'processed',
    subscription_id,
    recovery_hold_active: false,
    auto_charge_paused: false,
    message: 'Recovery hold overridden by admin',
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Get Recovery Status
// ┌────────────────────────────────────────────────────────────────────────────

export async function getRecoveryStatus(base44: any, params: {
  subscription_id?: string;
  customer_email?: string;
}): Promise<any> {
  let sub = null;
  if (params.subscription_id) {
    sub = await getSubscription(base44, params.subscription_id);
  } else if (params.customer_email) {
    const results = await base44.entities.AutoFundSubscription.filter(
      { customer_email: params.customer_email },
      '-created_date',
      5
    );
    const arr = Array.isArray(results) ? results : (results?.data || []);
    sub = arr[0];
  }

  if (!sub) {
    return { error: 'Subscription not found' };
  }

  // Get notification history
  const notifResults = await base44.entities.PaymentRecoveryNotification.filter(
    { subscription_id: sub.id },
    '-sent_at',
    50
  );
  const notifications = Array.isArray(notifResults) ? notifResults : (notifResults?.data || []);

  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      amount: sub.amount,
      auto_charge_paused: sub.auto_charge_paused || false,
      consecutive_failed_attempts: sub.consecutive_failed_attempts || 0,
      last_failure_at: sub.last_failure_at || '',
      last_failure_reason: sub.last_failure_reason || '',
      recovery_hold_active: sub.recovery_hold_active || false,
      recovery_hold_at: sub.recovery_hold_at || '',
      next_billing_date: sub.next_billing_date || '',
      payment_method_updated_at: sub.payment_method_updated_at || '',
      auto_charge_paused_at: sub.auto_charge_paused_at || '',
    },
    notifications: notifications.map(n => ({
      notification_id: n.notification_id,
      type: n.notification_type,
      sent_at: n.sent_at,
      email_sent: n.email_sent,
      certification_mode: n.certification_mode,
    })),
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Get Recovery Dashboard (admin)
// ┌────────────────────────────────────────────────────────────────────────────

export async function getRecoveryDashboard(base44: any): Promise<any> {
  // Get all subscriptions with recovery state
  const results = await base44.entities.AutoFundSubscription.filter(
    { status: { $in: ['active', 'past_due', 'paused'] } },
    '-updated_date',
    200
  );
  const subs = Array.isArray(results) ? results : (results?.data || []);

  const recoverySubs = subs.filter(s =>
    s.recovery_hold_active === true ||
    s.auto_charge_paused === true ||
    (s.consecutive_failed_attempts || 0) > 0
  );

  const dashboard = [];
  for (const sub of recoverySubs) {
    // Skip cert fixtures in production dashboard
    if (isCertificationId(sub.customer_email)) continue;

    dashboard.push({
      subscription_id: sub.id,
      customer_email: sub.customer_email,
      customer_name: sub.customer_name || '',
      amount: sub.amount,
      status: sub.status,
      auto_charge_paused: sub.auto_charge_paused || false,
      consecutive_failed_attempts: sub.consecutive_failed_attempts || 0,
      last_failure_at: sub.last_failure_at || '',
      last_failure_reason: sub.last_failure_reason || '',
      recovery_hold_active: sub.recovery_hold_active || false,
      next_billing_date: sub.next_billing_date || '',
      payment_method_updated_at: sub.payment_method_updated_at || '',
    });
  }

  return { subscriptions: dashboard, total: dashboard.length };
}

// ┌────────────────────────────────────────────────────────────────────────────
// MAIN: Process Failed Prepaid Purchase (one-time, no 3-strike rule)
// ┌────────────────────────────────────────────────────────────────────────────

export async function processFailedPrepaidPurchase(base44: any, params: {
  payment_event_id: string;
  customer_id: string;
  customer_email: string;
  customer_name?: string;
  amount: number;
  failure_reason: string;
  cert_mode: boolean;
}): Promise<RecoveryResult> {
  const { payment_event_id, customer_email, cert_mode } = params;

  // Cert mode isolation
  if (cert_mode && !isCertificationId(customer_email)) {
    return { status: 'error', error: 'Certification mode requires cert_-prefixed customer_email' };
  }

  // Generate recovery/retry token
  const recoveryToken = generateRecoveryToken(cert_mode);
  const recoveryLink = buildRecoveryLink(recoveryToken);

  // Send prepaid failure email
  const failureEmail = buildPrepaidFailureEmail({
    customer_name: params.customer_name || '',
    amount: params.amount,
    failure_reason: params.failure_reason || 'Payment declined',
    retry_link: recoveryLink,
  });

  // Use a synthetic subscription_id for the notification record (prepaid has no subscription)
  const syntheticSubId = cert_mode ? `cert_prepaid_${payment_event_id}` : `prepaid_${payment_event_id}`;

  const notifResult = await sendNotification(base44, {
    subscription_id: syntheticSubId,
    customer_id: params.customer_id,
    customer_email: customer_email,
    customer_name: params.customer_name,
    notification_type: NOTIFICATION_TYPES.PREPAID_PURCHASE_FAILED,
    payment_event_id: payment_event_id,
    subject: failureEmail.subject,
    html_body: failureEmail.html_body,
    recovery_link_url: recoveryLink,
    recovery_link_token: recoveryToken,
    cert_mode,
  });

  return {
    status: 'processed',
    notification_id: notifResult.notification_id,
    email_sent: notifResult.email_sent,
    message: 'Prepaid purchase failure notification sent (no 3-strike rule applied)',
  };
}

// ┌────────────────────────────────────────────────────────────────────────────
// HELPER: Get subscriptions needing day 3 or day 7 reminders
// ┌────────────────────────────────────────────────────────────────────────────

export async function getSubscriptionsNeedingReminders(base44: any): Promise<{
  day_3: any[];
  day_7: any[];
}> {
  const results = await base44.entities.AutoFundSubscription.filter(
    { recovery_hold_active: true, status: { $in: ['active', 'past_due'] } },
    '-updated_date',
    200
  );
  const subs = Array.isArray(results) ? results : (results?.data || []);
  const now = Date.now();

  const day3: any[] = [];
  const day7: any[] = [];

  for (const sub of subs) {
    // Skip cert fixtures
    if (isCertificationId(sub.customer_email)) continue;

    const failureTime = sub.last_failure_at ? new Date(sub.last_failure_at).getTime() : 0;
    const daysSinceFailure = Math.floor((now - failureTime) / (24 * 60 * 60 * 1000));

    // Check if day 3 reminder is due and not yet sent
    if (daysSinceFailure >= 3 && daysSinceFailure < 7) {
      // Check if day 3 reminder was already sent
      const existing = await base44.entities.PaymentRecoveryNotification.filter(
        { subscription_id: sub.id, notification_type: NOTIFICATION_TYPES.DAY_3_REMINDER },
        undefined,
        1
      );
      const arr = Array.isArray(existing) ? existing : (existing?.data || []);
      if (arr.length === 0) {
        day3.push(sub);
      }
    }

    // Check if day 7 reminder is due and not yet sent
    if (daysSinceFailure >= 7) {
      const existing = await base44.entities.PaymentRecoveryNotification.filter(
        { subscription_id: sub.id, notification_type: NOTIFICATION_TYPES.DAY_7_REMINDER },
        undefined,
        1
      );
      const arr = Array.isArray(existing) ? existing : (existing?.data || []);
      if (arr.length === 0) {
        day7.push(sub);
      }
    }
  }

  return { day_3: day3, day_7: day7 };
}