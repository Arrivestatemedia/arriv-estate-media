import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import { secrets } from "base44:runtime";
import {
  signEnvelope,
  buildCanonicalString,
  SCHEMA_VERSION,
} from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";

// Estate Media → Arriv One cross-tenant video call initiation.
//
// Arriv One owns Twilio room creation and token minting. This function:
//   1. Resolves the local caller + cross-tenant recipient SalesTeamMember records.
//   2. Builds a signed cross-app envelope with caller + recipient identity.
//   3. POSTs it to Arriv One's canonical cross-tenant video service endpoint.
//   4. Arriv One creates the room, mints the Estate Media caller's token, writes
//      the PendingNotification on Arriv One's side for the Arriv One recipient
//      (room name + caller identity only — no token), and returns { roomName, callerToken }.
//   5. Returns { success, roomName, caller: { id, name, token } } to the frontend.
//
// Twilio credentials stay solely in Arriv One. Estate Media never mints tokens
// for cross-tenant calls. Intra-app calls (initiateVideoCall) still mint locally.

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

    // Build the signed cross-app envelope
    const timestamp = new Date().toISOString();
    const callId = crypto.randomUUID();

    const envelope = {
      event_id: callId,
      event_type: "video.call.initiated",
      schema_version: SCHEMA_VERSION,
      signature_version: SIGNATURE_VERSION,
      source_application: "estate_media",
      destination_application: "arriv_one",
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
        caller_id: caller.id,
        caller_name: caller.full_name,
        caller_email: caller.email,
        caller_extension: caller.extension,
        recipient_arriv_employee_id: recipient.arriv_employee_id,
        recipient_email: recipient.email,
        recipient_extension: recipient.extension,
      },
      signature_timestamp: new Date().toISOString(),
      signature_nonce:
        crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36),
    };

    // Try each shared secret until Arriv One accepts. The Arriv One video
    // receiver may use any of these cross-app secrets.
    const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";
    const INBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET";
    const SHARED_SECRET = "ARRIV_ESTATE_MEDIA_SECRET";
    const secretsToTry = [
      "ARRIV_ONE_CHAT_SECRET",
      OUTBOUND_SECRET,
      INBOUND_SECRET,
      SHARED_SECRET,
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

      if (response.ok && (ackBody.accepted || ackBody.roomName)) {
        break;
      }
      // 401 = wrong secret, try next; other errors = stop
      if (response.status !== 401) {
        break;
      }
    }

    if (response && response.ok && ackBody.roomName && ackBody.callerToken) {
      console.log(
        `[CROSS_TENANT_VIDEO_OUTBOUND] ${caller.full_name} → ${recipient.full_name} (room: ${ackBody.roomName})`
      );
      return Response.json({
        success: true,
        roomName: ackBody.roomName,
        caller: {
          id: caller.id,
          name: caller.full_name,
          token: ackBody.callerToken,
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