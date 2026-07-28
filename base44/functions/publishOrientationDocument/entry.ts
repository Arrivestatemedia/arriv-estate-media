import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { writeOrientationAudit } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let actor = 'admin';
    try {
      const u = await base44.auth.me();
      if (!u) return Response.json({ error: 'Not authenticated' }, { status: 401 });
      if (u.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      actor = u.email;
    } catch (e) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    if (!body.document_id || !body.title || !body.version) {
      return Response.json({ error: 'document_id, title and version are required' }, { status: 400 });
    }
    await base44.asServiceRole.entities.OrientationDocumentTemplate.create({
      document_id: body.document_id,
      title: body.title,
      version: String(body.version),
      body_ref: body.body_ref || '',
      required: body.required !== false,
      active: true,
      change_summary: body.change_summary || '',
      published_at: new Date().toISOString(),
      published_by: actor,
    });
    await writeOrientationAudit(base44, { arriv_employee_id: '*', actor, role: 'admin', action: 'document_version_published', section: body.document_id, new_status: String(body.version) });
    return Response.json({ success: true, re_ack_triggered: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});