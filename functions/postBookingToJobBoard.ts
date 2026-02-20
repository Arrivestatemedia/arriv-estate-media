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

    // Contractor pricing
    const contractorPackagePricing = {
      'mls_walkthrough': 60,
      'photo_essentials': 150,
      'photo_cinematic': 250,
      'premium_bundle': 325
    };

    const contractorAddonPricing = {
      'drone': 60,
      '3d_tour': 60,
      'twilight': 40,
      'vertical_reel': 25,
      'ai_staging': 0,
      'rush_delivery': 0
    };

    const packageRate = contractorPackagePricing[booking.package] || 0;
    let addonsTotal = 0;
    if (booking.add_ons && Array.isArray(booking.add_ons)) {
      addonsTotal = booking.add_ons.reduce((sum, addon) => {
        return sum + (contractorAddonPricing[addon] || 0);
      }, 0);
    }
    const contractorPayRate = packageRate + addonsTotal;
    const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;

    // Create job if doesn't exist
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    if (!existingJobs || existingJobs.length === 0) {
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
    }

    // Generate invoice (this sends email via Brevo)
    await base44.asServiceRole.functions.invoke('generatePayUpFrontInvoice', {
      bookingId,
      booking,
      total_price: booking.total_price
    });

    // If pay-at-closing, mark the invoice
    if (booking.request_pay_at_closing) {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ booking_id: bookingId });
      if (invoices && invoices.length > 0) {
        await base44.asServiceRole.entities.Invoice.update(invoices[0].id, {
          pay_at_closing: true,
          invoice_type: 'deposit'
        });
      }
    }

    // Update booking status
    await base44.asServiceRole.entities.Booking.update(bookingId, {
      status: 'approved'
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[ERROR]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});