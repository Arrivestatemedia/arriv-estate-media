import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { runSyncAttempt } from "../../shared/payrollEmployeeSync.ts";

// Scheduled processor: retries queued/failed employee syncs with exponential backoff.
// Max 5 attempts; non-retryable errors are never retried.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Pull queue records that are due for another attempt and still retryable.
    const nowIso = new Date().toISOString();
    const due = await base44.asServiceRole.entities.EmployeeSyncQueue.filter({
      processing_status: "failed",
      non_retryable: false,
    }, "-last_attempt_at", 50);

    const processed = [];
    for (const record of due || []) {
      const max = record.max_attempts || 5;
      if ((record.attempt_count || 0) >= max) continue;
      if (record.next_attempt_at && new Date(record.next_attempt_at) > new Date(nowIso)) continue;

      // Supersede older queued records for the same employee — keep only the latest.
      const newer = await base44.asServiceRole.entities.EmployeeSyncQueue.filter({
        arriv_employee_id: record.arriv_employee_id,
        processing_status: "queued",
      }, "-event_timestamp", 20);
      if (newer && newer.length) {
        await base44.asServiceRole.entities.EmployeeSyncQueue.update(record.id, {
          processing_status: "superseded",
          completed_timestamp: nowIso,
          supersedes_sync_id: newer[0].sync_id,
        });
        continue;
      }

      const result = await runSyncAttempt(base44, record);
      processed.push({ sync_id: record.sync_id, ok: result.ok, terminal: result.terminal });
    }

    // Also immediately run any freshly-queued records (first attempt) that never ran.
    const queued = await base44.asServiceRole.entities.EmployeeSyncQueue.filter({
      processing_status: "queued",
    }, "-event_timestamp", 50);
    for (const record of queued || []) {
      if ((record.attempt_count || 0) > 0) continue;
      const result = await runSyncAttempt(base44, record);
      processed.push({ sync_id: record.sync_id, ok: result.ok, terminal: result.terminal });
    }

    return Response.json({ success: true, processed: processed.length, results: processed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});