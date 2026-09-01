import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * getInterviewSession
 * Candidate-facing secure access to an InterviewSession by token.
 * Returns the session + canonical questions. Marks OPENED on first access.
 * Enforces expiration — expired sessions return status "expired".
 *
 * Body: { token }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token) {
      return Response.json({ error: "token is required" }, { status: 400 });
    }

    const res = await base44.asServiceRole.entities.InterviewSession.filter(
      { session_token: token },
      "-created_date",
      1
    );
    const sessions = (res?.data ?? res) || [];
    const session = Array.isArray(sessions) ? sessions[0] : null;

    if (!session) {
      return Response.json({ error: "Interview not found", status: "not_found" }, { status: 404 });
    }

    const now = new Date();
    const expired = session.expires_at && new Date(session.expires_at) < now &&
      !["COMPLETED"].includes(session.status);

    if (expired && !["REOPENED"].includes(session.status)) {
      if (session.status !== "EXPIRED") {
        await base44.asServiceRole.entities.InterviewSession.update(session.id, { status: "EXPIRED" });
      }
      return Response.json({
        status: "expired",
        expires_at: session.expires_at,
        candidate_name: session.candidate_name,
        position_title: session.position_title,
      });
    }

    // Mark OPENED on first access
    if (session.status === "INVITED") {
      await base44.asServiceRole.entities.InterviewSession.update(session.id, {
        status: "OPENED",
        opened_at: now.toISOString(),
      });
      session.status = "OPENED";
      session.opened_at = now.toISOString();
    }

    // Load any saved self-guided responses (for resume support)
    let savedResponses = [];
    try {
      const rr = await base44.asServiceRole.entities.InterviewResponse.filter(
        { session_id: session.id, is_final: true },
        "question_index",
        20
      );
      savedResponses = (rr?.data ?? rr) || [];
      if (!Array.isArray(savedResponses)) savedResponses = [];
    } catch (_) {}

    return Response.json({
      status: "success",
      session: {
        id: session.id,
        status: session.status,
        candidate_name: session.candidate_name,
        position_title: session.position_title,
        delivery_mode: session.delivery_mode,
        expires_at: session.expires_at,
        deadline_hours: session.deadline_hours,
        started_at: session.started_at,
        current_question_index: session.current_question_index || 0,
        conference_id: session.conference_id,
      },
      saved_responses: savedResponses.map(r => ({
        question_id: r.question_id,
        question_index: r.question_index,
        recording_url: r.recording_url,
        duration_seconds: r.duration_seconds,
        transcript: r.transcript,
      })),
    });
  } catch (error) {
    console.error("getInterviewSession error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});