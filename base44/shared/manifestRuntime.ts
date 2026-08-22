// ProductManifest canonical runtime accessor.
//
// This is the SINGLE shared Estate Media accessor for resolving canonical
// Arriv One ProductManifest configuration at runtime. All runtime
// ProductManifest consumption must go through getActiveManifest().
//
// Resolution order:
//   1. Find compatible PUBLISHED (apply_status=applied) tenant-specific manifest
//   2. If none, find compatible PUBLISHED global manifest
//   3. Select highest valid version
//   4. Validate compatibility (compatible_with_min/max vs EM_RUNTIME_VERSION)
//   5. Validate checksum if present
//   6. Return manifest or safe fallback
//
// Tenant-specific config overrides global config.
// Fallback usage is always observable (fallback_used = true) and telemetry is recorded.
//
// ProductManifestLocal is a READ-ONLY mirror of canonical AO config.
// This accessor never mutates canonical payload/version fields.

import { EM_RUNTIME_VERSION, getFallback } from "./manifestFallbacks.ts";

// In-memory cache (best-effort per instance; serverless may not persist).
// Key: `${tenantId}:${entryType}`
const manifestCache = new Map<string, { value: any; cachedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ManifestResolution {
  manifest_id: string;
  entry_type: string;
  version: string | null;
  payload: any;
  scope: "tenant" | "global" | "fallback";
  source: "product_manifest" | "fallback";
  fallback_used: boolean;
  fallback_reason?: string;
  manifest_record_id?: string;
  compatible: boolean;
}

// Invalidate cache for a specific tenant+entryType (called on new manifest receipt).
export function invalidateManifestCache(tenantId: string, entryType?: string) {
  if (entryType) {
    manifestCache.delete(`${tenantId}:${entryType}`);
  } else {
    for (const key of manifestCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) manifestCache.delete(key);
    }
  }
}

// Main accessor — resolves the active canonical manifest for a given entry type.
export async function getActiveManifest(
  base44: any,
  entryType: string,
  tenantId: string,
  options: { runtimePath?: string; bypassCache?: boolean } = {}
): Promise<ManifestResolution> {
  const cacheKey = `${tenantId}:${entryType}`;
  const runtimePath = options.runtimePath || "unknown";

  // Check cache (unless bypassed)
  if (!options.bypassCache) {
    const cached = manifestCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      // Record telemetry for cached hit (still a real consumption)
      await recordTelemetry(base44, entryType, tenantId, cached.value, runtimePath);
      return cached.value;
    }
  }

  try {
    // 1. Find compatible+valid tenant-specific manifest (iterates versions high→low)
    let manifest = await findValidManifest(base44, tenantId, entryType, "tenant");

    // 2. If none, find compatible+valid global manifest
    let scope: "tenant" | "global" = "tenant";
    if (!manifest) {
      manifest = await findValidManifest(base44, tenantId, entryType, "global");
      scope = "global";
    }

    let result: ManifestResolution;

    if (manifest) {
      result = {
        manifest_id: manifest.manifest_id || manifest.id,
        entry_type: entryType,
        version: manifest.manifest_version,
        payload: manifest.payload || {},
        scope: scope,
        source: "product_manifest",
        fallback_used: false,
        manifest_record_id: manifest.id,
        compatible: true,
      };
      // Update last_consumed_at
      await touchLastConsumed(base44, manifest.id);
    } else {
      result = buildFallback(entryType, "no_compatible_manifest");
    }

    // Cache the result
    manifestCache.set(cacheKey, { value: result, cachedAt: Date.now() });

    // Record telemetry
    await recordTelemetry(base44, entryType, tenantId, result, runtimePath);

    return result;
  } catch (error) {
    // Accessor failure — use fallback
    const result = buildFallback(entryType, "accessor_error");
    manifestCache.set(cacheKey, { value: result, cachedAt: Date.now() });
    await recordTelemetry(base44, entryType, tenantId, result, runtimePath);
    return result;
  }
}

function buildFallback(entryType: string, reason: string): ManifestResolution {
  return {
    manifest_id: `fallback:${entryType}`,
    entry_type: entryType,
    version: null,
    payload: getFallback(entryType),
    scope: "fallback",
    source: "fallback",
    fallback_used: true,
    fallback_reason: reason,
    compatible: false,
  };
}

// Find the highest-version compatible+checksum-valid PUBLISHED manifest for a scope.
// Iterates versions high→low, returning the first that passes both compatibility and checksum.
// Manifests with checksum failures are marked "rejected" and skipped.
async function findValidManifest(
  base44: any,
  tenantId: string,
  entryType: string,
  scope: "tenant" | "global"
): Promise<any | null> {
  const filterScope = scope === "tenant" ? tenantId : "global";
  const records = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    tenant_id: filterScope,
    manifest_type: entryType,
    scope: scope,
    apply_status: "applied",
  });

  if (records.length === 0) return null;

  // Sort by version descending
  const sorted = records.sort((a: any, b: any) =>
    compareVersions(b.manifest_version, a.manifest_version)
  );

  // Find the first compatible+checksum-valid one (highest version that passes both)
  for (const record of sorted) {
    if (!isCompatible(record)) continue;
    const checksumValid = await validateChecksum(record);
    if (!checksumValid) {
      // Mark as rejected and continue to next version
      await markManifestStatus(base44, record.id, "rejected");
      continue;
    }
    return record;
  }

  // No compatible+valid version found
  return null;
}

function isCompatible(record: any): boolean {
  const min = record.compatible_with_min;
  const max = record.compatible_with_max;
  if (min && compareVersions(EM_RUNTIME_VERSION, min) < 0) return false;
  if (max && compareVersions(EM_RUNTIME_VERSION, max) > 0) return false;
  return true;
}

async function validateChecksum(record: any): Promise<boolean> {
  if (!record.checksum) return true; // no checksum to validate
  const computed = await computeChecksum(JSON.stringify(record.payload || {}));
  return computed === record.checksum;
}

async function computeChecksum(data: string): Promise<string> {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function touchLastConsumed(base44: any, recordId: string) {
  try {
    await base44.asServiceRole.entities.ProductManifestLocal.update(recordId, {
      last_consumed_at: new Date().toISOString(),
    });
  } catch {
    // non-critical — telemetry is the primary record
  }
}

async function markManifestStatus(base44: any, recordId: string, status: string) {
  try {
    await base44.asServiceRole.entities.ProductManifestLocal.update(recordId, {
      apply_status: status,
    });
  } catch {
    // non-critical
  }
}

// Record telemetry to IntegrationAuditLog.
// Telemetry failure fails open (does not block manifest consumption).
async function recordTelemetry(
  base44: any,
  entryType: string,
  tenantId: string,
  result: ManifestResolution,
  runtimePath: string
) {
  try {
    await base44.asServiceRole.entities.IntegrationAuditLog.create({
      event_id: crypto.randomUUID(),
      actor: "manifest_runtime",
      action: "manifest_consumed",
      entity_type: entryType,
      entity_id: result.manifest_id || "fallback",
      source_application: "arriv_estate_media",
      destination_application: "arriv_one",
      timestamp: new Date().toISOString(),
      result: result.fallback_used ? "warning" : "success",
      session_metadata: {
        tenant_id: tenantId,
        entry_type: entryType,
        manifest_id: result.manifest_id || null,
        version: result.version || null,
        consumer_application: "arriv_estate_media",
        runtime_path: runtimePath,
        fallback_used: result.fallback_used,
        fallback_reason: result.fallback_reason || null,
        scope: result.scope,
        em_runtime_version: EM_RUNTIME_VERSION,
      },
    });
  } catch {
    // Telemetry failure fails open — do not block manifest consumption
  }
}

// Simple semver-like version comparison.
// Returns: 1 if a > b, -1 if a < b, 0 if equal.
export function compareVersions(a: string, b: string): number {
  if (!a) return -1;
  if (!b) return 1;
  const partsA = a.split(".").map((n) => parseInt(n, 10) || 0);
  const partsB = b.split(".").map((n) => parseInt(n, 10) || 0);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// STORED_VERSION: highest published version received/stored locally for a type/scope.
export async function getStoredVersion(
  base44: any,
  tenantId: string,
  entryType: string
): Promise<string | null> {
  const tenantRecords = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    tenant_id: tenantId,
    manifest_type: entryType,
    apply_status: "applied",
  });
  const globalRecords = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    tenant_id: "global",
    manifest_type: entryType,
    apply_status: "applied",
  });
  const all = [...tenantRecords, ...globalRecords];
  if (all.length === 0) return null;
  const sorted = all.sort((a: any, b: any) =>
    compareVersions(b.manifest_version, a.manifest_version)
  );
  return sorted[0].manifest_version;
}

// ACTIVE_VERSION: version selected by getActiveManifest after compatibility validation.
export async function getActiveVersion(
  base44: any,
  tenantId: string,
  entryType: string
): Promise<string | null> {
  const result = await getActiveManifest(base44, entryType, tenantId, {
    runtimePath: "getActiveVersion:diagnostic",
    bypassCache: true,
  });
  return result.version;
}

// RUNTIME_VERSION: version ACTUALLY consumed by the executing runtime.
// Determined by querying the last telemetry record for this entry type.
export async function getRuntimeVersion(
  base44: any,
  tenantId: string,
  entryType: string
): Promise<string | null> {
  const logs = await base44.asServiceRole.entities.IntegrationAuditLog.filter({
    action: "manifest_consumed",
    entity_type: entryType,
  });
  if (logs.length === 0) return null;
  // Find the most recent log for this tenant
  const tenantLogs = logs
    .filter((l: any) => l.session_metadata?.tenant_id === tenantId)
    .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  if (tenantLogs.length === 0) return null;
  return tenantLogs[0].session_metadata?.version || null;
}