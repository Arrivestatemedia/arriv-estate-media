import { secrets } from "base44:runtime";
import { SIGNATURE_VERSION, ENVELOPE_SCHEMA_VERSION } from "./syncEntityAdapters.ts";

export const SCHEMA_VERSION = ENVELOPE_SCHEMA_VERSION;
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
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Payload canonicalization ───
// Deterministic JSON canonicalization: stable recursive key sorting.
// This is the SHARED canonicalization method — both Arriv One and Estate Media
// must implement the exact same algorithm. Object key insertion order must NOT
// affect the hash.
//
// Rules:
//   - Object keys sorted in ascending lexicographic (UTF-16 code unit) order, recursively.
//   - null  → null
//   - undefined / missing fields → omitted entirely (not emitted)
//   - booleans → true / false
//   - numbers → JSON.stringify representation (preserves integer vs decimal)
//   - strings → JSON.stringify (quoted, escaped per JSON)
//   - arrays → preserve element order; each element canonicalized
//   - empty array → []
//   - empty object → {}
//   - Unicode characters → preserved as-is (UTF-8)
//   - line breaks → preserved (no normalization)
//   - functions / symbols → omitted (not JSON-serializable)

export function canonicalizePayload(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null; // NaN/Infinity → null (non-JSON)
    return value;
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(canonicalizePayload);
  }
  if (typeof value === "object") {
    const sortedKeys = Object.keys(value).sort();
    const result = {};
    for (const key of sortedKeys) {
      if (value[key] === undefined) continue; // omit undefined
      result[key] = canonicalizePayload(value[key]);
    }
    return result;
  }
  return null; // functions, symbols → null
}

export function serializeCanonicalPayload(value) {
  return JSON.stringify(canonicalizePayload(value));
}

// ─── Payload hash ───
// sha256 of the canonicalized payload JSON, returned as lowercase hex.
// This is what goes into the canonical signing string as the 11th field.

export async function computePayloadHash(payload) {
  const canonical = serializeCanonicalPayload(payload);
  const data = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bufToHex(hash);
}

// ─── Canonical signing string ───
// EXACT Master Arriv One format (sync_hmac_v1):
//
//   source_application
//   |destination_application
//   |tenant_id
//   |entity_type
//   |immutable_shared_id
//   |record_version
//   |operation
//   |occurred_at
//   |signature_timestamp
//   |signature_nonce
//   |sha256(payload)
//
// 11 fields, pipe-delimited. No schema_version, entity_id, source_updated_at,
// or idempotency_key in the signed string. Payload is hashed, not raw.
//
// Field normalization:
//   - immutable_shared_id: empty string "" if absent
//   - record_version: String(record_version ?? 0) — integer rendered as decimal string
//   - timestamps: ISO 8601 strings as-is
//   - payload hash: lowercase hex sha256 of canonicalized payload JSON

export async function buildCanonicalString(envelope) {
  const payloadHash = await computePayloadHash(envelope.payload || {});
  const parts = [
    envelope.source_application,
    envelope.destination_application,
    envelope.tenant_id,
    envelope.entity_type,
    envelope.immutable_shared_id || "",
    String(envelope.record_version ?? 0),
    envelope.operation,
    envelope.occurred_at,
    envelope.signature_timestamp,
    envelope.signature_nonce,
    payloadHash,
  ];
  return parts.join("|");
}

export async function signEnvelope(envelope, secretName) {
  const secret = secrets.get(secretName);
  if (!secret) throw new Error(`Sync secret not configured: ${secretName}`);
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(await buildCanonicalString(envelope));
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bufToHex(sig);
}

export async function verifySignature(envelope, secretName) {
  const secret = secrets.get(secretName);
  if (!secret) throw new Error(`Sync secret not configured: ${secretName}`);
  if (!envelope.signature || !envelope.signature_timestamp || !envelope.signature_nonce) return false;
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(await buildCanonicalString(envelope));
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
    "event_id", "event_type", "schema_version", "signature_version",
    "source_application", "destination_application", "tenant_id",
    "entity_type", "operation", "occurred_at",
    "signature", "signature_timestamp", "signature_nonce",
  ];
  for (const f of required) {
    if (envelope[f] === undefined || envelope[f] === null || envelope[f] === "") {
      return { valid: false, error: `Missing field: ${f}` };
    }
  }
  // signature_version must be supported
  if (envelope.signature_version !== SIGNATURE_VERSION) {
    return {
      valid: false,
      error: `Unsupported signature_version: ${envelope.signature_version}. Expected ${SIGNATURE_VERSION}.`,
      code: "unsupported_signature_version",
    };
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
  const size = new TextEncoder().encode(serializeCanonicalPayload(envelope.payload || {})).length;
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

// ─── Idempotency key ───
// SHARED format (must match Arriv One exactly):
//   immutable_shared_id|source_updated_at|operation
// No app-local formulas. Both apps construct and evaluate this the same way.

export function generateIdempotencyKey(immutableSharedId, sourceUpdatedAt, operation) {
  return `${immutableSharedId || ""}|${sourceUpdatedAt || ""}|${operation || ""}`;
}

// ─── Shared test vectors ───
// Deterministic vectors that both Arriv One and Estate Media use to verify
// their HMAC implementations produce identical signatures. No real secrets.
// Run computeExpectedSignature() with the same placeholder secret to verify.

export const TEST_VECTORS = [
  {
    name: "contact.create.v1",
    envelope: {
      event_id: "test-evt-0001",
      event_type: "contact.created",
      schema_version: "1.0.0",
      signature_version: "sync_hmac_v1",
      source_application: "arriv_one",
      destination_application: "estate_media",
      tenant_id: "tenant-test-0001",
      entity_type: "Contact",
      entity_id: "remote-contact-001",
      immutable_shared_id: "shared-contact-001",
      operation: "create",
      occurred_at: "2026-01-01T00:00:00.000Z",
      source_updated_at: "2026-01-01T00:00:00.000Z",
      record_version: 1,
      idempotency_key: "shared-contact-001|2026-01-01T00:00:00.000Z|create",
      signature_timestamp: "2026-01-01T00:00:00.000Z",
      signature_nonce: "nonce-test-0001",
      payload: {
        firstname: "Test",
        lastname: "User",
        email: "test@example.com",
        phone: "+15551234567",
        company: "Test Co",
      },
    },
    secret_placeholder: "TEST_SECRET_PLACEHOLDER_DO_NOT_USE_IN_PROD",
    // canonical signing string (unsigned):
    // arriv_one|estate_media|tenant-test-0001|Contact|shared-contact-001|1|create|2026-01-01T00:00:00.000Z|2026-01-01T00:00:00.000Z|nonce-test-0001|<payload_hash>
    // payload_hash = sha256(canonicalizePayload(payload))
    // expected_signature = hmac_sha256(secret_placeholder, canonical_signing_string)
  },
  {
    name: "deal.update.v1",
    envelope: {
      event_id: "test-evt-0002",
      event_type: "deal.updated",
      schema_version: "1.0.0",
      signature_version: "sync_hmac_v1",
      source_application: "estate_media",
      destination_application: "arriv_one",
      tenant_id: "tenant-test-0001",
      entity_type: "Deal",
      entity_id: "local-deal-002",
      immutable_shared_id: "shared-deal-002",
      operation: "update",
      occurred_at: "2026-01-02T12:00:00.000Z",
      source_updated_at: "2026-01-02T12:00:00.000Z",
      record_version: 3,
      idempotency_key: "shared-deal-002|2026-01-02T12:00:00.000Z|update",
      signature_timestamp: "2026-01-02T12:00:00.000Z",
      signature_nonce: "nonce-test-0002",
      payload: {
        status: "won",
        contract_value: 5000,
        title: "Test Deal",
      },
    },
    secret_placeholder: "TEST_SECRET_PLACEHOLDER_DO_NOT_USE_IN_PROD",
  },
];

// Compute the expected signature for a test vector using a placeholder secret.
// Both apps call this with the same vector + secret to confirm identical output.
export async function computeExpectedSignature(envelope, secret) {
  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(await buildCanonicalString(envelope));
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bufToHex(sig);
}

// Compute the canonical signing string for a test vector (for debugging/verification).
export async function getCanonicalStringForTest(envelope) {
  return await buildCanonicalString(envelope);
}