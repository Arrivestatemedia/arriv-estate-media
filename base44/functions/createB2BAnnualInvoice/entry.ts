import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildB2BAnnualInvoiceMetadata, INVOICE_SOURCE } from '../../shared/b2bBillingEngine.ts';
import { buildLockedConfigSnapshots, getLockedConfigSnapshots } from '../../shared/b2bContractVersionLock.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { organization_id, actor } = await req.json();

    const org = await base44.asServiceRole.entities.B2BOrganization.get(organization_id);
    if (!org) return Response.json({ status: 'ERROR', error: 'Organization not found' }, { status: 404 });

    const contracts = await base44.asServiceRole.entities.B2BContract.filter({ organization_id });
    const contract = contracts.find((c: any) => ['active', 'live', 'awaiting_payment', 'implementing'].includes(c.status));
    if (!contract) return Response.json({ status: 'ERROR', error: 'No active contract' }, { status: 400 });

    if (contract.billing_frequency !== 'annual_prepaid') {
      return Response.json({ status: 'ERROR', error: 'Contract is not annual prepaid' }, { status: 400 });
    }

    // Idempotency: check if annual invoice already exists for this contract
    const existingInvoices = await base44.asServiceRole.entities.Invoice.filter({
      booking_id: `b2b_annual_${contract.id}`,
    });
    if (existingInvoices.length > 0) {
      return Response.json({ status: 'OK', data: { idempotent: true, invoice_id: existingInvoices[0].id } });
    }

    const lockedSnapshots = contract.contract_version_id
      ? await getLockedConfigSnapshots(base44.asServiceRole, contract.contract_version_id)
      : await buildLockedConfigSnapshots(base44.asServiceRole);

    const invoiceMeta = buildB2BAnnualInvoiceMetadata(org, contract, lockedSnapshots);

    // Create invoice using existing invoice infrastructure with B2B source context
    const invoice = await base44.asServiceRole.entities.Invoice.create({
      booking_id: `b2b_annual_${contract.id}`,
      client_email: org.billing_contact_email,
      client_name: org.display_name || org.legal_name,
      job_address: 'B2B Annual Contract (no property address)',
      amount: invoiceMeta.total_amount,
      package: invoiceMeta.description,
      payment_status: 'unpaid',
      invoice_type: 'b2b_annual_contract',
      invoice_source: INVOICE_SOURCE.B2B_ANNUAL_CONTRACT,
      b2b_organization_id: org.id,
      b2b_contract_id: contract.id,
      b2b_contract_version_id: contract.contract_version_id || '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: `B2B Annual Prepaid Contract — ${invoiceMeta.plan_id}\nAnnual Amount: $${invoiceMeta.annual_amount}\nImplementation: $${invoiceMeta.implementation_fee}\nDeployment: $${invoiceMeta.deployment_fee}\nSeat Charges: $${invoiceMeta.seat_charges}`,
    });

    await base44.asServiceRole.entities.B2BAuditLog.create({
      actor: actor || 'system',
      actor_type: 'admin',
      action: 'B2B_ANNUAL_INVOICE_CREATED',
      reason: `Annual invoice created for ${org.display_name || org.legal_name}`,
      entity_type: 'Invoice',
      entity_id: invoice.id,
      after_snapshot: JSON.stringify(invoiceMeta),
      timestamp: new Date().toISOString(),
    });

    return Response.json({ status: 'OK', data: { invoice_id: invoice.id, invoice_meta: invoiceMeta } });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});