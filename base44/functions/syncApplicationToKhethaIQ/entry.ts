// syncApplicationToKhethaIQ/entry.ts
// Syncs a single JobApplication to the main KhethaIQ application.
// Triggered automatically by an entity automation on JobApplication create,
// or manually by passing application_id.
//
// The function:
// 1. Creates/updates the local HireCandidate (for the local KhethaIQ experience
//    during parallel validation)
// 2. Pushes the application to the main KhethaIQ app's import endpoint
//    (KHETHAIQ_IMPORT_ENDPOINT) so the central KhethaIQ system receives it
//
// Duplicate prevention: checks for an existing HireCandidate by email before
// creating, and uses shared_person_id for cross-system linking.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { generateSharedPersonId } from "../../shared/hireHandoffShared.ts";

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
        }
      } catch (_) {}
    }

    // 2. Push to the main KhethaIQ app
    const importEndpoint = secrets.get("KHETHAIQ_IMPORT_ENDPOINT");
    const apiKey = secrets.get("KHETHAIQ_API_KEY");

    let mainSync = null;
    if (importEndpoint) {
      try {
        const response = await fetch(importEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-KhethaIQ-API-Key": apiKey || "",
            "X-Calling-Application": "ARRIV_ESTATE_MEDIA",
          },
          body: JSON.stringify({
            calling_application: "ARRIV_ESTATE_MEDIA",
            tenant_id: "arriv_estate_media",
            event_type: "application.created",
            application: {
              local_id: application.id,
              full_name: application.full_name,
              email,
              phone: application.phone,
              position: application.position || "media_specialist",
              shared_person_id: sharedPersonId,
              linkedin: application.linkedin,
              portfolio_link: application.portfolio_link,
              last_related_job: application.last_related_job,
              why_good_fit: application.why_good_fit,
              video_samples: application.video_samples || [],
              picture_samples: application.picture_samples || [],
              documents: application.documents || [],
              status: application.status || "received",
              hire_candidate_id: localCandidate?.id,
            },
          }),
        });

        if (response.ok) {
          mainSync = await response.json();
        } else {
          mainSync = { error: `Import returned ${response.status}`, details: (await response.text()).slice(0, 200) };
        }
      } catch (err) {
        mainSync = { error: err.message };
      }
    }

    return Response.json({
      success: true,
      local_candidate_id: localCandidate?.id,
      shared_person_id: sharedPersonId,
      main_khethaiq_sync: mainSync,
    });
  } catch (error) {
    console.error("syncApplicationToKhethaIQ error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}