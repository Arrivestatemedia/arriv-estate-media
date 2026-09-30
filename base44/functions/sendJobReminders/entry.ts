import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { toZonedTime, zonedTimeToUtc, fromZonedTime } from 'npm:date-fns-tz@3.0.0';
import { parse as parseDate, format, subDays } from 'npm:date-fns@3.6.0';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';
import {
  PROVIDER_SENTRILOCK,
  PROVIDER_SUPRA,
  getPropertyAccessProvider,
  getAccessGuideUrl,
} from '../../shared/propertyAccessProvider.ts';
import { buildAccessRequestSms, buildAccessFollowupSms } from '../../shared/clientAccessSelection.ts';

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
           try {
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
                // Catch-up safe: fires once we're at/past 24h before the shoot,
                // as long as we're still >100min out. JobReminder dedup prevents
                // re-sends, so a missed narrow window or a late booking still
                // gets the reminder on the next workflow run (every 5 min).
                type: '24_hours_before',
                shouldSend: () => timeDiffMinutes <= 1440 && timeDiffMinutes > 100
              },
              {
                type: '90_minutes_before',
                shouldSend: () => timeDiffMinutes > 75 && timeDiffMinutes <= 100 // 75-100 min window
              },
              {
                type: '1_hour_before',
                shouldSend: () => timeDiffMinutes > 50 && timeDiffMinutes <= 75 // 50-75 min window
              },
              {
                // 2 hours after the first access request, if still unanswered.
                type: 'access_followup_2h',
                shouldSend: () => {
                  if (!job.client_access_request_sent_at) return false;
                  if (job.client_access_selection && job.client_access_selection !== 'pending') return false;
                  if (timeDiffMinutes <= 0) return false;
                  const sentAt = new Date(job.client_access_request_sent_at).getTime();
                  return (now.getTime() - sentAt) >= 2 * 60 * 60 * 1000;
                }
              },
              {
                // 8pm ET the night before the job, if still unanswered.
                type: 'access_followup_8pm',
                shouldSend: () => {
                  if (!job.client_access_request_sent_at) return false;
                  if (job.client_access_selection && job.client_access_selection !== 'pending') return false;
                  const nightBeforeStr = format(subDays(parseDate(job.date, 'yyyy-MM-dd', new Date()), 1), 'yyyy-MM-dd');
                  return format(nowNY, 'yyyy-MM-dd') === nightBeforeStr
                    && nowNY.getHours() === 20 && nowNY.getMinutes() < 15;
                }
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
          const message = `Good Morning ${job.client_name}!\nJust confirming our shoot today at ${jobTime12} at your ${job.location} listing. Looking forward to it.\n-Arriv Estate Media`;
          const emailBody = `Good Morning ${job.client_name}!\n\nJust confirming our shoot today at ${jobTime12} at your ${job.location} listing. Looking forward to it.\n\n-Arriv Estate Media`;

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
           // Send to media partner
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

           // ── 24-hour lockbox access reminder to client ──
           // Territory-aware: SentriLock (DMV), Supra (GA), or neutral.
           const provider = getPropertyAccessProvider(job);
           const guideUrl = getAccessGuideUrl(provider);
           const jobDateObj = parseDate(job.date, 'yyyy-MM-dd', new Date());
           const formattedDate = format(jobDateObj, 'MMMM d, yyyy');
           const formattedTime12 = convertTo12HourFormat(jobTime);
           const clientFirstName = (job.client_name || '').split(' ')[0] || 'there';
           const rawSpecialistName = (job.booked_by_name || '').trim();
           const nameParts = rawSpecialistName.split(/\s+/);
           const specialistName = nameParts.length >= 2
             ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
             : rawSpecialistName;
           const specialistEmail = job.booked_by;
           const specialistPhone = job.booked_by_phone;
           const propertyAddress = job.location;
           const accessMethod = provider === PROVIDER_SENTRILOCK ? 'SENTRICONNECT' :
             provider === PROVIDER_SUPRA ? 'SUPRA_EKEY' : null;

           let clientSms = null;
           let clientEmailSubject = null;
           let clientEmailBody = null;

           // Only ask if the client hasn't already chosen an access method.
           if (!job.client_access_selection || job.client_access_selection === 'pending') {
             clientSms = buildAccessRequestSms(job, formattedDate, formattedTime12);
             clientEmailSubject = 'Action needed: How will your Media Specialist access the property?';
             clientEmailBody = clientSms;
             try {
               await base44.asServiceRole.entities.Job.update(job.id, {
                 client_access_request_sent_at: new Date().toISOString(),
               });
             } catch (e) {
               console.log('client_access_request_sent_at update skipped:', e.message);
             }
           }

           if (provider === PROVIDER_SENTRILOCK) {
             clientSms =
               `Hi ${clientFirstName}! This is a reminder that your Arriv Estate Media shoot is tomorrow, ${formattedDate}, at ${formattedTime12} at your listing at ${propertyAddress}.\n\n` +
               `Your Media Specialist, ${specialistName}, will be arriving for the appointment. If you will not be on site, please grant them temporary SentriConnect access through your SentriKey Real Estate app.\n\n` +
               `SentriConnect email: ${specialistEmail}\n\n` +
               `For step-by-step instructions, view the Arriv Estate Media SentriLock Access Guide:\n${guideUrl}\n\n` +
               `Arriv Estate Media`;
             clientEmailSubject = 'Reminder: Your Arriv Estate Media shoot is tomorrow - SentriLock Access';
             clientEmailBody =
               `Hi ${clientFirstName},\n\n` +
               `This is a reminder that your Arriv Estate Media shoot is tomorrow:\n\n` +
               `${propertyAddress}\n${formattedDate} at ${formattedTime12}\n\n` +
               `Your Media Specialist, ${specialistName}, will be arriving for the appointment. If you will not be on site, please grant temporary SentriConnect access through your SentriKey Real Estate app.\n\n` +
               `MEDIA SPECIALIST\n${specialistName}\n\n` +
               `SENTRICONNECT EMAIL\n${specialistEmail}\n\n` +
               `For step-by-step instructions, view the Arriv Estate Media SentriLock General Access Guide:\n${guideUrl}\n\n` +
               `Thank you,\n\nArriv Estate Media`;
           } else if (provider === PROVIDER_SUPRA) {
             clientSms =
               `Hi ${clientFirstName}!\n\n` +
               `This is a reminder that your Arriv Estate Media shoot is tomorrow, ${formattedDate}, at ${formattedTime12} at your ${propertyAddress} listing.\n\n` +
               `Your Media Specialist, ${specialistName}, will be arriving shortly. Filming should take about 2 hours.\n\n` +
               `If you do not plan on being on site, please make sure you grant Supra access to the number below:\n\n` +
               `${specialistPhone}\n\n` +
               `For instructions on how to add temporary access in Supra, view the guide below:\n${guideUrl}`;
             clientEmailSubject = 'Reminder: Your Arriv Estate Media shoot is tomorrow!';
             clientEmailBody =
               `Hi ${clientFirstName}!\n\n` +
               `This is a reminder that your Arriv Estate Media shoot is tomorrow, ${formattedDate}, at ${formattedTime12} at your ${propertyAddress} listing.\n\n` +
               `Your Media Specialist, ${specialistName}, will be arriving shortly. Filming should take about 2 hours.\n\n` +
               `If you do not plan on being on site, please make sure you grant Supra access to the number below:\n\n` +
               `${specialistPhone}\n\n` +
               `For instructions on how to add temporary access in Supra, view the guide below:\n${guideUrl}`;
           } else {
             clientSms =
               `Hi ${clientFirstName}! This is a reminder that your Arriv Estate Media shoot is tomorrow, ${formattedDate}, at ${formattedTime12} at your listing at ${propertyAddress}.\n\n` +
               `Your Media Specialist, ${specialistName}, will be arriving for the appointment. Please ensure the Media Specialist has authorized property access for the scheduled appointment.\n\n` +
               `Arriv Estate Media`;
             clientEmailSubject = 'Reminder: Your Arriv Estate Media shoot is tomorrow';
             clientEmailBody =
               `Hi ${clientFirstName},\n\n` +
               `This is a reminder that your Arriv Estate Media shoot is tomorrow:\n\n` +
               `${propertyAddress}\n${formattedDate} at ${formattedTime12}\n\n` +
               `Your Media Specialist, ${specialistName}, will be arriving for the appointment. Please ensure the Media Specialist has authorized property access for the scheduled appointment.\n\n` +
               `Thank you,\n\nArriv Estate Media`;
           }

           // Send SMS to client
           if (clientSms && job.client_phone) {
             try {
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
                 status: 'success',
                 provider,
                 access_method: accessMethod
               });
             } catch (e) {
               console.log('Client 24h SMS send skipped:', e.message);
             }
           }

           // Send email to client
           if (clientEmailBody && job.client_email) {
             try {
               if (gmailAccessToken) {
                 await sendEmailViaGmail(gmailAccessToken, job.client_email, clientEmailSubject, clientEmailBody);
               } else {
                 await sendBrevoEmail({
                   to: job.client_email,
                   subject: clientEmailSubject,
                   textContent: clientEmailBody
                 });
               }
             } catch (e) {
               console.log('Client 24h email send skipped:', e.message);
             }
             await base44.asServiceRole.entities.MessageLog.create({
               message_type: 'email',
               recipient_type: 'client',
               recipient_email: job.client_email,
               message_content: clientEmailBody,
               subject: clientEmailSubject,
               job_id: job.id,
               reminder_type: reminder.type,
               status: 'success',
               provider,
               access_method: accessMethod
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
           } else if (reminder.type === 'access_followup_2h' || reminder.type === 'access_followup_8pm') {
           // Follow-up access-selection nudge (2h after first ask, or 8pm night before).
           // Only fires while the client's selection is still pending.
           const jobDateObj = parseDate(job.date, 'yyyy-MM-dd', new Date());
           const formattedDate = format(jobDateObj, 'MMMM d, yyyy');
           const formattedTime12 = convertTo12HourFormat(jobTime);
           const followUpSms = buildAccessFollowupSms(job, formattedDate, formattedTime12);
           const followUpSubject = 'Reminder: How will your Media Specialist access the property?';
           const followUpBody = followUpSms;

           if (job.client_phone) {
             try {
               await base44.asServiceRole.functions.invoke('sendReminderSMS', {
                 phone: job.client_phone,
                 message: followUpSms,
                 recipientType: 'client',
                 jobId: job.id
               });
               await base44.asServiceRole.entities.MessageLog.create({
                 message_type: 'sms',
                 recipient_type: 'client',
                 recipient_phone: job.client_phone,
                 message_content: followUpSms,
                 job_id: job.id,
                 reminder_type: reminder.type,
                 status: 'success'
               });
             } catch (e) {
               console.log('Access follow-up SMS send skipped:', e.message);
             }
           }
           if (job.client_email) {
             try {
               if (gmailAccessToken) {
                 await sendEmailViaGmail(gmailAccessToken, job.client_email, followUpSubject, followUpBody);
               } else {
                 await sendBrevoEmail({ to: job.client_email, subject: followUpSubject, textContent: followUpBody });
               }
             } catch (e) {
               console.log('Access follow-up email send skipped:', e.message);
             }
             await base44.asServiceRole.entities.MessageLog.create({
               message_type: 'email',
               recipient_type: 'client',
               recipient_email: job.client_email,
               message_content: followUpBody,
               subject: followUpSubject,
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
        } catch (e) {
        console.error('Job reminder processing error for job', job?.id, e.message);
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