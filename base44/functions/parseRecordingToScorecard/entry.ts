import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { parsePlainTextToScorecard } from "../../shared/tavusInterview.ts";
import { parseS3Key } from "../../shared/tavusRecordingStorage.ts";

/**
 * parseRecordingToScorecard
 *
 * Given a conference ID (or room name), finds the uploaded interview recording,
 * transcribes it via Whisper (TranscribeAudio), parses the transcript into a
 * Round 1 scorecard using the LLM, and saves the scorecard to the Conference
 * (and linked HireCandidate, if any).
 *
 * This lets admins generate a scorecard from a HUMAN interview recording (which
 * has no Tavus transcript) by parsing the audio itself.
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

    // ─── Resolve a transcribable recording URL ─────────────────────────────
    // Prefer the local uploaded recording; fall back to Twilio composition;
    // fall back to the Tavus S3 recording.
    const rawRecordingUri = conference.recording_url || conference.twilio_composition_url || conference.tavus_recording_storage_uri || null;
    if (!rawRecordingUri) {
      return Response.json({
        error: "No recording available to transcribe. Upload a recording first.",
      }, { status: 400 });
    }

    // ─── Ensure the recording URL has a recognizable audio extension ────────
    // Whisper infers the format from the URL's file extension. S3 URIs and
    // their presigned URLs for Tavus recordings have no extension (the key is
    // a numeric ID). We generate a presigned URL with a response-content-
    // disposition header that includes a .mp4 filename so Whisper can detect
    // the format. Tavus server-side recordings are mp4; local MediaRecorder
    // uploads are webm and already have an extension in their URL.
    let transcribeUrl = rawRecordingUri;
    const hasExtension = /\.(webm|mp4|mp3|wav|m4a|ogg|oga|flac|mpeg|mpga)(\?|$)/i.test(rawRecordingUri);
    if (!hasExtension) {
      try {
        const s3Key = parseS3Key(rawRecordingUri);
        if (!s3Key) throw new Error("Could not parse S3 key from recording URI");
        const res: any = await base44.functions.invoke("getTavusRecordingUrl", {
          storageUri: rawRecordingUri,
          responseContentType: "video/mp4",
          responseContentDisposition: 'attachment; filename="recording.mp4"',
        });
        transcribeUrl = res?.data?.url || res?.url || null;
        if (!transcribeUrl) throw new Error("getTavusRecordingUrl returned no URL");
        // Append a .mp4 fragment so Whisper's extension parser detects the
        // format. The fragment is not sent to S3, so the presigned URL
        // signature stays valid.
        transcribeUrl = transcribeUrl + "#.mp4";
      } catch (e) {
        return Response.json({ error: `Failed to prepare recording for transcription: ${e.message}` }, { status: 500 });
      }
    } else if (transcribeUrl.startsWith("s3://")) {
      // Already has an extension but is an s3:// URI — resolve to presigned URL
      try {
        const res = await base44.functions.invoke("getTavusRecordingUrl", { storageUri: transcribeUrl });
        transcribeUrl = res?.data?.url || res?.url || transcribeUrl;
      } catch (e) {
        return Response.json({ error: `Failed to resolve S3 recording URL: ${e.message}` }, { status: 500 });
      }
    }

    // ─── Transcribe the audio via Whisper ──────────────────────────────────
    let transcriptText = "";
    try {
      const trRes: any = await base44.integrations.Core.TranscribeAudio({ audio_url: transcribeUrl });
      transcriptText = (trRes?.data?.transcript || trRes?.transcript || trRes?.data || trRes || "").toString().trim();
    } catch (e) {
      return Response.json({
        error: `Transcription failed: ${e.message}`,
      }, { status: 500 });
    }
    if (!transcriptText) {
      return Response.json({
        error: "Transcription returned empty text. The recording may have no audible speech.",
      }, { status: 422 });
    }

    // ─── Parse the transcript into a Round 1 scorecard ──────────────────────
    const participant = conference.participants?.[0];
    const candidateName = participant?.name || conference.title || "";

    let parsed: any = { scorecard: null, confidence: 0, review_required: true, all_answered: false };
    try {
      parsed = await parsePlainTextToScorecard(base44, transcriptText, candidateName);
    } catch (e) {
      return Response.json({ error: `Scorecard parsing failed: ${e.message}` }, { status: 500 });
    }

    // ─── Save the scorecard ─────────────────────────────────────────────────
    // Always store the transcript on a TavusInterviewTranscript record for audit
    try {
      await base44.asServiceRole.entities.TavusInterviewTranscript.create({
        conference_id: conference.id,
        conversation_id: conference.tavus_conversation_id || `recording-${conference.id}`,
        application_id: participant?.id || null,
        candidate_id: null,
        candidate_name: candidateName,
        transcript: [{ role: "user", content: transcriptText, timestamp: null, seconds_from_start: null, duration: null }],
        raw_payload: { source: "recording_transcription", audio_url, transcript_text: transcriptText },
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
      transcript_length: transcriptText.length,
      confidence: parsed.confidence,
      review_required: parsed.review_required,
      all_answered: parsed.all_answered,
      total_score: parsed.scorecard?.total_score ?? null,
      saved: !!parsed.scorecard && !parsed.review_required,
    });
  } catch (error) {
    console.error("parseRecordingToScorecard error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}