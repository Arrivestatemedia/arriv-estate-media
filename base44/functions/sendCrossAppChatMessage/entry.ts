import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { signEnvelope, SCHEMA_VERSION, generateEventId, generateNonce } from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";
import { generateCrossAppChannelId, isSameCompany } from "../../shared/crossAppChat.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { recipient_email, content, sender_name, sender_email } = body;

    if (!recipient_email || !content || !sender_email) {
      return Response.json({ error: "recipient_email, content, and sender_email are required" }, { status: 400 });
    }

    // Same-company gate — only same-domain users can cross-app chat
    if (!isSameCompany(sender_email, recipient_email)) {
      return Response.json({ error: "Cross-app chat is restricted to same-company contacts" }, { status: 403 });
    }

    const channelId = generateCrossAppChannelId(sender_email, recipient_email);
    const timestamp = new Date().toISOString();
    const localMessageId = crypto.randomUUID();

    // 1. Create the message locally so the sender sees it immediately
    await base44.entities.ChatMessage.create({
      channel_id: channelId,
      sender_id: user.id,
      sender_name: sender_name || user.full_name || sender_email,
      sender_email,
      content,
      timestamp,
      origin_app: "estate_media",
      cross_app_channel_id: channelId,
    });

    // 2. Deliver to Arriv One via HMAC-signed webhook
    const endpoint = secrets.get("ARRIV_ONE_CHAT_WEBHOOK_URL");
    if (!endpoint) {
      // Message saved locally but not delivered — Arriv One endpoint not configured
      return Response.json({
        success: false,
        delivered: false,
        local_message_id: localMessageId,
        error: "ARRIV_ONE_CHAT_WEBHOOK_URL not configured",
      });
    }

    const eventId = generateEventId();
    const envelope = {
      event_id: eventId,
      event_type: "chat.message.sent",
      schema_version: SCHEMA_VERSION,
      signature_version: SIGNATURE_VERSION,
      source_application: "estate_media",
      destination_application: "arriv_one",
      tenant_id: "tnt_estate_media",
      entity_type: "ChatMessage",
      entity_id: localMessageId,
      immutable_shared_id: channelId,
      operation: "create",
      occurred_at: timestamp,
      source_updated_at: timestamp,
      record_version: 1,
      idempotency_key: `${localMessageId}|${timestamp}|create`,
      payload: {
        message_id: localMessageId,
        channel_id: channelId,
        sender_id: user.id,
        sender_name: sender_name || user.full_name || sender_email,
        sender_email,
        recipient_email,
        content,
        timestamp,
      },
      signature_timestamp: new Date().toISOString(),
      signature_nonce: generateNonce(),
    };

    const signature = await signEnvelope(envelope, OUTBOUND_SECRET);
    envelope.signature = signature;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });

    const ackBody = await response.json().catch(() => ({}));

    if (response.ok && (ackBody.accepted || ackBody.processing_status === "applied")) {
      return Response.json({
        success: true,
        delivered: true,
        local_message_id: localMessageId,
        channel_id: channelId,
      });
    }

    // Delivery failed but message saved locally
    return Response.json({
      success: true,
      delivered: false,
      local_message_id: localMessageId,
      channel_id: channelId,
      delivery_error: ackBody.reason || `HTTP ${response.status}`,
    });
  } catch (error) {
    console.error("sendCrossAppChatMessage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}