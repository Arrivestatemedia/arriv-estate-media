// Read-only, admin-only cross-app reconciliation for Estate Media ⇄ Arriv One.
// Returns safe aggregate counts and mapping state for all 10 active shared entities.
// Does NOT expose secrets, credentials, tokens, sensitive customer data, or unrestricted CRM records.
// Does NOT modify any records, create mappings, enqueue events, or enable production sync.
//
// Calls the Arriv One reconciliation endpoint to compare local vs remote inventory.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { isTestArtifact, isTestMapping } from "../../shared/syncTestArtifactFilter.ts";

// Canonical entity types → Estate Media local entity names
const SHARED_ENTITIES = [
  { canonical: "Contact", local: "Contact" },
  { canonical: "ActivityLog", local: "ActivityLog" },
  { canonical: "Deal", local: "Deal" },
  { canonical: "SmsConversation", local: "SmsConversation" },
  { canonical: "SmsMessage", local: "SmsMessage" },
  { canonical: "SalesTeamMember", local: "SalesTeamMember" },
  { canonical: "Goal", local: "SalesGoal" },
  { canonical: "ManagerNote", local: "ManagerNote" },
  { canonical: "TimeOffRequest", local: "TimeOffRequest" },
  { canonical: "BenefitsLifeEvent", local: "BenefitsLifeEvent" },
];

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
    for (const e of SHARED_ENTITIES) {
      try {
        const records = await base44.asServiceRole.entities[e.local].list("-created_date", 5000);
        const total = records.length;
        const testArtifacts = records.filter(isTestArtifact).length;
        const production = total - testArtifacts;

        const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
          tenant_id: tenantId,
          entity_type: e.canonical,
        });
        const testMappings = mappings.filter(isTestMapping).length;
        const prodMappings = mappings.length - testMappings;

        // Check for duplicate immutable_shared_id values
        const sidCounts = {};
        mappings.forEach((m) => {
          const sid = m.immutable_shared_id || "";
          if (sid) sidCounts[sid] = (sidCounts[sid] || 0) + 1;
        });
        const duplicateSids = Object.values(sidCounts).filter((c) => c > 1).length;

        // Check for missing remote_record_id
        const missingRemoteId = mappings.filter((m) => !m.remote_record_id || m.remote_record_id === "").length;

        // Version mismatches (stale or error mappings)
        const versionMismatches = mappings.filter((m) => m.sync_status === "stale" || m.sync_status === "error").length;

        localInventory.push({
          entity_type: e.canonical,
          local_entity: e.local,
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
          entity_type: e.canonical,
          local_entity: e.local,
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

    // ─── Remote (Arriv One) reconciliation ───
    let remoteReconciliation = null;
    let remoteError = null;
    try {
      const arrivOneEndpoint = cfg.arriv_one_reconciliation_endpoint ||
        "https://arriv-one-sales-crm.base44.app/api/functions/runEstateMediaReconciliation";
      const remoteResp = await fetch(arrivOneEndpoint, {
        method: "GET",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (remoteResp.ok) {
        remoteReconciliation = await remoteResp.json();
      } else {
        remoteError = `Arriv One returned HTTP ${remoteResp.status}`;
        try {
          const body = await remoteResp.text();
          remoteError += `: ${body.substring(0, 200)}`;
        } catch (_) {}
      }
    } catch (err) {
      remoteError = `Could not reach Arriv One reconciliation endpoint: ${err.message}`;
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
      remote_error: remoteError,
      parity_comparison: parity,
      summary: {
        total_local_production: localInventory.reduce((s, li) => s + (li.production_records || 0), 0),
        total_local_test_artifacts: localInventory.reduce((s, li) => s + (li.test_artifacts || 0), 0),
        total_production_mappings: localInventory.reduce((s, li) => s + (li.production_mappings || 0), 0),
        total_test_mappings: localInventory.reduce((s, li) => s + (li.test_mappings || 0), 0),
        remote_reachable: remoteReconciliation !== null,
        entities_with_production_records: localInventory.filter((li) => (li.production_records || 0) > 0).map((li) => li.entity_type),
      },
    });
  } catch (error) {
    console.error("getEstateMediaCrossAppReconciliation error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}