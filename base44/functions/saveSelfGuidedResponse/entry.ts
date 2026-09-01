import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * saveSelfGuidedResponse
 * Persists a single self-guided video response after the candidate accepts it.
 * The system knows which question this answers (direct mapping — no AI inference).
 *
 * Body:
 *   token         — session token
 *   questionId    — canonical question ID (Q1–Q8)
 *   questionIndex — 0-based index
 *   questionText  — question snapshot
 *   recordingUrl  — uploaded file URL
 *   durationSeconds
 *   fileSize
 *   isRerecord    — true if the candidate used their one intentional re-record
 *
 * Marks any prior response for this question as non-final before saving the new one.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token, questionId, questionIndex, questionText, recordingUrl, durationSeconds, fileSize, isRerecord } = body;

    if (!token || !questionId || !recordingUrl) {
      return Response.json({ error: "token, questionId, and recordingUrl are required" }, { status: 400 });
    }

    const res = await base44.asServiceRole.entities.InterviewSession.filter(
      { session_token: token }, "-created_date", 1
    );
    const sessions = (res?.data ?? res) || [];
    const session = Array.isArray(sessions) ? sessions[0] : null;
    if (!session) return Response.json({ error: "Interview not found" }, { status: 404 });

    if (session.expires_at && new Date(session.expires_at) < new Date() && session.status !== "REOPENED") {
      return Response.json({ error: "Interview invitation has expired", status: "expired" }, { status: 403 });
    }

    // Mark prior responses for this question as non-final
    await base44.asServiceRole.entities.InterviewResponse.updateMany(
      { session_id: session.id, question_id: questionId },
      { $set: { is_final: false } }
    );

    // Create the new final response
    const response = await base44.asServiceRole.entities.InterviewResponse.create({
      session_id: session.id,
      application_id: session.application_id,
      question_id: questionId,
      question_text: questionText,
      question_index: questionIndex,
      recording_url: recordingUrl,
      duration_seconds: durationSeconds || 0,
      file_size: fileSize || 0,
      is_rerecord: !!isRerecord,
      is_final: true,
      created_at: new Date().toISOString(),
    });

    // Update session progress
    const allRes = await base44.asServiceRole.entities.InterviewResponse.filter(
      { session_id: session.id, is_final: true }, "question_index", 20
    );
    const all = (allRes?.data ?? allRes) || [];
    const count = Array.isArray(all) ? all.length : 0;
    const nextIndex = Math.max(session.current_question_index || 0, (questionIndex || 0) + 1);

    const newStatus = count >= 1 && session.status === "FORMAT_SELECTED" ? "STARTED" :
      count >= 1 && session.status === "STARTED" ? "IN_PROGRESS" : session.status;

    await base44.asServiceRole.entities.InterviewSession.update(session.id, {
      responses_saved_count: count,
      current_question_index: nextIndex,
      status: newStatus,
      started_at: session.started_at || new Date().toISOString(),
    });

    return Response.json({ status: "success", response, responses_saved: count });
  } catch (error) {
    console.error("saveSelfGuidedResponse error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});