import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, jobData, mediaPartnerEmail } = await req.json();

    if (!jobId || !jobData || !mediaPartnerEmail) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Update the job entity
    await base44.asServiceRole.entities.Job.update(jobId, jobData);

    // Invoke the calendar event creation function
    await base44.asServiceRole.functions.invoke('createJobCalendarEvent', {
      job: jobData,
      mediaPartnerEmail: mediaPartnerEmail,
    });

    return Response.json({ success: true, message: 'Job booked and calendar invite sent' });
  } catch (error) {
    console.error('Error in bookJobAndSendCalendarInvite:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});