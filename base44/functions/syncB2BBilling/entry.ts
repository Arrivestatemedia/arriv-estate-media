import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildBillingEnrollmentPayload, mapPayrollPaymentStatus, shouldApplyHold, shouldReleaseHold } from '../../shared/b2bBillingEngine.ts';
import { buildLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';
import { applyHold, releaseHold, sendToPayroll, fetchPaymentStatusFromPayroll } from '../../shared/b2bBillingHelpers.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const results = { enrolled: 0, payment_checked: 0, holds_applied: 0, holds_released: 0, errors: [] };

    // 1. Find all active/live B2B contracts
    const contracts = await base44.asServiceRole.entities.B2BContract.filter({});
    const activeContracts = contracts.filter((c: any) =>
      ['active', 'live', 'implementing', 'awaiting_payment'].includes(c.status)
    );

    const lockedSnapshots = await buildLockedConfigSnapshots(base44.asServiceRole);

    for (const contract of activeContracts) {
      try {
        const org = await base44.asServiceRole.entities.B2BOrganization.get(contract.organization_id);
        if (!org) continue;
        if (org.contract_status === 'suspended') continue;

        // Check if already enrolled
        const enrollmentAudits = await base44.asServiceRole.entities.B2BAuditLog.filter({
          entity_type: 'B2B_BILLING_ENROLLMENT',
          entity_id: contract.id,
        });

        if (enrollmentAudits.length === 0 && contract.billing_frequency === 'monthly') {
          try {
            const enrollment = buildBillingEnrollmentPayload(org, contract, lockedSnapshots);
            await sendToPayroll(base44, 'b2b_billing_enrollment', enrollment);
            await base44.asServiceRole.entities.B2BAuditLog.create({
              actor: 'system_billing_sync',
              actor_type: 'system',
              action: 'B2B_BILLING_ENROLLMENT',
              reason: `Auto-enrolled contract ${contract.contract_id} in monthly billing`,
              entity_type: 'B2B_BILLING_ENROLLMENT',
              entity_id: contract.id,
              timestamp: new Date().toISOString(),
            });
            results.enrolled++;
          } catch (enrollErr: any) {
            results.errors.push(`Enroll ${contract.contract_id}: ${enrollErr.message}`);
          }
        }

        // 2. Check payment status from payroll (if enrolled)
        if (enrollmentAudits.length > 0) {
          try {
            const paymentStatus = await fetchPaymentStatusFromPayroll(contract.contract_id);
            if (paymentStatus) {
              results.payment_checked++;
              const mappedStatus = mapPayrollPaymentStatus(paymentStatus.payment_status);
              const daysPastDue = paymentStatus.days_past_due || 0;

              const holdCheck = shouldApplyHold(mappedStatus, contract.status, 7, daysPastDue);
              if (holdCheck.apply_hold) {
                await applyHold(base44.asServiceRole, contract.organization_id, contract.id, holdCheck.reason, `sync_hold_${contract.id}_${Date.now()}`);
                results.holds_applied++;
              }

              const releaseCheck = shouldReleaseHold(mappedStatus, contract.status);
              if (releaseCheck.release) {
                await releaseHold(base44.asServiceRole, contract.organization_id, contract.id, releaseCheck.reason, `sync_release_${contract.id}_${Date.now()}`);
                results.holds_released++;
              }
            }
          } catch (payErr: any) {
            results.errors.push(`Payment check ${contract.contract_id}: ${payErr.message}`);
          }
        }
      } catch (e: any) {
        results.errors.push(`Contract ${contract.contract_id}: ${e.message}`);
      }
    }

    return Response.json({ status: 'OK', data: results });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});