import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { invalidateManifestCache, compareVersions } from "../../shared/manifestRuntime.ts";
import { EM_RUNTIME_VERSION, MANIFEST_ENTRY_TYPES } from "../../shared/manifestFallbacks.ts";
import { fetchManifestContent } from "../../shared/manifestPullClient.ts";
import { storeManifest, computeChecksum } from "../../shared/manifestPushHandler.ts";

const SUPPORTED_MANIFEST_TYPES = MANIFEST_ENTRY_TYPES;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const manifestType = body?.manifest_type;

    if (!manifestType || !SUPPORTED_MANIFEST_TYPES.includes(manifestType)) {
      return Response.json({ error: "Invalid manifest_type" }, { status: 400 });
    }

    // Admin-only: manifest receipt is a privileged operation
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg || !cfg.arriv_one_manifest_endpoint) {
      return Response.json({ error: "No manifest endpoint configured" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;

    // Fetch the full manifest payload from Arriv One using HMAC pull client
    const fetchResult = await fetchManifestContent(cfg, tenantId, manifestType);

    if (!fetchResult.ok) {
      return Response.json({ error: `Manifest endpoint fetch failed: ${fetchResult.error}` }, { status: 502 });
    }

    const manifest = fetchResult.data;
    const {
      version,
      checksum,
      payload,
      manifest_id,
      scope = "tenant",
      compatible_with_min,
      compatible_with_max,
      published_at,
      created_by,
    } = manifest;

    if (!version || !checksum) {
      return Response.json({ error: "Invalid manifest response — missing version or checksum" }, { status: 502 });
    }

    // Verify checksum (payload integrity)
    const computedChecksum = await computeChecksum(JSON.stringify(payload || {}));
    if (computedChecksum !== checksum) {
      // Store as rejected (checksum failure)
      await storeManifest(base44, {
        tenantId, manifestType, version, checksum, payload,
        manifest_id, scope, compatible_with_min, compatible_with_max,
        published_at, created_by, applyStatus: "rejected",
      });
      console.warn(`[MANIFEST_SECURITY] Checksum mismatch rejected: type="${manifestType}" version="${version}" tenant="${tenantId}"`);
      return Response.json({ success: false, reason: "Checksum mismatch — manifest rejected", version });
    }

    // Duplicate protection: check if this exact version+checksum already exists
    const existingSameVersion = await base44.asServiceRole.entities.ProductManifestLocal.filter({
      tenant_id: scope === "global" ? "global" : tenantId,
      manifest_type: manifestType,
      manifest_version: version,
      scope: scope,
    });
    const duplicate = existingSameVersion.find((m) => m.checksum === checksum);
    if (duplicate) {
      // Duplicate — no side effects, no re-activation
      return Response.json({
        success: true,
        manifest_type: manifestType,
        version,
        duplicate: true,
        applied: false,
        reason: "Duplicate version+checksum — no action taken",
      });
    }

    // Stale version protection: if incoming version < highest stored applied version, reject as stale
    const existingApplied = await base44.asServiceRole.entities.ProductManifestLocal.filter({
      tenant_id: scope === "global" ? "global" : tenantId,
      manifest_type: manifestType,
      scope: scope,
      apply_status: "applied",
    });
    if (existingApplied.length > 0) {
      const highestStored = existingApplied
        .sort((a, b) => compareVersions(b.manifest_version, a.manifest_version))[0];
      if (compareVersions(version, highestStored.manifest_version) < 0) {
        // Stale — store as pending_review (not activated)
        await storeManifest(base44, {
          tenantId, manifestType, version, checksum, payload,
          manifest_id, scope, compatible_with_min, compatible_with_max,
          published_at, created_by, applyStatus: "pending_review",
        });
        console.warn(`[MANIFEST_SECURITY] Stale version rejected: type="${manifestType}" incoming="${version}" stored="${highestStored.manifest_version}" tenant="${tenantId}"`);
        return Response.json({
          success: false,
          reason: `Stale version ${version} < stored ${highestStored.manifest_version}`,
          version,
          stale: true,
        });
      }
    }

    // Compatibility validation
    let applyStatus = "applied";
    let compatible = true;
    if (compatible_with_min && compareVersions(EM_RUNTIME_VERSION, compatible_with_min) < 0) {
      applyStatus = "incompatible";
      compatible = false;
    }
    if (compatible_with_max && compareVersions(EM_RUNTIME_VERSION, compatible_with_max) > 0) {
      applyStatus = "incompatible";
      compatible = false;
    }

    // Store the manifest (new version record — preserves version history)
    const stored = await storeManifest(base44, {
      tenantId, manifestType, version, checksum, payload,
      manifest_id, scope, compatible_with_min, compatible_with_max,
      published_at, created_by, applyStatus,
    });

    // Invalidate cache for this entry type
    invalidateManifestCache(tenantId, manifestType);

    // Update tenant config manifest version (only if compatible/applied)
    if (compatible) {
      await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, {
        arriv_one_manifest_version: version,
      });
    }

    // Audit log
    await base44.asServiceRole.entities.IntegrationAuditLog.create({
      event_id: crypto.randomUUID(),
      actor: "manifest_receiver",
      action: "manifest_received",
      entity_type: manifestType,
      entity_id: manifest_id || version,
      source_application: "arriv_one",
      destination_application: "arriv_estate_media",
      timestamp: new Date().toISOString(),
      result: compatible ? "success" : "warning",
      session_metadata: {
        tenant_id: tenantId,
        manifest_type: manifestType,
        version,
        checksum_match: true,
        compatible,
        apply_status: applyStatus,
        scope,
        em_runtime_version: EM_RUNTIME_VERSION,
      },
    });

    return Response.json({
      success: true,
      manifest_type: manifestType,
      version,
      manifest_id: manifest_id || stored.id,
      applied: compatible,
      apply_status: applyStatus,
      compatible,
      scope,
    });
  } catch (error) {
    console.error("consumeArrivOneProductManifest error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}