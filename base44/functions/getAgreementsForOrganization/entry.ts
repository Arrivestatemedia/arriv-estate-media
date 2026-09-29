import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { organization_id, user_email } = body;

    // Get agreements for this organization
    const filter: any = {};
    if (organization_id) filter.organization_id = organization_id;
    const agreements = await base44.asServiceRole.entities.Agreement.filter(filter, '-updated_at', 200);

    // For each agreement, get recipient summary
    const result = [];
    for (const agreement of agreements) {
      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreement.agreement_id });
      const required = recipients.filter(r => r.is_required !== false && r.role !== 'CC' && r.role !== 'VIEWER');
      const completed = required.filter(r => r.status === 'COMPLETED' || r.status === 'SIGNED' || r.status === 'APPROVED');

      // Check if this user is a recipient
      const userRecipient = recipients.find(r => r.email.toLowerCase() === (user_email || '').toLowerCase());

      result.push({
        agreement_id: agreement.agreement_id,
        id: agreement.id,
        name: agreement.name,
        agreement_type: agreement.agreement_type,
        status: agreement.status,
        created_at: agreement.created_at,
        sent_at: agreement.sent_at,
        completed_at: agreement.completed_at,
        expires_at: agreement.expires_at,
        template_id: agreement.template_id,
        b2b_contract_id: agreement.b2b_contract_id,
        required_count: required.length,
        completed_count: completed.length,
        user_recipient: userRecipient ? {
          recipient_id: userRecipient.recipient_id,
          role: userRecipient.role,
          status: userRecipient.status,
        } : null,
      });
    }

    return Response.json({ status: 'OK', data: { agreements: result } });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});