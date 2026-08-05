import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeSyncOutboxEvent } from "../../shared/syncOutboxWriter.ts";
import { isSyncEnabled, getTenantConfig } from "../../shared/syncTenantConfig.ts";
import { toCanonicalEntityType, isEntitySyncReady, ENTITY_ADAPTERS } from "../../shared/syncEntityAdapters.ts";

// Estate Media local entity names that are sync-enabled (active adapters only)
const SYNC_ENABLED_LOCAL_ENTITIES = Object.values(ENTITY_ADAPTERS)
  .filter((a) => a.status === "active")
  .map((a) => a.estate_media_local);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    // Entity automation payload: { event, data, old_data, changed_fields }
    const eventType = body?.event?.type;
    const entityName = body?.event?.entity_name;
    const entityId = body?.event?.entity_id;
    const data = body?.data;
    const changedFields = body?.changed_fields || [];

    if (!entityName || !SYNC_ENABLED_LOCAL_ENTITIES.includes(entityName)) {
      return Response.json({ success: true, skipped: true, reason: "Entity not in sync-enabled list" });
    }

    // Skip if sync is disabled
    const enabled = await isSyncEnabled(base44);
    if (!enabled) return Response.json({ success: true, skipped: true, reason: "Sync disabled" });

    const cfg = await getTenantConfig(base44);
    if (!cfg) return Response.json({ success: true, skipped: true, reason: "No tenant config" });

    // Skip if this write originated from Arriv One (loop prevention)
    // sync_source is set to "arriv_one" by the inbound handler. A later legitimate
    // local edit overwrites sync_source (to "estate_media" or undefined), so this
    // check only suppresses the immediate echo, not subsequent legitimate edits.
    if (data?.sync_source === "arriv_one") {
      return Response.json({ success: true, skipped: true, reason: "Loop prevention: sync_source=arriv_one" });
    }

    // Translate to canonical and check sync-ready
    const canonicalType = toCanonicalEntityType(entityName);
    if (!isEntitySyncReady(canonicalType)) {
      return Response.json({ success: true, skipped: true, reason: "Entity not sync-ready" });
    }

    // Determine operation
    const operation = eventType === "create" ? "create" : eventType === "update" ? "update" : eventType === "delete" ? "delete" : null;
    if (!operation) return Response.json({ success: true, skipped: true, reason: "Unknown event type" });

    // Write to outbox (writer handles canonical translation, field authority, signing)
    const outbox = await writeSyncOutboxEvent(base44, {
      localEntityType: entityName,
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
      changedFields,
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