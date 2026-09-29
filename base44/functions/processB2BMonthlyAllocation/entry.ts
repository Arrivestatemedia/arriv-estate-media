import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { allocateB2BMediaCredits, allocateB2BCapacity, expireB2BMediaCreditPeriod, expireB2BCapacityPeriod } from '../../shared/b2bEntitlementEngine.ts';
import { getPlanMonthlyCredits, getFundingMode } from '../../shared/b2bContractVersionLock.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const results = { allocated: 0, expired: 0, errors: [] };

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const prevPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    // 1. Expire previous periods
    const prevCreditPeriods = await base44.asServiceRole.entities.B2BMediaCreditPeriod.filter({ status: 'active' });
    for (const p of prevCreditPeriods) {
      if (p.period_end < periodStart) {
        try {
          await expireB2BMediaCreditPeriod(base44.asServiceRole, {
            period_id: p.id, actor: 'system_monthly', idempotency_key: `expire_credit_${p.id}`,
          });
          results.expired++;
        } catch (e) {
          results.errors.push(`Expire credit ${p.id}: ${e.message}`);
        }
      }
    }

    const prevCapPeriods = await base44.asServiceRole.entities.B2BReservedCapacityPeriod.filter({ status: 'active' });
    for (const p of prevCapPeriods) {
      if (p.period_end < periodStart) {
        try {
          await expireB2BCapacityPeriod(base44.asServiceRole, {
            period_id: p.id, actor: 'system_monthly', idempotency_key: `expire_capacity_${p.id}`,
          });
          results.expired++;
        } catch (e) {
          results.errors.push(`Expire capacity ${p.id}: ${e.message}`);
        }
      }
    }

    // 2. Allocate new periods for active contracts
    const contracts = await base44.asServiceRole.entities.B2BContract.filter({ status: 'active' });
    const liveContracts = await base44.asServiceRole.entities.B2BContract.filter({ status: 'live' });
    const allActiveContracts = [...contracts, ...liveContracts];

    for (const contract of allActiveContracts) {
      const fundingMode = getFundingMode(contract.contract_type);
      const idempotencyKey = `monthly_${contract.id}_${periodStart}`;

      try {
        if (fundingMode === 'media_credit') {
          const lockedSnapshots = contract.contract_version_id
            ? await import('../../shared/b2bContractVersionLock.ts').then(m => m.getLockedConfigSnapshots(base44.asServiceRole, contract.contract_version_id))
            : null;
          const monthlyCredits = lockedSnapshots ? getPlanMonthlyCredits(lockedSnapshots, contract.plan_id) : 0;

          if (monthlyCredits > 0) {
            await allocateB2BMediaCredits(base44.asServiceRole, {
              organization_id: contract.organization_id,
              contract_id: contract.id,
              contract_version_id: contract.contract_version_id || '',
              period_start: periodStart,
              period_end: periodEnd,
              credits_allocated: monthlyCredits,
              config_version: lockedSnapshots?.media_credit.version || '',
              actor: 'system_monthly',
              idempotency_key: idempotencyKey,
            });
            results.allocated++;
          }
        } else if (fundingMode === 'reserved_capacity') {
          const org = await base44.asServiceRole.entities.B2BOrganization.get(contract.organization_id);
          const standard = org?.capacity_entitlement?.production_standard || 'essentials';
          const contractedShoots = org?.capacity_entitlement?.contracted_shoots || 40;

          await allocateB2BCapacity(base44.asServiceRole, {
            organization_id: contract.organization_id,
            contract_id: contract.id,
            contract_version_id: contract.contract_version_id || '',
            production_standard: standard,
            contracted_shoots: contractedShoots,
            period_start: periodStart,
            period_end: periodEnd,
            config_version: '',
            actor: 'system_monthly',
            idempotency_key: idempotencyKey,
          });
          results.allocated++;
        }
      } catch (e) {
        if (!e.message?.includes('already exists')) {
          results.errors.push(`Allocate ${contract.id}: ${e.message}`);
        }
      }
    }

    return Response.json({ status: 'OK', data: results });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});