import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { jobId, phoneNumber, contractorName } = body;

    if (!jobId || !phoneNumber) {
      return Response.json({ error: 'Job ID and phone number are required' }, { status: 400 });
    }

    // Get job details
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Send SMS to backup contractor
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

    const message = `Hi ${contractorName}! You've been added as a BACKUP for this job:\n\nJob: ${job.title}\nLocation: ${job.location}\nDate: ${job.date}\nTime: ${job.start_time || 'TBD'}\nPay: $${job.pay_rate}\n\nYou'll be notified if the primary contractor cancels.`;

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
          To: phoneNumber,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to send SMS");
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Backup notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});