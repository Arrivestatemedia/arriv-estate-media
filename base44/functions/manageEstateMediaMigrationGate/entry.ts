// Admin-only migration safety gate management.
// Historical migration requires BOTH:
//   1. sync_mode = "migration"
//   2. migration_authorized = true
// Test mode alone NEVER allows historical migration.
//
// This function is the ONLY way to set migration_authorized = true.
// It requires explicit admin action and records who authorized it and when.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ error: "No tenant config" }, { status: 400 });

    if (action === "authorize_migration") {
      // Authorize historical migration — sets migration_authorized = true
      // and advances sync_mode to "migration" if currently in "test".
      // Does NOT enable active production sync (that requires a separate action to set mode to "active").
      const reason = body.reason || "Historical migration authorized by admin";
      const update = {
        migration_authorized: true,
        migration_authorized_at: new Date().toISOString(),
        migration_authorized_by: user.email,
        arriv_one_sync_mode: cfg.arriv_one_sync_mode === "test" ? "migration" : cfg.arriv_one_sync_mode,
      };
      await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, update);
      return Response.json({
        success: true,
        action: "authorize_migration",
        migration_authorized: true,
        sync_mode: update.arriv_one_sync_mode,
        authorized_by: user.email,
        authorized_at: update.migration_authorized_at,
        reason,
      });
    }

    if (action === "deauthorize_migration") {
      // Revoke historical migration authorization
      const update = {
        migration_authorized: false,
        migration_authorized_at: null,
        migration_authorized_by: null,
        arriv_one_sync_mode: "test", // revert to test mode
        migration_batch_pointer: null,
      };
      await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, update);
      return Response.json({
        success: true,
        action: "deauthorize_migration",
        migration_authorized: false,
        sync_mode: "test",
      });
    }

    if (action === "get_gate_status") {
      return Response.json({
        success: true,
        migration_authorized: cfg.migration_authorized || false,
        migration_authorized_at: cfg.migration_authorized_at || null,
        migration_authorized_by: cfg.migration_authorized_by || null,
        sync_mode: cfg.arriv_one_sync_mode,
        sync_enabled: cfg.arriv_one_sync_enabled,
        migration_batch_pointer: cfg.migration_batch_pointer || null,
        gate_locked: !(cfg.migration_authorized === true && cfg.arriv_one_sync_mode === "migration"),
      });
    }

    if (action === "set_batch_pointer") {
      // Update the migration batch pointer for resumable migration
      const pointer = body.pointer || null;
      await base44.asServiceRole.entities.ArrivOneTenantConfig.update(cfg.id, {
        migration_batch_pointer: pointer,
      });
      return Response.json({ success: true, migration_batch_pointer: pointer });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("manageEstateMediaMigrationGate error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}