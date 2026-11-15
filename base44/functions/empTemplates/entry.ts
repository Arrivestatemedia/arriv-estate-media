/**
 * empTemplates — company and personal email templates.
 *
 * Company templates are admin-managed and visible to everyone. Personal
 * templates are private to their owner; another employee can never edit or
 * delete them, and an administrator cannot read them either.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolveActor, resolveTargetMember, audit } from '../../shared/empComm/access.ts';
import { tenantFor } from '../../shared/empComm/tenant.ts';

const asList = (v: any) => (Array.isArray(v) ? v : v?.items || []);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');

    const actorResult = await resolveActor(base44, req, body);
    if (!actorResult.ok) return Response.json({ error: actorResult.error }, { status: actorResult.status });
    const actor = actorResult.actor;

    const target = await resolveTargetMember(base44, actor, body.memberId);
    if (!target.ok) return Response.json({ error: target.error }, { status: target.status });
    const tenant = tenantFor(target.member);

    if (action === 'list') {
      const rows = await base44.asServiceRole.entities.EmployeeEmailTemplate
        .filter({ tenant_id: tenant, active: true }, { sort: '-updated_date', limit: 200 })
        .catch(() => []);
      const visible = asList(rows).filter(
        (row: any) => row.scope === 'company' || row.owner_member_id === target.memberId
      );
      return Response.json({
        templates: visible.map((row: any) => ({
          id: row.id,
          scope: row.scope,
          name: row.name,
          category: row.category || '',
          subject: row.subject,
          body_html: row.body_html || '',
          variables: row.variables || [],
          mine: row.owner_member_id === target.memberId,
        })),
        can_manage_company: actor.isAdmin,
      });
    }

    if (action === 'save') {
      const template = body.template || {};
      const scope = template.scope === 'company' ? 'company' : 'personal';
      if (!String(template.name || '').trim()) return Response.json({ error: 'Give the template a name.' }, { status: 400 });
      if (!String(template.subject || '').trim()) return Response.json({ error: 'Add a subject line.' }, { status: 400 });

      if (scope === 'company' && !actor.isAdmin) {
        return Response.json({ error: 'Only a company administrator can manage company templates.' }, { status: 403 });
      }

      const payload = {
        tenant_id: tenant,
        scope,
        owner_member_id: scope === 'personal' ? target.memberId : '',
        name: String(template.name).trim(),
        category: String(template.category || '').trim(),
        subject: String(template.subject),
        body_html: String(template.body_html || ''),
        variables: Array.isArray(template.variables) ? template.variables : [],
        active: true,
        updated_by: actor.email,
      };

      if (template.id) {
        const existing = asList(
          await base44.asServiceRole.entities.EmployeeEmailTemplate.filter({ id: template.id, tenant_id: tenant }, { limit: 1 })
        )[0];
        if (!existing) return Response.json({ error: 'That template was not found.' }, { status: 404 });
        if (existing.scope === 'company' && !actor.isAdmin) {
          return Response.json({ error: 'Only a company administrator can edit company templates.' }, { status: 403 });
        }
        if (existing.scope === 'personal' && existing.owner_member_id !== target.memberId) {
          return Response.json({ error: 'Another employee owns that template.' }, { status: 403 });
        }
        const saved = await base44.asServiceRole.entities.EmployeeEmailTemplate.update(existing.id, payload);
        await audit(base44, {
          action: 'template_save',
          actor_member_id: actor.memberId,
          target: payload.name,
          result: 'success',
        });
        return Response.json({ success: true, template: saved });
      }

      const created = await base44.asServiceRole.entities.EmployeeEmailTemplate.create({
        ...payload,
        created_by: actor.email,
      });
      await audit(base44, {
        action: 'template_save',
        actor_member_id: actor.memberId,
        target: payload.name,
        result: 'success',
      });
      return Response.json({ success: true, template: created });
    }

    if (action === 'delete') {
      if (!body.id) return Response.json({ error: 'id is required' }, { status: 400 });
      const existing = asList(
        await base44.asServiceRole.entities.EmployeeEmailTemplate.filter({ id: body.id, tenant_id: tenant }, { limit: 1 })
      )[0];
      if (!existing) return Response.json({ error: 'That template was not found.' }, { status: 404 });
      if (existing.scope === 'company' && !actor.isAdmin) {
        return Response.json({ error: 'Only a company administrator can delete company templates.' }, { status: 403 });
      }
      if (existing.scope === 'personal' && existing.owner_member_id !== target.memberId) {
        return Response.json({ error: 'Another employee owns that template.' }, { status: 403 });
      }
      await base44.asServiceRole.entities.EmployeeEmailTemplate.delete(existing.id);
      await audit(base44, {
        action: 'template_delete',
        actor_member_id: actor.memberId,
        target: existing.name,
        result: 'success',
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[empTemplates]', error?.message);
    return Response.json({ error: error?.message || 'The template request could not be completed.' }, { status: 500 });
  }
}