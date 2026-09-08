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

    const salesEmail = body.email || queryEmail || null;
    const salesMemberIdFromBody = body.sales_member_id || querySalesMemberId || null;

    console.error('getEditorWorkspace body:', JSON.stringify(body), 'query:', { queryEmail, querySalesMemberId });

    const base44 = createClientFromRequest(req);

    // Resolve current user — supports both platform auth and SalesLogin custom auth
    let platformEmail = null;
    let userId = null;
    try {
      const user = await base44.auth.me();
      if (user) {
        platformEmail = user.email;
        userId = user.id;
        console.error('getEditorWorkspace auth.me success:', platformEmail);
      }
    } catch (e) { console.error('getEditorWorkspace auth.me failed:', e.message); }

    if (!userId && body.employee_id) userId = body.employee_id;
    const salesMemberId = salesMemberIdFromBody;

    console.error('getEditorWorkspace resolving:', { salesMemberId, salesEmail, platformEmail });

    // Try all available emails (platform email may differ from sales email used to create the profile)
    const emailsToTry = [platformEmail, salesEmail].filter(Boolean);

    // Case-insensitive email matching: list all profiles and match by lowercased email
    const allProfiles = await base44.asServiceRole.entities.EditorProfile.list('-created_date', 500);

    let profile = null;

    // 1) Direct match by sales_member_id → employee_id
    if (salesMemberId) {
      profile = allProfiles.find((p) => p.employee_id === salesMemberId);
      console.error('getEditorWorkspace match by salesMemberId:', salesMemberId, '→', profile ? profile.id : 'NOT FOUND');
    }

    // 2) Match by email (case-insensitive)
    if (!profile && emailsToTry.length > 0) {
      const lowerEmails = emailsToTry.map((e) => e.toLowerCase());
      profile = allProfiles.find((p) =>
        p.employee_email && lowerEmails.includes(p.employee_email.toLowerCase())
      );
      console.error('getEditorWorkspace match by email:', emailsToTry, '→', profile ? profile.id : 'NOT FOUND');
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
        console.error('getEditorWorkspace match via SalesTeamMember:', matchedMember.email, '→', profile ? profile.id : 'NOT FOUND');
      }
    }

    // 4) NUCLEAR FALLBACK: if no profile found and this is an admin, find the admin's EditorProfile
    if (!profile) {
      console.error('getEditorWorkspace NO PROFILE FOUND. Trying admin fallback...');
      const allMembers = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
      // Try to find any SalesTeamMember with role 'admin' that has an EditorProfile
      for (const m of allMembers) {
        if (m.role === 'admin') {
          const adminProfile = allProfiles.find((p) => p.employee_id === m.id);
          if (adminProfile) {
            // Only use this if the email matches one of our emailsToTry
            const adminEmail = m.email || adminProfile.employee_email;
            if (emailsToTry.some(e => e.toLowerCase() === adminEmail.toLowerCase())) {
              profile = adminProfile;
              console.error('getEditorWorkspace admin fallback match:', adminEmail, '→', profile.id);
              break;
            }
          }
        }
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