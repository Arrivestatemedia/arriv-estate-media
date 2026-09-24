import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';
import { geocode, haversineMiles, sendTwilioSms, getGoogleMapsKey } from '../../shared/jobNotifications.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Only notify for newly created open jobs
    if (event.type !== 'create' || data.status !== 'open') {
      return Response.json({ message: 'No notification needed' });
    }

    const job = data;

    // Fetch all media partners from BOTH PendingSignup (where active media-partner
    // accounts live in this app) and User, then dedupe by email.
    const [pendingSignups, allUsers] = await Promise.all([
      base44.asServiceRole.entities.PendingSignup.list().catch(() => []),
      base44.asServiceRole.entities.User.list().catch(() => []),
    ]);
    const byEmail = new Map();
    for (const p of [...(pendingSignups || []), ...(allUsers || [])]) {
      if (p.user_type !== 'media_partner') continue;
      const key = String(p.email || '').toLowerCase();
      if (key && !byEmail.has(key)) byEmail.set(key, p);
    }
    const mediaPartners = [...byEmail.values()];

    if (mediaPartners.length === 0) {
      return Response.json({ message: 'No media partners to notify' });
    }

    // --- Radius filtering: only notify partners whose coverage includes the job. ---
    const gmapsKey = getGoogleMapsKey();

    let jobCoords = null;
    try {
      jobCoords = await geocode(job.location, gmapsKey);
    } catch (e) {
      console.error('Job geocode failed:', e.message);
    }

    // No state pre-filter — notify every partner whose coverage radius reaches
    // the job, regardless of state ("everyone within the selected mileage").
    let stateFiltered = mediaPartners;

    let eligiblePartners;
    if (!jobCoords) {
      // Can't determine job location for radius → notify all state-matched partners.
      eligiblePartners = stateFiltered;
    } else {
      eligiblePartners = [];
      for (const p of stateFiltered) {
        const maxDist = p.max_travel_distance;
        // No coverage set → they see all jobs on the board, so notify them too.
        if (maxDist == null || (p.coverage_lat == null && p.coverage_lng == null && !p.coverage_area)) {
          eligiblePartners.push(p);
          continue;
        }
        let cLat = p.coverage_lat;
        let cLng = p.coverage_lng;
        if ((cLat == null || cLng == null) && p.coverage_area) {
          const c = await geocode(p.coverage_area, gmapsKey);
          if (c) { cLat = c.lat; cLng = c.lng; }
        }
        if (cLat == null || cLng == null) {
          // Can't resolve center → notify to be safe (matches board's show-all fallback).
          eligiblePartners.push(p);
          continue;
        }
        const dist = haversineMiles(jobCoords.lat, jobCoords.lng, cLat, cLng);
        if (dist <= maxDist) eligiblePartners.push(p);
      }
    }

    if (eligiblePartners.length === 0) {
      return Response.json({ message: 'No media partners in radius' });
    }

    // Twilio SMS via shared helper (company number -> partner)
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    // Send email + SMS to each media partner
    const notifyPromises = eligiblePartners.map(async (mediaPartner) => {
      const jobType = job.type === 'photo' ? 'Photography' : job.type === 'video' ? 'Videography' : 'Photo & Video';
      const jobDate = new Date(job.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const emailBody = `
Hello ${mediaPartner.full_name},

A new job has been posted on Arriv that matches your profile!

📋 Job Details:
• Title: ${job.title}
• Type: ${jobType}
• Location: ${job.location}
• Date: ${jobDate}
• Time: ${job.start_time || 'TBD'}
• Pay Rate: $${job.pay_rate}
${job.package ? `• Package: ${job.package}` : ''}

${job.description ? `Description: ${job.description}` : ''}

Log in to your dashboard to view full details and book this job before someone else does!

Best regards,
The Arriv Team
      `.trim();

      // Email
      try {
        await sendBrevoEmail({
          to: mediaPartner.email,
          subject: `New Job Posted: ${job.title}`,
          textContent: emailBody,
        });
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'media_partner',
          recipient_email: mediaPartner.email,
          message_content: emailBody,
          subject: `New Job Posted: ${job.title}`,
          job_id: job.id,
          status: 'success'
        });
      } catch (error) {
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: 'email',
          recipient_type: 'media_partner',
          recipient_email: mediaPartner.email,
          message_content: emailBody,
          subject: `New Job Posted: ${job.title}`,
          job_id: job.id,
          status: 'failed',
          error_message: error.message
        });
      }

      // SMS (if the partner has a phone number on file)
      if (mediaPartner.phone_number && fromNumber) {
        const smsBody = `New Arriv job: ${job.title} (${jobType}) — ${jobDate}${job.start_time ? ` at ${job.start_time}` : ''}. Location: ${job.location}. Pay: $${job.pay_rate}. Check your dashboard to book.`;
        try {
          await sendTwilioSms(mediaPartner.phone_number, smsBody);
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'sms',
            recipient_type: 'media_partner',
            recipient_phone: mediaPartner.phone_number,
            message_content: smsBody,
            job_id: job.id,
            status: 'success'
          });
        } catch (error) {
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'sms',
            recipient_type: 'media_partner',
            recipient_phone: mediaPartner.phone_number,
            message_content: smsBody,
            job_id: job.id,
            status: 'failed',
            error_message: error.message
          });
        }
      }
    });

    await Promise.all(notifyPromises);

    return Response.json({ 
      message: 'Notifications sent', 
      media_partners_notified: eligiblePartners.length 
    });
  } catch (error) {
    console.error('Error notifying contractors:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});