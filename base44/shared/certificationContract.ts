// Certification Contract for the Arriv Ecosystem
// Shared by Arriv Assist (central authority) and all host apps (executors).
//
// Arriv Assist is the CENTRAL CERTIFICATION AUTHORITY.
// Host apps are CERTIFICATION EXECUTORS only — they accept ONLY predefined
// canary operations, never arbitrary execution.
//
// AUTH:
//   HMAC-SHA256 signed requests from Arriv Assist using ARRIV_ASSIST_AUTH_SECRET.
//   Headers: X-Arriv-Cert-Signature, X-Arriv-Cert-Timestamp (Unix ms),
//            X-Arriv-Cert-Nonce (UUID), X-Arriv-Cert-Source-Application
//   Canonical: "{timestamp}.{nonce}.{body}"
//   Requirements: source_application=arriv_assist, Platform Authority role,
//                 timestamp freshness (5 min), nonce replay protection,
//                 canary_id in allowlist, synthetic_run_id present.

import { secrets } from "base44:runtime";

export const CERTIFICATION_CONTRACT_VERSION = "1.0.0";
export const CERTIFICATION_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// ============================================================
// CANARY ID ALLOWLIST
// ============================================================
// Only these canary IDs may be executed. Unknown IDs are rejected.
export const CERTIFICATION_CANARIES = [
  // Payroll -> Arriv One status reliability (Phase 10G.1C)
  "payroll_to_one_successful_delivery",
  "payroll_to_one_failed_delivery_persisted",
  "payroll_to_one_retry_scheduled",
  "payroll_to_one_recovery",
  "payroll_to_one_idempotent_replay",
  "payroll_to_one_delivery_unknown",
  "payroll_to_one_permanent_failure",
  "payroll_to_one_retry_exhaustion",
  "payroll_to_one_tenant_isolation",
  "payroll_to_one_sensitive_data",
  // Arriv One -> Payroll
  "one_to_payroll_employee_sync",
  // Khetha -> Payroll
  "khetha_to_payroll_handoff",
  // Estate Media -> Payroll
  "estate_to_payroll_sync",
  // Arriv One <-> Estate Media
  "one_to_estate_sync",
  "estate_to_one_sync",
  // Arriv One <-> Khetha
  "one_to_khetha_sync",
  "khetha_to_one_sync",
  // Khetha -> Estate Media
  "khetha_to_estate_handoff",
  // Estate Media -> Khetha
  "estate_to_khetha_sync",
  // Loop suppression
  "loop_suppression_one_estate",
  "loop_suppression_one_khetha",
  "loop_suppression_estate_khetha",
  // Arriv Assist host certification
  "assist_host_arriv_one",
  "assist_host_arriv_payroll",
  "assist_host_arriv_estate_media",
  "assist_host_khetha",
  // Cross-app tenant isolation
  "tenant_isolation_cross_app",
  // Sensitive data absence
  "sensitive_data_absence",
];

// ============================================================
// FAILURE SIMULATION TYPES
// ============================================================
export const FAILURE_SIMULATIONS = [
  "SIMULATE_NETWORK_FAILURE",
  "SIMULATE_HTTP_500",
  "SIMULATE_TIMEOUT",
  "SIMULATE_HTTP_408",
  "SIMULATE_HTTP_504",
  "SIMULATE_HTTP_401",
  "SIMULATE_PERMANENT_REJECTION",
  "SIMULATE_DELIVERY_UNKNOWN",
];

// ============================================================
// EXECUTION TYPES
// ============================================================
export const EXECUTION_TYPES = [
  "LIVE_LOCAL_RUNTIME",
  "LIVE_INTEGRATION",
  "LIVE_END_TO_END",
  "SYNTHETIC_EXECUTION",
  "CODE_TRACE",
];

// ============================================================
// CANARY PHASES
// ============================================================
export const CANARY_PHASES = ["execute", "verify", "cleanup"];

// ============================================================
// CANARY -> APP MAPPING
// ============================================================
// Maps each canary ID to its sender and receiver applications.
// Single-app canaries have receiver = null.
export const CANARY_APP_MAP = {
  payroll_to_one_successful_delivery: { sender: "arriv_payroll", receiver: "arriv_one" },
  payroll_to_one_failed_delivery_persisted: { sender: "arriv_payroll", receiver: null },
  payroll_to_one_retry_scheduled: { sender: "arriv_payroll", receiver: null },
  payroll_to_one_recovery: { sender: "arriv_payroll", receiver: "arriv_one" },
  payroll_to_one_idempotent_replay: { sender: "arriv_payroll", receiver: "arriv_one" },
  payroll_to_one_delivery_unknown: { sender: "arriv_payroll", receiver: "arriv_one" },
  payroll_to_one_permanent_failure: { sender: "arriv_payroll", receiver: null },
  payroll_to_one_retry_exhaustion: { sender: "arriv_payroll", receiver: null },
  payroll_to_one_tenant_isolation: { sender: "arriv_payroll", receiver: null },
  payroll_to_one_sensitive_data: { sender: "arriv_payroll", receiver: null },
  one_to_payroll_employee_sync: { sender: "arriv_one", receiver: "arriv_payroll" },
  khetha_to_payroll_handoff: { sender: "khetha", receiver: "arriv_payroll" },
  estate_to_payroll_sync: { sender: "arriv_estate_media", receiver: "arriv_payroll" },
  one_to_estate_sync: { sender: "arriv_one", receiver: "arriv_estate_media" },
  estate_to_one_sync: { sender: "arriv_estate_media", receiver: "arriv_one" },
  one_to_khetha_sync: { sender: "arriv_one", receiver: "khetha" },
  khetha_to_one_sync: { sender: "khetha", receiver: "arriv_one" },
  khetha_to_estate_handoff: { sender: "khetha", receiver: "arriv_estate_media" },
  estate_to_khetha_sync: { sender: "arriv_estate_media", receiver: "khetha" },
  loop_suppression_one_estate: { sender: "arriv_one", receiver: "arriv_estate_media" },
  loop_suppression_one_khetha: { sender: "arriv_one", receiver: "khetha" },
  loop_suppression_estate_khetha: { sender: "arriv_estate_media", receiver: "khetha" },
  assist_host_arriv_one: { sender: "arriv_one", receiver: null },
  assist_host_arriv_payroll: { sender: "arriv_payroll", receiver: null },
  assist_host_arriv_estate_media: { sender: "arriv_estate_media", receiver: null },
  assist_host_khetha: { sender: "khetha", receiver: null },
  tenant_isolation_cross_app: { sender: "arriv_payroll", receiver: null },
  sensitive_data_absence: { sender: "arriv_payroll", receiver: null },
};

// ============================================================
// NONCE REPLAY PROTECTION (in-memory, TTL = timestamp window)
// ============================================================
const _nonceCache = new Map<string, number>();
const _NONCE_TTL_MS = CERTIFICATION_TIMESTAMP_TOLERANCE_MS;

function _cleanupNonces(): void {
  const now = Date.now();
  for (const [nonce, expiry] of _nonceCache) {
    if (expiry <= now) _nonceCache.delete(nonce);
  }
}

function _checkAndRecordNonce(nonce: string): boolean {
  _cleanupNonces();
  if (_nonceCache.has(nonce)) return false; // replay
  _nonceCache.set(nonce, Date.now() + _NONCE_TTL_MS);
  return true; // fresh
}

// ============================================================
// HMAC HELPERS
// ============================================================
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================
// SIGN (used by Arriv Assist orchestrator)
// ============================================================
export async function signCertificationRequest(body: object): Promise<{ headers: Record<string, string>, body: string }> {
  const secret = secrets.get("ARRIV_ASSIST_AUTH_SECRET");
  if (!secret) throw new Error("ARRIV_ASSIST_AUTH_SECRET not configured");

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const bodyStr = JSON.stringify(body);
  const signingInput = `${timestamp}.${nonce}.${bodyStr}`;
  const signature = await hmacSha256Hex(secret, signingInput);

  return {
    headers: {
      "Content-Type": "application/json",
      "X-Arriv-Cert-Signature": signature,
      "X-Arriv-Cert-Timestamp": timestamp,
      "X-Arriv-Cert-Nonce": nonce,
      "X-Arriv-Cert-Source-Application": "arriv_assist",
    },
    body: bodyStr,
  };
}

// ============================================================
// VERIFY (used by host app certification endpoints)
// ============================================================
export async function verifyCertificationAuth(req: Request): Promise<{ authenticated: boolean; error?: string; body?: any }> {
  try {
    const signature = req.headers.get("x-arriv-cert-signature");
    const timestamp = req.headers.get("x-arriv-cert-timestamp");
    const nonce = req.headers.get("x-arriv-cert-nonce");
    const sourceApp = req.headers.get("x-arriv-cert-source-application");

    if (!signature || !timestamp || !nonce) {
      return { authenticated: false, error: "MISSING_AUTH_HEADERS" };
    }

    // Timestamp freshness
    const now = Date.now();
    const ts = parseInt(timestamp);
    if (isNaN(ts) || Math.abs(now - ts) > CERTIFICATION_TIMESTAMP_TOLERANCE_MS) {
      return { authenticated: false, error: "STALE_TIMESTAMP" };
    }

    // Source application must be arriv_assist
    if (sourceApp !== "arriv_assist") {
      return { authenticated: false, error: "INVALID_SOURCE_APPLICATION" };
    }

    // Read body and verify HMAC
    const bodyText = await req.text();
    const secret = secrets.get("ARRIV_ASSIST_AUTH_SECRET");
    if (!secret) {
      return { authenticated: false, error: "SECRET_NOT_CONFIGURED" };
    }

    const signingInput = `${timestamp}.${nonce}.${bodyText}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["verify"]
    );
    const sigBytes = hexToBytes(signature);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(signingInput));
    if (!valid) {
      return { authenticated: false, error: "INVALID_SIGNATURE" };
    }

    // Parse body
    let body;
    try { body = JSON.parse(bodyText); } catch {
      return { authenticated: false, error: "INVALID_BODY" };
    }

    // Platform Authority required
    if (body.assist_role !== "PLATFORM_AUTHORITY") {
      return { authenticated: false, error: "NOT_PLATFORM_AUTHORITY" };
    }

    // Canary ID must be in allowlist
    if (!body.canary_id || !CERTIFICATION_CANARIES.includes(body.canary_id)) {
      return { authenticated: false, error: "UNKNOWN_CANARY_ID" };
    }

    // Synthetic run ID required
    if (!body.synthetic_run_id) {
      return { authenticated: false, error: "MISSING_SYNTHETIC_RUN_ID" };
    }

    // Nonce replay protection
    if (!_checkAndRecordNonce(nonce)) {
      return { authenticated: false, error: "REPLAY_DETECTED" };
    }

    return { authenticated: true, body };
  } catch (e) {
    return { authenticated: false, error: "AUTH_ERROR" };
  }
}

// ============================================================
// RESULT BUILDER
// ============================================================
export function buildCertificationResult(params: {
  success: boolean;
  canary_id: string;
  synthetic_run_id: string;
  application_id: string;
  source_application: string;
  destination_application: string;
  execution_type: string;
  result: "PASS" | "FAIL" | "NOT_TESTED";
  evidence: object;
  canonical_event_id?: string;
  synthetic_records_created?: string[];
  synthetic_records_cleaned?: string[];
  legitimate_records_modified?: boolean;
  started_at: string;
  completed_at: string;
}) {
  return {
    success: params.success,
    canary_id: params.canary_id,
    synthetic_run_id: params.synthetic_run_id,
    application_id: params.application_id,
    source_application: params.source_application,
    destination_application: params.destination_application,
    execution_type: params.execution_type,
    started_at: params.started_at,
    completed_at: params.completed_at,
    result: params.result,
    evidence: params.evidence,
    canonical_event_id: params.canonical_event_id || "",
    synthetic_records_created: params.synthetic_records_created || [],
    synthetic_records_cleaned: params.synthetic_records_cleaned || [],
    legitimate_records_modified: params.legitimate_records_modified || false,
    contract_version: CERTIFICATION_CONTRACT_VERSION,
  };
}

// ============================================================
// SENSITIVE DATA REDACTION
// ============================================================
// Certification results must NEVER expose sensitive data.
// This function checks a result object for prohibited fields.
const SENSITIVE_FIELD_NAMES = [
  "ssn", "social_security", "bank_account", "routing_number", "password",
  "mfa_code", "totp_code", "hmac_secret", "api_secret", "auth_token",
  "stripe_secret", "stripe_key", "secret_key", "private_key", "access_token",
  "refresh_token",
];

export function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitiveData);

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELD_NAMES.some(s => lowerKey.includes(s))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export function containsSensitiveData(obj: any): boolean {
  if (obj === null || obj === undefined) return false;
  if (typeof obj !== "object") return false;
  if (Array.isArray(obj)) return obj.some(containsSensitiveData);

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELD_NAMES.some(s => lowerKey.includes(s))) return true;
    if (typeof value === "object" && containsSensitiveData(value)) return true;
  }
  return false;
}