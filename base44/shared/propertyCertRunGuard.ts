/**
 * Property Visibility certification — pure guard decisions.
 *
 * Every decision a certification entry point makes about WHO may start a run, WHICH records
 * belong to a run, and WHETHER a discovered run may be swept is expressed here as a pure
 * function, so the runner, the sweeper and the guard tests all enforce the same rule and the
 * rule can be asserted on mocked inputs without touching the database.
 *
 * Deliberately written without TypeScript type annotations, so this exact file can also be
 * exercised directly by the hermetic guard test in addition to the deployed functions.
 */

export const PROPERTY_CERT_RUN_PREFIX = "cert_prop_";
export const PROPERTY_CERT_RUN_LOCK_KEY = "PROPERTY_CERT_RUN_LOCK";
/** A run may hold the lock for 20 minutes; the runner's own runtime is a few minutes. */
export const PROPERTY_CERT_RUN_LOCK_TTL_SECONDS = 1200;
/** Upper bound for any caller-supplied TTL, so a lock can never be made effectively permanent. */
export const PROPERTY_CERT_RUN_LOCK_MAX_TTL_SECONDS = 3600;
/** A certification identity is only ever considered when its own value carries this marker. */
const SYNTHETIC_MARKER = /^cert_/i;

/**
 * Who may start a Property Visibility certification run.
 *
 * The role is taken from the server-verified platform session ONLY. Body fields, query
 * parameters and headers that merely *claim* an identity or a role are never consulted here,
 * which is why this deliberately does not use the app's `verifyAdmin` helper: that helper
 * accepts a caller-supplied `email` / `sales_member_id` and resolves an admin from it, so an
 * unauthenticated caller could claim one. A session token cannot be claimed.
 */
export function certificationAdminVerdict(user) {
  if (!user) {
    return {
      authorized: false,
      status: 401,
      reason: "Authentication required: an authenticated Arriv administrator session is required to run certification.",
    };
  }
  if (user.role !== "admin") {
    return {
      authorized: false,
      status: 403,
      reason: "Forbidden: administrator privileges are required to run certification.",
    };
  }
  return { authorized: true, status: 200, reason: "authorized" };
}

/** A certification run identifier must be `cert_`-prefixed before anything may be deleted for it. */
export function isCertificationRunId(value) {
  return typeof value === "string" && SYNTHETIC_MARKER.test(value.trim());
}

/** Safely read a stored lock value. A malformed value is treated as no lock, never as a live one. */
export function parseLockValue(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The single decision that enforces one active run at a time.
 *   acquire    — no lock, or a lock that was explicitly released
 *   renew      — the lock is already ours
 *   takeover   — a foreign lock whose bounded lifetime has expired (safe recovery)
 *   refuse     — a foreign lock that is still live
 */
export function lockDecision(existing, nowMs, runId, ttlMs) {
  const row = existing && typeof existing === "object" ? existing : null;
  const active = row ? row.active !== false : false;
  const holder = row ? String(row.run_id || "") : "";
  if (!row || !active) return { verdict: "acquire", reason: "no active lock" };
  if (holder && holder === String(runId || "")) return { verdict: "renew", reason: "lock already held by this run" };
  const expiresMs = Date.parse(String(row.expires_at || ""));
  if (Number.isNaN(expiresMs)) return { verdict: "takeover", reason: "lock has no readable expiry, treated as expired" };
  if (expiresMs <= nowMs) return { verdict: "takeover", reason: "lock expired", took_over_from: holder };
  return { verdict: "refuse", reason: "another certification run is active", active_run_id: holder, expires_at: row.expires_at };
}

/**
 * Whether a discovered run must be left alone because it is the run currently holding a live
 * lock. This is the guard that stops a sweep from pulling records out from under an active run.
 */
export function shouldSkipSweepForActiveLock(discoveredRunId, lock, nowMs) {
  const row = lock && typeof lock === "object" ? lock : null;
  return !!(row && String(row.run_id || "") === String(discoveredRunId || "") && String(row.run_id || "") && row.active === true && Date.parse(String(row.expires_at || "")) > nowMs);
}

/**
 * Whether one record may be deleted as part of a certification run's teardown.
 *
 * Two independent requirements, both mandatory:
 *   1. the record is a certification record (`certification_mode === true`), and
 *   2. it is attributable to THIS run — by the run marker on the record, by the run's own
 *      synthetic address, or by an explicit relationship (an id the run declared, such as a
 *      listing whose events and inquiries hang off it).
 *
 * A legitimate customer record can satisfy neither, so an over-broad query still cannot delete
 * real data. A record that merely *contains* the run id somewhere in a field is not matched:
 * attribution is by prefix on the record's own marker fields.
 */
export function isPropertySweepCandidate(record, input) {
  if (!record || typeof record !== "object") return false;
  if (record.certification_mode !== true) return false;

  const runId = String((input && input.runId) || "").trim();
  if (!isCertificationRunId(runId)) return false;
  const runLower = runId.toLowerCase();

  const declaredEmails = [
    `${runLower}@cert.test`,
    ...((input && input.extraEmails) || []).map((e) => String(e || "").trim().toLowerCase()),
  ].filter(Boolean);
  const declaredListingIds = ((input && input.listingIds) || []).map((v) => String(v || ""));

  const runField = String(record.certification_run_id || "").toLowerCase();
  if (runField && runField.startsWith(runLower)) return true;

  const email = String(record.client_email || record.email || "").toLowerCase();
  if (email && (email.startsWith(runLower) || declaredEmails.includes(email))) return true;

  const listingId = String(record.listing_id || "");
  if (listingId && declaredListingIds.includes(listingId)) return true;

  return false;
}

/** Extract the run id a record's own markers carry, or null when it carries none. */
export function propertyCertRunIdsFromRow(row) {
  if (!row || typeof row !== "object") return [];
  const found = [];
  for (const value of [row.certification_run_id, row.client_email, row.email, row.actor]) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    const match = raw.match(/^(cert_[a-z0-9]*_?\d+)/i);
    if (match && isCertificationRunId(match[1])) found.push(match[1]);
  }
  return [...new Set(found)];
}

/** Age guard: a record is only sweepable once it is older than the cutoff. */
export function isRowStale(row, cutoffMs) {
  if (!row || typeof row !== "object") return true;
  const stamp = Date.parse(String(row.created_date || row.created_at || row.recorded_at || ""));
  return Number.isNaN(stamp) ? true : stamp <= cutoffMs;
}