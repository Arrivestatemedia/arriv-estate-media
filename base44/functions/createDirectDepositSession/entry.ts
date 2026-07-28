import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createEnrollmentSession, getOrientationBundle } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!body.sales_member_id) return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    const bundle = await getOrientationBundle(base44, body.sales_member_id);
    const res = await createEnrollmentSession(base44, {
      orientation: bundle.orientation,
      sessionType: 'direct_deposit',
      returnUrl: body.return_url,
      actor: body.actor || 'employee',
    });
    return Response.json({ success: true, ...res });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});