import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { bookingDate, bookingTime } = await req.json();

    if (!bookingDate || !bookingTime) {
      return Response.json({ error: 'Missing bookingDate or bookingTime' }, { status: 400 });
    }

    // Check if any confirmed or pending bookings exist for this date/time combo
    const existingBookings = await base44.asServiceRole.entities.Booking.filter({
      preferred_date: bookingDate,
      preferred_time: bookingTime,
      status: { $in: ['pending', 'confirmed', 'approved'] }
    });

    if (existingBookings.length > 0) {
      return Response.json({ available: false, message: 'This time slot is already booked' });
    }

    return Response.json({ available: true });
  } catch (error) {
    console.error('Error checking time slot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});