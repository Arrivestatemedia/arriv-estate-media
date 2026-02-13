import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    // Delete associated jobs created from this booking
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    for (const job of jobs) {
      await base44.asServiceRole.entities.Job.delete(job.id);
    }

    // Delete the booking
    await base44.asServiceRole.entities.Booking.delete(bookingId);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});