// ============================================================================
// ARRIV AUTO-FUND — MEMBERSHIP NOTICE ENGINE
// ============================================================================
// Builds, sends and AUDITS the three required customer notices:
//
//   enrollment_acknowledgment  — durable confirmation after enrollment
//   renewal_notice             — jurisdiction-aware advance notice before renewal
//   cancellation_confirmation  — durable confirmation after cancellation
//
// Every notice is recorded in AutoFundMembershipNotice with its content snapshot,
// delivery status, attempt count and failure reason, so the app can prove what was
// sent, when, and whether it arrived.
//
// Idempotency is structural: notice_id is derived from (type, subscription, cycle),
// so a re-run, a retry, or two schedulers racing cannot produce a second notice for
// the same cycle. A failed notice IS retried — on the same record, incrementing the
// attempt count rather than creating a duplicate.
//
// No payment credential, card detail or secret is ever placed in a notice body.
// ============================================================================

import { sendBrevoEmail } from './brevoClient.ts';
import { toCents } from './prepaidEngine.ts';
import {
  buildComplianceDisclosure,
  type ComplianceDisclosure,
} from './autoFundComplianceDisclosure.ts';
import type { RenewalNoticeRule } from './autoFundRenewalPolicy.ts';

export type NoticeType =
  | 'enrollment_acknowledgment'
  | 'renewal_notice'
  | 'cancellation_confirmation';

export type DeliveryStatus = 'sent' | 'failed' | 'skipped';

const SUPPORT_EMAIL = 'info@arrivestatemedia.com';
const APP_URL = 'https://app.arrivestatemedia.com';
const AUTOFUND_URL = `${APP_URL}/AutoFund`;

/** Deterministic, idempotent notice identity. */
export function buildNoticeId(type: NoticeType, subscriptionId: string, cycleKey = 'initial'): string {
  return `${type}__${subscriptionId}__${cycleKey}`;
}

export interface SenderArgs {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

export type NoticeSender = (args: SenderArgs) => Promise<any>;

export interface DispatchNoticeInput {
  base44: any;
  notice_id: string;
  notice_type: NoticeType;
  subscription: any;
  fields?: Record<string, any>;
  subject: string;
  text: string;
  html: string;
  /** Injectable for certification — lets tests exercise delivery and failure. */
  sender?: NoticeSender;
  /** Certification notices are recorded but never delivered to a real customer. */
  cert_mode?: boolean;
}

export interface DispatchNoticeResult {
  status: 'sent' | 'duplicate' | 'failed' | 'skipped';
  notice_id: string;
  notice_type: NoticeType;
  delivery_status: DeliveryStatus;
  delivery_attempts: number;
  failure_reason?: string;
}

/**
 * Record and deliver one notice.
 *
 * - Already delivered → returns `duplicate` without re-sending.
 * - Previously failed → retries on the SAME record, incrementing attempts.
 * - Certification → recorded as `skipped`, never delivered.
 */
export async function dispatchNotice(input: DispatchNoticeInput): Promise<DispatchNoticeResult> {
  const { base44, notice_id, notice_type, subscription, cert_mode } = input;
  const nowIso = new Date().toISOString();

  const existingRes = await base44.entities.AutoFundMembershipNotice.filter({ notice_id }, undefined, 1);
  const existingArr = Array.isArray(existingRes) ? existingRes : (existingRes?.data || []);
  const existing = existingArr[0];

  if (existing && existing.delivery_status === 'sent') {
    return {
      status: 'duplicate',
      notice_id,
      notice_type,
      delivery_status: 'sent',
      delivery_attempts: existing.delivery_attempts || 1,
    };
  }

  const priorAttempts = existing?.delivery_attempts || 0;
  const record: Record<string, any> = {
    notice_id,
    notice_type,
    subscription_id: subscription?.id || '',
    customer_id: subscription?.customer_id || '',
    customer_email: subscription?.customer_email || '',
    customer_name: subscription?.customer_name || '',
    terms_version: input.fields?.terms_version || subscription?.terms_version || '',
    email_subject: input.subject,
    body_snapshot: input.text,
    certification_mode: cert_mode === true,
    ...(input.fields || {}),
  };

  // ── Certification: record the notice, deliver nothing ────────────────────
  if (cert_mode) {
    record.delivery_status = 'skipped';
    record.delivery_attempts = priorAttempts;
    record.last_attempt_at = nowIso;
    record.failure_reason = 'Certification mode — recorded but not delivered.';
    if (existing) await base44.entities.AutoFundMembershipNotice.update(existing.id, record);
    else await base44.entities.AutoFundMembershipNotice.create({ ...record, created_at: nowIso });
    return { status: 'skipped', notice_id, notice_type, delivery_status: 'skipped', delivery_attempts: priorAttempts };
  }

  const sender: NoticeSender = input.sender || ((args) =>
    sendBrevoEmail({ to: args.to, subject: args.subject, htmlContent: args.htmlContent, textContent: args.textContent }));

  try {
    await sender({
      to: subscription?.customer_email || '',
      subject: input.subject,
      htmlContent: input.html,
      textContent: input.text,
    });
    record.delivery_status = 'sent';
    record.delivery_attempts = priorAttempts + 1;
    record.sent_at = nowIso;
    record.last_attempt_at = nowIso;
    record.failure_reason = '';
    if (existing) await base44.entities.AutoFundMembershipNotice.update(existing.id, record);
    else await base44.entities.AutoFundMembershipNotice.create({ ...record, created_at: nowIso });
    return { status: 'sent', notice_id, notice_type, delivery_status: 'sent', delivery_attempts: priorAttempts + 1 };
  } catch (err: any) {
    const reason = String(err?.message || err).slice(0, 500);
    record.delivery_status = 'failed';
    record.delivery_attempts = priorAttempts + 1;
    record.last_attempt_at = nowIso;
    record.failure_reason = reason;
    if (existing) await base44.entities.AutoFundMembershipNotice.update(existing.id, record);
    else await base44.entities.AutoFundMembershipNotice.create({ ...record, created_at: nowIso });
    return {
      status: 'failed',
      notice_id,
      notice_type,
      delivery_status: 'failed',
      delivery_attempts: priorAttempts + 1,
      failure_reason: reason,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL PRESENTATION
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = '#B8956A';
const DARK = '#1A1A1A';
const CREAM = '#FFFBF5';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(heading: string, subheading: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:${CREAM};padding:24px;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <div style="background:${GOLD};padding:20px 24px;">
      <p style="margin:0;color:${DARK};font-size:16px;font-weight:bold;">Arriv Estate Media</p>
    </div>
    <div style="padding:28px 24px;">
      <h1 style="margin:0 0 6px;color:${DARK};font-size:21px;">${esc(heading)}</h1>
      <p style="margin:0 0 20px;color:${DARK};opacity:0.65;font-size:14px;">${esc(subheading)}</p>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="margin:0;color:${DARK};opacity:0.65;font-size:12px;">
        Manage your membership: <a href="${AUTOFUND_URL}" style="color:${GOLD};">${AUTOFUND_URL}</a><br />
        Customer support: <a href="mailto:${SUPPORT_EMAIL}" style="color:${GOLD};">${SUPPORT_EMAIL}</a>
      </p>
    </div>
  </div>
</div>`;
}

function rows(pairs: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;color:${DARK};">${pairs
    .map(([k, v]) => `<tr><td style="padding:6px 0;opacity:0.65;">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold;">${esc(v)}</td></tr>`)
    .join('')}</table>`;
}

function headingBlock(text: string): string {
  return `<p style="margin:22px 0 8px;color:${DARK};font-size:15px;font-weight:bold;">${esc(text)}</p>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 10px;color:${DARK};font-size:13px;line-height:1.6;">${esc(text)}</p>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT ACKNOWLEDGMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function sendEnrollmentAcknowledgment({
  base44, subscription, billingDay, sender, cert_mode,
}: {
  base44: any;
  subscription: any;
  billingDay?: number;
  sender?: NoticeSender;
  cert_mode?: boolean;
}): Promise<DispatchNoticeResult> {
  const d: ComplianceDisclosure = buildComplianceDisclosure({
    tierAmount: subscription?.amount,
    termsVersion: subscription?.terms_version || '',
    billingDay: billingDay ?? subscription?.billing_day_of_month,
    nextRenewalDate: subscription?.next_billing_date
      ? new Date(subscription.next_billing_date).toDateString()
      : '',
    feePolicy: subscription?.fee_refund_policy,
  });

  const subject = `Your Arriv Auto-Fund membership is confirmed — ${d.tier_name}`;

  const text = [
    `Your Auto-Fund membership is confirmed.`,
    ``,
    `Plan: ${d.tier_name}`,
    `Monthly wallet funding: $${d.monthly_wallet_funding}`,
    `Promotional Booking Value: $${d.promotional_booking_value.toFixed(2)}`,
    `Monthly membership fee: $${d.monthly_membership_fee}`,
    `TOTAL RECURRING MONTHLY CHARGE: $${d.total_monthly_recurring_charge}`,
    `Billing frequency: monthly`,
    `Next renewal date: ${d.next_renewal_date || 'as scheduled at enrollment'}`,
    ``,
    `Membership benefits: ${d.benefits.join('; ') || 'None listed.'}`,
    ``,
    `Membership-fee refund policy: ${d.fee_refund_policy_statement}`,
    ...d.fee_refund_exceptions.map(e => `- ${e}`),
    ``,
    `Your wallet:`,
    ...d.wallet_terms.verified_statements.map(s => `- ${s}`),
    ``,
    `How to cancel: ${d.cancellation_procedure}`,
    ``,
    `Terms version accepted: ${d.terms_version}`,
    `Complete terms: ${d.terms_url}`,
    `Support: ${SUPPORT_EMAIL}`,
  ].join('\n');

  const html = shell(
    'Your Auto-Fund membership is confirmed',
    `Plan: ${d.tier_name}`,
    `${rows([
      ['Monthly wallet funding', `$${d.monthly_wallet_funding}`],
      ['Promotional Booking Value', `$${d.promotional_booking_value.toFixed(2)}`],
      ['Monthly membership fee', `$${d.monthly_membership_fee}`],
      ['Total recurring monthly charge', `$${d.total_monthly_recurring_charge}`],
      ['Billing frequency', 'Monthly'],
      ['Next renewal date', d.next_renewal_date || 'As scheduled at enrollment'],
    ])}
    ${headingBlock('Membership benefits')}
    ${para(d.benefits.join('; ') || 'None listed.')}
    ${headingBlock('Membership-fee refund policy')}
    ${para(d.fee_refund_policy_statement)}
    ${d.fee_refund_exceptions.map(e => para('• ' + e)).join('')}
    ${headingBlock('Your wallet — refunds and unused balances')}
    ${d.wallet_terms.verified_statements.map(s => para('• ' + s)).join('')}
    ${headingBlock('How to cancel')}
    ${para(d.cancellation_procedure)}
    ${headingBlock('Your accepted terms')}
    ${para(`Terms version: ${d.terms_version}. Complete terms: ${d.terms_url}`)}
    ${para('Keep this email as your enrollment acknowledgment.')}`,
  );

  return dispatchNotice({
    base44,
    notice_id: buildNoticeId('enrollment_acknowledgment', subscription?.id),
    notice_type: 'enrollment_acknowledgment',
    subscription,
    subject,
    text,
    html,
    sender,
    cert_mode,
    fields: {
      enrollment_channel: subscription?.enrollment_channel || '',
      tier_amount: d.tier_amount,
      membership_fee: d.monthly_membership_fee,
      total_monthly_charge: d.total_monthly_recurring_charge,
      billing_frequency: 'monthly',
      next_renewal_date: subscription?.next_billing_date || '',
      terms_version: d.terms_version,
      fee_refund_policy: d.fee_refund_policy,
      wallet_balance_cents_at_notice: 0,
      wallet_balance_preserved: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCELLATION CONFIRMATION
// ─────────────────────────────────────────────────────────────────────────────

export async function sendCancellationConfirmation({
  base44, subscription, wallet, cancelledAt, sender, cert_mode,
}: {
  base44: any;
  subscription: any;
  wallet?: any;
  cancelledAt: string;
  sender?: NoticeSender;
  cert_mode?: boolean;
}): Promise<DispatchNoticeResult> {
  const balanceCents = wallet?.booking_value_balance_cents ?? 0;

  // Benefits already paid for remain available through the end of the period the
  // customer has already paid for. The paid period runs to the renewal date that
  // was scheduled when they cancelled.
  const benefitPeriodEnd = subscription?.next_billing_date || '';

  const d = buildComplianceDisclosure({
    tierAmount: subscription?.amount,
    termsVersion: subscription?.terms_version || '',
    billingDay: subscription?.billing_day_of_month,
  });

  const subject = 'Your Arriv Auto-Fund membership is cancelled';

  const text = [
    `Your Auto-Fund membership has been cancelled.`,
    ``,
    `Effective cancellation date: ${new Date(cancelledAt).toDateString()}`,
    `No further recurring charges will be made, including both the wallet funding and the membership fee.`,
    `Paid membership-benefit period ends: ${benefitPeriodEnd ? new Date(benefitPeriodEnd).toDateString() : 'the end of the period already paid for'}`,
    ``,
    `Your wallet balance has NOT been forfeited.`,
    `Cash-funded Booking Value remaining: $${(balanceCents / 100).toFixed(2)}`,
    ...d.wallet_terms.verified_statements.map(s => `- ${s}`),
    ``,
    `Membership-fee refund policy: ${d.fee_refund_policy_statement}`,
    ...d.fee_refund_exceptions.map(e => `- ${e}`),
    ``,
    `Support: ${SUPPORT_EMAIL}`,
  ].join('\n');

  const html = shell(
    'Your Auto-Fund membership is cancelled',
    'No further recurring charges will be made',
    `${rows([
      ['Effective cancellation date', new Date(cancelledAt).toDateString()],
      ['Paid membership-benefit period ends', benefitPeriodEnd ? new Date(benefitPeriodEnd).toDateString() : 'End of paid period'],
    ])}
    ${headingBlock('Your wallet has not been forfeited')}
    ${para(`Cash-funded Booking Value remaining: $${(balanceCents / 100).toFixed(2)}`)}
    ${d.wallet_terms.verified_statements.map(s => para('• ' + s)).join('')}
    ${headingBlock('Membership-fee refund policy')}
    ${para(d.fee_refund_policy_statement)}
    ${d.fee_refund_exceptions.map(e => para('• ' + e)).join('')}`,
  );

  return dispatchNotice({
    base44,
    notice_id: buildNoticeId('cancellation_confirmation', subscription?.id, cancelledAt.slice(0, 10)),
    notice_type: 'cancellation_confirmation',
    subscription,
    subject,
    text,
    html,
    sender,
    cert_mode,
    fields: {
      tier_amount: subscription?.amount,
      membership_fee: subscription?.membership_fee || 0,
      total_monthly_charge: subscription?.total_monthly_charge || subscription?.amount || 0,
      billing_frequency: 'monthly',
      cancellation_effective_at: cancelledAt,
      benefit_period_end: benefitPeriodEnd,
      wallet_balance_preserved: true,
      wallet_balance_cents_at_notice: balanceCents,
      terms_version: subscription?.terms_version || '',
      fee_refund_policy: d.fee_refund_policy,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RENEWAL NOTICE
// ─────────────────────────────────────────────────────────────────────────────

export async function sendRenewalNotice({
  base44, subscription, rule, cycleKey, sender, cert_mode,
}: {
  base44: any;
  subscription: any;
  rule: RenewalNoticeRule;
  cycleKey: string;
  sender?: NoticeSender;
  cert_mode?: boolean;
}): Promise<DispatchNoticeResult> {
  const d = buildComplianceDisclosure({
    tierAmount: subscription?.amount,
    termsVersion: subscription?.terms_version || '',
    billingDay: subscription?.billing_day_of_month,
    nextRenewalDate: subscription?.next_billing_date
      ? new Date(subscription.next_billing_date).toDateString()
      : '',
    feePolicy: subscription?.fee_refund_policy,
  });

  const subject = `Upcoming Arriv Auto-Fund renewal — $${d.total_monthly_recurring_charge} on ${d.next_renewal_date}`;

  const text = [
    `Your Auto-Fund membership renews soon.`,
    ``,
    `Renewal date: ${d.next_renewal_date}`,
    `Amount: $${d.total_monthly_recurring_charge} (monthly wallet funding $${d.monthly_wallet_funding}${d.monthly_membership_fee > 0 ? ` plus $${d.monthly_membership_fee} membership fee` : ''})`,
    `Billing frequency: monthly`,
    ``,
    `How to cancel: ${d.cancellation_procedure}`,
    ``,
    `Membership-fee refund policy: ${d.fee_refund_policy_statement}`,
    `Support: ${SUPPORT_EMAIL}`,
  ].join('\n');

  const html = shell(
    'Your Auto-Fund membership renews soon',
    `Next renewal: ${d.next_renewal_date}`,
    `${rows([
      ['Renewal date', d.next_renewal_date],
      ['Total recurring monthly charge', `$${d.total_monthly_recurring_charge}`],
      ['Monthly wallet funding', `$${d.monthly_wallet_funding}`],
      ['Monthly membership fee', `$${d.monthly_membership_fee}`],
      ['Billing frequency', 'Monthly'],
    ])}
    ${headingBlock('How to cancel')}
    ${para(d.cancellation_procedure)}
    ${headingBlock('Membership-fee refund policy')}
    ${para(d.fee_refund_policy_statement)}`,
  );

  return dispatchNotice({
    base44,
    notice_id: buildNoticeId('renewal_notice', subscription?.id, cycleKey),
    notice_type: 'renewal_notice',
    subscription,
    subject,
    text,
    html,
    sender,
    cert_mode,
    fields: {
      tier_amount: d.tier_amount,
      membership_fee: d.monthly_membership_fee,
      total_monthly_charge: d.total_monthly_recurring_charge,
      billing_frequency: 'monthly',
      next_renewal_date: subscription?.next_billing_date || '',
      jurisdiction_state: rule.state,
      renewal_rule_applied: rule.rule_id,
      advance_notice_days: rule.advance_notice_days,
      statutory_cadence_confirmed: rule.statutory_cadence_confirmed,
      terms_version: d.terms_version,
      fee_refund_policy: d.fee_refund_policy,
    },
  });
}

/** Notices recorded for a subscription, newest first. */
export async function listNoticesForSubscription(base44: any, subscriptionId: string, limit = 50) {
  const res = await base44.entities.AutoFundMembershipNotice.filter(
    { subscription_id: subscriptionId },
    '-created_date',
    limit,
  );
  return Array.isArray(res) ? res : (res?.data || []);
}

export { toCents };