// ============================================================================
// AGREEMENT COMPLETION CERTIFICATE ENGINE
//
// Generates the immutable completion certificate / audit certificate for
// a fully executed agreement.
// ============================================================================

import { generateCertificateId, sha256 } from './agreementSecurity.ts';

export async function generateAgreementCompletionCertificate(base44: any, agreementId: string): Promise<any> {
  const agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id: agreementId });
  if (agreements.length === 0) return null;
  const agreement = agreements[0];

  // Check if certificate already exists (idempotent)
  const existing = await base44.asServiceRole.entities.AgreementCompletionCertificate.filter({ agreement_id: agreementId });
  if (existing.length > 0) return existing[0];

  const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreementId });
  const events = await base44.asServiceRole.entities.AgreementEvent.filter({ agreement_id: agreementId }, 'timestamp', 500);

  const requiredRecipients = recipients.filter(r => r.is_required !== false && r.role !== 'CC' && r.role !== 'VIEWER');
  const completedRecipients = requiredRecipients.filter(r => r.status === 'COMPLETED' || r.status === 'SIGNED' || r.status === 'APPROVED');

  const recipientRecords = recipients.map(r => ({
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    consent_status: r.consent_status,
    consent_at: r.consent_at,
    completed_at: r.completed_at,
    signed_at: r.signed_at || r.completed_at,
    ip_address: r.consent_ip || '',
  }));

  const eventSummary = events.map(e => ({
    event_type: e.event_type,
    timestamp: e.timestamp,
    recipient_id: e.recipient_id || '',
    actor: e.actor,
  }));

  const certificateId = generateCertificateId();

  // Build certificate content for hashing
  const certContent = JSON.stringify({
    agreement_id: agreement.agreement_id,
    agreement_name: agreement.name,
    completed_at: agreement.completed_at,
    recipients: recipientRecords,
    document_hash: agreement.source_document_hash,
    final_document_hash: agreement.final_document_hash,
    event_summary: eventSummary,
  });
  const certificateHash = await sha256(certContent);

  const certificate = await base44.asServiceRole.entities.AgreementCompletionCertificate.create({
    agreement_id: agreementId,
    certificate_id: certificateId,
    agreement_name: agreement.name,
    agreement_version: 1,
    template_id: agreement.template_id || '',
    template_version_number: agreement.template_version_number || 0,
    created_at: agreement.created_at,
    sent_at: agreement.sent_at || '',
    completed_at: agreement.completed_at || new Date().toISOString(),
    recipients_json: JSON.stringify(recipientRecords),
    required_recipients_count: requiredRecipients.length,
    completed_recipients_count: completedRecipients.length,
    document_hash: agreement.source_document_hash || '',
    prepared_document_hash: agreement.prepared_document_hash || '',
    final_document_hash: agreement.final_document_hash || '',
    final_document_uri: agreement.final_document_uri || '',
    event_summary_json: JSON.stringify(eventSummary),
    b2b_contract_id: agreement.b2b_contract_id || '',
    b2b_organization_id: agreement.organization_id || '',
    b2b_contract_version_id: agreement.b2b_contract_version_id || '',
    b2b_commercial_snapshot_id: agreement.b2b_commercial_snapshot_id || '',
    certificate_hash: certificateHash,
    immutable: true,
  });

  // Link certificate to agreement
  await base44.asServiceRole.entities.Agreement.update(agreement.id, { completion_certificate_id: certificate.id });

  return certificate;
}