import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Only notify for newly created open jobs
    if (event.type !== 'create' || data.status !== 'open') {
      return Response.json({ message: 'No notification needed' });
    }

    const job = data;

    // Fetch all media partners
    const allUsers = await base44.asServiceRole.entities.User.list();
    const mediaPartners = allUsers.filter(user => user.user_type === 'media_partner');

    if (mediaPartners.length === 0) {
      return Response.json({ message: 'No media partners to notify' });
    }

    // --- Radius filtering: only notify partners whose coverage includes the job. ---
    const gmapsKey = Deno.env.get('VITE_GOOGLE_MAPS_API_KEY') || Deno.env.get('GOOGLE_MAPS_API_KEY');
    const geocode = async (address) => {
      if (!gmapsKey || !address) return null;
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${gmapsKey}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.status === 'OK' && json.results && json.results[0]) {
          const loc = json.results[0].geometry.location;
          return { lat: loc.lat, lng: loc.lng };
        }
      } catch (e) {
        console.error('Geocode failed:', e.message);
      }
      return null;
    };
    const haversineMiles = (lat1, lng1, lat2, lng2) => {
      const toRad = (d) => (d * Math.PI) / 180;
      const R = 3958.8;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    let jobCoords = null;
    try {
      jobCoords = await geocode(job.location);
    } catch (e) {
      console.error('Job geocode failed:', e.message);
    }

    // State filter: if the job has a state, only notify partners in that state
    // (partners with no state set see all jobs on the board, so they pass through).
    let stateFiltered = mediaPartners;
    if (job.state) {
      stateFiltered = mediaPartners.filter(
        (p) => !p.state || String(p.state).toUpperCase() === String(job.state).toUpperCase()
      );
    }

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
          const c = await geocode(p.coverage_area);
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

    // Twilio SMS helper (company number -> partner)
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    const sendSms = async (to, body) => {
      const formData = new URLSearchParams({ From: fromNumber, To: to, Body: body });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed to send SMS');
      return result.sid;
    };

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
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: mediaPartner.email,
          subject: `New Job Posted: ${job.title}`,
          body: emailBody,
          from_name: 'Arriv'
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
          await sendSms(mediaPartner.phone_number, smsBody);
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