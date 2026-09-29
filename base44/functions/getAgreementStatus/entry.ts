import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { agreement_id } = body;

    const agreements = await base44.asServiceRole.entities.Agreement.filter({ agreement_id });
    if (agreements.length === 0) return Response.json({ status: 'ERROR', error: 'Agreement not found' }, { status: 404 });
    const agreement = agreements[0];

    const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreement.id });
    const fields = await base44.asServiceRole.entities.AgreementField.filter({ agreement_id: agreement.id });
    const events = await base44.asServiceRole.entities.AgreementEvent.filter({ agreement_id: agreement.id }, 'timestamp', 200);

    // Check for stale presence (viewing sessions that have expired)
    const now = new Date();
    const refreshedRecipients = [];
    for (const r of recipients) {
      if (r.status === 'VIEWING' && r.viewing_session_expires_at && new Date(r.viewing_session_expires_at) < now) {
        await base44.asServiceRole.entities.AgreementRecipient.update(r.id, { status: 'OPENED' });
        refreshedRecipients.push({ ...r, status: 'OPENED' });
      } else {
        refreshedRecipients.push(r);
      }
    }

    return Response.json({
      status: 'OK',
      data: {
        agreement: {
          id: agreement.id,
          agreement_id: agreement.agreement_id,
          name: agreement.name,
          agreement_type: agreement.agreement_type,
          status: agreement.status,
          provider: agreement.provider,
          routing_type: agreement.routing_type,
          document_type: agreement.document_type,
          created_at: agreement.created_at,
          sent_at: agreement.sent_at,
          completed_at: agreement.completed_at,
          expires_at: agreement.expires_at,
          organization_id: agreement.organization_id,
          b2b_contract_id: agreement.b2b_contract_id,
          b2b_contract_version_id: agreement.b2b_contract_version_id,
          b2b_commercial_snapshot_id: agreement.b2b_commercial_snapshot_id,
          template_id: agreement.template_id,
          template_version_number: agreement.template_version_number,
          merge_field_errors: agreement.merge_field_errors,
          reminders_paused: agreement.reminders_paused,
          completion_certificate_id: agreement.completion_certificate_id,
        },
        recipients: refreshedRecipients.map(r => ({
          recipient_id: r.recipient_id,
          name: r.name,
          email: r.email,
          role: r.role,
          status: r.status,
          routing_order: r.routing_order,
          is_required: r.is_required,
          consent_status: r.consent_status,
          notified_at: r.notified_at,
          opened_at: r.opened_at,
          completed_at: r.completed_at,
          declined_at: r.declined_at,
          declined_reason: r.declined_reason,
          viewing_session_expires_at: r.viewing_session_expires_at,
          is_viewing_now: r.status === 'VIEWING' && r.viewing_session_expires_at && new Date(r.viewing_session_expires_at) > new Date(),
        })),
        fields: fields.map(f => ({
          field_id: f.field_id,
          recipient_id: f.recipient_id,
          field_type: f.field_type,
          label: f.label,
          required: f.required,
        })),
        events: events.map(e => ({
          event_type: e.event_type,
          timestamp: e.timestamp,
          recipient_id: e.recipient_id,
          actor: e.actor,
        })),
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});