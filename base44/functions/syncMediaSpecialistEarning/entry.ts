import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { listPendingSync, retryFailedSync } from "../../shared/contractorPayoutShared.ts";
import { syncEarningRecord, pushEarningToPayroll } from "../../shared/mediaSpecialistEarningSync.ts";

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
  const result = await syncEarningRecord(base44, params);
  if (!result.success && result.error === "media_specialist_id and earning_id are required") {
    return Response.json({ error: result.error }, { status: 400 });
  }
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
  const result = await pushEarningToPayroll(base44, { ...updated });
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
  const results = await retryFailedSync(base44, "MediaSpecialistEarningSync", pushEarningToPayroll);
  return Response.json({ results });
}