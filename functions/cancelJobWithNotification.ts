import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId, reason } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }



    // Get the job
    let job;
    try {
      job = await base44.asServiceRole.entities.Job.get(jobId);
    } catch (error) {
      console.error('Error fetching job:', error);
      return Response.json({ error: `Failed to fetch job: ${error.message}` }, { status: 500 });
    }
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.booked_by !== user.email) {
      return Response.json({ error: 'You can only cancel your own bookings' }, { status: 403 });
    }

    // If there's a backup, assign them as primary
    if (job.backup_booked_by) {
      // Update job
      await base44.asServiceRole.entities.Job.update(jobId, {
        ...job,
        booked_by: job.backup_booked_by,
        booked_by_name: job.backup_booked_by_name,
        backup_booked_by: null,
        backup_booked_by_name: null,
        status: "booked",
      });


    } else {
      // No backup, just return to open
      await base44.asServiceRole.entities.Job.update(jobId, {
        ...job,
        booked_by: null,
        booked_by_name: null,
        status: "open",
      });
    }

    // Send cancellation notification to backup contractor if one exists
    if (job.backup_booked_by && job.backup_booked_by_phone) {
      const bookingForNotification = {
        client_name: job.backup_booked_by_name,
        client_email: job.backup_booked_by,
        property_address: job.location,
        preferred_date: job.date,
        preferred_time: job.start_time,
        package: job.type
      };

      await base44.asServiceRole.functions.invoke('sendBookingNotifications', {
        booking: bookingForNotification,
        type: 'cancellation',
        phoneNumbers: [job.backup_booked_by_phone, '4047891107'],
        sendEmail: job.backup_booked_by_name !== 'Bradley Burke'
      });
    }

    return Response.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Cancel job error:', error);
    return Response.json({ error: `Failed to cancel job: ${error.message}` }, { status: 500 });
  }
});