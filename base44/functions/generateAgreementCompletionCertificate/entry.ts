import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { generateAgreementCompletionCertificate } from '../../shared/agreementCompletionEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { agreement_id } = body;

    const certificate = await generateAgreementCompletionCertificate(base44.asServiceRole, agreement_id);
    if (!certificate) return Response.json({ status: 'ERROR', error: 'Agreement not found or not completed' }, { status: 404 });

    return Response.json({ status: 'OK', data: certificate });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});