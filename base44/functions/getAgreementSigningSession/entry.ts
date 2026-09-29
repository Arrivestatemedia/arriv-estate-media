import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  generateSessionId, generateSecureToken, hashToken, timingSafeEqual,
  sha256, SESSION_TTL_HOURS, PRESENCE_TIMEOUT_SECONDS,
} from '../../shared/agreementSecurity.ts';
import { canTransitionRecipient, RECIPIENT_STATES, computeAgreementStatus, isTerminal, AGREEMENT_STATES } from '../../shared/agreementStateMachine.ts';
import { logAgreementEvent, logAgreementAudit } from '../../shared/agreementEventLog.ts';
import { generateAgreementCompletionCertificate } from '../../shared/agreementCompletionEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── INITIATE SIGNING SESSION (validate token) ──────────────────
    if (action === 'initiate_session') {
      const { token, ip_address, user_agent } = body;
      if (!token) return Response.json({ status: 'ERROR', error: 'Token required' }, { status: 400 });

      // Find recipient by access token (this is the only public lookup)
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ access_token: token });
      if (recipients.length === 0) return Response.json({ status: 'ERROR', error: 'Invalid token' }, { status: 403 });

      const recipient = recipients[0];

      // Check token revocation
      if (recipient.token_revoked) return Response.json({ status: 'ERROR', error: 'Token revoked' }, { status: 403 });

      // Check token expiration
      if (recipient.token_expires_at && new Date(recipient.token_expires_at) < new Date()) {
        return Response.json({ status: 'ERROR', error: 'Token expired' }, { status: 403 });
      }

      // Get agreement
      const agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id: recipient.agreement_id });
      if (agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = agreements[0];

      // Check agreement is not terminal (except COMPLETED for viewing)
      if (isTerminal(agreement.status) && agreement.status !== AGREEMENT_STATES.COMPLETED) {
        return Response.json({ status: 'ERROR', error: `Agreement is ${agreement.status.toLowerCase()}` }, { status: 403 });
      }

      // Create signing session
      const sessionId = generateSessionId();
      const sessionToken = generateSecureToken(32);
      const sessionTokenHash = await hashToken(sessionToken);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
      const presenceExpiresAt = new Date(Date.now() + PRESENCE_TIMEOUT_SECONDS * 1000).toISOString();

      await base44.asServiceRole.entities.AgreementSession.create({
        agreement_id: agreement.id,
        recipient_id: recipient.recipient_id,
        session_id: sessionId,
        session_token_hash: sessionTokenHash,
        status: 'active',
        ip_address: ip_address || '',
        user_agent: user_agent || '',
        created_at: now,
        expires_at: expiresAt,
        last_activity_at: now,
        presence_expires_at: presenceExpiresAt,
        consent_accepted: false,
      });

      // Update recipient status to OPENED/VIEWING
      const newStatus = recipient.status === 'PENDING' || recipient.status === 'NOTIFIED' || recipient.status === 'DELIVERED'
        ? 'OPENED'
        : recipient.status;

      if (canTransitionRecipient(recipient.status, newStatus)) {
        await base44.asServiceRole.entities.AgreementRecipient.update(recipient.id, {
          status: newStatus,
          opened_at: recipient.opened_at || now,
          last_viewed_at: now,
          viewing_session_expires_at: presenceExpiresAt,
        });
      }

      // Update agreement status
      if (agreement.status === AGREEMENT_STATES.SENT || agreement.status === AGREEMENT_STATES.DELIVERED) {
        await base44.asServiceRole.entities.Agreement.update(agreement.id, {
          status: AGREEMENT_STATES.OPENED,
          updated_at: now,
        });
      }

      await logAgreementEvent(base44.asServiceRole, agreement.id, 'AGREEMENT_OPENED', {
        recipient_id: recipient.recipient_id, actor: recipient.recipient_id, actor_type: 'recipient',
        metadata_json: { session_id: sessionId },
      });
      await logAgreementEvent(base44.asServiceRole, agreement.id, 'SESSION_CREATED', {
        recipient_id: recipient.recipient_id, actor: 'system', actor_type: 'system',
        metadata_json: { session_id: sessionId },
      });

      // Get fields for this recipient
      const fields = await base44.asServiceRole.entities.AgreementField.filter({ agreement_id: agreement.id, recipient_id: recipient.recipient_id });

      // Get existing field values
      const fieldValues = await base44.asServiceRole.entities.AgreementFieldValue.filter({ agreement_id: agreement.id, recipient_id: recipient.recipient_id });

      // Return data for signing UI (never expose other recipients' tokens)
      return Response.json({
        status: 'OK',
        data: {
          session_token: sessionToken,
          session_id: sessionId,
          agreement: {
            id: agreement.id,
            agreement_id: agreement.agreement_id,
            name: agreement.name,
            agreement_type: agreement.agreement_type,
            status: agreement.status,
            document_type: agreement.document_type,
            document_body: agreement.document_body,
            document_file_uri: agreement.document_file_uri,
            document_file_name: agreement.document_file_name,
            expires_at: agreement.expires_at,
          },
          recipient: {
            recipient_id: recipient.recipient_id,
            name: recipient.name,
            email: recipient.email,
            role: recipient.role,
            status: newStatus,
            is_required: recipient.is_required,
            consent_status: recipient.consent_status,
          },
          fields: fields.map(f => ({
            field_id: f.field_id,
            field_type: f.field_type,
            label: f.label,
            required: f.required,
            read_only: f.read_only,
            prefilled_value: f.prefilled_value,
            options: f.options,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            order: f.order,
          })),
          existing_values: fieldValues.map(v => ({
            field_id: v.field_id,
            value: v.value,
          })),
        },
      });
    }

    // ── ACCEPT CONSENT ──────────────────────────────────────────────
    if (action === 'accept_consent') {
      const { session_token, ip_address, user_agent } = body;
      const session = await validateSession(base44, session_token);
      if (!session) return Response.json({ status: 'ERROR', error: 'Invalid or expired session' }, { status: 403 });

      const now = new Date().toISOString();
      await base44.asServiceRole.entities.AgreementSession.update(session.id, {
        consent_accepted: true,
        consent_accepted_at: now,
      });

      // Update recipient consent
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: session.agreement_id, recipient_id: session.recipient_id });
      if (recipients.length > 0) {
        await base44.asServiceRole.entities.AgreementRecipient.update(recipients[0].id, {
          consent_status: 'accepted',
          consent_at: now,
          consent_ip: ip_address || '',
          consent_user_agent: user_agent || '',
        });
      }

      await logAgreementEvent(base44.asServiceRole, session.agreement_id, 'CONSENT_ACCEPTED', {
        recipient_id: session.recipient_id, actor: session.recipient_id, actor_type: 'recipient',
      });

      return Response.json({ status: 'OK' });
    }

    // ── SUBMIT FIELD (sign/complete a field) ────────────────────────
    if (action === 'submit_field') {
      const { session_token, field_id, value, idempotency_key, ip_address, user_agent } = body;
      const session = await validateSession(base44, session_token);
      if (!session) return Response.json({ status: 'ERROR', error: 'Invalid or expired session' }, { status: 403 });
      if (!session.consent_accepted) return Response.json({ status: 'ERROR', error: 'Consent required before signing' }, { status: 403 });

      // Idempotency check
      const idemKey = idempotency_key || `${session.agreement_id}_${session.recipient_id}_${field_id}`;
      const existing = await base44.asServiceRole.entities.AgreementFieldValue.filter({ agreement_id: session.agreement_id, field_id, idempotency_key: idemKey });
      if (existing.length > 0) {
        return Response.json({ status: 'OK', data: { idempotent: true } });
      }

      // Validate field belongs to this recipient
      const fields = await base44.asServiceRole.entities.AgreementField.filter({ agreement_id: session.agreement_id, field_id });
      if (fields.length === 0) return Response.json({ status: 'ERROR', error: 'Field not found' }, { status: 404 });
      const field = fields[0];
      if (field.recipient_id !== session.recipient_id) {
        return Response.json({ status: 'ERROR', error: 'Field does not belong to this recipient' }, { status: 403 });
      }

      const now = new Date().toISOString();

      // Store field value
      const valueType = field.field_type === 'SIGNATURE' || field.field_type === 'INITIALS'
        ? 'signature_image'
        : field.field_type === 'CHECKBOX' ? 'checkbox'
        : field.field_type === 'RADIO' ? 'radio'
        : field.field_type === 'DATE' || field.field_type === 'DATE_SIGNED' ? 'date'
        : field.field_type === 'NUMBER' ? 'number'
        : field.field_type === 'APPROVAL' ? 'approval'
        : 'text';

      await base44.asServiceRole.entities.AgreementFieldValue.create({
        agreement_id: session.agreement_id,
        field_id,
        recipient_id: session.recipient_id,
        value,
        value_type: valueType,
        session_id: session.session_id,
        submitted_at: now,
        submitted_ip: ip_address || '',
        submitted_user_agent: user_agent || '',
        idempotency_key: idemKey,
      });

      // Store signature record if it's a signature-type field
      if (field.field_type === 'SIGNATURE' || field.field_type === 'INITIALS' || field.field_type === 'APPROVAL' || field.field_type === 'ACKNOWLEDGEMENT') {
        await base44.asServiceRole.entities.AgreementSignature.create({
          agreement_id: session.agreement_id,
          recipient_id: session.recipient_id,
          field_id,
          signature_id: `sig_${generateSecureToken(8)}`,
          signature_type: field.field_type,
          signature_data_uri: value.startsWith('data:') ? value : '',
          signature_text: value.startsWith('data:') ? '' : value,
          session_id: session.session_id,
          ip_address: ip_address || '',
          user_agent: user_agent || '',
          signed_at: now,
          idempotency_key: idemKey,
          immutable: true,
        });
      }

      // Update session activity
      await base44.asServiceRole.entities.AgreementSession.update(session.id, {
        last_activity_at: now,
        presence_expires_at: new Date(Date.now() + PRESENCE_TIMEOUT_SECONDS * 1000).toISOString(),
      });

      await logAgreementEvent(base44.asServiceRole, session.agreement_id, 'FIELD_COMPLETED', {
        recipient_id: session.recipient_id, actor: session.recipient_id, actor_type: 'recipient',
        metadata_json: { field_id, field_type: field.field_type },
      });

      // Check if recipient has completed all required fields
      await checkRecipientCompletion(base44, session.agreement_id, session.recipient_id);

      return Response.json({ status: 'OK' });
    }

    // ── HEARTBEAT (presence) ───────────────────────────────────────
    if (action === 'heartbeat') {
      const { session_token } = body;
      const session = await validateSession(base44, session_token);
      if (!session) return Response.json({ status: 'ERROR', error: 'Invalid session' }, { status: 403 });

      const now = new Date().toISOString();
      const presenceExpiresAt = new Date(Date.now() + PRESENCE_TIMEOUT_SECONDS * 1000).toISOString();
      await base44.asServiceRole.entities.AgreementSession.update(session.id, {
        last_activity_at: now,
        presence_expires_at: presenceExpiresAt,
      });

      // Update recipient presence
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: session.agreement_id, recipient_id: session.recipient_id });
      if (recipients.length > 0) {
        await base44.asServiceRole.entities.AgreementRecipient.update(recipients[0].id, {
          last_viewed_at: now,
          viewing_session_expires_at: presenceExpiresAt,
          status: recipients[0].status === 'OPENED' || recipients[0].status === 'SIGNING' ? 'VIEWING' : recipients[0].status,
        });
      }

      return Response.json({ status: 'OK', data: { presence_expires_at: presenceExpiresAt } });
    }

    // ── COMPLETE RECIPIENT (mark done) ─────────────────────────────
    if (action === 'complete_recipient') {
      const { session_token, ip_address, user_agent } = body;
      const session = await validateSession(base44, session_token);
      if (!session) return Response.json({ status: 'ERROR', error: 'Invalid session' }, { status: 403 });

      await checkRecipientCompletion(base44, session.agreement_id, session.recipient_id, true);

      // Check if all required recipients are done → complete agreement
      const completed = await checkAgreementCompletion(base44, session.agreement_id);
      return Response.json({ status: 'OK', data: { agreement_completed: completed } });
    }

    // ── DECLINE ────────────────────────────────────────────────────
    if (action === 'decline') {
      const { session_token, reason, ip_address, user_agent } = body;
      const session = await validateSession(base44, session_token);
      if (!session) return Response.json({ status: 'ERROR', error: 'Invalid session' }, { status: 403 });

      const now = new Date().toISOString();
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: session.agreement_id, recipient_id: session.recipient_id });
      if (recipients.length > 0) {
        await base44.asServiceRole.entities.AgreementRecipient.update(recipients[0].id, {
          status: 'DECLINED',
          declined_at: now,
          declined_reason: reason || '',
        });
      }

      const agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id: session.agreement_id });
      if (agreements.length > 0) {
        await base44.asServiceRole.entities.Agreement.update(agreements[0].id, {
          status: AGREEMENT_STATES.DECLINED,
          declined_at: now,
          declined_by: session.recipient_id,
          declined_reason: reason || '',
        });
      }

      await logAgreementEvent(base44.asServiceRole, session.agreement_id, 'AGREEMENT_DECLINED', {
        recipient_id: session.recipient_id, actor: session.recipient_id, actor_type: 'recipient',
        metadata_json: { reason },
      });

      return Response.json({ status: 'OK' });
    }

    // ── DOWNLOAD DOCUMENT ─────────────────────────────────────────
    if (action === 'download_document') {
      const { session_token } = body;
      const session = await validateSession(base44, session_token);
      if (!session) return Response.json({ status: 'ERROR', error: 'Invalid session' }, { status: 403 });

      await logAgreementEvent(base44.asServiceRole, session.agreement_id, 'DOCUMENT_DOWNLOADED', {
        recipient_id: session.recipient_id, actor: session.recipient_id, actor_type: 'recipient',
      });

      return Response.json({ status: 'OK' });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});

// ── HELPERS ─────────────────────────────────────────────────────────

async function validateSession(base44: any, sessionToken: string): Promise<any | null> {
  if (!sessionToken) return null;
  const tokenHash = await hashToken(sessionToken);
  const sessions = await base44.asServiceRole.entities.AgreementSession.filter({ session_token_hash: tokenHash, status: 'active' });
  if (sessions.length === 0) return null;
  const session = sessions[0];
  if (new Date(session.expires_at) < new Date()) {
    await base44.asServiceRole.entities.AgreementSession.update(session.id, { status: 'expired' });
    return null;
  }
  return session;
}

async function checkRecipientCompletion(base44: any, agreementId: string, recipientId: string, forceComplete: boolean = false): Promise<boolean> {
  const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreementId, recipient_id: recipientId });
  if (recipients.length === 0) return false;
  const recipient = recipients[0];

  // Check all required fields are completed
  const fields = await base44.asServiceRole.entities.AgreementField.filter({ agreement_id: agreementId, recipient_id: recipientId });
  const requiredFields = fields.filter(f => f.required !== false);
  const fieldValues = await base44.asServiceRole.entities.AgreementFieldValue.filter({ agreement_id: agreementId, recipient_id: recipientId });
  const completedFieldIds = new Set(fieldValues.map(v => v.field_id));
  const allRequiredComplete = requiredFields.every(f => completedFieldIds.has(f.field_id));

  if (!allRequiredComplete && !forceComplete) return false;

  const now = new Date().toISOString();
  const newStatus = recipient.role === 'APPROVER' ? 'APPROVED' : recipient.role === 'VIEWER' || recipient.role === 'CC' ? 'COMPLETED' : 'SIGNED';

  await base44.asServiceRole.entities.AgreementRecipient.update(recipient.id, {
    status: newStatus === 'SIGNED' ? 'SIGNED' : newStatus,
    completed_at: now,
  });

  // If SIGNED, also mark COMPLETED
  if (newStatus === 'SIGNED') {
    await base44.asServiceRole.entities.AgreementRecipient.update(recipient.id, { status: 'COMPLETED' });
  }

  const eventType = newStatus === 'APPROVED' ? 'APPROVAL_COMPLETED' : newStatus === 'SIGNED' ? 'SIGNATURE_COMPLETED' : 'RECIPIENT_COMPLETED';
  await logAgreementEvent(base44, agreementId, eventType, {
    recipient_id: recipientId, actor: recipientId, actor_type: 'recipient',
  });
  await logAgreementEvent(base44, agreementId, 'RECIPIENT_COMPLETED', {
    recipient_id: recipientId, actor: recipientId, actor_type: 'recipient',
  });

  return true;
}

async function checkAgreementCompletion(base44: any, agreementId: string): Promise<boolean> {
  const agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id: agreementId });
  if (agreements.length === 0) return false;
  const agreement = agreements[0];

  const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreementId });
  const required = recipients.filter(r => r.is_required !== false && r.role !== 'CC' && r.role !== 'VIEWER');
  const allComplete = required.every(r => r.status === 'COMPLETED' || r.status === 'SIGNED' || r.status === 'APPROVED');

  if (!allComplete) {
    // Update agreement status based on recipient states
    const computed = computeAgreementStatus(recipients);
    if (computed !== agreement.status && !isTerminal(agreement.status)) {
      await base44.asServiceRole.entities.Agreement.update(agreement.id, { status: computed, updated_at: new Date().toISOString() });
    }
    return false;
  }

  // All required recipients complete → finalize agreement
  const now = new Date().toISOString();

  // Compute final document hash
  const finalContent = agreement.document_type === 'native'
    ? agreement.document_body
    : agreement.document_file_uri;
  const finalHash = await sha256(finalContent + JSON.stringify(recipients.map(r => ({ id: r.recipient_id, status: r.status, completed_at: r.completed_at }))));

  await base44.asServiceRole.entities.Agreement.update(agreement.id, {
    status: AGREEMENT_STATES.COMPLETED,
    completed_at: now,
    final_document_hash: finalHash,
    updated_at: now,
  });

  // Update B2B contract status to signed
  if (agreement.b2b_contract_id) {
    await base44.asServiceRole.entities.B2BContract.update(agreement.b2b_contract_id, {
      status: 'signed',
      signed_at: now,
      signed_by: recipients.find(r => r.role === 'SIGNER' || r.role === 'INTERNAL_SIGNER')?.name || '',
      signature_data: `agreement:${agreement.agreement_id}`,
    }).catch(() => {});
  }

  // Generate completion certificate
  const certificate = await generateAgreementCompletionCertificate(base44, agreementId);

  // Emit B2B_AGREEMENT_EXECUTED event (idempotent)
  if (agreement.b2b_contract_id && !agreement.b2b_agreement_executed_emitted) {
    await logAgreementEvent(base44, agreementId, 'B2B_AGREEMENT_EXECUTED', {
      actor: 'system', actor_type: 'system',
      metadata_json: {
        agreement_id: agreement.agreement_id,
        organization_id: agreement.organization_id,
        contract_id: agreement.b2b_contract_id,
        contract_version_id: agreement.b2b_contract_version_id,
        commercial_snapshot_id: agreement.b2b_commercial_snapshot_id,
        completed_at: now,
        idempotency_key: `b2b_agreement_executed_${agreement.agreement_id}`,
      },
    });
    await base44.asServiceRole.entities.Agreement.update(agreement.id, { b2b_agreement_executed_emitted: true });
  }

  await logAgreementEvent(base44, agreementId, 'AGREEMENT_COMPLETED', {
    actor: 'system', actor_type: 'system',
    metadata_json: { certificate_id: certificate?.certificate_id },
  });

  return true;
}