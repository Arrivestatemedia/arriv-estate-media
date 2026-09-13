import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

// Loads cross-app ChatMessage records for a given cross_app_channel_id.
// ChatMessage RLS is admin-only, so non-admin sales reps can't read these
// messages via the plain SDK client. This function uses asServiceRole to
// bypass RLS, but verifies the caller is a participant in the channel
// (their email must be one of the two emails encoded in the channel ID).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { cross_app_channel_id, user_email } = body;

    if (!cross_app_channel_id) {
      return Response.json({ error: "Missing cross_app_channel_id" }, { status: 400 });
    }

    // Determine the caller's email — from Base44 auth or the frontend param
    const callerEmail = (user.email || user_email || "").toLowerCase();
    if (!callerEmail) {
      return Response.json({ error: "Could not determine caller email" }, { status: 400 });
    }

    // Security: verify the caller is a participant in this cross-app channel.
    // Channel ID format: "cross_app_dm:email1:email2" (sorted, lowercased).
    const parts = cross_app_channel_id.split(":");
    if (parts.length < 3) {
      return Response.json({ error: "Invalid channel ID format" }, { status: 400 });
    }
    const participantEmails = parts.slice(1).map((p) => p.toLowerCase());
    if (!participantEmails.includes(callerEmail)) {
      return Response.json({ error: "Not a participant in this channel" }, { status: 403 });
    }

    // Load messages via service role (bypasses admin-only RLS on ChatMessage)
    const messages = await base44.asServiceRole.entities.ChatMessage.filter(
      { cross_app_channel_id, parent_message_id: null },
      "timestamp",
      50
    );

    return Response.json({ messages: messages || [] });
  } catch (error) {
    console.error("loadCrossAppMessages error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}