// Shared helpers for the Arriv Payroll contractor (media specialist) integration.
// Used by syncSalesCompensationEvent, syncMediaSpecialistEarning,
// receivePayrollContractorDocument, and getPayoutRecords.

import { buildSignedHeaders } from "./payrollSigning.ts";
import { secrets } from "base44:runtime";

// ─── Payroll config (single-tenant: app-level secrets) ─────────────────────
export function getPayrollConfig() {
  const endpoint = secrets.get("ARRIV_PAYROLL_ENDPOINT") || secrets.get("ARRIV_PAYROLL_API_ENDPOINT") || "";
  const apiSecret = secrets.get("ARRIV_PAYROLL_API_SECRET") || "";
  const webhookSecret = secrets.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";
  const companyId = secrets.get("ARRIV_PAYROLL_COMPANY_ID") || "";
  const enabled = !!companyId && !!apiSecret && !!endpoint;
  return { endpoint, companyId, enabled, apiSecret, webhookSecret };
}

// ─── Arriv Payroll API proxy ───────────────────────────────────────────────
export async function callPayrollApi(config, action, payload) {
  const body = { ...payload, action, company_id: config.companyId };
  const bodyStr = JSON.stringify(body);
  const sourceAppId = "arriv-estate-media";
  const headers = await buildSignedHeaders(config.apiSecret, bodyStr, sourceAppId);

  const base = config.endpoint.replace(/\/functions\/.*$/i, "").replace(/\/$/, "");
  const url = base + "/functions/" + action;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: bodyStr,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Payroll API error: ${resp.status}`);
  return data;
}

// ─── Document type mapping (Arriv Payroll event → ContractorPayoutDocument) ─
export function mapEventTypeToDocumentType(eventType) {
  const map = {
    "media_statement.weekly_created": "weekly_statement",
    "media_statement.monthly_created": "monthly_statement",
    "media_statement.ytd_created": "ytd_statement",
    "media_statement.amended": null, // handled by caller — type depends on original
    "media_w9.status_updated": "w9",
    "media_tax_document.available": "tax_document",
    "media_tax_document.corrected": "corrected_tax_document",
  };
  return map[eventType] || null;
}

// ─── Mask sensitive identifiers for display ────────────────────────────────
export function maskTin(value) {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 4) return "****";
  return "****" + s.slice(-4);
}

// ─── Generic sync helpers (shared by sales + media specialist sync) ────────
// Both sync functions follow the same pattern: list pending, retry failed,
// and push a single record to Arriv Payroll.  These helpers parameterize
// that pattern by entity name and payload builder.

export async function listPendingSync(base44, entityName, filter) {
  const query = { ...filter, sync_status: { $in: ["not_synced", "error"] } };
  const records = await base44.asServiceRole.entities[entityName].filter(query, "-updated_date", 200);
  return records || [];
}

export async function retryFailedSync(base44, entityName, pushFn) {
  const failed = await base44.asServiceRole.entities[entityName].filter(
    { sync_status: "error" }, "-updated_date", 100
  );
  const results = [];
  for (const rec of (failed || [])) {
    try {
      const r = await pushFn(base44, rec);
      results.push({ id: rec.id, success: r.success });
    } catch (e) {
      results.push({ id: rec.id, success: false, error: e.message });
    }
  }
  return results;
}

// ─── Resolve the current media specialist from the request context ─────────
// Returns { id, email, full_name } or null.
//
// CANONICAL CONTRACTOR MODEL (production-hardening B-04):
//   1. PRIMARY — User with user_type === "media_partner" (completed signup).
//   2. SECONDARY — MediaSpecialistEarningSync record matching the caller's
//      email. This is the AUTHORITATIVE 1099 contractor classification from
//      Arriv Payroll: payroll only creates an earning-sync record for a
//      verified 1099 media specialist. A W-2-only employee (SalesTeamMember
//      without a media-partner User or earning-sync record) is NEVER matched.
//
// This is NOT email-alone authorization. The secondary path requires a
// payroll-classified contractor earning record to exist — concrete evidence
// of a legitimate media-specialist assignment, not a guess from an email.
// A dual-role person (W-2 sales rep who also has 1099 media-specialist
// earnings) succeeds because they have a legitimate media-specialist
// assignment via the earning-sync record.
export async function resolveMediaSpecialist(base44) {
  let user;
  try {
    user = await base44.auth.me();
  } catch {
    return null;
  }
  if (!user || !user.email) return null;

  // PRIMARY: completed signup → User with user_type === "media_partner"
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
    if (users && users.length) {
      const acct = users[0];
      if (acct.user_type === "media_partner") {
        return {
          id: acct.id,
          email: acct.email,
          full_name: acct.full_name,
        };
      }
    }
  } catch (_e) {
    // fall through to secondary
  }

  // SECONDARY: authoritative 1099 contractor classification via
  // MediaSpecialistEarningSync. A W-2-only employee has no such record.
  try {
    const earnings = await base44.asServiceRole.entities.MediaSpecialistEarningSync.filter({
      media_specialist_email: user.email,
    });
    if (earnings && earnings.length > 0) {
      const e = earnings[0];
      return {
        id: e.media_specialist_id || user.id || user.email,
        email: user.email,
        full_name: e.media_specialist_name || user.full_name || "",
      };
    }
  } catch (_e) {
    // fall through to deny
  }

  // DENY: no User.media_partner and no payroll-classified earning record.
  // A W-2-only employee, ordinary customer, or unknown identity is rejected.
  return null;
}