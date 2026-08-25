// receiveKhethaIQHireEvent/entry.ts
// Webhook receiver for hire events from the main KhethaIQ application.
// When the main KhethaIQ app approves/hires a candidate, it calls this
// endpoint with an HMAC-signed payload (X-KhethaIQ-Signature header).
//
// Estate Media validates the signature, then creates or links the
// appropriate worker record (Media Specialist User or SalesTeamMember)
// via the shared executeHandoff — the same logic used by the local
// manageHireHandoff function.
//
// Expected payload:
//   {
//     event_type: "candidate.hired",
//     candidate: {
//       email, name, phone, target_role, job_title,
//       job_id?, shared_person_id?, handoff_id?
//     }
//   }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { validateWebhookSignature } from "../../shared/khethaIQEmbed.ts";
import {
  generateSharedPersonId,
  generateHandoffId,
  executeHandoff,
} from "../../shared/hireHandoffShared.ts";

export default async function(req) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("X-KhethaIQ-Signature") || "";

    const valid = await validateWebhookSignature(bodyText, signature);
    if (!valid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    let body;
    try { body = JSON.parse(bodyText); } catch (_) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const { event_type, candidate } = body;
    if (event_type !== "candidate.hired") {
      return Response.json({ error: `Unsupported event type: ${event_type}` }, { status: 400 });
    }

    if (!candidate || !candidate.email) {
      return Response.json({ error: "candidate.email is required" }, { status: 400 });
    }

    const email = candidate.email.toLowerCase().trim();
    const targetRole = candidate.target_role || "other";
    const sharedPersonId = candidate.shared_person_id || generateSharedPersonId(email);
    const handoffId = candidate.handoff_id || generateHandoffId();

    // Check if a local HireCandidate exists (from data migration or prior sync)
    let candidateId = null;
    try {
      const candidates = await base44.asServiceRole.entities.HireCandidate.filter({ email });
      if (candidates && candidates.length > 0) {
        candidateId = candidates[0].id;
      }
    } catch (_) {}

    // If no local candidate, create one for tracking
    // Strip null/undefined values — Base44 SDK rejects null for string-typed fields
    if (!candidateId) {
      try {
        const createFields = {
          name: candidate.name || "",
          email,
          phone: candidate.phone || "",
          target_role: targetRole,
          shared_person_id: sharedPersonId,
          status: "hired",
          decision: "offer",
          handoff_id: handoffId,
          handoff_status: "in_progress",
        };
        if (candidate.job_id) createFields.job_id = candidate.job_id;
        const newCand = await base44.asServiceRole.entities.HireCandidate.create(createFields);
        const rec = newCand?.data ?? newCand;
        candidateId = rec?.id;
      } catch (_) {}
    } else {
      await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
        status: "hired",
        target_role: targetRole,
        shared_person_id: sharedPersonId,
        handoff_id: handoffId,
        handoff_status: "in_progress",
      });
    }

    // Synthetic canary payloads: skip executeHandoff (no real user creation side effects)
    // but still create the HireCandidate record (already done above) for canary verification.
    if (candidate.is_synthetic) {
      return Response.json({ success: true, synthetic: true, candidate_id: candidateId, email, handoff_id: handoffId });
    }

    const result = await executeHandoff(base44, {
      candidateId,
      email,
      name: candidate.name || "",
      phone: candidate.phone || "",
      targetRole,
      sharedPersonId,
      handoffId,
      jobTitle: candidate.job_title,
    });

    return Response.json(result, { status: result.success ? 200 : 500 });
  } catch (error) {
    console.error("receiveKhethaIQHireEvent error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
}