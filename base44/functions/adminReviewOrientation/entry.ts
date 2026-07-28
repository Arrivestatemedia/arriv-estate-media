import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { adminReviewOrientation } from '../../shared/orientationEngine.ts';

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
    if (!body.orientation_id) return Response.json({ error: 'orientation_id is required' }, { status: 400 });
    if (!body.action) return Response.json({ error: 'action is required' }, { status: 400 });
    const orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ id: body.orientation_id });
    const orientation = orientations && orientations[0];
    if (!orientation) return Response.json({ error: 'Orientation not found' }, { status: 404 });
    await adminReviewOrientation(base44, orientation, body.action, body, actor);
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});