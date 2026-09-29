import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildBillingEnrollmentPayload, mapPayrollPaymentStatus, shouldApplyHold, shouldReleaseHold } from '../../shared/b2bBillingEngine.ts';
import { buildLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';
import { applyHold, releaseHold, sendToPayroll, hmacSign } from '../../shared/b2bBillingHelpers.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    if (action === 'enroll_monthly') {
      const { organization_id, actor } = body;
      const org = await base44.asServiceRole.entities.B2BOrganization.get(organization_id);
      if (!org) return Response.json({ status: 'ERROR', error: 'Organization not found' }, { status: 404 });

      const contracts = await base44.asServiceRole.entities.B2BContract.filter({ organization_id });
      const contract = contracts.find((c: any) => ['active', 'live', 'implementing', 'awaiting_payment'].includes(c.status));
      if (!contract) return Response.json({ status: 'ERROR', error: 'No active contract' }, { status: 400 });

      const lockedSnapshots = await buildLockedConfigSnapshots(base44.asServiceRole);
      const enrollment = buildBillingEnrollmentPayload(org, contract, lockedSnapshots);

      try {
        const payrollResponse = await sendToPayroll(base44, 'b2b_billing_enrollment', enrollment);
        return Response.json({ status: 'OK', data: { enrollment, payroll_response: payrollResponse } });
      } catch (payrollErr: any) {
        return Response.json({ status: 'PARTIAL', data: { enrollment, payroll_error: payrollErr.message } });
      }
    }

    if (action === 'receive_payment_status') {
      const { organization_id, contract_id, payment_status, days_past_due, idempotency_key } = body;

      const existingAudit = await base44.asServiceRole.entities.B2BAuditLog.filter({ entity_type: 'B2B_PAYMENT_STATUS', entity_id: idempotency_key });
      if (existingAudit.length > 0) return Response.json({ status: 'OK', data: { idempotent: true } });

      const mappedStatus = mapPayrollPaymentStatus(payment_status);

      const contract = await base44.asServiceRole.entities.B2BContract.get(contract_id);
      if (!contract) return Response.json({ status: 'ERROR', error: 'Contract not found' }, { status: 404 });

      const holdCheck = shouldApplyHold(mappedStatus, contract.status, 7, days_past_due || 0);
      if (holdCheck.apply_hold) {
        await applyHold(base44.asServiceRole, organization_id, contract_id, holdCheck.reason, idempotency_key);
      }

      const releaseCheck = shouldReleaseHold(mappedStatus, contract.status);
      if (releaseCheck.release) {
        await releaseHold(base44.asServiceRole, organization_id, contract_id, releaseCheck.reason, idempotency_key);
      }

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: 'arriv_payroll',
        actor_type: 'system',
        action: 'B2B_PAYMENT_STATUS',
        reason: `Payment status: ${mappedStatus}`,
        entity_type: 'B2B_PAYMENT_STATUS',
        entity_id: idempotency_key,
        after_snapshot: JSON.stringify({ organization_id, contract_id, payment_status: mappedStatus, days_past_due }),
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK', data: { mapped_status: mappedStatus, hold_applied: holdCheck.apply_hold, hold_released: releaseCheck.release } });
    }

    if (action === 'apply_hold') {
      const { organization_id, contract_id, reason, actor } = body;
      await applyHold(base44.asServiceRole, organization_id, contract_id, reason || 'MANUAL_HOLD', `manual_${Date.now()}`);
      return Response.json({ status: 'OK' });
    }

    if (action === 'release_hold') {
      const { organization_id, contract_id, actor } = body;
      await releaseHold(base44.asServiceRole, organization_id, contract_id, 'MANUAL_RELEASE', `manual_release_${Date.now()}`);
      return Response.json({ status: 'OK' });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});