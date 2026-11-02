import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';
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

    // --- ZIP radius scope: a job is offered only to partners whose own ZIP sits
    // inside the travel range that partner set. Every partner records a state, a
    // ZIP and a travel range, so a partner missing either is not offered the job.
    const eligiblePartners = [];
    for (const p of mediaPartners) {
      const maxDist = Number(p.max_travel_distance);
      if (!maxDist || maxDist <= 0) continue;

      let cLat = p.coverage_lat;
      let cLng = p.coverage_lng;
      if (cLat == null || cLng == null) {
        const centerSource = p.zip || p.coverage_area;
        if (!centerSource) continue;
        const c = await geocode(centerSource, gmapsKey);
        if (!c) continue;
        cLat = c.lat;
        cLng = c.lng;
      }

      // Job location unresolved → still tell the in-range partners about it.
      if (!jobCoords) { eligiblePartners.push(p); continue; }

      const dist = haversineMiles(jobCoords.lat, jobCoords.lng, cLat, cLng);
      if (dist <= maxDist) eligiblePartners.push(p);
    }

    if (eligiblePartners.length === 0) {
      return Response.json({ message: 'No media partners within range of this job' });
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
          senderEmail: BOOKINGS_SENDER_EMAIL,
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