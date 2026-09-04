import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { signEnvelope, SCHEMA_VERSION, generateEventId, generateNonce } from "../../shared/syncEnvelope.ts";
import { SIGNATURE_VERSION } from "../../shared/syncEntityAdapters.ts";
import { generateCrossAppChannelId, isAllowedCrossAppTenant } from "../../shared/crossAppChat.ts";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";

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

    // Tenant allowlist gate — Estate Media may only chat with employees from
    // tnt_arriv_one or tnt_estate_media. Look up the recipient's SalesTeamMember
    // record (synced employees have arriv_employee_id). When tenant_id is present
    // on the record, enforce the allowlist; when absent, arriv_employee_id proves
    // the Arriv One link.
    // Database filter is case-sensitive — try both the raw and lowercased email
    // to find the recipient regardless of how it was stored.
    let recipientMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({
      email: recipient_email,
    });
    let recipientMember = (recipientMembers || []).find(
      (m) => m.email && m.email.toLowerCase() === recipient_email.toLowerCase()
    );
    if (!recipientMember) {
      recipientMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({
        email: recipient_email.toLowerCase(),
      });
      recipientMember = (recipientMembers || []).find(
        (m) => m.email && m.email.toLowerCase() === recipient_email.toLowerCase()
      );
    }
    // Accept any Arriv One-linked employee: arriv_employee_id, sync_source=arriv_one,
    // or immutable_shared_id all prove the Arriv One link.
    const isArrivOneLinked = recipientMember && (
      recipientMember.arriv_employee_id ||
      recipientMember.sync_source === "arriv_one" ||
      recipientMember.immutable_shared_id
    );
    if (!isArrivOneLinked) {
      return Response.json(
        { error: "Recipient is not a synced Arriv One employee" },
        { status: 403 }
      );
    }
    if (recipientMember.tenant_id && !isAllowedCrossAppTenant(recipientMember.tenant_id)) {
      return Response.json(
        { error: "Cross-app chat is restricted to allowed company contacts" },
        { status: 403 }
      );
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

    // 2. Deliver to Arriv One. Try the dedicated chat receiver first (derived from
    //    the sync endpoint URL), then fall back to the chat webhook URL, then the
    //    sync event endpoint.
    const cfg = await getTenantConfig(base44);
    const syncEndpoint = cfg?.arriv_one_sync_endpoint || "";
    // Derive chat receiver URL: replace receiveEstateMediaSyncEvent with receiveEstateMediaChatMessage
    const derivedChatEndpoint = syncEndpoint.replace(
      "receiveEstateMediaSyncEvent",
      "receiveEstateMediaChatMessage"
    );
    const chatWebhookUrl = secrets.get("ARRIV_ONE_CHAT_WEBHOOK_URL");
    // Priority: dedicated chat receiver > configured chat webhook > sync endpoint
    const endpointsToTry = [
      derivedChatEndpoint,
      chatWebhookUrl,
      syncEndpoint,
    ].filter(Boolean);
    if (endpointsToTry.length === 0) {
      return Response.json({
        success: false,
        delivered: false,
        local_message_id: localMessageId,
        error: "No Arriv One endpoint configured",
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
      external_mapping_id: "",
      operation: "create",
      occurred_at: timestamp,
      source_updated_at: timestamp,
      record_version: 1,
      idempotency_key: `${localMessageId}|${timestamp}|create`,
      correlation_id: "",
      causation_id: "",
      origin_event_id: "",
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

    // Try each endpoint × each secret until one succeeds.
    // The Arriv One chat receiver may use any of these shared secrets.
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
      ? { "Content-Type": "application/json", "Authorization": `Bearer ${serviceToken}` }
      : { "Content-Type": "application/json" };

    let response;
    let ackBody = {};
    let lastRawBody = "";
    let lastEndpoint = "";
    const attempts = [];

    outer:
    for (const ep of endpointsToTry) {
      for (const secretName of secretsToTry) {
        response = await fetch(ep, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ ...envelope, signature: await signEnvelope(envelope, secretName) }),
        });
        lastRawBody = await response.text().catch(() => "");
        ackBody = (() => { try { return JSON.parse(lastRawBody); } catch { return {}; } })();
        lastEndpoint = ep;
        attempts.push({ endpoint: ep, secret: secretName, status: response.status, body: lastRawBody.substring(0, 200) });
        if (response.ok && (ackBody.accepted || ackBody.processing_status === "applied")) {
          break outer;
        }
        // 401 = wrong secret, try next secret; other errors = try next endpoint
        if (response.status !== 401) {
          break; // try next endpoint
        }
      }
    }

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
      diagnostic: {
        status: response.status,
        statusText: response.statusText,
        body: lastRawBody.substring(0, 500),
        contentType: response.headers.get("content-type"),
        endpoint: lastEndpoint,
        attempts,
      },
    });
  } catch (error) {
    console.error("sendCrossAppChatMessage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}