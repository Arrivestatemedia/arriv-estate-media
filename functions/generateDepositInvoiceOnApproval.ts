import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { bookingId, actionType } = await req.json();
    
    // Get booking
    const booking = await base44.asServiceRole.entities.Booking.get(bookingId);
    
    if (!booking) {
      return Response.json({ error: 'Booking not found' }, { status: 404 });
    }
    
    // For post_to_job_board: create job and update booking status
    if (actionType === 'post_to_job_board') {
      console.log('Posting booking to job board:', bookingId);
      
      const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
      
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
      
      // Check if job already exists
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
      
      // Update booking status
      await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });
    } 
    // For accept_for_myself: create job as booked and update booking status
    else if (actionType === 'accept_for_myself') {
      console.log('Accepting booking for myself:', bookingId);
      
      const propertyAddress = `${booking.street_address}, ${booking.city}, ${booking.state}`;
      const adminPhone = Deno.env.get('ADMIN_PHONE') || '';
      
      // Add 1 day to booking date to fix timezone shift
      const dateObj = new Date(booking.preferred_date);
      dateObj.setDate(dateObj.getDate() + 1);
      const adjustedDate = dateObj.toISOString().split('T')[0];
      
      await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        date: adjustedDate,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: booking.total_price,
        status: 'booked',
        booked_by: user.email,
        booked_by_name: user.full_name,
        booked_by_phone: adminPhone,
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        from_booking: true,
        booking_id: bookingId
      });
      
      // Update booking status
      await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });
    }
    
    return Response.json({ 
      success: true,
      message: 'Action completed'
    });

  } catch (error) {
    console.error('Error:', error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      response: error.response?.data,
      config: error.config?.url
    });
    return Response.json({ error: error.message, details: error.response?.data }, { status: 500 });
  }
});