import { sendBusinessEmailOrQueue, etWallToUtc } from "./businessEmailQueue.ts";

/**
 * asyncInterviewMigration.ts
 * Core logic for converting scheduled first-round interviews to the
 * asynchronous candidate-choice format. Shared by the single-conversion
 * backend function, the bulk-conversion function, and the scheduled
 * batch executor.
 *
 * SAFETY: No function here sends real emails unless sendEmail=true is
 * explicitly passed. Synthetic tests always pass sendEmail=false.
 */

// Rejected/withdrawn application statuses — these candidates are excluded.
const REJECTED_STATUSES = ["denied", "offer_not_extended"];
// Second-round (founder conversation) — protected from async migration.
const SECOND_ROUND_STATUSES = ["final_review"];

export function parseScheduledDateTime(scheduledDate, scheduledTime) {
  if (!scheduledDate || !scheduledTime) return null;
  const [y, m, d] = scheduledDate.split("-").map(Number);
  const [h, mi] = scheduledTime.split(":").map(Number);
  // scheduled_date/time are Eastern Time wall-clock values stored as date + HH:MM.
  // Convert ET wall-clock to actual UTC using the shared helper.
  try {
    return etWallToUtc(y, m, d, h, mi);
  } catch {
    return new Date(Date.UTC(y, m - 1, d, h, mi));
  }
}

/**
 * Find the JobApplication linked to a Conference, via application_id field
 * or by matching the first participant's email.
 */
export async function loadApplicationForConference(base44, conf) {
  if (conf.application_id) {
    try {
      const app = await base44.asServiceRole.entities.JobApplication.get(conf.application_id);
      if (app) return app;
    } catch {}
  }
  const email = conf.participants?.[0]?.email;
  if (!email) return null;
  try {
    const res = await base44.asServiceRole.entities.JobApplication.filter(
      { email }, "-created_date", 5
    );
    const list = res?.data ?? res ?? [];
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
  } catch {
    return null;
  }
}

/**
 * Determine whether a conference is eligible for async conversion.
 * Returns { eligible: boolean, reason: string, round: number, appStatus: string }
 */
export function checkEligibility(conf, app, now = new Date()) {
  // Already converted
  if (conf.converted_to_async_at && conf.async_session_id) {
    return { eligible: false, reason: "Already converted to async", alreadyConverted: true };
  }

  // Must be in 'scheduled' status
  if (conf.status !== "scheduled") {
    return { eligible: false, reason: `Conference status is '${conf.status}' (not scheduled)` };
  }

  // Must be a future interview
  const scheduledDt = parseScheduledDateTime(conf.scheduled_date, conf.scheduled_time);
  if (!scheduledDt) {
    return { eligible: false, reason: "Missing scheduled date/time" };
  }
  if (scheduledDt <= now) {
    return { eligible: false, reason: "Scheduled time is in the past (completed or missed)" };
  }

  // Must be first-round (round 1 or null/undefined — defaults to 1)
  const round = conf.round ?? 1;
  if (round !== 1) {
    return { eligible: false, reason: `Round ${round} interview — only first-round is eligible`, round };
  }

  // Application-level checks
  if (app) {
    if (REJECTED_STATUSES.includes(app.status)) {
      return { eligible: false, reason: `Application status is '${app.status}' (rejected/withdrawn)`, appStatus: app.status };
    }
    if (SECOND_ROUND_STATUSES.includes(app.status)) {
      return { eligible: false, reason: "Application is in final review (second-round) — protected", appStatus: app.status };
    }
  }

  return { eligible: true, reason: null, round, appStatus: app?.status || null };
}

/**
 * Core conversion: converts a single scheduled conference to the async format.
 *
 * Options:
 *   conferenceId   — required
 *   adminName      — name/id of the admin authorizing
 *   sendEmail      — default false; when true, sends the conversion email via Brevo
 *   dryRun         — default false; when true, only validates and returns, no writes
 *   cancelCalendar — default true; cancels the Google Calendar event if one exists
 *
 * Returns { status, ...details }
 */
export async function convertConferenceToAsync(base44, opts) {
  const {
    conferenceId,
    adminName = "system",
    sendEmail = false,
    dryRun = false,
    cancelCalendar = true,
  } = opts;

  if (!conferenceId) {
    return { status: "error", reason: "conferenceId is required" };
  }

  const conf = await base44.asServiceRole.entities.Conference.get(conferenceId);
  if (!conf) {
    return { status: "error", reason: "Conference not found" };
  }

  const app = await loadApplicationForConference(base44, conf);
  const eligibility = checkEligibility(conf, app);

  // Idempotency: already converted
  if (eligibility.alreadyConverted) {
    return {
      status: "already_converted",
      conferenceId,
      asyncSessionId: conf.async_session_id,
      convertedAt: conf.converted_to_async_at,
      message: "This interview was already converted to async.",
    };
  }

  if (!eligibility.eligible) {
    return { status: "excluded", conferenceId, reason: eligibility.reason };
  }

  const scheduledDt = parseScheduledDateTime(conf.scheduled_date, conf.scheduled_time);
  const previousScheduledAt = scheduledDt.toISOString();

  if (dryRun) {
    return {
      status: "dry_run_eligible",
      conferenceId,
      candidateName: app?.full_name || conf.participants?.[0]?.name || "Unknown",
      candidateEmail: app?.email || conf.participants?.[0]?.email || "",
      scheduledAt: previousScheduledAt,
      appStatus: eligibility.appStatus,
      round: eligibility.round,
    };
  }

  // --- Execute conversion ---

  // 1. Suppress old reminders (30-min reminder, etc.)
  await base44.asServiceRole.entities.Conference.update(conferenceId, {
    reminder_suppressed: true,
  });

  // 2. Cancel Google Calendar event (without sending cancellation email)
  if (cancelCalendar && conf.google_calendar_event_id) {
    try {
      const accessToken = await base44.asServiceRole.connectors.getAccessToken("googlecalendar");
      const cancelRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${conf.google_calendar_event_id}?sendUpdates=none`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (!cancelRes.ok) {
        console.warn("Calendar event cancellation failed:", cancelRes.status);
      }
    } catch (calErr) {
      console.warn("Calendar cancellation error:", calErr.message);
    }
  }

  // 3. Create or reuse InterviewSession (idempotent)
  let session = null;
  if (app) {
    try {
      const existingRes = await base44.asServiceRole.entities.InterviewSession.filter(
        { application_id: app.id }, "-created_date", 10
      );
      const existingList = (existingRes?.data ?? existingRes) || [];
      const active = Array.isArray(existingList)
        ? existingList.find(s => ["INVITED", "OPENED", "FORMAT_SELECTED", "STARTED", "IN_PROGRESS", "REOPENED"].includes(s.status))
        : null;
      if (active) {
        session = active;
      }
    } catch {}
  }

  if (!session) {
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 3600 * 1000);
    const positionTitle = app?.position === "sales_growth_advisor"
      ? "Sales Growth Advisor"
      : app?.position === "media_specialist"
        ? "Media Specialist"
        : "Arriv Estate Media";

    session = await base44.asServiceRole.entities.InterviewSession.create({
      session_token: token,
      application_id: app?.id || null,
      candidate_name: app?.full_name || conf.participants?.[0]?.name || "",
      candidate_email: app?.email || conf.participants?.[0]?.email || "",
      position_title: positionTitle,
      round: 1,
      status: "INVITED",
      deadline_hours: 48,
      invited_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by_id: adminName || null,
    });
  }

  // 4. Update conference with conversion audit + cancel the scheduled slot
  const nowIso = new Date().toISOString();
  await base44.asServiceRole.entities.Conference.update(conferenceId, {
    converted_to_async_at: nowIso,
    converted_by: adminName,
    previous_scheduled_at: previousScheduledAt,
    new_expires_at: session.expires_at,
    async_session_id: session.id,
    conversion_email_sent: false,
    status: "cancelled",
    reminder_suppressed: true,
  });

  // 5. Build the interview URL
  const domain = Deno.env.get("BASE44_APP_DOMAIN") || "https://arrivestatemedia.base44.app";
  const interviewUrl = `${domain}/AsyncInterview?token=${session.session_token}`;

  // 6. Send conversion email (only if explicitly authorized)
  let emailSent = false;
  if (sendEmail) {
    const email = app?.email || conf.participants?.[0]?.email;
    if (email) {
      const firstName = (app?.full_name || conf.participants?.[0]?.name || "").split(" ")[0] || "there";
      const deadlineDisplay = new Date(session.expires_at).toLocaleString("en-US", {
        weekday: "long", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
        timeZone: "America/New_York",
      });
      const html = buildConversionEmail(firstName, interviewUrl, deadlineDisplay);
      try {
        await sendBusinessEmailOrQueue(base44, {
          to: email,
          subject: "Update to Your Arriv Estate Media Interview",
          htmlContent: html,
        });
        emailSent = true;
        await base44.asServiceRole.entities.Conference.update(conferenceId, {
          conversion_email_sent: true,
        });
      } catch (e) {
        console.warn("Conversion email failed:", e.message);
      }
    }
  }

  return {
    status: "converted",
    conferenceId,
    candidateName: app?.full_name || conf.participants?.[0]?.name || "Unknown",
    candidateEmail: app?.email || conf.participants?.[0]?.email || "",
    asyncSessionId: session.id,
    interviewUrl,
    expiresAt: session.expires_at,
    emailSent,
    previousScheduledAt,
    convertedAt: nowIso,
  };
}

/**
 * Build the "Update to Your Arriv Estate Media Interview" conversion email.
 * This email replaces the old scheduled-interview confirmation and tells
 * the candidate they now have 48 hours to complete the interview at their
 * convenience, with a choice between Conversational (Ashley) and Self-Guided.
 */
export function buildConversionEmail(firstName, interviewUrl, deadlineDisplay) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 20px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're making an update to our first-round interview process that gives candidates more flexibility in when and how they complete their interview.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You no longer need to attend your interview at the time you originally scheduled.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Instead, you can complete your first-round interview at any time that's convenient for you within the next <strong>48 hours</strong>.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">You'll also be able to choose the interview experience you prefer:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li style="margin-bottom:10px;"><strong>Conversational Interview</strong> &mdash; Meet with Ashley, our AI-powered virtual recruiting assistant, who will guide you through the interview.</li>
            <li><strong>Self-Guided Video Interview</strong> &mdash; Complete the same interview independently. Each question will appear on screen, you'll have a brief moment to prepare, and then you'll record your response.</li>
          </ul>
          <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#1A1A1A;">Both formats contain the same interview questions and are evaluated using the same criteria. Your choice will not affect your candidacy.</p>
          <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Complete Your Interview:</strong></p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${interviewUrl}" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">COMPLETE MY INTERVIEW</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Please complete your interview by:</strong></p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#B8956A;font-weight:600;">${deadlineDisplay}</p>
          <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#1A1A1A;">The interview takes approximately <strong>15 minutes</strong>.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We appreciate your flexibility as we make this improvement to our interview process and look forward to learning more about you.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}