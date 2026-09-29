import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { convertToB2BOrganization } from '../../shared/b2bConversionEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const input = await req.json();

    const result = await convertToB2BOrganization(base44.asServiceRole, {
      ...input,
      actor: input.actor || 'system',
    });

    return Response.json({ status: result.success ? 'OK' : 'PARTIAL', data: result });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});