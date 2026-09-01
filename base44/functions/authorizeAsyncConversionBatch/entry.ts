import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * authorizeAsyncConversionBatch
 *
 * Creates an AsyncInterviewConversionBatch record using the service role,
 * bypassing RLS so sales admins (who may not have a Base44 platform "admin"
 * role) can authorize the scheduled migration from the UI.
 *
 * Body:
 *   batch_name             — human-readable name
 *   conference_ids         — array of Conference IDs to convert
 *   excluded_conference_ids — array of Conference IDs explicitly excluded
 *   scheduled_for          — ISO datetime when the batch should execute
 *   authorized_by          — name/id of the admin authorizing
 *   total_count            — number of candidates approved
 *
 * Returns the created batch record.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      batch_name,
      conference_ids,
      excluded_conference_ids,
      scheduled_for,
      authorized_by,
      total_count,
    } = body;

    if (!Array.isArray(conference_ids) || conference_ids.length === 0) {
      return Response.json(
        { error: "conference_ids must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!scheduled_for) {
      return Response.json(
        { error: "scheduled_for is required" },
        { status: 400 }
      );
    }

    const batch = await base44.asServiceRole.entities.AsyncInterviewConversionBatch.create({
      batch_name: batch_name || `Scheduled Interview Migration — ${new Date().toLocaleDateString()}`,
      conference_ids,
      excluded_conference_ids: excluded_conference_ids || [],
      status: "scheduled",
      scheduled_for,
      authorized_by: authorized_by || "admin",
      authorized_at: new Date().toISOString(),
      total_count: total_count || conference_ids.length,
      completed_count: 0,
      skipped_count: 0,
      is_test: false,
    });

    return Response.json(batch);
  } catch (error) {
    console.error("authorizeAsyncConversionBatch error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});