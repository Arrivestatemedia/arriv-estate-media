// Shared logic for syncing Media Specialist earning records to Arriv Payroll
// for DOCUMENT AND TAX PURPOSES ONLY.
//
// Arriv Payroll NEVER pays Media Specialists — Estate Media pays them directly
// via Stripe Connect. This sync only ensures Arriv Payroll has the authoritative
// earning records for statement/tax document generation.
//
// Used by:
//   - syncMediaSpecialistEarning (HTTP handler)
//   - processWeeklyPayouts (after each successful Stripe transfer)
//   - processInstantPayout (after each successful instant payout)

import { getPayrollConfig, callPayrollApi } from "./contractorPayoutShared.ts";

// Create or update a MediaSpecialistEarningSync record and push it to Payroll.
// Returns { success, earning, payroll_response?, error? }.
export async function syncEarningRecord(base44, params) {
  const {
    media_specialist_id, media_specialist_email, media_specialist_name,
    shared_person_id, earning_id, job_id, job_date, service_type,
    gross_job_amount, media_specialist_percentage, gross_earning,
    fees, adjustments, net_earning, payout_status, scheduled_payout_date,
    actual_payout_date, provider_transaction_reference, currency, tenant_id,
  } = params;

  if (!media_specialist_id || !earning_id) {
    return { success: false, error: "media_specialist_id and earning_id are required" };
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

  return await pushEarningToPayroll(base44, rec);
}

// Push a single MediaSpecialistEarningSync record to Arriv Payroll.
export async function pushEarningToPayroll(base44, rec) {
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
    media_specialist_name: rec.media_specialist_name || "",
    media_specialist_email: rec.media_specialist_email || "",
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

// Build earning sync params from a paid job + partner record + transfer reference.
// Used by processWeeklyPayouts and processInstantPayout.
export function buildEarningParamsFromJob(job, partnerRec, opts) {
  const { transferId, fees = 0, payoutDate } = opts;
  const grossEarning = job.pay_rate || 0;
  const grossJobAmount = job.client_price || 0;
  const percentage = grossJobAmount > 0
    ? Math.round((grossEarning / grossJobAmount) * 10000) / 100
    : 100;
  const netEarning = Math.max(0, grossEarning - fees);

  return {
    media_specialist_id: partnerRec.id,
    media_specialist_email: String(job.booked_by || "").toLowerCase(),
    media_specialist_name: job.booked_by_name || partnerRec.record?.full_name || "",
    earning_id: `earn_${job.id}`,
    job_id: job.id,
    job_date: job.date || "",
    service_type: job.type || "",
    gross_job_amount: grossJobAmount,
    media_specialist_percentage: percentage,
    gross_earning: grossEarning,
    fees,
    adjustments: 0,
    net_earning: netEarning,
    payout_status: "paid",
    actual_payout_date: payoutDate || new Date().toISOString().slice(0, 10),
    provider_transaction_reference: transferId || "",
    currency: "USD",
    tenant_id: job.tenant_id || "tnt_estate_media",
  };
}