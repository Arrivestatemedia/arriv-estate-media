import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  verifySignature,
  validateEnvelopeShape,
  validateTimestamp,
} from "../../shared/syncEnvelope.ts";
import { isAllowedCrossAppTenant } from "../../shared/crossAppChat.ts";

// Arriv One may sign video-call signaling envelopes with any of the shared
// cross-app secrets. Try all configured secrets so a rotation or naming
// mismatch doesn't silently drop the incoming call notification.
const CHAT_SECRET = "ARRIV_ONE_CHAT_SECRET";
const INBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET";
const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";
const SHARED_SECRET = "ARRIV_ESTATE_MEDIA_SECRET";

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
    if (envelope.source_application !== "arriv_one") {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Invalid source_application" },
        { status: 400 }
      );
    }
    if (envelope.destination_application !== "estate_media") {
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

    // 4. Verify HMAC signature — try every shared secret so a naming mismatch
    //    or rotation doesn't silently drop the call notification.
    let sigValid = await verifySignature(envelope, CHAT_SECRET).catch(() => false);
    if (!sigValid) {
      sigValid = await verifySignature(envelope, INBOUND_SECRET).catch(() => false);
    }
    if (!sigValid) {
      sigValid = await verifySignature(envelope, OUTBOUND_SECRET).catch(() => false);
    }
    if (!sigValid) {
      sigValid = await verifySignature(envelope, SHARED_SECRET).catch(() => false);
    }
    if (!sigValid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Invalid signature" },
        { status: 401 }
      );
    }

    // 5. Tenant allowlist gate
    if (!isAllowedCrossAppTenant(envelope.tenant_id)) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Sender tenant not in cross-app allowlist" },
        { status: 403 }
      );
    }

    // 6. Extract payload — room name + caller identity only (NO recipient token).
    //    The Estate Media recipient fetches its own join token via
    //    generateDirectVideoToken at accept time.
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
    } = payload;

    if (!room_name || !caller_name) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Missing room_name or caller_name" },
        { status: 400 }
      );
    }
    if (!recipient_arriv_employee_id && !recipient_email && !recipient_extension) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "No recipient identifier provided" },
        { status: 400 }
      );
    }

    // 7. Idempotency — dedupe by call_id (or event_id fallback) so a replayed
    //    webhook doesn't create a duplicate ring.
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

    // 8. Resolve the target Estate Media SalesTeamMember. Try arriv_employee_id
    //    first (most stable cross-app key), then email, then extension.
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
        { accepted: false, processing_status: "rejected", reason: "Recipient not found in Estate Media" },
        { status: 404 }
      );
    }

    // 9. Create the PendingNotification for the Estate Media recipient.
    //    event_data contains ONLY room + caller identity — no recipient token.
    //    The recipient fetches its own token via generateDirectVideoToken on accept.
    const notification = await base44.asServiceRole.entities.PendingNotification.create({
      recipient_id: recipient.id,
      event_type: "incoming_video_call",
      event_data: {
        roomName: room_name,
        callerName: caller_name,
        callerId: caller_id || null,
        callerExtension: caller_extension || null,
        is_cross_tenant: true,
        _dedupe_key: dedupeKey || null,
      },
      is_read: false,
    });

    console.log(
      `[CROSS_TENANT_VIDEO_INBOUND] ${caller_name} → ${recipient.full_name} (room: ${room_name})`
    );

    return Response.json(
      {
        accepted: true,
        processing_status: "applied",
        inbound_event_id: envelope.event_id,
        notification_id: notification.id,
        recipient_id: recipient.id,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("receiveArrivOneVideoCall error:", error);
    return Response.json(
      { accepted: false, processing_status: "rejected", reason: error.message },
      { status: 500 }
    );
  }
}