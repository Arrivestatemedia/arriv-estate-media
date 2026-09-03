// manageHireHandoff/entry.ts
// Bridges KhethaIQ hiring decisions to Estate Media worker records.
// When a KhethaIQ candidate is marked "hired", this function creates or links
// the appropriate Estate Media record (Media Specialist or SalesTeamMember)
// and maintains the cross-system linking IDs.
//
// Also exposes the centralized Ask Khetha service with Estate Media context.
//
// The core handoff execution logic (creating/linking worker records) is
// extracted to executeHandoff in hireHandoffShared.ts, shared with
// receiveKhethaIQHireEvent (the webhook from the main KhethaIQ app).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  generateSharedPersonId,
  generateHandoffId,
  resolveTargetRole,
  buildAskKhethaContext,
  executeHandoff,
} from "../../shared/hireHandoffShared.ts";
import { linkRoleToPerson, ROLE_TYPES } from "../../shared/personModel.ts";

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

  // ── LINK CANDIDATE PROFILE TO PERSON (identity layer) ──────────
  // The HireCandidate is the candidate profile record. Link it to the
  // canonical Person so this candidate's identity is unified. The
  // shared_person_id preserves the chain to the future employee/media
  // specialist role when the handoff completes.
  try {
    await linkRoleToPerson(
      base44.asServiceRole,
      ROLE_TYPES.CANDIDATE,
      { id: candidateId },
      { full_name: candidate.name || "", email: candidate.email || "", phone: candidate.phone || "" },
      sharedPersonId
    );
  } catch (e) {
    console.error("Failed to link candidate role to Person:", e);
  }

  const result = await executeHandoff(base44, {
    candidateId,
    email: candidate.email,
    name: candidate.name,
    phone: candidate.phone,
    targetRole,
    sharedPersonId,
    handoffId,
    jobTitle: job?.title,
  });

  return Response.json(result, { status: result.success ? 200 : 500 });
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

  // Link any JobApplication records
  if (candidate.email) {
    try {
      const apps = await base44.asServiceRole.entities.JobApplication.filter({ email: candidate.email });
      if (apps && apps.length > 0) {
        for (const app of apps) {
          if (!app.hire_candidate_id || !app.shared_person_id) {
            await base44.asServiceRole.entities.JobApplication.update(app.id, {
              hire_candidate_id: candidateId,
              shared_person_id: sharedPersonId,
              status: "hired",
            });
          }
        }
      }
    } catch (_) {}
  }

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
  let allJobs = [];
  let recentCandidates = [];

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

  // For general questions (no specific candidate/job), load pipeline-wide context
  if (!candidate && !job) {
    try {
      const jobsRes = await base44.asServiceRole.entities.HireJob.list("-created_date", 20);
      allJobs = (jobsRes?.data ?? jobsRes ?? []).map(j => ({
        title: j.title, department: j.department, status: j.status,
        skills: j.skills, experience_requirements: j.experience_requirements,
        compensation: j.compensation,
      }));
    } catch (_) {}
    try {
      const candRes = await base44.asServiceRole.entities.HireCandidate.list("-created_date", 30);
      recentCandidates = (candRes?.data ?? candRes ?? []).map(c => ({
        name: c.name, status: c.status, target_role: c.target_role,
        decision: c.decision, source: c.source,
      }));
    } catch (_) {}
  }

  let context = buildAskKhethaContext({ candidate, job, application, interviews });

  // Append pipeline-wide context for general questions
  if (!candidate && !job) {
    if (allJobs.length > 0) {
      context += "\n=== ALL OPEN JOBS ===\n";
      for (const j of allJobs) {
        let line = "- " + (j.title || "N/A") + " (" + (j.department || "N/A") + ") — Status: " + (j.status || "N/A");
        if (j.skills && j.skills.length > 0) line += " | Skills: " + j.skills.join(", ");
        if (j.experience_requirements) line += " | Exp: " + j.experience_requirements;
        context += line + "\n";
      }
    }
    if (recentCandidates.length > 0) {
      context += "\n=== RECENT CANDIDATES (last 30) ===\n";
      for (const c of recentCandidates) {
        context += "- " + (c.name || "N/A") + " — Status: " + (c.status || "N/A") + ", Role: " + (c.target_role || "N/A") + ", Decision: " + (c.decision || "pending") + "\n";
      }
      context += "\nTotal candidates in pipeline: " + recentCandidates.length + "\n";
    }
  }

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