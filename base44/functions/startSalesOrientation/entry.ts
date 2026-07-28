import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { startOrientation, initiateSalesBackgroundCheck } from "../../shared/salesOrientationEngine.ts";

// Admin/owner trigger: start (or re-trigger) orientation for a W-2 sales rep.
// Idempotent — startOrientation no-ops if an orientation already exists.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let isAdmin = false;
    let callerSalesId = null;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === "admin";
    } catch (_e) {
      const body = await req.clone().json();
      if (body.sales_member_id) {
        callerSalesId = body.sales_member_id;
        const m = await base44.asServiceRole.entities.SalesTeamMember.get(body.sales_member_id);
        isAdmin = m?.role === "admin";
      }
    }
    if (!isAdmin) return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { sales_member_id, application_id, start_date, orientation_deadline, expected_first_payroll_date, manager, initiate_background_check = true } = body;
    if (!sales_member_id) return Response.json({ error: "sales_member_id is required" }, { status: 400 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
    if (!member) return Response.json({ error: "Sales team member not found" }, { status: 404 });

    const result = await startOrientation(base44, member, {
      applicationId: application_id || member.application_id || "",
      startDate: start_date,
      orientationDeadline: orientation_deadline,
      expectedFirstPayrollDate: expected_first_payroll_date,
      manager,
      actor: "admin",
      actorRole: "owner",
    });

    if (result.skipped) return Response.json({ success: true, skipped: true, orientation: result.orientation });

    // Kick the background check using the same Checkr process as media specialists.
    if (initiate_background_check && result.orientation) {
      try {
        await initiateSalesBackgroundCheck(base44, result.orientation, member);
      } catch (e) {
        console.error("background check start failed:", e.message);
      }
    }

    return Response.json({ success: true, orientation: result.orientation });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});