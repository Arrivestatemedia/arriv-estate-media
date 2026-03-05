import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { bookingId } = await req.json();

    // First, fetch all jobs associated with this booking
    const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
    
    // Delete all associated jobs (cascade delete)
    const deletedJobIds = [];
    if (jobs && jobs.length > 0) {
      for (const job of jobs) {
        try {
          await base44.asServiceRole.entities.Job.delete(job.id);
          deletedJobIds.push(job.id);
        } catch (jobError) {
          console.error(`Failed to delete job ${job.id}:`, jobError);
        }
      }
    }

    // Cancel any unpaid invoices linked to this booking so reminders don't go out
    try {
      const invoices = await base44.asServiceRole.entities.Invoice.filter({ booking_id: bookingId, payment_status: 'unpaid' });
      for (const invoice of invoices || []) {
        await base44.asServiceRole.entities.Invoice.update(invoice.id, { payment_status: 'cancelled' });
      }
    } catch (invoiceError) {
      console.error('Failed to cancel invoices for booking:', invoiceError);
    }

    // Then delete the booking
    try {
      await base44.asServiceRole.entities.Booking.delete(bookingId);
    } catch (bookingError) {
      console.error(`Failed to delete booking ${bookingId}:`, bookingError);
      return Response.json({ 
        error: 'Failed to delete booking after deleting jobs',
        deletedJobIds 
      }, { status: 500 });
    }

    return Response.json({ success: true, deletedJobIds, bookingId });
  } catch (error) {
    console.error('Delete operation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});