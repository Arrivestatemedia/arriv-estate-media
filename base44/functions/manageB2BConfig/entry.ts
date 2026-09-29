import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runMarginGuard } from '../../shared/b2bConfigManager.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, config_type, config_version, config_json, admin_threshold, hard_block, actor, change_reason } = await req.json();

    if (action === 'publish') {
      const configSnapshot = JSON.parse(config_json);
      const guardResult = runMarginGuard({
        config_type,
        config_version,
        config_snapshot: configSnapshot,
        admin_threshold: admin_threshold || 15,
        hard_block: hard_block ?? false,
        evaluated_by: actor || 'admin',
      });

      await base44.asServiceRole.entities.B2BMarginGuard.create({
        guard_id: guardResult.guard_id,
        config_version,
        config_type,
        worst_case_economics_json: JSON.stringify(guardResult.margin_result),
        margin_result: guardResult.margin_result,
        admin_threshold: guardResult.admin_threshold,
        warning_triggered: guardResult.warning_triggered,
        hard_block: guardResult.hard_block,
        blocked: guardResult.blocked,
        evaluated_at: guardResult.evaluated_at,
        evaluated_by: guardResult.evaluated_by,
        created_at: new Date().toISOString(),
      });

      if (guardResult.blocked) {
        return Response.json({ status: 'BLOCKED', data: guardResult, message: 'Margin guard blocked configuration publication' });
      }

      const entityMap: Record<string, string> = {
        plan: 'B2BPlanConfig',
        capacity: 'B2BReservedCapacityConfig',
        credit: 'B2BMediaCreditConfig',
        seat: 'B2BSeatConfig',
        implementation: 'B2BImplementationConfig',
        commission: 'B2BCommissionPlan',
        sqft_surcharge: 'B2BSqftSurchargeConfig',
      };
      const entityName = entityMap[config_type];
      if (entityName) {
        const existing = await base44.asServiceRole.entities[entityName].filter({ is_active: true });
        for (const e of existing) {
          await base44.asServiceRole.entities[entityName].update(e.id, { is_active: false, expires_at: new Date().toISOString() });
        }

        await base44.asServiceRole.entities[entityName].create({
          config_version,
          is_active: true,
          effective_date: new Date().toISOString().split('T')[0],
          config_json,
          activated_at: new Date().toISOString(),
          activated_by: actor || 'admin',
          change_reason: change_reason || '',
        });
      }

      return Response.json({ status: 'OK', data: { guard: guardResult, published: true } });
    }

    if (action === 'margin_check') {
      const configSnapshot = JSON.parse(config_json);
      const guardResult = runMarginGuard({
        config_type,
        config_version,
        config_snapshot: configSnapshot,
        admin_threshold: admin_threshold || 15,
        hard_block: hard_block ?? false,
        evaluated_by: actor || 'admin',
      });
      return Response.json({ status: 'OK', data: guardResult });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});