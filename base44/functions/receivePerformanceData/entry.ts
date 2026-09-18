import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const sourceId = url.searchParams.get("source");
    const token = url.searchParams.get("token");

    if (!sourceId || !token) {
      return Response.json({ error: "Missing source or token" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Validate source and token
    const sourcesRes = await base44.asServiceRole.entities.PerformanceDataSource.filter({ source_id: sourceId });
    const sources = sourcesRes?.data ?? sourcesRes;
    const source = Array.isArray(sources) ? sources[0] : null;

    if (!source) return Response.json({ error: "Source not found" }, { status: 404 });
    if (source.webhook_token !== token) return Response.json({ error: "Invalid token" }, { status: 403 });
    if (!source.enabled) return Response.json({ error: "Source is disabled" }, { status: 403 });

    const payload = await req.json();
    const tenantId = source.tenant_id || "tnt_estate_media";
    const isTest = payload.is_test === true || url.searchParams.get("test") === "true";

    // Support both identity-based and legacy payloads
    const identity = payload.identity || {};
    const email = (identity.email || payload.email || "").toLowerCase().trim();
    const externalId = identity.external_employee_id || payload.external_employee_id;
    const legacyCandidateId = payload.candidate_id;
    const legacyJobId = payload.job_id;

    // Try to auto-match
    let candidateId = null;
    let jobId = null;
    let matchType = null;

    if (legacyCandidateId) {
      candidateId = legacyCandidateId;
      jobId = legacyJobId;
      matchType = "legacy_id";
    } else if (email) {
      // Check identity links first
      const linksRes = await base44.asServiceRole.entities.PerformanceIdentityLink.filter({ identity_email: email });
      const links = linksRes?.data ?? linksRes;
      if (Array.isArray(links) && links.length > 0) {
        candidateId = links[0].candidate_id;
        matchType = "identity_link";
      } else {
        // Try matching by email to HireCandidate
        const candsRes = await base44.asServiceRole.entities.HireCandidate.filter({ email });
        const cands = candsRes?.data ?? candsRes;
        if (Array.isArray(cands) && cands.length > 0) {
          candidateId = cands[0].id;
          jobId = cands[0].job_id;
          matchType = "email";
        }
      }
    }

    const recordedAt = payload.recorded_at || new Date().toISOString();
    const metrics = payload.metrics || {};
    // Legacy payload: metrics are top-level fields
    if (Object.keys(metrics).length === 0 && !legacyCandidateId) {
      if (payload.performance_rating != null) metrics.performance_rating = payload.performance_rating;
      if (payload.goal_completion != null) metrics.goal_completion = payload.goal_completion;
    }

    if (candidateId) {
      // Auto-matched: create observations
      for (const [metricKey, value] of Object.entries(metrics)) {
        if (typeof value === "number") {
          await base44.asServiceRole.entities.PerformanceObservation.create({
            tenant_id: tenantId,
            source_id: sourceId,
            candidate_id: candidateId,
            job_id: jobId,
            match_status: "auto_matched",
            is_test: isTest,
            metric_key: metricKey,
            value,
            period_start: payload.period_start || null,
            period_end: payload.period_end || null,
            recorded_at: recordedAt,
            source_record_id: payload.source_record_id || null,
          });
        }
      }
    } else {
      // Not matched: stage for identity matching
      const potentialMatches = [];
      if (email) {
        const candsRes = await base44.asServiceRole.entities.HireCandidate.filter({ email });
        const cands = candsRes?.data ?? candsRes;
        if (Array.isArray(cands)) {
          for (const c of cands.slice(0, 5)) {
            potentialMatches.push({ candidate_id: c.id, name: c.name, email: c.email, match_type: "email" });
          }
        }
      }

      await base44.asServiceRole.entities.PerformanceIngestionStaging.create({
        tenant_id: tenantId,
        source_id: sourceId,
        status: "needs_matching",
        raw_payload: payload,
        identity_hints: { email, external_employee_id: externalId, candidate_id: legacyCandidateId, job_id: legacyJobId },
        potential_matches: potentialMatches,
      });
    }

    // Update source stats
    await base44.asServiceRole.entities.PerformanceDataSource.update(source.id, {
      total_records_received: (source.total_records_received || 0) + 1,
      last_received_at: new Date().toISOString(),
      connection_status: "connected",
      last_error: null,
    });

    return Response.json({
      success: true,
      matched: !!candidateId,
      match_type: matchType,
      is_test: isTest,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});