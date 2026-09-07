import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { calculateSlaStatus } from '../../shared/packageEditingConfig.ts';

/**
 * Returns the full editing queue for the admin/operations dashboard.
 * Includes all editing tasks with SLA status, grouped by status, plus
 * editor profiles and upload-exception jobs.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get('status');
    const editorFilter = url.searchParams.get('editor_id');
    const taskTypeFilter = url.searchParams.get('task_type');

    // Fetch all editing tasks
    const allTasks = await base44.asServiceRole.entities.EditingTask.list('-created_date', 5000);

    // Update SLA status for active tasks (server-authoritative)
    const now = new Date();
    for (const task of allTasks) {
      if (['delivered', 'cancelled'].includes(task.status)) continue;
      const newSla = calculateSlaStatus(task.delivery_deadline);
      if (newSla !== task.sla_status) {
        await base44.asServiceRole.entities.EditingTask.update(task.id, {
          sla_status: newSla,
          updated_at: now.toISOString(),
        });
        task.sla_status = newSla;
      }
    }

    // Apply filters
    let filtered = allTasks;
    if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
    if (editorFilter) filtered = filtered.filter((t) => t.editor_id === editorFilter);
    if (taskTypeFilter) filtered = filtered.filter((t) => t.task_type === taskTypeFilter);

    // Group by status
    const byStatus = {
      waiting_for_upload: allTasks.filter((t) => t.status === 'waiting_for_upload'),
      ready_for_editing: allTasks.filter((t) => t.status === 'ready_for_editing'),
      assigned: allTasks.filter((t) => t.status === 'assigned'),
      editing: allTasks.filter((t) => t.status === 'editing'),
      submitted_for_qc: allTasks.filter((t) => t.status === 'submitted_for_qc'),
      revision_required: allTasks.filter((t) => t.status === 'revision_required'),
      approved: allTasks.filter((t) => t.status === 'approved'),
      delivered: allTasks.filter((t) => t.status === 'delivered'),
      cancelled: allTasks.filter((t) => t.status === 'cancelled'),
    };

    // Fetch editor profiles
    const editors = await base44.asServiceRole.entities.EditorProfile.list('-created_date', 100);

    // Fetch upload-exception jobs (footage_uploaded=false, media_partner_status=job_completed)
    const exceptionJobs = await base44.asServiceRole.entities.Job.filter({
      media_partner_status: 'job_completed',
      footage_uploaded: false,
    });
    const uploadExceptions = exceptionJobs.filter((j) =>
      j.from_booking === true && j.status !== 'completed' && j.status !== 'cancelled'
    );

    return Response.json({
      success: true,
      tasks: filtered,
      by_status: byStatus,
      editors,
      upload_exceptions: uploadExceptions,
      counts: {
        waiting_for_upload: byStatus.waiting_for_upload.length,
        ready_for_editing: byStatus.ready_for_editing.length,
        assigned: byStatus.assigned.length,
        editing: byStatus.editing.length,
        submitted_for_qc: byStatus.submitted_for_qc.length,
        revision_required: byStatus.revision_required.length,
        approved: byStatus.approved.length,
        delivered: byStatus.delivered.length,
        cancelled: byStatus.cancelled.length,
        upload_exceptions: uploadExceptions.length,
        total_active: allTasks.filter((t) => !['delivered', 'cancelled'].includes(t.status)).length,
      },
    });
  } catch (error) {
    console.error('getEditingQueue error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});