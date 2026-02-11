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

    // Delete associated jobs created from this booking
    if (booking.status === 'approved') {
      const jobs = await base44.asServiceRole.entities.Job.filter({ from_booking: true });
      const matchingJobs = jobs.filter(job => 
        job.title.includes(booking.property_address) && 
        job.date === booking.preferred_date
      );
      
      for (const job of matchingJobs) {
        await base44.asServiceRole.entities.Job.delete(job.id);
      }
    }

    // Delete the booking
    await base44.asServiceRole.entities.Booking.delete(bookingId);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});