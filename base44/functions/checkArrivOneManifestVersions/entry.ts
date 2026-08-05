import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";

const SUPPORTED_MANIFEST_TYPES = [
  "ai_followup_rules",
  "daily_call_queue_config",
  "call_map_schema",
  "metric_definitions",
  "crm_statuses",
  "prospecting_config",
  "communication_rules",
  "label_overrides",
  "nav_config",
  "repair_action_definitions_reserved",
];

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

    // Fetch version info from Arriv One
    const response = await fetch(cfg.arriv_one_manifest_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: cfg.arriv_one_tenant_id,
        manifest_types: SUPPORTED_MANIFEST_TYPES,
      }),
    });

    if (!response.ok) {
      return Response.json({ error: `Manifest endpoint returned ${response.status}` }, { status: 502 });
    }

    const remoteVersions = await response.json();

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