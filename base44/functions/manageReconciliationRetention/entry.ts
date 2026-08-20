// Admin-only reconciliation retention management.
// SyncReconciliation records are diagnostic monitoring data (not audit evidence —
// audit evidence lives in IntegrationAuditLog). This function prunes old records
// to prevent the monitoring-noise problem seen on Arriv One (thousands of legacy records).
//
// Policy:
//   - Keep the latest N records per entity_type (default 30)
//   - Delete records older than retention_days (default 90)
//   - Never delete records from the current day (preserves latest run)
//   - Reports counts before/after, does NOT delete audit evidence
//
// Safe because:
//   - SyncReconciliation is diagnostic only (aggregate counts, not business data)
//   - IntegrationAuditLog is the system of record for audit evidence
//   - Reconciliation can be re-run at any time to regenerate current state

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { INITIAL_SHARED_ENTITIES } from "../../shared/syncEntityAdapters.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "preview";
    const keepLatest = body.keep_latest || 30;
    const retentionDays = body.retention_days || 90;

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ error: "No tenant config" }, { status: 400 });
    const tenantId = cfg.arriv_one_tenant_id;

    // Also include legacy "SalesGoal" entity type from old reconciliation runs
    const entityTypesToCheck = [...INITIAL_SHARED_ENTITIES, "SalesGoal"];
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const report = {
      action,
      keep_latest_per_entity: keepLatest,
      retention_days: retentionDays,
      cutoff_date: cutoffDate,
      per_entity: [],
      total_before: 0,
      total_to_remove: 0,
      total_after: 0,
    };

    for (const entityType of entityTypesToCheck) {
      const records = await base44.asServiceRole.entities.SyncReconciliation.filter({
        tenant_id: tenantId,
        entity_type: entityType,
      }, "-created_date", 5000);

      // Sort by created_date descending (newest first)
      const sorted = records.sort((a, b) =>
        new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime()
      );

      // Keep latest N, and anything within retention window
      const toKeep = sorted.slice(0, keepLatest);
      const keepIds = new Set(toKeep.map(r => r.id));
      const toRemove = sorted.filter(r => {
        if (keepIds.has(r.id)) return false;
        const age = Date.now() - new Date(r.created_date || 0).getTime();
        return age > retentionDays * 24 * 60 * 60 * 1000;
      });

      report.per_entity.push({
        entity_type: entityType,
        total_records: records.length,
        keeping: toKeep.length,
        to_remove: toRemove.length,
        oldest_kept: toKeep.length > 0 ? toKeep[toKeep.length - 1]?.created_date : null,
        newest_removed: toRemove.length > 0 ? toRemove[0]?.created_date : null,
      });
      report.total_before += records.length;
      report.total_to_remove += toRemove.length;
      report.total_after += toKeep.length;

      // Execute deletion if action is "execute"
      if (action === "execute" && toRemove.length > 0) {
        // Delete in batches to avoid timeout
        for (let i = 0; i < toRemove.length; i += 50) {
          const batch = toRemove.slice(i, i + 50);
          for (const r of batch) {
            try {
              await base44.asServiceRole.entities.SyncReconciliation.delete(r.id);
            } catch (e) {
              console.warn(`Failed to delete reconciliation record ${r.id}:`, e.message);
            }
          }
        }
      }
    }

    return Response.json({
      success: true,
      ...report,
      executed: action === "execute",
      note: action === "preview"
        ? "Preview only — no records deleted. Run with action='execute' to apply."
        : `Deleted ${report.total_to_remove} records. ${report.total_after} records retained.`,
    });
  } catch (error) {
    console.error("manageReconciliationRetention error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}