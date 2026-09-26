import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

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

    // Notify the client that their job has been booked by a Media Specialist
    try {
      const partnerDisplayName = (() => {
        const full = updatedJob.booked_by_name || jobData.booked_by_name || '';
        const parts = full.trim().split(/\s+/);
        if (parts.length === 0 || !parts[0]) return 'your Media Specialist';
        if (parts.length === 1) return parts[0];
        return `${parts[0]} ${parts[parts.length - 1][0]}.`;
      })();

      const clientFirstName = (updatedJob.client_name || '').split(' ')[0] || 'there';
      const shootDate = updatedJob.date || '';
      const shootTime = updatedJob.start_time || '';
      const whenStr = [shootDate, shootTime].filter(Boolean).join(' at ');

      const smsMessage = `Hi ${clientFirstName}! Your job at ${updatedJob.location || 'your property'}${whenStr ? ` on ${whenStr}` : ''} has been booked by ${partnerDisplayName}, your Arriv Media Specialist. We'll let you know when they're on the way. Thank you for choosing Arriv!`;

      const emailSubject = 'Your Arriv Job Has Been Booked!';
      const emailBody = `Hi ${clientFirstName},\n\nGreat news — your job at ${updatedJob.location || 'your property'}${whenStr ? ` on ${whenStr}` : ''} has been booked by ${partnerDisplayName}, your Arriv Media Specialist.\n\nWe'll send you another notification when they're on the way to the shoot. If you have any questions in the meantime, feel free to reach out.\n\nThank you for choosing Arriv!\n\nArriv Team`;

      // SMS via Twilio
      if (updatedJob.client_phone) {
        const formattedPhone = updatedJob.client_phone.startsWith('+') ? updatedJob.client_phone : `+1${updatedJob.client_phone}`;
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        try {
          const smsResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${btoa(`${accountSid}:${authToken}`)}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              From: fromPhone,
              To: formattedPhone,
              Body: smsMessage,
            }).toString(),
          });
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'sms',
            recipient_type: 'client',
            recipient_phone: updatedJob.client_phone,
            message_content: smsMessage,
            job_id: jobId,
            status: smsResponse.ok ? 'success' : 'failed',
          });
        } catch (smsErr) {
          console.error('Client booking SMS failed:', smsErr.message);
        }
      }

      // Email via Brevo (from info@arrivestatemedia.com)
      if (updatedJob.client_email) {
        try {
          await sendBrevoEmail({
            to: updatedJob.client_email,
            subject: emailSubject,
            textContent: emailBody,
            senderEmail: 'info@arrivestatemedia.com',
            senderName: 'Arriv Estate Media',
          });
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'client',
            recipient_email: updatedJob.client_email,
            message_content: emailBody,
            subject: emailSubject,
            job_id: jobId,
            status: 'success',
          });
        } catch (emailErr) {
          console.error('Client booking email failed:', emailErr.message);
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'client',
            recipient_email: updatedJob.client_email,
            message_content: emailBody,
            subject: emailSubject,
            job_id: jobId,
            status: 'failed',
            error_message: emailErr.message,
          });
        }
      }
    } catch (notifyErr) {
      console.error('Client booking notification failed:', notifyErr.message);
    }

    return Response.json({ success: true, message: 'Job booked and calendar invite sent' }, { status: 200 });
  } catch (error) {
    console.error('Error in bookJobAndSendCalendarInvite:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});