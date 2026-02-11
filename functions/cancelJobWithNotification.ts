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

    // --- DIAGNOSTIC CODE ---
    try {
      const testUsers = await base44.asServiceRole.entities.User.list();
      console.log(`[DIAGNOSTIC] Successfully fetched ${testUsers.length} users via asServiceRole`);
    } catch (diagnosticError) {
      console.error('[DIAGNOSTIC] Failed to list users via asServiceRole:', diagnosticError);
      return Response.json({ error: `[DIAGNOSTIC] asServiceRole failed: ${diagnosticError.message}` }, { status: 500 });
    }
    // --- END DIAGNOSTIC ---

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

      // Send SMS to Bradley's number (always)
      // Send SMS notifications
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      const message = `Hi ${job.backup_booked_by_name}! You've been assigned to: ${job.title} on ${job.date} at ${job.start_time}. Pay: $${job.pay_rate}. - Arriv`;

      if (accountSid && authToken && twilioPhone) {
        const auth = btoa(`${accountSid}:${authToken}`);
        
        // Always send to Bradley's number
        await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: twilioPhone,
            To: '4047891107',
            Body: message,
          }).toString(),
        });

        // Send SMS to backup contractor if not Bradley
        if (job.backup_booked_by !== 'BradCBurke@arrivestatemedia.com' && job.backup_booked_by_phone) {
          await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioPhone,
              To: job.backup_booked_by_phone,
              Body: message,
            }).toString(),
          });
        }
      }
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
        phoneNumbers: [job.backup_booked_by_phone, '4047891107']
      });
    }

    return Response.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    console.error('Cancel job error:', error);
    return Response.json({ error: `Failed to cancel job: ${error.message}` }, { status: 500 });
  }
});