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

    // Contractor pricing mapping
    const contractorPackagePricing = {
      'mls_walkthrough': 90,
      'photo_essentials': 175,
      'photo_cinematic': 275,
      'premium_bundle': 300
    };

    const contractorAddonPricing = {
      'drone': 75,
      '3d_tour': 75,
      'twilight': 50,
      'vertical_reel': 20,
      'ai_staging': 0,
      'rush_delivery': 0
    };

    // Calculate contractor pay rate
    const packageRate = contractorPackagePricing[booking.package] || 0;
    let addonsTotal = 0;
    
    if (booking.add_ons && Array.isArray(booking.add_ons)) {
      addonsTotal = booking.add_ons.reduce((sum, addon) => {
        return sum + (contractorAddonPricing[addon] || 0);
      }, 0);
    }

    const contractorPayRate = packageRate + addonsTotal;

    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    await base44.asServiceRole.entities.Job.create({
      title: `Photography - ${propertyAddress}`,
      type: 'photo',
      description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
      location: propertyAddress,
      date: booking.preferred_date,
      start_time: booking.preferred_time,
      duration_hours: 2,
      pay_rate: contractorPayRate,
      client_price: booking.total_price,
      status: 'open',
      from_booking: true,
      booking_id: bookingId,
      package: booking.package,
      add_ons: booking.add_ons || [],
      client_name: booking.client_name,
      client_email: booking.client_email,
      client_phone: booking.client_phone
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