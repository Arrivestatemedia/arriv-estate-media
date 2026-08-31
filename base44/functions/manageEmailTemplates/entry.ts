import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = body?.action;
    const salesMemberId = body?.salesMemberId;

    if (!salesMemberId) return Response.json({ error: 'Admin access required' }, { status: 403 });
    const member = await base44.asServiceRole.entities.SalesTeamMember.get(salesMemberId);
    if (!member || member.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    if (action === 'list') {
      const templates = await base44.asServiceRole.entities.EmailTemplate.filter({});
      return Response.json({ templates });
    }

    if (action === 'save') {
      const { templateKey, name, description, category, subject, htmlBody, variables } = body;
      if (!templateKey) return Response.json({ error: 'templateKey is required' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.EmailTemplate.filter({ template_key: templateKey });
      const data = {
        template_key: templateKey,
        name: name || templateKey,
        description: description || '',
        category: category || 'System',
        subject: subject || '',
        html_body: htmlBody || '',
        variables: variables || [],
        active: true,
        updated_by: member.full_name || member.email,
      };

      if (existing.length > 0) {
        await base44.asServiceRole.entities.EmailTemplate.update(existing[0].id, data);
      } else {
        await base44.asServiceRole.entities.EmailTemplate.create(data);
      }

      return Response.json({ success: true });
    }

    if (action === 'reset') {
      const { templateKey } = body;
      if (!templateKey) return Response.json({ error: 'templateKey is required' }, { status: 400 });
      await base44.asServiceRole.entities.EmailTemplate.deleteMany({ template_key: templateKey });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});