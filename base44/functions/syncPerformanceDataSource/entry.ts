import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { source_id, tenant_id = "tnt_estate_media", backfill = false } = await req.json();

    const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id });
    const sources = sourcesRes?.data ?? sourcesRes;
    const source = Array.isArray(sources) ? sources[0] : null;
    if (!source) return Response.json({ success: false, error: "Source not found" }, { status: 404 });
    if (source.connection_mode !== "generic_api_pull") {
      return Response.json({ success: false, error: "Source is not an API pull source" }, { status: 400 });
    }

    await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, { connection_status: "syncing" });

    const cfg = source.api_config || {};
    let imported = 0;
    let staged = 0;
    let error = null;

    try {
      const url = `${cfg.base_url}${cfg.records_path || ""}`;
      const headers: Record<string, string> = {};
      if (cfg.auth_type === "bearer") headers["Authorization"] = `Bearer test`;
      if (cfg.auth_type === "api_key") headers["x-api-key"] = "test";

      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const records = Array.isArray(data) ? data : (data.records || data[cfg.records_path?.replace(/^[\/]/, "")] || []);

      for (const record of records) {
        const identity = record.identity || {};
        const metrics = record.metrics || {};
        const email = identity.email?.toLowerCase().trim();
        const externalId = identity.external_employee_id;

        // Try to auto-match by email
        let candidateId = null;
        if (email) {
          const candsRes = await base44.asServiceRole.entities.HireCandidate.filter({ email });
          const cands = candsRes?.data ?? candsRes;
          if (Array.isArray(cands) && cands.length > 0) candidateId = cands[0].id;
        }

        const recordedAt = record.recorded_at || new Date().toISOString();

        if (candidateId) {
          // Create observations for each metric
          for (const [metricKey, value] of Object.entries(metrics)) {
            if (typeof value === "number") {
              await base44.asServiceRole.entities.PerformanceObservation.create({
                tenant_id,
                source_id,
                candidate_id: candidateId,
                match_status: "auto_matched",
                is_test: false,
                metric_key: metricKey,
                value,
                period_start: record.period_start || null,
                period_end: record.period_end || null,
                recorded_at: recordedAt,
                source_record_id: record.source_record_id || null,
              });
              imported++;
            }
          }
        } else {
          // Stage for identity matching
          await base44.asServiceRole.entities.PerformanceIngestionStaging.create({
            tenant_id,
            source_id,
            status: "needs_matching",
            raw_payload: record,
            identity_hints: { email, external_employee_id: externalId },
          });
          staged++;
        }
      }

      await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
        connection_status: "connected",
        last_sync_completed_at: new Date().toISOString(),
        records_imported: (source.records_imported || 0) + imported,
        last_error: null,
      });
    } catch (e) {
      error = e.message;
      await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
        connection_status: "error",
        last_error: error,
      });
    }

    return Response.json({ success: !error, imported, staged_for_matching: staged, error });
  } catch (e) {
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
});