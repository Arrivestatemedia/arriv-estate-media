import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { bookingId, newPrice } = await req.json();

    if (!bookingId || newPrice === undefined) {
      return Response.json({ error: 'Booking ID and new price are required' }, { status: 400 });
    }

    // Update the booking total price
    const updatedBooking = await base44.asServiceRole.entities.Booking.update(bookingId, {
      total_price: newPrice
    });

    return Response.json({ success: true, booking: updatedBooking });
  } catch (error) {
    console.error('Error updating booking price:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});