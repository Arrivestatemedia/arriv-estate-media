import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { sendBrevoEmail } from '../../shared/brevoClient.ts';
import { geocode, haversineMiles, sendTwilioSms, getTwilioFromNumber, getGoogleMapsKey } from '../../shared/jobNotifications.ts';

// Sends a follow-up notification for jobs still unbooked 1 hour after posting.
// Targets media partners in the SAME state as the job who were OUTSIDE the
// job's radius (so they did not receive the initial radius notification),
// regardless of how far the job is from them. The message includes the exact
// mileage and a deep link that force-shows the job on the Job Board.

const buildAppUrl = () => {
  let domain = (Deno.env.get('BASE44_APP_DOMAIN') || '').replace(/\/$/, '');
  if (!domain) domain = 'arrivestatemedia.base44.app';
  return domain.startsWith('http') ? domain : `https://${domain}`;
};

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Open, booking-originated jobs created between 1h and 24h ago that have
    // not yet received the expanded-radius notification.
    const candidates = await base44.asServiceRole.entities.Job.filter(
      {
        status: 'open',
        from_booking: true,
        created_date: { $gte: twentyFourHoursAgo, $lte: oneHourAgo },
      },
      '-created_date',
      100,
    );

    const jobs = candidates.filter(
      (j) => !j.expanded_radius_notified_at && !!j.state && !!j.location && !j.booked_by,
    );

    if (jobs.length === 0) {
      return Response.json({ message: 'No jobs eligible for expanded-radius notification', jobs_processed: 0 });
    }

    const gmapsKey = getGoogleMapsKey();
    const fromNumber = getTwilioFromNumber();

    const appBase = buildAppUrl();

    // Load all media partners once from BOTH PendingSignup (where active
    // media-partner accounts live in this app) and User, deduped by email.
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

    let totalNotified = 0;
    const jobCoordsCache = {};
    const partnerCoordsCache = {};

    for (const job of jobs) {
      const jobState = String(job.state).toUpperCase();

      // Resolve job coordinates (cache per run).
      let jobCoords = jobCoordsCache[job.id];
      if (jobCoords === undefined) {
        jobCoords = await geocode(job.location, gmapsKey);
        jobCoordsCache[job.id] = jobCoords;
      }

      // Same-state partners only.
      const sameStatePartners = mediaPartners.filter(
        (p) => !!p.state && String(p.state).toUpperCase() === jobState,
      );

      for (const partner of sameStatePartners) {
        // Need a coverage center to compute mileage, and a max_travel_distance
        // to know they were outside the initial radius notification.
        const maxDist = partner.max_travel_distance;
        if (maxDist == null) continue;

        let cLat = partner.coverage_lat;
        let cLng = partner.coverage_lng;
        if ((cLat == null || cLng == null) && partner.coverage_area) {
          const key = partner.id || partner.email;
          let cached = partnerCoordsCache[key];
          if (cached === undefined) {
            cached = await geocode(partner.coverage_area, gmapsKey);
            partnerCoordsCache[key] = cached;
          }
          if (cached) {
            cLat = cached.lat;
            cLng = cached.lng;
          }
      }
        if (cLat == null || cLng == null) continue;

        // Can't compute mileage without job coords — skip (can't fill the message).
        if (!jobCoords) continue;

        const dist = haversineMiles(jobCoords.lat, jobCoords.lng, cLat, cLng);
        // If inside their coverage radius they already got the initial notification.
        if (dist <= maxDist) continue;

        const mileage = Math.round(dist);
        const jobLink = `${appBase}/JobBoard?job_id=${job.id}`;
        const jobType =
          job.type === 'photo' ? 'Photography' : job.type === 'video' ? 'Videography' : 'Photo & Video';
        const jobDate = new Date(job.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        const messageText = `Although this job is ${mileage} miles from you, we thought you might be interested. Click here: ${jobLink} to see the details.`;

        const emailSubject = `A gig ${mileage} miles away just opened up: ${job.title}`;
        const emailHtml = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1A1A1A;line-height:1.5">
          <h2 style="color:#B8956A">${job.title}</h2>
          <p>Although this job is <strong>${mileage} miles</strong> from you, we thought you might be interested.</p>
          <p style="margin-top:16px;padding:12px;background:#FFFBF5;border-left:3px solid #B8956A;">
            <strong>${jobType}</strong><br/>
            <strong>Location:</strong> ${job.location}<br/>
            <strong>Date:</strong> ${jobDate}${job.start_time ? `<br/><strong>Time:</strong> ${job.start_time}` : ''}<br/>
            <strong>Pay:</strong> $${job.pay_rate}
          </p>
          <p style="margin-top:16px">
            <a href="${jobLink}" style="background:#B8956A;color:#FFFBF5;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:600;">Click here to see the details</a>
          </p>
          <p style="margin-top:16px;color:#1A1A1A;font-size:13px;">${messageText}</p>
        </div>`;

        // Email
        try {
          await sendBrevoEmail({
            to: partner.email,
            subject: emailSubject,
            htmlContent: emailHtml,
          });
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'media_partner',
            recipient_email: partner.email,
            message_content: messageText,
            subject: emailSubject,
            job_id: job.id,
            status: 'success',
          });
          totalNotified++;
        } catch (error) {
          await base44.asServiceRole.entities.MessageLog.create({
            message_type: 'email',
            recipient_type: 'media_partner',
            recipient_email: partner.email,
            message_content: messageText,
            subject: emailSubject,
            job_id: job.id,
            status: 'failed',
            error_message: error.message,
          });
        }

        // SMS
        if (partner.phone_number && fromNumber) {
          try {
            await sendTwilioSms(partner.phone_number, messageText);
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'sms',
              recipient_type: 'media_partner',
              recipient_phone: partner.phone_number,
              message_content: messageText,
              job_id: job.id,
              status: 'success',
            });
          } catch (error) {
            await base44.asServiceRole.entities.MessageLog.create({
              message_type: 'sms',
              recipient_type: 'media_partner',
              recipient_phone: partner.phone_number,
              message_content: messageText,
              job_id: job.id,
              status: 'failed',
              error_message: error.message,
            });
          }
        }
      }

      // Mark processed so it never re-runs (notified or not).
      await base44.asServiceRole.entities.Job.update(job.id, {
        expanded_radius_notified_at: new Date().toISOString(),
      });
    }

    return Response.json({
      message: 'Expanded-radius notifications processed',
      jobs_processed: jobs.length,
      partners_notified: totalNotified,
    });
  } catch (error) {
    console.error('notifyExpandedRadiusJob error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}