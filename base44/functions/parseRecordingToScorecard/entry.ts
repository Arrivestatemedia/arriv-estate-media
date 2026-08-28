import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { parsePlainTextToScorecard, parseTranscriptToScorecard, getTavusConversationTranscript } from "../../shared/tavusInterview.ts";

/**
 * parseRecordingToScorecard
 *
 * Given a conference ID (or room name), obtains the interview transcript and
 * parses it into a Round 1 scorecard, saving it to the Conference and linked
 * HireCandidate.
 *
 * Two paths:
 *  1. AI interviews (has tavus_conversation_id): fetch the transcript directly
 *     from the Tavus API verbose endpoint — no file download needed, handles
 *     any recording length.
 *  2. Human interviews (no tavus_conversation_id): transcribe the recording
 *     via Whisper. Works for recordings under 25MB (Whisper's limit).
 *
 * Admin-only.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { conferenceId, roomName } = body || {};
    if (!conferenceId && !roomName) {
      return Response.json({ error: "conferenceId or roomName is required" }, { status: 400 });
    }

    // ─── Resolve the conference ───────────────────────────────────────────
    let conference: any = null;
    if (conferenceId) {
      try {
        conference = await base44.asServiceRole.entities.Conference.get(conferenceId);
      } catch (_) { conference = null; }
    }
    if (!conference && roomName) {
      const confRes = await base44.asServiceRole.entities.Conference.filter(
        { room_name: roomName }, "-created_date", 5
      );
      const conferences = confRes?.data ?? confRes ?? [];
      conference = Array.isArray(conferences) ? conferences[0] : null;
    }
    if (!conference) {
      return Response.json({ error: "Conference not found" }, { status: 404 });
    }

    const participant = conference.participants?.[0];
    const candidateName = participant?.name || conference.title || "";

    // ─── Obtain the transcript ───────────────────────────────────────────
    let transcriptText = "";
    let transcriptSource = "";

    if (conference.tavus_conversation_id) {
      // ── Path 1: AI interview — fetch transcript from Tavus API ─────────
      transcriptSource = "tavus_api";
      let tavusTranscript: any[] = [];
      try {
        tavusTranscript = await getTavusConversationTranscript(conference.tavus_conversation_id);
        if (!tavusTranscript) {
          return Response.json({
            error: "Tavus transcript is not yet available. The conversation may still be processing. Try again in a few minutes.",
          }, { status: 422 });
        }
      } catch (e) {
        return Response.json({ error: `Failed to fetch Tavus transcript: ${e.message}` }, { status: 500 });
      }

      // Filter to only user (candidate) and assistant (interviewer) entries.
      // The Tavus transcript includes system/tool entries (PAL instructions,
      // tool calls) that would pollute the scorecard parsing.
      const filteredTranscript = tavusTranscript.filter(
        (e: any) => e.role === "user" || e.role === "assistant"
      );

      if (filteredTranscript.length === 0) {
        return Response.json({
          error: "The Tavus transcript contains no candidate or interviewer speech (only system/context entries). The candidate may not have joined or spoken during this interview.",
        }, { status: 422 });
      }

      // Build a plain-text version for audit storage
      transcriptText = filteredTranscript
        .map((entry: any) => {
          const role = entry.role === "user" ? "Candidate" : "Interviewer";
          return `[${role}] ${entry.content || ""}`;
        })
        .join("\n")
        .trim();

      // Use the structured transcript parser (only candidate utterances as answers)
      let parsed: any = { scorecard: null, confidence: 0, review_required: true, all_answered: false };
      try {
        parsed = await parseTranscriptToScorecard(base44, filteredTranscript, candidateName);
      } catch (e) {
        return Response.json({ error: `Scorecard parsing failed: ${e.message}` }, { status: 500 });
      }
      return await saveAndRespond(base44, conference, participant, candidateName, transcriptText, transcriptSource, parsed);
    } else {
      // ── Path 2: Human interview — transcribe recording via Whisper ──────
      transcriptSource = "whisper";
      const rawRecordingUrl = conference.recording_url || conference.twilio_composition_url || null;
      if (!rawRecordingUrl) {
        return Response.json({
          error: "No recording available to transcribe. Upload a recording first.",
        }, { status: 400 });
      }

      // Whisper requires a file extension in the URL. Local uploads (webm)
      // and Twilio compositions already have extensions. S3 URIs without
      // extensions cannot be transcribed directly.
      const hasExtension = /\.(webm|mp4|mp3|wav|m4a|ogg|oga|flac|mpeg|mpga)(\?|$)/i.test(rawRecordingUrl);
      if (!hasExtension) {
        return Response.json({
          error: "Recording URL has no file extension and cannot be transcribed by Whisper. Ensure the recording is uploaded as a .webm or .mp4 file.",
        }, { status: 400 });
      }

      try {
        const trRes: any = await base44.integrations.Core.TranscribeAudio({ audio_url: rawRecordingUrl });
        transcriptText = (trRes?.data?.transcript || trRes?.transcript || trRes?.data || trRes || "").toString().trim();
      } catch (e) {
        return Response.json({
          error: `Transcription failed: ${e.message}. The recording may exceed Whisper's 25MB limit.`,
        }, { status: 500 });
      }
    }

    if (!transcriptText) {
      return Response.json({
        error: "Transcription returned empty text. The recording may have no audible speech.",
      }, { status: 422 });
    }

    // ─── Parse the transcript into a Round 1 scorecard ──────────────────────
    let parsed: any = { scorecard: null, confidence: 0, review_required: true, all_answered: false };
    try {
      parsed = await parsePlainTextToScorecard(base44, transcriptText, candidateName);
    } catch (e) {
      return Response.json({ error: `Scorecard parsing failed: ${e.message}` }, { status: 500 });
    }

    return await saveAndRespond(base44, conference, participant, candidateName, transcriptText, transcriptSource, parsed);
  } catch (error) {
    console.error("parseRecordingToScorecard error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ─── Shared save + respond helper ─────────────────────────────────────────
async function saveAndRespond(
  base44: any,
  conference: any,
  participant: any,
  candidateName: string,
  transcriptText: string,
  transcriptSource: string,
  parsed: any,
): Promise<Response> {
  // ─── Save the transcript + scorecard ───────────────────────────────────
  try {
    await base44.asServiceRole.entities.TavusInterviewTranscript.create({
      conference_id: conference.id,
      conversation_id: conference.tavus_conversation_id || `recording-${conference.id}`,
      application_id: participant?.id || null,
      candidate_id: null,
      candidate_name: candidateName,
      transcript: [{ role: "user", content: transcriptText, timestamp: null, seconds_from_start: null, duration: null }],
      raw_payload: { source: transcriptSource, transcript_text: transcriptText },
      event_type: "recording.transcribed",
      status: "completed",
      parsed_scorecard: parsed.scorecard,
      parsing_confidence: parsed.confidence,
      review_required: parsed.review_required,
      scorecard_saved: !!parsed.scorecard && !parsed.review_required,
      received_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("Failed to store recording transcript:", e.message);
  }

  if (parsed.scorecard && !parsed.review_required) {
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      round1_scorecard: parsed.scorecard,
      scorecard_completed_at: new Date().toISOString(),
      tavus_scorecard_saved: true,
      tavus_review_required: false,
    });

    if (participant?.email) {
      try {
        const candRes = await base44.asServiceRole.entities.HireCandidate.filter(
          { email: participant.email }, "-created_date", 5
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
        console.warn("Failed to update HireCandidate with parsed scorecard:", e.message);
      }
    }
  } else if (parsed.review_required) {
    await base44.asServiceRole.entities.Conference.update(conference.id, {
      tavus_review_required: true,
    });
  }

  return Response.json({
    status: "success",
    conferenceId: conference.id,
    transcript_source: transcriptSource,
    transcript_length: transcriptText.length,
    transcript_preview: transcriptText.substring(0, 500),
    confidence: parsed.confidence,
    review_required: parsed.review_required,
    all_answered: parsed.all_answered,
    total_score: parsed.scorecard?.total_score ?? null,
    saved: !!parsed.scorecard && !parsed.review_required,
  });
}