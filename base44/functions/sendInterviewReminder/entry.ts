import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { etWallToUtc, sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

/**
 * sendInterviewReminder
 *
 * Called by the per-interview reminder workflow when the wait completes (at
 * ~30 minutes before the interview start). Sends the reminder email to the
 * applicant and a copy to the admin/organizer, then marks the conference as
 * reminded. Guards against reschedules, cancellations, and duplicate sends by
 * re-reading the conference and verifying the start time still matches.
 *
 * Invoked by a workflow (no user token) — uses the service role.
 */

function buildReminderHtml(firstName: string, meetingLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview with Arriv Estate Media begins in approximately 30 minutes.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You&rsquo;ll be meeting with <strong>Ashley</strong>, our Virtual Recruiting Assistant, for your first-round interview. Ashley will guide you through a conversational video interview covering your experience, background, and a series of questions related to the position.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We understand that a virtual first-round interview may be different from the interview process you&rsquo;re accustomed to. We&rsquo;ve designed this stage of our hiring process to provide every applicant with a consistent and fair interview experience, ensuring each candidate is evaluated using the same core criteria.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">There&rsquo;s nothing special you need to prepare. Simply speak naturally and answer Ashley&rsquo;s questions as you would during any other interview.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Following your interview, our recruiting team will review your responses. Candidates selected to move forward will be invited to a second-round interview with Arriv Estate Media leadership.</p>

          <table cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${meetingLink}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">JOIN YOUR INTERVIEW</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A;word-break:break-all;">Or copy this link: <a href="${meetingLink}" style="color:#B8956A;">${meetingLink}</a></p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you experience a technical interruption during your interview, simply rejoin using the same interview link.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please join from a quiet location with a working camera and microphone. We recommend opening your interview room a few minutes before your scheduled start time.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We look forward to learning more about you.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildHumanReminderHtml(firstName: string, meetingLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your second-round interview with Arriv Estate Media begins in approximately 30 minutes.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Congratulations on advancing to the next stage of our interview process. This interview will be conducted live with a member of Arriv Estate Media leadership and will build on your first-round conversation.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">During this interview, we&rsquo;ll spend more time discussing the position, your experience, and how you would approach situations specific to the role. You&rsquo;ll also have an opportunity to ask questions and learn more about Arriv Estate Media.</p>

          <table cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${meetingLink}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">JOIN YOUR INTERVIEW</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A;word-break:break-all;">Or copy this link: <a href="${meetingLink}" style="color:#B8956A;">${meetingLink}</a></p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please use the link above to enter your interview room. We recommend joining a few minutes early and making sure your camera and microphone are working properly.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We look forward to speaking with you!</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildAdminCopyHtml(applicantName: string, applicantEmail: string, meetingLink: string, whenLabel: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr>
          <td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Interview starting in ~30 minutes</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A 30-minute reminder has been sent to the applicant. Here are the details for your records.</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Applicant</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">${applicantName}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">${applicantEmail}</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">When</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">${whenLabel} Eastern Time</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Interview Link</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;word-break:break-all;"><a href="${meetingLink}" style="color:#B8956A;">${meetingLink}</a></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">&copy; Arriv Estate Media, LLC &middot; careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function formatWhen(scheduledDate: string, scheduledTime: string): string {
  const [year, month, day] = scheduledDate.split("-").map(Number);
  const [hour, minute] = scheduledTime.split(":").map(Number);
  const dt = new Date(year, month - 1, day, hour, minute);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(dt);
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const conferenceId = body.conference_id;
    const expectedStartIso = body.expected_start_iso;
    if (!conferenceId || !expectedStartIso) {
      return Response.json({ sent: false, error: "conference_id and expected_start_iso required" }, { status: 400 });
    }

    const conf = await base44.asServiceRole.entities.Conference.get(conferenceId);
    if (!conf) return Response.json({ sent: false, reason: "not_found" });
    if (conf.status !== "scheduled") return Response.json({ sent: false, reason: "not_scheduled" });
    if (conf.reminder_suppressed) return Response.json({ sent: false, reason: "suppressed" });
    if (conf.reminder_30min_sent) return Response.json({ sent: false, reason: "already_sent" });
    if (!conf.scheduled_date || !conf.scheduled_time || !conf.meeting_link) {
      return Response.json({ sent: false, reason: "missing_data" });
    }

    // Abort if the interview was rescheduled since this run was scheduled.
    const [y, m, d] = conf.scheduled_date.split("-").map(Number);
    const [h, mi] = conf.scheduled_time.split(":").map(Number);
    const currentStartUtc = etWallToUtc(y, m, d, h, mi);
    if (currentStartUtc.toISOString() !== expectedStartIso) {
      return Response.json({ sent: false, reason: "rescheduled_stale_run" });
    }

    const participant = (conf.participants || [])[0] || {};
    const applicantEmail = participant.email || "";
    const applicantName = participant.name || conf.title || "Candidate";
    if (!applicantEmail) return Response.json({ sent: false, reason: "no_applicant_email" });

    // Applicant reminder — AI interviews get the Ashley intro; human interviews
    // get the second-round leadership email.
    const firstName = deriveFirstName(applicantName);
    const isAi = (conf.interview_mode || "human") === "ai";
    const html = isAi
      ? buildReminderHtml(firstName, conf.meeting_link)
      : buildHumanReminderHtml(firstName, conf.meeting_link);
    const subject = isAi
      ? "Your Arriv Estate Media Interview Starts in 30 Minutes"
      : "Your Second-Round Interview Starts in 30 Minutes";
    try {
      await sendBusinessEmailOrQueue(base44, { to: applicantEmail, subject, htmlContent: html });
    } catch (e) {
      console.warn(`sendInterviewReminder: applicant email failed for ${applicantEmail}: ${e.message}`);
    }

    // Admin/organizer copy
    const adminEmail = Deno.env.get("ADMIN_EMAIL") || "";
    const whenLabel = formatWhen(conf.scheduled_date, conf.scheduled_time);
    const adminHtml = buildAdminCopyHtml(applicantName, applicantEmail, conf.meeting_link, whenLabel);
    const adminSubject = `Interview Reminder (30 min): ${applicantName}`;
    const targets = new Set<string>();
    if (adminEmail) targets.add(adminEmail.toLowerCase());
    if (conf.organizer_email) targets.add(conf.organizer_email.toLowerCase());
    for (const target of targets) {
      if (target === applicantEmail.toLowerCase()) continue;
      try {
        await sendBusinessEmailOrQueue(base44, { to: target, subject: adminSubject, htmlContent: adminHtml });
      } catch (e) {
        console.warn(`sendInterviewReminder: admin email failed for ${target}: ${e.message}`);
      }
    }

    // Mark sent
    try {
      await base44.asServiceRole.entities.Conference.update(conferenceId, {
        reminder_30min_sent: true,
        reminder_30min_sent_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn(`sendInterviewReminder: mark sent failed for ${conferenceId}: ${e.message}`);
    }

    return Response.json({ sent: true, conference_id: conferenceId, applicant: applicantEmail });
  } catch (error) {
    console.error("sendInterviewReminder error:", error.message);
    return Response.json({ sent: false, error: error.message }, { status: 500 });
  }
}