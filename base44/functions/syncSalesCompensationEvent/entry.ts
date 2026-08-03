import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getPayrollConfig, callPayrollApi, listPendingSync, retryFailedSync } from "../../shared/contractorPayoutShared.ts";

// Sends eligible sales events to Arriv Payroll so it can calculate the
// sales representative's compensation (salary, commission, bonuses, etc.).
//
// Actions:
//   sync_event     — create or update a SalesCompensationEvent and push to Payroll
//   sync_deal      — build an event from a Deal + Invoice and push to Payroll
//   list_pending   — list events with sync_status "not_synced" or "error"
//   retry_failed   — re-push all events with sync_status "error"

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case "sync_event": return await syncEvent(base44, params);
      case "sync_deal": return await syncDeal(base44, params);
      case "list_pending": return await listPending(base44, params);
      case "retry_failed": return await retryFailed(base44, params);
      default: return Response.json({ error: "Unknown action: " + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Action: sync_event ────────────────────────────────────────────────────
async function syncEvent(base44, params) {
  const {
    sales_rep_id, client_id, invoice_id, sale_id,
    sale_amount, commissionable_amount, commission_plan_reference,
    invoice_status, payment_status, sale_date, client_payment_date,
    tenant_id, sales_rep_name, client_name,
  } = params;

  if (!sales_rep_id || !sale_id) {
    return Response.json({ error: "sales_rep_id and sale_id are required" }, { status: 400 });
  }

  // Idempotency: find existing event by sale_id
  const existing = await base44.asServiceRole.entities.SalesCompensationEvent.filter({ sale_id });
  let event = existing && existing[0];

  const eventData = {
    tenant_id: tenant_id || event?.tenant_id || "",
    sales_rep_id,
    sales_rep_name: sales_rep_name || event?.sales_rep_name || "",
    client_id: client_id || event?.client_id || "",
    client_name: client_name || event?.client_name || "",
    invoice_id: invoice_id || event?.invoice_id || "",
    sale_id,
    sale_amount: sale_amount ?? event?.sale_amount ?? 0,
    commissionable_amount: commissionable_amount ?? event?.commissionable_amount ?? sale_amount ?? 0,
    commission_plan_reference: commission_plan_reference || event?.commission_plan_reference || "",
    invoice_status: invoice_status || event?.invoice_status || "",
    payment_status: payment_status || event?.payment_status || "unpaid",
    sale_date: sale_date || event?.sale_date || "",
    client_payment_date: client_payment_date || event?.client_payment_date || "",
  };

  if (event) {
    event = await base44.asServiceRole.entities.SalesCompensationEvent.update(event.id, eventData);
  } else {
    event = await base44.asServiceRole.entities.SalesCompensationEvent.create({
      ...eventData,
      sync_status: "not_synced",
      compensation_version: 1,
    });
  }

  // Push to Arriv Payroll
  const result = await pushToPayroll(base44, event);
  return Response.json(result);
}

// ─── Action: sync_deal ──────────────────────────────────────────────────────
async function syncDeal(base44, { deal_id }) {
  if (!deal_id) return Response.json({ error: "deal_id is required" }, { status: 400 });

  const deal = await base44.asServiceRole.entities.Deal.get(deal_id);
  if (!deal) return Response.json({ error: "Deal not found" }, { status: 404 });

  // Resolve the invoice for this deal (if any)
  let invoice = null;
  if (deal.contact_id || deal.contact_email) {
    try {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({
        contact_id: deal.contact_id || "",
      });
      invoice = invoices && invoices[0];
    } catch (_e) {}
  }

  const saleAmount = deal.contract_value || 0;
  const commissionable = invoice?.amount || saleAmount;

  return await syncEvent(base44, {
    sales_rep_id: deal.sales_member_id,
    sales_rep_name: deal.contact_name || "",
    client_id: deal.contact_id || "",
    client_name: deal.contact_name || deal.company || "",
    invoice_id: invoice?.id || "",
    sale_id: deal.id,
    sale_amount: saleAmount,
    commissionable_amount: commissionable,
    commission_plan_reference: "", // Arriv Payroll resolves from the rep's compensation profile
    invoice_status: invoice?.status || "",
    payment_status: deal.status === "paid" ? "paid" : deal.status === "won" ? "unpaid" : "unpaid",
    sale_date: deal.closed_at ? deal.closed_at.slice(0, 10) : "",
    client_payment_date: deal.status === "paid" && deal.closed_at ? deal.closed_at.slice(0, 10) : "",
    tenant_id: deal.tenant_id || "",
  });
}

// ─── Action: list_pending ──────────────────────────────────────────────────
async function listPending(base44, { sales_rep_id }) {
  const filter = sales_rep_id ? { sales_rep_id } : {};
  const events = await listPendingSync(base44, "SalesCompensationEvent", filter);
  return Response.json({ events });
}

// ─── Action: retry_failed ──────────────────────────────────────────────────
async function retryFailed(base44, _params) {
  const results = await retryFailedSync(base44, "SalesCompensationEvent", pushToPayroll);
  return Response.json({ results });
}

// ─── Push a single event to Arriv Payroll ───────────────────────────────────
async function pushToPayroll(base44, event) {
  const config = getPayrollConfig();
  if (!config.enabled) {
    // Payroll not configured — mark as not_synced with a note
    await base44.asServiceRole.entities.SalesCompensationEvent.update(event.id, {
      sync_status: "not_synced",
      payroll_sync_error: "Payroll integration not configured",
    });
    return { success: false, error: "Payroll integration not configured", event };
  }

  const idempotencyKey = `${event.sale_id}:v${event.compensation_version || 1}`;
  const payload = {
    idempotency_key: idempotencyKey,
    sales_rep_id: event.sales_rep_id,
    client_id: event.client_id,
    invoice_id: event.invoice_id,
    sale_id: event.sale_id,
    sale_amount: event.sale_amount,
    commissionable_amount: event.commissionable_amount,
    commission_plan_reference: event.commission_plan_reference,
    invoice_status: event.invoice_status,
    payment_status: event.payment_status,
    sale_date: event.sale_date,
    client_payment_date: event.client_payment_date,
    sales_rep_name: event.sales_rep_name,
    client_name: event.client_name,
  };

  try {
    const result = await callPayrollApi(config, "salesCompensationEvent", payload);
    const update = {
      sync_status: "synced",
      payroll_sync_error: "",
      synced_at: new Date().toISOString(),
    };
    if (result?.compensation_import_id) {
      update.payroll_compensation_import_id = result.compensation_import_id;
    }
    const updated = await base44.asServiceRole.entities.SalesCompensationEvent.update(event.id, update);
    return { success: true, event: updated, payroll_response: result };
  } catch (err) {
    await base44.asServiceRole.entities.SalesCompensationEvent.update(event.id, {
      sync_status: "error",
      payroll_sync_error: err.message,
      synced_at: new Date().toISOString(),
    });
    return { success: false, error: err.message, event };
  }
}