import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveSignAdmin } from '../../shared/signEngine.ts';

// Returns a time-limited signed URL for downloading the signed PDF of a
// completed SignRequest. Admin-authenticated (platform or sales admin).
//
// The signed PDF is generated at signature time by submitSignature and stored
// on SignRequest.signed_pdf_uri. This function creates a signed URL so the
// admin can view/download it in the E-Signatures tab.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { id, request_id } = body;

    const admin = await resolveSignAdmin(base44, body);
    if (!admin.ok) return Response.json({ error: 'Admin access required' }, { status: 403 });

    // Find the sign request
    let signRequest = null;
    if (id) {
      signRequest = await base44.asServiceRole.entities.SignRequest.get(id);
    } else if (request_id) {
      const reqs = await base44.asServiceRole.entities.SignRequest.filter({ request_id }, '-sent_at', 5);
      signRequest = (reqs?.data || reqs)?.[0];
    }

    if (!signRequest) return Response.json({ error: 'Sign request not found' }, { status: 404 });

    if (signRequest.status !== 'signed') {
      return Response.json({ error: 'Document has not been signed yet' }, { status: 400 });
    }

    if (!signRequest.signed_pdf_uri) {
      return Response.json({ error: 'Signed PDF has not been generated yet' }, { status: 404 });
    }

    // Create a signed URL for the PDF (1-hour expiry)
    const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
      file_uri: signRequest.signed_pdf_uri,
      expires_in: 3600,
    });

    return Response.json({
      signed_url: signed?.signed_url || null,
      document_title: signRequest.document_title,
      document_type: signRequest.document_type,
      candidate_name: signRequest.candidate_name,
      candidate_email: signRequest.candidate_email,
      signed_at: signRequest.signed_at,
      signature_method: signRequest.signature_method,
      signature_value: signRequest.signature_value,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}