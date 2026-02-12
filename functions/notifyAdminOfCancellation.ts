import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { jobId, contractorName, contractorEmail, hasBackup, backupName, backupEmail } = body;

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get job details
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Send SMS to admin
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");
    const toPhone = "4047891107";

    let message = `🚨 JOB CANCELLATION 🚨\n\nContractor: ${contractorName} (${contractorEmail})\n\nJob: ${job.title}\nLocation: ${job.location}\nDate: ${job.date}\nTime: ${job.start_time || 'TBD'}\nPay: $${job.pay_rate}`;

    if (hasBackup) {
      message += `\n\n✅ BACKUP ASSIGNED: ${backupName} (${backupEmail})`;
    } else {
      message += `\n\n❌ NO BACKUP - Job returned to board`;
    }

    const response = await fetch(
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

    if (!response.ok) {
      throw new Error("Failed to send SMS");
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Admin notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});