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

    if (eventType === "system.shutdown" || eventType === "system.conversation_ended") {
      await base44.asServiceRole.entities.Conference.update(conference.id, {
        tavus_conversation_status: "ended",
        tavus_completed_at: new Date().toISOString(),
        status: "completed",
      });
      return Response.json({ status: "success", action: "ended" });
    }

    if (eventType === "application.recording_ready") {
      // Tavus server-side recording is ready — save storage metadata as backup
      const props = body.properties || {};
      const storageUri = props.storage_uri || (props.bucket_name && props.s3_key ? `s3://${props.bucket_name}/${props.s3_key}` : null);
      try {
        await base44.asServiceRole.entities.Conference.update(conference.id, {
          tavus_recording_storage_uri: storageUri || null,
        });
      } catch (e) {
        console.warn("Failed to save Tavus recording storage URI:", e.message);
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