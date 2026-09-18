import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { source_id, tenant_id, backfill } = body;
    const tenantId = tenant_id || user?.data?.tenant_id || "tnt_estate_media";

    const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id, tenant_id: tenantId });
    const records = existing?.data ?? existing ?? [];
    if (records.length === 0) return Response.json({ error: "Source not found" }, { status: 404 });
    const source = records[0];

    await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, { connection_status: "syncing" });

    try {
      const cfg = source.api_config || {};
      if (!cfg.base_url) {
        await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, { connection_status: "error", last_error: "No base URL configured" });
        return Response.json({ success: false, error: "No base URL configured" });
      }

      const url = new URL(cfg.base_url);
      if (cfg.pagination_type === "offset") {
        url.searchParams.set("limit", String(cfg.page_size || 100));
        url.searchParams.set("offset", "0");
      }

      const headers = {};
      if (cfg.auth_type === "bearer") headers["Authorization"] = "Bearer test";
      const resp = await fetch(url.toString(), { method: "GET", headers });
      if (!resp.ok) {
        await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, { connection_status: "error", last_error: `HTTP ${resp.status}` });
        return Response.json({ success: false, error: `HTTP ${resp.status}` });
      }

      const data = await resp.json().catch(() => ({}));
      const recordsList = cfg.records_path && data[cfg.records_path] ? data[cfg.records_path] : (Array.isArray(data) ? data : []);
      let imported = 0;
      let staged = 0;

      for (const rec of recordsList) {
        const identity = rec.identity || {};
        const metrics = rec.metrics || {};
        const hasIdentity = identity.email || identity.external_employee_id || rec.candidate_id;

        if (!hasIdentity) {
          staged++;
          await base44.asServiceRole.entities.PerformanceIngestionStaging.create({
            tenant_id: tenantId,
            source_id: source_id,
            status: "needs_matching",
            raw_payload: rec,
            identity_hints: identity,
          });
          continue;
        }

        for (const [key, val] of Object.entries(metrics)) {
          await base44.asServiceRole.entities.PerformanceObservation.create({
            tenant_id: tenantId,
            source_id: source_id,
            match_status: "auto_matched",
            is_test: false,
            metric_key: key,
            value: String(val),
            period_start: rec.period_start || null,
            period_end: rec.period_end || null,
            recorded_at: rec.recorded_at || new Date().toISOString(),
            identity_email: identity.email || null,
            external_employee_id: identity.external_employee_id || null,
            candidate_id: rec.candidate_id || null,
            job_id: rec.job_id || null,
            source_record_id: rec.source_record_id || null,
          });
          imported++;
        }
      }

      await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
        connection_status: "connected",
        last_sync_completed_at: new Date().toISOString(),
        total_records_received: (source.total_records_received || 0) + recordsList.length,
        records_imported: (source.records_imported || 0) + imported,
        last_error: null,
      });

      return Response.json({ success: true, imported, staged_for_matching: staged });
    } catch (e) {
      await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, { connection_status: "error", last_error: e.message });
      return Response.json({ success: false, error: e.message });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}