import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createComposition, getCompositionMediaUrl } from "../../shared/twilioRecording.ts";

Deno.serve(async (req) => {
  try {
    // Twilio sends status callbacks as form-encoded data, but also accept JSON for testing
    const contentType = req.headers.get('content-type') || '';
    let params: URLSearchParams;
    if (contentType.includes('application/json')) {
      const json = await req.json();
      params = new URLSearchParams();
      for (const [key, value] of Object.entries(json)) {
        if (value !== null && value !== undefined) params.append(key, String(value));
      }
    } else {
      const text = await req.text();
      params = new URLSearchParams(text);
    }

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
        console.log('Composition created:', composition.sid, 'for room', roomSid);

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
            console.log('Saved composition SID to conference', conference.id);
          }
        } catch (dbErr) {
          console.warn('Failed to save composition SID to conference:', dbErr.message);
        }
      } catch (e) {
        console.error('Failed to create composition:', e.message);
      }
      return Response.json({ status: 'success', action: 'composition_created' });
    }

    // ─── Composition ready → save the media URL ─────────────────────────────
    if (eventType === 'composition-available' && compositionSid) {
      const compRoomSid = params.get('RoomSid') || roomSid;
      let mediaUrl = params.get('MediaUri') || '';

      // If no MediaUri in the webhook, fetch it from the API
      if (!mediaUrl) {
        try {
          mediaUrl = await getCompositionMediaUrl(compositionSid) || '';
        } catch (e) {
          console.warn('Failed to fetch composition media URL:', e.message);
        }
      }

      console.log('Composition available:', { compositionSid, compRoomSid, mediaUrl });

      // Find conference by room SID or room name
      let conference = null;
      try {
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
          console.log('Saved composition URL to conference', conference.id);

          // Also push to HireCandidate documents if linked via participant email
          const participant = conference.participants?.[0];
          if (participant?.email) {
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
                // Avoid duplicate entries for the same composition
                const alreadyHas = existingDocs.some(
                  d => d?.composition_sid === compositionSid || d?.url === mediaUrl
                );
                if (!alreadyHas) {
                  const recordingDoc = {
                    type: "twilio_backup_recording",
                    url: mediaUrl || null,
                    composition_sid: compositionSid,
                    label: "Twilio Server-Side Recording (Backup)",
                    conference_id: conference.id,
                    created_at: new Date().toISOString(),
                  };
                  await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                    documents: [...existingDocs, recordingDoc],
                  });
                  console.log('Saved backup recording to candidate', candidate.id);
                }
              }
            } catch (candErr) {
              console.warn('Failed to save recording to candidate:', candErr.message);
            }
          }
        } else {
          console.warn('No conference found for composition', { compRoomSid, roomName });
        }
      } catch (dbErr) {
        console.error('Failed to save composition to conference:', dbErr.message);
      }

      return Response.json({ status: 'success', action: 'composition_available', mediaUrl });
    }

    // Other events (room-started, participant-connected, recording-started, etc.) — acknowledge
    return Response.json({ status: 'success', action: 'event_acknowledged', eventType });
  } catch (error) {
    console.error('twilioRecordingCallback error:', error.message);
    return Response.json({ status: 'error', error: error.message }, { status: 500 });
  }
});