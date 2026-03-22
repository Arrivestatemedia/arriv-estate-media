import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { jobId, reason } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.booked_by) {
      return Response.json({ error: 'This job is not currently booked' }, { status: 400 });
    }

    // Check if cancellation is within 1 hour of job start (Eastern Time)
    if (job.date && job.start_time) {
      const jobDateTime = new Date(`${job.date}T${job.start_time}`);
      const now = new Date();
      const hoursDiff = (jobDateTime - now) / (1000 * 60 * 60);
      
      if (hoursDiff <= 1 && hoursDiff >= 0) {
        return Response.json({ 
          error: 'Cannot cancel within 1 hour of job start. Please call (678) 242-9107 immediately.',
          tooLate: true
        }, { status: 400 });
      }
    }

    // Store original contractor info for notification
    const contractorName = job.booked_by_name;
    const contractorEmail = job.booked_by;
    const hasBackup = !!job.backup_booked_by;
    const backupName = job.backup_booked_by_name;
    const backupEmail = job.backup_booked_by;

    // Check if there's a backup contractor
    if (job.backup_booked_by) {
      // Assign backup to main position
      await base44.asServiceRole.entities.Job.update(jobId, {
        booked_by: job.backup_booked_by,
        booked_by_name: job.backup_booked_by_name,
        booked_by_phone: job.backup_booked_by_phone,
        backup_booked_by: null,
        backup_booked_by_name: null,
        backup_booked_by_phone: null
      });
    } else {
      // No backup - set job back to open
      await base44.asServiceRole.entities.Job.update(jobId, {
        status: 'open',
        booked_by: null,
        booked_by_name: null,
        booked_by_phone: null,
        backup_booked_by: null,
        backup_booked_by_name: null,
        backup_booked_by_phone: null
      });
    }

    // Send admin notification
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
    const toPhone = "4047891107";

    let message = `🚨 JOB CANCELLATION 🚨\n\nContractor: ${contractorName} (${contractorEmail})`;
    if (reason) {
      message += `\nReason: ${reason}`;
    }
    message += `\n\nJob: ${job.title}\nLocation: ${job.location}\nDate: ${job.date}\nTime: ${job.start_time || 'TBD'}\nPay: $${job.pay_rate}`;

    if (hasBackup) {
      message += `\n\n✅ BACKUP ASSIGNED: ${backupName} (${backupEmail})`;
    } else {
      message += `\n\n❌ NO BACKUP - Job returned to board`;
    }

    try {
      const smsResponse = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: fromPhone,
            To: toPhone,
            Body: message,
          }),
        }
      );

      // Log the message
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'admin',
        recipient_phone: toPhone,
        message_content: message,
        job_id: jobId,
        status: smsResponse.ok ? 'success' : 'failed',
        error_message: smsResponse.ok ? null : `HTTP ${smsResponse.status}`
      });
    } catch (notifyError) {
      console.error('Failed to send admin notification:', notifyError);
      // Log the failure but don't block the cancellation
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'admin',
        recipient_phone: toPhone,
        message_content: message,
        job_id: jobId,
        status: 'failed',
        error_message: notifyError.message
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'You are no longer assigned to this job'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    return Response.json({ error: `Failed to cancel job: ${error.message}` }, { status: 500 });
  }
});