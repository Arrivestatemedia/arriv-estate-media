// ProductManifest pull client — HMAC-authenticated calls to Arriv One.
//
// This is the PULL side of the manifest delivery architecture:
//   EM reconciliation → AO getProductManifestVersions (HMAC) → compare → fetch content (HMAC) → store
//
// Push is PRIMARY. Pull is RECONCILIATION / SELF-HEALING.
//
// Security:
//   - Uses sync_hmac_v1 HMAC signatures (signGetRequest from syncHmacAuth.ts)
//   - Uses the OUTBOUND secret (ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET)
//   - No Base44 user session auth — pure service-to-service
//   - No browser/frontend direct HTTP — backend only
//
// Both Arriv One and Estate Media implement the exact same HMAC canonical string.

import { signGetRequest } from "./syncHmacAuth.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

/**
 * Fetch manifest version metadata from AO for all specified manifest types.
 * Returns { ok, status, data, error }.
 * data is a map of manifest_type → { version, checksum, manifest_id, scope, ... }
 */
export async function fetchManifestVersions(cfg, tenantId, manifestTypes) {
  const endpoint = cfg.arriv_one_manifest_endpoint;
  if (!endpoint) {
    return { ok: false, status: 0, error: "No manifest endpoint configured" };
  }

  try {
    const url = new URL(endpoint);
    const path = url.pathname;

    const hmacHeaders = await signGetRequest({
      tenantId,
      method: "POST",
      path,
      secretName: OUTBOUND_SECRET,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...hmacHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        manifest_types: manifestTypes,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}: ${errorBody.substring(0, 200)}`,
      };
    }

    const data = await response.json();
    return { ok: true, status: 200, data };
  } catch (error) {
    return { ok: false, status: 0, error: `Network error: ${error.message}` };
  }
}

/**
 * Fetch full manifest content (including payload) from AO for a specific manifest type.
 * Returns { ok, status, data, error }.
 * data is the full manifest object: { manifest_id, version, checksum, payload, scope, ... }
 */
export async function fetchManifestContent(cfg, tenantId, manifestType) {
  const endpoint = cfg.arriv_one_manifest_endpoint;
  if (!endpoint) {
    return { ok: false, status: 0, error: "No manifest endpoint configured" };
  }

  try {
    const url = new URL(endpoint);
    const path = url.pathname;

    const hmacHeaders = await signGetRequest({
      tenantId,
      method: "POST",
      path,
      secretName: OUTBOUND_SECRET,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...hmacHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        manifest_type: manifestType,
        include_payload: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}: ${errorBody.substring(0, 200)}`,
      };
    }

    const data = await response.json();
    return { ok: true, status: 200, data };
  } catch (error) {
    return { ok: false, status: 0, error: `Network error: ${error.message}` };
  }
}

/**
 * Fetch manifest content for a specific version (if AO supports version-specific fetch).
 */
export async function fetchManifestVersion(cfg, tenantId, manifestType, version) {
  const endpoint = cfg.arriv_one_manifest_endpoint;
  if (!endpoint) {
    return { ok: false, status: 0, error: "No manifest endpoint configured" };
  }

  try {
    const url = new URL(endpoint);
    const path = url.pathname;

    const hmacHeaders = await signGetRequest({
      tenantId,
      method: "POST",
      path,
      secretName: OUTBOUND_SECRET,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...hmacHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        manifest_type: manifestType,
        version: version,
        include_payload: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}: ${errorBody.substring(0, 200)}`,
      };
    }

    const data = await response.json();
    return { ok: true, status: 200, data };
  } catch (error) {
    return { ok: false, status: 0, error: `Network error: ${error.message}` };
  }
}