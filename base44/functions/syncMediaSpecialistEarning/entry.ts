import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getPayrollConfig, callPayrollApi, listPendingSync, retryFailedSync } from "../../shared/contractorPayoutShared.ts";

// Synchronizes Media Specialist earning/payout records with Arriv Payroll
// for DOCUMENT AND TAX PURPOSES ONLY.
//
// Arriv Payroll NEVER pays Media Specialists — Estate Media pays them directly
// via Stripe Connect.  This sync only ensures Arriv Payroll has the authoritative
// earning records for tax document generation.
//
// Actions:
//   sync_earning    — create or update an earning sync record and push to Payroll
//   sync_payout     — update an earning record with payout status and re-sync
//   list_pending    — list earning records with sync_status "not_synced" or "error"
//   retry_failed    — re-push all earning records with sync_status "error"

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, ...params } = body;

    switch (action) {
      case "sync_earning": return await syncEarning(base44, params);
      case "sync_payout": return await syncPayout(base44, params);
      case "list_pending": return await listPending(base44, params);
      case "retry_failed": return await retryFailed(base44, params);
      default: return Response.json({ error: "Unknown action: " + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Action: sync_earning ──────────────────────────────────────────────────
async function syncEarning(base44, params) {
  const {
    media_specialist_id, media_specialist_email, media_specialist_name,
    shared_person_id, earning_id, job_id, job_date, service_type,
    gross_job_amount, media_specialist_percentage, gross_earning,
    fees, adjustments, net_earning, payout_status, scheduled_payout_date,
    actual_payout_date, provider_transaction_reference, currency, tenant_id,
  } = params;

  if (!media_specialist_id || !earning_id) {
    return Response.json({ error: "media_specialist_id and earning_id are required" }, { status: 400 });
  }

  // Idempotency: find existing by earning_id
  const existing = await base44.asServiceRole.entities.MediaSpecialistEarningSync.filter({ earning_id });
  let rec = existing && existing[0];

  const recData = {
    tenant_id: tenant_id || rec?.tenant_id || "",
    media_specialist_id,
    media_specialist_email: media_specialist_email || rec?.media_specialist_email || "",
    media_specialist_name: media_specialist_name || rec?.media_specialist_name || "",
    shared_person_id: shared_person_id || rec?.shared_person_id || "",
    earning_id,
    job_id: job_id || rec?.job_id || "",
    job_date: job_date || rec?.job_date || "",
    service_type: service_type || rec?.service_type || "",
    gross_job_amount: gross_job_amount ?? rec?.gross_job_amount ?? 0,
    media_specialist_percentage: media_specialist_percentage ?? rec?.media_specialist_percentage ?? 0,
    gross_earning: gross_earning ?? rec?.gross_earning ?? 0,
    fees: fees ?? rec?.fees ?? 0,
    adjustments: adjustments ?? rec?.adjustments ?? 0,
    net_earning: net_earning ?? rec?.net_earning ?? 0,
    payout_status: payout_status || rec?.payout_status || "pending",
    scheduled_payout_date: scheduled_payout_date || rec?.scheduled_payout_date || "",
    actual_payout_date: actual_payout_date || rec?.actual_payout_date || "",
    provider_transaction_reference: provider_transaction_reference || rec?.provider_transaction_reference || "",
    currency: currency || rec?.currency || "USD",
  };

  if (rec) {
    rec = await base44.asServiceRole.entities.MediaSpecialistEarningSync.update(rec.id, recData);
  } else {
    rec = await base44.asServiceRole.entities.MediaSpecialistEarningSync.create({
      ...recData,
      sync_status: "not_synced",
      sync_version: 1,
    });
  }

  const result = await pushToPayroll(base44, rec);
  return Response.json(result);
}

// ─── Action: sync_payout ────────────────────────────────────────────────────
async function syncPayout(base44, { earning_id, payout_status, actual_payout_date, provider_transaction_reference }) {
  if (!earning_id) return Response.json({ error: "earning_id is required" }, { status: 400 });

  const existing = await base44.asServiceRole.entities.MediaSpecialistEarningSync.filter({ earning_id });
  const rec = existing && existing[0];
  if (!rec) return Response.json({ error: "Earning record not found" }, { status: 404 });

  const update = {};
  if (payout_status) update.payout_status = payout_status;
  if (actual_payout_date) update.actual_payout_date = actual_payout_date;
  if (provider_transaction_reference) update.provider_transaction_reference = provider_transaction_reference;

  // Bump sync_version so the re-sync produces a fresh idempotency key
  update.sync_version = (rec.sync_version || 1) + 1;

  const updated = await base44.asServiceRole.entities.MediaSpecialistEarningSync.update(rec.id, update);
  const result = await pushToPayroll(base44, { ...updated });
  return Response.json(result);
}

// ─── Action: list_pending ──────────────────────────────────────────────────
async function listPending(base44, { media_specialist_id }) {
  const filter = media_specialist_id ? { media_specialist_id } : {};
  const earnings = await listPendingSync(base44, "MediaSpecialistEarningSync", filter);
  return Response.json({ earnings });
}

// ─── Action: retry_failed ──────────────────────────────────────────────────
async function retryFailed(base44, _params) {
  const results = await retryFailedSync(base44, "MediaSpecialistEarningSync", pushToPayroll);
  return Response.json({ results });
}

// ─── Push an earning record to Arriv Payroll (document/tax sync only) ───────
async function pushToPayroll(base44, rec) {
  const config = getPayrollConfig();
  if (!config.enabled) {
    await base44.asServiceRole.entities.MediaSpecialistEarningSync.update(rec.id, {
      sync_status: "not_synced",
      payroll_sync_error: "Payroll integration not configured",
    });
    return { success: false, error: "Payroll integration not configured", earning: rec };
  }

  const idempotencyKey = `${rec.earning_id}:v${rec.sync_version || 1}`;
  const payload = {
    idempotency_key: idempotencyKey,
    tenant_id: rec.tenant_id,
    media_specialist_id: rec.media_specialist_id,
    shared_person_id: rec.shared_person_id,
    earning_id: rec.earning_id,
    job_id: rec.job_id,
    job_date: rec.job_date,
    service_type: rec.service_type,
    gross_job_amount: rec.gross_job_amount,
    media_specialist_percentage: rec.media_specialist_percentage,
    gross_earning: rec.gross_earning,
    fees: rec.fees,
    adjustments: rec.adjustments,
    net_earning: rec.net_earning,
    payout_status: rec.payout_status,
    scheduled_payout_date: rec.scheduled_payout_date,
    actual_payout_date: rec.actual_payout_date,
    provider_transaction_reference: rec.provider_transaction_reference,
    currency: rec.currency,
    sync_purpose: "document_and_tax_only", // Arriv Payroll must NOT issue a payment
  };

  try {
    const result = await callPayrollApi(config, "mediaSpecialistEarningSync", payload);
    await base44.asServiceRole.entities.MediaSpecialistEarningSync.update(rec.id, {
      sync_status: "synced",
      payroll_sync_error: "",
      synced_at: new Date().toISOString(),
    });
    return { success: true, earning: rec, payroll_response: result };
  } catch (err) {
    await base44.asServiceRole.entities.MediaSpecialistEarningSync.update(rec.id, {
      sync_status: "error",
      payroll_sync_error: err.message,
      synced_at: new Date().toISOString(),
    });
    return { success: false, error: err.message, earning: rec };
  }
}