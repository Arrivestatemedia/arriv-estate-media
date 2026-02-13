import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.0.0';
import { format, parse as parseDate } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId } = await req.json();
    
    if (!jobId) {
      return Response.json({ error: 'Job ID required' }, { status: 400 });
    }

    const tz = 'America/New_York';
    
    // Mock current time as 9:02 AM ET today
    const now = new Date();
    const mockNow = new Date(now);
    mockNow.setHours(9, 2, 0, 0);
    
    const job = await base44.asServiceRole.entities.Job.get(jobId);
    
    if (!job) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!job.booked_by) {
      return Response.json({ error: 'Job not booked' }, { status: 400 });
    }

    // Parse job date and time
    const jobDate = parseDate(job.date, 'yyyy-MM-dd', new Date());
    let jobTime = job.start_time || '09:00';

    // Normalize to 24-hour format
    if (jobTime.includes('AM') || jobTime.includes('PM')) {
      const cleaned = jobTime.replace(/\s*(AM|PM)/i, '');
      const [hour, minute] = cleaned.split(':').map(Number);
      const isPM = jobTime.toUpperCase().includes('PM');
      let h = hour;
      if (isPM && h !== 12) h += 12;
      if (!isPM && h === 12) h = 0;
      jobTime = `${String(h).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
    }

    const [jobHour, jobMinute] = jobTime.split(':').map(Number);
    jobDate.setHours(jobHour, jobMinute, 0, 0);
    const jobDatetimeUTC = fromZonedTime(jobDate, tz);

    const mockNowNY = toZonedTime(mockNow, tz);
    const isSameDay = format(mockNowNY, 'yyyy-MM-dd') === format(jobDate, 'yyyy-MM-dd');

    if (!isSameDay || mockNowNY.getHours() !== 9) {
      return Response.json({ error: 'Not 9am on job day - test conditions not met' }, { status: 400 });
    }

    // Check if 9am reminder already sent
    const existingReminders = await base44.asServiceRole.entities.JobReminder.filter({
      job_id: jobId,
      reminder_type: '9am_morning'
    });

    if (existingReminders.length > 0) {
      return Response.json({ error: 'Reminder already sent for this job', existingReminders }, { status: 400 });
    }

    // Send to media partner
    const message = `Reminder: Your shoot is scheduled for today at ${jobTime}. Address: ${job.location}`;
    const emailBody = `Your shoot with Arriv Estate Media is scheduled for today at ${jobTime}.\n\nLocation: ${job.location}\n\nPlease confirm you'll be available.`;

    if (job.booked_by_phone) {
      const smsMsg = `${message}\n\nClient will be notified shortly.`;
      await base44.asServiceRole.functions.invoke('sendReminderSMS', {
        phone: job.booked_by_phone,
        message: smsMsg
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'media_partner',
        recipient_phone: job.booked_by_phone,
        message_content: smsMsg,
        job_id: jobId,
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

    if (job.booked_by) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: job.booked_by,
        subject: 'Shoot Reminder - Today at ' + jobTime,
        body: emailBody
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'media_partner',
        recipient_email: job.booked_by,
        message_content: emailBody,
        subject: 'Shoot Reminder - Today at ' + jobTime,
        job_id: jobId,
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

    // Send SMS to client
    if (job.client_phone) {
      const clientSms = `${message}`;
      await base44.asServiceRole.functions.invoke('sendReminderSMS', {
        phone: job.client_phone,
        message: clientSms,
        recipientType: 'client',
        jobId: jobId
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'client',
        recipient_phone: job.client_phone,
        message_content: clientSms,
        job_id: jobId,
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

    // Send email to client
    if (job.client_email) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: job.client_email,
        subject: 'Shoot Reminder - Today at ' + jobTime,
        body: emailBody
      });
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'email',
        recipient_type: 'client',
        recipient_email: job.client_email,
        message_content: emailBody,
        subject: 'Shoot Reminder - Today at ' + jobTime,
        job_id: jobId,
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

    // Record reminder
    await base44.asServiceRole.entities.JobReminder.create({
      job_id: jobId,
      reminder_type: '9am_morning',
      sent_at: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      message: '9am reminder sent successfully',
      jobId,
      jobTime,
      mediaPartnerEmail: job.booked_by,
      clientEmail: job.client_email
    });
  } catch (error) {
    return Response.json({ 
      error: error.message
    }, { status: 500 });
  }
});