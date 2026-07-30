import { base44 } from "@/api/base44Client";

const JOB_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    department: { type: "string" },
    responsibilities: { type: "array", items: { type: "string" } },
    required_qualifications: { type: "array", items: { type: "string" } },
    preferred_qualifications: { type: "array", items: { type: "string" } },
    skills: { type: "array", items: { type: "string" } },
    experience_requirements: { type: "string" },
    performance_expectations: { type: "string" },
    compensation: { type: "string" },
    work_schedule: { type: "string" },
    description: { type: "string" }
  }
};

const ROLE_PROFILE_SCHEMA = {
  type: "object",
  properties: {
    common_responsibilities: { type: "array", items: { type: "string" } },
    typical_skills: { type: "array", items: { type: "string" } },
    common_competencies: { type: "array", items: { type: "string" } },
    performance_expectations: { type: "array", items: { type: "string" } },
    typical_experience: { type: "string" },
    industry_expectations: { type: "string" },
    similar_job_titles: { type: "array", items: { type: "string" } },
    missing_competencies: { type: "array", items: { type: "string" } }
  }
};

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

const INTERVIEW_SCHEMA = {
  type: "object",
  properties: {
    overall_assessment: { type: "string" },
    competencies_demonstrated: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    development_areas: { type: "array", items: { type: "string" } },
    key_takeaways: { type: "array", items: { type: "string" } },
    confidence: { type: "string" }
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
    overall_recommendation: { type: "string" }
  }
};

export async function analyzeJobFromUrl(url) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `Analyze the job posting at this URL: ${url}\n\nExtract the title, responsibilities, required qualifications, preferred qualifications, skills, experience requirements, performance expectations, compensation (if listed), work schedule, and department. Also provide a full description summary.`,
    add_context_from_internet: true,
    model: "gemini_3_flash",
    response_json_schema: JOB_SCHEMA
  });
}

export async function analyzeJobFromText(text) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `Analyze the following job description and extract the title, responsibilities, required qualifications, preferred qualifications, skills, experience requirements, performance expectations, compensation (if listed), work schedule, and department. Also provide a full description summary.\n\nJob Description:\n${text}`,
    response_json_schema: JOB_SCHEMA
  });
}

export async function analyzeJobFromFile(fileUrl) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `Analyze the attached job description document and extract the title, responsibilities, required qualifications, preferred qualifications, skills, experience requirements, performance expectations, compensation (if listed), work schedule, and department. Also provide a full description summary.`,
    file_urls: [fileUrl],
    response_json_schema: JOB_SCHEMA
  });
}

export async function generateRoleSuccessProfile(jobData) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring consultant. Research similar publicly available roles for a "${jobData.title}" position and generate a Role Success Profile.\n\nJob Details:\n${JSON.stringify(jobData, null, 2)}\n\nIdentify:\n1. Common responsibilities for this type of role\n2. Typical skills required\n3. Common competencies that predict success\n4. Common performance expectations\n5. Typical experience requirements\n6. Industry expectations\n7. Similar job titles\n8. Missing competencies not included in the employer's posting that are typically expected for this role\n\nBe specific and thorough.`,
    add_context_from_internet: true,
    model: "gemini_3_flash",
    response_json_schema: ROLE_PROFILE_SCHEMA
  });
}

export async function analyzeResumeText(resumeText, jobData, roleProfile) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert recruiter. Compare the candidate's resume against the job description and role success profile.\n\nJob Description:\n${JSON.stringify(jobData, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nCandidate Resume:\n${resumeText}\n\nProvide a detailed analysis. Always explain exactly why you reached each conclusion.`,
    response_json_schema: RESUME_SCHEMA
  });
}

export async function analyzeResumeFile(fileUrl, jobData, roleProfile) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert recruiter. Analyze the attached resume and compare it against the job description and role success profile.\n\nJob Description:\n${JSON.stringify(jobData, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nParse the resume for work history, skills, experience, education, certifications, accomplishments, software knowledge, and industry experience. Then compare against the job requirements. Always explain exactly why you reached each conclusion.`,
    file_urls: [fileUrl],
    response_json_schema: RESUME_SCHEMA
  });
}

export async function analyzeInterview(scorecard, jobData, roleProfile) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring analyst. Summarize this interview scorecard.\n\nJob:\n${JSON.stringify(jobData, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nInterview Scorecard:\n${JSON.stringify(scorecard, null, 2)}\n\nProvide a summary including overall assessment, competencies demonstrated, strengths, development areas, key takeaways, and confidence level.`,
    response_json_schema: INTERVIEW_SCHEMA
  });
}

export async function evaluateCandidate(candidate, jobData, roleProfile, interviews, resumeAnalysis) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring consultant. Evaluate this candidate for the position.\n\nIMPORTANT: This evaluation is designed to SUPPORT human decision-making, not replace it. The final hiring decision always remains with a human hiring manager.\n\nJob Description:\n${JSON.stringify(jobData, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nCandidate Resume Analysis:\n${JSON.stringify(resumeAnalysis || {}, null, 2)}\n\nInterview Scorecards:\n${JSON.stringify(interviews || [], null, 2)}\n\nCandidate Notes:\n${candidate?.interview_notes || "None"}\n\nGenerate a comprehensive evaluation with scores from 0-100. Explain every score using supporting evidence. Calculate an Estimated Success Score (0-100) based on interview performance, resume match, demonstrated competencies, job requirement alignment, supporting evidence, and completeness of information. Clearly indicate this is an estimate to support human decision-making.`,
    response_json_schema: EVALUATION_SCHEMA
  });
}

export async function analyzeScorecardOCR(fileUrl, jobData, roleProfile) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring analyst. Extract the interview scorecard data from this scanned document image or PDF.\n\nJob Context:\n${JSON.stringify(jobData || {}, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nExtract each question from the scorecard with: the question text, the competency being measured, an explanation of what it measures, the rating (1-5), any evidence written by the interviewer, notes, and confidence level. If any field is not legible or not present, leave it empty. Return all questions found.`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              competency: { type: "string" },
              explanation: { type: "string" },
              rating: { type: "number" },
              evidence: { type: "string" },
              notes: { type: "string" },
              confidence: { type: "string" }
            }
          }
        },
        interviewer_name: { type: "string" },
        interview_date: { type: "string" },
        extraction_notes: { type: "string" }
      }
    }
  });
}

export async function generateLearningInsights(performances, candidates, jobs) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert organizational psychologist and hiring analytics consultant. Analyze the correlation between hiring predictions and actual job performance data.\n\nPerformance Records:\n${JSON.stringify(performances, null, 2)}\n\nCandidate Evaluations (hiring predictions):\n${JSON.stringify(candidates.map(c => ({ name: c.name, evaluation: c.evaluation, resume_analysis: c.resume_analysis })), null, 2)}\n\nJob Context:\n${JSON.stringify(jobs.map(j => ({ title: j.title, role_success_profile: j.role_success_profile })), null, 2)}\n\nAnalyze which hiring prediction factors (resume match, interview scores, competency match, specific competencies, resume characteristics) most strongly correlate with actual job performance. Identify patterns that predict success and patterns that predict poor performance. Only draw conclusions supported by the data. If there is not enough data for meaningful conclusions, say so clearly.\n\nProvide actionable insights the organization can use to improve their hiring process.`,
    response_json_schema: {
      type: "object",
      properties: {
        data_sufficiency: { type: "string", "description": "Whether there is enough data for meaningful conclusions" },
        top_success_predictors: { type: "array", items: { type: "string" } },
        top_risk_indicators: { type: "array", items: { type: "string" } },
        competency_insights: { type: "array", items: { type: "string" } },
        resume_patterns: { type: "array", items: { type: "string" } },
        interview_patterns: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
        summary: { type: "string" }
      }
    }
  });
}

export async function parseQuestionnaireText(text, jobData, roleProfile) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring analyst. Extract the interview questions from this questionnaire document and structure them as a scorecard template.\n\nJob Context:\n${JSON.stringify(jobData || {}, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nQuestionnaire Document:\n${text}\n\nFor each question found, extract: the question text, the competency being measured, and a brief explanation of what it measures. If the document includes rating rubrics or notes, include those in the explanation. Return all questions found in order.`,
    response_json_schema: {
      type: "object",
      "properties": {
        questions: {
          type: "array",
          "items": {
            "type": "object",
            "properties": {
              question: { type: "string" },
              competency: { type: "string" },
              explanation: { type: "string" }
            }
          }
        },
        extraction_notes: { type: "string" }
      }
    }
  });
}

export async function parseQuestionnaireFile(fileUrl, jobData, roleProfile) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `You are an expert hiring analyst. Extract the interview questions from this uploaded questionnaire document and structure them as a scorecard template.\n\nJob Context:\n${JSON.stringify(jobData || {}, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nFor each question found in the document, extract: the question text, the competency being measured, and a brief explanation of what it measures. If the document includes rating rubrics or notes, include those in the explanation. Return all questions found in order.`,
    file_urls: [fileUrl],
    response_json_schema: {
      type: "object",
      "properties": {
        questions: {
          type: "array",
          "items": {
            "type": "object",
            "properties": {
              question: { type: "string" },
              competency: { type: "string" },
              explanation: { type: "string" }
            }
          }
        },
        extraction_notes: { type: "string" }
      }
    }
  });
}

export function scoreColor(score) {
  if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
  if (score >= 60) return "text-yellow-600 bg-yellow-50 border-yellow-200";
  if (score >= 40) return "text-orange-600 bg-orange-50 border-orange-200";
  return "text-red-600 bg-red-50 border-red-200";
}

export function scoreBar(score) {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}