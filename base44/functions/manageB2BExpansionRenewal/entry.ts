import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    if (action === 'create_expansion') {
      const { organization_id, source_contract_id, expansion_type, incremental_monthly_value, effective_date, actor } = body;

      // Get source contract
      const sourceContract = await base44.asServiceRole.entities.B2BContract.get(source_contract_id);
      if (!sourceContract) return Response.json({ status: 'ERROR', error: 'Source contract not found' }, { status: 404 });

      // Create expansion record
      const expansion = await base44.asServiceRole.entities.B2BContractExpansion.create({
        expansion_id: `b2bexp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        organization_id,
        source_contract_id,
        expansion_type,
        incremental_monthly_value,
        effective_date,
        snapshot_json: JSON.stringify({ incremental_monthly_value, expansion_type }),
        status: 'active',
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      // Create a new independent commission tranche for the expansion
      const lockedSnapshots = sourceContract.contract_version_id
        ? await import('../../shared/b2bContractVersionLock.ts').then(m => m.getLockedConfigSnapshots(base44.asServiceRole, sourceContract.contract_version_id))
        : null;

      if (lockedSnapshots) {
        const commissionConfig = await import('../../shared/b2bCommissionEngine.ts').then(m => m.getCommissionConfig(lockedSnapshots));
        const tranche = await base44.asServiceRole.entities.B2BCommissionTranche.create({
          tranche_id: `b2btrn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          source_contract_id: source_contract_id,
          source_expansion_id: expansion.id,
          organization_id,
          sales_rep_id: sourceContract.sales_rep_id || '',
          sales_rep_email: sourceContract.sales_rep_email || '',
          effective_date,
          monthly_commission_basis: incremental_monthly_value,
          lifecycle_month: 1, // Expansion starts at month 1 — ages independently
          current_rate: commissionConfig.expansion.first_month_rate,
          commission_plan_version: lockedSnapshots.commission.version,
          status: 'active',
          tranche_kind: 'expansion',
          created_at: new Date().toISOString(),
        });

        await base44.asServiceRole.entities.B2BContractExpansion.update(expansion.id, {
          commission_tranche_id: tranche.id,
        });
      }

      // Audit log
      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'EXPANSION_CREATED',
        reason: `Expansion: ${expansion_type}, +$${incremental_monthly_value}/month`,
        entity_type: 'B2BContractExpansion',
        entity_id: expansion.id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK', data: expansion });
    }

    if (action === 'create_renewal') {
      const { organization_id, source_contract_id, renewed_acv, new_start_date, new_term_months, rep_active, actor } = body;

      const sourceContract = await base44.asServiceRole.entities.B2BContract.get(source_contract_id);
      if (!sourceContract) return Response.json({ status: 'ERROR', error: 'Source contract not found' }, { status: 404 });

      // Create renewal record
      const renewal = await base44.asServiceRole.entities.B2BContractRenewal.create({
        renewal_id: `b2brenew_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        organization_id,
        source_contract_id,
        renewed_acv,
        new_start_date,
        new_term_months,
        snapshot_json: JSON.stringify({ renewed_acv, new_start_date, new_term_months }),
        status: 'active',
        created_at: new Date().toISOString(),
        immutable_snapshot: true,
      });

      // Create renewal bonus commission event
      if (rep_active && sourceContract.sales_rep_id) {
        await base44.asServiceRole.functions.invoke('manageB2BCommission', {
          action: 'create_renewal_bonus',
          renewal_id: renewal.id,
          contract_id: source_contract_id,
          organization_id,
          sales_rep_id: sourceContract.sales_rep_id,
          sales_rep_email: sourceContract.sales_rep_email || '',
          renewed_acv,
          rep_active,
          idempotency_key: `renewal_bonus_${renewal.id}`,
        });
      }

      // Create B2BRenewalBonus record
      if (rep_active) {
        const bonusRate = 0.01;
        const bonusCap = 2500;
        const rawBonus = renewed_acv * bonusRate;
        const finalBonus = Math.min(rawBonus, bonusCap);

        await base44.asServiceRole.entities.B2BRenewalBonus.create({
          bonus_id: `b2brb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          renewal_id: renewal.id,
          contract_id: source_contract_id,
          organization_id,
          sales_rep_id: sourceContract.sales_rep_id,
          sales_rep_email: sourceContract.sales_rep_email || '',
          renewed_acv,
          bonus_rate: bonusRate,
          calculated_bonus: rawBonus,
          cap: bonusCap,
          final_bonus: finalBonus,
          rep_active,
          eligibility: 'eligible',
          payment_status: 'pending',
          created_at: new Date().toISOString(),
          immutable_snapshot: true,
        });
      }

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'RENEWAL_CREATED',
        reason: `Renewal: $${renewed_acv} ACV`,
        entity_type: 'B2BContractRenewal',
        entity_id: renewal.id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK', data: renewal });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});