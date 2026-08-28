import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName, recordingUrl, durationSeconds, fileSize, recordingStarted, failed, segment } = body;

    if (!roomName) {
      return Response.json({ error: "roomName is required" }, { status: 400 });
    }

    // Find the conference by room_name
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

    const participant = conference.participants?.[0];

    // ─── Recording STARTED: mark status so Twilio webhook knows to wait ──
    if (recordingStarted) {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_status: "recording",
      });
      return Response.json({ status: "success", action: "recording_started" });
    }

    // ─── Recording FAILED: promote Twilio to primary if available ────────
    // The user never sees a failure — Twilio seamlessly becomes the main recording.
    if (failed) {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_status: "failed",
      });

      if (conference.twilio_composition_url && participant?.email) {
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
            const alreadyHas = existingDocs.some(
              d => d?.url === conference.twilio_composition_url ||
                   d?.composition_sid === conference.twilio_composition_sid
            );
            if (!alreadyHas) {
              existingDocs.push({
                type: "interview_recording",
                url: conference.twilio_composition_url,
                composition_sid: conference.twilio_composition_sid,
                label: "Interview Recording",
                conference_id: conference.id,
                created_at: new Date().toISOString(),
              });
              await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                documents: existingDocs,
              });
              console.log("Promoted Twilio to primary after local upload failure");
            }
          }
        } catch (e) {
          console.warn("Failed to promote Twilio after local failure:", e.message);
        }
      }
      // If no composition yet, twilioRecordingCallback will see recording_status="failed"
      // and push the composition as primary when it arrives
      return Response.json({ status: "success", action: "recording_failed" });
    }

    // ─── Recording SUCCEEDED: save local + add Twilio as backup ──────────
    if (!recordingUrl) {
      return Response.json({ error: "recordingUrl is required" }, { status: 400 });
    }

    // 1. Update Conference with recording URL
    //    First segment becomes the primary; subsequent segments are appended as
    //    additional parts (don't overwrite the primary recording_url).
    const segNum = typeof segment === "number" ? segment : 1;
    if (segNum === 1) {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_url: recordingUrl,
        recording_status: "ready",
        recording_duration_seconds: durationSeconds || null,
      });
    } else {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        recording_status: "ready",
        recording_duration_seconds: durationSeconds || null,
      });
    }

    // 2. Create a VideoRecording record (only if one doesn't already exist for this URL)
    try {
      const existingRecs = await base44.asServiceRole.entities.VideoRecording.filter(
        { file_url: recordingUrl },
        "-created_date",
        1
      );
      const recs = existingRecs?.data ?? existingRecs ?? [];
      if (!Array.isArray(recs) || recs.length === 0) {
        await base44.asServiceRole.entities.VideoRecording.create({
          file_url: recordingUrl,
          duration_seconds: durationSeconds || 0,
          file_size: fileSize || 0,
          recorded_by_id: conference.organizer_id || null,
          recorded_by_name: conference.organizer_name || "AI Interviewer",
          participant_name: participant?.name || conference.title || "",
          room_name: roomName,
        });
      }
    } catch (e) {
      console.warn("Failed to create VideoRecording:", e.message);
    }

    // 3. If linked to a HireCandidate, add local as primary + Twilio as backup
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
          const newDocs = [];

          const alreadyHasLocal = existingDocs.some(d => d?.url === recordingUrl);
          if (!alreadyHasLocal) {
            const partLabel = segNum > 1 ? ` (Part ${segNum})` : "";
            newDocs.push({
              type: "interview_recording",
              url: recordingUrl,
              label: `Interview Recording${partLabel}${durationSeconds ? ` (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")})` : ""}`,
              conference_id: conference.id,
              created_at: new Date().toISOString(),
            });
          }

          // If Twilio composition already arrived, add it as backup
          if (conference.twilio_composition_url) {
            const alreadyHasTwilio = existingDocs.some(
              d => d?.url === conference.twilio_composition_url ||
                   d?.composition_sid === conference.twilio_composition_sid
            );
            if (!alreadyHasTwilio) {
              newDocs.push({
                type: "twilio_backup_recording",
                url: conference.twilio_composition_url,
                composition_sid: conference.twilio_composition_sid,
                label: "Backup Recording",
                conference_id: conference.id,
                created_at: new Date().toISOString(),
              });
            }
          }

          if (newDocs.length > 0) {
            await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
              documents: [...existingDocs, ...newDocs],
            });
          }
        }
      } catch (e) {
        console.warn("Failed to update HireCandidate with recording:", e.message);
      }
    }

    return Response.json({ status: "success", conferenceId: conference.id });
  } catch (error) {
    console.error("saveInterviewRecording error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});