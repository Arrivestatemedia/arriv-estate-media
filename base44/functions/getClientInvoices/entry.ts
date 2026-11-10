import { createClientFromRequest } from 'npm:@base44/sdk@0.8.57';
import { requireCustomer } from '../../shared/customerSession.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

/**
 * getClientInvoices
 * Lists the invoices and receipts belonging to one client, for the client portal.
 *
 * Auth: clients sign in with a PendingSignup credential and hold a localStorage
 * session, not a Base44 session, so ownership is verified by matching the
 * supplied email against each invoice's client_email (the same pattern as
 * getJobMediaForClient). Only the fields the portal displays are returned.
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Ownership comes from the signed customer session. A clientEmail in the body is
    // ignored, so naming another customer's address can no longer return their invoices.
    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const emailLower = auth.actor.email;
    const clientEmail = emailLower;

    const rows = await base44.asServiceRole.entities.Invoice.filter(customerEmailQuery('client_email', emailLower), '-created_date', 500);

    const invoices = rows
      .filter((inv) => (inv.client_email || '').trim().toLowerCase() === emailLower)
      .filter((inv) => !inv.certification_mode && !String(inv.client_email || '').includes('cert.arriv.internal'))
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
      .map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number || '',
        invoiceType: inv.invoice_type || '',
        address: inv.job_address || inv.property_address || '',
        package: inv.package || '',
        amount: inv.amount || 0,
        status: inv.payment_status || 'unpaid',
        payAtClosing: !!inv.pay_at_closing,
        invoiceDate: inv.invoice_date || inv.created_date || null,
        paidAt: inv.paid_at || null,
        viewUrl: inv.google_drive_unpaid_url || inv.tracked_link_url || '',
        receiptUrl: inv.google_drive_paid_url || '',
        payLinkUrl: inv.stripe_payment_link_url || '',
      }));

    return Response.json({ invoices });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}