import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    const booking = await base44.entities.Booking.get(bookingId);

    await base44.asServiceRole.entities.Job.create({
      title: `Photography - ${booking.property_address}`,
      type: 'photo',
      description: `Property: ${booking.property_address}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
      location: booking.property_address,
      date: booking.preferred_date,
      start_time: booking.preferred_time,
      duration_hours: 2,
      pay_rate: booking.total_price,
      status: 'booked',
      booked_by: user.email,
      booked_by_name: user.full_name
    });

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Send approval email to customer
    await base44.integrations.Core.SendEmail({
      to: booking.client_email,
      subject: 'Your Booking Has Been Approved',
      body: `Hi ${booking.client_name},\n\nGreat news! Your booking request for ${booking.property_address} on ${booking.preferred_date} has been approved and assigned to our team.\n\nPackage: ${booking.package}\nTotal Price: $${booking.total_price}\n\nThank you for choosing us!`
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});