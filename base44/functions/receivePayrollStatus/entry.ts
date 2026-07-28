import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { verifySignature } from "../../shared/payrollCrypto.ts";

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

    const {
      compensation_import_id,
      source_record_id,
      payroll_status,
      pay_period_id,
      pay_date,
      payment_reference,
      net_pay,
      timestamp,
    } = data;

    if (!compensation_import_id && !source_record_id) {
      return Response.json({ error: "compensation_import_id or source_record_id is required" }, { status: 400 });
    }

    const allowed = ["accepted", "scheduled", "processed", "paid", "voided", "corrected", "rejected"];
    if (!allowed.includes(payroll_status)) {
      return Response.json({ error: `Invalid payroll_status: ${payroll_status}` }, { status: 400 });
    }

    // Locate the commission record by source_record_id first, then by compensation_import_id
    let commission = null;
    if (source_record_id) {
      try {
        commission = await base44.asServiceRole.entities.Commission.get(source_record_id);
      } catch {
        commission = null;
      }
    }
    if (!commission && compensation_import_id) {
      const rows = await base44.asServiceRole.entities.Commission.filter({
        payroll_compensation_import_id: compensation_import_id,
      });
      commission = rows && rows[0] ? rows[0] : null;
    }
    if (!commission) return Response.json({ error: "Commission not found" }, { status: 404 });

    const update = {
      payroll_status,
      payroll_last_synced_at: new Date().toISOString(),
    };
    if (compensation_import_id) update.payroll_compensation_import_id = compensation_import_id;
    if (pay_period_id) update.payroll_pay_period_id = pay_period_id;
    if (pay_date) update.scheduled_pay_date = pay_date;
    if (payment_reference) update.payment_reference = payment_reference;
    if (typeof net_pay === "number") update.net_pay = net_pay;
    if (timestamp) update.payroll_last_synced_at = timestamp;

    // A correction bumps the version so the next send produces a fresh idempotency key
    if (payroll_status === "corrected") {
      update.compensation_version = (commission.compensation_version || 1) + 1;
      update.payroll_sync_error = "";
    } else if (payroll_status === "rejected" || payroll_status === "voided") {
      update.payroll_sync_error = `Payroll status: ${payroll_status}`;
    } else {
      update.payroll_sync_error = "";
    }

    await base44.asServiceRole.entities.Commission.update(commission.id, update);
    return Response.json({ success: true, commission_id: commission.id, payroll_status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});