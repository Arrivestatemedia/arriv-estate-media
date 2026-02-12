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
    
    // Ensure required fields are present
    if (!booking.street_address) {
      if (booking.property_address) {
        const parts = booking.property_address.split(',').map(p => p.trim());
        updateData.street_address = parts[0] || 'N/A';
      } else {
        updateData.street_address = 'N/A';
      }
    }
    
    if (!booking.city) {
      if (booking.property_address) {
        const parts = booking.property_address.split(',').map(p => p.trim());
        updateData.city = parts[parts.length - 2] || 'N/A';
      } else {
        updateData.city = 'N/A';
      }
    }
    
    if (!booking.state) {
      if (booking.property_address) {
        const parts = booking.property_address.split(',').map(p => p.trim());
        updateData.state = parts[parts.length - 1] || 'N/A';
      } else {
        updateData.state = 'N/A';
      }
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, updateData);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});