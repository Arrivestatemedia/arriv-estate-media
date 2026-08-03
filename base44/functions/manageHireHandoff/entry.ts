// manageHireHandoff/entry.ts
// Bridges KhethaIQ hiring decisions to Estate Media worker records.
// When a KhethaIQ candidate is marked "hired", this function creates or links
// the appropriate Estate Media record (Media Specialist or SalesTeamMember)
// and maintains the cross-system linking IDs.
//
// Also exposes the centralized Ask Khetha service with Estate Media context.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  generateSharedPersonId,
  generateHandoffId,
  resolveTargetRole,
  buildAskKhethaContext,
} from "../../shared/hireHandoffShared.ts";

// ---------------------------------------------------------------------------
// Action: process_hire
// Creates or links the Estate Media worker record for a hired KhethaIQ candidate.
// ---------------------------------------------------------------------------

async function handleProcessHire(base44, body, user) {
  const { candidateId } = body;
  if (!candidateId) return Response.json({ error: "candidateId is required" }, { status: 400 });

  const candidate = await base44.asServiceRole.entities.HireCandidate.get(candidateId);
  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 });

  // Already handed off?
  if (candidate.handoff_status === "completed" || candidate.handoff_status === "invited") {
    return Response.json({
      success: true,
      already_existed: true,
      handoff_id: candidate.handoff_id,
      target_role: candidate.target_role,
      estate_media_specialist_id: candidate.estate_media_specialist_id,
      estate_employee_id: candidate.estate_employee_id,
      status: candidate.handoff_status,
    });
  }

  // Get the job to determine the role
  let job = null;
  if (candidate.job_id) {
    try { job = await base44.asServiceRole.entities.HireJob.get(candidate.job_id); } catch (_) {}
  }

  const targetRole = resolveTargetRole(candidate, job);
  const sharedPersonId = candidate.shared_person_id || generateSharedPersonId(candidate.email || candidate.name);
  const handoffId = candidate.handoff_id || generateHandoffId();

  // Mark candidate as hired + in_progress
  await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
    status: "hired",
    target_role: targetRole,
    shared_person_id: sharedPersonId,
    handoff_id: handoffId,
    handoff_status: "in_progress",
  });

  try {
    if (targetRole === "media_specialist") {
      return await handoffMediaSpecialist(base44, candidate, job, sharedPersonId, handoffId);
    } else if (targetRole === "sales_growth_advisor") {
      return await handoffSalesRep(base44, candidate, job, sharedPersonId, handoffId);
    } else {
      // "other" — just mark as completed with no worker record
      await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
        handoff_status: "completed",
        handoff_completed_at: new Date().toISOString(),
      });
      return Response.json({
        success: true,
        handoff_id: handoffId,
        target_role: targetRole,
        status: "completed",
        already_existed: false,
      });
    }
  } catch (err) {
    await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
      handoff_status: "failed",
      handoff_error: err.message,
    });
    return Response.json({ error: err.message, handoff_id: handoffId }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Media Specialist handoff: link or invite a User with user_type "media_partner"
// ---------------------------------------------------------------------------

async function handoffMediaSpecialist(base44, candidate, job, sharedPersonId, handoffId) {
  const email = (candidate.email || "").toLowerCase().trim();
  if (!email) {
    throw new Error("Candidate email is required for media specialist handoff");
  }

  // Check for an existing User with this email
  let existingUser = null;
  try {
    const users = await base44.asServiceRole.entities.User.filter({ email });
    if (users && users.length > 0) {
      existingUser = users[0];
    }
  } catch (_) {}

  if (existingUser) {
    // Link to existing user
    await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
      estate_media_specialist_id: existingUser.id,
      shared_person_id: sharedPersonId,
      handoff_id: handoffId,
      handoff_status: "completed",
      handoff_completed_at: new Date().toISOString(),
    });

    // Update the linked JobApplication if one exists
    await linkJobApplication(base44, candidate, sharedPersonId);

    return Response.json({
      success: true,
      already_existed: true,
      handoff_id: handoffId,
      target_role: "media_specialist",
      estate_media_specialist_id: existingUser.id,
      status: "completed",
    });
  }

  // No existing user — invite them
  try {
    await base44.asServiceRole.users.inviteUser(email, "user");
  } catch (err) {
    // If invite fails (e.g. already invited), continue — the admin can resend
    console.warn("inviteUser failed:", err.message);
  }

  await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
    shared_person_id: sharedPersonId,
    handoff_id: handoffId,
    handoff_status: "invited",
    handoff_completed_at: new Date().toISOString(),
  });

  await linkJobApplication(base44, candidate, sharedPersonId);

  return Response.json({
    success: true,
    already_existed: false,
    handoff_id: handoffId,
    target_role: "media_specialist",
    status: "invited",
  });
}

// ---------------------------------------------------------------------------
// Sales Rep handoff: create or link a SalesTeamMember
// ---------------------------------------------------------------------------

async function handoffSalesRep(base44, candidate, job, sharedPersonId, handoffId) {
  const email = (candidate.email || "").toLowerCase().trim();
  if (!email) {
    throw new Error("Candidate email is required for sales rep handoff");
  }

  // Check for an existing SalesTeamMember with this email
  let existingRep = null;
  try {
    const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ email });
    if (reps && reps.length > 0) {
      existingRep = reps[0];
    }
  } catch (_) {}

  if (existingRep) {
    // Link to existing rep
    await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
      estate_employee_id: existingRep.id,
      shared_person_id: sharedPersonId,
      handoff_id: handoffId,
      handoff_status: "completed",
      handoff_completed_at: new Date().toISOString(),
    });

    await linkJobApplication(base44, candidate, sharedPersonId);

    return Response.json({
      success: true,
      already_existed: true,
      handoff_id: handoffId,
      target_role: "sales_growth_advisor",
      estate_employee_id: existingRep.id,
      status: "completed",
    });
  }

  // Create a new SalesTeamMember (pending offer, not yet active)
  const newRep = await base44.asServiceRole.entities.SalesTeamMember.create({
    email,
    full_name: candidate.name || "",
    phone_number: candidate.phone || "",
    title: job?.title || "Sales Growth Advisor",
    department: "Sales",
    role: "user",
    is_active: false,
    force_password_change: true,
    employment_status: "pending_offer",
    employment_classification: "contractor",
    compensation_type: "commission_only",
    shared_person_id: sharedPersonId,
  });
  const repRec = newRep?.data ?? newRep;

  await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
    estate_employee_id: repRec.id,
    shared_person_id: sharedPersonId,
    handoff_id: handoffId,
    handoff_status: "completed",
    handoff_completed_at: new Date().toISOString(),
  });

  await linkJobApplication(base44, candidate, sharedPersonId);

  return Response.json({
    success: true,
    already_existed: false,
    handoff_id: handoffId,
    target_role: "sales_growth_advisor",
    estate_employee_id: repRec.id,
    status: "completed",
  });
}

// ---------------------------------------------------------------------------
// Link the JobApplication (if any) to the candidate with shared_person_id
// ---------------------------------------------------------------------------

async function linkJobApplication(base44, candidate, sharedPersonId) {
  if (!candidate.email) return;
  try {
    const apps = await base44.asServiceRole.entities.JobApplication.filter({ email: candidate.email });
    if (apps && apps.length > 0) {
      for (const app of apps) {
        if (!app.hire_candidate_id || !app.shared_person_id) {
          await base44.asServiceRole.entities.JobApplication.update(app.id, {
            hire_candidate_id: candidate.id,
            shared_person_id: sharedPersonId,
            status: "hired",
          });
        }
      }
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Action: get_handoff
// ---------------------------------------------------------------------------

async function handleGetHandoff(base44, body) {
  const { candidateId } = body;
  if (!candidateId) return Response.json({ error: "candidateId is required" }, { status: 400 });

  const candidate = await base44.asServiceRole.entities.HireCandidate.get(candidateId);
  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 });

  let linkedRecord = null;
  if (candidate.estate_media_specialist_id) {
    try { linkedRecord = await base44.asServiceRole.entities.User.get(candidate.estate_media_specialist_id); } catch (_) {}
  } else if (candidate.estate_employee_id) {
    try { linkedRecord = await base44.asServiceRole.entities.SalesTeamMember.get(candidate.estate_employee_id); } catch (_) {}
  }

  return Response.json({
    success: true,
    handoff: {
      handoff_id: candidate.handoff_id,
      handoff_status: candidate.handoff_status,
      target_role: candidate.target_role,
      shared_person_id: candidate.shared_person_id,
      estate_media_specialist_id: candidate.estate_media_specialist_id,
      estate_employee_id: candidate.estate_employee_id,
      handoff_completed_at: candidate.handoff_completed_at,
      handoff_error: candidate.handoff_error,
      linked_record: linkedRecord ? {
        id: linkedRecord.id,
        name: linkedRecord.full_name || linkedRecord.name,
        email: linkedRecord.email,
        is_active: linkedRecord.is_active ?? linkedRecord.employment_status,
      } : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Action: link_existing
// Manually link a candidate to an existing Estate Media record
// ---------------------------------------------------------------------------

async function handleLinkExisting(base44, body, user) {
  const { candidateId, estateRecordId, estateRecordType } = body;
  if (!candidateId || !estateRecordId || !estateRecordType) {
    return Response.json({ error: "candidateId, estateRecordId, and estateRecordType are required" }, { status: 400 });
  }

  const candidate = await base44.asServiceRole.entities.HireCandidate.get(candidateId);
  if (!candidate) return Response.json({ error: "Candidate not found" }, { status: 404 });

  const sharedPersonId = candidate.shared_person_id || generateSharedPersonId(candidate.email || candidate.name);
  const handoffId = candidate.handoff_id || generateHandoffId();

  const updateData = {
    shared_person_id: sharedPersonId,
    handoff_id: handoffId,
    handoff_status: "completed",
    handoff_completed_at: new Date().toISOString(),
    status: "hired",
  };

  if (estateRecordType === "media_specialist") {
    updateData.estate_media_specialist_id = estateRecordId;
    updateData.target_role = "media_specialist";
  } else if (estateRecordType === "sales_rep") {
    updateData.estate_employee_id = estateRecordId;
    updateData.target_role = "sales_growth_advisor";
  } else {
    return Response.json({ error: "Invalid estateRecordType" }, { status: 400 });
  }

  await base44.asServiceRole.entities.HireCandidate.update(candidateId, updateData);
  await linkJobApplication(base44, candidate, sharedPersonId);

  return Response.json({ success: true, handoff_id: handoffId });
}

// ---------------------------------------------------------------------------
// Action: ask_khetha
// Centralized Ask Khetha service with Estate Media context
// ---------------------------------------------------------------------------

async function handleAskKhetha(base44, body, user) {
  const { question, candidateId, jobId } = body;
  if (!question || !question.trim()) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  let candidate = null;
  let job = null;
  let application = null;
  let interviews = [];

  if (candidateId) {
    try {
      candidate = await base44.asServiceRole.entities.HireCandidate.get(candidateId);
      if (candidate?.job_id) {
        try { job = await base44.asServiceRole.entities.HireJob.get(candidate.job_id); } catch (_) {}
      }
      if (candidate?.email) {
        try {
          const apps = await base44.asServiceRole.entities.JobApplication.filter({ email: candidate.email });
          if (apps && apps.length > 0) application = apps[0];
        } catch (_) {}
      }
      try {
        const ivs = await base44.asServiceRole.entities.HireInterview.filter({ candidate_id: candidateId }, "-created_date", 10);
        interviews = ivs?.data ?? ivs ?? [];
      } catch (_) {}
    } catch (_) {}
  }

  if (jobId && !job) {
    try { job = await base44.asServiceRole.entities.HireJob.get(jobId); } catch (_) {}
  }

  const context = buildAskKhethaContext({ candidate, job, application, interviews });

  const prompt = `You are Khetha IQ, the centralized AI recruiting assistant for Arriv Estate Media. You help hiring managers make better recruiting decisions by analyzing candidate data, job requirements, and Estate Media context.

Answer the hiring manager's question using ONLY the data provided below. If the data is insufficient to answer, explicitly state what data is missing.

${context}

QUESTION: ${question}

Guidelines:
- Be concise and specific. Use data from the context to support your answer.
- If asked about fit or recommendations, reference specific evidence from the candidate's resume analysis, evaluation, or interview scorecards.
- If asked about Estate Media role requirements (Media Specialist equipment, territory, availability), use the application data if available.
- Never fabricate information. If you don't know, say so.
- This is an AI assistant to support human decision-making, not replace it.`;

  const result = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: null });
  const answer = typeof result === "string" ? result : result?.response || result?.data || result?.output || JSON.stringify(result);

  return Response.json({ success: true, answer });
}

// ---------------------------------------------------------------------------
// Action: list_hired_candidates
// Returns all candidates with handoff in progress or completed
// ---------------------------------------------------------------------------

async function handleListHired(base44, body) {
  const res = await base44.asServiceRole.entities.HireCandidate.filter({
    handoff_status: { $in: ["in_progress", "invited", "completed", "failed"] },
  }, "-handoff_completed_at", 50);
  const candidates = res?.data ?? res ?? [];
  return Response.json({ success: true, candidates });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    let body;
    try { body = await req.json(); } catch (_) {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const action = body?.action;
    if (!action) return Response.json({ error: "action is required" }, { status: 400 });

    const handlers = {
      process_hire: () => handleProcessHire(base44, body, user),
      get_handoff: () => handleGetHandoff(base44, body),
      link_existing: () => handleLinkExisting(base44, body, user),
      ask_khetha: () => handleAskKhetha(base44, body, user),
      list_hired: () => handleListHired(base44, body),
    };

    const handler = handlers[action];
    if (!handler) return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

    return await handler();
  } catch (error) {
    console.error("manageHireHandoff error:", error.message, error.stack);
    return Response.json({ error: error.message || "Internal error" }, { status: 500 });
  }
});