import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Check authentication - only allow admin
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all jobs that are completed but footage not uploaded
    const jobs = await base44.asServiceRole.entities.Job.filter({
      media_partner_status: 'job_completed',
      footage_uploaded: false
    });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    const jobsNeedingReminder = jobs.filter(job => {
      if (!job.completed_at) return false;
      if (job.footage_reminder_sent_at) return false; // Already sent reminder
      
      const completedAt = new Date(job.completed_at);
      return completedAt <= twentyFourHoursAgo;
    });

    console.log(`Found ${jobsNeedingReminder.length} jobs needing footage upload reminders`);

    for (const job of jobsNeedingReminder) {
      try {
        // Send SMS via Twilio
        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
        
        const message = `Hi ${job.booked_by_name}! Your footage has not been uploaded. Please remember to upload your footage and return to the app to confirm.`;
        
        const formattedPhone = job.booked_by_phone.startsWith('+') ? job.booked_by_phone : `+1${job.booked_by_phone}`;
        
        await fetch('https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
          },
          body: new URLSearchParams({
            'From': twilioPhone,
            'To': formattedPhone,
            'Body': message,
          }).toString(),
        });

        // Send email via Gmail
        const accessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
        const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'BradCBurke@arrivestatemedia.com';
        
        const emailBody = `Hi ${job.booked_by_name}!\n\nYour footage has not been uploaded for the job at ${job.location}.\n\nPlease remember to upload your footage and return to the app to confirm.\n\nThank you!`;
        
        const email = [
          `To: ${job.booked_by}`,
          `From: ${adminEmail}`,
          `Subject: Reminder: Upload Your Footage`,
          `MIME-Version: 1.0`,
          `Content-Type: text/plain; charset="UTF-8"`,
          '',
          emailBody
        ].join('\r\n');
        
        const encodedMessage = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: encodedMessage })
        });

        // Mark reminder as sent
        await base44.asServiceRole.entities.Job.update(job.id, {
          footage_reminder_sent_at: now.toISOString()
        });

        // Log the messages
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'sms',
          recipient_type: 'media_partner',
          recipient_phone: job.booked_by_phone,
          message_content: message,
          job_id: job.id,
          status: 'success'
        });

        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'media_partner',
          recipient_email: job.booked_by,
          message_content: emailBody,
          subject: 'Reminder: Upload Your Footage',
          job_id: job.id,
          status: 'success'
        });

        console.log(`Sent footage reminder for job ${job.id} to ${job.booked_by_name}`);
      } catch (error) {
        console.error(`Failed to send reminder for job ${job.id}:`, error);
      }
    }

    return Response.json({ 
      success: true, 
      remindersSent: jobsNeedingReminder.length 
    });
  } catch (error) {
    console.error('Error in sendFootageUploadReminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});