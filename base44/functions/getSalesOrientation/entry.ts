import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getOrientationBundle } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const salesMemberId = body.sales_member_id;
    if (!salesMemberId) return Response.json({ error: 'sales_member_id is required' }, { status: 400 });
    const bundle = await getOrientationBundle(base44, salesMemberId);
    return Response.json({ success: true, ...bundle });
  } catch (e) {
    const code = /not found|required|ARRIV_EMPLOYEE_ID/i.test(e.message) ? 400 : 500;
    return Response.json({ error: e.message }, { status: code });
  }
});