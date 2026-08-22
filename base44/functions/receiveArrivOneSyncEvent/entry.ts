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
  archiveMapping,
  naturalKeyMatch,
  isAmbiguousMatch,
} from "../../shared/syncMapping.ts";
import {
  toEstateMediaLocalEntityType,
  isEntitySyncReady,
  resolveEventType,
  DESTRUCTIVE_SYNC_APPROVED_ENTITIES,
  ENTITY_ADAPTERS,
} from "../../shared/syncEntityAdapters.ts";
import { translateCanonicalToLocal } from "../../shared/syncFieldAdapters.ts";
import { processManifestPush } from "../../shared/manifestPushHandler.ts";

const INBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const envelope = await req.json();

    // 1. Validate envelope shape (includes signature_version check)
    const shapeCheck = validateEnvelopeShape(envelope);
    if (!shapeCheck.valid) {
      return Response.json(
        {
          accepted: false,
          processing_status: "rejected",
          reason: shapeCheck.error,
          code: shapeCheck.code || "invalid_envelope",
        },
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

    // 3. Validate canonical tenant
    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "No tenant config" },
        { status: 503 }
      );
    }
    const tenantCheck = validateInboundTenant(envelope, cfg.arriv_one_tenant_id);
    if (!tenantCheck.valid) {
      console.warn(`[SYNC_SECURITY] Tenant mismatch rejected: envelope_tenant="${envelope.tenant_id}" expected="${cfg.arriv_one_tenant_id}" entity_type="${envelope.entity_type}" event_id="${envelope.event_id}"`);
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: tenantCheck.error },
        { status: 403 }
      );
    }

    // 4. Validate timestamp
    const tsCheck = validateTimestamp(envelope);
    if (!tsCheck.valid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: tsCheck.error },
        { status: 401 }
      );
    }

    // 5. Verify HMAC signature
    const sigValid = await verifySignature(envelope, INBOUND_SECRET);
    if (!sigValid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Invalid signature" },
        { status: 401 }
      );
    }

    // 6. Validate payload size
    const sizeCheck = validatePayloadSize(envelope);
    if (!sizeCheck.valid) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: sizeCheck.error },
        { status: 413 }
      );
    }

    // 7. Test mode filtering
    if (isTestMode(cfg) && !isTestRecord(envelope)) {
      return Response.json(
        { accepted: false, processing_status: "rejected", reason: "Test mode: only test records accepted" },
        { status: 200 }
      );
    }

    // 7.5. Manifest event routing — detect manifest.published events and route to
    // the dedicated manifest push handler BEFORE the regular entity sync-ready check.
    // ProductManifest is a special entity: it's stored in ProductManifestLocal (a mirror),
    // not in a regular entity table. It bypasses shared_entity_types and field-authority logic.
    const eventTypeDef = resolveEventType(envelope.event_type);
    if (eventTypeDef?.is_manifest || envelope.entity_type === "ProductManifest") {
      const manifestResult = await processManifestPush(base44, envelope, cfg);

      // Record in SyncInbox (same audit trail as regular events)
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
        processing_status: manifestResult.status,
        local_record_id: "",
        mapping_id: "",
        processed_at: new Date().toISOString(),
        rejection_reason: manifestResult.reason || "",
      });

      // Update tenant config last successful sync (only on applied)
      if (manifestResult.status === "applied") {
        await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, {
          arriv_one_last_successful_sync_at: new Date().toISOString(),
          arriv_one_sync_status: "healthy",
        });
      }

      return Response.json({
        accepted: manifestResult.status === "applied",
        processing_status: manifestResult.status,
        inbound_event_id: envelope.event_id,
        immutable_shared_id: envelope.immutable_shared_id || "",
        local_record_id: "",
        mapping_id: "",
        applied_record_version: envelope.record_version || 0,
        reason: manifestResult.reason || "",
        manifest_type: manifestResult.manifestType,
        manifest_version: manifestResult.version,
        manifest_id: manifestResult.manifestId,
      });
    }

    // 8. Validate entity type is sync-ready (not deferred)
    if (!isEntitySyncReady(envelope.entity_type)) {
      return Response.json(
        {
          accepted: false,
          processing_status: "rejected",
          reason: `Entity ${envelope.entity_type} is not sync-ready (deferred or unknown)`,
        },
        { status: 200 }
      );
    }

    // 9. Check for duplicate event_id in SyncInbox (idempotent no-op)
    const existing = await base44.asServiceRole.entities.SyncInbox.filter({
      tenant_id: envelope.tenant_id,
      event_id: envelope.event_id,
    });
    if (existing && existing.length > 0) {
      const dup = existing[0];
      return Response.json({
        accepted: true,
        processing_status: "rejected_duplicate",
        inbound_event_id: envelope.event_id,
        immutable_shared_id: envelope.immutable_shared_id || dup.immutable_shared_id || "",
        local_record_id: dup.local_record_id || "",
        mapping_id: dup.mapping_id || "",
        applied_record_version: dup.record_version || 0,
        reason: "Duplicate event_id — idempotent no-op",
      });
    }

    // 10. Check for duplicate idempotency_key
    if (envelope.idempotency_key) {
      const dupKey = await base44.asServiceRole.entities.SyncInbox.filter({
        tenant_id: envelope.tenant_id,
        idempotency_key: envelope.idempotency_key,
      });
      if (dupKey && dupKey.length > 0) {
        const dup = dupKey[0];
        return Response.json({
          accepted: true,
          processing_status: "rejected_duplicate",
          inbound_event_id: envelope.event_id,
          immutable_shared_id: envelope.immutable_shared_id || dup.immutable_shared_id || "",
          local_record_id: dup.local_record_id || "",
          mapping_id: dup.mapping_id || "",
          applied_record_version: dup.record_version || 0,
          reason: "Duplicate idempotency_key — idempotent no-op",
        });
      }
    }

    // 11. Process the event
    const result = await processEvent(base44, envelope, cfg);

    // 12. Record in SyncInbox
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

    // 13. Update tenant config last successful sync (only on applied)
    if (result.status === "applied") {
      await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, {
        arriv_one_last_successful_sync_at: new Date().toISOString(),
        arriv_one_sync_status: "healthy",
      });
    }

    // 14. Return full acknowledgment contract
    return Response.json({
      accepted: result.status === "applied",
      processing_status: result.status, // applied | rejected_duplicate | rejected_stale | rejected | conflict
      inbound_event_id: envelope.event_id,
      immutable_shared_id: envelope.immutable_shared_id || result.immutableSharedId || "",
      local_record_id: result.localRecordId || "",
      mapping_id: result.mappingId || "",
      applied_record_version: result.appliedRecordVersion || 0,
      reason: result.reason || "",
    });
  } catch (error) {
    console.error("receiveArrivOneSyncEvent error:", error);
    return Response.json(
      { accepted: false, processing_status: "rejected", reason: error.message },
      { status: 500 }
    );
  }
}

async function processEvent(base44, envelope, cfg) {
  const { entity_type, operation, immutable_shared_id, entity_id, payload, record_version, source_updated_at } = envelope;

  // Check if entity type is in shared_entity_types
  const sharedTypes = cfg.shared_entity_types || [];
  if (!sharedTypes.includes(entity_type)) {
    return { status: "rejected", reason: `Entity type ${entity_type} not in shared_entity_types` };
  }

  // Resolve mapping (by canonical entity type)
  let mapping = null;
  if (immutable_shared_id) {
    mapping = await findMappingBySharedId(base44, cfg.arriv_one_tenant_id, entity_type, immutable_shared_id);
  }
  if (!mapping && entity_id) {
    mapping = await findMappingByRemoteId(base44, cfg.arriv_one_tenant_id, entity_type, entity_id);
  }

  // Apply field authority (canonical type) — strips sensitive/never_sync fields
  const cleanedPayload = applyInboundFieldAuthority(entity_type, payload);

  // Translate canonical fields to local fields (rename + resolve references)
  const localPayload = await translateCanonicalToLocal(
    base44, cfg.arriv_one_tenant_id, entity_type, cleanedPayload
  );

  // Translate to local entity name for DB operations
  const localEntityType = toEstateMediaLocalEntityType(entity_type);

  // Add sync metadata (tenant_id from trusted canonical config, not client-provided)
  const syncMeta = {
    tenant_id: cfg.arriv_one_tenant_id,
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
      await base44.asServiceRole.entities[localEntityType].update(localRecord.id, {
        ...localPayload,
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
      return {
        status: "applied",
        localRecordId: localRecord.id,
        mappingId: mapping.id,
        immutableSharedId: syncMeta.immutable_shared_id,
        appliedRecordVersion: record_version || 1,
      };
    }

    // Create new local record
    const created = await base44.asServiceRole.entities[localEntityType].create({
      ...localPayload,
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
    return {
      status: "applied",
      localRecordId: created.id,
      mappingId: mapping.id,
      immutableSharedId: syncMeta.immutable_shared_id,
      appliedRecordVersion: record_version || 1,
    };
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
        const created = await base44.asServiceRole.entities[localEntityType].create({
          ...localPayload,
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
        return {
          status: "applied",
          localRecordId: created.id,
          mappingId: mapping.id,
          immutableSharedId: syncMeta.immutable_shared_id,
          appliedRecordVersion: record_version || 1,
        };
      }
    }

    // Check for stale version
    if (mapping.last_synced_version && record_version !== null && record_version !== undefined) {
      if (record_version < mapping.last_synced_version) {
        return {
          status: "rejected_stale",
          reason: `Stale version ${record_version} < ${mapping.last_synced_version}`,
          localRecordId: mapping.local_record_id,
          mappingId: mapping.id,
        };
      }
      // For equal versions, compare source_updated_at (UTC)
      if (record_version === mapping.last_synced_version && source_updated_at) {
        const lastSynced = new Date(mapping.last_synced_at || 0).getTime();
        const sourceUpdated = new Date(source_updated_at).getTime();
        if (sourceUpdated < lastSynced) {
          return {
            status: "rejected_stale",
            reason: "source_updated_at is older than last sync",
            localRecordId: mapping.local_record_id,
            mappingId: mapping.id,
          };
        }
      }
    }

    // Apply the update
    await base44.asServiceRole.entities[localEntityType].update(mapping.local_record_id, {
      ...localPayload,
      ...syncMeta,
    });
    await updateMapping(base44, mapping.id, { recordVersion: record_version, eventId: envelope.event_id });
    return {
      status: "applied",
      localRecordId: mapping.local_record_id,
      mappingId: mapping.id,
      immutableSharedId: syncMeta.immutable_shared_id,
      appliedRecordVersion: record_version || 1,
    };
  }

  if (operation === "delete") {
    // ─── DELETE / ARCHIVE SAFETY ───
    // Do NOT hard-delete shared records from a remote delete event.
    // Only entities explicitly approved in DESTRUCTIVE_SYNC_APPROVED_ENTITIES
    // may be hard-deleted. All others are archived (mapping marked stale,
    // local record preserved for historical/audit integrity).
    const canHardDelete = DESTRUCTIVE_SYNC_APPROVED_ENTITIES.includes(entity_type);

    if (mapping) {
      if (canHardDelete) {
        await base44.asServiceRole.entities[localEntityType].delete(mapping.local_record_id);
        await archiveMapping(base44, mapping.id, "Remote record deleted — hard-delete approved");
        return {
          status: "applied",
          localRecordId: mapping.local_record_id,
          mappingId: mapping.id,
          appliedRecordVersion: record_version || 0,
          reason: "Hard-delete applied (entity approved for destructive sync)",
        };
      }
      // Soft-delete / archive: preserve the local record, archive the mapping
      await archiveMapping(base44, mapping.id, "Remote record deleted — local record preserved (archive)");
      return {
        status: "applied",
        localRecordId: mapping.local_record_id,
        mappingId: mapping.id,
        appliedRecordVersion: record_version || 0,
        reason: "Remote delete received — local record archived (not hard-deleted)",
      };
    }
    return {
      status: "applied",
      reason: "No mapping — nothing to archive",
      appliedRecordVersion: record_version || 0,
    };
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