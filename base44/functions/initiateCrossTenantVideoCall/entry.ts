import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// Estate Media → Arriv One cross-tenant video call (simplified).
//
// Creates a Twilio room and mints a caller token. The frontend sends a
// cross-app chat message with a join link to the Conference page. The
// recipient clicks the link and joins via generateDirectVideoToken.
// No webhooks, no signed envelopes, no cross-app notifications.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const { salesMemberId, recipientMemberId } = await req.json();

    if (!salesMemberId || !recipientMemberId) {
      return Response.json(
        { error: "salesMemberId and recipientMemberId required" },
        { status: 400 }
      );
    }

    // Get caller details
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({
      id: salesMemberId,
    });
    if (!callers?.[0]) {
      return Response.json({ error: "Caller not found" }, { status: 404 });
    }
    const caller = callers[0];

    // Get recipient
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({
      id: recipientMemberId,
    });
    if (!recipients?.[0]) {
      return Response.json({ error: "Recipient not found" }, { status: 404 });
    }
    const recipient = recipients[0];

    // Create room name
    const roomName = `cross-tenant-video-${caller.id}-${recipient.id}-${Date.now()}`;

    // Mint caller token
    const twilio = await import("npm:twilio@4.10.0");
    const Twilio = twilio.default;
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const apiKey = Deno.env.get("TWILIO_API_KEY");
    const apiSecret = Deno.env.get("TWILIO_API_SECRET");

    if (!accountSid || !apiKey || !apiSecret) {
      return Response.json(
        { error: "Missing Twilio credentials" },
        { status: 500 }
      );
    }

    const callerToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `${caller.id}:${caller.full_name}`,
    });
    callerToken.addGrant(new VideoGrant({ room: roomName }));

    return Response.json({
      success: true,
      roomName,
      caller: {
        id: caller.id,
        name: caller.full_name,
        token: callerToken.toJwt(),
      },
      recipient: {
        id: recipient.id,
        name: recipient.full_name,
        extension: recipient.extension,
      },
    });
  } catch (error) {
    console.error("Cross-tenant video call initiation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}