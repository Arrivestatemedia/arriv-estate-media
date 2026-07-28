import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeAuditLog } from "../../shared/payrollAudit.ts";

// Admin: review a mismatched reconciliation — record who reviewed it and resolution notes.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { reconciliation_id, resolution_notes } = body;
    if (!reconciliation_id) return Response.json({ error: "reconciliation_id is required" }, { status: 400 });

    const rows = await base44.asServiceRole.entities.PayrollReconciliation.filter({ reconciliation_id });
    const rec = rows && rows[0];
    if (!rec) return Response.json({ error: "Reconciliation not found" }, { status: 404 });

    const updated = await base44.asServiceRole.entities.PayrollReconciliation.update(rec.id, {
      reviewed_by: user.email || "admin",
      reviewed_at: new Date().toISOString(),
      resolution_notes: resolution_notes || "",
    });

    await writeAuditLog(base44, {
      actor: user.email || "admin",
      action: "payroll_reconciliation_reviewed",
      entityType: "PayrollReconciliation",
      entityId: rec.id,
      afterValues: { reviewed_by: user.email, resolution_notes: resolution_notes || "" },
      result: "success",
    });
    return Response.json({ success: true, reconciliation_id, reviewed_at: updated.reviewed_at });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});