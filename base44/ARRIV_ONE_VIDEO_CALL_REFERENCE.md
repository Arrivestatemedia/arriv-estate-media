# Arriv One Video Call — Reference Implementation

The Estate Media side is **complete and deployed**. The 404 errors confirm
Arriv One needs to deploy two functions. Copy the code below into the Arriv
One app's `base44/functions/` directory.

---

## 1. `receiveEstateMediaVideoCall` — Webhook Receiver

A simple receiver (mirrors Estate Media's `receiveArrivOneVideoCall`).
Validates the HMAC signature, resolves the Arriv One recipient by
`arriv_employee_id` / email / extension, and creates a `PendingNotification`
with the recipient token included.

**File:** `base44/functions/receiveEstateMediaVideoCall/entry.ts`

```typescript
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import {
  verifySignature,
  validateEnvelopeShape,
  validateTimestamp,
} from "../../shared/syncEnvelope.ts";

// Try all shared cross-app secrets (must mirror Estate Media's set)
const SECRET_NAMES = [
  "ARRIV_ONE_CHAT_SECRET",
  "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET",
  "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET",
  "ARRIV_ESTATE_MEDIA_SECRET",
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const envelope = await req.json();

    // 1. Validate envelope shape
    const shapeCheck = validateEnvelopeShape(envelope);
    if (!shapeCheck.valid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: shapeCheck.error },
        { status: 400 }
      );
    }

    // 2. Validate source/destination
    if (envelope.source_application !== "estate_media") {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Invalid source_application" },
        { status: 400 }
      );
    }
    if (envelope.destination_application !== "arriv_one") {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Invalid destination_application" },
        { status: 400 }
      );
    }

    // 3. Validate timestamp (replay protection)
    const tsCheck = validateTimestamp(envelope);
    if (!tsCheck.valid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: tsCheck.error },
        { status: 401 }
      );
    }

    // 4. Verify HMAC signature — try every shared secret
    let sigValid = false;
    for (const secretName of SECRET_NAMES) {
      sigValid = await verifySignature(envelope, secretName).catch(() => false);
      if (sigValid) break;
    }
    if (!sigValid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Invalid signature" },
        { status: 401 }
      );
    }

    // 5. Extract payload
    const payload = envelope.payload || {};
    const {
      call_id,
      room_name,
      caller_id,
      caller_name,
      caller_extension,
      recipient_arriv_employee_id,
      recipient_email,
      recipient_extension,
      recipient_token,
    } = payload;

    if (!room_name || !caller_name) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Missing room_name or caller_name" },
        { status: 400 }
      );
    }

    // 6. Idempotency — dedupe by call_id
    const dedupeKey = call_id || envelope.event_id;
    if (dedupeKey) {
      const existing = await base44.asServiceRole.entities.PendingNotification.filter({
        recipient_id: `__cross_tenant_video__${dedupeKey}`,
      });
      if (existing && existing.length > 0) {
        return Response.json({
          accepted: true,
          processing_status: "rejected_duplicate",
          reason: "Duplicate call_id — idempotent no-op",
        });
      }
      }
    }

    // 7. Resolve the Arriv One recipient by arriv_employee_id, email, or extension
    let recipient = null;
    if (recipient_arriv_employee_id) {
      const byEmp = await base44.asServiceRole.entities.SalesTeamMember.filter({
        arriv_employee_id: recipient_arriv_employee_id,
      });
      if (byEmp?.[0]) recipient = byEmp[0];
    }
    if (!recipient && recipient_email) {
      const byEmail = await base44.asServiceRole.entities.SalesTeamMember.filter({
        email: recipient_email,
      });
      if (byEmail?.[0]) recipient = byEmail[0];
    }
    if (!recipient && recipient_extension) {
      const byExt = await base44.asServiceRole.entities.SalesTeamMember.filter({
        extension: recipient_extension,
      });
      if (byExt?.[0]) recipient = byExt[0];
    }

    if (!recipient) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Recipient not found in Arriv One" },
        { status: 404 }
      );
    }

    // 8. Create the PendingNotification with the recipient token
    const notification = await base44.asServiceRole.entities.PendingNotification.create({
      recipient_id: recipient.id,
      event_type: "incoming_video_call",
      event_data: {
        roomName: room_name,
        callerName: caller_name,
        callerId: caller_id || null,
        callerExtension: caller_extension || null,
        recipientToken: recipient_token || null,
        is_cross_tenant: true,
        _dedupe_key: dedupeKey || null,
      },
      is_read: false,
    });

    console.log(
      `[CROSS_TENANT_VIDEO_INBOUND] ${caller_name} → ${recipient.full_name} (room: ${room_name})`
    );

    return Response.json(
      { accepted: true, processing_status: "applied", notification_id: notification.id },
      { status: 202 }
    );
  } catch (error) {
    console.error("receiveEstateMediaVideoCall error:", error);
    return Response.json(
      { accepted: false, processing_status: "rejected", reason: error.message },
      { status: 500 }
    );
  }
}
```

> **Note:** The `syncEnvelope.ts` shared module must also exist in the Arriv
> One app (it should already be there from the chat sync work). The
> `PendingNotification` entity must also exist in Arriv One with the same
> schema as Estate Media's.

---

## 2. Outbound Initiator — Arriv One → Estate Media

When an Arriv One user clicks "Video Call" on an Estate Media rep's contact,
Arriv One creates the Twilio room, mints both tokens, and POSTs the signed
envelope to Estate Media's receiver.

**File:** `base44/functions/initiateCrossTenantVideoCall/entry.ts`

```typescript
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import { secrets } from "base44:runtime";
import {
  signEnvelope,
  SCHEMA_VERSION,
} from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";

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

    // Get caller (Arriv One SalesTeamMember)
    const callers = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    if (!callers?.[0]) return Response.json({ error: "Caller not found" }, { status: 404 });
    const caller = callers[0];

    // Get recipient (Estate Media employee synced as local SalesTeamMember)
    const recipients = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: recipientMemberId });
    if (!recipients?.[0]) return Response.json({ error: "Recipient not found" }, { status: 404 });
    const recipient = recipients[0];

    if (!recipient.arriv_employee_id) {
      return Response.json({ error: "Recipient is not a cross-tenant Estate Media contact" }, { status: 400 });
    }

    // Estate Media webhook receiver URL
    const videoWebhookUrl = secrets.get("ESTATE_MEDIA_VIDEO_WEBHOOK_URL");
    if (!videoWebhookUrl) {
      return Response.json(
        { error: "Estate Media video webhook endpoint not configured (ESTATE_MEDIA_VIDEO_WEBHOOK_URL)" },
        { status: 500 }
      );
    }

    // Create Twilio room + mint tokens locally
    const roomName = `cross-tenant-${salesMemberId}-${recipient.id}-${Date.now()}`;
    const twilio = await import("npm:twilio@4.10.0");
    const Twilio = twilio.default;
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const apiKey = Deno.env.get("TWILIO_API_KEY");
    const apiSecret = Deno.env.get("TWILIO_API_SECRET");

    if (!accountSid || !apiKey || !apiSecret) {
      return Response.json({ error: "Twilio credentials not configured" }, { status: 500 });
    }

    const callerToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `${caller.id}:${caller.full_name}`,
    });
    callerToken.addGrant(new VideoGrant({ room: roomName }));

    const recipientToken = new AccessToken(accountSid, apiKey, apiSecret, {
      identity: `${recipient.id}:${recipient.full_name}`,
    });
    recipientToken.addGrant(new VideoGrant({ room: roomName }));

    // Build signed envelope (source = arriv_one, destination = estate_media)
    const timestamp = new Date().toISOString();
    const callId = crypto.randomUUID();

    const envelope = {
      event_id: callId,
      event_type: "video.call.initiated",
      schema_version: SCHEMA_VERSION,
      signature_version: SIGNATURE_VERSION,
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
        caller_id: caller.id,
        caller_name: caller.full_name,
        caller_email: caller.email,
        caller_extension: caller.extension,
        recipient_arriv_employee_id: recipient.arriv_employee_id,
        recipient_email: recipient.email,
        recipient_extension: recipient.extension,
        recipient_token: recipientToken.toJwt(),
      },
      signature_timestamp: new Date().toISOString(),
      signature_nonce: crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36),
    };

    // Try each shared secret
    const secretsToTry = [
      "ARRIV_ONE_CHAT_SECRET",
      "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET",
      "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET",
      "ARRIV_ESTATE_MEDIA_SECRET",
    ].filter((s) => secrets.get(s));

    const serviceToken = secrets.get("ARRIV_ONE_SERVICE_TOKEN");
    const authHeaders = serviceToken
      ? { "Content-Type": "application/json", Authorization: `Bearer ${serviceToken}` }
      : { "Content-Type": "application/json" };

    let delivered = false;
    let lastStatus = 0;
    const attempts = [];

    for (const secretName of secretsToTry) {
      const signedEnvelope = { ...envelope, signature: await signEnvelope(envelope, secretName) };
      const response = await fetch(videoWebhookUrl, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(signedEnvelope),
      });
      lastStatus = response.status;
      attempts.push({ secret: secretName, status: response.status });
      if (response.ok) { delivered = true; break; }
      if (response.status !== 401) break;
    }

    if (!delivered) {
      return Response.json(
        { success: false, error: `Estate Media video webhook returned HTTP ${lastStatus}`, diagnostic: { status: lastStatus, attempts } },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      roomName,
      caller: { id: caller.id, name: caller.full_name, token: callerToken.toJwt() },
      recipient: { id: recipient.id, name: recipient.full_name, extension: recipient.extension },
    });
  } catch (error) {
    console.error("Cross-tenant video call initiation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Secrets to set on Arriv One

| Secret Name | Value |
|---|---|
| `ESTATE_MEDIA_VIDEO_WEBHOOK_URL` | `https://arrivestatemedia.base44.app/functions/receiveArrivOneVideoCall` |
| `ARRIV_ONE_CHAT_SECRET` | (same shared secret as Estate Media) |
| `TWILIO_ACCOUNT_SID` | (same Twilio account as Estate Media — both apps must share the same account so tokens work across rooms) |
| `TWILIO_API_KEY` | (same) |
| `TWILIO_API_SECRET` | (same) |

---

## Frontend (Arriv One ChatWindow)

The Arriv One ChatWindow's video call button should call
`initiateCrossTenantVideoCall` with `{ salesMemberId, recipientMemberId }`
and open `VideoCallPanelV2` with the returned `{ roomName, caller.token }`.

For incoming calls, the Arriv One ChatWindow should subscribe to
`PendingNotification` for `event_type: "incoming_video_call"` and show
`IncomingVideoCallModal`. On accept, use `event_data.recipientToken` directly
(no token fetch needed — it's included in the notification).