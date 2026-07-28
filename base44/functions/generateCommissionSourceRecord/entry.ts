import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { generateSourceRecord, computeClearanceDate } from "../../shared/commissionSourceEngine.ts";
import { writeAuditLog } from "../../shared/payrollAudit.ts";

// Generates a CommissionSourceRecord when a client invoice is paid. Idempotent.
// Invoked from processPaymentConfirmation (and as a safety net by processCommissionEligibility).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { invoiceId } = body;
    if (!invoiceId) return Response.json({ error: "invoiceId is required" }, { status: 400 });

    const invoice = await base44.asServiceRole.entities.Invoice.get(invoiceId);
    if (!invoice) return Response.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.payment_status !== "paid") {
      return Response.json({ skipped: true, reason: "invoice not paid" });
    }

    const clearance = await computeClearanceDate(base44, invoice);
    const record = await generateSourceRecord(base44, invoice, clearance);
    if (!record) {
      return Response.json({ skipped: true, reason: "no sales rep attributed to this invoice" });
    }

    await writeAuditLog(base44, {
      actor: "system",
      action: "commission_source_record_generated",
      entityType: "CommissionSourceRecord",
      entityId: record.id,
      afterValues: {
        arriv_employee_id: record.arriv_employee_id,
        invoice_id: invoice.id,
        commissionable_amount: record.commissionable_amount,
        calculated_commission_amount: record.calculated_commission_amount,
        payment_cleared_date: record.payment_cleared_date,
        payroll_inclusion_status: record.payroll_inclusion_status,
      },
      result: "success",
    });

    return Response.json({
      success: true,
      source_record_id: record.source_record_id,
      arriv_employee_id: record.arriv_employee_id,
      calculated_commission_amount: record.calculated_commission_amount,
      payroll_inclusion_status: record.payroll_inclusion_status,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});