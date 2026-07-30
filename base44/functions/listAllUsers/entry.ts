import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const users = await base44.asServiceRole.entities.User.list("-created_date", 500);
    return Response.json({ users: users || [] });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});