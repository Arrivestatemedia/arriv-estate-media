import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default async function(req) {
  try {
    const url = new URL(req.url);
    const sourceId = url.searchParams.get("source");
    const token = url.searchParams.get("token");

    if (!sourceId || !token) {
      return Response.json({ error: "Missing source or token" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const existing = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id: sourceId });
    const records = existing?.data ?? existing ?? [];
    if (records.length === 0) return Response.json({ error: "Source not found" }, { status: 404 });
    const source = records[0];

    if (source.webhook_token !== token) {
      return Response.json({ error: "Invalid token" }, { status: 403 });
    }

    const tenantId = source.tenant_id || "tnt_estate_media";
    const payload = await req.json().catch(() => ({}));

    const identity = payload.identity || {};
    const metrics = payload.metrics || {};
    const hasIdentity = identity.email || identity.external_employee_id || payload.candidate_id;

    const isTest = payload.is_test === true;

    if (!hasIdentity && !isTest) {
      await base44.asServiceRole.entities.PerformanceIngestionStaging.create({
        tenant_id: tenantId,
        source_id: sourceId,
        status: "needs_matching",
        raw_payload: payload,
        identity_hints: {
          email: identity.email || null,
          external_employee_id: identity.external_employee_id || null,
          candidate_id: payload.candidate_id || null,
          job_id: payload.job_id || null,
        },
      });
      await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
        total_records_received: (source.total_records_received || 0) + 1,
        last_received_at: new Date().toISOString(),
      });
      return Response.json({ success: true, staged: true });
    }

    const metricEntries = Object.keys(metrics).length > 0 ? Object.entries(metrics) : [[payload.metric_key || "performance_rating", payload.performance_rating || payload.goal_completion || ""]];

    for (const [key, val] of metricEntries) {
      await base44.asServiceRole.entities.PerformanceObservation.create({
        tenant_id: tenantId,
        source_id: sourceId,
        match_status: hasIdentity ? "auto_matched" : "unmatched",
        is_test: isTest,
        metric_key: key,
        value: String(val),
        period_start: payload.period_start || null,
        period_end: payload.period_end || null,
        recorded_at: payload.recorded_at || new Date().toISOString(),
        identity_email: identity.email || null,
        external_employee_id: identity.external_employee_id || null,
        candidate_id: payload.candidate_id || null,
        job_id: payload.job_id || null,
        source_record_id: payload.source_record_id || generateId("rec"),
      });
    }

    await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
      total_records_received: (source.total_records_received || 0) + 1,
      last_received_at: new Date().toISOString(),
      connection_status: "connected",
    });

    return Response.json({ success: true, imported: metricEntries.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}