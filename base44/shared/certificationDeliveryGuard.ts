/**
 * Certification Delivery Guard
 *
 * Unconditional exclusion of synthetic certification records from real
 * Arriv Pay / Payroll delivery workflows. This guard is evaluated BEFORE
 * any feature-flag check, HTTP request, batch inclusion, retry, or manual
 * delivery attempt. It can never be bypassed by flag state, batch size,
 * retry count, or admin action.
 *
 * A record is synthetic if ANY of these are true:
 *   1. certification_mode === true (explicit boolean flag)
 *   2. cert_ prefix on any key identifier (source_event_id, payment_event_id,
 *      transaction_id, customer_id, customer_email, lot_id, organization_id,
 *      employee_id, employee_email, deal_id, sale_id, invoice_id)
 *
 * When a synthetic record is encountered in a delivery path:
 *   - No HTTP request is sent to any real payroll endpoint
 *   - No delivery_status transition to DELIVERED or ACKNOWLEDGED occurs
 *   - The record stays in its current state (PENDING / RETRYING / etc.)
 *   - A BLOCKED result is returned with a clear reason
 *
 * This guard preserves normal delivery for legitimate production commissions:
 * records without certification metadata or cert_ identifiers pass through
 * unchanged.
 */

import { isSyntheticRecord, isCertificationId } from './certificationMode.ts';

export interface DeliveryGuardResult {
  blocked: boolean;
  reason: string;
  record_id?: string;
}

/**
 * Evaluate whether a record should be blocked from real payroll delivery.
 * Returns { blocked: true } for any synthetic certification record.
 */
export function checkDeliveryGuard(record: any | null | undefined): DeliveryGuardResult {
  if (!record) {
    return { blocked: false, reason: 'No record provided' };
  }
  if (isSyntheticRecord(record)) {
    return {
      blocked: true,
      reason: 'Synthetic certification record excluded from real payroll delivery',
      record_id: record.id || record.source_event_id || record.payment_event_id || '',
    };
  }
  // Also check employee identifiers for commission/compensation events
  const employeeId = record.employee_id || record.employee_email || '';
  if (isCertificationId(employeeId)) {
    return {
      blocked: true,
      reason: 'Synthetic certification employee excluded from real payroll delivery',
      record_id: record.id || '',
    };
  }
  // Check deal/sale/invoice identifiers for sales commission paths
  const dealId = record.deal_id || record.sale_id || record.invoice_id || '';
  if (isCertificationId(dealId)) {
    return {
      blocked: true,
      reason: 'Synthetic certification deal/sale excluded from real payroll delivery',
      record_id: record.id || '',
    };
  }
  return { blocked: false, reason: 'Production record — delivery permitted' };
}

/**
 * Filter a batch of records, separating synthetic (blocked) from real (deliverable).
 */
export function partitionByDeliveryGuard(records: any[]): {
  deliverable: any[];
  blocked: any[];
} {
  const deliverable: any[] = [];
  const blocked: any[] = [];
  for (const record of records) {
    const guard = checkDeliveryGuard(record);
    if (guard.blocked) {
      blocked.push(record);
    } else {
      deliverable.push(record);
    }
  }
  return { deliverable, blocked };
}