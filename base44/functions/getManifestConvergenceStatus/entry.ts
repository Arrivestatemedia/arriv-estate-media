import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import {
  getStoredVersion,
  getActiveVersion,
  getRuntimeVersion,
  getActiveManifest,
} from "../../shared/manifestRuntime.ts";
import { MANIFEST_ENTRY_TYPES, EM_RUNTIME_VERSION } from "../../shared/manifestFallbacks.ts";

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

    // Try to fetch expected canonical versions from AO
    let expectedVersions = {};
    let aoReachable = false;
    try {
      if (cfg.arriv_one_manifest_endpoint) {
        const response = await fetch(cfg.arriv_one_manifest_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenant_id: tenantId,
            manifest_types: MANIFEST_ENTRY_TYPES,
          }),
        });
        if (response.ok) {
          const remote = await response.json();
          aoReachable = true;
          for (const type of MANIFEST_ENTRY_TYPES) {
            if (remote[type]?.version) {
              expectedVersions[type] = remote[type].version;
            }
          }
        }
      }
    } catch {
      // AO not reachable — expected versions unavailable
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
        aoReachable,
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
      entries: results,
    });
  } catch (error) {
    console.error("getManifestConvergenceStatus error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function classifyConvergence(params) {
  const { storedVersion, activeVersion, runtimeVersion, expected, aoReachable } = params;

  if (!storedVersion && !expected) return "NOT_CONFIGURED";
  if (!storedVersion && expected) return "NOT_CONFIGURED"; // AO has config but EM hasn't received it

  // Check for false convergence: stored but not active (incompatible)
  if (storedVersion && !activeVersion) return "FALLBACK_ACTIVE";

  // Check for full convergence
  if (storedVersion && activeVersion && runtimeVersion) {
    const storedActive = storedVersion === activeVersion;
    const activeRuntime = activeVersion === runtimeVersion;
    if (storedActive && activeRuntime) {
      if (expected && expected === runtimeVersion) return "FULL_RUNTIME_CONVERGENCE";
      if (expected && expected !== runtimeVersion) return "CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE";
      if (!aoReachable) return "FULL_RUNTIME_CONVERGENCE"; // can't compare to expected
    }
  }

  // Stored and active but not yet consumed by runtime
  if (storedVersion && activeVersion && !runtimeVersion) {
    return "CONFIG_CONVERGED_EXECUTION_LOCAL_UNTIL_LATER_PHASE";
  }

  return "FALLBACK_ACTIVE";
}