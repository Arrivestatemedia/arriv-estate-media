// syncApplicationToKhethaIQ/entry.ts
// Syncs a single JobApplication into the LOCAL KhethaIQ experience within
// Estate Media by creating/updating a HireCandidate record.
// Triggered automatically by an entity automation on JobApplication create,
// or manually by passing application_id.
//
// Note: This does NOT push to the main/central KhethaIQ app, which is a
// multi-tenant host for several different clients. Estate Media applicants
// stay local to this app only.
//
// Duplicate prevention: checks for an existing HireCandidate by email before
// creating, and uses shared_person_id for cross-system linking.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { generateSharedPersonId } from "../../shared/hireHandoffShared.ts";
import { autoEvaluateCandidate } from "../../shared/hireiqAutoEvaluation.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    // Determine the application ID — from manual call or automation payload
    let applicationId = body.application_id;
    let application = body.application;

    if (!applicationId && body.event?.entity_id) {
      applicationId = body.event.entity_id;
    }

    // If we don't have the application data, fetch it
    if (!application && applicationId) {
      try {
        application = await base44.asServiceRole.entities.JobApplication.get(applicationId);
      } catch (_) {}
    }

    if (!application) {
      return Response.json({ error: "Application not found" }, { status: 404 });
    }

    const email = (application.email || "").toLowerCase().trim();
    const sharedPersonId = application.shared_person_id || generateSharedPersonId(email);

    // 1. Create/update local HireCandidate (for local KhethaIQ experience)
    let localCandidate = null;
    try {
      const existing = await base44.asServiceRole.entities.HireCandidate.filter({ email });
      if (existing && existing.length > 0) {
        localCandidate = existing[0];
        // Link the application back if not already linked
        if (!application.hire_candidate_id) {
          await base44.asServiceRole.entities.JobApplication.update(application.id, {
            hire_candidate_id: localCandidate.id,
            shared_person_id: sharedPersonId,
          }).catch(() => {});
        }
        // Always sync dob/resume_url from the application (source of truth) so
        // candidates created via any path end up with resume + age on profile.
        const updates = {};
        if (application.dob && localCandidate.dob !== application.dob) updates.dob = application.dob;
        if (application.portfolio_link && localCandidate.resume_url !== application.portfolio_link) updates.resume_url = application.portfolio_link;
        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.HireCandidate.update(localCandidate.id, updates).catch(() => {});
        }
      }
    } catch (_) {}

    if (!localCandidate) {
      try {
        const newCand = await base44.asServiceRole.entities.HireCandidate.create({
          job_id: application.job_id || null,
          name: application.full_name || "",
          email,
          phone: application.phone || "",
          dob: application.dob || null,
          target_role: application.position || "media_specialist",
          resume_url: application.portfolio_link || "",
          shared_person_id: sharedPersonId,
          resume_text: [
            `Name: ${application.full_name || "N/A"}`,
            `Email: ${application.email || "N/A"}`,
            `Phone: ${application.phone || "N/A"}`,
            `LinkedIn: ${application.linkedin || "N/A"}`,
            `Portfolio: ${application.portfolio_link || "N/A"}`,
            `Last Related Job: ${application.last_related_job || "N/A"}`,
            `Why Good Fit: ${application.why_good_fit || "N/A"}`,
            application.documents?.length ? `Documents: ${application.documents.join(", ")}` : "",
          ].filter(Boolean).join("\n"),
          cover_letter: application.why_good_fit || "",
          status: "applied",
          decision: "pending",
          documents: (application.documents || []).map(url => ({ url, type: "application_document" })),
        });
        localCandidate = newCand?.data ?? newCand;

        if (localCandidate?.id) {
          await base44.asServiceRole.entities.JobApplication.update(application.id, {
            hire_candidate_id: localCandidate.id,
            shared_person_id: sharedPersonId,
          }).catch(() => {});

          // Auto-evaluate the new candidate so it appears in rankings immediately
          try {
            let jobData = null;
            if (localCandidate.job_id) {
              jobData = await base44.asServiceRole.entities.HireJob.get(localCandidate.job_id);
            }
            const { resume_analysis, evaluation } = await autoEvaluateCandidate(
              base44, localCandidate, jobData, jobData?.role_success_profile
            );
            await base44.asServiceRole.entities.HireCandidate.update(localCandidate.id, {
              resume_analysis, evaluation,
            });
          } catch (evalErr) {
            console.error("[syncApp] auto-eval error:", evalErr?.message || evalErr, evalErr?.stack || "");
          }
        }
      } catch (_) {}
    }

    return Response.json({
      success: true,
      local_candidate_id: localCandidate?.id,
      shared_person_id: sharedPersonId,
    });
  } catch (error) {
    console.error("syncApplicationToKhethaIQ error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}