import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    // Delete associated jobs when reverting to pending
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    console.log(`Found ${jobs.length} jobs for booking ${bookingId}`);
    
    for (const job of jobs) {
      console.log(`Deleting job ${job.id}`);
      await base44.asServiceRole.entities.Job.delete(job.id);
    }

    await base44.asServiceRole.entities.Booking.update(bookingId, { status: 'pending' });
    console.log(`Booking ${bookingId} reverted to pending`);

    return Response.json({ success: true, deletedJobCount: jobs.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});