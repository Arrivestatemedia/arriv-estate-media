import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { action } = body;
    const tenantId = body.tenant_id || user?.data?.tenant_id || "tnt_estate_media";

    if (action === "create") {
      const { name, provider, connection_mode, api_config, sync_cadence } = body;
      const sourceId = generateId("pds");
      const webhookToken = connection_mode === "webhook_push" ? generateId("tok") : null;
      const record = await base44.asServiceRole.entities.PerformanceDataSource.create({
        source_id: sourceId,
        tenant_id: tenantId,
        name,
        provider: provider || "custom_webhook",
        connection_mode: connection_mode || "webhook_push",
        connection_status: connection_mode === "webhook_push" ? "connected" : "not_configured",
        webhook_token: webhookToken,
        api_config: api_config || null,
        sync_cadence: sync_cadence || "manual",
        enabled: true,
        total_records_received: 0,
        records_imported: 0,
      });
      return Response.json({ source: record });
    }

    if (action === "delete") {
      const { source_id } = body;
      const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id, tenant_id: tenantId });
      const records = existing?.data ?? existing ?? [];
      if (records.length > 0) {
        await base44.asServiceRole.entities.PerformanceDataSource.delete(records[0].id);
      }
      return Response.json({ success: true });
    }

    if (action === "rotate_token") {
      const { source_id } = body;
      const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id, tenant_id: tenantId });
      const records = existing?.data ?? existing ?? [];
      if (records.length === 0) return Response.json({ error: "Source not found" }, { status: 404 });
      const newToken = generateId("tok");
      await base44.asServiceRole.entities.PerformanceDataSource.update(records[0].id, {
        webhook_token: newToken,
        connection_status: "connected",
      });
      return Response.json({ webhook_token: newToken });
    }

    if (action === "test") {
      const { source_id } = body;
      const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id, tenant_id: tenantId });
      const records = existing?.data ?? existing ?? [];
      if (records.length === 0) return Response.json({ error: "Source not found" }, { status: 404 });
      const source = records[0];
      const cfg = source.api_config || {};
      if (!cfg.base_url) return Response.json({ success: false, error: "No base URL configured" });
      try {
        const url = new URL(cfg.base_url);
        const resp = await fetch(url.toString(), { method: "GET", headers: cfg.auth_type === "bearer" ? { "Authorization": "Bearer test" } : {} });
        if (!resp.ok) return Response.json({ success: false, error: `HTTP ${resp.status}` });
        const data = await resp.json().catch(() => null);
        const recordCount = data && cfg.records_path ? (Array.isArray(data[cfg.records_path]) ? data[cfg.records_path].length : 0) : 0;
        return Response.json({ success: true, recordCount });
      } catch (e) {
        return Response.json({ success: false, error: e.message });
      }
    }

    if (action === "discover") {
      const { source_id } = body;
      const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id, tenant_id: tenantId });
      const records = existing?.data ?? existing ?? [];
      if (records.length === 0) return Response.json({ error: "Source not found" }, { status: 404 });
      const source = records[0];
      const cfg = source.api_config || {};
      if (!cfg.base_url) return Response.json({ success: false, error: "No base URL configured" });
      try {
        const resp = await fetch(cfg.base_url, { method: "GET" });
        const data = await resp.json().catch(() => ({}));
        const sample = cfg.records_path && data[cfg.records_path] ? data[cfg.records_path][0] : data;
        const fields = sample && typeof sample === "object" ? Object.keys(sample) : [];
        return Response.json({ success: true, fields });
      } catch (e) {
        return Response.json({ success: false, error: e.message });
      }
    }

    if (action === "test_webhook") {
      const { source_id } = body;
      const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id, tenant_id: tenantId });
      const records = existing?.data ?? existing ?? [];
      if (records.length === 0) return Response.json({ error: "Source not found" }, { status: 404 });
      const source = records[0];
      await base44.asServiceRole.entities.PerformanceObservation.create({
        tenant_id: tenantId,
        source_id: source_id,
        match_status: "auto_matched",
        is_test: true,
        metric_key: "test_ping",
        value: "1",
        recorded_at: new Date().toISOString(),
        source_record_id: generateId("test"),
      });
      await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
        total_records_received: (source.total_records_received || 0) + 1,
        last_received_at: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}