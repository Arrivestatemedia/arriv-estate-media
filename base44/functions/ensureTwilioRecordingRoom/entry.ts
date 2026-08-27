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

    console.log('ensureTwilioRecordingRoom: creating room', roomName);

    try {
      const room = await createRecordingRoom(roomName);
      console.log('Twilio recording room created:', room.sid, room.uniqueName);

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
          console.log('Saved twilio_room_sid to conference', conference.id);
        }
      } catch (dbErr) {
        console.warn('Failed to save twilio_room_sid to conference:', dbErr.message);
      }

      return Response.json({ status: "success", roomSid: room.sid, created: true });
    } catch (createError) {
      const errCode = createError.code || createError.status || '';
      console.error('Twilio room creation error:', {
        code: errCode,
        message: createError.message,
        roomName,
      });

      // Error 20404 = room already exists — that's OK, it may already have recording
      if (errCode === 20404 || /already exists/i.test(createError.message)) {
        return Response.json({ status: "success", created: false, message: "Room already exists" });
      }

      // Any other error — log it but don't block the call
      // The call will still work, just without Twilio server-side backup recording
      console.warn('Twilio recording room creation failed (non-blocking):', createError.message);
      return Response.json({ status: "success", created: false, message: createError.message, warning: true });
    }
  } catch (error) {
    console.error("ensureTwilioRecordingRoom error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});