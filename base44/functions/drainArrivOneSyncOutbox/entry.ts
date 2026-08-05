import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { getTenantConfig, isTestMode } from "../../shared/syncTenantConfig.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const batchSize = body?.batch_size || 20;

    // Check if we're in test mode — if so, only drain test-marked events
    const cfg = await getTenantConfig(base44);
    const testMode = isTestMode(cfg);

    // Find pending or failed outbox events that are ready for retry
    const now = new Date().toISOString();
    const pending = await base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "pending" }, "-created_date", batchSize);
    const failed = await base44.asServiceRole.entities.SyncOutbox.filter({ delivery_status: "failed" }, "-next_attempt_at", batchSize);

    const isTestRecord = (r) => r?.payload?._test === true || r?.payload?._test_record === true;

    let toProcess = [
      ...pending.filter(r => !r.suppressed),
      ...failed.filter(r => !r.suppressed && r.next_attempt_at && new Date(r.next_attempt_at).getTime() <= Date.now()),
    ];

    // Test-mode gating: in test mode, only process test-marked outbox events.
    // Production events are left in the queue (not delivered) until mode is advanced.
    if (testMode) {
      toProcess = toProcess.filter(isTestRecord);
    }

    toProcess = toProcess.slice(0, batchSize);

    let delivered = 0;
    let queued = 0;
    let deadLettered = 0;

    for (const outbox of toProcess) {
      try {
        const result = await base44.functions.invoke("deliverArrivOneSyncEvent", { outbox_id: outbox.id });
        if (result?.data?.delivered) delivered++;
        else if (result?.data?.dead_lettered) deadLettered++;
        else queued++;
      } catch (e) {
        queued++;
      }
    }

    return Response.json({
      success: true,
      processed: toProcess.length,
      delivered,
      queued,
      dead_lettered: deadLettered,
    });
  } catch (error) {
    console.error("drainArrivOneSyncOutbox error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}