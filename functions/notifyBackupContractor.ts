import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { jobId, phoneNumber } = body;

    if (!jobId || !phoneNumber) {
      return Response.json({ error: 'Job ID and phone number are required' }, { status: 400 });
    }

    // Get the job
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Send SMS notification
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    
    const messageText = `Congratulations! You've been assigned to: ${job.title} at ${job.location} on ${job.date} at ${job.start_time}. Pay: $${job.pay_rate}. - Arriv`;
    
    await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
      },
      body: new URLSearchParams({
        'From': twilioPhone,
        'To': phoneNumber,
        'Body': messageText,
      }).toString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Notify backup error:', error);
    return Response.json({ error: `Failed to send notification: ${error.message}` }, { status: 500 });
  }
});