import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getCommissionConfig, calculateImplementationCommission, calculateRecurringCommission, calculateAnnualCloseBonus, calculateRenewalBonus, calculateExpansionCommission, advanceTrancheLifecycle, stopTrancheForRepDeparture } from '../../shared/b2bCommissionEngine.ts';
import { getLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Read body ONCE — Deno body is a stream that can only be consumed once
    const body = await req.json();
    const { action } = body;

    if (action === 'create_implementation_commission') {
      const { contract_id, contract_version_id, organization_id, sales_rep_id, sales_rep_email, implementation_revenue, idempotency_key } = body;

      const lockedSnapshots = await getLockedConfigSnapshots(base44.asServiceRole, contract_version_id);
      const config = getCommissionConfig(lockedSnapshots);
      const calc = calculateImplementationCommission(config, implementation_revenue);

      const existing = await base44.asServiceRole.entities.B2BCommissionEvent.filter({ idempotency_key });
      if (existing.length > 0) return Response.json({ status: 'OK', data: { idempotent: true, event: existing[0] } });

      const event = await base44.asServiceRole.entities.B2BCommissionEvent.create({
        event_id: `b2bce_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        organization_id,
        contract_id,
        sales_rep_id,
        sales_rep_email,
        event_type: 'B2B_IMPLEMENTATION_COMMISSION',
        amount: calc.amount,
        commission_rate: calc.rate,
        commission_basis: calc.basis,
        source_record_type: 'implementation_order',
        commission_plan_version: lockedSnapshots.commission.version,
        idempotency_key,
        payroll_status: 'pending',
        eligible_at: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      return Response.json({ status: 'OK', data: event });
    }

    if (action === 'create_recurring_commission') {
      const { tranche_id, contract_id, organization_id, sales_rep_id, sales_rep_email, monthly_basis, lifecycle_month, idempotency_key } = body;

      const tranches = await base44.asServiceRole.entities.B2BCommissionTranche.filter({ tranche_id });
      const tranche = tranches[0];
      if (!tranche) return Response.json({ status: 'ERROR', error: 'Tranche not found' }, { status: 404 });

      const lockedSnapshots = await getLockedConfigSnapshots(base44.asServiceRole, tranche.commission_plan_version);
      const config = getCommissionConfig(lockedSnapshots);
      const calc = calculateRecurringCommission(config, monthly_basis, lifecycle_month);

      const existing = await base44.asServiceRole.entities.B2BCommissionEvent.filter({ idempotency_key });
      if (existing.length > 0) return Response.json({ status: 'OK', data: { idempotent: true, event: existing[0] } });

      const eventType = lifecycle_month <= 1 ? 'B2B_FIRST_MONTH_COMMISSION' : lifecycle_month <= 12 ? 'B2B_RECURRING_COMMISSION' : 'B2B_MATURE_RESIDUAL';

      const event = await base44.asServiceRole.entities.B2BCommissionEvent.create({
        event_id: `b2bce_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        tranche_id,
        organization_id,
        contract_id,
        sales_rep_id,
        sales_rep_email,
        event_type: eventType,
        amount: calc.amount,
        commission_rate: calc.rate,
        commission_basis: calc.basis,
        source_record_type: 'tranche',
        source_record_id: tranche_id,
        commission_plan_version: lockedSnapshots.commission.version,
        idempotency_key,
        payroll_status: 'pending',
        eligible_at: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      const advancement = advanceTrancheLifecycle(config, lifecycle_month, monthly_basis, tranche.tranche_kind);
      await base44.asServiceRole.entities.B2BCommissionTranche.update(tranche.id, {
        lifecycle_month: advancement.new_month,
        current_rate: advancement.new_rate,
      });

      return Response.json({ status: 'OK', data: event });
    }

    if (action === 'create_annual_close_bonus') {
      const { contract_id, contract_version_id, organization_id, sales_rep_id, sales_rep_email, first_year_value, billing_frequency, term_months, idempotency_key } = body;

      const lockedSnapshots = await getLockedConfigSnapshots(base44.asServiceRole, contract_version_id);
      const config = getCommissionConfig(lockedSnapshots);
      const calc = calculateAnnualCloseBonus(config, first_year_value, billing_frequency, term_months);

      const existing = await base44.asServiceRole.entities.B2BCommissionEvent.filter({ idempotency_key });
      if (existing.length > 0) return Response.json({ status: 'OK', data: { idempotent: true, event: existing[0] } });

      const event = await base44.asServiceRole.entities.B2BCommissionEvent.create({
        event_id: `b2bce_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        organization_id,
        contract_id,
        sales_rep_id,
        sales_rep_email,
        event_type: 'B2B_ANNUAL_CLOSE_BONUS',
        amount: calc.amount,
        commission_rate: calc.rate,
        commission_basis: calc.basis,
        source_record_type: 'contract',
        source_record_id: contract_id,
        commission_plan_version: lockedSnapshots.commission.version,
        idempotency_key,
        payroll_status: 'pending',
        eligible_at: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      return Response.json({ status: 'OK', data: event });
    }

    if (action === 'create_renewal_bonus') {
      const { renewal_id, contract_id, organization_id, sales_rep_id, sales_rep_email, renewed_acv, rep_active, idempotency_key } = body;

      const contract = await base44.asServiceRole.entities.B2BContract.get(contract_id);
      const lockedSnapshots = await getLockedConfigSnapshots(base44.asServiceRole, contract?.contract_version_id);
      const config = getCommissionConfig(lockedSnapshots);
      const calc = calculateRenewalBonus(config, renewed_acv, rep_active);

      const existing = await base44.asServiceRole.entities.B2BCommissionEvent.filter({ idempotency_key });
      if (existing.length > 0) return Response.json({ status: 'OK', data: { idempotent: true, event: existing[0] } });

      const event = await base44.asServiceRole.entities.B2BCommissionEvent.create({
        event_id: `b2bce_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        organization_id,
        contract_id,
        sales_rep_id,
        sales_rep_email,
        event_type: 'B2B_RENEWAL_BONUS',
        amount: calc.amount,
        commission_rate: calc.rate,
        commission_basis: calc.basis,
        source_record_type: 'renewal',
        source_record_id: renewal_id,
        commission_plan_version: lockedSnapshots.commission.version,
        idempotency_key,
        payroll_status: 'pending',
        eligible_at: calc.eligible ? new Date().toISOString().split('T')[0] : undefined,
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      return Response.json({ status: 'OK', data: event });
    }

    if (action === 'create_expansion_commission') {
      const { tranche_id, contract_id, organization_id, sales_rep_id, sales_rep_email, incremental_monthly_value, lifecycle_month, idempotency_key } = body;

      const contract = await base44.asServiceRole.entities.B2BContract.get(contract_id);
      const lockedSnapshots = await getLockedConfigSnapshots(base44.asServiceRole, contract?.contract_version_id);
      const config = getCommissionConfig(lockedSnapshots);
      const calc = calculateExpansionCommission(config, incremental_monthly_value, lifecycle_month);

      const existing = await base44.asServiceRole.entities.B2BCommissionEvent.filter({ idempotency_key });
      if (existing.length > 0) return Response.json({ status: 'OK', data: { idempotent: true, event: existing[0] } });

      const event = await base44.asServiceRole.entities.B2BCommissionEvent.create({
        event_id: `b2bce_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        tranche_id,
        organization_id,
        contract_id,
        sales_rep_id,
        sales_rep_email,
        event_type: 'B2B_EXPANSION_COMMISSION',
        amount: calc.amount,
        commission_rate: calc.rate,
        commission_basis: calc.basis,
        source_record_type: 'expansion_tranche',
        source_record_id: tranche_id,
        commission_plan_version: lockedSnapshots.commission.version,
        idempotency_key,
        payroll_status: 'pending',
        eligible_at: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      return Response.json({ status: 'OK', data: event });
    }

    if (action === 'stop_tranche_rep_departure') {
      const { tranche_id, reason, actor } = body;
      const tranches = await base44.asServiceRole.entities.B2BCommissionTranche.filter({ tranche_id });
      const tranche = tranches[0];
      if (!tranche) return Response.json({ status: 'ERROR', error: 'Tranche not found' }, { status: 404 });

      const stopResult = stopTrancheForRepDeparture();
      await base44.asServiceRole.entities.B2BCommissionTranche.update(tranche.id, {
        status: 'stopped_rep_departure',
        stopped_at: new Date().toISOString(),
        stop_reason: reason || 'REP_DEPARTURE',
      });

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'TRANCHE_STOPPED',
        reason: `Stopped tranche ${tranche_id} for rep departure`,
        entity_type: 'B2BCommissionTranche',
        entity_id: tranche.id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK', data: stopResult });
    }

    if (action === 'list_events') {
      const { organization_id, sales_rep_id } = body;
      const filter: any = {};
      if (organization_id) filter.organization_id = organization_id;
      if (sales_rep_id) filter.sales_rep_id = sales_rep_id;
      const events = await base44.asServiceRole.entities.B2BCommissionEvent.filter(filter, '-created_at', 50);
      return Response.json({ status: 'OK', data: events });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});