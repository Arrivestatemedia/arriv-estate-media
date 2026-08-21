import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { getActiveManifest } from "../../shared/manifestRuntime.ts";

// Frontend-facing accessor: resolves the active canonical manifest for a given entry type.
// The frontend calls this via base44.functions.invoke("getActiveManifest", { entry_type, runtime_path }).
// Returns: { manifest_id, entry_type, version, payload, scope, source, fallback_used, compatible }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const entryType = body?.entry_type;
    const runtimePath = body?.runtime_path || "frontend";

    if (!entryType) {
      return Response.json({ error: "entry_type required" }, { status: 400 });
    }

    // Get tenant config for canonical tenant ID
    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ error: "No tenant config found" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;

    // Resolve via shared accessor
    const result = await getActiveManifest(base44, entryType, tenantId, { runtimePath });

    return Response.json(result);
  } catch (error) {
    console.error("getActiveManifest error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}