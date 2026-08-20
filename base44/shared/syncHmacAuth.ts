// HMAC authentication for cross-app GET requests (reconciliation, status checks).
// Extends the sync_hmac_v1 contract for request/response endpoints that don't
// carry a POST envelope body. Both Arriv One and Estate Media must implement
// the exact same canonical string and header names.
//
// Canonical signing string (7 fields, pipe-delimited):
//   source_application|destination_application|tenant_id|method|path|signature_timestamp|signature_nonce
//
// Headers:
//   X-Arriv-Signature-Version: sync_hmac_v1
//   X-Arriv-Source-Application: estate_media
//   X-Arriv-Destination-Application: arriv_one
//   X-Arriv-Tenant-Id: <tenant_id>
//   X-Arriv-Signature-Timestamp: <ISO 8601>
//   X-Arriv-Signature-Nonce: <random hex>
//   X-Arriv-Signature: <hex hmac>

import { secrets } from "base44:runtime";
import { SIGNATURE_VERSION } from "./syncEntityAdapters.ts";

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

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

function buildGetCanonicalString({ sourceApplication, destinationApplication, tenantId, method, path, signatureTimestamp, signatureNonce }) {
  return [
    sourceApplication,
    destinationApplication,
    tenantId,
    method.toUpperCase(),
    path,
    signatureTimestamp,
    signatureNonce,
  ].join("|");
}

/**
 * Sign a GET request and return the headers to attach to the fetch call.
 * Uses the OUTBOUND secret (Estate Media → Arriv One direction).
 */
export async function signGetRequest({ tenantId, method, path, secretName }) {
  const secret = secrets.get(secretName);
  if (!secret) throw new Error(`Sync secret not configured: ${secretName}`);

  const sourceApplication = "estate_media";
  const destinationApplication = "arriv_one";
  const signatureTimestamp = new Date().toISOString();
  const signatureNonce = crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36);

  const canonical = buildGetCanonicalString({
    sourceApplication,
    destinationApplication,
    tenantId,
    method,
    path,
    signatureTimestamp,
    signatureNonce,
  });

  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(canonical);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const signature = bufToHex(sig);

  return {
    "X-Arriv-Signature-Version": SIGNATURE_VERSION,
    "X-Arriv-Source-Application": sourceApplication,
    "X-Arriv-Destination-Application": destinationApplication,
    "X-Arriv-Tenant-Id": tenantId,
    "X-Arriv-Signature-Timestamp": signatureTimestamp,
    "X-Arriv-Signature-Nonce": signatureNonce,
    "X-Arriv-Signature": signature,
    "Accept": "application/json",
  };
}

/**
 * Verify an inbound GET request's HMAC signature.
 * Used by Arriv One to verify Estate Media's reconciliation/status requests.
 * Uses the INBOUND secret (Arriv One's perspective: inbound from Estate Media).
 */
export async function verifyGetRequest(req, { expectedTenantId, secretName }) {
  const secret = secrets.get(secretName);
  if (!secret) throw new Error(`Sync secret not configured: ${secretName}`);

  const signatureVersion = req.headers.get("X-Arriv-Signature-Version");
  if (signatureVersion !== SIGNATURE_VERSION) {
    return { valid: false, error: `Unsupported signature version: ${signatureVersion}` };
  }

  const sourceApplication = req.headers.get("X-Arriv-Source-Application") || "";
  const destinationApplication = req.headers.get("X-Arriv-Destination-Application") || "";
  const tenantId = req.headers.get("X-Arriv-Tenant-Id") || "";
  const signatureTimestamp = req.headers.get("X-Arriv-Signature-Timestamp") || "";
  const signatureNonce = req.headers.get("X-Arriv-Signature-Nonce") || "";
  const receivedSignature = req.headers.get("X-Arriv-Signature") || "";

  if (!receivedSignature || !signatureTimestamp || !signatureNonce) {
    return { valid: false, error: "Missing signature headers" };
  }

  if (tenantId !== expectedTenantId) {
    return { valid: false, error: `Tenant mismatch: expected ${expectedTenantId}, got ${tenantId}` };
  }

  // Timestamp freshness (replay protection)
  const ts = new Date(signatureTimestamp).getTime();
  if (isNaN(ts)) return { valid: false, error: "Invalid signature_timestamp" };
  if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) {
    return { valid: false, error: "Timestamp outside tolerance" };
  }

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const canonical = buildGetCanonicalString({
    sourceApplication,
    destinationApplication,
    tenantId,
    method,
    path,
    signatureTimestamp,
    signatureNonce,
  });

  const key = await hmacKey(secret);
  const data = new TextEncoder().encode(canonical);
  const expected = await crypto.subtle.sign("HMAC", key, data);
  const expectedHex = bufToHex(expected);

  // Constant-time comparison
  if (expectedHex.length !== receivedSignature.length) return { valid: false, error: "Signature length mismatch" };
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) diff |= expectedHex.charCodeAt(i) ^ receivedSignature.charCodeAt(i);
  if (diff !== 0) return { valid: false, error: "Signature mismatch" };

  return { valid: true, sourceApplication, tenantId };
}