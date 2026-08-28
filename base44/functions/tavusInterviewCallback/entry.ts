import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { parseTranscriptToScorecard } from "../../shared/tavusInterview.ts";

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    console.log("Tavus callback received:", JSON.stringify(body, null, 2));

    const eventType = body.event_type || body.message_type || "";
    const conversationId = body.conversation_id || body.properties?.conversation_id || "";

    if (!conversationId) {
      return Response.json({ status: "ignored", reason: "no conversation_id" });
    }

    const base44 = createClientFromRequest(req);

    // Find the conference by tavus_conversation_id
    const confRes = await base44.asServiceRole.entities.Conference.filter(
      { tavus_conversation_id: conversationId },
      "-created_date",
      5
    );
    const conferences = confRes?.data ?? confRes ?? [];
    const conference = Array.isArray(conferences) ? conferences[0] : null;

    if (!conference) {
      console.warn("No conference found for conversation", conversationId);
      return Response.json({ status: "ignored", reason: "no conference" });
    }

    // ─── Handle different event types ───────────────────────────────────────
    if (eventType === "system.pal_joined" || eventType === "system.replica_joined") {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: "active",
      });
      return Response.json({ status: "success", action: "pal_joined" });
    }

    // Applicant (human participant) joined the AI interview — session is now live
    if (eventType === "system.participant_joined") {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: "live",
        tavus_started_at: new Date().toISOString(),
      });
      return Response.json({ status: "success", action: "participant_joined" });
    }

    if (eventType === "system.shutdown" || eventType === "system.conversation_ended") {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: "ended",
        tavus_completed_at: new Date().toISOString(),
        status: "completed",
      });
      return Response.json({ status: "success", action: "ended" });
    }

    if (eventType === "application.recording_ready") {
      // Tavus server-side recording is ready — the recording has been durably
      // written to our S3 bucket. Save the permanent storage URI on the
      // conference and create a VideoRecording entity so the admin UI can
      // play it back via a presigned URL (see getTavusRecordingUrl).
      const props = body.properties || {};
      const s3Key = props.s3_key || "";
      const storageUri = props.storage_uri || (props.bucket_name && s3Key ? `s3://${props.bucket_name}/${s3Key}` : null);
      const duration = props.duration || 0;

      try {
        await base44.asServiceRole.entities.Conference.update(conference.id, {
          tavus_recording_storage_uri: storageUri || null,
          recording_status: "ready",
          recording_duration_seconds: duration || conference.recording_duration_seconds || null,
          // Set recording_url to the permanent S3 URI — the admin UI resolves
          // this to a fresh presigned URL via getTavusRecordingUrl on playback.
          recording_url: storageUri || conference.recording_url || null,
        });
      } catch (e) {
        console.warn("Failed to save Tavus recording storage URI:", e.message);
      }

      // Create a VideoRecording entity so the recording appears in the
      // admin Interviews view alongside local recordings. Store the s3:// URI
      // as file_url — the UI detects the s3:// prefix and calls
      // getTavusRecordingUrl to get a fresh presigned playback URL.
      if (storageUri) {
        try {
          // Avoid duplicate VideoRecording entries for the same room
          const existingRecs = await base44.asServiceRole.entities.VideoRecording.filter(
            { room_name: conference.room_name },
            "-created_date",
            10
          );
          const recs = existingRecs?.data ?? existingRecs ?? [];
          const exists = Array.isArray(recs) && recs.some(r => (r.file_url || "").startsWith("s3://"));
          if (!exists) {
            const participant = conference.participants?.[0];
            await base44.asServiceRole.entities.VideoRecording.create({
              file_url: storageUri,
              duration_seconds: duration,
              file_size: 0,
              room_name: conference.room_name || null,
              recorded_by_name: "Tavus AI Interviewer",
              participant_name: participant?.name || conference.title || null,
            });
          }
        } catch (e) {
          console.warn("Failed to create VideoRecording for Tavus recording:", e.message);
        }
      }

      // Sync the recording to the linked HireCandidate's documents so it
      // appears on the applicant's profile (same pattern as local recordings
      // in saveInterviewRecording). The s3:// URI is stored as the url — the
      // admin UI detects the s3:// prefix and resolves it to a fresh presigned
      // playback URL via getTavusRecordingUrl.
      const participant = conference.participants?.[0];
      if (storageUri && participant?.email) {
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
            const alreadyHas = existingDocs.some(d => d?.url === storageUri);
            if (!alreadyHas) {
              const durLabel = duration ? ` (${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")})` : "";
              existingDocs.push({
                type: "interview_recording",
                url: storageUri,
                storage_type: "s3",
                label: `AI Interview Recording${durLabel}`,
                conference_id: conference.id,
                created_at: new Date().toISOString(),
              });
              await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                documents: existingDocs,
              });
            }
          }
        } catch (e) {
          console.warn("Failed to sync Tavus recording to HireCandidate:", e.message);
        }
      }

      return Response.json({ status: "success", action: "recording_ready", storage_uri: storageUri });
    }

    if (eventType === "application.recording_copy_failed") {
      console.warn("Tavus recording copy failed:", body.properties?.error_message);
      return Response.json({ status: "success", action: "recording_copy_failed" });
    }

    if (eventType === "application.transcription_ready" || eventType === "application.transcription") {
      // Extract transcript from the payload
      const transcript = body.transcript || body.properties?.transcript || body.data?.transcript || [];

      // Normalize transcript entries
      const normalized = Array.isArray(transcript)
        ? transcript.map((t: any, i: number) => ({
            role: t.role || t.speaker || "user",
            content: t.content || t.text || t.message || "",
            timestamp: t.timestamp || t.time || null,
            seconds_from_start: t.seconds_from_start ?? t.secondsFromStart ?? null,
            duration: t.duration ?? null,
          }))
        : [];

      // Find linked candidate/application
      const participant = conference.participants?.[0];
      const candidateName = participant?.name || conference.title || "";

      // Parse transcript to scorecard
      let parsed = { scorecard: null, confidence: 0, review_required: true, all_answered: false };
      try {
        parsed = await parseTranscriptToScorecard(base44, normalized, candidateName);
      } catch (e) {
        console.error("Transcript parsing failed:", e.message);
      }

      // Store the transcript
      try {
        await base44.asServiceRole.entities.TavusInterviewTranscript.create({
          conference_id: conference.id,
          conversation_id: conversationId,
          application_id: participant?.id || null,
          candidate_id: null,
          candidate_name: candidateName,
          transcript: normalized,
          raw_payload: body,
          event_type: eventType,
          status: "completed",
          parsed_scorecard: parsed.scorecard,
          parsing_confidence: parsed.confidence,
          review_required: parsed.review_required,
          scorecard_saved: false,
          received_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error("Failed to store transcript:", e.message);
      }

      // Save scorecard to conference if parsing succeeded
      if (parsed.scorecard && !parsed.review_required) {
        try {
          await base44.asServiceRole.entities.Conference.update(conference.id, {
            round1_scorecard: parsed.scorecard,
            scorecard_completed_at: new Date().toISOString(),
            tavus_scorecard_saved: true,
            tavus_review_required: false,
          });

          // If linked to a HireCandidate, also save there
          if (participant?.id) {
            try {
              const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
                { email: participant.email },
                "-created_date",
                5
              );
              const candidates = candRes?.data ?? candRes ?? [];
              const candidate = Array.isArray(candidates) ? candidates[0] : null;
              if (candidate) {
                await base44.asServiceRole.entities.HireCandidate.update(candidate.id, {
                  round1_scorecard: parsed.scorecard,
                  status: "interviewing",
                });
              }
            } catch (e) {
              console.warn("Failed to update HireCandidate:", e.message);
            }
          }
        } catch (e) {
          console.error("Failed to save scorecard:", e.message);
        }
      } else if (parsed.review_required) {
        await base44.asServiceRole.entities.Conference.update(conference.id, {
          tavus_review_required: true,
        });
      }

      return Response.json({ status: "success", action: "transcript_stored", review_required: parsed.review_required });
    }

    // Unhandled event type — acknowledge to prevent Tavus retries
    return Response.json({ status: "success", action: "unhandled_event", event_type: eventType });
  } catch (error) {
    console.error("tavusInterviewCallback error:", error.message);
    return Response.json({ status: "error", error: error.message }, { status: 500 });
  }
});