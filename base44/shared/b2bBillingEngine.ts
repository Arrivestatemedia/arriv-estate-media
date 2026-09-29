// ============================================================================
// B2B BILLING ENGINE
//
// Manages B2B contractual billing integration with Arriv Payroll.
//
// MONTHLY customers:
//   Arriv Payroll manages recurring monthly billing, payment collection,
//   payment status, and billing reconciliation.
//
// ANNUAL PREPAID customers:
//   Arriv Estate Media creates the annual invoice immediately using the
//   existing invoice infrastructure, with a B2B source context adapter.
//
// Account hold behavior:
//   Non-payment → grace period → PAST_DUE → SUSPENDED (hold)
//   Payment cure → HOLD_RELEASED → access restored
//   Data is NEVER deleted during a hold.
// ============================================================================

import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export const BILLING_STATUS = {
  CURRENT: 'current',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_FAILED: 'payment_failed',
  PAST_DUE: 'past_due',
  CURED: 'cured',
  CANCELLED: 'cancelled',
} as const;

export const HOLD_EVENTS = {
  HOLD_APPLIED: 'HOLD_APPLIED',
  HOLD_RELEASED: 'HOLD_RELEASED',
} as const;

export interface BillingEnrollmentPayload {
  organization_id: string;
  contract_id: string;
  contract_version_id: string;
  billing_customer_id: string;
  sales_rep_id: string;
  billing_frequency: 'monthly' | 'annual_prepaid';
  monthly_amount: number;
  annual_amount?: number;
  contract_start: string;
  billing_day: number;
  commercial_snapshot_id: string;
  idempotency_key: string;
  organization_name: string;
  billing_contact_email: string;
  plan_id: string;
}

/**
 * Build a normalized B2B billing enrollment payload for Arriv Payroll.
 * This is sent when a monthly B2B contract is activated.
 */
export function buildBillingEnrollmentPayload(
  org: any,
  contract: any,
  lockedSnapshots: LockedConfigSnapshots,
  billingDay: number = 1
): BillingEnrollmentPayload {
  const plan = lockedSnapshots.plan.snapshot.plans.find((p: any) => p.plan_id === contract.plan_id);
  const monthlyAmount = contract.billing_frequency === 'annual_prepaid'
    ? (contract.annual_prepaid_price || 0) / 12
    : (contract.monthly_price || plan?.monthly_price || 0);

  return {
    organization_id: org.id,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id || '',
    billing_customer_id: org.id, // Use org ID as billing customer ID
    sales_rep_id: contract.sales_rep_id || org.assigned_sales_rep_id || '',
    billing_frequency: contract.billing_frequency || 'monthly',
    monthly_amount: Math.round(monthlyAmount * 100) / 100,
    annual_amount: contract.annual_prepaid_price || plan?.annual_prepaid_price,
    contract_start: contract.start_date || org.contract_start_date || new Date().toISOString().split('T')[0],
    billing_day: billingDay,
    commercial_snapshot_id: contract.commercial_snapshot_id || '',
    idempotency_key: `b2b_enroll_${contract.id}_${contract.contract_version_id || ''}`,
    organization_name: org.display_name || org.legal_name,
    billing_contact_email: org.billing_contact_email || '',
    plan_id: contract.plan_id,
  };
}

/**
 * Map a Payroll payment status to a B2B billing status.
 * Safely maps equivalent Payroll statuses.
 */
export function mapPayrollPaymentStatus(payrollStatus: string): string {
  const mapping: Record<string, string> = {
    'current': BILLING_STATUS.CURRENT,
    'paid': BILLING_STATUS.CURRENT,
    'active': BILLING_STATUS.CURRENT,
    'payment_pending': BILLING_STATUS.PAYMENT_PENDING,
    'pending': BILLING_STATUS.PAYMENT_PENDING,
    'processing': BILLING_STATUS.PAYMENT_PENDING,
    'payment_failed': BILLING_STATUS.PAYMENT_FAILED,
    'failed': BILLING_STATUS.PAYMENT_FAILED,
    'past_due': BILLING_STATUS.PAST_DUE,
    'delinquent': BILLING_STATUS.PAST_DUE,
    'cured': BILLING_STATUS.CURED,
    'restored': BILLING_STATUS.CURED,
    'cancelled': BILLING_STATUS.CANCELLED,
    'canceled': BILLING_STATUS.CANCELLED,
    'terminated': BILLING_STATUS.CANCELLED,
  };
  return mapping[payrollStatus?.toLowerCase()] || BILLING_STATUS.PAYMENT_PENDING;
}

/**
 * Determine if a billing status should trigger an account hold.
 * Only PAST_DUE beyond grace or explicit SUSPENDED triggers a hold.
 */
export function shouldApplyHold(
  billingStatus: string,
  contractStatus: string,
  gracePeriodDays: number = 7,
  daysPastDue: number = 0
): { apply_hold: boolean; reason: string } {
  // Explicit suspended contract
  if (contractStatus === 'suspended') {
    return { apply_hold: true, reason: 'CONTRACT_SUSPENDED' };
  }
  // Past due beyond grace period
  if (billingStatus === BILLING_STATUS.PAST_DUE && daysPastDue >= gracePeriodDays) {
    return { apply_hold: true, reason: 'PAST_DUE_BEYOND_GRACE' };
  }
  // Payment failed (not yet past due, but failed)
  if (billingStatus === BILLING_STATUS.PAYMENT_FAILED && daysPastDue >= gracePeriodDays) {
    return { apply_hold: true, reason: 'PAYMENT_FAILED_BEYOND_GRACE' };
  }
  return { apply_hold: false, reason: 'OK' };
}

/**
 * Determine if a hold should be released.
 * Called when a payment cure event is received from Payroll.
 */
export function shouldReleaseHold(
  billingStatus: string,
  contractStatus: string
): { release: boolean; reason: string } {
  if (billingStatus === BILLING_STATUS.CURED || billingStatus === BILLING_STATUS.CURRENT) {
    if (contractStatus === 'suspended' || contractStatus === 'past_due') {
      return { release: true, reason: 'PAYMENT_CURED' };
    }
  }
  return { release: false, reason: 'NOT_CURED' };
}

/**
 * Invoice source context for B2B invoices.
 * This adapter ensures B2B invoices are distinguishable from retail booking invoices.
 */
export const INVOICE_SOURCE = {
  RETAIL_BOOKING: 'retail_booking',
  B2B_ANNUAL_CONTRACT: 'b2b_annual_contract',
  B2B_IMPLEMENTATION: 'b2b_implementation',
  B2B_APPROVED_OVERAGE: 'b2b_approved_overage',
} as const;

/**
 * Build invoice metadata for a B2B annual contract invoice.
 */
export function buildB2BAnnualInvoiceMetadata(
  org: any,
  contract: any,
  lockedSnapshots: LockedConfigSnapshots
): {
  source: string;
  organization_id: string;
  contract_id: string;
  contract_version_id: string;
  plan_id: string;
  annual_amount: number;
  implementation_fee: number;
  deployment_fee: number;
  seat_charges: number;
  total_amount: number;
  description: string;
} {
  const plan = lockedSnapshots.plan.snapshot.plans.find((p: any) => p.plan_id === contract.plan_id);
  const implConfig = lockedSnapshots.implementation.snapshot;
  const seatConfig = lockedSnapshots.seats.snapshot;

  const annualAmount = contract.annual_prepaid_price || plan?.annual_prepaid_price || 0;
  const baseImplFee = plan?.base_implementation_fee || implConfig.base_implementation_fees?.[contract.contract_type] || 0;

  // Deployment fee based on initial user count
  const userCount = org.seat_counts?.included_full_seats || 10;
  const deploymentBand = implConfig.deployment_bands?.find((b: any) =>
    userCount >= b.min_users && (b.max_users === null || userCount <= b.max_users)
  ) || implConfig.deployment_bands?.[0];
  const deploymentFee = deploymentBand?.additional_fee || 0;

  // Seat charges (additional seats beyond included)
  const additionalFull = org.seat_counts?.additional_full_seats || 0;
  const additionalAdmin = org.seat_counts?.additional_admin_seats || 0;
  const bookingOnly = org.seat_counts?.booking_only_seats || 0;
  const seatCharges = (additionalFull * seatConfig.additional_full_seat_monthly * 12) +
    (additionalAdmin * seatConfig.additional_admin_seat_monthly * 12) +
    (bookingOnly * seatConfig.booking_only_seat_monthly * 12);

  const totalAmount = annualAmount + baseImplFee + deploymentFee + seatCharges;

  return {
    source: INVOICE_SOURCE.B2B_ANNUAL_CONTRACT,
    organization_id: org.id,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id || '',
    plan_id: contract.plan_id,
    annual_amount: annualAmount,
    implementation_fee: baseImplFee,
    deployment_fee: deploymentFee,
    seat_charges: seatCharges,
    total_amount: Math.round(totalAmount * 100) / 100,
    description: `${plan?.display_name || 'B2B'} Plan — Annual Prepaid Contract`,
  };
}