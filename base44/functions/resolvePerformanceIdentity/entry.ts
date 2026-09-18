import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { staging_id, candidate_id, action = "resolve" } = await req.json();

    const stagingRes = await base44.asServiceRole.entities.PerformanceIngestionStaging.filter({ id: staging_id });
    const stagings = stagingRes?.data ?? stagingRes;
    const staging = Array.isArray(stagings) ? stagings[0] : null;
    if (!staging) return Response.json({ error: "Staging record not found" }, { status: 404 });

    if (action === "discard") {
      await base44.asServiceRole.entities.PerformanceIngestionStaging.update(staging.id, {
        status: "discarded",
        resolved_at: new Date().toISOString(),
      });
      return Response.json({ success: true, action: "discarded" });
    }

    // Resolve: link to candidate and create observations
    if (!candidate_id) return Response.json({ error: "candidate_id required for resolve" }, { status: 400 });

    const candidateRes = await base44.asServiceRole.entities.HireCandidate.get(candidate_id);
    const candidate = candidateRes?.data ?? candidateRes;
    if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 });

    const payload = staging.raw_payload || {};
    const identity = payload.identity || {};
    const email = (identity.email || "").toLowerCase().trim();
    const externalId = identity.external_employee_id;
    const metrics = payload.metrics || {};
    const recordedAt = payload.recorded_at || new Date().toISOString();

    // Create identity link for future auto-matching
    if (email || externalId) {
      await base44.asServiceRole.entities.PerformanceIdentityLink.create({
        tenant_id: staging.tenant_id,
        source_id: staging.source_id,
        identity_email: email,
        identity_external_id: externalId,
        candidate_id: candidate_id,
        confirmed_by: "admin",
        confirmed_at: new Date().toISOString(),
      });
    }

    // Create observations from the staged metrics
    let observationCount = 0;
    for (const [metricKey, value] of Object.entries(metrics)) {
      if (typeof value === "number") {
        await base44.asServiceRole.entities.PerformanceObservation.create({
          tenant_id: staging.tenant_id,
          source_id: staging.source_id,
          candidate_id: candidate_id,
          job_id: candidate.job_id || payload.job_id || null,
          match_status: "confirmed",
          is_test: false,
          metric_key: metricKey,
          value,
          period_start: payload.period_start || null,
          period_end: payload.period_end || null,
          recorded_at: recordedAt,
          source_record_id: payload.source_record_id || null,
        });
        observationCount++;
      }
    }

    // Update staging record
    await base44.asServiceRole.entities.PerformanceIngestionStaging.update(staging.id, {
      status: "resolved",
      resolved_candidate_id: candidate_id,
      resolved_at: new Date().toISOString(),
    });

    return Response.json({ success: true, observations_created: observationCount });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});