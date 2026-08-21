// Admin-only migration batch executor.
// Executes a single migration batch for one canonical entity type.
// Requires migration_authorized=true AND sync_mode="migration".
// Only transmits explicitly selected records — does NOT auto-enqueue.
//
// For each record:
//   1. Creates an outbox event with isMigrationEvent=true
//   2. Signs and delivers to Arriv One's receiveEstateMediaSyncEvent endpoint
//   3. Processes the acknowledgment (applied / rejected_duplicate)
//   4. Creates/updates the CrossAppRecordMapping with the remote_record_id

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig, isMigrationMode } from "../../shared/syncTenantConfig.ts";
import { isTestArtifact } from "../../shared/syncTestArtifactFilter.ts";
import { writeSyncOutboxEvent } from "../../shared/syncOutboxWriter.ts";
import {
  signEnvelope,
  SCHEMA_VERSION,
  generateNonce,
} from "../../shared/syncEnvelope.ts";
import {
  SIGNATURE_VERSION,
  ENTITY_ADAPTERS,
} from "../../shared/syncEntityAdapters.ts";
import { findMappingByLocalId, createMapping, updateMapping } from "../../shared/syncMapping.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { entity_type, batch_size, batch_offset, dry_run } = body;

    if (!entity_type) {
      return Response.json({ error: "entity_type required" }, { status: 400 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ error: "No tenant config" }, { status: 400 });

    // Verify migration is authorized and in migration mode
    if (!cfg.migration_authorized || !isMigrationMode(cfg)) {
      return Response.json({
        error: "Migration not authorized or not in migration mode",
        migration_authorized: cfg.migration_authorized,
        sync_mode: cfg.arriv_one_sync_mode,
      }, { status: 403 });
    }

    if (!cfg.arriv_one_sync_endpoint) {
      return Response.json({ error: "No sync endpoint configured" }, { status: 503 });
    }

    const tenantId = cfg.arriv_one_tenant_id;
    const adapter = ENTITY_ADAPTERS[entity_type];
    if (!adapter) {
      return Response.json({ error: `Unknown entity type: ${entity_type}` }, { status: 400 });
    }

    const localEntity = adapter.estate_media_local;
    const batchSize = Math.min(batch_size || 50, 50); // max 50 per batch
    const batchOffset = batch_offset || 0;

    // Fetch production records (test artifacts excluded)
    const allRecords = await base44.asServiceRole.entities[localEntity].list("-created_date", 5000);
    const production = allRecords.filter((r) => !isTestArtifact(r));
    const batch = production.slice(batchOffset, batchOffset + batchSize);

    // Fetch audit records for preserved source_updated_at
    const audits = await base44.asServiceRole.entities.MigrationInitializationAudit.filter({
      entity_type: entity_type,
    });
    const auditByRecord: Record<string, any> = {};
    for (const a of audits) auditByRecord[a.record_id] = a;

    // Dry-run mode: return what would be transmitted without actually sending
    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        entity_type,
        total_production: production.length,
        batch_offset: batchOffset,
        batch_size: batchSize,
        batch_records: batch.map((r) => ({
          record_id: r.id,
          email: r.email,
          full_name: r.full_name,
          immutable_shared_id: r.immutable_shared_id,
          record_version: r.record_version,
          source_updated_at: auditByRecord[r.id]?.original_updated_date || r.updated_date,
        })),
      });
    }

    const results: any[] = [];

    for (const record of batch) {
      const audit = auditByRecord[record.id];
      const sourceUpdatedAt = audit?.original_updated_date || record.updated_date;
      const recordVersion = record.record_version || 1;

      // Step 1: Create outbox event with isMigrationEvent=true
      const outbox = await writeSyncOutboxEvent(base44, {
        localEntityType: localEntity,
        entityId: record.id,
        operation: "create",
        recordVersion,
        recordData: record,
        occurredAt: sourceUpdatedAt,
        sourceUpdatedAt,
        immutableSharedId: record.immutable_shared_id,
        isMigrationEvent: true,
      });

      if (!outbox) {
        results.push({
          record_id: record.id,
          email: record.email,
          full_name: record.full_name,
          immutable_shared_id: record.immutable_shared_id,
          status: "failed",
          error: "Outbox event not created (suppressed or gated)",
        });
        continue;
      }

      // Step 2: Build the delivery envelope with fresh signature timestamp/nonce
      const envelope: any = {
        event_id: outbox.event_id,
        event_type: outbox.event_type,
        schema_version: outbox.schema_version || SCHEMA_VERSION,
        signature_version: SIGNATURE_VERSION,
        source_application: outbox.source_application,
        destination_application: outbox.destination_application,
        tenant_id: outbox.tenant_id,
        entity_type: outbox.entity_type,
        entity_id: outbox.entity_id,
        immutable_shared_id: outbox.immutable_shared_id,
        external_mapping_id: outbox.external_mapping_id || "",
        operation: outbox.operation,
        occurred_at: outbox.occurred_at,
        source_updated_at: outbox.source_updated_at,
        record_version: outbox.record_version,
        idempotency_key: outbox.idempotency_key,
        correlation_id: outbox.correlation_id || "",
        causation_id: outbox.causation_id || "",
        origin_event_id: outbox.origin_event_id || "",
        payload: outbox.payload || {},
        signature_timestamp: new Date().toISOString(),
        signature_nonce: generateNonce(),
      };

      // Sign the envelope
      const signature = await signEnvelope(envelope, OUTBOUND_SECRET);
      envelope.signature = signature;

      // Step 3: Deliver to Arriv One
      let ackResult: any;
      try {
        const response = await fetch(cfg.arriv_one_sync_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
          signal: AbortSignal.timeout(30000),
        });
        const ackBody = await response.json().catch(() => ({}));
        ackResult = {
          http_status: response.status,
          ok: response.ok,
          accepted: ackBody.accepted,
          processing_status: ackBody.processing_status || (response.ok ? "applied" : "rejected"),
          inbound_event_id: ackBody.inbound_event_id,
          local_record_id: ackBody.local_record_id,
          mapping_id: ackBody.mapping_id,
          applied_record_version: ackBody.applied_record_version,
          reason: ackBody.reason,
        };
      } catch (err) {
        ackResult = {
          http_status: 0,
          ok: false,
          error: err.message,
        };
      }

      // Step 4: Process acknowledgment
      const isSuccess = ackResult.ok &&
        (ackResult.processing_status === "applied" || ackResult.processing_status === "rejected_duplicate");

      if (isSuccess) {
        // Create or update mapping with remote_record_id
        let mapping = await findMappingByLocalId(base44, tenantId, entity_type, record.id);
        if (mapping) {
          await updateMapping(base44, mapping.id, {
            recordVersion,
            eventId: outbox.event_id,
            syncStatus: "linked",
            remoteRecordId: ackResult.local_record_id || mapping.remote_record_id || "",
          });
        } else {
          mapping = await createMapping(base44, {
            tenantId,
            entityType: entity_type,
            localRecordId: record.id,
            remoteRecordId: ackResult.local_record_id || "",
            immutableSharedId: record.immutable_shared_id,
            origin: "estate_media",
            eventId: outbox.event_id,
          });
        }

        // Update outbox record as delivered
        await base44.asServiceRole.entities.SyncOutbox.update(outbox.id, {
          delivery_status: "delivered",
          delivered_at: new Date().toISOString(),
          delivery_attempts: 1,
          last_delivery_error: "",
        });

        results.push({
          record_id: record.id,
          email: record.email,
          full_name: record.full_name,
          immutable_shared_id: record.immutable_shared_id,
          status: "success",
          processing_status: ackResult.processing_status,
          http_status: ackResult.http_status,
          accepted: ackResult.accepted,
          inbound_event_id: ackResult.inbound_event_id,
          remote_record_id: ackResult.local_record_id,
          mapping_id: mapping?.id,
          applied_record_version: ackResult.applied_record_version,
          idempotency_key: outbox.idempotency_key,
        });
      } else {
        // Failed delivery — update outbox record
        const errorMsg = ackResult.error || ackResult.reason || `HTTP ${ackResult.http_status}`;
        await base44.asServiceRole.entities.SyncOutbox.update(outbox.id, {
          delivery_status: "failed",
          delivery_attempts: 1,
          last_delivery_error: errorMsg,
          next_attempt_at: new Date(Date.now() + 60000).toISOString(),
        });

        results.push({
          record_id: record.id,
          email: record.email,
          full_name: record.full_name,
          immutable_shared_id: record.immutable_shared_id,
          status: "failed",
          http_status: ackResult.http_status,
          processing_status: ackResult.processing_status,
          error: errorMsg,
        });
      }
    }

    return Response.json({
      success: true,
      entity_type,
      batch_offset: batchOffset,
      batch_size: batchSize,
      total_production: production.length,
      batch_attempted: batch.length,
      results,
      summary: {
        succeeded: results.filter((r) => r.status === "success").length,
        failed: results.filter((r) => r.status === "failed").length,
        applied: results.filter((r) => r.processing_status === "applied").length,
        rejected_duplicate: results.filter((r) => r.processing_status === "rejected_duplicate").length,
      },
    });
  } catch (error) {
    console.error("executeEstateMediaMigrationBatch error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}