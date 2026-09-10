import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const members = await base44.asServiceRole.entities.SalesTeamMember.list("-created_date", 500);
    return Response.json({ members: members || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});