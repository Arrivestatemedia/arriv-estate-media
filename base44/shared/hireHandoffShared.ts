// hireHandoffShared.ts
// Shared logic for the KhethaIQ → Estate Media hire handoff.
// Used by manageHireHandoff and any future function that needs to bridge
// a KhethaIQ HireCandidate to an Estate Media worker record.

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