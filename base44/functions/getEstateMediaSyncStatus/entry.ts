import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);

    // Gather sync status data
    const [outboxPending, outboxFailed, outboxDeadLettered, inboxApplied, inboxRejected, inboxConflicts, mappings, manifests] = await Promise.all([
      base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "pending" }, "-created_date", 50),
      base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "failed" }, "-next_attempt_at", 50),
      base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "dead_lettered" }, "-created_date", 50),
      base44.asServiceRole.entities.SyncInbox.filter({ processing_status: "applied" }, "-processed_at", 20),
      base44.asServiceRole.entities.SyncInbox.filter({ processing_status: "rejected" }, "-processed_at", 20),
      base44.asServiceRole.entities.SyncConflict.filter({ status: "open" }, "-created_date", 50),
      base44.asServiceRole.entities.CrossAppRecordMapping.list("-last_synced_at", 100),
      base44.asServiceRole.entities.ProductManifestLocal.list("-fetched_at", 50),
    ]);

    const lastInbound = inboxApplied[0]?.processed_at || null;
    const lastOutbound = (await base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "delivered" }, "-delivered_at", 1))[0]?.delivered_at || null;

    return Response.json({
      success: true,
      config: cfg ? {
        arriv_one_tenant_id: cfg.arriv_one_tenant_id,
        sync_enabled: cfg.arriv_one_sync_enabled,
        sync_mode: cfg.arriv_one_sync_mode,
        sync_endpoint: cfg.arriv_one_sync_endpoint ? "configured" : "not_configured",
        manifest_endpoint: cfg.arriv_one_manifest_endpoint ? "configured" : "not_configured",
        last_successful_sync_at: cfg.arriv_one_last_successful_sync_at,
        manifest_version: cfg.arriv_one_manifest_version,
        schema_version: cfg.arriv_one_schema_version,
        shared_entity_types: cfg.shared_entity_types || [],
      } : null,
      status: {
        connection_status: cfg?.arriv_one_sync_status || "not_configured",
        last_successful_inbound: lastInbound,
        last_successful_outbound: lastOutbound,
        queued_events: outboxPending.length,
        failed_events: outboxFailed.length,
        dead_letter_events: outboxDeadLettered.length,
        inbox_applied_count: inboxApplied.length,
        inbox_rejected_count: inboxRejected.length,
        open_conflicts: inboxConflicts.length,
        mapping_count: mappings.length,
        manifest_count: manifests.length,
      },
      recent: {
        pending_outbox: outboxPending.slice(0, 10),
        failed_outbox: outboxFailed.slice(0, 10),
        dead_letter_outbox: outboxDeadLettered.slice(0, 10),
        recent_inbox_applied: inboxApplied.slice(0, 5),
        recent_inbox_rejected: inboxRejected.slice(0, 5),
        open_conflicts: inboxConflicts.slice(0, 10),
        manifests: manifests.slice(0, 10),
      },
    });
  } catch (error) {
    console.error("getEstateMediaSyncStatus error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}