// base44/shared/hireiqEvaluation.ts
// Server-and-client safe candidate evaluation used whenever a scorecard lands
// or a human re-evaluates. Kept free of Deno-only imports so the frontend can
// share the exact same prompt and schema as the backend.
// Used by src/lib/hireiq.js and by the interview completion pipeline.

export const EVALUATION_SCHEMA = {
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
    proceed_reasoning: { type: "string", description: "Reasoning for the proceed recommendation based on scorecard results and interview notes" }
  }
};

/**
 * Evaluates a candidate. `base44` may be the frontend client or a service-role
 * client — it only needs integrations.Core.InvokeLLM.
 */
export async function evaluateCandidateWithInterviews(base44, candidate, jobData, roleProfile, interviews, resumeAnalysis) {
  const hasRound1 = interviews?.some(i => i.round === 1);
  const hasRound2 = interviews?.some(i => i.round === 2);
  const roundContext = hasRound2
    ? "Both Round 1 and Round 2 scorecards are available. Recommend whether to advance to the offer/final stage."
    : hasRound1
      ? "Only the Round 1 scorecard is available. Recommend whether to advance to Round 2."
      : "No interview scorecards have been submitted yet. Recommend whether to invite this candidate for an initial interview based on the resume analysis alone.";

  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring consultant. Evaluate this candidate for the position.\n\nIMPORTANT: This evaluation is designed to SUPPORT human decision-making, not replace it. The final hiring decision always remains with a human hiring manager.\n\nJob Description:\n${JSON.stringify(jobData || {}, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nCandidate Resume Analysis:\n${JSON.stringify(resumeAnalysis || {}, null, 2)}\n\nInterview Scorecards (questionnaire results with ratings, evidence, interviewer recommendation, and notes):\n${JSON.stringify(interviews || [], null, 2)}\n\nCandidate Interview Notes:\n${candidate?.interview_notes || "None"}\n\nCRITICAL — Proceed Decision:\n${roundContext}\n\nBased PRIMARILY on the interview scorecard results (ratings, evidence, overall notes, and interviewer recommendation) and the candidate's interview notes, you MUST provide a clear proceed_recommendation:\n- Use "Advance to Next Round" if the candidate performed well enough to proceed\n- Use "Borderline - Manager Review Needed" if the results are mixed, evidence is insufficient, or some concerns were raised\n- Use "Do Not Advance" if the candidate clearly did not meet expectations\n\nIn the proceed_reasoning field, explain exactly which scorecard results, evidence, and notes led to this decision. If no interviews have been conducted, base the recommendation on the resume analysis.\n\nGenerate a comprehensive evaluation with scores from 0-100. Explain every score using supporting evidence. Calculate an Estimated Success Score (0-100) based on interview performance, resume match, demonstrated competencies, job requirement alignment, supporting evidence, and completeness of information. Clearly indicate this is an estimate to support human decision-making.`,
    response_json_schema: EVALUATION_SCHEMA
  });
}