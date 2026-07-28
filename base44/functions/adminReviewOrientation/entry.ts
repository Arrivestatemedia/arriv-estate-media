import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeOrientationAudit, computeReadiness, isOrientationComplete } from "../../shared/salesOrientationEngine.ts";

// Owner/HR actions on an orientation: I-9 employer verification, final review,
// payroll holds, and manual background-check result entry. Admin-gated.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let isAdmin = false;
    let actorEmail = "admin";
    let callerSalesId = null;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === "admin";
      actorEmail = user?.email || "admin";
    } catch (_e) {
      const body0 = await req.clone().json();
      if (body0.sales_member_id) {
        callerSalesId = body0.sales_member_id;
        const m = await base44.asServiceRole.entities.SalesTeamMember.get(body0.sales_member_id);
        isAdmin = m?.role === "admin";
        actorEmail = m?.email || "admin";
      }
    }
    if (!isAdmin) return Response.json({ error: "Admin access required" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { orientation_id, action, i9_reverification_date, hold_reason, background_result } = body;
    if (!orientation_id) return Response.json({ error: "orientation_id is required" }, { status: 400 });

    const rows = await base44.asServiceRole.entities.SalesOrientation.filter({ orientation_id });
    const orientation = rows && rows[0];
    if (!orientation) return Response.json({ error: "Orientation not found" }, { status: 404 });

    const now = new Date().toISOString();
    const update = { updated_at: now };
    let prev = orientation.status;
    let section = "";

    switch (action) {
      case "i9_employer_complete":
        update.i9_status = "employer_review_complete";
        update.i9_employer_reviewer_id = actorEmail;
        update.i9_employer_completed_at = now;
        section = "i9";
        break;
      case "i9_complete":
        update.i9_status = "complete";
        update.i9_employer_reviewer_id = actorEmail;
        update.i9_employer_completed_at = now;
        section = "i9";
        break;
      case "i9_reverification":
        update.i9_status = "reverification_required";
        update.i9_reverification_date = i9_reverification_date || "";
        section = "i9";
        break;
      case "i9_reject":
        update.i9_status = "rejected";
        section = "i9";
        break;
      case "final_approve":
        update.final_review_status = "approved";
        update.final_reviewed_by = actorEmail;
        update.final_reviewed_at = now;
        section = "final_review";
        break;
      case "final_reject":
        update.final_review_status = "rejected";
        update.final_reviewed_by = actorEmail;
        update.final_reviewed_at = now;
        section = "final_review";
        break;
      case "hold_apply":
        update.payroll_hold = true;
        update.payroll_hold_reason = hold_reason || "";
        section = "payroll_hold";
        break;
      case "hold_release":
        update.payroll_hold = false;
        update.payroll_hold_reason = "";
        section = "payroll_hold";
        break;
      case "background_result":
        update.background_check_status = background_result === "clear" ? "clear" : "failed";
        update.background_check_completed_at = now;
        section = "background_check";
        break;
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, update);
    const refreshed = { ...orientation, ...update };
    if (isOrientationComplete(refreshed) && !refreshed.completed_at) {
      await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, { completed_at: now, status: "completed" });
      update.completed_at = now;
      update.status = "completed";
    }

    await writeOrientationAudit(base44, {
      arrivEmployeeId: orientation.arriv_employee_id,
      actor: actorEmail,
      role: "owner",
      action: `admin:${action}`,
      section,
      affectedRecord: orientation.orientation_id,
      previousStatus: prev,
      newStatus: update.status || prev,
    });

    return Response.json({ success: true, orientation: { ...refreshed, ...update }, readiness: computeReadiness({ ...refreshed, ...update }) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});