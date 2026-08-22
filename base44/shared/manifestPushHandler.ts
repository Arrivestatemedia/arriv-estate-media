// ProductManifest push handler — processes inbound manifest.published events.
//
// This is the PUSH side of the manifest delivery architecture:
//   AO publishes → AO⇄EM HMAC push → EM receiveArrivOneSyncEvent → processManifestPush → ProductManifestLocal
//
// ProductManifestLocal is a READ-ONLY mirror of canonical AO config.
// This handler never mutates canonical version/payload/checksum — it stores what AO sent.
// Receipt is consumption — this handler NEVER creates an outbound EM→AO event (no ping-pong).
//
// Security:
//   - HMAC is verified by receiveArrivOneSyncEvent BEFORE this handler is called
//   - Tenant is resolved from trusted ArrivOneTenantConfig, not client-provided
//   - Checksum is validated before storage
//   - Cross-tenant manifests are rejected
//   - Stale versions do not replace newer versions

import { invalidateManifestCache, compareVersions } from "./manifestRuntime.ts";
import { EM_RUNTIME_VERSION, MANIFEST_ENTRY_TYPES } from "./manifestFallbacks.ts";

export async function processManifestPush(base44, envelope, cfg) {
  const tenantId = cfg.arriv_one_tenant_id;
  const payload = envelope.payload || {};

  const entryType = payload.entry_type;
  const version = payload.version;
  const checksum = payload.checksum;
  const manifestPayload = payload.payload;
  const manifestId = payload.manifest_id;
  const scope = payload.scope || "tenant";
  const compatibleWithMin = payload.compatible_with_min;
  const compatibleWithMax = payload.compatible_with_max;
  const publishedAt = payload.published_at;
  const createdBy = payload.created_by;

  // 1. Validate required fields
  if (!entryType || !version || !checksum || !manifestId) {
    await recordAuditLog(base44, tenantId, entryType || "unknown", version || "", manifestId || "", "manifest_rejected", "warning", envelope, { reason: "missing_required_fields" });
    return { status: "rejected", reason: "Missing required manifest fields (entry_type, version, checksum, manifest_id)", manifestType: entryType || "unknown", version: version || "", manifestId: manifestId || "" };
  }

  // 2. Validate entry type is supported
  if (!MANIFEST_ENTRY_TYPES.includes(entryType)) {
    await recordAuditLog(base44, tenantId, entryType, version, manifestId, "manifest_rejected", "warning", envelope, { reason: "unknown_manifest_type" });
    return { status: "rejected", reason: `Unknown manifest type: ${entryType}`, manifestType: entryType, version, manifestId };
  }

  // 3. Enforce tenant scope — reject another tenant's private manifest
  if (scope === "tenant" && envelope.tenant_id !== tenantId) {
    await recordAuditLog(base44, tenantId, entryType, version, manifestId, "manifest_rejected", "warning", envelope, { reason: "cross_tenant_rejected" });
    return { status: "rejected", reason: "Cross-tenant manifest rejected", manifestType: entryType, version, manifestId };
  }

  const recordTenantId = scope === "global" ? "global" : tenantId;

  // 4. Check for duplicates (idempotency: manifest_id + version + checksum)
  const existing = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    tenant_id: recordTenantId,
    manifest_type: entryType,
    manifest_version: version,
    scope: scope,
  });
  const duplicate = existing.find((m) => m.checksum === checksum);
  if (duplicate) {
    // Idempotent no-op — no duplicate record, no re-activation, no side effect
    return { status: "rejected_duplicate", reason: "Duplicate manifest (manifest_id+version+checksum) — idempotent no-op", manifestType: entryType, version, manifestId };
  }

  // 5. Validate checksum (payload integrity)
  const computedChecksum = await computeChecksum(JSON.stringify(manifestPayload || {}));
  if (computedChecksum !== checksum) {
    // Store as rejected for audit trail, but do NOT activate
    await storeManifest(base44, {
      tenantId, entryType, version, checksum, payload: manifestPayload,
      manifestId, scope, compatibleWithMin, compatibleWithMax,
      publishedAt, createdBy, applyStatus: "rejected",
    });
    await recordAuditLog(base44, tenantId, entryType, version, manifestId, "checksum_mismatch", "warning", envelope, { scope });
    console.warn(`[MANIFEST_SECURITY] Checksum mismatch rejected: type="${entryType}" version="${version}" tenant="${tenantId}"`);
    return { status: "rejected", reason: "Checksum mismatch — manifest rejected", manifestType: entryType, version, manifestId };
  }

  // 6. Check for stale version — older version must NOT replace newer
  const existingApplied = await base44.asServiceRole.entities.ProductManifestLocal.filter({
    tenant_id: recordTenantId,
    manifest_type: entryType,
    scope: scope,
    apply_status: "applied",
  });
  if (existingApplied.length > 0) {
    const highestStored = existingApplied
      .sort((a, b) => compareVersions(b.manifest_version, a.manifest_version))[0];
    if (compareVersions(version, highestStored.manifest_version) < 0) {
      // Stale — store as pending_review (historical storage, not activated)
      await storeManifest(base44, {
        tenantId, entryType, version, checksum, payload: manifestPayload,
        manifestId, scope, compatibleWithMin, compatibleWithMax,
        publishedAt, createdBy, applyStatus: "pending_review",
      });
      await recordAuditLog(base44, tenantId, entryType, version, manifestId, "stale_version", "warning", envelope, { scope, storedVersion: highestStored.manifest_version });
      return { status: "rejected_stale", reason: `Stale version ${version} < stored ${highestStored.manifest_version}`, manifestType: entryType, version, manifestId };
    }
  }

  // 7. Validate compatibility
  let applyStatus = "applied";
  let compatible = true;
  if (compatibleWithMin && compareVersions(EM_RUNTIME_VERSION, compatibleWithMin) < 0) {
    applyStatus = "incompatible";
    compatible = false;
  }
  if (compatibleWithMax && compareVersions(EM_RUNTIME_VERSION, compatibleWithMax) > 0) {
    applyStatus = "incompatible";
    compatible = false;
  }

  // 8. Store the manifest (new version record — preserves version history)
  await storeManifest(base44, {
    tenantId, entryType, version, checksum, payload: manifestPayload,
    manifestId, scope, compatibleWithMin, compatibleWithMax,
    publishedAt, createdBy, applyStatus,
  });

  // 9. Invalidate cache for this entry type + tenant
  invalidateManifestCache(tenantId, entryType);

  // 10. Record audit log
  await recordAuditLog(base44, tenantId, entryType, version, manifestId, compatible ? "manifest_stored" : "manifest_incompatible", compatible ? "success" : "warning", envelope, { applyStatus, scope, compatible });

  return {
    status: "applied",
    manifestType: entryType,
    version,
    manifestId,
    compatible,
    applyStatus,
    scope,
  };
}

// Shared storage function — used by both push handler and pull reconciliation.
// ProductManifestLocal is a READ-ONLY mirror; this never mutates canonical fields.
export async function storeManifest(base44, params) {
  const {
    tenantId, entryType, version, checksum, payload,
    manifestId, scope, compatibleWithMin, compatibleWithMax,
    publishedAt, createdBy, applyStatus,
  } = params;

  const recordTenantId = scope === "global" ? "global" : tenantId;
  const now = new Date().toISOString();

  return await base44.asServiceRole.entities.ProductManifestLocal.create({
    tenant_id: recordTenantId,
    manifest_type: entryType,
    manifest_version: version,
    manifest_id: manifestId || `em_${entryType}_${version}`,
    scope: scope,
    checksum,
    payload: payload || {},
    apply_status: applyStatus,
    compatible_with_min: compatibleWithMin || "",
    compatible_with_max: compatibleWithMax || "",
    origin_application: "arriv_one",
    created_by: createdBy || "",
    published_at: publishedAt || now,
    received_at: now,
    fetched_at: now,
    applied_at: applyStatus === "applied" ? now : "",
  });
}

async function recordAuditLog(base44, tenantId, entryType, version, manifestId, action, result, envelope, extra = {}) {
  try {
    await base44.asServiceRole.entities.IntegrationAuditLog.create({
      event_id: crypto.randomUUID(),
      actor: "manifest_push_handler",
      action,
      entity_type: entryType,
      entity_id: manifestId || version,
      source_application: "arriv_one",
      destination_application: "arriv_estate_media",
      timestamp: new Date().toISOString(),
      result,
      session_metadata: {
        tenant_id: tenantId,
        manifest_type: entryType,
        version,
        manifest_id: manifestId,
        inbound_event_id: envelope?.event_id || null,
        ...extra,
      },
    });
  } catch {
    // non-critical — audit logging fails open
  }
}

export async function computeChecksum(data) {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}