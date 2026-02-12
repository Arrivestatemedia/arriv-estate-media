import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }

    const updateData = { status: 'pending' };
    
    // Parse property_address if it exists and split fields are empty
    if (booking.property_address && (!booking.street_address || !booking.city || !booking.state)) {
      const parts = booking.property_address.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        updateData.street_address = parts[0];
        updateData.city = parts[parts.length - 2];
        updateData.state = parts[parts.length - 1];
      }
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, updateData);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});