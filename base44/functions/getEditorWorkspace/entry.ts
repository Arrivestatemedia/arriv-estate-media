import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { calculateSlaStatus } from '../../shared/packageEditingConfig.ts';

/**
 * Returns the editor's personal workspace data:
 * - Their editor profile (resolved by employee email)
 * - Assigned tasks (assigned, editing, revision_required, submitted_for_qc)
 * - Available unassigned tasks (ready_for_editing) they're qualified for
 * - Active time session (if any)
 * - Completed work (delivered tasks, this week)
 */
Deno.serve(async (req) => {
  try {
    // Read body FIRST as text (clone can fail in some runtimes)
    let body = {};
    try {
      const bodyText = await req.text();
      if (bodyText) body = JSON.parse(bodyText);
    } catch (e) { /* empty body */ }
    const salesEmail = body.email || null;

    const base44 = createClientFromRequest(req);

    // Resolve current user — supports both platform auth and SalesLogin custom auth
    let platformEmail = null;
    let userId = null;
    try {
      const user = await base44.auth.me();
      if (user) {
        platformEmail = user.email;
        userId = user.id;
      }
    } catch (e) { /* not logged in via platform auth */ }

    if (!userId && body.employee_id) userId = body.employee_id;
    const salesMemberId = body.sales_member_id || null;

    // Try all available emails (platform email may differ from sales email used to create the profile)
    const emailsToTry = [platformEmail, salesEmail].filter(Boolean);

    // Case-insensitive email matching: list all profiles and match by lowercased email
    const allProfiles = await base44.asServiceRole.entities.EditorProfile.list('-created_date', 500);

    let profile = null;

    // 1) Direct match by sales_member_id → employee_id
    if (salesMemberId) {
      profile = allProfiles.find((p) => p.employee_id === salesMemberId);
    }

    // 2) Match by email (case-insensitive)
    if (!profile && emailsToTry.length > 0) {
      const lowerEmails = emailsToTry.map((e) => e.toLowerCase());
      profile = allProfiles.find((p) =>
        p.employee_email && lowerEmails.includes(p.employee_email.toLowerCase())
      );
    }

    // 3) Fallback: look up SalesTeamMember by email, then find EditorProfile by employee_id
    if (!profile && emailsToTry.length > 0) {
      const allMembers = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
      const lowerEmails = emailsToTry.map((e) => e.toLowerCase());
      const matchedMember = allMembers.find((m) =>
        m.email && lowerEmails.includes(m.email.toLowerCase())
      );
      if (matchedMember) {
        profile = allProfiles.find((p) => p.employee_id === matchedMember.id);
      }
    }

    if (!profile) {
      return Response.json({
        success: true,
        editor_profile: null,
        message: 'No editor profile found for this user. An admin must create an editor profile for you.',
        my_tasks: [],
        available_tasks: [],
        completed_tasks: [],
        active_session: null,
      });
    }

    // Fetch all tasks
    const allTasks = await base44.asServiceRole.entities.EditingTask.list('-created_date', 5000);

    // Update SLA for active tasks
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

    // My tasks (assigned to this editor, not yet delivered)
    const myActiveStatuses = ['assigned', 'editing', 'revision_required', 'submitted_for_qc', 'approved'];
    const myTasks = allTasks.filter(
      (t) => t.editor_id === profile.id && myActiveStatuses.includes(t.status)
    );

    // Available tasks (ready_for_editing, unassigned, editor has required capability)
    const verified = profile.verified_editor_capabilities || [];
    const availableTasks = allTasks.filter((t) => {
      if (t.status !== 'ready_for_editing') return false;
      if (t.editor_id) return false; // already assigned
      const required = t.required_editor_capabilities || [];
      return required.every((cap) => verified.includes(cap));
    });

    // Completed work (delivered, this week)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const completedTasks = allTasks.filter(
      (t) => t.editor_id === profile.id && t.status === 'delivered' &&
      t.delivered_at && new Date(t.delivered_at) >= weekAgo
    );

    // Active time session
    const activeSessions = await base44.asServiceRole.entities.EditingTimeSession.filter({
      editor_id: profile.id,
      session_status: 'active',
    });
    const activeSession = activeSessions && activeSessions.length > 0 ? activeSessions[0] : null;

    // Weekly hours
    const weeklyMinutes = completedTasks.reduce((sum, t) => sum + (t.active_editing_minutes || 0), 0);

    return Response.json({
      success: true,
      editor_profile: profile,
      my_tasks: myTasks,
      available_tasks: availableTasks,
      completed_tasks: completedTasks,
      active_session: activeSession,
      weekly_hours: Math.round((weeklyMinutes / 60) * 10) / 10,
      weekly_minutes: weeklyMinutes,
    });
  } catch (error) {
    console.error('getEditorWorkspace error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});