// hireHandoffShared.ts
// Shared logic for the KhethaIQ → Estate Media hire handoff.
// Used by manageHireHandoff and any future function that needs to bridge
// a KhethaIQ HireCandidate to an Estate Media worker record.

import { linkRoleToPerson, ROLE_TYPES } from "./personModel.ts";

export type TargetRole = "media_specialist" | "sales_growth_advisor" | "other";

export interface HandoffResult {
  success: boolean;
  handoff_id: string;
  target_role: TargetRole;
  estate_media_specialist_id?: string;
  estate_employee_id?: string;
  status: "invited" | "completed" | "failed";
  error?: string;
  already_existed: boolean;
}

/**
 * Generate a stable shared_person_id from email.
 */
export function generateSharedPersonId(email: string): string {
  const norm = (email || "").toLowerCase().trim();
  return `sp_${norm.replace(/[^a-z0-9]/g, "")}`;
}

/**
 * Generate a unique handoff ID.
 */
export function generateHandoffId(): string {
  return `ho_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Determine the target role for a candidate.
 * Priority: candidate.target_role → job.source_application_position → "other".
 */
export function resolveTargetRole(candidate: any, job: any): TargetRole {
  if (candidate?.target_role) return candidate.target_role as TargetRole;
  if (job?.source_application_position) return job.source_application_position as TargetRole;
  return "other";
}

/**
 * Build the Ask Khetha context string from Estate Media + KhethaIQ data.
 * This gives the centralized Ask Khetha service rich context about the
 * candidate, the role, and any Estate Media–specific information.
 */
export function buildAskKhethaContext(params: {
  candidate?: any;
  job?: any;
  application?: any;
  interviews?: any[];
  prospects?: any[];
}): string {
  const { candidate, job, application, interviews, prospects } = params;
  const lines: string[] = [];

  if (job) {
    lines.push("=== JOB / OPENING ===");
    lines.push(`Title: ${job.title || "N/A"}`);
    lines.push(`Department: ${job.department || "N/A"}`);
    if (job.description) lines.push(`Description: ${job.description}`);
    if (job.required_qualifications?.length) lines.push(`Required Qualifications: ${job.required_qualifications.join("; ")}`);
    if (job.preferred_qualifications?.length) lines.push(`Preferred Qualifications: ${job.preferred_qualifications.join("; ")}`);
    if (job.skills?.length) lines.push(`Skills: ${job.skills.join(", ")}`);
    if (job.experience_requirements) lines.push(`Experience: ${job.experience_requirements}`);
    if (job.compensation) lines.push(`Compensation: ${job.compensation}`);
    if (job.work_schedule) lines.push(`Work Schedule: ${job.work_schedule}`);
    if (job.role_success_profile) {
      lines.push(`Role Success Profile: ${JSON.stringify(job.role_success_profile)}`);
    }
    lines.push("");
  }

  if (candidate) {
    lines.push("=== CANDIDATE ===");
    lines.push(`Name: ${candidate.name || "N/A"}`);
    lines.push(`Email: ${candidate.email || "N/A"}`);
    lines.push(`Phone: ${candidate.phone || "N/A"}`);
    lines.push(`Status: ${candidate.status || "N/A"}`);
    lines.push(`Decision: ${candidate.decision || "N/A"}`);
    if (candidate.resume_text) lines.push(`Resume Text: ${candidate.resume_text.slice(0, 2000)}`);
    if (candidate.resume_analysis) lines.push(`Resume Analysis: ${JSON.stringify(candidate.resume_analysis)}`);
    if (candidate.evaluation) lines.push(`AI Evaluation: ${JSON.stringify(candidate.evaluation)}`);
    if (candidate.interview_notes) lines.push(`Interview Notes: ${candidate.interview_notes}`);
    if (candidate.round1_scorecard) lines.push(`Round 1 Scorecard: ${JSON.stringify(candidate.round1_scorecard)}`);
    if (candidate.round2_scorecard) lines.push(`Round 2 Scorecard: ${JSON.stringify(candidate.round2_scorecard)}`);
    lines.push("");
  }

  if (application) {
    lines.push("=== ESTATE MEDIA APPLICATION DATA ===");
    lines.push(`Position Applied For: ${application.position || "N/A"}`);
    if (application.linkedin) lines.push(`LinkedIn: ${application.linkedin}`);
    if (application.portfolio_link) lines.push(`Portfolio: ${application.portfolio_link}`);
    if (application.last_related_job) lines.push(`Last Related Job: ${application.last_related_job}`);
    if (application.why_good_fit) lines.push(`Why Good Fit: ${application.why_good_fit}`);
    if (application.video_samples?.length) lines.push(`Video Samples: ${application.video_samples.join(", ")}`);
    if (application.picture_samples?.length) lines.push(`Picture Samples: ${application.picture_samples.join(", ")}`);
    if (application.documents?.length) lines.push(`Documents: ${application.documents.join(", ")}`);
    if (application.address) lines.push(`Address: ${application.address}`);
    lines.push("");
  }

  if (interviews && interviews.length > 0) {
    lines.push("=== INTERVIEWS ===");
    for (const iv of interviews) {
      lines.push(`- ${iv.interviewer_name || "Interviewer"} (${iv.interview_date || "N/A"}): Score ${iv.overall_score || 0}/100`);
      if (iv.ai_summary?.overall_assessment) lines.push(`  Assessment: ${iv.ai_summary.overall_assessment}`);
    }
    lines.push("");
  }

  if (prospects && prospects.length > 0) {
    lines.push("=== RELATED PROSPECTS ===");
    for (const p of prospects.slice(0, 5)) {
      lines.push(`- ${p.full_name} (${p.current_title} at ${p.current_company}) — Status: ${p.status}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// executeHandoff: Creates or links the Estate Media worker record for a
// hired candidate. Used by both manageHireHandoff (local KhethaIQ) and
// receiveKhethaIQHireEvent (webhook from the main KhethaIQ app).
// ---------------------------------------------------------------------------

export interface HandoffExecutionResult {
  success: boolean;
  handoff_id: string;
  target_role: TargetRole;
  estate_media_specialist_id?: string;
  estate_employee_id?: string;
  status: "invited" | "completed" | "failed";
  already_existed: boolean;
  error?: string;
}

async function linkJobApplicationByEmail(
  base44,
  email: string,
  candidateId: string,
  sharedPersonId: string
): Promise<void> {
  if (!email) return;
  try {
    const apps = await base44.asServiceRole.entities.JobApplication.filter({ email });
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

export async function executeHandoff(base44, params: {
  candidateId?: string;
  email: string;
  name: string;
  phone?: string;
  targetRole: TargetRole;
  sharedPersonId: string;
  handoffId: string;
  jobTitle?: string;
}): Promise<HandoffExecutionResult> {
  const { candidateId, email, name, phone, targetRole, sharedPersonId, handoffId, jobTitle } = params;
  const normalizedEmail = (email || "").toLowerCase().trim();

  if (!normalizedEmail) {
    return {
      success: false,
      handoff_id: handoffId,
      target_role: targetRole,
      status: "failed",
      already_existed: false,
      error: "Candidate email is required for handoff",
    };
  }

  try {
    // --- Media Specialist: link or invite a User with user_type media_partner ---
    if (targetRole === "media_specialist") {
      let existingUser = null;
      try {
        const users = await base44.asServiceRole.entities.User.filter({ email: normalizedEmail });
        if (users && users.length > 0) existingUser = users[0];
      } catch (_) {}

      if (existingUser) {
        if (candidateId) {
          await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
            estate_media_specialist_id: existingUser.id,
            shared_person_id: sharedPersonId,
            handoff_id: handoffId,
            handoff_status: "completed",
            handoff_completed_at: new Date().toISOString(),
          });
        }
        await linkJobApplicationByEmail(base44, normalizedEmail, candidateId, sharedPersonId);
        // Link media specialist profile (User) to canonical Person
        try {
          await linkRoleToPerson(
            base44.asServiceRole,
            ROLE_TYPES.MEDIA_SPECIALIST,
            { id: existingUser.id },
            { full_name: name || "", email: normalizedEmail, phone: phone || "" },
            sharedPersonId
          );
        } catch (e) { console.error("linkRoleToPerson (media_specialist existing):", e); }
        return {
          success: true,
          already_existed: true,
          handoff_id: handoffId,
          target_role: "media_specialist",
          estate_media_specialist_id: existingUser.id,
          status: "completed",
        };
      }

      try {
        await base44.asServiceRole.users.inviteUser(normalizedEmail, "user");
      } catch (err) {
        console.warn("inviteUser failed:", err.message);
      }

      if (candidateId) {
        await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
          shared_person_id: sharedPersonId,
          handoff_id: handoffId,
          handoff_status: "invited",
          handoff_completed_at: new Date().toISOString(),
        });
      }
      await linkJobApplicationByEmail(base44, normalizedEmail, candidateId, sharedPersonId);
      // NOTE: The media_specialist role link is deferred until the User record
      // actually exists (after invite acceptance). The Person identity is already
      // established via the candidate role link in handleProcessHire, and the
      // shared_person_id on the HireCandidate preserves the identity chain.
      // When the User later logs in, a workflow or login-time link can add the
      // media_specialist role using the real User.id.

      return {
        success: true,
        already_existed: false,
        handoff_id: handoffId,
        target_role: "media_specialist",
        status: "invited",
      };
    }

    // --- Sales Rep: create or link a SalesTeamMember ---
    if (targetRole === "sales_growth_advisor") {
      let existingRep = null;
      try {
        const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: normalizedEmail });
        if (reps && reps.length > 0) existingRep = reps[0];
      } catch (_) {}

      if (existingRep) {
        if (candidateId) {
          await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
            estate_employee_id: existingRep.id,
            shared_person_id: sharedPersonId,
            handoff_id: handoffId,
            handoff_status: "completed",
            handoff_completed_at: new Date().toISOString(),
          });
        }
        await linkJobApplicationByEmail(base44, normalizedEmail, candidateId, sharedPersonId);
        // Link employee profile (existing SalesTeamMember) to canonical Person
        try {
          await linkRoleToPerson(
            base44.asServiceRole,
            ROLE_TYPES.EMPLOYEE,
            { id: existingRep.id },
            { full_name: name || "", email: normalizedEmail, phone: phone || "" },
            sharedPersonId
          );
        } catch (e) { console.error("linkRoleToPerson (employee existing):", e); }
        return {
          success: true,
          already_existed: true,
          handoff_id: handoffId,
          target_role: "sales_growth_advisor",
          estate_employee_id: existingRep.id,
          status: "completed",
        };
      }

      const newRep = await base44.asServiceRole.entities.SalesTeamMember.create({
        email: normalizedEmail,
        full_name: name || "",
        phone_number: phone || "",
        title: jobTitle || "Sales Growth Advisor",
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

      if (candidateId) {
        await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
          estate_employee_id: repRec.id,
          shared_person_id: sharedPersonId,
          handoff_id: handoffId,
          handoff_status: "completed",
          handoff_completed_at: new Date().toISOString(),
        });
      }
      await linkJobApplicationByEmail(base44, normalizedEmail, candidateId, sharedPersonId);
      // Link employee profile (new SalesTeamMember) to canonical Person
      try {
        await linkRoleToPerson(
          base44.asServiceRole,
          ROLE_TYPES.EMPLOYEE,
          { id: repRec.id },
          { full_name: name || "", email: normalizedEmail, phone: phone || "" },
          sharedPersonId
        );
      } catch (e) { console.error("linkRoleToPerson (employee new):", e); }

      return {
        success: true,
        already_existed: false,
        handoff_id: handoffId,
        target_role: "sales_growth_advisor",
        estate_employee_id: repRec.id,
        status: "completed",
      };
    }

    // --- "other" — just mark completed with no worker record ---
    if (candidateId) {
      await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
        handoff_status: "completed",
        handoff_completed_at: new Date().toISOString(),
      });
    }
    return {
      success: true,
      handoff_id: handoffId,
      target_role: targetRole,
      status: "completed",
      already_existed: false,
    };
  } catch (err) {
    if (candidateId) {
      await base44.asServiceRole.entities.HireCandidate.update(candidateId, {
        handoff_status: "failed",
        handoff_error: err.message,
      }).catch(() => {});
    }
    return {
      success: false,
      handoff_id: handoffId,
      target_role: targetRole,
      status: "failed",
      already_existed: false,
      error: err.message,
    };
  }
}