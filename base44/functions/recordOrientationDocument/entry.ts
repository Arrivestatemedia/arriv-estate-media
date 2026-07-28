import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recordDocumentSign, getOrientationBundle } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!body.sales_member_id || !body.document_id || !body.document_version) {
      return Response.json({ error: 'sales_member_id, document_id and document_version are required' }, { status: 400 });
    }
    const bundle = await getOrientationBundle(base44, body.sales_member_id);
    await recordDocumentSign(base44, {
      orientation: bundle.orientation,
      document_id: body.document_id,
      document_version: body.document_version,
      signature_method: body.signature_method || 'clickwrap',
      signature_value: body.signature_value || '',
      actor: body.actor || 'employee',
    });
    return Response.json({ success: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});