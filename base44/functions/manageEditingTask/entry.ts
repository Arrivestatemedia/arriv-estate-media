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
    // Read body FIRST — use clone to avoid stream consumption issues with platform middleware
    let body = {};
    try {
      const bodyText = await req.clone().text();
      if (bodyText) body = JSON.parse(bodyText);
    } catch (e) { /* empty body */ }

    // Also check query params (fallback if body is consumed by middleware)
    const url = new URL(req.url);
    const queryEmail = url.searchParams.get('email');
    const querySalesMemberId = url.searchParams.get('sales_member_id');

    const base44 = createClientFromRequest(req);

    // Check platform auth role first
    let platformEmail = null;
    let platformUserId = null;
    let isPlatformAdmin = false;
    try {
      const user = await base44.auth.me();
      if (user) {
        platformEmail = user.email;
        platformUserId = user.id;
        isPlatformAdmin = user.role === 'admin';
      }
    } catch (e) { /* not logged in via platform auth */ }

    // If not platform admin, check SalesTeamMember role (by email or ID)
    let actor = platformUserId;
    let actorEmail = platformEmail;

    if (!isPlatformAdmin) {
      const salesEmail = body.email || queryEmail || platformEmail;
      const salesMemberId = body.sales_member_id || querySalesMemberId;
      let member = null;
      if (salesEmail || salesMemberId) {
        const members = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
        if (salesMemberId) {
          member = members.find((m) => m.id === salesMemberId);
        }
        if (!member && salesEmail) {
          member = members.find((m) =>
            m.email && m.email.toLowerCase() === salesEmail.toLowerCase()
          );
        }
      }
      if (member && member.role === 'admin') {
        // authorized via SalesTeamMember admin role
        if (!actor) actor = member.id;
        if (!actorEmail) actorEmail = member.email;
      } else {
        return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
      }
    }

    const { action, task_id, editor_profile_id, final_media_location, qc_notes, revision_reason, new_active_minutes, reason } = body;

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