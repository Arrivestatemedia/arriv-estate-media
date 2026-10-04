import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { recordSignAudit, buildSignConfirmationEmailHtml, buildSignAdminNotificationEmailHtml } from '../../shared/signEngine.ts';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';
import { buildSignedPdfFromHtml, buildSignedPdfFromUpload, uint8ArrayToBase64 } from '../../shared/signedDocumentPdf.ts';

// Public endpoint — no auth required. The sign_token identifies the request.
// Supports multi-signer signing succession, drawn signature upload to private
// storage, and static_value fields (admin-authored, not signer-fillable).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const fieldValues = body?.field_values || {};
    const action = body?.action || 'sign';

    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const forwarded = req.headers.get('x-forwarded-for') || '';
    const ipAddress = forwarded.split(',')[0]?.trim() || '';
    const userAgent = req.headers.get('user-agent') || '';

    const requests = await base44.asServiceRole.entities.SignRequest.filter({ sign_token: token }, '-sent_at', 5);
    const signRequest = (Array.isArray(requests) ? requests : (requests?.data || []))[0];
    if (!signRequest) return Response.json({ error: 'Invalid or expired sign link' }, { status: 404 });

    if (signRequest.expires_at && new Date(signRequest.expires_at) < new Date()) {
      return Response.json({ error: 'This sign link has expired' }, { status: 410 });
    }

    if (['signed', 'voided', 'declined'].includes(signRequest.status)) {
      return Response.json({ error: `This document has already been ${signRequest.status}` }, { status: 409 });
    }

    // Signing succession enforcement for multi-signer documents
    if (signRequest.signing_order && signRequest.signing_order > 1 && signRequest.sign_group_id) {
      const groupReqs = await base44.asServiceRole.entities.SignRequest.filter(
        { sign_group_id: signRequest.sign_group_id }, '-sent_at', 50
      );
      const all = (Array.isArray(groupReqs) ? groupReqs : (groupReqs?.data || [])) || [];
      const pending = all.filter(
        r => (r.signing_order || 0) > 0 && (r.signing_order || 0) < signRequest.signing_order && r.status !== 'signed'
      );
      if (pending.length > 0) {
        const next = pending.sort((a, b) => (a.signing_order || 0) - (b.signing_order || 0))[0];
        return Response.json({
          error: `You cannot sign yet. ${next.signer_name || next.candidate_name || 'A previous signer'} must sign first.`,
        }, { status: 409 });
      }
    }

    const now = new Date().toISOString();

    // DECLINE
    if (action === 'decline') {
      await base44.asServiceRole.entities.SignRequest.update(signRequest.id, {
        status: 'declined',
        declined_at: now,
        ip_address: ipAddress,
        user_agent: userAgent,
      });
      return Response.json({ success: true, status: 'declined' });
    }

    // SIGN — validate required fields (skip static_value fields — they're admin-authored)
    const fields = signRequest.signature_fields || [];
    const missingRequired = fields.filter(
      f => f.required && !f.static_value && !(fieldValues[f.field_id] || '').trim()
    );
    if (missingRequired.length > 0) {
      return Response.json({
        error: `Please fill in all required fields: ${missingRequired.map(f => f.label).join(', ')}`,
      }, { status: 400 });
    }

    // Merge static_value into field values (admin-authored content burned into the doc)
    const mergedValues = { ...fieldValues };
    for (const f of fields) {
      if (f.static_value && !mergedValues[f.field_id]) {
        mergedValues[f.field_id] = f.static_value;
      }
    }

    // Upload drawn signatures to private storage, store file_uri (not data URL)
    const storedValues = { ...mergedValues };
    let drawnDataUrl = '';
    for (const f of fields) {
      const val = mergedValues[f.field_id] || '';
      if ((f.type === 'signature' || f.type === 'initial') && val.startsWith('data:image/')) {
        if (!drawnDataUrl) drawnDataUrl = val; // keep first drawn sig for audit
        try {
          const base64 = val.split(',')[1];
          const byteChars = atob(base64);
          const byteArray = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
            file: new File([byteArray], `sig-${f.field_id}.png`, { type: 'image/png' }),
          });
          if (uploadRes?.file_uri) storedValues[f.field_id] = uploadRes.file_uri;
        } catch (e) {
          console.error('Failed to upload drawn signature:', e.message);
        }
      }
    }

    const sigField = fields.find(f => f.type === 'signature');
    const rawSigValue = (sigField ? fieldValues[sigField.field_id] : '') || fieldValues['signature'] || signRequest.candidate_name || '';
    const isDrawn = rawSigValue.startsWith('data:image/');
    const signatureMethod = isDrawn ? 'drawn' : 'typed';
    const signatureValue = isDrawn ? '[Drawn Signature]' : rawSigValue;

    if (!rawSigValue.trim()) {
      return Response.json({ error: 'Please type your full name or draw your signature to sign' }, { status: 400 });
    }

    // Create the OrientationDocument audit-trail record
    const orientationDocId = await recordSignAudit(base44, {
      tenantId: signRequest.tenant_id,
      requestId: signRequest.request_id,
      documentId: signRequest.document_id,
      documentVersion: signRequest.document_version,
      documentTitle: signRequest.document_title,
      applicationId: signRequest.application_id,
      candidateName: signRequest.candidate_name,
      candidateEmail: signRequest.candidate_email,
      signatureMethod,
      signatureValue,
      ipAddress,
      userAgent,
      drawnSignatureDataUrl: drawnDataUrl,
    });

    // Update the SignRequest to signed
    await base44.asServiceRole.entities.SignRequest.update(signRequest.id, {
      status: 'signed',
      signed_at: now,
      signature_value: signatureValue,
      signature_method: signatureMethod,
      signature_field_values: storedValues,
      ip_address: ipAddress,
      user_agent: userAgent,
      orientation_document_id: orientationDocId,
    });

    // For offer letters, update the JobApplication status to 'hired'
    if (signRequest.document_type === 'offer_letter' && signRequest.application_id) {
      try {
        await base44.asServiceRole.entities.JobApplication.update(signRequest.application_id, {
          status: 'hired',
          offer_accepted_at: now,
        });
      } catch (e) {
        console.error('JobApplication update on offer sign failed:', e.message);
      }
    }

    // ─── Generate the signed PDF ───────────────────────────────────────────
    let pdfBase64 = '';
    try {
      let pdfBytes = null;

      if (signRequest.source_type === 'editor') {
        pdfBytes = await buildSignedPdfFromHtml({
          html: signRequest.merged_body_html || '',
          signatureFields: signRequest.signature_fields || [],
          fieldValues: mergedValues,
          documentTitle: signRequest.document_title || '',
          candidateName: signRequest.candidate_name || '',
          signedAt: now,
        });
      } else if (signRequest.source_type === 'upload' && (signRequest.cleaned_body_ref || signRequest.body_ref)) {
        try {
          const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
            file_uri: signRequest.cleaned_body_ref || signRequest.body_ref,
            expires_in: 300,
          });
          if (signed?.signed_url) {
            const pdfRes = await fetch(signed.signed_url);
            const originalBytes = new Uint8Array(await pdfRes.arrayBuffer());
            pdfBytes = await buildSignedPdfFromUpload({
              pdfBytes: originalBytes,
              signatureFields: signRequest.signature_fields || [],
              fieldValues: mergedValues,
            });
          }
        } catch (e) {
          console.error('Failed to fetch/overlay original PDF:', e.message);
        }
      }

      if (pdfBytes) {
        pdfBase64 = uint8ArrayToBase64(pdfBytes);
        const uploadRes = await base44.asServiceRole.integrations.Core.UploadPrivateFile({
          file: new File([pdfBytes], `signed-${signRequest.request_id}.pdf`, { type: 'application/pdf' }),
        });
        const signedPdfUri = uploadRes?.file_uri || '';
        if (signedPdfUri) {
          await base44.asServiceRole.entities.SignRequest.update(signRequest.id, {
            signed_pdf_uri: signedPdfUri,
          });
        }
      }
    } catch (e) {
      console.error('Signed PDF generation failed:', e.message);
    }

    // ─── Email both parties with the signed PDF attached ──────────────────
    try {
      const firstName = (signRequest.candidate_name || '').split(' ')[0] || 'there';
      const signedAtStr = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
      const fileName = `${(signRequest.document_title || 'document').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const attachments = pdfBase64 ? [{ content: pdfBase64, name: fileName }] : [];

      const candidateHtml = buildSignConfirmationEmailHtml(firstName, signRequest.document_title, signatureValue, signatureMethod, signedAtStr);
      await sendBrevoEmail({
        to: signRequest.candidate_email,
        subject: `Signed: ${signRequest.document_title}`,
        htmlContent: candidateHtml,
        attachments,
      });

      if (signRequest.sent_by_email) {
        const adminHtml = buildSignAdminNotificationEmailHtml(
          signRequest.candidate_name,
          signRequest.document_title,
          signatureValue,
          signatureMethod,
          signedAtStr
        );
        await sendBrevoEmail({
          to: signRequest.sent_by_email,
          subject: `Document Signed: ${signRequest.document_title} — ${signRequest.candidate_name}`,
          htmlContent: adminHtml,
          attachments,
        });
      }
    } catch (e) {
      console.error('Sign confirmation email failed:', e.message);
    }

    return Response.json({ success: true, status: 'signed', orientation_document_id: orientationDocId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}