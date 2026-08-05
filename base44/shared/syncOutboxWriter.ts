// Centralized Estate Media sync outbox writer.
// All Estate Media functions that need to emit outbound sync events must use this module.

import {
  SCHEMA_VERSION,
  SOURCE_APPLICATION,
  DESTINATION_APPLICATION,
  signEnvelope,
  generateEventId,
  generateIdempotencyKey,
  generateNonce,
} from "./syncEnvelope.ts";
import { buildOutboundPayload } from "./syncFieldAuthority.ts";
import { findMappingByLocalId, createMapping } from "./syncMapping.ts";
import { getTenantConfig, isSyncEnabled, isEntityShared } from "./syncTenantConfig.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

/**
 * Write an outbound sync event to the SyncOutbox entity.
 * Returns the created outbox record or null if suppressed/disabled.
 */
export async function writeSyncOutboxEvent(base44, {
  entityType,
  entityId,
  operation,
  recordVersion,
  recordData,
  occurredAt,
  sourceUpdatedAt,
  originEventId,
  causationId,
  correlationId,
  immutableSharedId,
}) {
  // Check if sync is enabled
  const enabled = await isSyncEnabled(base44);
  if (!enabled) return null;

  // Check if this entity type is shared
  const shared = await isEntityShared(base44, entityType);
  if (!shared) return null;

  const cfg = await getTenantConfig(base44);
  if (!cfg) return null;

  const tenantId = cfg.arriv_one_tenant_id;

  // Loop prevention: if this write originated from an Arriv One inbound event, suppress.
  if (originEventId && recordData?.sync_source === "arriv_one") {
    return null; // suppressed — don't echo back
  }

  // Resolve or create mapping
  let mapping = null;
  if (immutableSharedId || entityId) {
    mapping = await findMappingByLocalId(base44, tenantId, entityType, entityId);
  }

  const sharedId = immutableSharedId || mapping?.immutable_shared_id || crypto.randomUUID();

  // Build the payload with field authority
  const payload = buildOutboundPayload(entityType, recordData);

  const eventId = generateEventId();
  const now = new Date().toISOString();
  const sigTimestamp = now;
  const sigNonce = generateNonce();
  const idempotencyKey = generateIdempotencyKey(entityType, entityId, operation, recordVersion);

  const envelope = {
    event_id: eventId,
    event_type: getEventType(entityType, operation),
    schema_version: SCHEMA_VERSION,
    source_application: SOURCE_APPLICATION,
    destination_application: DESTINATION_APPLICATION,
    tenant_id: tenantId,
    entity_type: entityType,
    entity_id: entityId,
    immutable_shared_id: sharedId,
    external_mapping_id: mapping?.id || "",
    operation,
    occurred_at: occurredAt || now,
    source_updated_at: sourceUpdatedAt || recordData?.updated_date || now,
    record_version: recordVersion || recordData?.record_version || 1,
    idempotency_key: idempotencyKey,
    correlation_id: correlationId || "",
    causation_id: causationId || "",
    origin_event_id: originEventId || "",
    payload,
    signature_timestamp: sigTimestamp,
    signature_nonce: sigNonce,
  };

  // Sign the envelope
  const signature = await signEnvelope(envelope, OUTBOUND_SECRET);
  envelope.signature = signature;

  // Create the outbox record
  const outbox = await base44.asServiceRole.entities.SyncOutbox.create({
    tenant_id: tenantId,
    event_id: eventId,
    event_type: envelope.event_type,
    schema_version: SCHEMA_VERSION,
    source_application: SOURCE_APPLICATION,
    destination_application: DESTINATION_APPLICATION,
    entity_type: entityType,
    entity_id: entityId,
    immutable_shared_id: sharedId,
    external_mapping_id: mapping?.id || "",
    operation,
    occurred_at: envelope.occurred_at,
    source_updated_at: envelope.source_updated_at,
    record_version: envelope.record_version,
    idempotency_key: idempotencyKey,
    correlation_id: correlationId || "",
    causation_id: causationId || "",
    origin_event_id: originEventId || "",
    payload,
    delivery_status: "pending",
    delivery_attempts: 0,
    next_attempt_at: now,
    suppressed: false,
  });

  return outbox;
}

function getEventType(entityType, operation) {
  const prefix = entityType.toLowerCase();
  // Map entity types to event type prefixes
  const typeMap = {
    Contact: "contact",
    ActivityLog: "activity",
    Deal: "deal",
    SmsConversation: "sms.conversation",
    SmsMessage: "sms.message",
    SalesTeamMember: "member",
    SalesGoal: "goal",
    ManagerNote: "manager_note",
    TimeOffRequest: "time_off",
    BenefitsLifeEvent: "benefits",
  };
  const prefix2 = typeMap[entityType] || prefix;
  const opMap = { create: "created", update: "updated", delete: "deleted" };
  const opStr = opMap[operation] || operation;

  // Special cases
  if (entityType === "Contact" && operation === "update") {
    // Check for owner change — handled by the trigger with a special event type
    return "contact.updated";
  }
  if (entityType === "TimeOffRequest") {
    return operation === "create" ? "time_off.request_created" : "time_off.request_updated";
  }
  if (entityType === "BenefitsLifeEvent") {
    return operation === "create" ? "benefits.life_event_created" : "benefits.life_event_updated";
  }
  if (entityType === "SalesTeamMember" && operation === "update") {
    return "member.profile_updated";
  }

  return `${prefix2}.${opStr}`;
}