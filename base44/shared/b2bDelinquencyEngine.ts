// ============================================================================
// B2B DELINQUENCY & RECOVERY ENGINE
//
// Implements the approved B2B payment delinquency policy:
//   - Grace periods calculated from the invoice's contractual DUE DATE
//   - Customer classification → grace period mapping
//   - Full delinquency status lifecycle
//   - Notification scheduling (3-day, 7-day, advance warning)
//   - Booking restrictions (non-enterprise: automatic; enterprise: management approval)
//   - Payment recovery and automatic restriction removal
//   - Management exceptions and payment arrangements
//   - Commission protection (no commission on uncollected revenue)
//
// REUSES:
//   - b2bBillingEngine.ts (BILLING_STATUS, shouldApplyHold, shouldReleaseHold)
//   - b2bNotificationEngine.ts (notification templates)
//   - b2bGoverningContract.ts (isOrganizationOnHold, canConsumeWithContractStatus)
//   - b2bCommissionEngine.ts (commission based on collected revenue)
//   - B2BAuditLog (audit trail)
//   - Invoice entity (due_date, payment_status, b2b_organization_id)
//   - B2BContract entity (contract_type, status)
//   - B2BOrganization entity (contract_status, billing_contact_email)
//
// DOES NOT:
//   - Change commission percentages or introduce new compensation
//   - Delete accounts, cancel contracts, or impose late fees
//   - Store raw card information
//   - Modify Prepaid/Auto-Fund pricing or wallet rules
//   - Change existing customer contractual payment terms
// ============================================================================

import { BILLING_STATUS } from './b2bBillingEngine.ts';

// --- Customer classification → grace period mapping ---

export const CUSTOMER_CLASSIFICATION = {
  INDIVIDUAL_AGENT_SMALL_TEAM: 'individual_agent_small_team',
  SMALL_MIDSIZE_BROKERAGE: 'small_midsize_brokerage',
  LARGE_BROKERAGE_PROPERTY_MGMT: 'large_brokerage_property_mgmt',
  ENTERPRISE_DEVELOPER_CORPORATE: 'enterprise_developer_corporate',
} as const;

export const GRACE_PERIOD_DAYS: Record<string, number> = {
  [CUSTOMER_CLASSIFICATION.INDIVIDUAL_AGENT_SMALL_TEAM]: 7,
  [CUSTOMER_CLASSIFICATION.SMALL_MIDSIZE_BROKERAGE]: 14,
  [CUSTOMER_CLASSIFICATION.LARGE_BROKERAGE_PROPERTY_MGMT]: 21,
  [CUSTOMER_CLASSIFICATION.ENTERPRISE_DEVELOPER_CORPORATE]: 30,
};

/**
 * Map a B2B contract_type to a customer classification.
 * Returns null if classification is missing or ambiguous → flag for admin review.
 */
export function classifyCustomer(contractType: string | undefined | null): string | null {
  if (!contractType) return null;
  switch (contractType) {
    case 'business':
      return CUSTOMER_CLASSIFICATION.INDIVIDUAL_AGENT_SMALL_TEAM;
    case 'portfolio':
      return CUSTOMER_CLASSIFICATION.SMALL_MIDSIZE_BROKERAGE;
    case 'developer':
    case 'reserved_capacity':
      return CUSTOMER_CLASSIFICATION.LARGE_BROKERAGE_PROPERTY_MGMT;
    case 'enterprise':
    case 'custom_enterprise':
      return CUSTOMER_CLASSIFICATION.ENTERPRISE_DEVELOPER_CORPORATE;
    default:
      return null; // Ambiguous → admin review
  }
}

/**
 * Calculate the grace period (in days) for a customer classification.
 * Returns null if classification is missing/ambiguous → must flag for admin review.
 */
export function getGracePeriodDays(classification: string | null): number | null {
  if (!classification) return null;
  return GRACE_PERIOD_DAYS[classification] ?? null;
}

export function isEnterpriseClassification(classification: string | null): boolean {
  return classification === CUSTOMER_CLASSIFICATION.ENTERPRISE_DEVELOPER_CORPORATE;
}

// --- Delinquency status lifecycle ---

export const DELINQUENCY_STATUS = {
  NOT_YET_DUE: 'not_yet_due',           // Invoice issued, due date has not arrived
  PAYMENT_PENDING: 'payment_pending',   // Payment initiated but not confirmed
  PAYMENT_SUCCEEDED: 'payment_succeeded',// Payment confirmed
  PAYMENT_DECLINED: 'payment_declined',  // Payment attempt failed
  PAYMENT_OVERDUE: 'payment_overdue',    // Due date passed, payment not received
  RETRY_SCHEDULED: 'retry_scheduled',    // Payment retry scheduled
  RECOVERED: 'recovered',                // Payment received after delinquency
  GRACE_EXPIRED: 'grace_expired',        // Grace period expired without payment
  BOOKING_RESTRICTED: 'booking_restricted',// New bookings restricted
  EXCEPTION_APPROVED: 'exception_approved',// Management exception active
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',// Subscription canceled/terminated
} as const;

export type DelinquencyStatus = typeof DELINQUENCY_STATUS[keyof typeof DELINQUENCY_STATUS];

// --- Notification schedule ---

export const NOTIFICATION_MILESTONES = {
  DAY_3_AFTER_DUE: 3,     // First follow-up reminder ~3 days after due date
  DAY_7_AFTER_DUE: 7,     // Second follow-up reminder ~7 days after due date
  ADVANCE_WARNING_DAYS: 3, // Warning before grace expires (for longer grace periods)
} as const;

// --- Core calculation functions ---

export interface DelinquencyCalculation {
  delinquency_status: DelinquencyStatus;
  days_past_due: number;
  grace_period_days: number | null;
  grace_period_deadline: string | null; // ISO date
  grace_expired: boolean;
  classification: string | null;
  requires_admin_review: boolean;
  should_restrict_bookings: boolean;
  requires_enterprise_approval: boolean;
}

/**
 * Calculate the delinquency state of an invoice based on its due date,
 * payment status, and customer classification.
 *
 * This is the AUTHORITATIVE delinquency calculation. All other code should
 * call this function rather than implementing its own logic.
 */
export function calculateDelinquency(params: {
  invoice: {
    due_date?: string;
    payment_status?: string;
    invoice_type?: string;
    delinquency_status?: string;
    booking_restricted_at?: string;
    management_exception_status?: string;
    management_exception_expires_at?: string;
  };
  contract_type?: string | null;
  now?: string; // ISO datetime for testing; defaults to current time
}): DelinquencyCalculation {
  const now = params.now ? new Date(params.now) : new Date();
  const invoice = params.invoice;

  // If already paid, payment succeeded
  if (invoice.payment_status === 'paid') {
    return {
      delinquency_status: DELINQUENCY_STATUS.PAYMENT_SUCCEEDED,
      days_past_due: 0,
      grace_period_days: null,
      grace_period_deadline: null,
      grace_expired: false,
      classification: null,
      requires_admin_review: false,
      should_restrict_bookings: false,
      requires_enterprise_approval: false,
    };
  }

  // Classify customer
  const classification = classifyCustomer(params.contract_type);
  const gracePeriodDays = getGracePeriodDays(classification);
  const requiresAdminReview = classification === null;

  // No due date → can't calculate delinquency
  if (!invoice.due_date) {
    return {
      delinquency_status: DELINQUENCY_STATUS.NOT_YET_DUE,
      days_past_due: 0,
      grace_period_days: gracePeriodDays,
      grace_period_deadline: null,
      grace_expired: false,
      classification,
      requires_admin_review: requiresAdminReview,
      should_restrict_bookings: false,
      requires_enterprise_approval: false,
    };
  }

  const dueDate = new Date(invoice.due_date);
  const dueDateEndOfDay = new Date(dueDate);
  dueDateEndOfDay.setHours(23, 59, 59, 999);

  const msPastDue = now.getTime() - dueDateEndOfDay.getTime();
  const daysPastDue = msPastDue > 0 ? Math.floor(msPastDue / (1000 * 60 * 60 * 24)) : 0;

  // Not yet due
  if (daysPastDue <= 0) {
    // Check if payment was declined (failed charge before due date)
    if (invoice.delinquency_status === DELINQUENCY_STATUS.PAYMENT_DECLINED) {
      return {
        delinquency_status: DELINQUENCY_STATUS.PAYMENT_DECLINED,
        days_past_due: 0,
        grace_period_days: gracePeriodDays,
        grace_period_deadline: gracePeriodDays ? addDays(dueDate, gracePeriodDays) : null,
        grace_expired: false,
        classification,
        requires_admin_review: requiresAdminReview,
        should_restrict_bookings: false,
        requires_enterprise_approval: false,
      };
    }
    if (invoice.delinquency_status === DELINQUENCY_STATUS.RETRY_SCHEDULED) {
      return {
        delinquency_status: DELINQUENCY_STATUS.RETRY_SCHEDULED,
        days_past_due: 0,
        grace_period_days: gracePeriodDays,
        grace_period_deadline: gracePeriodDays ? addDays(dueDate, gracePeriodDays) : null,
        grace_expired: false,
        classification,
        requires_admin_review: requiresAdminReview,
        should_restrict_bookings: false,
        requires_enterprise_approval: false,
      };
    }
    return {
      delinquency_status: DELINQUENCY_STATUS.NOT_YET_DUE,
      days_past_due: 0,
      grace_period_days: gracePeriodDays,
      grace_period_deadline: gracePeriodDays ? addDays(dueDate, gracePeriodDays) : null,
      grace_expired: false,
      classification,
      requires_admin_review: requiresAdminReview,
      should_restrict_bookings: false,
      requires_enterprise_approval: false,
    };
  }

  // Past due — calculate grace deadline
  const graceDeadline = gracePeriodDays ? addDays(dueDate, gracePeriodDays) : null;
  const graceExpired = graceDeadline ? now.getTime() > graceDeadline.getTime() : false;

  // Check management exception
  const exceptionActive =
    invoice.management_exception_status === 'approved' &&
    invoice.management_exception_expires_at &&
    new Date(invoice.management_exception_expires_at).getTime() > now.getTime();

  if (exceptionActive) {
    return {
      delinquency_status: DELINQUENCY_STATUS.EXCEPTION_APPROVED,
      days_past_due: daysPastDue,
      grace_period_days: gracePeriodDays,
      grace_period_deadline: graceDeadline?.toISOString() || null,
      grace_expired: graceExpired,
      classification,
      requires_admin_review: requiresAdminReview,
      should_restrict_bookings: false, // Exception overrides restriction
      requires_enterprise_approval: false,
    };
  }

  // Already restricted
  if (invoice.booking_restricted_at) {
    return {
      delinquency_status: DELINQUENCY_STATUS.BOOKING_RESTRICTED,
      days_past_due: daysPastDue,
      grace_period_days: gracePeriodDays,
      grace_period_deadline: graceDeadline?.toISOString() || null,
      grace_expired: true,
      classification,
      requires_admin_review: requiresAdminReview,
      should_restrict_bookings: true,
      requires_enterprise_approval: isEnterpriseClassification(classification),
    };
  }

  // Grace expired but not yet restricted
  if (graceExpired) {
    const isEnterprise = isEnterpriseClassification(classification);
    return {
      delinquency_status: DELINQUENCY_STATUS.GRACE_EXPIRED,
      days_past_due: daysPastDue,
      grace_period_days: gracePeriodDays,
      grace_period_deadline: graceDeadline?.toISOString() || null,
      grace_expired: true,
      classification,
      requires_admin_review: requiresAdminReview,
      should_restrict_bookings: !isEnterprise, // Non-enterprise: auto-restrict; Enterprise: needs approval
      requires_enterprise_approval: isEnterprise,
    };
  }

  // Overdue but within grace period
  return {
    delinquency_status: DELINQUENCY_STATUS.PAYMENT_OVERDUE,
    days_past_due: daysPastDue,
    grace_period_days: gracePeriodDays,
    grace_period_deadline: graceDeadline?.toISOString() || null,
    grace_expired: false,
    classification,
    requires_admin_review: requiresAdminReview,
    should_restrict_bookings: false,
    requires_enterprise_approval: false,
  };
}

// --- Notification scheduling ---

export interface NotificationSchedule {
  send_3d_reminder: boolean;
  send_7d_reminder: boolean;
  send_advance_warning: boolean;
  send_restriction_notice: boolean;
  send_recovery_notice: boolean;
}

/**
 * Determine which notifications should be sent for an overdue invoice.
 * Uses existing reminder_1_sent_at / reminder_2_sent_at for retail invoices
 * and delinquency-specific fields for B2B invoices.
 */
export function calculateNotificationSchedule(params: {
  days_past_due: number;
  grace_period_days: number | null;
  grace_expired: boolean;
  was_recovered: boolean;
  reminder_3d_sent: boolean;
  reminder_7d_sent: boolean;
  restriction_warning_sent: boolean;
  restriction_notice_sent: boolean;
  recovery_notice_sent: boolean;
  is_enterprise: boolean;
}): NotificationSchedule {
  const d = params.days_past_due;
  const grace = params.grace_period_days ?? 0;

  return {
    // 3-day reminder: send once when days_past_due >= 3 and not already sent
    send_3d_reminder: d >= 3 && !params.reminder_3d_sent && !params.was_recovered,

    // 7-day reminder: send once when days_past_due >= 7 and not already sent
    send_7d_reminder: d >= 7 && !params.reminder_7d_sent && !params.was_recovered,

    // Advance warning: for grace periods > 14 days, send a warning 3 days before grace expires
    send_advance_warning:
      grace > 14 &&
      d >= (grace - NOTIFICATION_MILESTONES.ADVANCE_WARNING_DAYS) &&
      !params.restriction_warning_sent &&
      !params.grace_expired &&
      !params.was_recovered,

    // Restriction notice: send when restriction is first applied
    send_restriction_notice: params.grace_expired && !params.restriction_notice_sent && !params.was_recovered,

    // Recovery notice: send when payment is recovered
    send_recovery_notice: params.was_recovered && !params.recovery_notice_sent,
  };
}

// --- Booking restriction ---

export interface BookingRestrictionResult {
  restricted: boolean;
  reason: string;
  requires_enterprise_approval: boolean;
  existing_bookings_preserved: boolean;
}

/**
 * Determine if new bookings should be restricted for an organization.
 * Non-enterprise: automatic after grace expires.
 * Enterprise: requires explicit management approval.
 *
 * EXISTING paid bookings, completed jobs, and delivered media are ALWAYS preserved.
 */
export function evaluateBookingRestriction(calc: DelinquencyCalculation): BookingRestrictionResult {
  if (calc.delinquency_status === DELINQUENCY_STATUS.PAYMENT_SUCCEEDED ||
      calc.delinquency_status === DELINQUENCY_STATUS.RECOVERED ||
      calc.delinquency_status === DELINQUENCY_STATUS.NOT_YET_DUE ||
      calc.delinquency_status === DELINQUENCY_STATUS.EXCEPTION_APPROVED) {
    return { restricted: false, reason: 'ACCOUNT_CURRENT', requires_enterprise_approval: false, existing_bookings_preserved: true };
  }

  if (calc.delinquency_status === DELINQUENCY_STATUS.BOOKING_RESTRICTED) {
    return { restricted: true, reason: 'ALREADY_RESTRICTED', requires_enterprise_approval: calc.requires_enterprise_approval, existing_bookings_preserved: true };
  }

  if (calc.grace_expired && !calc.should_restrict_bookings && calc.requires_enterprise_approval) {
    return { restricted: false, reason: 'ENTERPRISE_REQUIRES_APPROVAL', requires_enterprise_approval: true, existing_bookings_preserved: true };
  }

  if (calc.should_restrict_bookings) {
    return { restricted: true, reason: 'GRACE_EXPIRED', requires_enterprise_approval: false, existing_bookings_preserved: true };
  }

  return { restricted: false, reason: 'WITHIN_GRACE', requires_enterprise_approval: false, existing_bookings_preserved: true };
}

// --- Payment recovery ---

export interface RecoveryResult {
  recovered: boolean;
  restrictions_removed: boolean;
  reason: string;
}

/**
 * Evaluate whether a confirmed payment should trigger recovery.
 * Removes eligible delinquency restrictions automatically unless a
 * separate management hold applies.
 */
export function evaluateRecovery(params: {
  payment_confirmed: boolean;
  currently_restricted: boolean;
  management_hold_active: boolean;
}): RecoveryResult {
  if (!params.payment_confirmed) {
    return { recovered: false, restrictions_removed: false, reason: 'PAYMENT_NOT_CONFIRMED' };
  }

  if (params.management_hold_active) {
    return { recovered: true, restrictions_removed: false, reason: 'MANAGEMENT_HOLD_PREVENTS_RESTORATION' };
  }

  if (params.currently_restricted) {
    return { recovered: true, restrictions_removed: true, reason: 'RESTRICTIONS_REMOVED' };
  }

  return { recovered: true, restrictions_removed: false, reason: 'ALREADY_CURRENT' };
}

// --- Commission protection ---

/**
 * Determine if commission should be generated for a billing event.
 * Commission is ONLY generated from confirmed qualifying COLLECTED revenue.
 * Uncollected implementation fees and unpaid subscription revenue do NOT generate commission.
 */
export function shouldGenerateCommission(params: {
  payment_confirmed: boolean;
  revenue_collected: number;
  sales_rep_active: boolean;
}): { generate: boolean; reason: string } {
  if (!params.sales_rep_active) {
    return { generate: false, reason: 'REP_INACTIVE_STOP_PAY' };
  }
  if (!params.payment_confirmed) {
    return { generate: false, reason: 'PAYMENT_NOT_CONFIRMED' };
  }
  if (params.revenue_collected <= 0) {
    return { generate: false, reason: 'NO_COLLECTED_REVENUE' };
  }
  return { generate: true, reason: 'ELIGIBLE' };
}

// --- Utility ---

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate the contractual due date from an invoice issue date and payment terms.
 * Supports Net 15, Net 30, Net 45, and custom day terms.
 * Does NOT change existing customer contracts — only calculates the due date
 * from the terms already in place.
 */
export function calculateDueDate(params: {
  issue_date: string;
  net_days: number; // 15, 30, 45, or custom
}): string {
  const issueDate = new Date(params.issue_date);
  return addDays(issueDate, params.net_days).toISOString().split('T')[0];
}

/**
 * Calculate the total outstanding balance for an organization across all
 * unpaid B2B invoices.
 */
export function calculateOutstandingBalance(invoices: any[]): {
  total_outstanding: number;
  invoice_count: number;
  oldest_past_due_date: string | null;
  days_past_due_max: number;
} {
  const unpaid = invoices.filter(
    (inv) => inv.payment_status === 'unpaid' && isB2BInvoice(inv.invoice_type)
  );
  const total = unpaid.reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const now = new Date();
  let oldestDate: string | null = null;
  let maxDaysPastDue = 0;

  for (const inv of unpaid) {
    if (inv.due_date) {
      const due = new Date(inv.due_date);
      const ms = now.getTime() - due.getTime();
      const days = ms > 0 ? Math.floor(ms / (1000 * 60 * 60 * 24)) : 0;
      if (days > maxDaysPastDue) maxDaysPastDue = days;
      if (!oldestDate || due.toISOString() < new Date(oldestDate).toISOString()) {
        oldestDate = inv.due_date;
      }
    }
  }

  return {
    total_outstanding: Math.round(total * 100) / 100,
    invoice_count: unpaid.length,
    oldest_past_due_date: oldestDate,
    days_past_due_max: maxDaysPastDue,
  };
}

function isB2BInvoice(invoiceType: string | undefined): boolean {
  return invoiceType === 'b2b_annual_contract' ||
    invoiceType === 'b2b_implementation' ||
    invoiceType === 'b2b_approved_overage';
}