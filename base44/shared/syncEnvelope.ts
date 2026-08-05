import { secrets } from "base44:runtime";

export const SCHEMA_VERSION = "1.0.0";
export const SOURCE_APPLICATION = "estate_media";
export const DESTINATION_APPLICATION = "arriv_one";
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// ─── HMAC helpers ───

async function hmacKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function bufToHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBuf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.substr(i, 2), 16);
  return arr;
}

/**
 * Canonical signing format — must match Arriv One exactly.
 * Signs: schema_version|source_application|destination_application|tenant_id|entity_type|entity_id|immutable_shared_id|operation|occurred_at|source_updated_at|record_version|idempotency_key|signature_timestamp|signature_nonce|payload_json
 */
export function buildCanonicalString(envelope) {
  const parts = [
    envelope.schema_version || SCHEMA_VERSION,
    envelope.source_application,
    envelope.destination_application,
    envelope.tenant_id,
    envelope.entity_type,
    envelope.entity_id || "",
    envelope.immutable_shared_id || "",
    envelope.operation,
    envelope.occurred_at,
    envelope.source_updated_at || "",
    String(envelope.record_version ?? 0),
    envelope.idempotency_key || "",
    envelope.signature_timestamp,
    envelope.signature_nonce,
    JSON.stringify(envelope.payload || {}),
  ];
  return parts.join("|");
}

export async function signEnvelope(envelope, secretName) {
  const secret = secrets.get(secretName);
  if (!secret) throw new Error(`Sync secret not configured: ${secretName}`);
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(buildCanonicalString(envelope));
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bufToHex(sig);
}

export async function verifySignature(envelope, secretName) {
  const secret = secrets.get(secretName);
  if (!secret) throw new Error(`Sync secret not configured: ${secretName}`);
  if (!envelope.signature || !envelope.signature_timestamp || !envelope.signature_nonce) return false;
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(buildCanonicalString(envelope));
  const expected = await crypto.subtle.sign("HMAC", key, data);
  const expectedHex = bufToHex(expected);
  const received = envelope.signature;
  // Constant-time comparison
  if (expectedHex.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

// ─── Envelope validation ───

export function validateEnvelopeShape(envelope) {
  const required = [
    "event_id", "event_type", "schema_version", "source_application",
    "destination_application", "tenant_id", "entity_type", "operation",
    "occurred_at", "signature", "signature_timestamp", "signature_nonce"
  ];
  for (const f of required) {
    if (!envelope[f]) return { valid: false, error: `Missing field: ${f}` };
  }
  if (!envelope.entity_id && !envelope.immutable_shared_id) {
    return { valid: false, error: "Either entity_id or immutable_shared_id is required" };
  }
  return { valid: true };
}

export function validateTimestamp(envelope, now = Date.now()) {
  const ts = new Date(envelope.signature_timestamp).getTime();
  if (isNaN(ts)) return { valid: false, error: "Invalid signature_timestamp" };
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, error: "Timestamp outside tolerance" };
  }
  return { valid: true };
}

export function validatePayloadSize(envelope) {
  const size = new TextEncoder().encode(JSON.stringify(envelope.payload || {})).length;
  if (size > MAX_PAYLOAD_BYTES) {
    return { valid: false, error: `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`, size };
  }
  return { valid: true, size };
}

export function generateNonce() {
  return crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);
}

export function generateEventId() {
  return crypto.randomUUID();
}

export function generateIdempotencyKey(entityType, entityId, operation, recordVersion) {
  return `${entityType}:${entityId}:${operation}:${recordVersion || 0}:${Date.now()}`;
}