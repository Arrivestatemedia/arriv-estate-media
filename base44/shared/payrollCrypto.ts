const enc = new TextEncoder();

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(sig);
}

export async function verifySignature(secret, body, signature) {
  if (!signature) return false;
  const expected = await signPayload(secret, body);
  if (expected.length !== signature.length) return false;
  let res = 0;
  for (let i = 0; i < expected.length; i++) {
    res |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return res === 0;
}

const MAX_REQUEST_AGE_MS = 5 * 60 * 1000; // five minutes

// Build a canonical signing string from a body + metadata so both sides sign the same bytes.
export function canonicalStringForSigning({ body, timestamp, requestId, sourceAppId, employeeVersion }) {
  return [body || "", timestamp || "", requestId || "", sourceAppId || "", String(employeeVersion ?? "")].join("\n");
}

export async function signRequest(secret, { body, timestamp, requestId, sourceAppId, employeeVersion }) {
  const canonical = canonicalStringForSigning({ body, timestamp, requestId, sourceAppId, employeeVersion });
  return signPayload(secret, canonical);
}

export async function verifySignedRequest(secret, { body, timestamp, requestId, sourceAppId, employeeVersion, signature }) {
  if (!signature) return false;
  if (!isTimestampFresh(timestamp)) return false;
  const expected = await signRequest(secret, { body, timestamp, requestId, sourceAppId, employeeVersion });
  if (expected.length !== signature.length) return false;
  let res = 0;
  for (let i = 0; i < expected.length; i++) {
    res |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return res === 0;
}

export function isTimestampFresh(timestamp, maxAgeMs = MAX_REQUEST_AGE_MS) {
  if (!timestamp) return false;
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts)) return false;
  const skew = Math.abs(Date.now() - ts);
  return skew <= maxAgeMs;
}

export function generateRequestId() {
  return "req_" + crypto.randomUUID();
}

export function generateSyncId() {
  return "sync_" + crypto.randomUUID();
}

export function generateEmployeeId() {
  return "AE-" + crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
}

export async function sha256Hex(value) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return toHex(buf);
}

// Exponential backoff: attempt n (1-based) -> delay in ms. Capped at ~16min.
export function backoffDelayMs(attempt) {
  const base = 30 * 1000; // 30s
  const delay = base * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(delay, 16 * 60 * 1000);
}

// Errors reported by Arriv Payroll that must NOT be retried.
export function isNonRetryableError(responseCode, responseMessage) {
  const code = String(responseCode || "").toUpperCase();
  const msg = String(responseMessage || "").toLowerCase();
  const codes = ["AUTH_FAILED", "AUTHENTICATION_FAILED", "INVALID_SIGNATURE", "EMPLOYEE_MISMATCH", "DUPLICATE_PAYROLL", "DUPLICATE_SOURCE_RECORD", "LOCKED_PAYROLL_CONFLICT", "INVALID_COMMISSION_PLAN", "OWNER_REVIEW_REQUIRED"];
  if (codes.includes(code)) return true;
  const phrases = ["authentication failed", "invalid signature", "employee mismatch", "duplicate payroll", "duplicate source record", "locked payroll conflict", "invalid commission plan", "owner review required"];
  return phrases.some((p) => msg.includes(p));
}