import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { jobId } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    const backupEmail = job.backup_booked_by;
    const backupName = job.backup_booked_by_name;
    const backupPhone = job.backup_booked_by_phone;

    // If there's a backup, assign them as primary
    if (backupEmail) {
      await base44.asServiceRole.entities.Job.update(jobId, {
        booked_by: backupEmail,
        booked_by_name: backupName,
        backup_booked_by: null,
        backup_booked_by_name: null,
        backup_booked_by_phone: null,
        status: "booked"
      });

      // Send notification to admin
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      
      const adminMessage = `Job "${job.title}" at ${job.location} on ${job.date} was reassigned to backup contractor: ${backupName}`;
      
      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
        },
        body: new URLSearchParams({
          'From': twilioPhone,
          'To': '4047891107',
          'Body': adminMessage,
        }).toString(),
      });

      return Response.json({ 
        success: true, 
        reassignedTo: 'backup',
        backupInfo: {
          email: backupEmail,
          name: backupName,
          phone: backupPhone
        }
      });
    } else {
      // No backup, return to open
      await base44.asServiceRole.entities.Job.update(jobId, {
        booked_by: null,
        booked_by_name: null,
        status: "open"
      });

      // Send notification to admin
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
      
      const adminMessage = `Job "${job.title}" at ${job.location} on ${job.date} is now available on the job board`;
      
      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
        },
        body: new URLSearchParams({
          'From': twilioPhone,
          'To': '4047891107',
          'Body': adminMessage,
        }).toString(),
      });

      return Response.json({ 
        success: true, 
        reassignedTo: 'jobBoard'
      });
    }
  } catch (error) {
    console.error('Reassign job error:', error);
    return Response.json({ error: `Failed to reassign job: ${error.message}` }, { status: 500 });
  }
});