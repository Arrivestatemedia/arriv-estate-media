import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const { action, outbox_id, entity_type, entity_id, conflict_id } = body;

    if (action === "retry_outbox" && outbox_id) {
      await base44.asServiceRole.entities.SyncOutbox.update(outbox_id, {
        delivery_status: "pending",
        next_attempt_at: new Date().toISOString(),
        last_delivery_error: "",
      });
      const result = await base44.functions.invoke("deliverArrivOneSyncEvent", { outbox_id });
      return Response.json({ success: true, result: result?.data });
    }

    if (action === "rebuild_mapping" && entity_type && entity_id) {
      // Find existing mapping
      const mappings = await base44.asServiceRole.entities.CrossAppRecordMapping.filter({
        entity_type,
        local_record_id: entity_id,
      });
      if (mappings[0]) {
        await base44.asServiceRole.entities.CrossAppRecordMapping.update(mappings[0].id, {
          sync_status: "linked",
          error_state: "",
        });
        return Response.json({ success: true, mapping_id: mappings[0].id });
      }
      return Response.json({ error: "Mapping not found" }, { status: 404 });
    }

    if (action === "resolve_conflict" && conflict_id) {
      const { resolution, notes } = body;
      await base44.asServiceRole.entities.SyncConflict.update(conflict_id, {
        status: resolution || "resolved_merge",
        resolution_notes: notes || "",
        resolved_by: user.email,
        resolved_at: new Date().toISOString(),
      });
      return Response.json({ success: true });
    }

    if (action === "sync_manifests_now") {
      const result = await base44.functions.invoke("syncArrivOneProductManifestsNow", {});
      return Response.json({ success: true, result: result?.data });
    }

    if (action === "run_reconciliation") {
      const result = await base44.functions.invoke("runEstateMediaSyncReconciliation", {});
      return Response.json({ success: true, result: result?.data });
    }

    if (action === "validate_config") {
      const result = await base44.functions.invoke("validateArrivOneSyncConfig", body?.validation_params || {});
      return Response.json({ success: true, result: result?.data });
    }

    if (action === "create_test_event") {
      const result = await base44.functions.invoke("createArrivOneTestEvent", {
        mode: body?.mode || "emit",
        entity_type: body?.entity_type || "Contact",
        operation: body?.operation || "create",
        payload: body?.payload,
      });
      return Response.json({ success: true, result: result?.data });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("manageSyncAdminAction error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}