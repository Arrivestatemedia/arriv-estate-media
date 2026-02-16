import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { bookingId, customText, numericPrice } = await req.json();

    if (!bookingId || (customText === undefined && numericPrice === undefined)) {
      return Response.json({ error: 'Booking ID and either custom text or numeric price are required' }, { status: 400 });
    }

    const updateData = {};
    if (customText !== undefined) {
      updateData.custom_price_text = customText;
    }
    if (numericPrice !== undefined) {
      updateData.total_price = numericPrice;
      updateData.custom_price_text = null; // Clear custom text if setting numeric price
    }

    // Update the booking price
    const updatedBooking = await base44.asServiceRole.entities.Booking.update(bookingId, updateData);

    return Response.json({ success: true, booking: updatedBooking });
  } catch (error) {
    console.error('Error updating booking price:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});