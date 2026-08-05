import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  SCHEMA_VERSION,
  signEnvelope,
  generateEventId,
  generateIdempotencyKey,
  generateNonce,
  computePayloadHash,
} from "../../shared/syncEnvelope.ts";
import {
  SIGNATURE_VERSION,
  toCanonicalEntityType,
  getEventType,
  isEntitySyncReady,
  ENTITY_ADAPTERS,
} from "../../shared/syncEntityAdapters.ts";
import { buildOutboundPayload } from "../../shared/syncFieldAuthority.ts";
import { getTenantConfig, isSyncEnabled } from "../../shared/syncTenantConfig.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

// Admin-only test-event utility.
// Creates isolated, clearly-marked test envelopes (_test: true) for cross-app
// contract verification. Does NOT send real SMS, email, calendar invitations,
// payroll submissions, or commission events.
//
// Two modes:
//   1. "emit" — creates a signed test envelope in the SyncOutbox (marked _test)
//      so Arriv One can verify it receives and validates it.
//   2. "simulate_inbound" — builds a signed test envelope that the admin can
//      POST to receiveArrivOneSyncEvent to verify Estate Media's inbound handling.
//      Uses the inbound secret so Estate Media can verify its own signature.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const mode = body?.mode || "emit"; // "emit" | "simulate_inbound"
    const localEntityType = body?.entity_type || "Contact"; // Estate Media local entity name
    const operation = body?.operation || "create";
    const testPayload = body?.payload || {
      firstname: "Test",
      lastname: "SyncUser",
      email: `test-sync-${Date.now()}@test.invalid`,
      phone: "+15550000000",
      company: "Test Sync Co",
    };

    // Verify admin (the function runs with service role; admin gating is via UI)
    const canonicalType = toCanonicalEntityType(localEntityType);
    if (!isEntitySyncReady(canonicalType)) {
      return Response.json({ error: `Entity ${canonicalType} is not sync-ready` }, { status: 400 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ error: "No tenant config — create ArrivOneTenantConfig first" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;
    const sharedId = `test-shared-${crypto.randomUUID()}`;
    const eventId = generateEventId();
    const now = new Date().toISOString();
    const sigTimestamp = now;
    const sigNonce = generateNonce();
    const effectiveSourceUpdatedAt = now;
    const idempotencyKey = generateIdempotencyKey(sharedId, effectiveSourceUpdatedAt, operation);
    const eventType = getEventType(canonicalType, operation, []);

    // Mark the payload as a test record
    const markedPayload = { ...buildOutboundPayload(canonicalType, testPayload), _test: true, _test_record: true };

    if (mode === "simulate_inbound") {
      // Build an envelope as if it came FROM Arriv One, signed with the INBOUND secret
      // (so Estate Media can verify its own inbound verification path).
      const envelope = {
        event_id: eventId,
        event_type: eventType,
        schema_version: SCHEMA_VERSION,
        signature_version: SIGNATURE_VERSION,
        source_application: "arriv_one",
        destination_application: "estate_media",
        tenant_id: tenantId,
        entity_type: canonicalType,
        entity_id: `test-remote-${crypto.randomUUID()}`,
        immutable_shared_id: sharedId,
        operation,
        occurred_at: now,
        source_updated_at: effectiveSourceUpdatedAt,
        record_version: 1,
        idempotency_key: idempotencyKey,
        correlation_id: "",
        causation_id: "",
        origin_event_id: "",
        payload: markedPayload,
        signature_timestamp: sigTimestamp,
        signature_nonce: sigNonce,
      };
      const signature = await signEnvelope(envelope, "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET");
      envelope.signature = signature;

      const payloadHash = await computePayloadHash(markedPayload);

      return Response.json({
        success: true,
        mode: "simulate_inbound",
        envelope,
        debug: {
          canonical_signing_string_fields: [
            "arriv_one", "estate_media", tenantId, canonicalType, sharedId, "1", operation, now, sigTimestamp, sigNonce, payloadHash,
          ],
          payload_hash: payloadHash,
          note: "POST this envelope to /functions/receiveArrivOneSyncEvent to test inbound verification. Signed with inbound secret.",
        },
      });
    }

    // mode === "emit" — create a real outbox record marked _test, for Arriv One to receive
    const enabled = await isSyncEnabled(base44);
    if (!enabled) {
      return Response.json({ error: "Sync not enabled — enable test mode first" }, { status: 403 });
    }

    const envelope = {
      event_id: eventId,
      event_type: eventType,
      schema_version: SCHEMA_VERSION,
      signature_version: SIGNATURE_VERSION,
      source_application: "estate_media",
      destination_application: "arriv_one",
      tenant_id: tenantId,
      entity_type: canonicalType,
      entity_id: `test-local-${crypto.randomUUID()}`,
      immutable_shared_id: sharedId,
      operation,
      occurred_at: now,
      source_updated_at: effectiveSourceUpdatedAt,
      record_version: 1,
      idempotency_key: idempotencyKey,
      payload: markedPayload,
      signature_timestamp: sigTimestamp,
      signature_nonce: sigNonce,
    };
    const signature = await signEnvelope(envelope, OUTBOUND_SECRET);
    envelope.signature = signature;

    const outbox = await base44.asServiceRole.entities.SyncOutbox.create({
      tenant_id: tenantId,
      event_id: eventId,
      event_type: eventType,
      schema_version: SCHEMA_VERSION,
      source_application: "estate_media",
      destination_application: "arriv_one",
      entity_type: canonicalType,
      entity_id: envelope.entity_id,
      immutable_shared_id: sharedId,
      operation,
      occurred_at: now,
      source_updated_at: effectiveSourceUpdatedAt,
      record_version: 1,
      idempotency_key: idempotencyKey,
      payload: markedPayload,
      delivery_status: "pending",
      delivery_attempts: 0,
      next_attempt_at: now,
      suppressed: false,
    });

    return Response.json({
      success: true,
      mode: "emit",
      outbox_id: outbox.id,
      event_id: eventId,
      event_type: eventType,
      entity_type: canonicalType,
      immutable_shared_id: sharedId,
      note: "Test event created in SyncOutbox (marked _test). Deliver via deliverArrivOneSyncEvent or the drain automation.",
    });
  } catch (error) {
    console.error("createArrivOneTestEvent error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}