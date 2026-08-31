import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // Get the requesting user's name for audit
    let updatedBy = body?.updatedBy || "admin";
    try {
      const me = await base44.auth.me();
      if (me?.email) updatedBy = me.full_name || me.email;
    } catch (_) { /* not logged in via platform auth — use provided updatedBy */ }

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
        updated_by: updatedBy,
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