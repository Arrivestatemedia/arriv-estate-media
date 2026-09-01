import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { convertConferenceToAsync } from "../../shared/asyncInterviewMigration.ts";

/**
 * executeAsyncConversionBatch
 *
 * Executes an authorized AsyncInterviewConversionBatch. Called by the
 * scheduled workflow at the authorized execution time (e.g. September 1,
 * 2026 at 7:30 AM ET).
 *
 * This function is IDEMPOTENT: if the batch is already completed or
 * in-progress, it returns the existing results without re-processing.
 * Individual conferences that are already converted are skipped.
 *
 * Body:
 *   batchId — required, the AsyncInterviewConversionBatch ID to execute
 *
 * Returns { status, completed, skipped, results }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { batchId } = body;

    // If no batchId provided, find all due scheduled batches and execute them.
    // This is the mode used by the scheduled workflow.
    if (!batchId) {
      return await executeDueBatches(base44);
    }

    const batch = await base44.asServiceRole.entities.AsyncInterviewConversionBatch.get(batchId);
    if (!batch) {
      return Response.json({ error: "Batch not found" }, { status: 404 });
    }

    // Idempotency: already completed
    if (batch.status === "completed") {
      return Response.json({
        status: "already_completed",
        batchId,
        completedCount: batch.completed_count,
        skippedCount: batch.skipped_count,
        results: batch.results,
        executedAt: batch.executed_at,
      });
    }

    // Idempotency: already in progress (prevent concurrent execution)
    if (batch.status === "in_progress") {
      return Response.json({
        status: "in_progress",
        batchId,
        message: "Batch is already being processed.",
      });
    }

    // Only execute batches that are in 'scheduled' status
    if (batch.status !== "scheduled") {
      return Response.json({
        status: "skipped",
        batchId,
        reason: `Batch status is '${batch.status}' — only 'scheduled' batches execute.`,
      });
    }

    // Safety: do not execute test batches
    if (batch.is_test) {
      return Response.json({
        status: "skipped",
        batchId,
        reason: "Test batches are not executed.",
      });
    }

    // Mark batch as in-progress
    await base44.asServiceRole.entities.AsyncInterviewConversionBatch.update(batchId, {
      status: "in_progress",
    });

    const results = [];
    let completed = 0;
    let skipped = 0;

    for (const confId of batch.conference_ids || []) {
      try {
        const result = await convertConferenceToAsync(base44, {
          conferenceId: confId,
          adminName: batch.authorized_by || "scheduled_batch",
          sendEmail: true, // The scheduled batch IS the authorized send time
          dryRun: false,
        });

        results.push({
          conference_id: confId,
          candidate_name: result.candidateName,
          status: result.status,
          async_session_id: result.asyncSessionId || null,
          interview_url: result.interviewUrl || null,
          expires_at: result.expiresAt || null,
          email_sent: !!result.emailSent,
          previous_scheduled_at: result.previousScheduledAt || null,
          reason: result.reason || null,
        });

        if (result.status === "converted") {
          completed++;
        } else {
          skipped++;
        }
      } catch (err) {
        results.push({
          conference_id: confId,
          status: "error",
          reason: err.message,
        });
        skipped++;
      }
    }

    // Mark batch as completed
    const executedAt = new Date().toISOString();
    await base44.asServiceRole.entities.AsyncInterviewConversionBatch.update(batchId, {
      status: "completed",
      executed_at: executedAt,
      completed_count: completed,
      skipped_count: skipped,
      results,
    });

    return Response.json({
      status: "completed",
      batchId,
      completedCount: completed,
      skippedCount: skipped,
      results,
      executedAt,
    });
  } catch (error) {
    console.error("executeAsyncConversionBatch error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Find all AsyncInterviewConversionBatch records that are due for execution
 * (status "scheduled", scheduled_for <= now, not a test batch) and execute
 * each one. Called by the scheduled workflow when no specific batchId is given.
 */
async function executeDueBatches(base44) {
  const now = new Date();
  const res = await base44.asServiceRole.entities.AsyncInterviewConversionBatch.filter(
    { status: "scheduled" }, "scheduled_for", 50
  );
  const batches = (res?.data ?? res) || [];
  const due = (Array.isArray(batches) ? batches : []).filter(
    b => !b.is_test && b.scheduled_for && new Date(b.scheduled_for) <= now
  );

  if (due.length === 0) {
    return Response.json({
      status: "no_due_batches",
      message: "No scheduled conversion batches are due for execution.",
      checkedAt: now.toISOString(),
    });
  }

  const results = [];
  for (const batch of due) {
    try {
      const batchResult = await executeSingleBatch(base44, batch);
      results.push({ batchId: batch.id, ...batchResult });
    } catch (err) {
      results.push({ batchId: batch.id, status: "error", reason: err.message });
    }
  }

  return Response.json({
    status: "processed",
    batchCount: due.length,
    results,
    executedAt: now.toISOString(),
  });
}

/**
 * Execute a single batch object (extracted from executeDueBatches).
 */
async function executeSingleBatch(base44, batch) {
  // Idempotency: already completed or in progress
  if (batch.status === "completed") {
    return { status: "already_completed", completedCount: batch.completed_count };
  }
  if (batch.status === "in_progress") {
    return { status: "in_progress" };
  }

  await base44.asServiceRole.entities.AsyncInterviewConversionBatch.update(batch.id, {
    status: "in_progress",
  });

  const results = [];
  let completed = 0;
  let skipped = 0;

  for (const confId of batch.conference_ids || []) {
    try {
      const result = await convertConferenceToAsync(base44, {
        conferenceId: confId,
        adminName: batch.authorized_by || "scheduled_batch",
        sendEmail: true,
        dryRun: false,
      });

      results.push({
        conference_id: confId,
        candidate_name: result.candidateName,
        status: result.status,
        async_session_id: result.asyncSessionId || null,
        interview_url: result.interviewUrl || null,
        expires_at: result.expiresAt || null,
        email_sent: !!result.emailSent,
        previous_scheduled_at: result.previousScheduledAt || null,
        reason: result.reason || null,
      });

      if (result.status === "converted") completed++;
      else skipped++;
    } catch (err) {
      results.push({ conference_id: confId, status: "error", reason: err.message });
      skipped++;
    }
  }

  const executedAt = new Date().toISOString();
  await base44.asServiceRole.entities.AsyncInterviewConversionBatch.update(batch.id, {
    status: "completed",
    executed_at: executedAt,
    completed_count: completed,
    skipped_count: skipped,
    results,
  });

  return { status: "completed", completedCount: completed, skippedCount: skipped, executedAt };
}