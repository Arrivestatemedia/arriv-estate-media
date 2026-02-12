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

    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    await base44.asServiceRole.entities.Job.create({
      title: `Photography - ${propertyAddress}`,
      type: 'photo',
      description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
      location: propertyAddress,
      date: booking.preferred_date,
      start_time: booking.preferred_time,
      duration_hours: 2,
      pay_rate: booking.total_price,
      status: 'booked',
      booked_by: user.email,
      booked_by_name: user.full_name,
      from_booking: true
    });

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email and calendar invite using existing functions
    try {
      await base44.asServiceRole.functions.invoke('sendBookingNotifications', { booking });
      await base44.asServiceRole.functions.invoke('createCalendarEvent', { booking });
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});