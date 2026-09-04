import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import {
  verifySignature,
  validateEnvelopeShape,
  validateTimestamp,
} from "../../shared/syncEnvelope.ts";
import { isAllowedCrossAppTenant } from "../../shared/crossAppChat.ts";

// Arriv One may sign chat messages with either the INBOUND secret (canonical
// Arriv One → Estate Media direction) or the OUTBOUND secret (if the Arriv One
// sender reuses the outbound signing key). Try both so a secret rotation or
// naming mismatch doesn't silently drop messages.
const INBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET";
const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

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

    // 4. Verify HMAC signature — try INBOUND first, then OUTBOUND as fallback.
    //    Arriv One's chat sender may sign with either secret depending on config.
    let sigValid = await verifySignature(envelope, INBOUND_SECRET).catch(() => false);
    if (!sigValid) {
      sigValid = await verifySignature(envelope, OUTBOUND_SECRET).catch(() => false);
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
      message_id,
      channel_id,
      sender_id,
      sender_name,
      sender_email,
      recipient_email,
      content,
      timestamp,
    } = payload;

    if (!channel_id || !content || !sender_email) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Missing required payload fields" },
        { status: 400 }
      );
    }

    // 6. Tenant allowlist gate — only messages from allowed tenants are accepted.
    // The envelope's tenant_id identifies the sender's Arriv One tenant.
    if (!isAllowedCrossAppTenant(envelope.tenant_id)) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Sender tenant not in cross-app allowlist" },
        { status: 403 }
      );
    }

    // 7. Deduplicate by remote message_id (idempotent no-op)
    const existing = await base44.asServiceRole.entities.ChatMessage.filter({
      remote_message_id: message_id,
      origin_app: "arriv_one",
    });
    if (existing && existing.length > 0) {
      return Response.json({
        accepted: true,
        processing_status: "rejected_duplicate",
        reason: "Duplicate message_id — idempotent no-op",
      });
    }

    // 8. Create the inbound message locally (service role — no user session)
    await base44.asServiceRole.entities.ChatMessage.create({
      channel_id,
      sender_id: sender_id || `arriv_one:${sender_email}`,
      sender_name: sender_name || sender_email,
      sender_email,
      content,
      timestamp: timestamp || envelope.occurred_at || new Date().toISOString(),
      origin_app: "arriv_one",
      cross_app_channel_id: channel_id,
      remote_message_id: message_id,
    });

    return Response.json({
      accepted: true,
      processing_status: "applied",
      inbound_event_id: envelope.event_id,
      channel_id,
    });
  } catch (error) {
    console.error("receiveArrivOneChatMessage error:", error);
    return Response.json(
      { accepted: false, processing_status: "rejected", reason: error.message },
      { status: 500 }
    );
  }
}