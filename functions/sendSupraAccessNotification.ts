import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { format, parse as parseDate } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();

    if (!jobId) {
      return Response.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Get the job details
    const job = await base44.asServiceRole.entities.Job.get(jobId);

    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.client_phone || !job.booked_by_name || !job.booked_by_phone) {
      return Response.json({ error: 'Missing required job data' }, { status: 400 });
    }

    // Format the date and time
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    const formattedDate = format(jobDate, 'MMMM d, yyyy');
    const formattedTime = job.start_time || '9:00 AM';

    // Create the message
    const message = `Your Photographer/Videographer ${job.booked_by_name} will be seeing you on ${formattedDate} at ${formattedTime}.

If you do not plan on being on site please make sure that you have granted Supra access to the number below:

${job.booked_by_phone}

Please see attached document for instructions on how to add Temporary access in Supra.`;

    // Send SMS to client
    const formattedPhone = job.client_phone.startsWith('+') ? job.client_phone : `+1${job.client_phone}`;
    
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromPhone,
        To: formattedPhone,
        Body: message,
      }).toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Twilio error:', error);
      return Response.json({ error: 'Failed to send SMS' }, { status: 500 });
    }

    const result = await response.json();

    // Log the message
    await base44.asServiceRole.entities.MessageLog.create({
      message_type: 'sms',
      recipient_type: 'client',
      recipient_phone: job.client_phone,
      message_content: message,
      job_id: jobId,
      status: 'success'
    });

    return Response.json({ success: true, messageId: result.sid });
  } catch (error) {
    console.error('Error sending Supra access notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});