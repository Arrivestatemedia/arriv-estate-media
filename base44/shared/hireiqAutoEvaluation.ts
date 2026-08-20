// base44/shared/hireiqAutoEvaluation.ts
// Shared schemas and auto-evaluation logic for new HireIQ candidates.
// Used by both the backend syncApplicationToKhethaIQ function and the
// frontend syncApplicationsToKhethaIQ function to automatically evaluate
// new candidates upon creation, so they appear in rankings immediately
// without requiring a manual "Evaluate All" click.

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    strong_matches: { type: "array", items: { type: "string" } },
    partial_matches: { type: "array", items: { type: "string" } },
    missing_experience: { type: "array", items: { type: "string" } },
    transferable_skills: { type: "array", items: { type: "string" } },
    potential_concerns: { type: "array", items: { type: "string" } },
    follow_up_questions: { type: "array", items: { type: "string" } },
    parsed_work_history: { type: "array", items: { type: "string" } },
    parsed_skills: { type: "array", items: { type: "string" } },
    parsed_experience: { type: "string" },
    parsed_education: { type: "array", items: { type: "string" } },
    parsed_certifications: { type: "array", items: { type: "string" } },
    parsed_accomplishments: { type: "array", items: { type: "string" } },
    parsed_software: { type: "array", items: { type: "string" } },
    parsed_industry_experience: { type: "array", items: { type: "string" } },
    explanation: { type: "string" }
  }
};

const EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    overall_match_score: { type: "number" },
    interview_score: { type: "number" },
    resume_match: { type: "number" },
    skills_match: { type: "number" },
    experience_match: { type: "number" },
    competency_match: { type: "number" },
    evidence_completeness: { type: "number" },
    confidence_rating: { type: "string" },
    estimated_success_score: { type: "number" },
    confidence_level: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    development_areas: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    evidence_summary: { type: "string" },
    score_explanations: { type: "object" },
    overall_recommendation: { type: "string" },
    proceed_recommendation: { type: "string", description: "Whether to advance: 'Advance to Next Round', 'Borderline - Manager Review Needed', or 'Do Not Advance'" },
    proceed_reasoning: { type: "string", description: "Reasoning for the proceed recommendation" }
  }
};

/**
 * Auto-evaluates a new candidate by running resume analysis (if not already
 * present) and then generating an initial AI evaluation. Returns the
 * resume_analysis and evaluation objects to persist onto the HireCandidate.
 *
 * @param base44   - A base44 client (frontend or asServiceRole) with integrations.Core.InvokeLLM
 * @param candidate - The HireCandidate record (must have resume_text)
 * @param jobData   - The HireJob record (for job description context)
 * @param roleProfile - The job's role_success_profile (optional)
 */
export async function autoEvaluateCandidate(base44: any, candidate: any, jobData: any, roleProfile: any) {
  let resumeAnalysis = candidate?.resume_analysis;

  // 1. Resume analysis (if not already present)
  if (!resumeAnalysis && candidate?.resume_text) {
    resumeAnalysis = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an expert recruiter. Compare the candidate's resume against the job description and role success profile.\n\nJob Description:\n${JSON.stringify(jobData || {}, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nCandidate Resume:\n${candidate.resume_text}\n\nProvide a detailed analysis. Always explain exactly why you reached each conclusion.`,
      response_json_schema: RESUME_SCHEMA,
    });
  }

  // 2. Evaluation (no interviews yet — initial ranking based on resume/experience)
  const evaluation = await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring consultant. Evaluate this candidate for the position.\n\nIMPORTANT: This evaluation is designed to SUPPORT human decision-making, not replace it. The final hiring decision always remains with a human hiring manager.\n\nJob Description:\n${JSON.stringify(jobData || {}, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nCandidate Resume Analysis:\n${JSON.stringify(resumeAnalysis || {}, null, 2)}\n\nInterview Scorecards: None (no interviews conducted yet)\n\nCandidate Interview Notes: None\n\nCRITICAL — Proceed Decision:\nNo interview scorecards have been submitted yet. Recommend whether to invite this candidate for an initial interview based on the resume analysis alone.\n\nBased on the resume analysis, you MUST provide a clear proceed_recommendation:\n- Use "Advance to Next Round" if the candidate's resume shows strong alignment with the role\n- Use "Borderline - Manager Review Needed" if the resume shows mixed signals or insufficient information\n- Use "Do Not Advance" if the resume clearly does not meet requirements\n\nIn the proceed_reasoning field, explain exactly which aspects of the resume analysis led to this decision.\n\nGenerate a comprehensive evaluation with scores from 0-100. Explain every score using supporting evidence. Calculate an Estimated Success Score (0-100) based on resume match, demonstrated competencies, job requirement alignment, supporting evidence, and completeness of information. Clearly indicate this is an estimate to support human decision-making.`,
    response_json_schema: EVALUATION_SCHEMA,
  });

  return { resume_analysis: resumeAnalysis, evaluation };
}