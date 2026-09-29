import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { getLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Idempotency check
    const existing = await base44.asServiceRole.entities.B2BContractOverage.filter({
      idempotency_key: body.idempotency_key,
    });
    if (existing.length > 0) {
      return Response.json({ idempotent: true, overage: existing[0] });
    }

    let lockedSnapshotRef = '{}';
    if (body.contract_version_id) {
      try {
        const snapshots = await getLockedConfigSnapshots(base44.asServiceRole, body.contract_version_id);
        lockedSnapshotRef = JSON.stringify({
          plan_version: snapshots.plan.version,
          capacity_version: snapshots.reserved_capacity.version,
          credit_version: snapshots.media_credit.version,
        });
      } catch {}
    }

    const overage = await base44.asServiceRole.entities.B2BContractOverage.create({
      overage_id: `b2bovg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organization_id: body.organization_id,
      contract_id: body.contract_id,
      contract_version_id: body.contract_version_id,
      period_id: body.period_id,
      period_type: body.period_type || 'capacity',
      booking_id: body.booking_id,
      booking_reference: body.booking_reference,
      overage_type: body.overage_type,
      shoots_over: body.shoots_over || 0,
      quantity: body.quantity || 0,
      contracted_per_shoot_rate: body.contracted_per_shoot_rate || 0,
      overage_rate_multiplier: body.overage_rate_multiplier || 1.10,
      overage_per_shoot_rate: body.overage_per_shoot_rate || 0,
      overage_amount: body.overage_amount,
      unit_economics: body.unit_economics || '',
      locked_config_snapshot: lockedSnapshotRef,
      snapshot_json: body.snapshot_json || '{}',
      status: 'created',
      idempotency_key: body.idempotency_key,
      created_at: new Date().toISOString(),
    });

    return Response.json({ success: true, overage });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});