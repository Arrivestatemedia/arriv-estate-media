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
      }
    } catch (_) {}

    if (!localCandidate) {
      try {
        const newCand = await base44.asServiceRole.entities.HireCandidate.create({
          job_id: application.job_id || null,
          name: application.full_name || "",
          email,
          phone: application.phone || "",
          target_role: application.position || "media_specialist",
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
            console.log("[syncApp] auto-eval start, has integrations:", !!base44.integrations, "has Core:", !!(base44.integrations?.Core));
            let jobData = null;
            if (localCandidate.job_id) {
              jobData = await base44.asServiceRole.entities.HireJob.get(localCandidate.job_id);
            }

            // 1. Resume analysis (inline to avoid import issues)
            let resumeAnalysis = null;
            if (localCandidate.resume_text) {
              console.log("[syncApp] calling InvokeLLM for resume analysis...");
              resumeAnalysis = await base44.integrations.Core.InvokeLLM({
                prompt: `You are an expert recruiter. Compare the candidate's resume against the job description.\n\nJob Description:\n${JSON.stringify(jobData || {}, null, 2)}\n\nCandidate Resume:\n${localCandidate.resume_text}\n\nProvide a detailed analysis.`,
                response_json_schema: {
                  type: "object",
                  properties: {
                    strong_matches: { type: "array", items: { type: "string" } },
                    partial_matches: { type: "array", items: { type: "string" } },
                    missing_experience: { type: "array", items: { type: "string" } },
                    transferable_skills: { type: "array", items: { type: "string" } },
                    parsed_experience: { type: "string" },
                    parsed_skills: { type: "array", items: { type: "string" } },
                    explanation: { type: "string" }
                  }
                }
              });
              console.log("[syncApp] resume analysis done:", !!resumeAnalysis);
            }

            // 2. Evaluation
            console.log("[syncApp] calling InvokeLLM for evaluation...");
            const evaluation = await base44.integrations.Core.InvokeLLM({
              prompt: `You are an expert hiring consultant. Evaluate this candidate for the position. No interviews conducted yet — base recommendation on resume analysis alone.\n\nJob Description:\n${JSON.stringify(jobData || {}, null, 2)}\n\nCandidate Resume Analysis:\n${JSON.stringify(resumeAnalysis || {}, null, 2)}\n\nGenerate a comprehensive evaluation with scores from 0-100. Provide proceed_recommendation: "Advance to Next Round", "Borderline - Manager Review Needed", or "Do Not Advance".`,
              response_json_schema: {
                type: "object",
                properties: {
                  overall_match_score: { type: "number" },
                  resume_match: { type: "number" },
                  skills_match: { type: "number" },
                  experience_match: { type: "number" },
                  estimated_success_score: { type: "number" },
                  strengths: { type: "array", items: { type: "string" } },
                  development_areas: { type: "array", items: { type: "string" } },
                  proceed_recommendation: { type: "string" },
                  proceed_reasoning: { type: "string" }
                }
              }
            });
            console.log("[syncApp] evaluation done:", !!evaluation);

            await base44.asServiceRole.entities.HireCandidate.update(localCandidate.id, {
              resume_analysis: resumeAnalysis, evaluation,
            });
            console.log("[syncApp] candidate updated with evaluation");
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