import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Public endpoint — no auth required. The sign_token is the credential.
// Returns the document for the candidate to review and sign.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let token = '';
    try {
      const body = await req.json().catch(() => ({}));
      token = body?.token || '';
    } catch (_) {}
    if (!token) {
      const url = new URL(req.url);
      token = url.searchParams.get('token') || '';
      if (!token) {
        const parts = url.pathname.split('/');
        token = parts[parts.length - 1];
      }
    }

    if (!token) return Response.json({ error: 'Token is required' }, { status: 400 });

    const requests = await base44.asServiceRole.entities.SignRequest.filter({ sign_token: token }, '-sent_at', 5);
    const signRequest = (Array.isArray(requests) ? requests : (requests?.data || []))[0];
    if (!signRequest) return Response.json({ error: 'Invalid or expired sign link' }, { status: 404 });

    // Check expiration
    if (signRequest.expires_at && new Date(signRequest.expires_at) < new Date()) {
      if (signRequest.status === 'sent' || signRequest.status === 'viewed') {
        await base44.asServiceRole.entities.SignRequest.update(signRequest.id, { status: 'expired' });
      }
      return Response.json({ error: 'This sign link has expired' }, { status: 410 });
    }

    // Block if already signed/voided/declined
    if (['signed', 'voided', 'declined'].includes(signRequest.status)) {
      return Response.json({ error: `This document has already been ${signRequest.status}`, status: signRequest.status }, { status: 409 });
    }

    // Mark as viewed on first open
    if (signRequest.status === 'sent') {
      await base44.asServiceRole.entities.SignRequest.update(signRequest.id, {
        status: 'viewed',
        viewed_at: new Date().toISOString(),
      });
    }

    // For upload docs, create a signed URL for the PDF
    let pdfUrl = null;
    if (signRequest.source_type === 'upload' && signRequest.body_ref) {
      try {
        const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: signRequest.body_ref,
          expires_in: 3600,
        });
        pdfUrl = signed?.signed_url || null;
      } catch (_) { pdfUrl = null; }
    }

    return Response.json({
      request_id: signRequest.request_id,
      document_title: signRequest.document_title,
      document_type: signRequest.document_type,
      source_type: signRequest.source_type,
      merged_body_html: signRequest.merged_body_html || '',
      pdf_url: pdfUrl,
      candidate_name: signRequest.candidate_name,
      signature_fields: signRequest.signature_fields || [],
      status: signRequest.status === 'sent' ? 'viewed' : signRequest.status,
      _sign_request_id: signRequest.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}