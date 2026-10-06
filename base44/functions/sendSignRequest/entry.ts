import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveSignAdmin, createSignRequest, getAppBaseUrl, buildSignRequestEmailHtml } from '../../shared/signEngine.ts';
import { sendBusinessEmailOrQueue } from '../../shared/businessEmailQueue.ts';
import { removeTextFromPdf } from '../../shared/pdfTextRemoval.ts';

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
    const recipients = body?.recipients;
    const signingLocation = body?.signing_location || 'link';
    const expiresAt = body?.expires_at || null;
    const requireOrder = body?.require_signing_order === true;

    if (!documentId) return Response.json({ error: 'document_id is required' }, { status: 400 });

    // Build recipient list (supports both single and multi-signer)
    let recipientList = [];
    if (recipients && Array.isArray(recipients) && recipients.length > 0) {
      recipientList = recipients.map(r => ({
        email: r.email || '',
        name: r.name || '',
        application_id: r.application_id || '',
      }));
    } else {
      if (!applicationId && !recipientEmail)
        return Response.json({ error: 'Either application_id, recipient_email, or recipients is required' }, { status: 400 });
      recipientList = [{ email: recipientEmail, name: recipientName, application_id: applicationId }];
    }

    // Load the SignDocument template
    const filter = admin.tenantId
      ? { tenant_id: admin.tenantId, document_id: documentId }
      : { document_id: documentId };
    const docs = await base44.asServiceRole.entities.SignDocument.filter(filter, '-updated_date', 5);
    const doc = (Array.isArray(docs) ? docs : (docs?.data || []))[0];
    if (!doc) return Response.json({ error: 'Document template not found' }, { status: 404 });
    if (!doc.active) return Response.json({ error: 'Document template is not active' }, { status: 400 });

    const config = { company_name: 'Arriv Estate Media' };
    const allFields = doc.signature_fields || [];
    const isMultiSigner = recipientList.length > 1;
    const signGroupId = isMultiSigner ? `sg_${crypto.randomUUID().slice(0, 12)}` : '';
    const results = [];

    for (let idx = 0; idx < recipientList.length; idx++) {
      const recipient = recipientList[idx];

      // Assign fields: for multi-signer, filter by assigned_signer
      let assignedFields = allFields;
      if (isMultiSigner) {
        const isFirst = idx === 0;
        assignedFields = allFields.filter(f => !f.assigned_signer ? isFirst : f.assigned_signer === recipient.email);
      }
      // Skip signers with no assigned fields in multi-signer mode
      if (assignedFields.length === 0 && isMultiSigner) continue;

      // Resolve recipient details from application if available
      let recipientTenantId = admin.tenantId || 'tnt_estate_media';
      if (recipient.application_id) {
        try {
          const app = await base44.asServiceRole.entities.JobApplication.get(recipient.application_id);
          if (app) {
            recipient.email = recipient.email || app.email || '';
            recipient.name = recipient.name || app.full_name || '';
            recipientTenantId = app.tenant_id || recipientTenantId;
          }
        } catch (_) {}
      }

      const { signRequest, signToken } = await createSignRequest(base44, {
        doc,
        recipient: {
          application_id: recipient.application_id,
          email: recipient.email,
          name: recipient.name,
          tenant_id: recipientTenantId,
        },
        config,
        admin,
        signingLocation,
        expiresAt,
        assignedFields,
        signGroupId,
        signingOrder: requireOrder ? (idx + 1) : 0,
        signGroupTotal: recipientList.length,
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
      results.push({ signRequest, signUrl });
    }

    // Clean the PDF: remove placeholder text at field positions
    if (doc.source_type === "upload" && doc.body_ref && results.length > 0) {
      const placedFields = (doc.signature_fields || []).filter(
        f => typeof f.x === "number" && typeof f.y === "number"
      );
      if (placedFields.length > 0) {
        try {
          const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
            file_uri: doc.body_ref,
            expires_in: 300,
          });
          if (signed?.signed_url) {
            const pdfRes = await fetch(signed.signed_url);
            const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
            const cleanedBytes = await removeTextFromPdf(pdfBytes,
              placedFields.map(f => ({
                page: f.page || 1,
                x: f.x,
                y: f.y,
                width: f.width || 30,
                height_pct: f.height_pct || 3,
              }))
            );
            const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
              file: new File([cleanedBytes], `cleaned-${doc.document_id}.pdf`, { type: "application/pdf" }),
            });
            const cleanedUri = uploadRes?.file_uri || "";
            if (cleanedUri) {
              for (const result of results) {
                await base44.asServiceRole.entities.SignRequest.update(result.signRequest.id, {
                  cleaned_body_ref: cleanedUri,
                });
              }
            }
          }
        } catch (e) {
          console.error("PDF text removal failed:", e.message);
        }
      }
    }

    return Response.json({
      success: true,
      results,
      signRequest: results[0]?.signRequest,
      signUrl: results[0]?.signUrl,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}