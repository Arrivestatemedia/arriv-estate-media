// getKhethaIQEmbedData/entry.ts
// Data endpoint for the embedded main KhethaIQ app to fetch Estate Media's
// recruiting data (jobs, candidates, applications). Called by the main
// KhethaIQ app when it detects it's embedded with calling_application=
// ARRIV_ESTATE_MEDIA.
//
// Authentication: validates the SSO token (signed with
// ARRIV_ESTATE_MEDIA_SECRET) passed in the Authorization header, OR the
// KHETHAIQ_API_KEY for server-to-server calls from the main app.
//
// Returns:
//   { jobs: [...], candidates: [...], applications: [...] }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

async function hmacSha256(data: string, secret: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return new Uint8Array(sig);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function validateSSOToken(token: string): Promise<boolean> {
  const secret = secrets.get("ARRIV_ESTATE_MEDIA_SECRET");
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const expectedSig = await hmacSha256(payloadB64, secret);
  const expectedSigB64 = base64UrlEncode(expectedSig);
  if (expectedSigB64 !== sigB64) return false;
  try {
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && Date.now() > payload.exp) return false;
    if (payload.calling_application !== "ARRIV_ESTATE_MEDIA") return false;
    return true;
  } catch (_) {
    return false;
  }
}

export default async function(req) {
  try {
    // Authenticate
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    let authorized = false;
    if (token) {
      authorized = await validateSSOToken(token);
    }
    if (!authorized) {
      const apiKey = req.headers.get("x-khethaiq-api-key") || "";
      if (apiKey && apiKey === secrets.get("KHETHAIQ_API_KEY")) {
        authorized = true;
      }
    }

    if (!authorized) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);

    // Fetch all Estate Media recruiting data
    const [jobsRes, candidatesRes, applicationsRes] = await Promise.all([
      base44.asServiceRole.entities.HireJob.list("-created_date", 200),
      base44.asServiceRole.entities.HireCandidate.list("-created_date", 500),
      base44.asServiceRole.entities.JobApplication.list("-created_date", 500),
    ]);

    const jobs = jobsRes?.data ?? jobsRes ?? [];
    const candidates = candidatesRes?.data ?? candidatesRes ?? [];
    const applications = applicationsRes?.data ?? applicationsRes ?? [];

    return Response.json({
      tenant_id: "arriv_estate_media",
      calling_application: "ARRIV_ESTATE_MEDIA",
      jobs: Array.isArray(jobs) ? jobs : [],
      candidates: Array.isArray(candidates) ? candidates : [],
      applications: Array.isArray(applications) ? applications : [],
    });
  } catch (error) {
    console.error("getKhethaIQEmbedData error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}