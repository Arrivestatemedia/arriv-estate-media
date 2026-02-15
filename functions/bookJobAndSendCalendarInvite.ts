import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, jobData, mediaPartnerEmail } = await req.json();

    if (!jobId || !jobData || !mediaPartnerEmail) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Look up media partner's phone number from User entity if not already set
    if (!jobData.booked_by_phone && mediaPartnerEmail) {
      const users = await base44.asServiceRole.entities.User.filter({ email: mediaPartnerEmail });
      console.log('User lookup result:', users);
      if (users?.[0]?.phone_number) {
        jobData.booked_by_phone = users[0].phone_number;
        console.log('Set booked_by_phone:', jobData.booked_by_phone);
      } else {
        console.log('No phone number found for user:', mediaPartnerEmail);
      }
    }
    // Create Google Drive folder for the job
    let folderUrl = null;
    try {
      const folderResult = await base44.asServiceRole.functions.invoke('createGoogleDriveFolderForJob', {
        jobAddress: jobData.location || (await base44.asServiceRole.entities.Job.get(jobId)).location,
        mediaPartnerEmail: mediaPartnerEmail,
      });
      folderUrl = folderResult.data?.folderUrl;
      console.log('Google Drive folder created for job:', folderUrl);
    } catch (error) {
      console.error('Failed to create Google Drive folder:', error.message);
      // Don't fail the booking if folder creation fails
    }

    // Update job with Google Drive folder URL
    jobData.google_drive_folder_url = folderUrl;
    const updatedJob = await base44.asServiceRole.entities.Job.update(jobId, jobData);

    // Invoke the calendar event creation function
    await base44.asServiceRole.functions.invoke('createJobCalendarEvent', {
      job: { ...updatedJob, id: jobId },
      mediaPartnerEmail: mediaPartnerEmail,
      folderUrl: folderUrl,
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