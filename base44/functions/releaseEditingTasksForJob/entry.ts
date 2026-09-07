import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { releaseEditingTasksForJob, releaseEditingTasksForCategory, ensureEditingTasksForJob } from '../../shared/editingQueueEngine.ts';

/**
 * Release editing tasks for a job when source media (footage) is confirmed uploaded.
 * Can be called:
 *   - From autoCompleteJobsWithFootage after setting footage_uploaded=true
 *   - From a scheduled workflow that checks for newly-uploaded jobs
 *   - Manually by an admin
 *
 * Also ensures editing tasks exist for the job (idempotent creation).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { job_id, source_media_location, create_if_missing, category } = body;

    if (!job_id) {
      return Response.json({ error: 'job_id is required' }, { status: 400 });
    }

    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Ensure tasks exist (idempotent)
    if (create_if_missing !== false) {
      await ensureEditingTasksForJob(base44, job, user.email);
    }

    // Release tasks from WAITING_FOR_UPLOAD → READY_FOR_EDITING
    // If category is specified, only release tasks matching that category (+ 'all')
    const result = category
      ? await releaseEditingTasksForCategory(
          base44,
          job_id,
          category,
          source_media_location || job.google_drive_folder_url,
          user.email
        )
      : await releaseEditingTasksForJob(
          base44,
          job_id,
          source_media_location || job.google_drive_folder_url,
          user.email
        );

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('releaseEditingTasksForJob error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});