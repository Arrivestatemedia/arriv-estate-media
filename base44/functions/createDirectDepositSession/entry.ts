import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { requestEnrollmentSession } from "../../shared/salesOrientationEngine.ts";

// Employee-facing: request a Stripe Connect direct-deposit onboarding session
// from Arriv Payroll. Arriv One never collects bank-account or routing numbers —
// the employee is redirected to the Stripe-hosted onboarding flow.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { sales_member_id, return_url } = body;
    if (!sales_member_id) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
    if (!member) return Response.json({ error: "Not authenticated" }, { status: 401 });
    if (!member.arriv_employee_id) return Response.json({ error: "Employee identity not established" }, { status: 400 });

    const rows = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id: member.arriv_employee_id });
    const orientation = rows && rows[0];
    if (!orientation) return Response.json({ error: "No orientation found" }, { status: 404 });

    const result = await requestEnrollmentSession(base44, orientation, "direct_deposit", return_url || "", member.email);
    if (result.error) return Response.json({ error: result.error }, { status: 502 });
    return Response.json({ success: true, enrollment_url: result.enrollment_url, session_id: result.session_id, expires_at: result.expires_at });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});