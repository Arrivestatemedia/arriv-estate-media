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
    if (!body.module_id || !body.title) return Response.json({ error: 'module_id and title are required' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.TrainingModule.filter({ module_id: body.module_id });
    const data = {
      module_id: body.module_id,
      title: body.title,
      description: body.description || '',
      order: body.order || 0,
      quiz_questions: Array.isArray(body.quiz_questions) ? body.quiz_questions : [],
      passing_score: body.passing_score != null ? Number(body.passing_score) : 70,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    };
    let rec;
    if (existing && existing[0]) {
      rec = await base44.asServiceRole.entities.TrainingModule.update(existing[0].id, { ...data, version: (existing[0].version || 1) + 1 });
    } else {
      rec = await base44.asServiceRole.entities.TrainingModule.create({ ...data, version: 1 });
    }
    await writeOrientationAudit(base44, { arriv_employee_id: '*', actor, role: 'admin', action: 'training_module_saved', section: body.module_id });
    return Response.json({ success: true, module_id: body.module_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});