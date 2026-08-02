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
    overall_assessment: { type: "string", description: "Based only on documented evidence" },
    candidate_strengths: { type: "array", items: { type: "string" }, description: "Only where evidence supports them" },
    development_areas: { type: "array", items: { type: "string" }, description: "Only where evidence supports them" },
    competencies_demonstrated: { type: "array", items: { type: "string" }, description: "Only those backed by evidence" },
    concerns: { type: "array", items: { type: "string" }, description: "Any concerns raised by the evidence" },
    confidence_level: { type: "string", description: "Confidence in the assessment given evidence completeness" },
    recommendation_explanation: { type: "string", description: "Reasoning based solely on the evidence" },
    evidence_sufficiency: { type: "string", description: "Whether sufficient evidence was provided, or if more is needed" }
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
    prompt: `You are an expert hiring analyst. Summarize this interview scorecard using ONLY the ratings, evidence observed, and interviewer notes provided. Do not invent observations or infer behaviors that are not explicitly documented in the evidence.\n\nIf the evidence provided is insufficient to draw a conclusion, explicitly state that additional information would be required.\n\nJob:\n${JSON.stringify(jobData, null, 2)}\n\nRole Success Profile:\n${JSON.stringify(roleProfile || {}, null, 2)}\n\nInterview Scorecard (ratings, evidence, and notes only):\n${JSON.stringify(scorecard, null, 2)}\n\nProvide:\n1. Overall Assessment — based only on documented evidence\n2. Candidate Strengths — only where evidence supports them\n3. Development Areas — only where evidence supports them\n4. Competencies Demonstrated — only those backed by evidence\n5. Concerns — any concerns raised by the evidence\n6. Confidence Level — your confidence in the assessment given evidence completeness\n7. Recommendation Explanation — reasoning based solely on the evidence\n8. Evidence Sufficiency — whether sufficient evidence was provided, or if more information is needed`,
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

export function computeCompositeScore(candidate) {
  const evalScore = candidate?.evaluation?.estimated_success_score;
  const r1Score = candidate?.round1_scorecard?.total_score;
  const r2Score = candidate?.round2_scorecard?.total_score;

  const weights = { eval: 40, r1: 30, r2: 30 };
  let totalWeight = 0;
  let weightedSum = 0;

  if (evalScore != null) { weightedSum += evalScore * weights.eval; totalWeight += weights.eval; }
  if (r1Score != null) { weightedSum += r1Score * weights.r1; totalWeight += weights.r1; }
  if (r2Score != null) { weightedSum += r2Score * weights.r2; totalWeight += weights.r2; }

  return totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : null;
}

export function scoreColor(score) {
  if (score >= 80) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  if (score >= 60) return "text-amber-300 bg-amber-500/10 border-amber-500/30";
  if (score >= 40) return "text-orange-400 bg-orange-500/10 border-orange-500/30";
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

export function scoreBar(score) {
  if (score >= 80) return "bg-amber-500";
  if (score >= 60) return "bg-amber-400";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

const POSITION_META = {
  media_specialist: {
    title: "Media Specialist",
    department: "Media",
    url: "/MediaSpecialist",
  },
  sales_growth_advisor: {
    title: "Sales Growth Advisor",
    department: "Sales",
    url: "/SalesGrowthAdvisor",
  },
};

export async function syncApplicationsToKhethaIQ() {
  const appsRes = await base44.entities.JobApplication.list("-created_date", 200);
  const apps = appsRes?.data ?? appsRes;
  if (!Array.isArray(apps)) return { jobs: [], newCandidates: 0 };

  const activeApps = apps.filter(a => !a.archived);
  const withJobId = activeApps.filter(a => a.job_id);
  const withoutJobId = activeApps.filter(a => !a.job_id);
  const byPosition = {};
  withoutJobId.forEach(app => {
    const pos = app.position || "media_specialist";
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(app);
  });

  const jobsRes = await base44.entities.HireJob.list("-created_date", 100);
  const existingJobs = jobsRes?.data ?? jobsRes;

  let newCandidates = 0;

  // Sync apps linked to a specific HireJob via job_id
  for (const app of withJobId) {
    const candsRes = await base44.entities.HireCandidate.filter({ job_id: app.job_id }, null, 200);
    const existingCands = candsRes?.data ?? candsRes;
    const exists = Array.isArray(existingCands) && existingCands.some(c => c.email === app.email);
    if (exists) continue;

    await base44.entities.HireCandidate.create({
      job_id: app.job_id,
      name: app.full_name,
      email: app.email,
      phone: app.phone,
      resume_text: [
        `Name: ${app.full_name}`,
        `Email: ${app.email}`,
        `Phone: ${app.phone}`,
        `LinkedIn: ${app.linkedin || "N/A"}`,
        `Portfolio: ${app.portfolio_link || "N/A"}`,
        `Last Related Job: ${app.last_related_job || "N/A"}`,
        `Why Good Fit: ${app.why_good_fit || "N/A"}`,
        app.documents?.length ? `Documents: ${app.documents.join(", ")}` : "",
      ].filter(Boolean).join("\n"),
      cover_letter: app.why_good_fit || "",
      status: "applied",
      decision: "pending",
      documents: (app.documents || []).map(url => ({ url, type: "application_document" })),
    });
    newCandidates++;
  }

  for (const [position, positionApps] of Object.entries(byPosition)) {
    let job = Array.isArray(existingJobs)
      ? existingJobs.find(j => j.source_application_position === position)
      : null;

    if (!job) {
      const meta = POSITION_META[position] || POSITION_META.media_specialist;
      const jobUrl = `${window.location.origin}${meta.url}`;

      const res = await base44.entities.HireJob.create({
        title: meta.title,
        department: meta.department,
        status: "open",
        source_type: "auto",
        source_url: jobUrl,
        source_application_position: position,
        role_profile_approved: false,
        created_by_name: "Auto-Sync",
      });
      job = res?.data ?? res;

      // Auto-pull the job description (non-blocking)
      analyzeJobFromUrl(jobUrl).then(async (analysis) => {
        if (analysis) {
          await base44.entities.HireJob.update(job.id, {
            description: analysis.description || "",
            responsibilities: analysis.responsibilities || [],
            required_qualifications: analysis.required_qualifications || [],
            preferred_qualifications: analysis.preferred_qualifications || [],
            skills: analysis.skills || [],
            experience_requirements: analysis.experience_requirements || "",
            performance_expectations: analysis.performance_expectations || "",
            compensation: analysis.compensation || "",
            work_schedule: analysis.work_schedule || "",
          });
        }
      }).catch(() => {});
    }

    const candsRes = await base44.entities.HireCandidate.filter({ job_id: job.id }, null, 200);
    const existingCands = candsRes?.data ?? candsRes;

    for (const app of positionApps) {
      const exists = Array.isArray(existingCands) && existingCands.some(c => c.email === app.email);
      if (exists) continue;

      const resumeText = [
        `Name: ${app.full_name}`,
        `Email: ${app.email}`,
        `Phone: ${app.phone}`,
        `LinkedIn: ${app.linkedin || "N/A"}`,
        `Portfolio: ${app.portfolio_link || "N/A"}`,
        `Last Related Job: ${app.last_related_job || "N/A"}`,
        `Why Good Fit: ${app.why_good_fit || "N/A"}`,
        app.documents?.length ? `Documents: ${app.documents.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      await base44.entities.HireCandidate.create({
        job_id: job.id,
        name: app.full_name,
        email: app.email,
        phone: app.phone,
        resume_text: resumeText,
        cover_letter: app.why_good_fit || "",
        status: "applied",
        decision: "pending",
        documents: (app.documents || []).map(url => ({ url, type: "application_document" })),
      });
      newCandidates++;
    }
  }

  return { newCandidates };
}