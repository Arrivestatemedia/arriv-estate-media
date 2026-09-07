import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { ensureEditingTasksForJob } from '../../shared/editingQueueEngine.ts';

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

    // Check if job already exists for this booking
    const existingJobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    
    if (!existingJobs || existingJobs.length === 0) {
      const newJob = await base44.asServiceRole.entities.Job.create({
        title: `Photography - ${propertyAddress}`,
        type: 'photo',
        description: `Property: ${propertyAddress}\nPackage: ${booking.package}\nNotes: ${booking.notes || 'N/A'}`,
        location: propertyAddress,
        state: booking.state,
        date: booking.preferred_date,
        start_time: booking.preferred_time,
        duration_hours: 2,
        pay_rate: contractorPayRate,
        client_price: booking.total_price,
        status: 'open',
        production_status: 'awaiting_capture',
        capture_status: 'pending',
        source_upload_status: 'not_started',
        delivery_status: 'pending',
        media_partner_fulfillment_status: 'pending',
        from_booking: true,
        booking_id: bookingId,
        package: booking.package,
        add_ons: booking.add_ons || [],
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone
      });

      // ── EDITING QUEUE INTEGRATION ──
      // Create EditingTasks at job creation time (WAITING_FOR_UPLOAD status).
      // Idempotent: if tasks already exist for this job, returns existing.
      // Tasks will be released to READY_FOR_EDITING when source media is uploaded.
      try {
        await ensureEditingTasksForJob(base44, newJob, 'system');
      } catch (editErr) {
        console.error('Editing task creation failed for job', newJob.id, ':', editErr.message);
      }
    }

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