import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeOrientationAudit, computeReadiness, isOrientationComplete } from "../../shared/salesOrientationEngine.ts";

// Employee-facing: advance a section of their own orientation. Scope-locked to
// the authenticated rep's ARRIV_EMPLOYEE_ID. Only the employee can complete
// employee-side items; employer/I-9 and final-review are gated to adminReview.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { sales_member_id, section, payload } = body;
    if (!sales_member_id) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
    if (!member) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const rows = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id: member.arriv_employee_id });
    const orientation = rows && rows[0];
    if (!orientation) return Response.json({ error: "No orientation found" }, { status: 404 });

    const now = new Date().toISOString();
    const update = { updated_at: now };
    let prevStatus = orientation.status;

    switch (section) {
      case "welcome":
        update.welcome_acknowledged_at = now;
        update.status = "in_progress";
        break;
      case "personal_info_submit":
        update.personal_info_status = "submitted";
        update.personal_info_submitted_at = now;
        break;
      case "i9_employee_complete":
        if (orientation.i9_status === "employee_section_not_started") {
          update.i9_status = "employee_section_complete";
          update.i9_employee_completed_at = now;
        }
        update.status = "awaiting_employer_verification";
        break;
      case "training_complete":
        update.training_status = "complete";
        update.training_completion_percent = 100;
        break;
      default:
        return Response.json({ error: "Unknown section" }, { status: 400 });
    }

    // Personal info submission triggers an employee sync to Arriv Payroll.
    if (section === "personal_info_submit") {
      try {
        const { enqueueSync, runSyncAttempt } = await import("../../shared/payrollEmployeeSync.ts");
        const queue = await enqueueSync(base44, { ...member }, "offer_accepted", ["legal_name_change","address_change","phone_change","personal_email_change"]);
        await runSyncAttempt(base44, queue);
        update.employee_record_synced = true;
      } catch (e) { /* best-effort */ }
    }

    await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, update);
    const refreshed = { ...orientation, ...update };
    if (isOrientationComplete(refreshed) && !refreshed.completed_at) {
      update.completed_at = now;
      update.status = "completed";
      await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, { completed_at: now, status: "completed" });
    }

    await writeOrientationAudit(base44, {
      arrivEmployeeId: member.arriv_employee_id,
      actor: member.email || "employee",
      role: "employee",
      action: `section_completed:${section}`,
      section,
      affectedRecord: orientation.orientation_id,
      previousStatus: prevStatus,
      newStatus: update.status || prevStatus,
    });

    return Response.json({ success: true, readiness: computeReadiness(refreshed), orientation: { ...refreshed, ...update } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});