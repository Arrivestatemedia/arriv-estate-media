import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { EDITOR_CAPABILITIES, EDITOR_CAPABILITY_LABELS } from '../../shared/packageEditingConfig.ts';

/**
 * Manage editor profiles — create, update capabilities, activate/deactivate.
 * Editors are Arriv employees (SalesTeamMember records) with verified editing capabilities.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { action, employee_id, declared_capabilities, verified_capabilities, editor_status, max_weekly_hours, hourly_wage } = body;

    switch (action) {
      case 'create': {
        if (!employee_id) return Response.json({ error: 'employee_id is required' }, { status: 400 });

        // Look up the employee
        const employee = await base44.asServiceRole.entities.SalesTeamMember.get(employee_id);
        if (!employee) return Response.json({ error: 'Employee not found' }, { status: 404 });

        // Check if profile already exists
        const existing = await base44.asServiceRole.entities.EditorProfile.filter({ employee_id });
        if (existing && existing.length > 0) {
          return Response.json({ error: 'Editor profile already exists for this employee', profile: existing[0] }, { status: 400 });
        }

        const now = new Date().toISOString();
        const profile = await base44.asServiceRole.entities.EditorProfile.create({
          tenant_id: 'tnt_estate_media',
          employee_id,
          employee_email: employee.email,
          employee_name: employee.full_name,
          declared_editor_capabilities: declared_capabilities || [],
          verified_editor_capabilities: verified_capabilities || [],
          editor_status: editor_status || 'active',
          max_weekly_hours: max_weekly_hours || 32,
          hourly_wage: hourly_wage || null,
          created_at: now,
          updated_at: now,
        });

        return Response.json({ success: true, profile });
      }

      case 'update': {
        const { profile_id } = body;
        if (!profile_id) return Response.json({ error: 'profile_id is required' }, { status: 400 });

        const existing = await base44.asServiceRole.entities.EditorProfile.get(profile_id);
        if (!existing) return Response.json({ error: 'Editor profile not found' }, { status: 404 });

        const updateData: any = { updated_at: new Date().toISOString() };
        if (declared_capabilities !== undefined) updateData.declared_editor_capabilities = declared_capabilities;
        if (verified_capabilities !== undefined) updateData.verified_editor_capabilities = verified_capabilities;
        if (editor_status !== undefined) updateData.editor_status = editor_status;
        if (max_weekly_hours !== undefined) updateData.max_weekly_hours = max_weekly_hours;
        if (hourly_wage !== undefined) updateData.hourly_wage = hourly_wage;

        const updated = await base44.asServiceRole.entities.EditorProfile.update(profile_id, updateData);
        return Response.json({ success: true, profile: updated });
      }

      case 'list': {
        const profiles = await base44.asServiceRole.entities.EditorProfile.list('-created_date', 100);
        return Response.json({ success: true, profiles, available_capabilities: EDITOR_CAPABILITIES, capability_labels: EDITOR_CAPABILITY_LABELS });
      }

      case 'list_employees': {
        // List all SalesTeamMember records that could be editors
        const employees = await base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500);
        const profiles = await base44.asServiceRole.entities.EditorProfile.list('-created_date', 100);
        const profileEmployeeIds = new Set(profiles.map((p) => p.employee_id));
        const unassigned = employees.filter((e) => !profileEmployeeIds.has(e.id));
        return Response.json({ success: true, unassigned_employees: unassigned, existing_profiles: profiles });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('manageEditorProfile error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});