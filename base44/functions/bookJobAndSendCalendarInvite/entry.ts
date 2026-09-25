import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, jobData, mediaPartnerEmail } = await req.json();

    if (!jobId || !jobData || !mediaPartnerEmail) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Enforce 2-job limit without the purchased shirt & jacket
    try {
      const partnerUsers = await base44.asServiceRole.entities.User.filter({ email: mediaPartnerEmail });
      const partner = partnerUsers[0];
      if (partner && !partner.apparelPurchased) {
        const accepted = await base44.asServiceRole.entities.Job.filter({ booked_by: mediaPartnerEmail });
        const acceptedCount = accepted.filter(j =>
          ['booked', 'in_progress', 'completed', 'archived'].includes(j.status)
        ).length;
        if (acceptedCount >= 2) {
          return Response.json({
            error: 'You must purchase your shirt & jacket before accepting more jobs.',
            code: 'APPAREL_REQUIRED'
          }, { status: 403 });
        }
      }
    } catch (e) {
      console.error('Apparel eligibility check failed:', e.message);
    }

    // Server-side capability enforcement — provider must have all required capabilities
    try {
      const job = await base44.asServiceRole.entities.Job.get(jobId);
      const requiredCaps = job.required_capabilities || [];
      if (requiredCaps.length > 0) {
        const partnerUsers = await base44.asServiceRole.entities.User.filter({ email: mediaPartnerEmail });
        const partner = partnerUsers[0];
        const verifiedCaps = partner?.verified_capabilities || [];
        const missing = requiredCaps.filter(cap => !verifiedCaps.includes(cap));
        if (missing.length > 0) {
          return Response.json({
            error: `You lack the required capabilities for this job: ${missing.join(', ')}. Please contact Arriv to get verified.`,
            code: 'CAPABILITY_REQUIRED'
          }, { status: 403 });
        }
      }
    } catch (e) {
      console.error('Capability check failed:', e.message);
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
    // Strip date/time fields — never let the frontend overwrite these to prevent timezone shift bugs
    const { date, start_time, ...safeJobData } = jobData;
    safeJobData.google_drive_folder_url = folderUrl;
    const updatedJob = await base44.asServiceRole.entities.Job.update(jobId, safeJobData);

    // Invoke the calendar event creation function
    await base44.asServiceRole.functions.invoke('createJobCalendarEvent', {
      job: { ...updatedJob, id: jobId },
      mediaPartnerEmail: mediaPartnerEmail,
      folderUrl: folderUrl,
    });

    return Response.json({ success: true, message: 'Job booked and calendar invite sent' }, { status: 200 });
  } catch (error) {
    console.error('Error in bookJobAndSendCalendarInvite:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});