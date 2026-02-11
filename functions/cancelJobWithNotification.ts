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
    const job = await base44.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.booked_by !== user.email) {
      return Response.json({ error: 'You can only cancel your own bookings' }, { status: 403 });
    }

    // If there's a backup, assign them as primary
    if (job.backup_booked_by) {
      // Get backup contractor's details
      const backupContractors = await base44.asServiceRole.entities.User.filter({ email: job.backup_booked_by });
      const backupContractor = backupContractors.length > 0 ? backupContractors[0] : null;
      
      // Update job
      await base44.entities.Job.update(jobId, {
        ...job,
        booked_by: job.backup_booked_by,
        booked_by_name: job.backup_booked_by_name,
        backup_booked_by: null,
        backup_booked_by_name: null,
        status: "booked",
      });

      // Send email to backup contractor
      await base44.integrations.Core.SendEmail({
        to: job.backup_booked_by,
        subject: `You've been assigned to: ${job.title}`,
        body: `Great news! The primary contractor for "${job.title}" has cancelled, and you've been assigned as the main contractor for this job.\n\nLocation: ${job.location}\nDate: ${job.date}\nTime: ${job.start_time}\nPay: $${job.pay_rate}\n\nPlease confirm your availability.`,
      });

      // Send SMS via Twilio if backup has phone
      if (backupContractor?.phone_number) {
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (accountSid && authToken && twilioPhone) {
          const auth = btoa(`${accountSid}:${authToken}`);
          await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: twilioPhone,
              To: backupContractor.phone_number,
              Body: `You've been assigned to: ${job.title} on ${job.date} at ${job.start_time}. Pay: $${job.pay_rate}`,
            }).toString(),
          });
        }
      }
    } else {
      // No backup, just return to open
      await base44.entities.Job.update(jobId, {
        ...job,
        booked_by: null,
        booked_by_name: null,
        status: "open",
      });
    }

    return Response.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});