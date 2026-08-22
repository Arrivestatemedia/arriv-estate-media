import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import {
  getStoredVersion,
  getActiveVersion,
  getRuntimeVersion,
  getActiveManifest,
} from "../../shared/manifestRuntime.ts";
import { MANIFEST_ENTRY_TYPES, EM_RUNTIME_VERSION } from "../../shared/manifestFallbacks.ts";
import { fetchManifestVersions } from "../../shared/manifestPullClient.ts";

// Convergence Status API — admin/operator diagnostic.
// Returns per tenant + entry_type:
//   expected_canonical_version, stored_version, active_version, runtime_version,
//   classification, fallback_used, compatible, last_consumed_at, last_received_at
//
// No sensitive payload contents are returned.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ error: "No tenant config found" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;

    // Fetch expected canonical versions from AO using HMAC pull client.
    // Distinguish network reachability (any HTTP response) from function/auth success (200 OK).
    let expectedVersions = {};
    let aoReachable = false;          // network reachable (any HTTP response received)
    let expectedVersionFetchOk = false; // function returned 200 with valid data
    let expectedVersionError = null;
    try {
      if (cfg.arriv_one_manifest_endpoint) {
        const fetchResult = await fetchManifestVersions(cfg, tenantId, MANIFEST_ENTRY_TYPES);
        // Any HTTP response means the endpoint is network reachable.
        if (fetchResult.status > 0) {
          aoReachable = true;
        }
        if (fetchResult.ok) {
          expectedVersionFetchOk = true;
          const remote = fetchResult.data;
          for (const type of MANIFEST_ENTRY_TYPES) {
            if (remote[type]?.version) {
              expectedVersions[type] = remote[type].version;
            }
          }
        } else {
          expectedVersionError = fetchResult.error || `HTTP ${fetchResult.status}`;
        }
      } else {
        expectedVersionError = "No manifest endpoint configured";
      }
    } catch (error) {
      // Network error — DNS failure, connection timeout, etc. AO truly unreachable.
      aoReachable = false;
      expectedVersionError = `Network error: ${error.message}`;
    }

    const results = [];
    for (const entryType of MANIFEST_ENTRY_TYPES) {
      const storedVersion = await getStoredVersion(base44, tenantId, entryType);
      const activeVersion = await getActiveVersion(base44, tenantId, entryType);
      const runtimeVersion = await getRuntimeVersion(base44, tenantId, entryType);
      const expected = expectedVersions[entryType] || null;

      // Get last consumed/received timestamps
      const logs = await base44.asServiceRole.entities.IntegrationAuditLog.filter({
        action: "manifest_consumed",
        entity_type: entryType,
      });
      const tenantLogs = logs
        .filter((l) => l.session_metadata?.tenant_id === tenantId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const lastConsumedAt = tenantLogs[0]?.timestamp || null;

      const manifests = await base44.asServiceRole.entities.ProductManifestLocal.filter({
        manifest_type: entryType,
      });
      const sortedManifests = manifests.sort((a, b) =>
        new Date(b.received_at || b.fetched_at || 0).getTime() -
        new Date(a.received_at || a.fetched_at || 0).getTime()
      );
      const lastReceivedAt = sortedManifests[0]?.received_at || sortedManifests[0]?.fetched_at || null;

      // Classify convergence
      const classification = classifyConvergence({
        storedVersion,
        activeVersion,
        runtimeVersion,
        expected,
        expectedFetchOk: expectedVersionFetchOk,
      });

      const fallbackUsed = !activeVersion;

      results.push({
        entry_type: entryType,
        expected_canonical_version: expected,
        stored_version: storedVersion,
        active_version: activeVersion,
        runtime_version: runtimeVersion,
        classification,
        fallback_used: fallbackUsed,
        compatible: !!activeVersion,
        last_consumed_at: lastConsumedAt,
        last_received_at: lastReceivedAt,
        em_runtime_version: EM_RUNTIME_VERSION,
      });
    }

    return Response.json({
      success: true,
      tenant_id: tenantId,
      em_runtime_version: EM_RUNTIME_VERSION,
      ao_reachable: aoReachable,
      expected_version_fetch_ok: expectedVersionFetchOk,
      expected_version_error: expectedVersionError,
      entries: results,
    });
  } catch (error) {
    console.error("getManifestConvergenceStatus error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function classifyConvergence(params) {
  const { storedVersion, activeVersion, runtimeVersion, expected, expectedFetchOk } = params;

  // No stored manifest
  if (!storedVersion) {
    // AO expects a version but EM hasn't received it — delivery failure, not "not configured"
    if (expected) return "FALLBACK_ACTIVE";
    // No expected version (fetch failed or AO confirmed no config)
    return "NOT_CONFIGURED";
  }

  // Stored but not active (incompatible or checksum failure)
  if (!activeVersion) return "FALLBACK_ACTIVE";

  // Stored and active
  if (activeVersion && runtimeVersion) {
    const storedActive = storedVersion === activeVersion;
    const activeRuntime = activeVersion === runtimeVersion;
    if (storedActive && activeRuntime) {
      if (expected && expected === runtimeVersion) return "FULL_RUNTIME_CONVERGENCE";
      if (expected && expected !== runtimeVersion) return "CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE";
      // No expected (fetch failed or AO has no config) — stored/active/runtime all match
      return "FULL_RUNTIME_CONVERGENCE";
    }
  }

  // Stored and active but not yet consumed by runtime
  if (activeVersion && !runtimeVersion) {
    return "CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE";
  }

  return "FALLBACK_ACTIVE";
}