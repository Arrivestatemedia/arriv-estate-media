/**
 * Tavus CVI interview shared helpers.
 * Server-side only (Deno). Never expose TAVUS_API_KEY to the client.
 */

import { getRecordingStorageConfig } from "./tavusRecordingStorage.ts";

export const TAVUS_API_BASE = "https://tavusapi.com/v2";

// The Tavus PAL that has the Arriv interview questionnaire + default Face configured.
// Change this constant if the PAL is recreated in the Tavus dashboard.
export const TAVUS_PAL_ID = "p5f532a78213";

export function tavusHeaders() {
  const key = Deno.env.get("TAVUS_API_KEY");
  if (!key) throw new Error("TAVUS_API_KEY not configured");
  return {
    "x-api-key": key,
    "Content-Type": "application/json",
  };
}

export function getCallbackUrl() {
  const domain = Deno.env.get("BASE44_APP_DOMAIN") || "https://arrivestatemedia.base44.app";
  return `${domain}/functions/tavusInterviewCallback`;
}

/**
 * Build the recording properties for the Tavus API.
 * Returns { auto_start_recording, recording_storage } when S3 is configured,
 * or null when server-side recording is not set up (local MediaRecorder is
 * used as a fallback in that case).
 */
function buildRecordingProperties(): Record<string, any> | null {
  // Uses the shared helper which normalizes the AWS region
  // (handles "US East (Ohio) us-east-2" → "us-east-2").
  const storage = getRecordingStorageConfig();
  if (!storage) return null;
  return {
    auto_start_recording: true,
    recording_storage: storage,
  };
}

/** Create a new Tavus CVI conversation. */
export async function createTavusConversation(opts: {
  palId?: string;
  conversationName: string;
  requireAuth?: boolean;
  maxParticipants?: number;
  /**
   * Stable per-user identifier (e.g. candidate email) passed as a Tavus
   * memory store. This lets the PAL (Ashley) remember the candidate across
   * multiple conversations and proactively welcome them back. Per Tavus docs,
   * memory_stores should be a stable, unique identifier for the user.
   */
  memoryStore?: string;
}) {
  const body: Record<string, any> = {
    pal_id: opts.palId || TAVUS_PAL_ID,
    conversation_name: opts.conversationName,
    callback_url: getCallbackUrl(),
    require_auth: opts.requireAuth !== false,
    max_participants: opts.maxParticipants || 2,
  };

  // Pass a stable per-candidate memory store so Ashley (the PAL) can recall
  // details from prior interviews and welcome returning candidates by name.
  if (opts.memoryStore) {
    body.memory_stores = [opts.memoryStore];
  }

  // Enable Tavus server-side recording when S3 storage is configured.
  // This is the primary failsafe — recordings are written directly to our S3
  // bucket by Tavus, independent of the candidate's browser state.
  const recordingProps = buildRecordingProperties();
  if (recordingProps) {
    body.properties = recordingProps;
  }

  const res = await fetch(`${TAVUS_API_BASE}/conversations`, {
    method: "POST",
    headers: tavusHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = JSON.stringify(data);
    throw new Error(`${data?.message || data?.error || "Tavus create failed"} | FULL RESPONSE: ${detail}`);
  }
  return data; // { conversation_id, conversation_url, meeting_token, ... }
}

/** Get an existing Tavus conversation (to check if still active). */
export async function getTavusConversation(conversationId: string) {
  const res = await fetch(`${TAVUS_API_BASE}/conversations/${conversationId}`, {
    headers: tavusHeaders(),
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Tavus get failed (${res.status})`);
  return data;
}

/** End a Tavus conversation. */
export async function endTavusConversation(conversationId: string) {
  const res = await fetch(`${TAVUS_API_BASE}/conversations/${conversationId}/end`, {
    method: "POST",
    headers: tavusHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || `Tavus end failed (${res.status})`);
  }
  return true;
}

// ─── Round 1 question definitions (mirrored from src/lib/round1Questions.js) ──
// Backend can't import from src/, so we define a compact copy for the LLM parser.
export const ROUND1_QUESTIONS_FOR_LLM = [
  { id: "Communication_0", section: "Communication", question: "Tell me about yourself." },
  { id: "Communication_1", section: "Communication", question: "Tell me about a difficult conversation you handled well." },
  { id: "Communication_2", section: "Communication", question: "How do you prefer to communicate with others and why?" },
  { id: "Confidence_0", section: "Confidence", question: "What accomplishment are you most proud of?" },
  { id: "Confidence_1", section: "Confidence", question: "Describe a time you stepped outside your comfort zone." },
  { id: "Confidence_2", section: "Confidence", question: "What motivates you every day?" },
  { id: "Coachability_0", section: "Coachability", question: "Tell me about a time you received constructive criticism." },
  { id: "Coachability_1", section: "Coachability", question: "What did you do with that feedback?" },
  { id: "Coachability_2", section: "Coachability", question: "Tell me about a mistake you made and what you learned." },
  { id: "Work Ethic_0", section: "Work Ethic", question: "Describe a difficult challenge you've overcome." },
  { id: "Work Ethic_1", section: "Work Ethic", question: "How do you stay organized?" },
  { id: "Work Ethic_2", section: "Work Ethic", question: "Tell me about a time you went above and beyond." },
  { id: "Professionalism_0", section: "Professionalism", question: "Tell me about a disagreement with a coworker or manager." },
  { id: "Professionalism_1", section: "Professionalism", question: "How do you react when treated unfairly?" },
  { id: "Problem Solving / Judgment_0", section: "Problem Solving / Judgment", question: "Describe a time you had to make a decision with incomplete information." },
  { id: "Problem Solving / Judgment_1", section: "Problem Solving / Judgment", question: "Tell me about a problem you solved that others couldn't." },
  { id: "Problem Solving / Judgment_2", section: "Problem Solving / Judgment", question: "How do you approach a problem you've never encountered before?" },
  { id: "Culture Fit_0", section: "Culture Fit", question: "What kind of manager brings out your best?" },
  { id: "Culture Fit_1", section: "Culture Fit", question: "What type of company culture helps you thrive?" },
  { id: "Culture Fit_2", section: "Culture Fit", question: "Why do you want to work at Arriv?" },
];

/**
 * Parse a Tavus transcript into a Round 1 scorecard using InvokeLLM.
 * Only candidate (role=user) utterances are used as answers.
 * Returns { scorecard, confidence, review_required, all_answered }.
 */
export async function parseTranscriptToScorecard(base44: any, transcript: any[], candidateName?: string) {
  // Extract only candidate utterances
  const candidateUtterances = (transcript || [])
    .filter((t: any) => t.role === "user")
    .map((t: any, i: number) => `[${i}] ${t.content || ""}`)
    .join("\n");

  if (!candidateUtterances.trim()) {
    return { scorecard: null, confidence: 0, review_required: true, all_answered: false };
  }

  const questionsList = ROUND1_QUESTIONS_FOR_LLM.map(q => `- ${q.id} (${q.section}): ${q.question}`).join("\n");

  const prompt = `You are an expert hiring analyst. Below is a transcript of a job interview where the candidate was asked the following questions. Map each question to the candidate's answer from the transcript.

RULES:
- Only use the candidate's spoken words as answers. Do NOT fabricate, embellish, or infer answers that weren't given.
- If a question was not asked or not answered, set "answered" to false and leave "answer" empty.
- For each answered question, provide a confidence score (0-1) on how well the transcript supports the answer.
- Provide a rating (1-5) for each answered question based on the quality of the answer. Use 0 if not answered.
- Do NOT infer demographic information, appearance, or emotional state from the transcript.
- Keep "source_excerpt" as a direct quote from the transcript (max 200 chars).

QUESTIONS:
${questionsList}

CANDIDATE TRANSCRIPT (role=user only):
${candidateUtterances}

Return a JSON object with an "answers" array. Each answer has: question_id, answered (boolean), answer (string), rating (0-5), confidence (0-1), source_excerpt (string).`;

  const schema = {
    type: "object",
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_id: { type: "string" },
            answered: { type: "boolean" },
            answer: { type: "string" },
            rating: { type: "number" },
            confidence: { type: "number" },
            source_excerpt: { type: "string" },
          },
        },
      },
    },
  };

  const llmRes = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: schema,
  });

  const answers = (llmRes as any)?.answers || (llmRes as any)?.data?.answers || [];
  return buildScorecardFromAnswers(answers, candidateName, "Auto-generated from Tavus AI interview transcript.");
}

/**
 * Build a Round 1 scorecard from an array of parsed answers.
 * Shared by the transcript parser and the plain-text (recording) parser.
 * Returns { scorecard, confidence, review_required, all_answered }.
 */
export function buildScorecardFromAnswers(
  answers: any[],
  candidateName: string | undefined,
  overallNotesPrefix: string,
) {
  const answeredCount = answers.filter((a: any) => a.answered).length;
  const avgConfidence = answers.length > 0
    ? answers.reduce((sum: number, a: any) => sum + (a.confidence || 0), 0) / answers.length
    : 0;

  // Build scorecard in Round1ScorecardForm.buildResult() format
  const answerMap: Record<string, any> = {};
  answers.forEach((a: any) => { answerMap[a.question_id] = a; });

  // Group by section
  const sectionsMap: Record<string, any[]> = {};
  ROUND1_QUESTIONS_FOR_LLM.forEach(q => {
    if (!sectionsMap[q.section]) sectionsMap[q.section] = [];
    const ans = answerMap[q.id] || { answered: false, answer: "", rating: 0, confidence: 0, source_excerpt: "" };
    sectionsMap[q.section].push({
      question: q.question,
      section: q.section,
      competencies: [],
      weight: 1,
      rating: ans.answered ? (ans.rating || 0) : 0,
      evidence: ans.source_excerpt || "",
      notes: ans.answered ? ans.answer : "",
    });
  });

  const sectionWeights: Record<string, number> = {
    "Communication": 20, "Confidence": 15, "Coachability": 20, "Work Ethic": 15,
    "Professionalism": 10, "Problem Solving / Judgment": 10, "Culture Fit": 10,
  };

  const sections = Object.entries(sectionsMap).map(([name, questions]) => {
    const answered = questions.filter(q => q.rating > 0);
    const totalWeight = answered.reduce((s, q) => s + q.weight, 0);
    const weightedSum = answered.reduce((s, q) => s + q.rating * q.weight, 0);
    const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight / 5) * 100 * 10) / 10 : 0;
    return { name, weight: sectionWeights[name] || 0, score, questions };
  });

  const totalScore = sections.reduce((s, sec) => s + sec.score * sec.weight, 0) /
    (sections.reduce((s, sec) => s + sec.weight, 0) || 1);
  const allAnswered = answeredCount === ROUND1_QUESTIONS_FOR_LLM.length;
  const reviewRequired = avgConfidence < 0.6 || !allAnswered;

  return {
    scorecard: {
      round: 1,
      candidate_name: candidateName || "",
      sections,
      competency_scores: {},
      total_score: Math.round(totalScore * 10) / 10,
      recommendation: "",
      interviewer_confidence: "AI Interviewer",
      overall_notes: `${overallNotesPrefix} ${answeredCount}/${ROUND1_QUESTIONS_FOR_LLM.length} questions answered.`,
    },
    confidence: Math.round(avgConfidence * 100) / 100,
    review_required: reviewRequired,
    all_answered: allAnswered,
  };
}

/**
 * Parse a plain-text transcript (e.g. from Whisper speech-to-text on an
 * uploaded recording) into a Round 1 scorecard. Unlike parseTranscriptToScorecard,
 * the input has no speaker-role tags, so the LLM must distinguish the
 * interviewer's questions from the candidate's answers itself.
 * Returns { scorecard, confidence, review_required, all_answered }.
 */
export async function parsePlainTextToScorecard(base44: any, transcriptText: string, candidateName?: string) {
  const trimmed = (transcriptText || "").trim();
  if (!trimmed) {
    return { scorecard: null, confidence: 0, review_required: true, all_answered: false };
  }

  const questionsList = ROUND1_QUESTIONS_FOR_LLM.map(q => `- ${q.id} (${q.section}): ${q.question}`).join("\n");

  const prompt = `You are an expert hiring analyst. Below is a raw speech-to-text transcript of a job interview. The transcript has NO speaker labels — it contains both the interviewer's questions and the candidate's answers mixed together. Your job is to identify which of the standard Round 1 questions were asked, and extract the candidate's spoken answers.

RULES:
- Identify the interviewer's questions and match them to the standard question list below by meaning (not exact wording).
- Only use the CANDIDATE's spoken words as answers. Do NOT use the interviewer's prompts or paraphrasing as the answer.
- Do NOT fabricate, embellish, or infer answers that weren't given. If a question was not asked or not answered, set "answered" to false and leave "answer" empty.
- For each answered question, provide a confidence score (0-1) on how well the transcript supports the answer.
- Provide a rating (1-5) for each answered question based on the quality of the answer. Use 0 if not answered.
- Keep "source_excerpt" as a direct quote from the transcript (max 200 chars).

STANDARD QUESTIONS:
${questionsList}

RAW TRANSCRIPT:
${trimmed}

Return a JSON object with an "answers" array. Each answer has: question_id, answered (boolean), answer (string), rating (0-5), confidence (0-1), source_excerpt (string). Include an entry for EVERY question in the standard list.`;

  const schema = {
    type: "object",
    properties: {
      answers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            question_id: { type: "string" },
            answered: { type: "boolean" },
            answer: { type: "string" },
            rating: { type: "number" },
            confidence: { type: "number" },
            source_excerpt: { type: "string" },
          },
        },
      },
    },
  };

  const llmRes = await base44.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: schema,
  });

  const answers = (llmRes as any)?.answers || (llmRes as any)?.data?.answers || [];
  return buildScorecardFromAnswers(answers, candidateName, "Auto-generated from uploaded interview recording transcript.");
}