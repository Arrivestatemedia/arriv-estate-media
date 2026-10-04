import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveSignAdmin, createSignRequest, getAppBaseUrl, buildSignRequestEmailHtml } from '../../shared/signEngine.ts';
import { sendBusinessEmailOrQueue } from '../../shared/businessEmailQueue.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const admin = await resolveSignAdmin(base44, body);
    if (!admin.ok) return Response.json({ error: 'Admin access required' }, { status: 403 });

    const documentId = body?.document_id;
    const applicationId = body?.application_id || '';
    const recipientEmail = body?.recipient_email || '';
    const recipientName = body?.recipient_name || '';
    const signingLocation = body?.signing_location || 'link';
    const expiresAt = body?.expires_at || null;

    if (!documentId) return Response.json({ error: 'document_id is required' }, { status: 400 });
    if (!applicationId && !recipientEmail) return Response.json({ error: 'Either application_id or recipient_email is required' }, { status: 400 });

    // Load the SignDocument template
    const filter = admin.tenantId
      ? { tenant_id: admin.tenantId, document_id: documentId }
      : { document_id: documentId };
    const docs = await base44.asServiceRole.entities.SignDocument.filter(filter, '-updated_date', 5);
    const doc = (Array.isArray(docs) ? docs : (docs?.data || []))[0];
    if (!doc) return Response.json({ error: 'Document template not found' }, { status: 404 });
    if (!doc.active) return Response.json({ error: 'Document template is not active' }, { status: 400 });

    const config = { company_name: 'Arriv Estate Media' };

    const { signRequest, signToken } = await createSignRequest(base44, {
      doc,
      recipient: {
        application_id: applicationId,
        email: recipientEmail,
        name: recipientName,
        tenant_id: admin.tenantId,
      },
      config,
      admin,
      signingLocation,
      expiresAt,
    });

    const baseUrl = getAppBaseUrl();
    const signUrl = `${baseUrl}/sign/${signToken}`;
    const firstName = (signRequest.candidate_name || '').split(' ')[0] || 'there';
    const isOffer = doc.document_type === 'offer_letter';
    const emailSubject = isOffer
      ? `Your Offer from Arriv Estate Media — Please Review & Sign`
      : `Document for Signature: ${doc.title}`;
    const html = buildSignRequestEmailHtml(firstName, doc.title, signUrl, isOffer);

    await sendBusinessEmailOrQueue(base44, {
      to: signRequest.candidate_email,
      subject: emailSubject,
      htmlContent: html,
    });

    return Response.json({ success: true, signRequest, signUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}