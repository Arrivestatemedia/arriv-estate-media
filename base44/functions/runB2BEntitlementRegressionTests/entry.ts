import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { runB2BEntitlementRegressionTests } from '../../shared/b2bEntitlementTestSuite.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await runB2BEntitlementRegressionTests(base44.asServiceRole);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});