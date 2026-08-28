import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { parsePlainTextToScorecard } from "../../shared/tavusInterview.ts";
import { parseS3Key, convertToMp3ViaZamzar } from "../../shared/tavusRecordingStorage.ts";

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

    // ─── Resolve to a publicly fetchable URL ──────────────────────────────
    // S3 URIs (s3://bucket/key) and Tavus storage URIs have no file extension
    // and are not publicly accessible. We generate a presigned URL so Zamzar
    // can fetch the file. Local MediaRecorder uploads and Twilio compositions
    // already have a public URL.
    let sourceUrl = rawRecordingUri;
    const isS3Uri = rawRecordingUri.startsWith("s3://") || !rawRecordingUri.startsWith("http");
    if (isS3Uri) {
      try {
        const res: any = await base44.functions.invoke("getTavusRecordingUrl", {
          storageUri: rawRecordingUri,
        });
        sourceUrl = res?.data?.url || res?.url || null;
        if (!sourceUrl) throw new Error("getTavusRecordingUrl returned no URL");
      } catch (e) {
        return Response.json({ error: `Failed to resolve recording URL: ${e.message}` }, { status: 500 });
      }
    }

    // ─── Convert to MP3 via Zamzar, then transcribe via Whisper ────────────
    // Interview recordings are often long (>5 min) and stored as video (mp4
    // or webm), which exceeds Whisper's 25MB limit. We convert to MP3 audio
    // via Zamzar — the resulting file is much smaller and has a proper .mp3
    // extension that Whisper can detect. The MP3 is uploaded to our storage
    // and the resulting URL is passed to TranscribeAudio.
    // Determine the source format for Zamzar
    const isTavusS3 = !!(conference.tavus_recording_storage_uri && rawRecordingUri === conference.tavus_recording_storage_uri);
    const sourceFormat = isTavusS3 ? "mp4" : "webm";

    let transcribeUrl = "";
    try {
      const mp3Blob = await convertToMp3ViaZamzar(sourceUrl, sourceFormat);
      if (mp3Blob.size === 0) throw new Error("Zamzar returned an empty file");

      const file = new File([mp3Blob], `interview-audio-${conference.id}.mp3`, { type: "audio/mpeg" });
      const upRes: any = await base44.integrations.Core.UploadFile({ file });
      transcribeUrl = upRes?.data?.file_url || upRes?.file_url || "";
      if (!transcribeUrl) throw new Error("UploadFile returned no URL");
    } catch (e) {
      return Response.json({ error: `Audio conversion failed: ${e.message}` }, { status: 500 });
    }

    // ─── Transcribe the MP3 via Whisper ───────────────────────────────────
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
        raw_payload: { source: "recording_transcription", recording_url: transcribeUrl, transcript_text: transcriptText },
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
      transcript_preview: transcriptText.substring(0, 500),
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