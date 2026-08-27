// base44/shared/tavusInterview.ts
// Shared Tavus CVI interview helpers used by backend functions.
// The TAVUS_API_KEY is read from Deno.env server-side and NEVER exposed to the frontend.

export const TAVUS_PAL_ID = "p5f532a78213";
export const TAVUS_API_BASE = "https://tavusapi.com/v2";

// ─── Tavus API helpers ──────────────────────────────────────────────────────

export async function createTavusConversation(apiKey: string, params: {
  conversationName: string;
  callbackUrl: string;
  conversationalContext?: string;
  customGreeting?: string;
  requireAuth?: boolean;
  maxParticipants?: number;
}) {
  const body: any = {
    pal_id: TAVUS_PAL_ID,
    conversation_name: params.conversationName,
    callback_url: params.callbackUrl,
    require_auth: params.requireAuth ?? true,
    max_participants: params.maxParticipants ?? 2,
  };
  if (params.conversationalContext) body.conversational_context = params.conversationalContext;
  if (params.customGreeting) body.custom_greeting = params.customGreeting;

  const response = await fetch(`${TAVUS_API_BASE}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavus create error ${response.status}: ${errorText}`);
  }

  return await response.json();
}

export async function endTavusConversation(apiKey: string, conversationId: string) {
  const response = await fetch(`${TAVUS_API_BASE}/conversations/${conversationId}/end`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
  });
  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    throw new Error(`Tavus end error ${response.status}: ${errorText}`);
  }
  return response.status === 204 ? {} : await response.json().catch(() => ({}));
}

export async function getTavusConversation(apiKey: string, conversationId: string) {
  const response = await fetch(`${TAVUS_API_BASE}/conversations/${conversationId}`, {
    method: "GET",
    headers: { "x-api-key": apiKey },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tavus get error ${response.status}: ${errorText}`);
  }
  return await response.json();
}

// ─── Round 1 Question definitions (mirrors src/lib/round1Questions.js) ──────
// Used by the backend to build scorecards from Tavus transcripts.

export const ROUND1_SECTIONS = [
  {
    name: "Communication", weight: 20, questions: [
      { question: "Tell me about yourself.", competencies: ["Communication", "Confidence"], weight: 1 },
      { question: "Tell me about a difficult conversation you handled well.", competencies: ["Communication", "Professionalism"], weight: 1 },
      { question: "How do you prefer to communicate with others and why?", competencies: ["Communication"], weight: 1 },
    ],
  },
  {
    name: "Confidence", weight: 15, questions: [
      { question: "What accomplishment are you most proud of?", competencies: ["Confidence"], weight: 1 },
      { question: "Describe a time you stepped outside your comfort zone.", competencies: ["Confidence", "Resilience"], weight: 1 },
      { question: "What motivates you every day?", competencies: ["Confidence"], weight: 1 },
    ],
  },
  {
    name: "Coachability", weight: 20, questions: [
      { question: "Tell me about a time you received constructive criticism.", competencies: ["Coachability"], weight: 1 },
      { question: "What did you do with that feedback?", competencies: ["Coachability", "Growth Mindset"], weight: 1 },
      { question: "Tell me about a mistake you made and what you learned.", competencies: ["Coachability", "Accountability"], weight: 1 },
    ],
  },
  {
    name: "Work Ethic", weight: 15, questions: [
      { question: "Describe a difficult challenge you've overcome.", competencies: ["Work Ethic", "Problem Solving"], weight: 1 },
      { question: "How do you stay organized?", competencies: ["Work Ethic"], weight: 1 },
      { question: "Tell me about a time you went above and beyond.", competencies: ["Work Ethic", "Initiative"], weight: 1 },
    ],
  },
  {
    name: "Professionalism", weight: 10, questions: [
      { question: "Tell me about a disagreement with a coworker or manager.", competencies: ["Professionalism"], weight: 1 },
      { question: "How do you react when treated unfairly?", competencies: ["Professionalism", "Emotional Intelligence"], weight: 1 },
    ],
  },
  {
    name: "Problem Solving / Judgment", weight: 10, questions: [
      { question: "Describe a time you had to make a decision with incomplete information.", competencies: ["Problem Solving", "Judgment"], weight: 1 },
      { question: "Tell me about a problem you solved that others couldn't.", competencies: ["Problem Solving", "Initiative"], weight: 1 },
      { question: "How do you approach a problem you've never encountered before?", competencies: ["Problem Solving", "Adaptability"], weight: 1 },
    ],
  },
  {
    name: "Culture Fit", weight: 10, questions: [
      { question: "What kind of manager brings out your best?", competencies: ["Culture Fit"], weight: 1 },
      { question: "What type of company culture helps you thrive?", competencies: ["Culture Fit"], weight: 1 },
      { question: "Why do you want to work at Arriv?", competencies: ["Culture Fit", "Motivation"], weight: 1 },
    ],
  },
];

export const ROUND1_SECTION_WEIGHTS = ROUND1_SECTIONS.reduce((acc: any, s: any) => {
  acc[s.name] = s.weight;
  return acc;
}, {});

export const ROUND1_ALL_QUESTIONS = ROUND1_SECTIONS.flatMap((s: any) =>
  s.questions.map((q: any, qi: number) => ({
    ...q,
    section: s.name,
    question_id: `${s.name}_${qi}`,
  }))
);

// ─── Transcript → Scorecard parsing ──────────────────────────────────────────

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    responses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_id: { type: "string", description: "The question ID from the provided list" },
          answer: { type: "string", description: "The candidate's answer derived from the transcript" },
          answered: { type: "boolean", description: "Whether the candidate substantively answered this question" },
          confidence: { type: "number", description: "Confidence 0-1 that the answer maps to this question" },
          source_excerpt: { type: "string", description: "Brief supporting quote from the candidate" },
        },
      },
    },
  },
};

/**
 * Parse a Tavus transcript into Round 1 scorecard responses.
 * Only candidate (role=user) utterances are treated as answers.
 * AI interviewer (role=assistant) utterances are NEVER treated as candidate answers.
 */
export async function parseTranscriptToScorecard(base44: any, transcript: any[]) {
  // Extract only candidate utterances
  const candidateUtterances = (transcript || [])
    .filter((t: any) => t.role === "user")
    .map((t: any) => t.content)
    .filter(Boolean);

  if (candidateUtterances.length === 0) {
    return { responses: [], allAnswered: false, avgConfidence: 0, scorecard: null };
  }

  const questionList = ROUND1_ALL_QUESTIONS.map((q: any) => ({
    question_id: q.question_id,
    section: q.section,
    question: q.question,
  }));

  const prompt = `You are an expert interview analyst. Map candidate answers from an AI-conducted interview transcript to a structured questionnaire.

QUESTIONNAIRE (existing questions with stable IDs):
${JSON.stringify(questionList, null, 2)}

CANDIDATE TRANSCRIPT (only the candidate's spoken responses, AI interviewer lines excluded):
${candidateUtterances.map((u: string, i: number) => `[${i + 1}] ${u}`).join("\n\n")}

RULES:
- Map each candidate statement to the question it best answers.
- Only use the candidate's own words as answers. NEVER fabricate or embellish.
- If a question was not substantively answered by the candidate, set answered=false and answer="".
- Do NOT treat AI interviewer questions/prompts as candidate answers.
- Do NOT infer demographic or protected traits (race, ethnicity, age, disability, sex, etc.).
- Do NOT analyze appearance, facial expression, accent, emotion, or other sensitive characteristics.
- Preserve the candidate's original meaning — do not embellish qualifications.
- confidence is 0-1 reflecting how well the transcript supports the mapping.
- source_excerpt must be a brief verbatim quote from the candidate's transcript.

Return a response for EVERY question in the questionnaire.`;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: PARSE_SCHEMA,
  });

  const responses = result?.responses || [];

  // Build the scorecard in the same format as Round1ScorecardForm.buildResult()
  const responseMap: any = {};
  responses.forEach((r: any) => {
    responseMap[r.question_id] = r;
  });

  const sections = ROUND1_SECTIONS.map((s: any) => ({
    name: s.name,
    weight: s.weight,
    score: 0, // No AI rating — human reviewer fills ratings
    questions: s.questions.map((q: any, qi: number) => {
      const key = `${s.name}_${qi}`;
      const r = responseMap[key] || {};
      return {
        question: q.question,
        section: s.name,
        competencies: q.competencies,
        weight: q.weight,
        excellent_answer: "",
        poor_answer: "",
        why_this_matters: "",
        rating: 0,
        evidence: r.source_excerpt || "",
        notes: r.answer || "",
        answered: r.answered || false,
        confidence: r.confidence || 0,
      };
    }),
  }));

  const answeredCount = responses.filter((r: any) => r.answered).length;
  const allAnswered = answeredCount === ROUND1_ALL_QUESTIONS.length;
  const validResponses = responses.filter((r: any) => r.answered && (r.confidence || 0) >= 0.6);
  const avgConfidence = responses.length > 0
    ? responses.reduce((sum: number, r: any) => sum + (r.confidence || 0), 0) / responses.length
    : 0;

  const scorecard = {
    round: 1,
    candidate_name: "",
    sections,
    competency_scores: {}, // No ratings → no computed scores
    total_score: 0,
    recommendation: "",
    interviewer_confidence: "",
    overall_notes: "Scorecard auto-generated from Tavus AI interview transcript. Ratings require human review.",
    submitted_at: new Date().toISOString(),
    source: "tavus_ai_interview",
  };

  return {
    responses,
    allAnswered,
    avgConfidence,
    validCount: validResponses.length,
    scorecard,
  };
}