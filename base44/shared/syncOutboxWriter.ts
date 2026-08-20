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
import { SIGNATURE_VERSION } from "./syncEntityAdapters.ts";
import {
  toCanonicalEntityType,
  getEventType,
  isEntitySyncReady,
} from "./syncEntityAdapters.ts";
import { buildOutboundPayload } from "./syncFieldAuthority.ts";
import { findMappingByLocalId, createMapping } from "./syncMapping.ts";
import { getTenantConfig, isSyncEnabled, isEntityShared, isTestMode, isTestRecord, isMigrationMode } from "./syncTenantConfig.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

/**
 * Write an outbound sync event to the SyncOutbox entity.
 * localEntityType is the Estate Media local entity name (e.g. "SalesGoal").
 * It is translated to the canonical entity type for the envelope.
 * Returns the created outbox record or null if suppressed/disabled.
 */
export async function writeSyncOutboxEvent(base44, {
  localEntityType,
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
  changedFields,
  isMigrationEvent,
}) {
  // Check if sync is enabled
  const enabled = await isSyncEnabled(base44);
  if (!enabled) return null;

  // Translate to canonical entity type
  const canonicalType = toCanonicalEntityType(localEntityType);

  // Check if this entity type is shared and sync-ready
  const shared = await isEntityShared(base44, canonicalType);
  if (!shared) return null;
  if (!isEntitySyncReady(canonicalType)) return null;

  const cfg = await getTenantConfig(base44);
  if (!cfg) return null;

  const tenantId = cfg.arriv_one_tenant_id;

  // Loop prevention: if this write originated from an Arriv One inbound event, suppress.
  if (originEventId && recordData?.sync_source === "arriv_one") {
    return null; // suppressed — don't echo back
  }

  // Test-mode gating: in test mode, refuse to write production records to the outbox.
  // Only test-marked records (from createArrivOneTestEvent) are allowed.
  if (isTestMode(cfg) && !isTestRecord({ payload: recordData })) {
    return null; // suppressed — production record not enqueued in test mode
  }

  // Migration-mode gating: in migration mode, suppress normal entity triggers.
  // Only explicit migration events (isMigrationEvent=true) are allowed through.
  // This prevents live entity triggers from being enqueued during historical migration.
  if (isMigrationMode(cfg) && !options?.isMigrationEvent) {
    return null; // suppressed — normal trigger during migration mode
  }

  // Resolve or create mapping
  let mapping = null;
  if (immutableSharedId || entityId) {
    mapping = await findMappingByLocalId(base44, tenantId, canonicalType, entityId);
  }

  const sharedId = immutableSharedId || mapping?.immutable_shared_id || crypto.randomUUID();

  // Build the payload with field authority (canonical type)
  const payload = buildOutboundPayload(canonicalType, recordData);

  const eventId = generateEventId();
  const now = new Date().toISOString();
  const sigTimestamp = now;
  const sigNonce = generateNonce();
  const effectiveSourceUpdatedAt = sourceUpdatedAt || recordData?.updated_date || now;
  const idempotencyKey = generateIdempotencyKey(sharedId, effectiveSourceUpdatedAt, operation);
  const eventType = getEventType(canonicalType, operation, changedFields || []);

  const envelope = {
    event_id: eventId,
    event_type: eventType,
    schema_version: SCHEMA_VERSION,
    signature_version: SIGNATURE_VERSION,
    source_application: SOURCE_APPLICATION,
    destination_application: DESTINATION_APPLICATION,
    tenant_id: tenantId,
    entity_type: canonicalType,
    entity_id: entityId,
    immutable_shared_id: sharedId,
    external_mapping_id: mapping?.id || "",
    operation,
    occurred_at: occurredAt || now,
    source_updated_at: effectiveSourceUpdatedAt,
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
    entity_type: canonicalType,
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