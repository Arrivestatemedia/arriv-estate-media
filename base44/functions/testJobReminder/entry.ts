import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { toZonedTime, fromZonedTime } from 'npm:date-fns-tz@3.0.0';
import { format, parse as parseDate } from 'npm:date-fns@3.6.0';
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
          const body = await req.json();
          const { jobId, bookingId } = body;

          // Get Gmail access token
          let gmailAccessToken;
          try {
            gmailAccessToken = await base44.asServiceRole.connectors.getAccessToken('gmail');
          } catch (e) {
            console.log('Gmail not available for external emails');
          }
    
    if (!jobId && !bookingId) {
      return Response.json({ error: 'Job ID or Booking ID required' }, { status: 400 });
    }

    const tz = 'America/New_York';
    
    let job;
    if (bookingId) {
      const jobs = await base44.asServiceRole.entities.Job.filter({ booking_id: bookingId });
      if (jobs.length === 0) {
        return Response.json({ error: 'No job found for this booking ID' }, { status: 404 });
      }
      job = jobs[0];
    } else {
      job = await base44.asServiceRole.entities.Job.get(jobId);
      if (!job) {
        return Response.json({ error: 'Job not found' }, { status: 404 });
      }
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

    // Mock current time as 9:02 AM ET
    const now = new Date();
    const mockNow = new Date(now);
    mockNow.setHours(9, 2, 0, 0);
    const mockNowNY = toZonedTime(mockNow, tz);
    const isSameDay = format(mockNowNY, 'yyyy-MM-dd') === format(jobDate, 'yyyy-MM-dd');

    const mockJobDatetimeUTC = fromZonedTime(jobDate, tz);
    const mockTimeDiffMs = mockJobDatetimeUTC.getTime() - mockNow.getTime();
    const mockTimeDiffMinutes = mockTimeDiffMs / (1000 * 60);

    // Check if 9am reminder already sent
    const existingReminders = await base44.asServiceRole.entities.JobReminder.filter({
      job_id: job.id,
      reminder_type: '9am_morning'
    });

    if (existingReminders.length > 0) {
      return Response.json({ error: 'Reminder already sent for this job', existingReminders }, { status: 400 });
    }

    // Send to media partner
    const jobTime12 = convertTo12HourFormat(jobTime);
    const message = `Good Morning ${job.client_name}!\nJust confirming our shoot today at ${jobTime12} at your ${job.location} listing. Looking forward to it.\n-Brad`;
    const emailBody = `Good Morning ${job.client_name}!\n\nJust confirming our shoot today at ${jobTime12} at your ${job.location} listing. Looking forward to it.\n\n-Brad`;

    if (job.booked_by_phone) {
      const smsMsg = `${message}\n\nClient will be notified shortly.`;
      try {
        await base44.asServiceRole.functions.invoke('sendReminderSMS', {
          phone: job.booked_by_phone,
          message: smsMsg
        });
      } catch (e) {
        console.log('SMS skipped');
      }
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'media_partner',
        recipient_phone: job.booked_by_phone,
        message_content: smsMsg,
        job_id: job.id,
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

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
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

    if (job.client_phone) {
      const clientSms = `${message}`;
      try {
        await base44.asServiceRole.functions.invoke('sendReminderSMS', {
          phone: job.client_phone,
          message: clientSms,
          recipientType: 'client',
          jobId: job.id
        });
      } catch (e) {
        console.log('SMS skipped');
      }
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: 'sms',
        recipient_type: 'client',
        recipient_phone: job.client_phone,
        message_content: clientSms,
        job_id: job.id,
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

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
        reminder_type: '9am_morning',
        status: 'success'
      });
    }

    await base44.asServiceRole.entities.JobReminder.create({
      job_id: job.id,
      reminder_type: '9am_morning',
      sent_at: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      message: '9am reminder sent successfully',
      jobId: job.id,
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