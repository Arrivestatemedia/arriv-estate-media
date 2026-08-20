import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getCanonicalTenantId } from "../../shared/syncTenantConfig.ts";
import { ENTITY_ADAPTERS, INITIAL_SHARED_ENTITIES } from "../../shared/syncEntityAdapters.ts";

// Uses canonical entity types from the adapter registry (not app-local names).
// SalesGoal → Goal, Conference → Meeting (deferred), ManagerNote subtype → Recognition (deferred).

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const tenantId = await getCanonicalTenantId(base44);
    if (!tenantId) return Response.json({ success: true, skipped: true, reason: "No tenant configured" });

    const reconciliationId = crypto.randomUUID();

    for (const canonicalType of INITIAL_SHARED_ENTITIES) {
      try {
        const adapter = ENTITY_ADAPTERS[canonicalType];
        const localEntity = adapter.estate_media_local;

        const localRecords = await base44.asServiceRole.entities[localEntity].list("-created_date", 5000);
        // Mappings are stored by CANONICAL entity type
        const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
          tenant_id: tenantId,
          entity_type: canonicalType,
        });

        const localCount = localRecords.length;
        const mappingCount = mappings.length;
        const unmappedCount = localRecords.filter(r => !mappings.some(m => m.local_record_id === r.id)).length;
        const versionMismatchCount = mappings.filter(m => m.sync_status === "stale" || m.error_state).length;

        await base44.asServiceRole.entities.SyncReconciliation.create({
          tenant_id: tenantId,
          reconciliation_id: `${reconciliationId}_${canonicalType}`,
          entity_type: canonicalType,
          local_record_count: localCount,
          mapping_count: mappingCount,
          unmapped_count: unmappedCount,
          version_mismatch_count: versionMismatchCount,
          dead_letter_count: 0,
          latest_sync_timestamp: new Date().toISOString(),
          initiated_by: "scheduled",
          status: "completed",
        });
      } catch (e) {
        console.warn(`Reconciliation failed for ${canonicalType}:`, e.message);
      }
    }

    return Response.json({ success: true, reconciliation_id: reconciliationId });
  } catch (error) {
    console.error("runEstateMediaSyncReconciliation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}