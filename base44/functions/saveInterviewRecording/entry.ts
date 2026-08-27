import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { roomName, recordingUrl, durationSeconds, fileSize } = body;

    if (!roomName || !recordingUrl) {
      return Response.json({ error: "roomName and recordingUrl are required" }, { status: 400 });
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

    // 1. Update Conference with recording URL
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      recording_url: recordingUrl,
      recording_status: "ready",
      recording_duration_seconds: durationSeconds || null,
    });

    // 2. Create a VideoRecording record (same entity used by human interviews)
    const participant = conference.participants?.[0];
    try {
      await base44.asServiceRole.entities.VideoRecording.create({
        file_url: recordingUrl,
        duration_seconds: durationSeconds || 0,
        file_size: fileSize || 0,
        recorded_by_id: conference.organizer_id || null,
        recorded_by_name: conference.organizer_name || "AI Interviewer",
        participant_name: participant?.name || conference.title || "",
        room_name: roomName,
      });
    } catch (e) {
      console.warn("Failed to create VideoRecording:", e.message);
    }

    // 3. If linked to a HireCandidate, add recording to their documents array
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
          const recordingDoc = {
            type: "interview_recording",
            url: recordingUrl,
            label: `AI Interview Recording${durationSeconds ? ` (${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")})` : ""}`,
            conference_id: conference.id,
            created_at: new Date().toISOString(),
          };
          await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
            documents: [...existingDocs, recordingDoc],
          });
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