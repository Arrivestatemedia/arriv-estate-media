import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { buildScorecardFromAnswers, ROUND1_QUESTIONS_FOR_LLM } from "../../shared/tavusInterview.ts";

/**
 * completeSelfGuidedInterview
 * Called after the candidate finishes all self-guided questions.
 * For each saved response: transcribe via Whisper, then rate competencies
 * against the KNOWN question (no AI question-inference needed).
 * Converges into the SAME buildScorecardFromAnswers used by Ashley/Tavus.
 *
 * Body: { token }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token } = body;
    if (!token) return Response.json({ error: "token is required" }, { status: 400 });

    const res = await base44.asServiceRole.entities.InterviewSession.filter(
      { session_token: token }, "-created_date", 1
    );
    const sessions = (res?.data ?? res) || [];
    const session = Array.isArray(sessions) ? sessions[0] : null;
    if (!session) return Response.json({ error: "Interview not found" }, { status: 404 });

    // Load all final responses in question order
    const rr = await base44.asServiceRole.entities.InterviewResponse.filter(
      { session_id: session.id, is_final: true }, "question_index", 20
    );
    const responses = (rr?.data ?? rr) || [];
    if (!Array.isArray(responses) || responses.length === 0) {
      return Response.json({ error: "No responses found" }, { status: 400 });
    }

    // Transcribe + rate each response
    const answers = [];
    for (const resp of responses) {
      let transcript = resp.transcript || "";

      // Transcribe if not already transcribed
      if (!transcript && resp.recording_url) {
        try {
          const tRes = await base44.integrations.Core.TranscribeAudio({ audio_url: resp.recording_url });
          transcript = typeof tRes === "string" ? tRes : (tRes?.transcript || tRes?.text || "");
        } catch (e) {
          console.warn(`Transcription failed for ${resp.question_id}:`, e.message);
        }
        // Persist transcript
        await base44.asServiceRole.entities.InterviewResponse.update(resp.id, {
          transcript, transcribed_at: new Date().toISOString(),
        });
      }

      // Rate competencies for this KNOWN question
      const qDef = ROUND1_QUESTIONS_FOR_LLM.find(q => q.id === resp.question_id);
      if (!qDef) continue;

      const ratings = await rateAnswer(base44, transcript, qDef);
      answers.push({
        question_id: resp.question_id,
        answered: !!(transcript && transcript.trim()),
        answer: transcript || "",
        competency_ratings: ratings,
        confidence: transcript ? 0.9 : 0.2,
        source_excerpt: (transcript || "").slice(0, 200),
      });
    }

    // Build the scorecard using the SAME function Ashley uses
    const { scorecard, confidence, review_required, all_answered } = buildScorecardFromAnswers(
      answers, session.candidate_name,
      "Auto-generated from Self-Guided Video Interview responses."
    );

    // Save scorecard to the session + the application (same as Ashley path)
    await base44.asServiceRole.entities.InterviewSession.update(session.id, {
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
      scorecard_saved: true,
      review_required: review_required,
    });

    // Save to the JobApplication round1_scorecard (same field Ashley uses)
    if (session.application_id) {
      try {
        await base44.asServiceRole.entities.JobApplication.update(session.application_id, {
          status: "interview_invitation",
        });
      } catch (_) {}
      // Also try HireCandidate if linked
      try {
        const hcRes = await base44.asServiceRole.entities.HireCandidate.filter(
          { job_id: session.application_id }, "-created_date", 1
        );
        const hc = (hcRes?.data ?? hcRes)?.[0];
        if (hc) {
          await base44.asServiceRole.entities.HireCandidate.update(hc.id, {
            round1_scorecard: scorecard,
            status: "interviewing",
          });
        }
      } catch (_) {}
    }

    return Response.json({
      status: "success",
      scorecard,
      confidence,
      review_required,
      all_answered,
      answers_count: answers.length,
    });
  } catch (error) {
    console.error("completeSelfGuidedInterview error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function rateAnswer(base44, transcript, qDef) {
  if (!transcript || !transcript.trim()) return {};
  const compList = qDef.competencies.join(", ");
  const prompt = `You are an expert hiring analyst. Rate the candidate's answer for evidence of each listed competency.

QUESTION: ${qDef.question}
COMPETENCIES TO RATE: ${compList}

CANDIDATE ANSWER (transcript):
${transcript}

RULES:
- Rate each competency 1-5 based ONLY on evidence in the answer. Use 0 if no evidence.
- Do NOT infer traits not supported by the answer text.
- Do NOT consider the interview format or delivery method.

Return a JSON object mapping each competency name to its rating (0-5).`;

  const schema = {
    type: "object",
    properties: {},
  };
  for (const comp of qDef.competencies) {
    schema.properties[comp] = { type: "number" };
  }

  try {
    const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });
    return res || {};
  } catch (e) {
    console.warn(`Rating failed for ${qDef.id}:`, e.message);
    return {};
  }
}