// ============================================================================
// ARRIV AUTO-FUND — CONTROLLED ENROLLMENT COHORT AND SWITCH SEMANTICS
// ============================================================================
// A controlled launch needs three independent controls, and they must not be
// confused with one another:
//
//   1. The MASTER enrollment switch (AUTOFUND_ENROLLMENT_FLAG_KEY + the code
//      flag). Its ONLY effect is to block NEW enrollment. It must never stop
//      billing, service access, cancellation or redemption for a customer who is
//      already enrolled.
//
//   2. The SELF-SERVICE switch (AUTOFUND_SELF_SERVICE_FLAG_KEY). Public
//      self-service enrollment is the channel that can scale without a human in
//      the loop, so it is gated separately and stays CLOSED during the initial
//      launch while sales-assisted enrollment is open.
//
//   3. The COHORT ALLOWLIST (AutoFundCohortMember), now OPTIONAL. While it is in
//      force (autofund_cohort_required = 'true') a customer may only enroll if
//      they are on the allowlist — a genuine allowlist, not a count of
//      enrollments. The owner removed that requirement on 2026-10-11 for ordinary
//      eligible customers, so it is off: an unlisted customer may enroll through a
//      channel the switches permit. An allowlist entry, where one exists, still
//      binds the channels it names.
// ============================================================================

import { isEnrollmentOpen, AUTOFUND_ENROLLMENT_FLAG_KEY } from './autoFundFinalConfig.ts';
import { generateId } from './prepaidEngine.ts';

/** Separate switch for public self-service enrollment. Absent/false means closed. */
export const AUTOFUND_SELF_SERVICE_FLAG_KEY = 'autofund_self_service_enabled';

/**
 * Whether a controlled-launch allowlist is REQUIRED. The owner removed the
 * named-cohort requirement on 2026-10-11 and authorized enrollment for any eligible
 * customer who voluntarily selects a membership, so this reads 'false': an unlisted
 * customer is no longer refused. Set it back to 'true' to confine new enrollment to
 * AutoFundCohortMember entries again. Only 'true' turns the requirement on.
 */
export const AUTOFUND_COHORT_REQUIRED_FLAG_KEY = 'autofund_cohort_required';

export type EnrollmentChannelInput = 'self_service' | 'sales_assisted' | 'admin';

export interface EnrollmentGateResult {
  allowed: boolean;
  reason: string;
  code: string;
  checks: {
    master_switch_open: boolean;
    self_service_switch_open: boolean;
    cohort_required: boolean;
    on_cohort_allowlist: boolean;
    channel_permitted: boolean;
  };
}

/** Read an AppSetting value. Absent, empty or anything other than 'true' is false. */
export async function readFlag(base44: any, key: string): Promise<boolean> {
  const res = await base44.entities.AppSetting.filter({ key }, undefined, 1);
  const arr = Array.isArray(res) ? res : (res?.data || []);
  return arr.length > 0 ? String(arr[0].value) === 'true' : false;
}

/** Look up an allowlist entry for an email. Matched case-insensitively. */
export async function findCohortEntry(base44: any, customerEmail: string) {
  const email = String(customerEmail || '').toLowerCase().trim();
  if (!email) return null;
  const res = await base44.entities.AutoFundCohortMember.filter(
    { customer_email: email },
    '-created_at',
    10
  );
  const arr = Array.isArray(res) ? res : (res?.data || []);
  return arr.find(e => String(e.customer_email || '').toLowerCase().trim() === email) || null;
}

const PERMITTING_STATUSES = ['invited', 'approved', 'enrolled'];

/**
 * The single gate every enrollment path must pass. Fails closed on every check.
 * Returns the individual check results so a refusal is always explainable.
 */
export async function evaluateEnrollmentGate(
  base44: any,
  { channel, customer_email, sales_rep_id }: {
    channel: EnrollmentChannelInput;
    customer_email: string;
    sales_rep_id?: string;
  },
): Promise<EnrollmentGateResult> {
  const masterSwitchOpen = await readFlag(base44, AUTOFUND_ENROLLMENT_FLAG_KEY);
  const masterOpen = isEnrollmentOpen(masterSwitchOpen ? 'true' : 'false');
  const selfServiceOpen = await readFlag(base44, AUTOFUND_SELF_SERVICE_FLAG_KEY);
  const cohortRequired = await readFlag(base44, AUTOFUND_COHORT_REQUIRED_FLAG_KEY);
  const entry = await findCohortEntry(base44, customer_email);
  const onAllowlist = !!entry && PERMITTING_STATUSES.includes(String(entry.status));
  const channels: string[] = entry?.allowed_channels?.length ? entry.allowed_channels : ['sales_assisted'];
  // An allowlist entry constrains the channels it names. Where there is no entry, the
  // channel is unconstrained — but only while the cohort requirement is not in force.
  const channelPermitted = onAllowlist ? channels.includes(channel) : !cohortRequired;

  const checks = {
    master_switch_open: masterOpen,
    self_service_switch_open: selfServiceOpen,
    cohort_required: cohortRequired,
    on_cohort_allowlist: onAllowlist,
    channel_permitted: channelPermitted,
  };

  if (!masterOpen) {
    return { allowed: false, code: 'ENROLLMENT_CLOSED', reason: 'Auto-Fund enrollment is closed. No new enrollment is accepted.', checks };
  }
  if (cohortRequired && !onAllowlist) {
    return {
      allowed: false,
      code: 'NOT_IN_LAUNCH_COHORT',
      reason: 'This customer is not on the controlled-launch enrollment allowlist.',
      checks,
    };
  }
  if (channel === 'self_service' && !selfServiceOpen) {
    return {
      allowed: false,
      code: 'SELF_SERVICE_CLOSED',
      reason: 'Public self-service enrollment is closed during the initial launch. A Sales Growth Advisor can enroll this customer.',
      checks,
    };
  }
  if (!channelPermitted) {
    return {
      allowed: false,
      code: 'CHANNEL_NOT_PERMITTED',
      reason: `This allowlist entry does not permit the "${channel}" channel.`,
      checks,
    };
  }
  // Self-service still requires a verified advisor attribution to carry commission,
  // which the enrollment engine resolves separately; the gate only authorizes entry.
  return {
    allowed: true,
    code: 'ALLOWED',
    reason: onAllowlist
      ? 'Enrollment permitted for this allowlisted customer.'
      : 'Enrollment permitted: the cohort restriction is not in force and every other gate is satisfied.',
    checks,
  };
}

/**
 * What the emergency enrollment-off switch does and does NOT affect.
 *
 * This is enforced by construction: the switch is read ONLY by the enrollment
 * gate above. Nothing in billing, wallet access, cancellation or redemption
 * consults it, so switching enrollment off cannot bill differently, cannot
 * revoke access, and cannot block a cancellation or a redemption.
 */
export const EMERGENCY_SWITCH_SEMANTICS = {
  switch_key: AUTOFUND_ENROLLMENT_FLAG_KEY,
  blocks: ['new_self_service_enrollment', 'new_sales_assisted_enrollment', 'new_admin_enrollment'],
  does_not_block: [
    'membership_fee_billing',
    'wallet_funding_billing',
    'service_access_and_redemption',
    'cancellation',
    'pause_and_resume',
    'refunds_and_reversals',
    'notices_and_renewal_compliance',
  ],
} as const;

/** Mint a stable allowlist entry ID. */
export function generateCohortMemberId(): string {
  return generateId('afcohort');
}