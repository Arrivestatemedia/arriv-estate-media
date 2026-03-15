import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin only
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { invoiceId, skipNotifications } = await req.json();
    if (!invoiceId) {
      return Response.json({ error: 'invoiceId required' }, { status: 400 });
    }

    const invoices = await base44.asServiceRole.entities.Invoice.filter({ id: invoiceId });
    const invoice = invoices[0];
    if (!invoice) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.payment_status === 'paid') {
      return Response.json({ success: true, message: 'Invoice already marked as paid' });
    }

    // Mark as paid
    await base44.asServiceRole.entities.Invoice.update(invoiceId, {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    });

    // Also unlock the booking if linked
    if (invoice.booking_id) {
      await base44.asServiceRole.entities.Booking.update(invoice.booking_id, {
        payment_locked: false,
        status: 'approved',
      }).catch(() => {});
    }

    console.log('[manualMarkInvoicePaid] Marked invoice as paid:', invoiceId, 'skipNotifications:', skipNotifications);

    if (!skipNotifications) {
      // Run the full post-payment flow (receipt, drive move, email, SMS, etc.)
      const result = await base44.asServiceRole.functions.invoke('processPaymentConfirmation', { invoiceId });
      console.log('[manualMarkInvoicePaid] processPaymentConfirmation result:', result);
      return Response.json({ success: true, message: 'Invoice marked as paid and receipt sent' });
    }

    return Response.json({ success: true, message: 'Invoice marked as paid (no notifications sent)' });
  } catch (error) {
    console.error('[manualMarkInvoicePaid] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});