// Shared helper — one digest of matching open gigs for a newly signed-up media
// partner, sent by email and SMS as soon as their work area (state/ZIP) is known.
// Plain module: no Deno.serve. Called from signupMediaPartner and saveCoverageArea.
//
// A job counts as a match when it is open, still in the future, and either
//   • sits in the partner's state, or
//   • is inside the travel range measured from the partner's ZIP.
//
// Sending is once per partner per state: the sent digest is recorded in
// MessageLog, and that record is checked before sending again.

import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from "./brevoClient.ts";
import {
  geocode,
  geocodeZipKeyless,
  haversineMiles,
  sendTwilioSms,
  getGoogleMapsKey,
} from "./jobNotifications.ts";

const MAX_JOBS_IN_EMAIL = 8;

const digestSubject = (state) => `New gigs on your Arriv job board (${state})`;

const formatDate = (value) => {
  if (!value) return "Date TBD";
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const jobTypeLabel = (type) =>
  type === "photo" ? "Photography" : type === "video" ? "Videography" : "Photo & Video";

async function matchingOpenJobs(base44, partner) {
  const state = String(partner.state || "").trim().toUpperCase();
  if (!state) return { state: "", jobs: [] };

  const today = new Date().toISOString().slice(0, 10);
  const openJobs = (await openJobsPage(base44)).filter(
    (j) => j.status === "open" && (!j.date || j.date >= today)
  );

  const maxDist = Number(partner.max_travel_distance);
  let partnerLat = partner.coverage_lat;
  let partnerLng = partner.coverage_lng;
  const gmapsKey = getGoogleMapsKey();

  if ((partnerLat == null || partnerLng == null) && gmapsKey) {
    const center = partner.zip || partner.coverage_area;
    if (center) {
      const c = await geocode(center, gmapsKey);
      if (c) {
        partnerLat = c.lat;
        partnerLng = c.lng;
      }
    }
  }

  // Google geocoding is denied for the browser key — resolve the ZIP keyless.
  if (partnerLat == null || partnerLng == null) {
    const c = await geocodeZipKeyless(partner.zip || partner.coverage_area);
    if (c) {
      partnerLat = c.lat;
      partnerLng = c.lng;
    }
  }

  const matched = [];
  for (const job of openJobs) {
    const jobState = String(job.state || "").trim().toUpperCase();
    let matchedJob = state && jobState && jobState === state;

    if (!matchedJob && partnerLat != null && partnerLng != null && maxDist > 0 && job.location && gmapsKey) {
      const jobCoords = await geocode(job.location, gmapsKey);
      if (jobCoords) {
        const dist = haversineMiles(partnerLat, partnerLng, jobCoords.lat, jobCoords.lng);
        matchedJob = dist <= maxDist;
      }
    }

    if (matchedJob) matched.push(job);
  }

  matched.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  return { state, jobs: matched };
}

// Open jobs, read with the caller's service-role client.
async function openJobsPage(base44) {
  try {
    const result = await base44.asServiceRole.entities.Job.filter(
      { status: "open" },
      { sort: "date", limit: 200 }
    );
    return result?.items || result || [];
  } catch (e) {
    console.error("Open job lookup failed:", e.message);
    return [];
  }
}

export async function sendNewPartnerJobDigest(base44, partnerInput) {
  try {
    const email = String(partnerInput?.email || "").trim().toLowerCase();
    if (!email) return { sent: false, reason: "no_email" };

    const partner = { ...partnerInput, email };
    const { state, jobs } = await matchingOpenJobs(base44, partner);
    if (!state) return { sent: false, reason: "no_state" };
    if (jobs.length === 0) return { sent: false, reason: "no_matching_jobs" };

    const subject = digestSubject(state);

    // Once per partner per state.
    const already = await base44.asServiceRole.entities.MessageLog.filter({
      recipient_email: email,
      subject,
    });
    if ((already?.items || already || []).length > 0) {
      return { sent: false, reason: "already_announced" };
    }

    const firstName = String(partner.full_name || "").split(" ")[0] || "there";
    const shown = jobs.slice(0, MAX_JOBS_IN_EMAIL);

    const lines = shown.map((job) => {
      const bits = [
        `• ${job.title}`,
        `  ${jobTypeLabel(job.type)} · ${formatDate(job.date)}${job.start_time ? ` at ${job.start_time}` : ""}`,
        `  ${job.location || ""}`,
        `  Pay: $${job.pay_rate}`,
      ];
      return bits.join("\n");
    });

    const more =
      jobs.length > shown.length
        ? `\n\nPlus ${jobs.length - shown.length} more on the job board.`
        : "";

    const emailBody = `Hi ${firstName},

Welcome to Arriv. There ${
      jobs.length === 1 ? "is 1 open gig" : `are ${jobs.length} open gigs`
    } you can pick up in ${state} right now:

${lines.join("\n\n")}${more}

Open the job board to see the full details and book the ones that work for you.

The Arriv Team`;

    let emailed = false;
    try {
      await sendBrevoEmail({
        to: email,
        subject,
        textContent: emailBody,
        senderEmail: BOOKINGS_SENDER_EMAIL,
      });
      emailed = true;
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: "email",
        recipient_type: "media_partner",
        recipient_email: email,
        message_content: emailBody,
        subject,
        status: "success",
      });
    } catch (error) {
      await base44.asServiceRole.entities.MessageLog.create({
        message_type: "email",
        recipient_type: "media_partner",
        recipient_email: email,
        message_content: emailBody,
        subject,
        status: "failed",
        error_message: error.message,
      });
    }

    let texted = false;
    const phone = partner.phone_number;
    if (phone) {
      const first = shown[0];
      const smsBody = `Welcome to Arriv, ${firstName}. ${jobs.length} open gig${
        jobs.length === 1 ? "" : "s"
      } in ${state}: ${first.title} on ${formatDate(first.date)}${
        first.pay_rate ? `, $${first.pay_rate}` : ""
      }. See all on your job board.`;
      try {
        await sendTwilioSms(phone, smsBody);
        texted = true;
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: "sms",
          recipient_type: "media_partner",
          recipient_phone: phone,
          message_content: smsBody,
          status: "success",
        });
      } catch (error) {
        await base44.asServiceRole.entities.MessageLog.create({
          message_type: "sms",
          recipient_type: "media_partner",
          recipient_phone: phone,
          message_content: smsBody,
          status: "failed",
          error_message: error.message,
        });
      }
    }

    return { sent: true, state, jobs_announced: jobs.length, email: emailed, sms: texted };
  } catch (e) {
    console.error("sendNewPartnerJobDigest error:", e.message);
    return { sent: false, reason: e.message };
  }
}