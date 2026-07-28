import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { completeSection, getOrientationBundle } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!body.sales_member_id) return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    if (!body.section) return Response.json({ error: 'section is required' }, { status: 400 });
    const bundle = await getOrientationBundle(base44, body.sales_member_id);
    await completeSection(base44, bundle.orientation, body.section, body.actor || 'employee');
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});