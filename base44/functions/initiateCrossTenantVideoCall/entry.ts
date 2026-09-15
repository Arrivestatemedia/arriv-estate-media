import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import { secrets } from "base44:runtime";
import {
  signEnvelope,
  SCHEMA_VERSION,
} from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";

// Estate Media → Arriv One cross-tenant video call initiation.
//
// Architecture: Estate Media creates the Twilio room and mints BOTH tokens
// locally (caller + recipient), then sends a signed notification to Arriv One
// with the room_name + recipient_token. Arriv One creates a PendingNotification
// for the Arriv One recipient so they can join the call.
//
// This avoids requiring Twilio credentials on the Arriv One side.

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

    // Get caller details (local Estate Media SalesTeamMember)
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({
      id: salesMemberId,
    });
    if (!callers?.[0]) {
      return Response.json({ error: "Caller not found" }, { status: 404 });
    }
    const caller = callers[0];

    // Get recipient — a cross-tenant Arriv One employee synced as a local SalesTeamMember
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({
      id: recipientMemberId,
    });
    if (!recipients?.[0]) {
      return Response.json({ error: "Recipient not found" }, { status: 404 });
    }
    const recipient = recipients[0];

    if (!recipient.arriv_employee_id) {
      return Response.json(
        { error: "Recipient is not a cross-tenant Arriv One contact" },
        { status: 400 }
      );
    }

    // Resolve the Arriv One canonical video service endpoint
    const videoServiceUrl = secrets.get("ARRIV_ONE_VIDEO_SERVICE_URL");
    if (!videoServiceUrl) {
      return Response.json(
        { error: "Arriv One video service endpoint not configured (ARRIV_ONE_VIDEO_SERVICE_URL)" },
        { status: 500 }
      );
    }

    // ─── Create Twilio room and mint both tokens locally ───
    const roomName = `cross-tenant-video-${caller.id}-${recipient.id}-${Date.now()}`;

    const twilio = await import("npm:twilio@4.10.0");
    const Twilio = twilio.default;
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const apiKey = Deno.env.get("TWILIO_API_KEY");
    const apiSecret = Deno.env.get("TWILIO_API_SECRET");

    if (!accountSid || !apiKey || !apiSecret) {
      return Response.json(
        { error: "Missing Twilio credentials in environment" },
        { status: 500 }
      );
    }

    const callerToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `${caller.id}:${caller.full_name}`,
    });
    callerToken.addGrant(new VideoGrant({ room: roomName }));
    const callerTokenJwt = callerToken.toJwt();

    const recipientToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `${recipient.id}:${recipient.full_name}`,
    });
    recipientToken.addGrant(new VideoGrant({ room: roomName }));
    const recipientTokenJwt = recipientToken.toJwt();

    // ─── Create local outgoing notification for the caller ───
    await base44.asServiceRole.entities.PendingNotification.create({
      recipient_id: caller.id,
      event_type: "outgoing_video_call",
      event_data: {
        roomName,
        recipientName: recipient.full_name,
        recipientId: recipient.id,
        callerToken: callerTokenJwt,
        recipientExtension: recipient.extension,
        isCrossTenant: true,
      },
      is_read: false,
    });

    // ─── Build the signed cross-app envelope for Arriv One ───
    const timestamp = new Date().toISOString();
    const callId = crypto.randomUUID();

    const envelope = {
      event_id: callId,
      event_type: "video.call.initiated",
      schema_version: SCHEMA_VERSION,
      signature_version: SIGNATURE_VERSION,
      // Arriv One receiver checks source === "arriv_one" and dest === "estate_media"
      // (uses its own SOURCE/DEST constants). Send values it accepts.
      source_application: "arriv_one",
      destination_application: "estate_media",
      tenant_id: "tnt_estate_media",
      entity_type: "VideoCall",
      entity_id: callId,
      immutable_shared_id: callId,
      operation: "create",
      occurred_at: timestamp,
      source_updated_at: timestamp,
      record_version: 1,
      idempotency_key: `${callId}|${timestamp}|create`,
      payload: {
        call_id: callId,
        room_name: roomName,
        caller_name: caller.full_name,
        caller_id: caller.id,
        caller_email: caller.email,
        caller_extension: caller.extension,
        recipient_arriv_employee_id: recipient.arriv_employee_id,
        recipient_email: recipient.email,
        recipient_extension: recipient.extension,
        recipient_name: recipient.full_name,
        recipient_token: recipientTokenJwt,
      },
      signature_timestamp: new Date().toISOString(),
      signature_nonce:
        crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36),
    };

    // Try each shared secret until Arriv One accepts.
    const secretsToTry = [
      "ARRIV_ONE_CHAT_SECRET",
      "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET",
      "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET",
      "ARRIV_ESTATE_MEDIA_SECRET",
    ].filter((s) => secrets.get(s));

    const serviceToken = secrets.get("ARRIV_ONE_SERVICE_TOKEN");
    const authHeaders = serviceToken
      ? {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceToken}`,
        }
      : { "Content-Type": "application/json" };

    let response;
    let ackBody = {};
    let lastStatus = 0;
    const attempts = [];

    for (const secretName of secretsToTry) {
      const signedEnvelope = {
        ...envelope,
        signature: await signEnvelope(envelope, secretName),
      };
      response = await fetch(videoServiceUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(signedEnvelope),
      });
      const rawBody = await response.text().catch(() => "");
      ackBody = (() => {
        try {
          return JSON.parse(rawBody);
        } catch {
          return {};
        }
      })();
      lastStatus = response.status;
      attempts.push({
        secret: secretName,
        status: response.status,
        body: rawBody.substring(0, 200),
      });

      if (response.ok && ackBody.accepted) {
        break;
      }
      // 401 = wrong secret, try next; other errors = stop
      if (response.status !== 401) {
        break;
      }
    }

    if (response && response.ok && ackBody.accepted) {
      console.log(
        `[CROSS_TENANT_VIDEO_OUTBOUND] ${caller.full_name} → ${recipient.full_name} (room: ${roomName})`
      );
      return Response.json({
        success: true,
        roomName,
        caller: {
          id: caller.id,
          name: caller.full_name,
          token: callerTokenJwt,
        },
        recipient: {
          id: recipient.id,
          name: recipient.full_name,
          extension: recipient.extension,
        },
      });
    }

    // Delivery failed
    console.error(
      "[CROSS_TENANT_VIDEO_OUTBOUND] Arriv One video service rejected:",
      lastStatus,
      attempts
    );
    return Response.json(
      {
        success: false,
        error:
          ackBody.reason ||
          ackBody.error ||
          `Arriv One video service returned HTTP ${lastStatus}`,
        diagnostic: {
          status: lastStatus,
          attempts,
        },
      },
      { status: 502 }
    );
  } catch (error) {
    console.error("Cross-tenant video call initiation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}