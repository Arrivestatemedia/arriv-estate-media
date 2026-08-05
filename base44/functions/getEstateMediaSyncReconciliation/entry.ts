import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig, getCanonicalTenantId } from "../../shared/syncTenantConfig.ts";

const SHARED_ENTITIES = [
  "Contact",
  "ActivityLog",
  "Deal",
  "SmsConversation",
  "SmsMessage",
  "SalesTeamMember",
  "SalesGoal",
  "ManagerNote",
  "TimeOffRequest",
  "BenefitsLifeEvent",
];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const tenantId = await getCanonicalTenantId(base44);
    if (!tenantId) return Response.json({ error: "No canonical tenant configured" }, { status: 503 });

    const reconciliationId = crypto.randomUUID();
    const results = [];

    for (const entityType of SHARED_ENTITIES) {
      try {
        const localRecords = await base44.asServiceRole.entities[entityType].list("-created_date", 5000);
        const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
          tenant_id: tenantId,
          entity_type: entityType,
        });

        const localCount = localRecords.length;
        const mappingCount = mappings.length;
        const unmappedCount = localRecords.filter(r => !mappings.some(m => m.local_record_id === r.id)).length;
        const versionMismatchCount = mappings.filter(m => m.sync_status === "stale" || m.error_state).length;

        results.push({
          entity_type: entityType,
          local_record_count: localCount,
          mapping_count: mappingCount,
          unmapped_count: unmappedCount,
          version_mismatch_count: versionMismatchCount,
        });

        // Store reconciliation record
        await base44.asServiceRole.entities.SyncReconciliation.create({
          tenant_id: tenantId,
          reconciliation_id: `${reconciliationId}_${entityType}`,
          entity_type: entityType,
          local_record_count: localCount,
          mapping_count: mappingCount,
          unmapped_count: unmappedCount,
          version_mismatch_count: versionMismatchCount,
          dead_letter_count: 0,
          latest_sync_timestamp: new Date().toISOString(),
          initiated_by: "admin",
          status: "completed",
        });
      } catch (e) {
        results.push({ entity_type: entityType, error: e.message });
      }
    }

    // Count dead-lettered outbox events
    const deadLettered = await base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "dead_lettered" });

    return Response.json({
      success: true,
      reconciliation_id: reconciliationId,
      tenant_id: tenantId,
      entities: results,
      dead_letter_count: deadLettered.length,
    });
  } catch (error) {
    console.error("getEstateMediaSyncReconciliation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}