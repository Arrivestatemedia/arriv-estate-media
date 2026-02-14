import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, jobData, mediaPartnerEmail } = await req.json();

    if (!jobId || !jobData || !mediaPartnerEmail) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get the media partner's phone number (or admin's if media partner doesn't exist)
    let bookedByPhone = jobData.booked_by_phone || '';
    
    if (!bookedByPhone && mediaPartnerEmail) {
      const mediaPartners = await base44.asServiceRole.entities.User.filter({ email: mediaPartnerEmail });
      bookedByPhone = mediaPartners?.[0]?.phone_number || '';
    }

    // Update the job entity with booked_by_phone
    const updatedJob = await base44.asServiceRole.entities.Job.update(jobId, {
      ...jobData,
      booked_by_phone: bookedByPhone
    });

    // Invoke the calendar event creation function
    await base44.asServiceRole.functions.invoke('createJobCalendarEvent', {
      job: { ...updatedJob, id: jobId },
      mediaPartnerEmail: mediaPartnerEmail,
    });

    // Send Supra access notification to client immediately when booked
    try {
      const supraResult = await base44.asServiceRole.functions.invoke('sendSupraAccessNotification', {
        jobId: jobId
      });
      console.log('Supra notification sent:', supraResult);
    } catch (error) {
      console.error('Failed to send Supra notification:', error.message, error.response?.data);
    }

    return Response.json({ success: true, message: 'Job booked and calendar invite sent' }, { status: 200 });
  } catch (error) {
    console.error('Error in bookJobAndSendCalendarInvite:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});