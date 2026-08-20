// Read-only, admin-only cross-app reconciliation for Estate Media ⇄ Arriv One.
// Returns safe aggregate counts and mapping state for all 10 active shared entities.
// Calls Arriv One endpoints with HMAC service-to-service authentication.
//
// Does NOT expose secrets, credentials, tokens, sensitive customer data, or unrestricted CRM records.
// Does NOT modify any records, create mappings, enqueue events, or enable production sync.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { isTestArtifact, isTestMapping } from "../../shared/syncTestArtifactFilter.ts";
import { signGetRequest } from "../../shared/syncHmacAuth.ts";
import { ENTITY_ADAPTERS, INITIAL_SHARED_ENTITIES } from "../../shared/syncEntityAdapters.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg) {
      return Response.json({ error: "No tenant config found" }, { status: 400 });
    }

    const tenantId = cfg.arriv_one_tenant_id;

    // ─── Local inventory (production only, test artifacts excluded) ───
    const localInventory = [];
    for (const canonicalType of INITIAL_SHARED_ENTITIES) {
      const adapter = ENTITY_ADAPTERS[canonicalType];
      const localEntity = adapter.estate_media_local;
      try {
        const records = await base44.asServiceRole.entities[localEntity].list("-created_date", 5000);
        const total = records.length;
        const testArtifacts = records.filter(isTestArtifact).length;
        const production = total - testArtifacts;

        const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
          tenant_id: tenantId,
          entity_type: canonicalType,
        });
        const testMappings = mappings.filter(isTestMapping).length;
        const prodMappings = mappings.length - testMappings;

        const sidCounts = {};
        mappings.forEach((m) => {
          const sid = m.immutable_shared_id || "";
          if (sid) sidCounts[sid] = (sidCounts[sid] || 0) + 1;
        });
        const duplicateSids = Object.values(sidCounts).filter((c) => c > 1).length;
        const missingRemoteId = mappings.filter((m) => !m.remote_record_id || m.remote_record_id === "").length;
        const versionMismatches = mappings.filter((m) => m.sync_status === "stale" || m.sync_status === "error").length;

        localInventory.push({
          entity_type: canonicalType,
          local_entity: localEntity,
          total_records: total,
          test_artifacts: testArtifacts,
          production_records: production,
          total_mappings: mappings.length,
          test_mappings: testMappings,
          production_mappings: prodMappings,
          unmapped_production: production - prodMappings,
          duplicate_shared_ids: duplicateSids,
          missing_remote_record_id: missingRemoteId,
          version_mismatches: versionMismatches,
        });
      } catch (err) {
        localInventory.push({
          entity_type: canonicalType,
          local_entity: localEntity,
          error: err.message,
        });
      }
    }

    // ─── Sync queue summary ───
    const [outboxPending, outboxDeadLettered, inboxApplied, inboxRejected, openConflicts] = await Promise.all([
      base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "pending" }, "-created_date", 50),
      base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "dead_lettered" }, "-created_date", 50),
      base44.asServiceRole.entities.SyncInbox.filter({ processing_status: "applied" }, "-processed_at", 20),
      base44.asServiceRole.entities.SyncInbox.filter({ processing_status: "rejected" }, "-processed_at", 20),
      base44.asServiceRole.entities.SyncConflict.filter({ status: "open" }, "-created_date", 50),
    ]);

    // ─── Remote (Arriv One) authenticated reconciliation ───
    let remoteReconciliation = null;
    let remoteReconciliationError = null;
    const reconciliationUrl = cfg.arriv_one_reconciliation_endpoint ||
      "https://arriv-one-sales-crm.base44.app/api/functions/runEstateMediaReconciliation";
    try {
      const url = new URL(reconciliationUrl);
      const headers = await signGetRequest({
        tenantId,
        method: "GET",
        path: url.pathname,
        secretName: OUTBOUND_SECRET,
      });
      const remoteResp = await fetch(reconciliationUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const contentType = remoteResp.headers.get("content-type") || "";
      if (!remoteResp.ok) {
        remoteReconciliationError = `Arriv One returned HTTP ${remoteResp.status}`;
        try {
          const body = await remoteResp.text();
          remoteReconciliationError += `: ${body.substring(0, 200)}`;
        } catch (_) {}
      } else if (!contentType.includes("application/json")) {
        remoteReconciliationError = `Arriv One returned non-JSON content-type: ${contentType}`;
      } else {
        remoteReconciliation = await remoteResp.json();
        // Validate it's a real JSON function response, not an HTML login redirect
        if (typeof remoteReconciliation !== "object" || remoteReconciliation === null) {
          remoteReconciliationError = "Arriv One returned non-object JSON response";
          remoteReconciliation = null;
        }
      }
    } catch (err) {
      remoteReconciliationError = `Reconciliation endpoint unreachable: ${err.message}`;
    }

    // ─── Remote (Arriv One) authenticated secure status ───
    let remoteSyncStatus = null;
    let remoteSyncStatusError = null;
    const statusUrl = cfg.arriv_one_sync_status_endpoint ||
      "https://arriv-one-sales-crm.base44.app/api/functions/getSyncStatusSecure";
    try {
      const url = new URL(statusUrl);
      const headers = await signGetRequest({
        tenantId,
        method: "GET",
        path: url.pathname,
        secretName: OUTBOUND_SECRET,
      });
      const statusResp = await fetch(statusUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const contentType = statusResp.headers.get("content-type") || "";
      if (!statusResp.ok) {
        remoteSyncStatusError = `Arriv One returned HTTP ${statusResp.status}`;
        try {
          const body = await statusResp.text();
          remoteSyncStatusError += `: ${body.substring(0, 200)}`;
        } catch (_) {}
      } else if (!contentType.includes("application/json")) {
        remoteSyncStatusError = `Arriv One returned non-JSON content-type: ${contentType}`;
      } else {
        remoteSyncStatus = await statusResp.json();
        if (typeof remoteSyncStatus !== "object" || remoteSyncStatus === null) {
          remoteSyncStatusError = "Arriv One returned non-object JSON response";
          remoteSyncStatus = null;
        }
      }
    } catch (err) {
      remoteSyncStatusError = `Secure status endpoint unreachable: ${err.message}`;
    }

    // ─── Build parity comparison ───
    const parity = [];
    const remoteResults = remoteReconciliation?.results || [];
    for (const li of localInventory) {
      const remote = remoteResults.find((r) => r.entity_type === li.entity_type);
      parity.push({
        entity_type: li.entity_type,
        local_production: li.production_records || 0,
        remote_count: remote?.local_count ?? null,
        remote_mapped: remote?.mapped_count ?? null,
        local_mappings: li.production_mappings || 0,
        unmatched_local: (li.production_records || 0) - (li.production_mappings || 0),
        unmatched_remote: remote ? (remote.local_count - remote.mapped_count) : null,
        version_mismatches: remote?.version_mismatch_count ?? 0,
        dead_letters: remote?.dead_letter_count ?? 0,
        validation_status: remote?.validation_status || "no_remote_data",
      });
    }

    return Response.json({
      success: true,
      tenant_id: tenantId,
      sync_mode: cfg.arriv_one_sync_mode,
      sync_enabled: cfg.arriv_one_sync_enabled,
      migration_authorized: cfg.migration_authorized || false,
      generated_at: new Date().toISOString(),
      local_inventory: localInventory,
      sync_queues: {
        outbox_pending: outboxPending.length,
        outbox_dead_lettered: outboxDeadLettered.length,
        inbox_applied: inboxApplied.length,
        inbox_rejected: inboxRejected.length,
        open_conflicts: openConflicts.length,
      },
      remote_reconciliation: remoteReconciliation,
      remote_reconciliation_error: remoteReconciliationError,
      remote_sync_status: remoteSyncStatus,
      remote_sync_status_error: remoteSyncStatusError,
      parity_comparison: parity,
      summary: {
        total_local_production: localInventory.reduce((s, li) => s + (li.production_records || 0), 0),
        total_local_test_artifacts: localInventory.reduce((s, li) => s + (li.test_artifacts || 0), 0),
        total_production_mappings: localInventory.reduce((s, li) => s + (li.production_mappings || 0), 0),
        total_test_mappings: localInventory.reduce((s, li) => s + (li.test_mappings || 0), 0),
        remote_reconciliation_reachable: remoteReconciliation !== null,
        remote_sync_status_reachable: remoteSyncStatus !== null,
        entities_with_production_records: localInventory.filter((li) => (li.production_records || 0) > 0).map((li) => li.entity_type),
      },
    });
  } catch (error) {
    console.error("getEstateMediaCrossAppReconciliation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}