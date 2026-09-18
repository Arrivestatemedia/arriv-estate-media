import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

function generateId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, source_id, tenant_id = "tnt_estate_media", ...params } = body;

    switch (action) {
      case "create": {
        const newSourceId = generateId("pds");
        const webhookToken = generateId("tok");
        const provider = params.provider || "custom_webhook";
        const connectionMode = params.connection_mode || "webhook_push";

        const source = await base44.asServiceRole.entities.PerformanceDataSource.create({
          source_id: newSourceId,
          tenant_id,
          name: params.name || "New Data Source",
          provider,
          connection_mode: connectionMode,
          connection_status: connectionMode === "webhook_push" ? "connected" : "not_configured",
          webhook_token: connectionMode === "webhook_push" ? webhookToken : null,
          api_config: params.api_config || null,
          sync_cadence: params.sync_cadence || "manual",
          enabled: true,
          total_records_received: 0,
          records_imported: 0,
        });

        return Response.json({ success: true, source: source?.data ?? source });
      }

      case "test": {
        // Test API connection by fetching one record
        const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id });
        const sources = sourcesRes?.data ?? sourcesRes;
        const source = Array.isArray(sources) ? sources[0] : null;
        if (!source) return Response.json({ success: false, error: "Source not found" }, { status: 404 });

        try {
          const cfg = source.api_config || {};
          const url = cfg.base_url ? `${cfg.base_url}${cfg.records_path || ""}` : null;
          if (!url) return Response.json({ success: false, error: "No base_url configured" });

          const headers: Record<string, string> = {};
          if (cfg.auth_type === "bearer") headers["Authorization"] = `Bearer test`;
          if (cfg.auth_type === "api_key") headers["x-api-key"] = "test";

          const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
          if (!resp.ok) return Response.json({ success: false, error: `HTTP ${resp.status}` });
          const data = await resp.json();
          const records = Array.isArray(data) ? data : (data[cfg.records_path?.replace(/^[\/]/, "")] || data.records || []);
          return Response.json({ success: true, recordCount: Array.isArray(records) ? records.length : 0 });
        } catch (e) {
          return Response.json({ success: false, error: e.message });
        }
      }

      case "discover": {
        const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id });
        const sources = sourcesRes?.data ?? sourcesRes;
        const source = Array.isArray(sources) ? sources[0] : null;
        if (!source) return Response.json({ success: false, error: "Source not found" }, { status: 404 });

        try {
          const cfg = source.api_config || {};
          const url = `${cfg.base_url}${cfg.records_path || ""}`;
          const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
          const data = await resp.json();
          const records = Array.isArray(data) ? data : (data.records || [data]);
          const sample = records[0] || {};
          const fields = Object.keys(sample).map(k => ({ key: k, type: typeof sample[k] }));
          return Response.json({ success: true, fields });
        } catch (e) {
          return Response.json({ success: false, error: e.message });
        }
      }

      case "rotate_token": {
        const newToken = generateId("tok");
        const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id });
        const sources = sourcesRes?.data ?? sourcesRes;
        const source = Array.isArray(sources) ? sources[0] : null;
        if (!source) return Response.json({ success: false, error: "Source not found" }, { status: 404 });

        await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, { webhook_token: newToken });
        return Response.json({ success: true, webhook_token: newToken });
      }

      case "test_webhook": {
        // Send a synthetic test observation through the webhook
        const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id });
        const sources = sourcesRes?.data ?? sourcesRes;
        const source = Array.isArray(sources) ? sources[0] : null;
        if (!source) return Response.json({ success: false, error: "Source not found" }, { status: 404 });

        const testPayload = {
          identity: { email: "test@example.com" },
          metrics: { test_metric: 100 },
          period_start: new Date().toISOString().slice(0, 10),
          period_end: new Date().toISOString().slice(0, 10),
          recorded_at: new Date().toISOString(),
          is_test: true,
        };

        // Store as a test observation directly
        await base44.asServiceRole.entities.PerformanceObservation.create({
          tenant_id,
          source_id,
          match_status: "auto_matched",
          is_test: true,
          metric_key: "test_metric",
          value: 100,
          period_start: testPayload.period_start,
          period_end: testPayload.period_end,
          recorded_at: testPayload.recorded_at,
        });

        await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
          total_records_received: (source.total_records_received || 0) + 1,
          last_received_at: new Date().toISOString(),
        });

        return Response.json({ success: true, message: "Test observation stored" });
      }

      case "delete": {
        const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id });
        const sources = sourcesRes?.data ?? sourcesRes;
        const source = Array.isArray(sources) ? sources[0] : null;
        if (!source) return Response.json({ success: false, error: "Source not found" }, { status: 404 });

        await base44.asServiceRole.entities.PerformanceDataSource.delete(source.id);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});