import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { initiateSalesBackgroundCheck } from "../../shared/salesOrientationEngine.ts";

// Employee-facing: start (or reuse) the Checkr background check for the
// authenticated rep. Mirrors the media-specialist flow.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { sales_member_id } = body;
    if (!sales_member_id) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
    if (!member) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const rows = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id: member.arriv_employee_id });
    const orientation = rows && rows[0];
    if (!orientation) return Response.json({ error: "No orientation found" }, { status: 404 });

    const result = await initiateSalesBackgroundCheck(base44, orientation, member);
    if (result.error) return Response.json({ error: result.error }, { status: 502 });
    return Response.json({ success: true, invitation_url: result.invitation_url, manual: !!result.manual, alreadyCleared: !!result.alreadyCleared });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});