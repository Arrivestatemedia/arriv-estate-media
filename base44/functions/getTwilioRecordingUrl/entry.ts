import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { getCompositionMediaUrl } from "../../shared/twilioRecording.ts";

/**
 * Returns a fresh, directly-downloadable URL for a Twilio composition recording.
 * Called from the admin UI when viewing an applicant's backup recording.
 */
Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { compositionSid } = body;

    if (!compositionSid) {
      return Response.json({ error: "compositionSid is required" }, { status: 400 });
    }

    const mediaUrl = await getCompositionMediaUrl(compositionSid);

    return Response.json({ mediaUrl });
  } catch (error) {
    console.error("getTwilioRecordingUrl error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});