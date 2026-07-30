import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "list": {
        const goals = await base44.asServiceRole.entities.SalesGoal.list("-created_date", 200);
        const members = await base44.asServiceRole.entities.SalesTeamMember.list();
        const memberMap = {};
        for (const m of members) memberMap[m.id] = m.full_name;
        const enriched = (goals || []).map((g) => ({
          id: g.id,
          metric: g.metric,
          period: g.period,
          target: g.target_value,
          assignee_name: g.sales_member_id ? memberMap[g.sales_member_id] || null : null,
        }));
        return Response.json({ goals: enriched });
      }
      case "create": {
        const goal = await base44.asServiceRole.entities.SalesGoal.create({
          metric: body.metric,
          period: body.period,
          target_value: Number(body.target) || 0,
          sales_member_id: body.assignee_id || null,
          is_active: true,
        });
        return Response.json({ goal });
      }
      case "delete": {
        await base44.asServiceRole.entities.SalesGoal.delete(body.id);
        return Response.json({ ok: true });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});