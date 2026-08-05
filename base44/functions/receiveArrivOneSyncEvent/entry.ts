import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  SCHEMA_VERSION,
  verifySignature,
  validateEnvelopeShape,
  validateTimestamp,
  validatePayloadSize,
} from "../../shared/syncEnvelope.ts";
import {
  getTenantConfig,
  validateInboundTenant,
  isTestMode,
  isTestRecord,
} from "../../shared/syncTenantConfig.ts";
import { applyInboundFieldAuthority } from "../../shared/syncFieldAuthority.ts";
import {
  findMappingBySharedId,
  findMappingByRemoteId,
  createMapping,
  updateMapping,
  naturalKeyMatch,
  isAmbiguousMatch,
} from "../../shared/syncMapping.ts";

const INBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET";
const MAX_PAYLOAD_BYTES = 256 * 1024;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const envelope = await req.json();

    // 1. Validate envelope shape
    const shapeCheck = validateEnvelopeShape(envelope);
    if (!shapeCheck.valid) {
      return Response.json({ accepted: false, reason: shapeCheck.error }, { status: 400 });
    }

    // 2. Validate source/destination
    if (envelope.source_application !== "arriv_one") {
      return Response.json({ accepted: false, reason: "Invalid source_application" }, { status: 400 });
    }
    if (envelope.destination_application !== "estate_media") {
      return Response.json({ accepted: false, reason: "Invalid destination_application" }, { status: 400 });
    }

    // 3. Validate canonical tenant
    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ accepted: false, reason: "No tenant config" }, { status: 503 });
    }
    const tenantCheck = validateInboundTenant(envelope, cfg.arriv_one_tenant_id);
    if (!tenantCheck.valid) {
      return Response.json({ accepted: false, reason: tenantCheck.error }, { status: 403 });
    }

    // 4. Validate timestamp
    const tsCheck = validateTimestamp(envelope);
    if (!tsCheck.valid) {
      return Response.json({ accepted: false, reason: tsCheck.error }, { status: 401 });
    }

    // 5. Verify HMAC signature
    const sigValid = await verifySignature(envelope, INBOUND_SECRET);
    if (!sigValid) {
      return Response.json({ accepted: false, reason: "Invalid signature" }, { status: 401 });
    }

    // 6. Validate payload size
    const sizeCheck = validatePayloadSize(envelope);
    if (!sizeCheck.valid) {
      return Response.json({ accepted: false, reason: sizeCheck.error }, { status: 413 });
    }

    // 7. Test mode filtering
    if (isTestMode(cfg) && !isTestRecord(envelope)) {
      return Response.json({ accepted: false, reason: "Test mode: only test records accepted" }, { status: 200 });
    }

    // 8. Check for duplicate event_id in SyncInbox
    const existing = await base44.asServiceRole.entities.SyncInbox.filter({
      tenant_id: envelope.tenant_id,
      event_id: envelope.event_id,
    });
    if (existing && existing.length > 0) {
      return Response.json({
        accepted: true,
        duplicate: true,
        local_record_id: existing[0].local_record_id || "",
        reason: "Duplicate event_id — idempotent no-op",
      });
    }

    // 9. Check for duplicate idempotency_key
    if (envelope.idempotency_key) {
      const dupKey = await base44.asServiceRole.entities.SyncInbox.filter({
        tenant_id: envelope.tenant_id,
        idempotency_key: envelope.idempotency_key,
      });
      if (dupKey && dupKey.length > 0) {
        return Response.json({
          accepted: true,
          duplicate: true,
          local_record_id: dupKey[0].local_record_id || "",
          reason: "Duplicate idempotency_key — idempotent no-op",
        });
      }
    }

    // 10. Process the event
    const result = await processEvent(base44, envelope, cfg);

    // 11. Record in SyncInbox
    await base44.asServiceRole.entities.SyncInbox.create({
      tenant_id: envelope.tenant_id,
      event_id: envelope.event_id,
      event_type: envelope.event_type,
      schema_version: envelope.schema_version,
      source_application: envelope.source_application,
      destination_application: envelope.destination_application,
      entity_type: envelope.entity_type,
      entity_id: envelope.entity_id || "",
      immutable_shared_id: envelope.immutable_shared_id || "",
      operation: envelope.operation,
      occurred_at: envelope.occurred_at,
      source_updated_at: envelope.source_updated_at || "",
      record_version: envelope.record_version || 0,
      idempotency_key: envelope.idempotency_key || "",
      correlation_id: envelope.correlation_id || "",
      causation_id: envelope.causation_id || "",
      origin_event_id: envelope.origin_event_id || "",
      payload: envelope.payload || {},
      processing_status: result.status,
      local_record_id: result.localRecordId || "",
      mapping_id: result.mappingId || "",
      processed_at: new Date().toISOString(),
      rejection_reason: result.reason || "",
    });

    // 12. Update tenant config last successful sync
    if (result.status === "applied") {
      await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, {
        arriv_one_last_successful_sync_at: new Date().toISOString(),
        arriv_one_sync_status: "healthy",
      });
    }

    return Response.json({
      accepted: result.status === "applied" || result.status === "duplicate",
      status: result.status,
      local_record_id: result.localRecordId || "",
      mapping_id: result.mappingId || "",
      reason: result.reason || "",
    });
  } catch (error) {
    console.error("receiveArrivOneSyncEvent error:", error);
    return Response.json({ accepted: false, reason: error.message }, { status: 500 });
  }
}

async function processEvent(base44, envelope, cfg) {
  const { entity_type, operation, immutable_shared_id, entity_id, payload, record_version, source_updated_at } = envelope;

  // Check if entity type is shared
  const sharedTypes = cfg.shared_entity_types || [];
  if (!sharedTypes.includes(entity_type)) {
    return { status: "rejected", reason: `Entity type ${entity_type} not in shared_entity_types` };
  }

  // Resolve mapping
  let mapping = null;
  if (immutable_shared_id) {
    mapping = await findMappingBySharedId(base44, cfg.arriv_one_tenant_id, entity_type, immutable_shared_id);
  }
  if (!mapping && entity_id) {
    mapping = await findMappingByRemoteId(base44, cfg.arriv_one_tenant_id, entity_type, entity_id);
  }

  // Apply field authority
  const cleanedPayload = applyInboundFieldAuthority(entity_type, payload);

  // Add sync metadata
  const syncMeta = {
    sync_source: "arriv_one",
    origin_event_id: envelope.event_id,
    immutable_shared_id: immutable_shared_id || mapping?.immutable_shared_id || crypto.randomUUID(),
    record_version: record_version || 1,
  };

  if (operation === "create") {
    // Check for ambiguous natural-key match
    const ambiguous = await isAmbiguousMatch(base44, entity_type, cleanedPayload);
    if (ambiguous) {
      await createConflict(base44, cfg.arriv_one_tenant_id, {
        entity_type,
        remote_record_id: entity_id,
        immutable_shared_id: immutable_shared_id || syncMeta.immutable_shared_id,
        conflict_type: "ambiguous_match",
        conflict_reason: "Multiple local records match the natural key",
        event_id: envelope.event_id,
        remote_values: cleanedPayload,
      });
      return { status: "conflict", reason: "Ambiguous natural-key match — conflict created" };
    }

    // Try natural-key match
    let localRecord = await naturalKeyMatch(base44, entity_type, cleanedPayload);

    if (localRecord) {
      // Link existing record
      const updated = await base44.asServiceRole.entities[entity_type].update(localRecord.id, {
        ...cleanedPayload,
        ...syncMeta,
      });
      if (!mapping) {
        mapping = await createMapping(base44, {
          tenantId: cfg.arriv_one_tenant_id,
          entityType: entity_type,
          localRecordId: localRecord.id,
          remoteRecordId: entity_id,
          immutableSharedId: syncMeta.immutable_shared_id,
          origin: "estate_media",
          eventId: envelope.event_id,
        });
      } else {
        await updateMapping(base44, mapping.id, { recordVersion: record_version, eventId: envelope.event_id });
      }
      return { status: "applied", localRecordId: localRecord.id, mappingId: mapping.id };
    }

    // Create new local record
    const created = await base44.asServiceRole.entities[entity_type].create({
      ...cleanedPayload,
      ...syncMeta,
    });
    if (!mapping) {
      mapping = await createMapping(base44, {
        tenantId: cfg.arriv_one_tenant_id,
        entityType: entity_type,
        localRecordId: created.id,
        remoteRecordId: entity_id,
        immutableSharedId: syncMeta.immutable_shared_id,
        origin: "arriv_one",
        eventId: envelope.event_id,
      });
    } else {
      await updateMapping(base44, mapping.id, { recordVersion: record_version, eventId: envelope.event_id });
    }
    return { status: "applied", localRecordId: created.id, mappingId: mapping.id };
  }

  if (operation === "update") {
    if (!mapping) {
      // No mapping found — try natural-key match
      const ambiguous = await isAmbiguousMatch(base44, entity_type, cleanedPayload);
      if (ambiguous) {
        await createConflict(base44, cfg.arriv_one_tenant_id, {
          entity_type,
          remote_record_id: entity_id,
          immutable_shared_id: immutable_shared_id || "",
          conflict_type: "ambiguous_match",
          conflict_reason: "Update received but no mapping and ambiguous natural key",
          event_id: envelope.event_id,
          remote_values: cleanedPayload,
        });
        return { status: "conflict", reason: "Ambiguous match on unmapped update" };
      }
      const localRecord = await naturalKeyMatch(base44, entity_type, cleanedPayload);
      if (localRecord) {
        mapping = await createMapping(base44, {
          tenantId: cfg.arriv_one_tenant_id,
          entityType: entity_type,
          localRecordId: localRecord.id,
          remoteRecordId: entity_id,
          immutableSharedId: syncMeta.immutable_shared_id,
          origin: "estate_media",
          eventId: envelope.event_id,
        });
      } else {
        // Create as new
        const created = await base44.asServiceRole.entities[entity_type].create({
          ...cleanedPayload,
          ...syncMeta,
        });
        mapping = await createMapping(base44, {
          tenantId: cfg.arriv_one_tenant_id,
          entityType: entity_type,
          localRecordId: created.id,
          remoteRecordId: entity_id,
          immutableSharedId: syncMeta.immutable_shared_id,
          origin: "arriv_one",
          eventId: envelope.event_id,
        });
        return { status: "applied", localRecordId: created.id, mappingId: mapping.id };
      }
    }

    // Check for stale version
    if (mapping.last_synced_version && record_version && record_version < mapping.last_synced_version) {
      return { status: "stale", reason: `Stale version ${record_version} < ${mapping.last_synced_version}` };
    }

    // For equal versions, compare source_updated_at
    if (mapping.last_synced_version && record_version === mapping.last_synced_version && source_updated_at) {
      const lastSynced = new Date(mapping.last_synced_at || 0).getTime();
      const sourceUpdated = new Date(source_updated_at).getTime();
      if (sourceUpdated < lastSynced) {
        return { status: "stale", reason: "source_updated_at is older than last sync" };
      }
    }

    // Apply the update
    await base44.asServiceRole.entities[entity_type].update(mapping.local_record_id, {
      ...cleanedPayload,
      ...syncMeta,
    });
    await updateMapping(base44, mapping.id, { recordVersion: record_version, eventId: envelope.event_id });
    return { status: "applied", localRecordId: mapping.local_record_id, mappingId: mapping.id };
  }

  if (operation === "delete") {
    if (mapping) {
      await base44.asServiceRole.entities[entity_type].delete(mapping.local_record_id);
      await base44.asServiceRole.entities.CrossAppRecordMapping.update(mapping.id, {
        sync_status: "stale",
        error_state: "Remote record deleted",
      });
      return { status: "applied", localRecordId: mapping.local_record_id, mappingId: mapping.id };
    }
    return { status: "applied", reason: "No mapping — nothing to delete" };
  }

  return { status: "rejected", reason: `Unknown operation: ${operation}` };
}

async function createConflict(base44, tenantId, { entity_type, remote_record_id, immutable_shared_id, conflict_type, conflict_reason, event_id, remote_values }) {
  await base44.asServiceRole.entities.SyncConflict.create({
    tenant_id: tenantId,
    conflict_id: crypto.randomUUID(),
    entity_type,
    remote_record_id: remote_record_id || "",
    immutable_shared_id: immutable_shared_id || "",
    conflict_type,
    conflict_reason,
    remote_values: remote_values || {},
    event_id: event_id || "",
    status: "open",
  });
}