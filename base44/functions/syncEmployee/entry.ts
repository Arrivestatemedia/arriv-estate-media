import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { ensureEmployeeId, enqueueSync, runSyncAttempt } from "../../shared/payrollEmployeeSync.ts";
import { writeAuditLog } from "../../shared/payrollAudit.ts";

// Admin-invoked employee synchronization. Triggers on offer accepted, employment status
// change, profile changes, commission plan/rate changes, termination, and Stripe changes.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { sales_member_id, event_type, changed_fields } = body;
    if (!sales_member_id) return Response.json({ error: "sales_member_id is required" }, { status: 400 });
    if (!event_type) return Response.json({ error: "event_type is required" }, { status: 400 });

    const member = await base44.asServiceRole.entities.SalesTeamMember.get(sales_member_id);
    if (!member) return Response.json({ error: "Sales team member not found" }, { status: 404 });

    // Assign immutable ARRIV_EMPLOYEE_ID if this is the first sync
    const withId = await ensureEmployeeId(base44, member);

    // Increment source record version for change events (not for the initial offer/activation)
    const initialEvents = ["offer_accepted", "employee_activated"];
    let versioned = withId;
    if (!initialEvents.includes(event_type)) {
      const nextVersion = (withId.source_record_version || 1) + 1;
      await base44.asServiceRole.entities.SalesTeamMember.update(withId.id, {
        source_record_version: nextVersion,
        payroll_sync_status: "syncing",
      });
      versioned = { ...withId, source_record_version: nextVersion };
    }

    const queueRecord = await enqueueSync(base44, versioned, event_type, changed_fields || []);
    const result = await runSyncAttempt(base44, queueRecord);

    await writeAuditLog(base44, {
      actor: user.email || "admin",
      action: `employee_sync_triggered:${event_type}`,
      entityType: "SalesTeamMember",
      entityId: sales_member_id,
      afterValues: { arriv_employee_id: versioned.arriv_employee_id, source_record_version: versioned.source_record_version },
      destinationApplication: "arriv_payroll",
      result: result.ok ? "success" : result.nonRetryable ? "failure" : "warning",
    });

    return Response.json({
      success: true,
      arriv_employee_id: versioned.arriv_employee_id,
      source_record_version: versioned.source_record_version,
      sync_status: result.terminal ? (result.ok ? "synchronized" : "failed") : "queued_for_retry",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});