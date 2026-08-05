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
    const body = await req.json().catch(() => ({}));
    const manifestType = body?.manifest_type;

    if (!manifestType || !SUPPORTED_MANIFEST_TYPES.includes(manifestType)) {
      return Response.json({ error: "Invalid manifest_type" }, { status: 400 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg || !cfg.arriv_one_manifest_endpoint) {
      return Response.json({ error: "No manifest endpoint configured" }, { status: 503 });
    }

    // Fetch the full manifest payload from Arriv One
    const response = await fetch(cfg.arriv_one_manifest_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: cfg.arriv_one_tenant_id,
        manifest_type: manifestType,
        include_payload: true,
      }),
    });

    if (!response.ok) {
      return Response.json({ error: `Manifest endpoint returned ${response.status}` }, { status: 502 });
    }

    const manifest = await response.json();
    const { version, checksum, payload } = manifest;

    if (!version || !checksum) {
      return Response.json({ error: "Invalid manifest response" }, { status: 502 });
    }

    // Verify checksum (simple integrity check)
    const computedChecksum = await computeChecksum(JSON.stringify(payload || {}));
    if (computedChecksum !== checksum) {
      // Store as rejected
      const existing = await base44.asServiceRole.entities.ProductManifestLocal.filter({
        tenant_id: cfg.arriv_one_tenant_id,
        manifest_type: manifestType,
      });
      if (existing[0]) {
        await base44.asServiceRole.entities.ProductManifestLocal.update(existing[0].id, {
          apply_status: "rejected",
          fetched_at: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.ProductManifestLocal.create({
          tenant_id: cfg.arriv_one_tenant_id,
          manifest_type: manifestType,
          manifest_version: version,
          checksum,
          payload: payload || {},
          apply_status: "rejected",
          fetched_at: new Date().toISOString(),
        });
      }
      return Response.json({ success: false, reason: "Checksum mismatch — manifest rejected" });
    }

    // Check for incompatible version
    const existing = await base44.asServiceRole.entities.ProductManifestLocal.filter({
      tenant_id: cfg.arriv_one_tenant_id,
      manifest_type: manifestType,
    });
    const prev = existing[0];

    // Store the manifest
    if (prev) {
      await base44.asServiceRole.entities.ProductManifestLocal.update(prev.id, {
        manifest_version: version,
        checksum,
        payload: payload || {},
        apply_status: "applied",
        previous_version: prev.manifest_version,
        fetched_at: new Date().toISOString(),
        applied_at: new Date().toISOString(),
      });
    } else {
      await base44.asServiceRole.entities.ProductManifestLocal.create({
        tenant_id: cfg.arriv_one_tenant_id,
        manifest_type: manifestType,
        manifest_version: version,
        checksum,
        payload: payload || {},
        apply_status: "applied",
        fetched_at: new Date().toISOString(),
        applied_at: new Date().toISOString(),
      });
    }

    // Update tenant config manifest version
    await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, {
      arriv_one_manifest_version: version,
    });

    return Response.json({
      success: true,
      manifest_type: manifestType,
      version,
      previous_version: prev?.manifest_version || "none",
      applied: true,
    });
  } catch (error) {
    console.error("consumeArrivOneProductManifest error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function computeChecksum(data) {
  const buf = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}