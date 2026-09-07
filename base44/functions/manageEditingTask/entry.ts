import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  assignEditingTask,
  startEditing,
  pauseEditing,
  submitForQc,
  approveQc,
  requestRevision,
  deliverTask,
  cancelEditingTask,
  correctTimeRecord,
  writeAudit,
} from '../../shared/editingQueueEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { action, task_id, editor_profile_id, final_media_location, qc_notes, revision_reason, new_active_minutes, reason } = body;

    const actor = user.id;
    const actorEmail = user.email;

    let result;

    switch (action) {
      case 'assign':
        result = await assignEditingTask(base44, task_id, editor_profile_id, actor, actorEmail);
        break;
      case 'start_editing':
        result = await startEditing(base44, task_id, editor_profile_id, actor, actorEmail);
        break;
      case 'pause_editing':
        result = await pauseEditing(base44, task_id, editor_profile_id, actor, actorEmail);
        break;
      case 'submit_for_qc':
        result = await submitForQc(base44, task_id, editor_profile_id, final_media_location, actor, actorEmail);
        break;
      case 'approve_qc':
        result = await approveQc(base44, task_id, actor, actorEmail, qc_notes);
        break;
      case 'request_revision':
        result = await requestRevision(base44, task_id, actor, actorEmail, revision_reason);
        break;
      case 'deliver':
        result = await deliverTask(base44, task_id, actor, actorEmail);
        break;
      case 'cancel':
        result = await cancelEditingTask(base44, task_id, actor, actorEmail, reason);
        break;
      case 'correct_time':
        result = await correctTimeRecord(base44, task_id, new_active_minutes, actor, actorEmail, reason);
        break;
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('manageEditingTask error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});