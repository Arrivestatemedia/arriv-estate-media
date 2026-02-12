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

    // Store backup info before updating
    const backupEmail = job.backup_booked_by;
    const backupName = job.backup_booked_by_name;
    const backupPhone = job.backup_booked_by_phone;

    // If there's a backup, assign them as primary
    if (backupEmail) {
      // Update job - promote backup to primary
      const updateData = {
        booked_by: backupEmail,
        booked_by_name: backupName,
        status: "booked"
      };
      
      await base44.asServiceRole.entities.Job.update(jobId, updateData);
      
      // Clear backup fields in a separate update
      await base44.asServiceRole.entities.Job.update(jobId, {
        backup_booked_by: null,
        backup_booked_by_name: null,
        backup_booked_by_phone: null
      });

      // Send notification to backup contractor
      if (backupPhone) {
        const bookingForNotification = {
          client_name: backupName,
          client_email: backupEmail,
          property_address: job.location,
          preferred_date: job.date,
          preferred_time: job.start_time,
          package: job.type
        };

        await base44.asServiceRole.functions.invoke('sendBookingNotifications', {
          booking: bookingForNotification,
          type: 'cancellation',
          phoneNumbers: [backupPhone, '4047891107'],
          sendEmail: backupName !== 'Bradley Burke'
        });
      }
    } else {
      // No backup, return to open
      await base44.asServiceRole.entities.Job.update(jobId, {
        booked_by: null,
        booked_by_name: null,
        status: "open"
      });
    }

    return Response.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Cancel job error:', error);
    return Response.json({ error: `Failed to cancel job: ${error.message}` }, { status: 500 });
  }
});