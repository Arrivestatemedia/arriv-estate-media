// Shared HMAC signing utilities for Arriv Payroll API calls.
// Used by manageTimeOff, provisionPayrollCompany, and any future payroll proxy.

const enc = new TextEncoder();

export function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(sig);
}

export function canonicalString({ body, timestamp, requestId, sourceAppId }) {
  return [body || "", timestamp || "", requestId || "", sourceAppId || ""].join("\n");
}

export async function signRequest(secret, { body, timestamp, requestId, sourceAppId }) {
  return signPayload(secret, canonicalString({ body, timestamp, requestId, sourceAppId }));
}

// Build the signed headers for an outbound Arriv Payroll API call.
export async function buildSignedHeaders(secret, bodyStr, sourceAppId = "arriv-estate-media") {
  const now = new Date().toISOString();
  const requestId = "req_" + crypto.randomUUID();
  const signature = await signRequest(secret, { body: bodyStr, timestamp: now, requestId, sourceAppId });
  return {
    "Content-Type": "application/json",
    "X-Arriv-Signature": signature,
    "X-Arriv-Timestamp": now,
    "X-Arriv-Request-Id": requestId,
    "X-Arriv-Source-App": sourceAppId,
  };
}