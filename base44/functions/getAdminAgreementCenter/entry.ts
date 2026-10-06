import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { filters, limit, offset } = body;

    const filter: any = {};
    if (filters?.status) filter.status = filters.status;
    if (filters?.agreement_type) filter.agreement_type = filters.agreement_type;
    if (filters?.organization_id) filter.organization_id = filters.organization_id;
    if (filters?.sales_rep_id) filter.sales_rep_id = filters.sales_rep_id;

    const agreements = await base44.asServiceRole.entities.Agreement.filter(filter, '-updated_at', limit || 100);

    // Enrich with org/contract names and recipient counts
    const result = [];
    for (const agreement of agreements) {
      let orgName = '';
      if (agreement.organization_id) {
        const _orgs = await base44.asServiceRole.entities.B2BOrganization.filter({ organization_id: agreement.organization_id }).catch(() => []);
        const org = _orgs[0];
        orgName = org?.display_name || org?.legal_name || '';
      }

      const recipients = await base44.asServiceRole.entities.AgreementRecipient.filter({ agreement_id: agreement.agreement_id });
      const required = recipients.filter(r => r.is_required !== false && r.role !== 'CC' && r.role !== 'VIEWER');
      const completed = required.filter(r => r.status === 'COMPLETED' || r.status === 'SIGNED' || r.status === 'APPROVED');

      result.push({
        agreement_id: agreement.agreement_id,
        id: agreement.id,
        name: agreement.name,
        agreement_type: agreement.agreement_type,
        status: agreement.status,
        provider: agreement.provider,
        organization_id: agreement.organization_id,
        organization_name: orgName,
        b2b_contract_id: agreement.b2b_contract_id,
        sales_rep_email: agreement.sales_rep_email,
        created_at: agreement.created_at,
        sent_at: agreement.sent_at,
        completed_at: agreement.completed_at,
        expires_at: agreement.expires_at,
        required_count: required.length,
        completed_count: completed.length,
        recipient_summary: recipients.map(r => ({
          name: r.name,
          email: r.email,
          role: r.role,
          status: r.status,
          is_viewing_now: r.status === 'VIEWING' && r.viewing_session_expires_at && new Date(r.viewing_session_expires_at) > new Date(),
        })),
      });
    }

    // Get templates
    const templates = await base44.asServiceRole.entities.AgreementTemplate.filter({ status: 'active' }, '-updated_at', 50);

    return Response.json({
      status: 'OK',
      data: {
        agreements: result,
        templates: templates.map(t => ({
          template_id: t.template_id,
          id: t.id,
          name: t.name,
          category: t.category,
          document_type: t.document_type,
          current_version_number: t.current_version_number,
        })),
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});