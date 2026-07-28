import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const reps = await base44.asServiceRole.entities.SalesTeamMember.filter(
      { is_active: true },
      "full_name",
      500
    );
    return Response.json({
      reps: (reps || []).map((r) => ({ id: r.id, full_name: r.full_name, email: r.email })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});