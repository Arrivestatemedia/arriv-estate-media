import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { formatInTimeZone, toZonedTime } from 'npm:date-fns-tz@3.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all jobs
    const jobs = await base44.asServiceRole.entities.Job.list();
    const now = new Date();

    for (const job of jobs) {
      if (!job.date || job.status === 'cancelled') continue;

      // Get the job date/time in user's timezone (America/New_York)
      const jobDate = new Date(job.date);
      const jobTime = job.start_time ? job.start_time : '09:00';
      const [jobHour, jobMinute] = jobTime.split(':').map(Number);

      // Create job datetime in NY timezone
      const jobDateString = jobDate.toISOString().split('T')[0];
      const jobDatetimeString = `${jobDateString}T${jobTime}:00`;
      const jobDatetimeNY = new Date(jobDatetimeString);
      
      // Convert NY time to UTC
      const tz = 'America/New_York';
      const jobDatetimeUTC = toZonedTime(jobDatetimeNY, tz);

      // Calculate reminder times
      const reminders = [
        {
          type: '9am_morning',
          check: () => {
            const nowNY = toZonedTime(now, tz);
            const jobDateNY = toZonedTime(jobDate, tz);
            const isSameDay = nowNY.toDateString() === jobDateNY.toDateString();
            const isAfter9am = nowNY.getHours() >= 9;
            const isWithin9amWindow = nowNY.getHours() === 9 && nowNY.getMinutes() < 5;
            return isSameDay && (isAfter9am && isWithin9amWindow);
          }
        },
        {
          type: '24_hours_before',
          check: () => {
            const diff = jobDatetimeUTC.getTime() - now.getTime();
            return diff > 23.5 * 60 * 60 * 1000 && diff < 24.5 * 60 * 60 * 1000;
          }
        },
        {
          type: '90_minutes_before',
          check: () => {
            const diff = jobDatetimeUTC.getTime() - now.getTime();
            return diff > 85 * 60 * 1000 && diff < 95 * 60 * 1000;
          }
        },
        {
          type: '1_hour_before',
          check: () => {
            const diff = jobDatetimeUTC.getTime() - now.getTime();
            return diff > 55 * 60 * 1000 && diff < 65 * 60 * 1000;
          }
        }
      ];

      for (const reminder of reminders) {
        if (!reminder.check()) continue;

        // Check if reminder already sent
        const existingReminders = await base44.asServiceRole.entities.JobReminder.filter({
          job_id: job.id,
          reminder_type: reminder.type
        });

        if (existingReminders.length > 0) continue;

        // Send appropriate reminders
        if (reminder.type === '9am_morning') {
          // Send to client and media partner
          const message = `Reminder: Your shoot is scheduled for today at ${jobTime}. Address: ${job.location}`;
          const emailBody = `Your shoot with Arriv Estate Media is scheduled for today at ${jobTime}.\n\nLocation: ${job.location}\n\nPlease confirm you'll be available.`;

          // Send to media partner
          if (job.booked_by_phone) {
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: job.booked_by_phone,
              message: `${message}\n\nClient will be notified shortly.`
            });
          }

          // Send email to media partner
          if (job.booked_by) {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: job.booked_by,
              subject: 'Shoot Reminder - Today at ' + jobTime,
              body: emailBody
            });
          }

          // Send SMS to client
          if (job.client_phone) {
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: job.client_phone,
              message: `${message}`
            });
          }

          // Send email to client
          if (job.client_email) {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: job.client_email,
              subject: 'Shoot Reminder - Today at ' + jobTime,
              body: emailBody
            });
          }
        } else if (reminder.type === '24_hours_before') {
          // Send to media partner only
          const message = `Reminder: Your shoot is in 24 hours at ${jobTime}. Address: ${job.location}`;
          if (job.booked_by_phone) {
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: job.booked_by_phone,
              message
            });
          }
        } else if (reminder.type === '90_minutes_before') {
          // Send to media partner
          const message = `Reminder: Your shoot starts in 1.5 hours at ${jobTime}. Make sure you're on your way to ${job.location}`;
          if (job.booked_by_phone) {
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: job.booked_by_phone,
              message
            });
          }
        } else if (reminder.type === '1_hour_before') {
          // Send to admin (only if not booked by admin)
          const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@example.com';
          if (job.booked_by !== adminEmail) {
            const message = `Your media partner ${job.booked_by_name || job.booked_by} is on the way to ${job.location}. The shoot starts in 1 hour. Check in with them to confirm everything is set up and ready.`;
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: '4047891107',
              message
            });
          }
        }

        // Record that reminder was sent
        await base44.asServiceRole.entities.JobReminder.create({
          job_id: job.id,
          reminder_type: reminder.type,
          sent_at: new Date().toISOString()
        });
      }
    }

    return Response.json({ success: true, message: 'Job reminders processed' });
  } catch (error) {
    console.error('Error sending job reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});