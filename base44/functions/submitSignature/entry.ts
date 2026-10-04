import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { recordSignAudit, buildSignConfirmationEmailHtml } from '../../shared/signEngine.ts';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

// Public endpoint — no auth required. The sign_token identifies the request.
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

    // SIGN — validate required fields
    const fields = signRequest.signature_fields || [];
    const missingRequired = fields.filter(f => f.required && !(fieldValues[f.field_id] || '').trim());
    if (missingRequired.length > 0) {
      return Response.json({ error: `Please fill in all required fields: ${missingRequired.map(f => f.label).join(', ')}` }, { status: 400 });
    }

    const sigField = fields.find(f => f.type === 'signature');
    const rawSigValue = (sigField ? fieldValues[sigField.field_id] : '') || fieldValues['signature'] || signRequest.candidate_name || '';

    const isDrawn = rawSigValue.startsWith('data:image/');
    const signatureMethod = isDrawn ? 'drawn' : 'typed';
    const signatureValue = isDrawn ? '[Drawn Signature]' : rawSigValue;
    const drawnDataUrl = isDrawn ? rawSigValue : '';

    if (!rawSigValue.trim()) return Response.json({ error: 'Please type your full name or draw your signature to sign' }, { status: 400 });

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
      signature_field_values: fieldValues,
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

    // Send a confirmation email to the candidate
    try {
      const firstName = (signRequest.candidate_name || '').split(' ')[0] || 'there';
      const signedAtStr = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
      const html = buildSignConfirmationEmailHtml(firstName, signRequest.document_title, signatureValue, signatureMethod, signedAtStr);
      await sendBrevoEmail({
        to: signRequest.candidate_email,
        subject: `Signed: ${signRequest.document_title}`,
        htmlContent: html,
      });
    } catch (e) {
      console.error('Sign confirmation email failed:', e.message);
    }

    return Response.json({ success: true, status: 'signed', orientation_document_id: orientationDocId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}