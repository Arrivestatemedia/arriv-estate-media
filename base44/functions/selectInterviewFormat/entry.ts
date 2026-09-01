import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * selectInterviewFormat
 * Records the candidate's delivery-mode choice (CONVERSATIONAL_AI or SELF_GUIDED_VIDEO).
 * For CONVERSATIONAL_AI, creates a Conference (interview_mode=ai) and links it.
 * This field is operational/analytics only — it NEVER influences scoring.
 *
 * Body: { token, deliveryMode }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { token, deliveryMode } = body;

    if (!token) return Response.json({ error: "token is required" }, { status: 400 });
    if (!["CONVERSATIONAL_AI", "SELF_GUIDED_VIDEO"].includes(deliveryMode)) {
      return Response.json({ error: "Invalid delivery mode" }, { status: 400 });
    }

    const res = await base44.asServiceRole.entities.InterviewSession.filter(
      { session_token: token }, "-created_date", 1
    );
    const sessions = (res?.data ?? res) || [];
    const session = Array.isArray(sessions) ? sessions[0] : null;
    if (!session) return Response.json({ error: "Interview not found" }, { status: 404 });

    // Enforce expiration
    if (session.expires_at && new Date(session.expires_at) < new Date() && session.status !== "REOPENED") {
      return Response.json({ error: "Interview invitation has expired", status: "expired" }, { status: 403 });
    }

    let conferenceId = session.conference_id;

    // For conversational AI, create a Conference record in AI mode so the
    // existing Tavus flow (createTavusInterviewConversation) works unchanged.
    if (deliveryMode === "CONVERSATIONAL_AI" && !conferenceId) {
      const roomName = `async-${session.id.slice(-8)}-${Date.now()}`;
      const conf = await base44.asServiceRole.entities.Conference.create({
        title: `First-Round Interview — ${session.candidate_name}`,
        description: `Asynchronous first-round (Conversational AI) for ${session.candidate_name}.`,
        scheduled_date: new Date().toISOString().slice(0, 10),
        scheduled_time: new Date().toTimeString().slice(0, 5),
        duration_minutes: 15,
        room_name: roomName,
        organizer_id: session.created_by_id || "async",
        organizer_name: "Arriv Recruiting",
        organizer_email: "careers@arrivestatemedia.com",
        participants: [{ id: session.application_id, name: session.candidate_name, email: session.candidate_email }],
        status: "scheduled",
        interview_mode: "ai",
      });
      conferenceId = conf.id;
    }

    await base44.asServiceRole.entities.InterviewSession.update(session.id, {
      delivery_mode: deliveryMode,
      status: "FORMAT_SELECTED",
      format_selected_at: new Date().toISOString(),
      conference_id: conferenceId,
    });

    return Response.json({
      status: "success",
      delivery_mode: deliveryMode,
      conference_id: conferenceId,
      room_name: conferenceId ? `async-${session.id.slice(-8)}` : null,
    });
  } catch (error) {
    console.error("selectInterviewFormat error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});