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

    // Add 1 day to the booking date to fix timezone shift
    const dateObj = new Date(booking.preferred_date);
    dateObj.setDate(dateObj.getDate() + 1);
    const adjustedDate = dateObj.toISOString().split('T')[0];

    // Get admin's phone from environment variable
    const adminPhone = Deno.env.get('ADMIN_PHONE') || '';

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

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'approved' });

    // Get the created job ID
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    const jobId = jobs?.[0]?.id;
    const job = jobs?.[0];

    // Create Google Drive folder for the job
    let folderUrl = null;
    if (job) {
      try {
        const folderResult = await base44.asServiceRole.functions.invoke('createGoogleDriveFolderForJob', {
          jobAddress: propertyAddress,
          mediaPartnerEmail: user.email,
        });
        folderUrl = folderResult.data?.folderUrl;
        console.log('Google Drive folder created:', folderUrl);

        // Update job with Google Drive folder URL
        await base44.asServiceRole.entities.Job.update(jobId, {
          google_drive_folder_url: folderUrl
        });
      } catch (error) {
        console.error('Failed to create Google Drive folder:', error.message);
      }
    }

    // Send approval email and calendar invite using existing functions
    try {
      await base44.asServiceRole.functions.invoke('sendBookingNotifications', { booking });
      await base44.asServiceRole.functions.invoke('createCalendarEvent', { booking });

      // Send Supra access notification
      if (jobId) {
        await base44.asServiceRole.functions.invoke('sendSupraAccessNotification', { jobId });
      }
    } catch (error) {
      console.error('Failed to send notifications:', error);
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});