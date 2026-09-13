import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

// Returns unread cross-app ChatMessage notifications for a user across ALL
// their cross-app channels. ChatMessage RLS is admin-only, so non-admin reps
// can't query via the SDK — this uses asServiceRole to bypass RLS.
//
// Input:
//   user_email       — the caller's email (required)
//   since_timestamp  — ISO string; only messages after this timestamp count
//                      as unread (optional, omit to count all recent)
//
// Output:
//   { count, latest_message, messages }
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { user_email, since_timestamp } = body;

    // Determine the caller's email — try Base44 auth first, fall back to the
    // frontend param. Sales reps use custom auth (salesTeamLogin) and don't
    // have a Base44 platform session.
    let authEmail = "";
    try {
      const user = await base44.auth.me();
      authEmail = user?.email || "";
    } catch {
      // Not logged in via Base44 platform
    }
    const callerEmail = (authEmail || user_email || "").toLowerCase().trim();
    if (!callerEmail) {
      return Response.json({ error: "Could not determine caller email" }, { status: 400 });
    }

    // Load recent arriv_one messages (newest first). We fetch a generous
    // window and filter client-side for channels the caller participates in.
    const messages = await base44.asServiceRole.entities.ChatMessage.filter(
      { origin_app: "arriv_one", parent_message_id: null },
      "-timestamp",
      100
    );

    // Filter for channels that include the caller's email.
    // Channel ID format: "cross_app_dm:email1:email2" (sorted, lowercased).
    const userMessages = (messages || []).filter(
      (m) => m.cross_app_channel_id?.toLowerCase().includes(callerEmail)
    );

    // Filter by since_timestamp if provided (messages strictly after it)
    let unread = userMessages;
    if (since_timestamp) {
      const since = new Date(since_timestamp);
      unread = userMessages.filter(
        (m) => new Date(m.timestamp || m.created_date) > since
      );
    }

    return Response.json({
      count: unread.length,
      latest_message: unread[0] || null,
      messages: unread.slice(0, 10),
    });
  } catch (error) {
    console.error("getCrossAppMessageNotifications error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}