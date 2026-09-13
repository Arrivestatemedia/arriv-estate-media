import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { toZonedTime, zonedTimeToUtc, fromZonedTime } from 'npm:date-fns-tz@3.0.0';
import { parse as parseDate, format } from 'npm:date-fns@3.6.0';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';

function convertTo12HourFormat(time24) {
  const [hour, minute] = time24.split(':').map(Number);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

async function sendEmailViaGmail(accessToken, to, subject, body) {
  const message = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
  const encodedMessage = btoa(message);
  
  const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedMessage
    })
  });
  
  if (!response.ok) {
    throw new Error(`Gmail send failed: ${response.statusText}`);
  }
  
  return response.json();
}

Deno.serve(async (req) => {
              try {
                const base44 = createClientFromRequest(req);
                const tz = 'America/New_York';
                const now = new Date();
                const nowNY = toZonedTime(now, tz);

                // Get Gmail access token
                let gmailAccessToken;
                try {
                  gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
                } catch (e) {
                  console.log('Gmail not available');
                }

          // Get all open, booked, or in_progress jobs
          let jobs = [];
          try {
            jobs = await base44.asServiceRole.entities.Job.list();
            jobs = jobs.filter(j => !['cancelled', 'archived', 'completed'].includes(j.status));
          } catch (e) {
            return Response.json({ error: `Failed to fetch jobs: ${e.message}` }, { status: 500 });
          }

          for (const job of jobs) {
            if (!job.date || !job.booked_by) continue;

            // Parse job date and time
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

            // Build job datetime correctly: parse date parts + time parts, then convert from ET to UTC
            const [jobYear, jobMonth, jobDay] = job.date.split('-').map(Number);
            const [jobHour, jobMinute] = jobTime.split(':').map(Number);
            // fromZonedTime expects a plain Date representing wall-clock time in the given tz
            const jobDatetimeUTC = fromZonedTime(new Date(jobYear, jobMonth - 1, jobDay, jobHour, jobMinute, 0, 0), tz);
            const jobDate = toZonedTime(jobDatetimeUTC, tz);

            const timeDiffMs = jobDatetimeUTC.getTime() - now.getTime();
            const timeDiffMinutes = timeDiffMs / (1000 * 60);
            const isSameDay = format(nowNY, 'yyyy-MM-dd') === format(jobDate, 'yyyy-MM-dd');

            const reminders = [
              {
                type: '9am_morning',
                shouldSend: () => {
                  // Send at 9am ET on job day (9:00-9:15 window)
                  return isSameDay && nowNY.getHours() === 9 && nowNY.getMinutes() < 15;
                }
              },
              {
                type: '24_hours_before',
                shouldSend: () => timeDiffMinutes > 1350 && timeDiffMinutes <= 1450 // 22.5-24.2 hours window
              },
              {
                type: '90_minutes_before',
                shouldSend: () => timeDiffMinutes > 75 && timeDiffMinutes <= 100 // 75-100 min window
              },
              {
                type: '1_hour_before',
                shouldSend: () => timeDiffMinutes > 50 && timeDiffMinutes <= 75 // 50-75 min window
              }
            ];

            for (const reminder of reminders) {
              const shouldSend = typeof reminder.shouldSend === 'function' ? reminder.shouldSend() : reminder.shouldSend;
              if (!shouldSend) continue;

              // Check if reminder already sent
              const existingReminders = await base44.asServiceRole.entities.JobReminder.filter({
                job_id: job.id,
                reminder_type: reminder.type
              });

              if (existingReminders.length > 0) continue;

        // Send appropriate reminders
        if (reminder.type === '9am_morning') {
          // Send to client and media partner
          const jobTime12 = convertTo12HourFormat(jobTime);
          const message = `Good Morning ${job.client_name}!\nJust confirming our shoot today at ${jobTime12} at your ${job.location} listing. Looking forward to it.\n-Brad`;
          const emailBody = `Good Morning ${job.client_name}!\n\nJust confirming our shoot today at ${jobTime12} at your ${job.location} listing. Looking forward to it.\n\n-Brad`;

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
            try {
              if (gmailAccessToken) {
                await sendEmailViaGmail(gmailAccessToken, job.booked_by, 'Shoot Reminder - Today at ' + jobTime, emailBody);
              } else {
                await sendBrevoEmail({
                  to: job.booked_by,
                  subject: 'Shoot Reminder - Today at ' + jobTime,
                  textContent: emailBody
                });
              }
            } catch (e) {
              console.log('Email send skipped:', e.message);
            }
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
            try {
              if (gmailAccessToken) {
                await sendEmailViaGmail(gmailAccessToken, job.client_email, 'Shoot Reminder - Today at ' + jobTime, emailBody);
              } else {
                await sendBrevoEmail({
                  to: job.client_email,
                  subject: 'Shoot Reminder - Today at ' + jobTime,
                  textContent: emailBody
                });
              }
            } catch (e) {
              console.log('Email send skipped:', e.message);
            }
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
         // Send to media partner only
         if (job.booked_by_phone) {
           const mpMessage = `Reminder: Your shoot at ${job.location} starts in 1 hour. Make sure you're prepared and on your way.`;
           await base44.asServiceRole.functions.invoke('sendReminderSMS', {
             phone: job.booked_by_phone,
             message: mpMessage,
             recipientType: 'media_partner',
             jobId: job.id
           });
           await base44.asServiceRole.entities.MessageLog.create({
             message_type: 'sms',
             recipient_type: 'media_partner',
             recipient_phone: job.booked_by_phone,
             message_content: mpMessage,
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

    return Response.json({ 
      success: true, 
      message: 'Job reminders processed'
    });
  } catch (error) {
    return Response.json({ 
      error: error.message
    }, { status: 500 });
  }
});