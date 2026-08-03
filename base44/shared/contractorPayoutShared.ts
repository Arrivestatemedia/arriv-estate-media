// Shared helpers for the Arriv Payroll contractor (media specialist) integration.
// Used by syncSalesCompensationEvent, syncMediaSpecialistEarning,
// receivePayrollContractorDocument, and getPayoutRecords.

import { buildSignedHeaders } from "./payrollSigning.ts";

// ─── Payroll config (single-tenant: app-level secrets) ─────────────────────
export function getPayrollConfig() {
  const endpoint = Deno.env.get("ARRIV_PAYROLL_ENDPOINT") || Deno.env.get("ARRIV_PAYROLL_API_ENDPOINT") || "";
  const apiSecret = Deno.env.get("ARRIV_PAYROLL_API_SECRET") || "";
  const webhookSecret = Deno.env.get("ARRIV_PAYROLL_WEBHOOK_SECRET") || "";
  const companyId = Deno.env.get("ARRIV_PAYROLL_COMPANY_ID") || "";
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
export async function resolveMediaSpecialist(base44) {
  let user;
  try {
    user = await base44.auth.me();
  } catch {
    return null;
  }
  if (!user || !user.email) return null;

  // Media partners are stored in the User entity with user_type "media_partner".
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
    // fall through
  }

  // Fallback: return a minimal identity from the auth user so the caller can
  // still filter by email.
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name || "",
  };
}