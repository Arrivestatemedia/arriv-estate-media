import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { staging_id, resolution, tenant_id } = body;
    const tenantId = tenant_id || user?.data?.tenant_id || "tnt_estate_media";

    const stagingRes = await base44.asServiceRole.entities.PerformanceIngestionStaging.filter({ id: staging_id, tenant_id: tenantId });
    const stagingRecords = stagingRes?.data ?? stagingRes ?? [];
    if (stagingRecords.length === 0) return Response.json({ error: "Staging record not found" }, { status: 404 });
    const staged = stagingRecords[0];

    const payload = staged.raw_payload || {};
    const metrics = payload.metrics || {};
    const identity = staged.identity_hints || {};

    const candidateId = resolution?.candidate_id || null;
    const salesMemberId = resolution?.sales_member_id || null;

    if (identity.email || candidateId) {
      await base44.asServiceRole.entities.PerformanceIdentityLink.create({
        tenant_id: tenantId,
        identity_email: identity.email || null,
        external_employee_id: identity.external_employee_id || null,
        candidate_id: candidateId,
        sales_member_id: salesMemberId,
        confirmed: true,
        confirmed_by: user.email || user.id,
        confirmed_at: new Date().toISOString(),
      });
    }

    const metricEntries = Object.keys(metrics).length > 0 ? Object.entries(metrics) : [[payload.metric_key || "performance_rating", payload.performance_rating || ""]];

    for (const [key, val] of metricEntries) {
      await base44.asServiceRole.entities.PerformanceObservation.create({
        tenant_id: tenantId,
        source_id: staged.source_id,
        match_status: "confirmed",
        is_test: false,
        metric_key: key,
        value: String(val),
        period_start: payload.period_start || null,
        period_end: payload.period_end || null,
        recorded_at: payload.recorded_at || new Date().toISOString(),
        identity_email: identity.email || null,
        external_employee_id: identity.external_employee_id || null,
        candidate_id: candidateId,
        job_id: payload.job_id || null,
        source_record_id: payload.source_record_id || null,
      });
    }

    await base44.asServiceRole.entities.PerformanceIngestionStaging.update(staged.id, {
      status: "matched",
      resolved_by: user.email || user.id,
      resolved_at: new Date().toISOString(),
    });

    return Response.json({ success: true, imported: metricEntries.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}