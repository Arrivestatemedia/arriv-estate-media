import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createComposition, getCompositionMediaUrl } from "../../shared/twilioRecording.ts";

Deno.serve(async (req) => {
  try {
    // Twilio sends status callbacks as form-encoded data
    const text = await req.text();
    const params = new URLSearchParams(text);

    const eventType = params.get('StatusCallbackEvent') || '';
    const roomSid = params.get('RoomSid') || '';
    const roomName = params.get('RoomName') || '';
    const compositionSid = params.get('CompositionSid') || '';

    console.log('Twilio recording callback:', { eventType, roomSid, roomName, compositionSid });

    const base44 = createClientFromRequest(req);

    // ─── Room ended → create a Composition to combine recordings ────────────
    if (eventType === 'room-ended' && roomSid) {
      try {
        const composition = await createComposition(roomSid);
        console.log('Composition created:', composition.sid);

        // Save composition SID + room SID to conference
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
              twilio_room_sid: roomSid,
              twilio_composition_sid: composition.sid,
            });
          }
        } catch (_) {}
      } catch (e) {
        console.error('Failed to create composition:', e.message);
      }
      return Response.json({ status: 'success', action: 'composition_created' });
    }

    // ─── Composition ready → save the media URL ─────────────────────────────
    if (eventType === 'composition-available' && compositionSid) {
      const compRoomSid = params.get('RoomSid') || '';
      let mediaUrl = params.get('MediaUri') || '';

      // If no MediaUri in the webhook, fetch it from the API
      if (!mediaUrl) {
        try {
          mediaUrl = await getCompositionMediaUrl(compositionSid) || '';
        } catch (_) {}
      }

      // Find conference by room SID or room name
      try {
        let conference = null;
        if (compRoomSid) {
          const confRes = await base44.asServiceRole.entities.Conference.filter(
            { twilio_room_sid: compRoomSid },
            "-created_date",
            5
          );
          const conferences = confRes?.data ?? confRes ?? [];
          conference = Array.isArray(conferences) ? conferences[0] : null;
        }
        if (!conference && roomName) {
          const confRes = await base44.asServiceRole.entities.Conference.filter(
            { room_name: roomName },
            "-created_date",
            5
          );
          const conferences = confRes?.data ?? confRes ?? [];
          conference = Array.isArray(conferences) ? conferences[0] : null;
        }

        if (conference) {
          await base44.asServiceRole.entities.Conference.update(conference.id, {
            twilio_composition_sid: compositionSid,
            twilio_composition_url: mediaUrl || null,
          });

          // Also push to HireCandidate documents if linked
          const participant = conference.participants?.[0];
          if (participant?.email && mediaUrl) {
            try {
              const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
                { email: participant.email },
                "-created_date",
                5
              );
              const candidates = candRes?.data ?? candRes ?? [];
              const candidate = Array.isArray(candidates) ? candidates[0] : null;
              if (candidate) {
                const existingDocs = Array.isArray(candidate.documents) ? candidate.documents : [];
                const recordingDoc = {
                  type: "twilio_backup_recording",
                  url: mediaUrl,
                  label: "Twilio Server-Side Recording (Backup)",
                  conference_id: conference.id,
                  composition_sid: compositionSid,
                  created_at: new Date().toISOString(),
                };
                await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                  documents: [...existingDocs, recordingDoc],
                });
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      return Response.json({ status: 'success', action: 'composition_available', mediaUrl });
    }

    // Other events (room-started, participant-connected, etc.) — acknowledge
    return Response.json({ status: 'success', action: 'event_acknowledged', eventType });
  } catch (error) {
    console.error('twilioRecordingCallback error:', error.message);
    return Response.json({ status: 'error', error: error.message }, { status: 500 });
  }
});