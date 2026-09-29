import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  generateAgreementId, generateRecipientId, generateFieldId,
  generateSecureToken, hashToken, sha256, buildSigningUrl,
  SESSION_TTL_HOURS,
} from '../../shared/agreementSecurity.ts';
import { resolveMergeFields, applyMergeFields, extractMergeFields } from '../../shared/agreementMergeFields.ts';
import { canTransitionAgreement, computeAgreementStatus, isTerminal, AGREEMENT_STATES } from '../../shared/agreementStateMachine.ts';
import { logAgreementEvent, logAgreementAudit } from '../../shared/agreementEventLog.ts';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ── CREATE AGREEMENT ────────────────────────────────────────────
    if (action === 'create') {
      const { name, agreement_type, template_id, source_type, organization_id, b2b_contract_id, b2b_quote_id, sales_rep_id, sales_rep_email, routing_type, document_type, document_body, document_file_uri, document_file_name, expires_at, actor } = body;

      const agreementId = generateAgreementId();
      const now = new Date().toISOString();

      // Resolve merge fields from canonical B2B records
      const { data: mergeData, errors: mergeErrors } = await resolveMergeFields(
        base44.asServiceRole,
        organization_id || null,
        b2b_contract_id || null,
        b2b_quote_id || null,
      );

      // Get template version if from template
      let templateVersionId = '';
      let templateVersionNumber = 0;
      let resolvedBody = document_body || '';
      let resolvedFileUri = document_file_uri || '';
      let resolvedFileName = document_file_name || '';
      let resolvedType = document_type || 'native';
      let mergeFields: string[] = [];
      let defaultRecipients: any[] = [];
      let defaultFields: any[] = [];
      let notificationRules: any = { send_on_create: false, reminder_schedule_hours: [24, 72, 168] };

      if (template_id) {
        const templates = await base44.asServiceRole.entities.AgreementTemplate.filter({ template_id });
        if (templates.length === 0) return Response.json({ status: 'ERROR', error: 'Template not found' }, { status: 404 });
        const template = templates[0];

        templateVersionId = template.current_version_id || '';
        templateVersionNumber = template.current_version_number || 0;
        resolvedBody = template.document_body || '';
        resolvedFileUri = template.document_file_uri || '';
        resolvedFileName = template.document_file_name || '';
        resolvedType = template.document_type || 'native';
        mergeFields = template.merge_fields || [];
        defaultRecipients = template.default_recipients || [];
        defaultFields = template.default_fields || [];
        notificationRules = template.notification_rules || notificationRules;
      }

      // Apply merge fields to native document
      let preparedBody = resolvedBody;
      let unresolvedFields: string[] = [];
      if (resolvedType === 'native' && resolvedBody) {
        const result = applyMergeFields(resolvedBody, mergeData);
        preparedBody = result.rendered;
        unresolvedFields = result.unresolved;
      }

      // Compute document hashes
      const sourceContent = resolvedType === 'native' ? resolvedBody : resolvedFileUri;
      const sourceHash = await sha256(sourceContent);
      const preparedContent = resolvedType === 'native' ? preparedBody : resolvedFileUri;
      const preparedHash = await sha256(preparedContent);

      // Get B2B contract references
      let b2bContractVersionId = '';
      let b2bCommercialSnapshotId = '';
      let b2bQuoteVersionId = '';
      if (b2b_contract_id) {
        const contract = await base44.asServiceRole.entities.B2BContract.get(b2b_contract_id).catch(() => null);
        if (contract) {
          b2bContractVersionId = contract.contract_version_id || '';
          b2bCommercialSnapshotId = contract.commercial_snapshot_id || '';
        }
      }
      if (b2b_quote_id) {
        const quote = await base44.asServiceRole.entities.B2BQuote.get(b2b_quote_id).catch(() => null);
        if (quote) b2bQuoteVersionId = quote.current_version_id || '';
      }

      const agreement = await base44.asServiceRole.entities.Agreement.create({
        agreement_id: agreementId,
        name,
        agreement_type: agreement_type || 'OTHER',
        status: AGREEMENT_STATES.DRAFT,
        provider: 'NATIVE_ARRIV',
        template_id: template_id || '',
        template_version_id: templateVersionId,
        template_version_number: templateVersionNumber,
        source_type: source_type || 'template',
        organization_id: organization_id || '',
        b2b_contract_id: b2b_contract_id || '',
        b2b_contract_version_id: b2bContractVersionId,
        b2b_commercial_snapshot_id: b2bCommercialSnapshotId,
        b2b_quote_id: b2b_quote_id || '',
        b2b_quote_version_id: b2bQuoteVersionId,
        sales_rep_id: sales_rep_id || '',
        sales_rep_email: sales_rep_email || '',
        routing_type: routing_type || 'parallel',
        document_type: resolvedType,
        document_body: preparedBody,
        document_file_uri: resolvedFileUri,
        document_file_name: resolvedFileName,
        source_document_hash: sourceHash,
        prepared_document_hash: preparedHash,
        merge_field_data_json: JSON.stringify(mergeData),
        merge_field_errors: unresolvedFields,
        expires_at: expires_at || '',
        reminder_schedule_hours: notificationRules.reminder_schedule_hours || [24, 72, 168],
        created_by: actor || 'system',
        created_at: now,
        updated_at: now,
      });

      // Create AgreementDocument record
      await base44.asServiceRole.entities.AgreementDocument.create({
        agreement_id: agreementId,
        document_version: 1,
        document_type: resolvedType,
        body_html: preparedBody,
        file_uri: resolvedFileUri,
        file_name: resolvedFileName,
        source_hash: sourceHash,
        prepared_hash: preparedHash,
        status: 'prepared',
        created_at: now,
        updated_at: now,
      });

      await logAgreementEvent(base44.asServiceRole, agreementId, 'AGREEMENT_CREATED', {
        actor, actor_type: 'admin',
        metadata_json: { source_type, template_id, organization_id, b2b_contract_id },
      });

      return Response.json({ status: 'OK', data: { agreement_id: agreementId, merge_field_errors: unresolvedFields } });
    }

    // ── ADD RECIPIENT ───────────────────────────────────────────────
    if (action === 'add_recipient') {
      const { agreement_id, name, email, phone, role, routing_order, is_required, signing_authority, organization_member_id, user_id, actor } = body;

      const _agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = _agreements[0];
      if (isTerminal(agreement.status)) return Response.json({ status: 'ERROR', error: 'Agreement is terminal' }, { status: 400 });

      const recipientId = generateRecipientId();
      const accessToken = generateSecureToken(32);
      const tokenExpiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

      const recipient = await base44.asServiceRole.entities.AgreementRecipient.create({
        agreement_id,
        recipient_id: recipientId,
        name,
        email: email.toLowerCase().trim(),
        phone: phone || '',
        role: role || 'SIGNER',
        routing_order: routing_order || 1,
        status: 'PENDING',
        organization_member_id: organization_member_id || '',
        user_id: user_id || '',
        is_required: is_required !== false,
        signing_authority: signing_authority || false,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        token_revoked: false,
        created_at: new Date().toISOString(),
      });

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'RECIPIENT_ADDED', {
        recipient_id: recipientId, actor, actor_type: 'admin',
        metadata_json: { name, email, role },
      });

      return Response.json({ status: 'OK', data: { recipient_id: recipientId } });
    }

    // ── REMOVE RECIPIENT ───────────────────────────────────────────
    if (action === 'remove_recipient') {
      const { agreement_id, recipient_id, actor } = body;
      const _agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = _agreements[0];
      if (isTerminal(agreement.status)) return Response.json({ status: 'ERROR', error: 'Cannot modify terminal agreement' }, { status: 400 });

      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id, recipient_id });
      if (recipients.length === 0) return Response.json({ status: 'ERROR', error: 'Recipient not found' }, { status: 404 });

      // Revoke token
      await base44.asServiceRole.entities.AgreementRecipient.update(recipients[0].id, {
        token_revoked: true,
        status: 'PENDING',
      });

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'RECIPIENT_REMOVED', {
        recipient_id, actor, actor_type: 'admin',
      });

      return Response.json({ status: 'OK' });
    }

    // ── ADD FIELD ───────────────────────────────────────────────────
    if (action === 'add_field') {
      const { agreement_id, recipient_id, field_type, label, required, read_only, prefilled_value, options, page, x, y, width, height, anchor_string, order, actor } = body;

      const fieldId = generateFieldId();
      await base44.asServiceRole.entities.AgreementField.create({
        agreement_id,
        field_id: fieldId,
        recipient_id: recipient_id || '',
        field_type,
        label: label || '',
        required: required !== false,
        read_only: read_only || false,
        prefilled_value: prefilled_value || '',
        options: options || [],
        page: page || 1,
        x: x || 0,
        y: y || 0,
        width: width || 200,
        height: height || 50,
        anchor_string: anchor_string || '',
        order: order || 0,
        created_at: new Date().toISOString(),
      });

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'FIELD_ADDED', {
        recipient_id, actor, actor_type: 'admin',
        metadata_json: { field_type, label },
      });

      return Response.json({ status: 'OK', data: { field_id: fieldId } });
    }

    // ── SEND AGREEMENT ─────────────────────────────────────────────
    if (action === 'send') {
      const { agreement_id, actor } = body;
      const _agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = _agreements[0];

      // Check for unresolved merge fields
      if (agreement.merge_field_errors && agreement.merge_field_errors.length > 0) {
        return Response.json({ status: 'ERROR', error: 'Unresolved merge fields block sending', data: { errors: agreement.merge_field_errors } }, { status: 400 });
      }

      // Get recipients
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id });
      const requiredRecipients = recipients.filter(r => r.is_required !== false && r.role !== 'CC' && r.role !== 'VIEWER');
      if (requiredRecipients.length === 0) {
        return Response.json({ status: 'ERROR', error: 'No required recipients' }, { status: 400 });
      }

      // Update agreement status
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.Agreement.update(agreement_id, {
        status: AGREEMENT_STATES.SENT,
        sent_at: now,
        updated_at: now,
      });

      // Update B2B contract/org status if linked
      if (agreement.b2b_contract_id) {
        await base44.asServiceRole.entities.B2BContract.update(agreement.b2b_contract_id, { status: 'awaiting_signature' }).catch(() => {});
      }
      if (agreement.organization_id) {
        await base44.asServiceRole.entities.B2BOrganization.update(agreement.organization_id, { contract_status: 'awaiting_signature' }).catch(() => {});
      }

      // Send notifications to first-round recipients
      const sortedRecipients = [...recipients].sort((a, b) => (a.routing_order || 1) - (b.routing_order || 1));
      const firstOrder = sortedRecipients.length > 0 ? sortedRecipients[0].routing_order : 1;
      const firstRound = agreement.routing_type === 'sequential'
        ? sortedRecipients.filter(r => r.routing_order === firstOrder)
        : sortedRecipients.filter(r => r.role !== 'CC');

      for (const recipient of firstRound) {
        const signingUrl = buildSigningUrl(recipient.access_token);
        await sendAgreementEmail(base44, agreement, recipient, signingUrl, 'AGREEMENT_READY');

        await base44.asServiceRole.entities.AgreementRecipient.update(recipient.id, {
          status: 'NOTIFIED',
          notified_at: now,
        });
      }

      // CC recipients get a view-only notification
      const ccRecipients = recipients.filter(r => r.role === 'CC');
      for (const cc of ccRecipients) {
        await sendAgreementEmail(base44, agreement, cc, '', 'AGREEMENT_READY');
      }

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'AGREEMENT_SENT', {
        actor, actor_type: 'admin',
        metadata_json: { recipient_count: firstRound.length },
      });

      return Response.json({ status: 'OK', data: { sent_to: firstRound.length } });
    }

    // ── VOID AGREEMENT ─────────────────────────────────────────────
    if (action === 'void') {
      const { agreement_id, reason, actor } = body;
      const _agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = _agreements[0];
      if (isTerminal(agreement.status)) return Response.json({ status: 'ERROR', error: 'Agreement is already terminal' }, { status: 400 });

      const now = new Date().toISOString();
      await base44.asServiceRole.entities.Agreement.update(agreement_id, {
        status: AGREEMENT_STATES.VOIDED,
        voided_at: now,
        voided_reason: reason || '',
        voided_by: actor || 'system',
        updated_at: now,
      });

      // Revoke all recipient tokens
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id });
      for (const r of recipients) {
        await base44.asServiceRole.entities.AgreementRecipient.update(r.id, { token_revoked: true });
      }

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'AGREEMENT_VOIDED', {
        actor, actor_type: 'admin', metadata_json: { reason },
      });

      return Response.json({ status: 'OK' });
    }

    // ── DECLINE AGREEMENT (recipient action) ───────────────────────
    if (action === 'decline') {
      const { agreement_id, recipient_id, reason } = body;
      const _agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = _agreements[0];
      if (isTerminal(agreement.status)) return Response.json({ status: 'ERROR', error: 'Agreement is terminal' }, { status: 400 });

      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id, recipient_id });
      if (recipients.length === 0) return Response.json({ status: 'ERROR', error: 'Recipient not found' }, { status: 404 });

      const now = new Date().toISOString();
      await base44.asServiceRole.entities.AgreementRecipient.update(recipients[0].id, {
        status: 'DECLINED',
        declined_at: now,
        declined_reason: reason || '',
      });

      // Decline the agreement
      await base44.asServiceRole.entities.Agreement.update(agreement_id, {
        status: AGREEMENT_STATES.DECLINED,
        declined_at: now,
        declined_by: recipient_id,
        declined_reason: reason || '',
        updated_at: now,
      });

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'AGREEMENT_DECLINED', {
        recipient_id, actor: recipient_id, actor_type: 'recipient',
        metadata_json: { reason },
      });

      return Response.json({ status: 'OK' });
    }

    // ── SEND REMINDER ───────────────────────────────────────────────
    if (action === 'send_reminder') {
      const { agreement_id, recipient_id, reminder_number, actor } = body;
      const _agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const agreement = _agreements[0];
      if (isTerminal(agreement.status)) return Response.json({ status: 'OK', data: { skipped: true, reason: 'terminal' } });
      if (agreement.reminders_paused) return Response.json({ status: 'OK', data: { skipped: true, reason: 'paused' } });

      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id, recipient_id });
      if (recipients.length === 0) return Response.json({ status: 'ERROR', error: 'Recipient not found' }, { status: 404 });

      const recipient = recipients[0];
      if (recipient.status === 'COMPLETED' || recipient.status === 'SIGNED' || recipient.status === 'APPROVED' || recipient.status === 'DECLINED') {
        return Response.json({ status: 'OK', data: { skipped: true, reason: 'recipient_terminal' } });
      }

      const signingUrl = buildSigningUrl(recipient.access_token);
      await sendAgreementEmail(base44, agreement, recipient, signingUrl, 'AGREEMENT_REMINDER', reminder_number || 1);

      await logAgreementEvent(base44.asServiceRole, agreement_id, 'REMINDER_SENT', {
        recipient_id, actor: actor || 'system', actor_type: 'system',
        metadata_json: { reminder_number: reminder_number || 1 },
      });

      return Response.json({ status: 'OK' });
    }

    // ── PAUSE/RESUME REMINDERS ─────────────────────────────────────
    if (action === 'set_reminders_paused') {
      const { agreement_id, paused, actor } = body;
      await base44.asServiceRole.entities.Agreement.update(agreement_id, { reminders_paused: paused });
      return Response.json({ status: 'OK' });
    }

    // ── DUPLICATE AGREEMENT ────────────────────────────────────────
    if (action === 'duplicate') {
      const { agreement_id, actor } = body;
      const _sources = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
      if (_sources.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
      const source = _sources[0];

      const newAgreementId = generateAgreementId();
      const now = new Date().toISOString();
      await base44.asServiceRole.entities.Agreement.create({
        agreement_id: newAgreementId,
        name: `${source.name} (Copy)`,
        agreement_type: source.agreement_type,
        status: AGREEMENT_STATES.DRAFT,
        provider: source.provider,
        template_id: source.template_id,
        template_version_id: source.template_version_id,
        template_version_number: source.template_version_number,
        source_type: 'duplicate',
        source_agreement_id: agreement_id,
        organization_id: source.organization_id,
        b2b_contract_id: source.b2b_contract_id,
        b2b_contract_version_id: source.b2b_contract_version_id,
        b2b_commercial_snapshot_id: source.b2b_commercial_snapshot_id,
        b2b_quote_id: source.b2b_quote_id,
        b2b_quote_version_id: source.b2b_quote_version_id,
        sales_rep_id: source.sales_rep_id,
        sales_rep_email: source.sales_rep_email,
        routing_type: source.routing_type,
        document_type: source.document_type,
        document_body: source.document_body,
        document_file_uri: source.document_file_uri,
        document_file_name: source.document_file_name,
        source_document_hash: source.source_document_hash,
        prepared_document_hash: source.prepared_document_hash,
        merge_field_data_json: source.merge_field_data_json,
        reminder_schedule_hours: source.reminder_schedule_hours,
        created_by: actor || 'system',
        created_at: now,
        updated_at: now,
      });

      // Copy fields
      const fields = await base44.asServiceRole.entities.AgreementField.filter({ agreement_id });
      for (const field of fields) {
        const newFieldId = generateFieldId();
        await base44.asServiceRole.entities.AgreementField.create({
          ...field,
          agreement_id: newAgreementId,
          field_id: newFieldId,
          created_at: now,
        });
      }

      return Response.json({ status: 'OK', data: { agreement_id: newAgreementId } });
    }

    return Response.json({ status: 'ERROR', error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});

// ── HELPER: Send agreement email via Brevo ──────────────────────────
async function sendAgreementEmail(base44: any, agreement: any, recipient: any, signingUrl: string, type: string, reminderNumber: number = 0): Promise<void> {
  const subject = reminderNumber > 0
    ? `Reminder: ${agreement.name} — Action Required`
    : `${agreement.name} — Ready for Signature`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#1A1A1A;">${agreement.name}</h2>
      <p style="color:#1A1A1A;font-size:16px;">Hello ${recipient.name},</p>
      <p style="color:#1A1A1A;font-size:16px;">
        You have been asked to ${recipient.role === 'SIGNER' || recipient.role === 'INTERNAL_SIGNER' ? 'sign' : 'review'} the following agreement:
      </p>
      <div style="background:#FFFBF5;border:1px solid #B8956A;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;font-size:18px;font-weight:600;color:#1A1A1A;">${agreement.name}</p>
        <p style="margin:4px 0 0;font-size:14px;color:#1A1A1A60;">Type: ${agreement.agreement_type.replace(/_/g, ' ')}</p>
      </div>
      ${signingUrl ? `
        <a href="${signingUrl}" style="display:inline-block;background:#B8956A;color:#1A1A1A;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;margin:16px 0;">
          ${recipient.role === 'SIGNER' || recipient.role === 'INTERNAL_SIGNER' ? 'Review & Sign' : 'Review Document'}
        </a>
        <p style="color:#999;font-size:12px;">This link is unique to you. Do not share it with others.</p>
      ` : `
        <p style="color:#999;font-size:14px;">You are receiving this as a CC notification.</p>
      `}
      <p style="color:#999;font-size:12px;margin-top:32px;">
        Arriv Estate Media · Arriv Agreements<br/>
        This is an automated message. Do not reply.
      </p>
    </div>
  `;

  try {
    const result = await sendBrevoEmail({
      to: recipient.email,
      subject,
      htmlContent: html,
      senderName: 'Arriv Agreements',
      senderEmail: 'info@arrivestatemedia.com',
    });

    await base44.asServiceRole.entities.AgreementNotification.create({
      agreement_id: agreement.id,
      recipient_id: recipient.recipient_id,
      notification_type: type,
      channel: 'email',
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      subject,
      body_html: html,
      status: 'sent',
      provider_message_id: result?.messageId || '',
      sent_at: new Date().toISOString(),
      reminder_number: reminderNumber,
    });
  } catch (e: any) {
    await base44.asServiceRole.entities.AgreementNotification.create({
      agreement_id: agreement.id,
      recipient_id: recipient.recipient_id,
      notification_type: type,
      channel: 'email',
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      subject,
      body_html: html,
      status: 'failed',
      error_message: e.message,
      reminder_number: reminderNumber,
    });
  }
}