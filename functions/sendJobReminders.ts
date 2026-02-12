import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { formatInTimeZone, toZonedTime, zonedTimeToUtc } from 'npm:date-fns-tz@3.0.0';

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
      const tz = 'America/New_York';

      // Create job datetime in NY timezone
      const jobDateString = jobDate.toISOString().split('T')[0];
      const jobDatetimeString = `${jobDateString}T${jobTime}:00`;
      const jobDatetimeNY = new Date(jobDatetimeString);
      
      // Get the job datetime in NY timezone
      const jobDatetimeNYZoned = toZonedTime(jobDatetimeNY, tz);
      
      // Convert NY time to UTC for comparison
      const zonedToUtc = (zonedDate) => {
        const utcString = zonedDate.toLocaleString('en-US', {
          timeZone: 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        return new Date(utcString.replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6'));
      };
      
      const jobDatetimeUTC = zonedToUtc(jobDatetimeNY);

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
              job_id: job.id,
              reminder_type: reminder.type,
              status: 'success'
            });
          }

          // Send email to media partner
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
              job_id: job.id,
              reminder_type: reminder.type,
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
              jobId: job.id
            });
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'sms',
              recipient_type: 'client',
              recipient_phone: job.client_phone,
              message_content: clientSms,
              job_id: job.id,
              reminder_type: reminder.type,
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
              job_id: job.id,
              reminder_type: reminder.type,
              status: 'success'
            });
          }
        } else if (reminder.type === '24_hours_before') {
           // Send to media partner only
           const message = `Reminder: Your shoot is in 24 hours at ${jobTime}. Address: ${job.location}`;
           if (job.booked_by_phone) {
             await base44.asServiceRole.functions.invoke('sendReminderSMS', {
               phone: job.booked_by_phone,
               message,
               recipientType: 'media_partner',
               jobId: job.id
             });
             await base44.asServiceRole.entities.MessageLog.create({
               message_type: 'sms',
               recipient_type: 'media_partner',
               recipient_phone: job.booked_by_phone,
               message_content: message,
               job_id: job.id,
               reminder_type: reminder.type,
               status: 'success'
             });
           }
        } else if (reminder.type === '90_minutes_before') {
           // Send to media partner
           const message = `Reminder: Your shoot starts in 1.5 hours at ${jobTime}. Make sure you're on your way to ${job.location}`;
           if (job.booked_by_phone) {
             await base44.asServiceRole.functions.invoke('sendReminderSMS', {
               phone: job.booked_by_phone,
               message,
               recipientType: 'media_partner',
               jobId: job.id
             });
             await base44.asServiceRole.entities.MessageLog.create({
               message_type: 'sms',
               recipient_type: 'media_partner',
               recipient_phone: job.booked_by_phone,
               message_content: message,
               job_id: job.id,
               reminder_type: reminder.type,
               status: 'success'
             });
           }
        } else if (reminder.type === '1_hour_before') {
          // Send to client
          if (job.client_phone) {
            const clientMessage = `Your media partner ${job.booked_by_name || job.booked_by} is on the way to ${job.location}. The shoot starts in 1 hour.`;
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: job.client_phone,
              message: clientMessage,
              recipientType: 'client',
              jobId: job.id
            });
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'sms',
              recipient_type: 'client',
              recipient_phone: job.client_phone,
              message_content: clientMessage,
              job_id: job.id,
              reminder_type: reminder.type,
              status: 'success'
            });
          }

          // Send to admin (only if not booked by admin)
          const adminEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@example.com';
          if (job.booked_by !== adminEmail) {
            const adminPhone = Deno.env.get('ADMIN_PHONE') || '4047891107';
            const adminMessage = `Your media partner ${job.booked_by_name || job.booked_by} is on the way to ${job.location}. The shoot starts in 1 hour. Check in with them to confirm everything is set up and ready.`;
            await base44.asServiceRole.functions.invoke('sendReminderSMS', {
              phone: adminPhone,
              message: adminMessage,
              recipientType: 'admin',
              jobId: job.id
            });
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'sms',
              recipient_type: 'admin',
              recipient_phone: adminPhone,
              message_content: adminMessage,
              job_id: job.id,
              reminder_type: reminder.type,
              status: 'success'
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