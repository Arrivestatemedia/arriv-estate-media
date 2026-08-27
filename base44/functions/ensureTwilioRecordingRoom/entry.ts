import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createRecordingRoom } from "../../shared/twilioRecording.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName } = body;

    if (!roomName) {
      return Response.json({ error: "roomName is required" }, { status: 400 });
    }

    // Try to create the room with recording enabled.
    // If it already exists (someone already joined), Twilio returns 20404 — that's OK,
    // the room may already have recording if it was pre-created.
    try {
      const room = await createRecordingRoom(roomName);

      // Save room SID to conference if one exists
      try {
        const confRes = await base44.asServiceRole.entities.Conference.filter(
          { room_name: roomName },
          "-created_date",
          5
        );
        const conferences = confRes?.data ?? confRes ?? [];
        const conference = Array.isArray(conferences) ? conferences[0] : null;
        if (conference) {
          await base44.asServiceRole.entities.Conference.update(conference.id, {
            twilio_room_sid: room.sid,
          });
        }
      } catch (_) {}

      return Response.json({ status: "success", roomSid: room.sid, created: true });
    } catch (createError) {
      // Room already exists — not an error, just means it was already created
      console.log("Room already exists or creation failed:", createError.message);
      return Response.json({ status: "success", created: false, message: "Room already exists" });
    }
  } catch (error) {
    console.error("ensureTwilioRecordingRoom error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});