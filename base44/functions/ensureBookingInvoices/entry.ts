import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Safety-net function: finds bookings that should have invoices but don't,
// and generates them. Catches failures no matter how the booking was created.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Look back 7 days to catch recent failures without digging up ancient history
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffISO = sevenDaysAgo.toISOString();

    // Fetch recent bookings (up to 500)
    const bookings = await base44.asServiceRole.entities.Booking.list('-created_date', 500);

    // Filter: missing invoice, not denied/cancelled, created within last 7 days
    const missingInvoiceBookings = bookings.filter(b =>
      !b.invoice_id &&
      b.status !== 'denied' &&
      b.status !== 'cancelled' &&
      b.created_date >= cutoffISO
    );

    const results = [];
    for (const booking of missingInvoiceBookings) {
      try {
        if (booking.request_pay_at_closing) {
          await base44.asServiceRole.functions.invoke('generatePayAtClosingInvoice', { bookingId: booking.id });
        } else {
          await base44.asServiceRole.functions.invoke('generatePayUpFrontInvoice', {
            bookingId: booking.id,
            booking,
            total_price: booking.total_price
          });
        }
        results.push({ bookingId: booking.id, client: booking.client_name, status: 'fixed' });
      } catch (error) {
        results.push({ bookingId: booking.id, client: booking.client_name, status: 'failed', error: error.message });
      }
    }

    return Response.json({
      checked: bookings.length,
      missingInvoices: missingInvoiceBookings.length,
      fixed: results.filter(r => r.status === 'fixed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results
    });
  } catch (error) {
    console.error('ensureBookingInvoices error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});