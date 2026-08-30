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
 * Build conversation properties for the Tavus API.
 * Always includes timeout settings (participant_left_timeout, etc.) so
 * temporary disconnects don't end the conversation. Adds recording config
 * when S3 storage is configured.
 */
function buildConversationProperties(): Record<string, any> {
  // Start with recording config (if S3 storage is set up).
  const storage = getRecordingStorageConfig();
  const props: Record<string, any> = {
    // Keep the conversation alive for 5 minutes after the participant leaves
    // so that a dropped/reconnected candidate rejoins the SAME conversation
    // (resuming the interview) instead of triggering a brand-new one.
    // Without this, Tavus uses its default short timeout, ends the
    // conversation before the candidate can rejoin, and the next
    // createTavusInterviewConversation call creates a fresh conversation
    // that restarts the interview from the beginning.
    // Keep the conversation alive for the full interview duration after the
    // participant leaves, so even a long disconnect (network issues, switching
    // networks) lets the candidate rejoin the SAME conversation and resume.
    participant_left_timeout: 3600,   // 1 hour (matches max_call_duration)
    participant_absent_timeout: 300,  // 5 minutes before anyone joins
    max_call_duration: 3600,          // 1 hour max interview
  };
  if (storage) {
    props.auto_start_recording = true;
    props.recording_storage = storage;
  }
  return props;
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
  /**
   * Optional custom greeting the PAL speaks when a participant joins. Used on
   * reconnects so the PAL acknowledges the disconnection instead of re-greeting
   * from scratch.
   */
  customGreeting?: string;
  /**
   * Optional background context appended to the PAL's existing context
   * (Tavus `conversational_context` field). Used to feed the candidate's
   * name and role so Ashley can greet them personally on the FIRST interview
   * without needing a scripted custom_greeting.
   */
  conversationalContext?: string;
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

  if (opts.customGreeting) {
    body.custom_greeting = opts.customGreeting;
  }

  // Feed the PAL background context (e.g. the candidate's name + role) so she
  // can greet the candidate personally on the first interview. This appends
  // to whatever context the PAL already has configured in the Tavus dashboard.
  if (opts.conversationalContext) {
    body.conversational_context = opts.conversationalContext;
  }

  // Conversation properties: recording (when S3 is configured) + timeout
  // settings that keep the conversation alive during temporary disconnects.
  body.properties = buildConversationProperties();

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

/**
 * Fetch the full transcript for a Tavus conversation via the verbose GET endpoint.
 * Returns an array of { role, content, timestamp, seconds_from_start, duration }
 * entries, or null if the transcript is not yet available.
 */
export async function getTavusConversationTranscript(conversationId: string) {
  const res = await fetch(`${TAVUS_API_BASE}/conversations/${conversationId}?verbose=true`, {
    headers: tavusHeaders(),
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Tavus get failed (${res.status})`);

  // The verbose response includes events; the transcript is in the
  // application.transcription_ready event's properties.transcript array.
  const events = data?.events;
  if (!Array.isArray(events)) return null;

  for (const ev of events) {
    if (ev?.type === "application.transcription_ready" || ev?.event_type === "application.transcription_ready") {
      const transcript = ev?.properties?.transcript || ev?.data?.properties?.transcript;
      if (Array.isArray(transcript) && transcript.length > 0) return transcript;
    }
  }
  return null;
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
// 15-Minute 8-question scorecard. Each question may cover multiple competencies.
// Backend can't import from src/, so we define a compact copy for the LLM parser.
export const ROUND1_QUESTIONS_FOR_LLM = [
  { id: "Q1", section: "Communication", competencies: ["Communication", "Confidence", "Culture Fit"], question: "Give me a quick overview of yourself, your experience, and what interested you in this opportunity with Arriv." },
  { id: "Q2", section: "Work Ethic", competencies: ["Work Ethic", "Problem Solving", "Communication"], question: "Tell me about a challenging situation at work, school, or in another responsibility. What happened, what did you do, and what was the outcome?" },
  { id: "Q3", section: "Coachability", competencies: ["Coachability", "Accountability", "Growth Mindset"], question: "Tell me about a time you received feedback or constructive criticism. What was the feedback, and what did you do differently afterward?" },
  { id: "Q4", section: "Professionalism", competencies: ["Professionalism", "Communication", "Emotional Intelligence"], question: "Tell me about a disagreement or difficult interaction with someone you worked with. How did you handle it?" },
  { id: "Q5", section: "Problem Solving / Judgment", competencies: ["Problem Solving / Judgment", "Adaptability"], question: "When you're given a problem you've never encountered before and don't have all the information, how do you figure out what to do?" },
  { id: "Q6", section: "Confidence", competencies: ["Work Ethic", "Initiative", "Confidence"], question: "Tell me about a time you took initiative or went beyond what was expected of you." },
  { id: "Q7", section: "Work Ethic", competencies: ["Work Ethic", "Reliability", "Independence"], question: "How do you keep yourself organized and accountable when you're responsible for multiple things without someone constantly checking on you?" },
  { id: "Q8", section: "Culture Fit", competencies: ["Culture Fit", "Self-Awareness", "Motivation"], question: "What kind of work environment and management style help you perform at your best, and what are you hoping to find at Arriv?" },
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

  const questionsList = ROUND1_QUESTIONS_FOR_LLM.map(q => `- ${q.id} (competencies: ${q.competencies.join(", ")}): ${q.question}`).join("\n");

  const prompt = `You are an expert hiring analyst. Below is a transcript of a job interview. Map each of the 8 questions to the candidate's answer and rate each competency the answer provides evidence for.

RULES:
- Only use the candidate's spoken words. Do NOT fabricate, embellish, or infer answers not given.
- If a question was not asked or not answered, set "answered" to false.
- Each question covers multiple competencies (listed per question). For each competency the answer provides evidence for, provide a rating (1-5). Set rating to 0 if no evidence.
- Provide an overall confidence (0-1) on how well the transcript covers that question.
- Do NOT infer demographic information, appearance, or emotional state.
- Keep "source_excerpt" as a direct quote from the transcript (max 200 chars).

QUESTIONS (8 total — all are mandatory):
${questionsList}

CANDIDATE TRANSCRIPT (role=user only):
${candidateUtterances}

Return a JSON object with an "answers" array. Each answer has: question_id (string), answered (boolean), answer (string), competency_ratings (object mapping competency name to rating 0-5), confidence (0-1), source_excerpt (string).`;

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
            competency_ratings: { type: "object" },
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
 * Supports the new multi-competency-per-question model: each answer has
 * a `competency_ratings` map (competency -> rating 1-5).
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

  const sectionWeights: Record<string, number> = {
    "Communication": 20, "Confidence": 15, "Coachability": 20, "Work Ethic": 15,
    "Professionalism": 10, "Problem Solving / Judgment": 10, "Culture Fit": 10,
  };

  // Aggregate ratings per competency across all questions
  const competencyRatings: Record<string, number[]> = {};
  const answerMap: Record<string, any> = {};
  answers.forEach((a: any) => { answerMap[a.question_id] = a; });

  for (const q of ROUND1_QUESTIONS_FOR_LLM) {
    const ans = answerMap[q.id];
    if (!ans?.answered) continue;
    const ratings = ans.competency_ratings || {};
    for (const comp of (q.competencies as string[])) {
      const rating = ratings[comp] || ratings[comp.toLowerCase()] || 0;
      if (rating > 0) {
        if (!competencyRatings[comp]) competencyRatings[comp] = [];
        competencyRatings[comp].push(rating);
      }
    }
  }

  // Build sections — one per scorecard competency
  const sections = Object.keys(sectionWeights).map(name => {
    const ratings = competencyRatings[name] || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : 0;
    const score = Math.round((avgRating / 5) * 100 * 10) / 10;
    // Build question list for this section
    const questions = ROUND1_QUESTIONS_FOR_LLM
      .filter(q => (q.competencies as string[]).includes(name))
      .map(q => {
        const ans = answerMap[q.id] || {};
        return {
          question: q.question,
          section: name,
          competencies: q.competencies,
          weight: 1,
          rating: ans.answered ? (ans.competency_ratings?.[name] || 0) : 0,
          evidence: ans.source_excerpt || "",
          notes: ans.answered ? (ans.answer || "") : "",
        };
      });
    return { name, weight: sectionWeights[name], score, questions };
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

  const questionsList = ROUND1_QUESTIONS_FOR_LLM.map(q => `- ${q.id} (competencies: ${q.competencies.join(", ")}): ${q.question}`).join("\n");

  const prompt = `You are an expert hiring analyst. Below is a raw speech-to-text transcript of a job interview. The transcript has NO speaker labels. Identify which of the 8 standard questions were asked, extract the candidate's spoken answers, and rate each competency the answer provides evidence for.

RULES:
- Match interviewer questions to the standard list by meaning (not exact wording).
- Only use the CANDIDATE's spoken words. Do NOT fabricate or infer answers not given.
- If a question was not asked or not answered, set "answered" to false.
- For each competency listed per question, provide a rating (1-5) based on evidence from the candidate's answer. Use 0 if no evidence.
- Provide an overall confidence (0-1) on how well the transcript covers that question.
- Keep "source_excerpt" as a direct quote (max 200 chars).

STANDARD QUESTIONS (8 total):
${questionsList}

RAW TRANSCRIPT:
${trimmed}

Return a JSON object with an "answers" array. Each answer has: question_id (string), answered (boolean), answer (string), competency_ratings (object mapping competency name to rating 0-5), confidence (0-1), source_excerpt (string). Include an entry for EVERY question.`;

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
            competency_ratings: { type: "object" },
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

/**
 * Build a concise resume briefing from a prior conversation transcript so the
 * PAL (Ashley) knows exactly where the interview left off and doesn't re-ask
 * questions. Returns a short string suitable for embedding in a custom_greeting.
 */
export async function buildResumeBriefing(base44: any, transcript: any[], candidateName?: string) {
  if (!transcript || transcript.length === 0) return null;

  // Build a compact readable transcript for the LLM
  const readable = transcript
    .map((t: any, i: number) => {
      const speaker = t.role === "user" ? "Candidate" : "Interviewer";
      return `[${i}] ${speaker}: ${t.content || ""}`;
    })
    .join("\n");

  const questionsList = ROUND1_QUESTIONS_FOR_LLM.map(q => `- ${q.id} (${q.section}): ${q.question}`).join("\n");

  const prompt = `You are helping an AI interviewer resume a job interview that was interrupted by a disconnection. Below is the transcript of the prior conversation AND the full list of Round 1 scorecard questions that MUST all be asked before the interview ends.

Your job: produce a concise resume briefing (max 4-5 sentences) that tells the interviewer:
1. Which questions/topics were ALREADY asked and answered (so she does NOT repeat them)
2. What the last topic or question was when the call dropped (so she can continue from there)
3. Which questions from the full list have NOT yet been asked — she MUST ask every one of these remaining questions before wrapping up the interview. Do NOT let the candidate end the interview early; if they try to defer ("I'll save that for the founder"), politely insist on covering the remaining questions first.

Keep it brief and natural — this will be spoken aloud as part of a greeting. Do not list every detail; just enough so the interviewer knows exactly where to pick up and which questions still need to be asked.

CANDIDATE NAME: ${candidateName || "the candidate"}

FULL ROUND 1 QUESTION LIST (all must be asked across the combined interview):
${questionsList}

PRIOR CONVERSATION TRANSCRIPT:
${readable}

Return a JSON object with a single "briefing" string field containing the resume briefing.`;

  const schema = {
    type: "object",
    properties: {
      briefing: { type: "string" },
    },
  };

  try {
    const llmRes = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema,
    });
    const briefing = (llmRes as any)?.briefing || (llmRes as any)?.data?.briefing;
    return typeof briefing === "string" ? briefing.trim() : null;
  } catch (e) {
    console.warn("buildResumeBriefing LLM call failed:", e.message);
    return null;
  }
}