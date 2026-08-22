import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { MANIFEST_ENTRY_TYPES } from "../../shared/manifestFallbacks.ts";
import { fetchManifestVersions } from "../../shared/manifestPullClient.ts";

const SUPPORTED_MANIFEST_TYPES = MANIFEST_ENTRY_TYPES;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg || !cfg.arriv_one_manifest_endpoint) {
      return Response.json({ error: "No manifest endpoint configured" }, { status: 503 });
    }

    // Fetch version info from Arriv One using HMAC pull client
    const fetchResult = await fetchManifestVersions(cfg, cfg.arriv_one_tenant_id, SUPPORTED_MANIFEST_TYPES);

    if (!fetchResult.ok) {
      return Response.json({ error: `Manifest endpoint fetch failed: ${fetchResult.error}` }, { status: 502 });
    }

    const remoteVersions = fetchResult.data;

    // Compare with local versions
    const localManifests = await base44.asServiceRole.entities.ProductManifestLocal.filter({
      tenant_id: cfg.arriv_one_tenant_id,
    });

    const localVersionMap = {};
    for (const m of localManifests) {
      localVersionMap[m.manifest_type] = m;
    }

    const updates = [];
    for (const type of SUPPORTED_MANIFEST_TYPES) {
      const remoteVersion = remoteVersions[type]?.version;
      const remoteChecksum = remoteVersions[type]?.checksum;
      if (!remoteVersion) continue;
      const local = localVersionMap[type];
      if (!local || local.manifest_version !== remoteVersion) {
        updates.push({
          manifest_type: type,
          current_version: local?.manifest_version || "none",
          remote_version: remoteVersion,
          remote_checksum: remoteChecksum,
          needs_update: true,
        });
      }
    }

    return Response.json({
      success: true,
      checked: SUPPORTED_MANIFEST_TYPES.length,
      updates_available: updates,
      current_versions: Object.fromEntries(
        Object.entries(localVersionMap).map(([k, v]) => [k, v.manifest_version])
      ),
    });
  } catch (error) {
    console.error("checkArrivOneManifestVersions error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}