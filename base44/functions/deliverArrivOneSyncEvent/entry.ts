import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { signEnvelope, SCHEMA_VERSION } from "../../shared/syncEnvelope.ts";
import { getTenantConfig } from "../../shared/syncTenantConfig.ts";

const OUTBOUND_SECRET = "ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET";

const BACKOFF_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]; // immediate, +1m, +5m, +30m, +2h
const MAX_ATTEMPTS = 5;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const outboxId = body?.outbox_id;

    if (!outboxId) return Response.json({ error: "outbox_id required" }, { status: 400 });

    const outboxRecords = await base44.asServiceRole.entities.SyncOutbox.filter({ id: outboxId });
    if (!outboxRecords || outboxRecords.length === 0) {
      return Response.json({ error: "Outbox record not found" }, { status: 404 });
    }
    const outbox = outboxRecords[0];

    if (outbox.delivery_status === "delivered" || outbox.suppressed) {
      return Response.json({ success: true, skipped: true, reason: "Already delivered or suppressed" });
    }

    const cfg = await getTenantConfig(base44);
    if (!cfg || !cfg.arriv_one_sync_endpoint) {
      return Response.json({ error: "No sync endpoint configured" }, { status: 503 });
    }

    // Build the full envelope from the outbox record
    const envelope = {
      event_id: outbox.event_id,
      event_type: outbox.event_type,
      schema_version: outbox.schema_version || SCHEMA_VERSION,
      source_application: outbox.source_application,
      destination_application: outbox.destination_application,
      tenant_id: outbox.tenant_id,
      entity_type: outbox.entity_type,
      entity_id: outbox.entity_id,
      immutable_shared_id: outbox.immutable_shared_id,
      external_mapping_id: outbox.external_mapping_id || "",
      operation: outbox.operation,
      occurred_at: outbox.occurred_at,
      source_updated_at: outbox.source_updated_at,
      record_version: outbox.record_version,
      idempotency_key: outbox.idempotency_key,
      correlation_id: outbox.correlation_id || "",
      causation_id: outbox.causation_id || "",
      origin_event_id: outbox.origin_event_id || "",
      payload: outbox.payload || {},
      signature_timestamp: new Date().toISOString(),
      signature_nonce: crypto.randomUUID().replace(/-/g, "") + Date.now().toString(36),
    };

    // Sign
    const signature = await signEnvelope(envelope, OUTBOUND_SECRET);
    envelope.signature = signature;

    // Deliver
    const response = await fetch(cfg.arriv_one_sync_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });

    if (response.ok) {
      await base44.asServiceRole.entities.SyncOutbox.update(outbox.id, {
        delivery_status: "delivered",
        delivered_at: new Date().toISOString(),
        delivery_attempts: (outbox.delivery_attempts || 0) + 1,
        last_delivery_error: "",
      });
      await logAudit(base44, "outbound_delivered", outbox.entity_type, outbox.entity_id, "success");
      return Response.json({ success: true, delivered: true });
    } else {
      const errText = await response.text();
      return await handleDeliveryFailure(base44, outbox, errText);
    }
  } catch (error) {
    console.error("deliverArrivOneSyncEvent error:", error);
    // Try to update outbox with failure
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      if (body?.outbox_id) {
        const recs = await base44.asServiceRole.entities.SyncOutbox.filter({ id: body.outbox_id });
        if (recs[0]) await handleDeliveryFailure(base44, recs[0], error.message);
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function handleDeliveryFailure(base44, outbox, errorMessage) {
  const attempts = (outbox.delivery_attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await base44.asServiceRole.entities.SyncOutbox.update(outbox.id, {
      delivery_status: "dead_lettered",
      delivery_attempts: attempts,
      last_delivery_error: errorMessage,
    });
    await logAudit(base44, "outbound_dead_lettered", outbox.entity_type, outbox.entity_id, "failure");
    return Response.json({ success: false, dead_lettered: true, error: errorMessage });
  }
  const backoff = BACKOFF_MS[attempts] || BACKOFF_MS[BACKOFF_MS.length - 1];
  const nextAttempt = new Date(Date.now() + backoff).toISOString();
  await base44.asServiceRole.entities.SyncOutbox.update(outbox.id, {
    delivery_status: "failed",
    delivery_attempts: attempts,
    last_delivery_error: errorMessage,
    next_attempt_at: nextAttempt,
  });
  await logAudit(base44, "outbound_delivery_failed", outbox.entity_type, outbox.entity_id, "warning");
  return Response.json({ success: false, queued: true, next_attempt_at: nextAttempt, error: errorMessage });
}

async function logAudit(base44, action, entityType, entityId, result) {
  try {
    await base44.asServiceRole.entities.IntegrationAuditLog.create({
      event_id: crypto.randomUUID(),
      actor: "sync_system",
      action,
      entity_type: entityType,
      entity_id: entityId,
      source_application: "estate_media",
      destination_application: "arriv_one",
      timestamp: new Date().toISOString(),
      result,
    });
  } catch (_) {}
}