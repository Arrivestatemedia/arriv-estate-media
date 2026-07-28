import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { startOrientation } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let actor = 'system';
    try {
      const u = await base44.auth.me();
      if (u) {
        if (u.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
        actor = u.email;
      }
    } catch (e) { /* automation / unauthenticated — system role */ }
    const salesMemberId = body.sales_member_id || (body.data && body.data.id) || (body.event && body.event.entity_id);
    if (!salesMemberId) return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    const members = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: salesMemberId });
    const member = members && members[0];
    if (!member) return Response.json({ error: 'Sales team member not found' }, { status: 404 });
    if (!member.arriv_employee_id) return Response.json({ error: 'Employee has no ARRIV_EMPLOYEE_ID (activate first)' }, { status: 400 });
    const orientation = await startOrientation(base44, member, { application_id: body.application_id, deadline: body.deadline, expected_first_payroll_date: body.expected_first_payroll_date, actor });
    return Response.json({ success: true, orientation_id: orientation.orientation_id || orientation.id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});