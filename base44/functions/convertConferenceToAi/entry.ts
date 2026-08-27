import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName } = body;

    if (!roomName) {
      return Response.json({ error: "roomName is required" }, { status: 400 });
    }

    const confRes = await base44.asServiceRole.entities.Conference.filter(
      { room_name: roomName },
      "-created_date",
      5
    );
    const conferences = confRes?.data ?? confRes ?? [];
    const conference = Array.isArray(conferences) ? conferences[0] : null;

    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    if (conference.status === "completed" || conference.status === "cancelled") {
      return Response.json({ error: "Cannot convert a completed or cancelled interview" }, { status: 400 });
    }

    await base44.asServiceRole.entities.Conference.update(conference.id, {
      interview_mode: "ai",
    });

    return Response.json({
      status: "success",
      conferenceId: conference.id,
      interviewMode: "ai",
    });
  } catch (error) {
    console.error("convertConferenceToAi error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});