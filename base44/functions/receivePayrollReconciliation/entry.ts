import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { verifySignature } from "../../shared/payrollCrypto.ts";
import { reconcilePeriod } from "../../shared/payrollReconciliationEngine.ts";
import { writeAuditLog } from "../../shared/payrollAudit.ts";

// Webhook: Arriv Payroll returns its independently recalculated per-employee gross
// after a submission. We reconcile each employee against what Arriv One submitted,
// drive the period to payroll_validated / correction_required, and audit the result.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const rawBody = await req.text();
    const signature = req.headers.get("X-Arriv-Signature") || "";
    const webhookSecret = Deno.env.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";

    if (!webhookSecret) return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
    const valid = await verifySignature(webhookSecret, rawBody, signature);
    if (!valid) return Response.json({ error: "Invalid signature" }, { status: 401 });

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = await reconcilePeriod(base44, data);

    await writeAuditLog(base44, {
      actor: "arriv_payroll",
      action: result.all_matched ? "payroll_reconciliation_matched" : "payroll_reconciliation_mismatched",
      entityType: "PayrollPeriod",
      entityId: result.pay_period_id,
      destinationApplication: null,
      sourceApplication: "arriv_payroll",
      afterValues: result,
      result: result.all_matched ? "success" : "warning",
    });

    return Response.json(result, result.error ? { status: 400 } : undefined);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});