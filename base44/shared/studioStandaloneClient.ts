// HMAC-secured client for Arriv Studio's standalone flyer API.
// Signs each request with ARRIV_STUDIO_AUTH_SECRET (HMAC-SHA256) using the
// stable-stringify + `<timestamp>.<payload>` contract documented in the
// Arriv Studio → Estate Media Integration Guide. Shared so every backend
// function that talks to Studio uses identical signing logic.

import { secrets } from "base44:runtime";

export function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(obj).sort()
    .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Call an Arriv Studio standalone endpoint.
 * @param functionName e.g. "listFlyersStandalone"
 * @param payload business fields (no auth fields — those are added here)
 */
export async function callStudio(functionName, payload) {
  const secret = secrets.get("ARRIV_STUDIO_AUTH_SECRET");
  if (!secret) throw new Error("ARRIV_STUDIO_AUTH_SECRET not configured");
  const base = (secrets.get("ARRIV_STUDIO_STANDALONE_BASE_URL") || "https://arrive-studio-pro.base44.app").replace(/\/+$/, "");

  const timestamp = String(Date.now());
  const message = `${timestamp}.${stableStringify(payload)}`;
  const sig = await hmacHex(secret, message);
  const body = { ...payload, auth_timestamp: timestamp, auth_signature: `v1=${sig}` };

  const res = await fetch(`${base}/functions/${functionName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); } catch (e) { data = {}; }
  if (!res.ok) {
    throw new Error(data.error || `Studio API error (${res.status})`);
  }
  return data;
}