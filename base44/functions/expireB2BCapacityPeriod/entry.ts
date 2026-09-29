import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { expireB2BCapacityPeriod } from '../../shared/b2bEntitlementEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const result = await expireB2BCapacityPeriod(base44.asServiceRole, body);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});