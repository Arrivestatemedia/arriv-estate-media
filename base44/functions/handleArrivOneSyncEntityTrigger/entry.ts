import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeSyncOutboxEvent } from "../../shared/syncOutboxWriter.ts";
import { isSyncEnabled, getTenantConfig } from "../../shared/syncTenantConfig.ts";

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
    const body = await req.json();
    // Entity automation payload: { event, data, old_data, changed_fields }
    const eventType = body?.event?.type;
    const entityName = body?.event?.entity_name;
    const entityId = body?.event?.entity_id;
    const data = body?.data;
    const oldData = body?.old_data;
    const changedFields = body?.changed_fields || [];

    if (!entityName || !SHARED_ENTITIES.includes(entityName)) {
      return Response.json({ success: true, skipped: true, reason: "Entity not in shared list" });
    }

    // Skip if sync is disabled
    const enabled = await isSyncEnabled(base44);
    if (!enabled) return Response.json({ success: true, skipped: true, reason: "Sync disabled" });

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ success: true, skipped: true, reason: "No tenant config" });

    // Skip if this write originated from Arriv One (loop prevention)
    if (data?.sync_source === "arriv_one") {
      return Response.json({ success: true, skipped: true, reason: "Loop prevention: sync_source=arriv_one" });
    }

    // Determine operation
    const operation = eventType === "create" ? "create" : eventType === "update" ? "update" : eventType === "delete" ? "delete" : null;
    if (!operation) return Response.json({ success: true, skipped: true, reason: "Unknown event type" });

    // Check for contact ownership change
    let customEventType = null;
    if (entityName === "Contact" && operation === "update" && changedFields.includes("owner_id")) {
      customEventType = "contact.owner_changed";
    }

    // Write to outbox
    const outbox = await writeSyncOutboxEvent(base44, {
      entityType: entityName,
      entityId,
      operation,
      recordVersion: data?.record_version || 1,
      recordData: data,
      occurredAt: new Date().toISOString(),
      sourceUpdatedAt: data?.updated_date || new Date().toISOString(),
      originEventId: data?.origin_event_id || "",
      causationId: "",
      correlationId: "",
      immutableSharedId: data?.immutable_shared_id || "",
    });

    // Attempt immediate delivery if outbox was created
    if (outbox && cfg.arriv_one_sync_endpoint) {
      try {
        await base44.functions.invoke("deliverArrivOneSyncEvent", { outbox_id: outbox.id });
      } catch (e) {
        // Immediate delivery failed — event stays queued for fallback drain
        console.warn("Immediate delivery failed, event queued:", e?.message);
      }
    }

    return Response.json({ success: true, outbox_id: outbox?.id || null });
  } catch (error) {
    console.error("handleArrivOneSyncEntityTrigger error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}