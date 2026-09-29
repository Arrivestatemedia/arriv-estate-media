import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, organization_id, actor } = body;

    if (action === 'advance_stage') {
      const { new_stage, notes } = body;
      const implOrders = await base44.asServiceRole.entities.B2BImplementationOrder.filter({ organization_id });
      const implOrder = implOrders[0];
      if (!implOrder) return Response.json({ status: 'ERROR', error: 'No implementation order' }, { status: 404 });

      // Update stages
      const stages = JSON.parse(implOrder.stages_json || '[]');
      const stageIdx = stages.findIndex((s: any) => s.stage === new_stage);
      if (stageIdx >= 0) {
        stages[stageIdx].status = 'complete';
        stages[stageIdx].completed_date = new Date().toISOString().split('T')[0];
        stages[stageIdx].notes = notes || '';
      }

      // Mark previous stages as complete
      for (let i = 0; i < stageIdx; i++) {
        if (stages[i].status !== 'complete') {
          stages[i].status = 'complete';
          stages[i].completed_date = new Date().toISOString().split('T')[0];
        }
      }

      // Determine next stage
      const nextStageIdx = stageIdx + 1;
      const nextStage = stages[nextStageIdx]?.stage;

      // Check if LIVE
      const goLive = new_stage === 'LIVE';

      await base44.asServiceRole.entities.B2BImplementationOrder.update(implOrder.id, {
        stages_json: JSON.stringify(stages),
        current_stage: nextStage || new_stage,
        status: goLive ? 'complete' : 'in_progress',
        go_live_ready: goLive,
        go_live_at: goLive ? new Date().toISOString() : undefined,
        completed_at: goLive ? new Date().toISOString() : undefined,
      });

      // Update org implementation status
      await base44.asServiceRole.entities.B2BOrganization.update(organization_id, {
        implementation_status: goLive ? 'complete' : 'in_progress',
        contract_status: goLive ? 'live' : undefined,
      });

      // If go-live, activate the contract
      if (goLive) {
        const contracts = await base44.asServiceRole.entities.B2BContract.filter({ organization_id });
        const contract = contracts.find((c: any) => c.status === 'implementing' || c.status === 'awaiting_payment');
        if (contract) {
          await base44.asServiceRole.entities.B2BContract.update(contract.id, { status: 'active', activated_at: new Date().toISOString() });
        }
      }

      await base44.asServiceRole.entities.B2BAuditLog.create({
        actor: actor || 'system',
        actor_type: 'admin',
        action: 'IMPLEMENTATION_STAGE_ADVANCED',
        reason: `Advanced to ${new_stage}`,
        entity_type: 'B2BImplementationOrder',
        entity_id: implOrder.id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'OK', data: { current_stage: nextStage || new_stage, go_live: goLive } });
    }

    if (action === 'get') {
      const implOrders = await base44.asServiceRole.entities.B2BImplementationOrder.filter({ organization_id });
      return Response.json({ status: 'OK', data: implOrders[0] || null });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});