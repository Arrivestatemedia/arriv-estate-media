import { sendBusinessEmailOrQueue } from "./businessEmailQueue.ts";
import { deriveFirstName } from "./brevoWelcomeEmail.ts";

export function formatInterviewWhen(scheduledDate: string, scheduledTime: string): string {
  // scheduledDate and scheduledTime are already in Eastern Time (the admin UI
  // collects them as ET). Construct the Date using the LOCAL constructor so the
  // wall-clock values are preserved as-is, and format WITHOUT a timeZone option
  // so the formatter doesn't shift them. (The previous implementation used an
  // ISO string `new Date("YYYY-MM-DDTHH:mm:ss")` which Deno treats as UTC, then
  // formatted with timeZone "America/New_York", converting UTC→ET and shifting
  // the displayed time — and sometimes the date — to the wrong day.)
  const [year, month, day] = scheduledDate.split("-").map(Number);
  const [hour, minute] = scheduledTime.split(":").map(Number);
  const dt = new Date(year, month - 1, day, hour, minute);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(dt);
  return `${dateStr} Eastern Time`;
}

export function formatInterviewDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "30 minutes";
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes >= 120 ? "s" : ""}`;
  return `${minutes} minutes`;
}

export function buildInterviewScheduledHtml(firstName: string, whenLabel: string, durationLabel: string, meetingLink: string): string {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview for the <strong>Sales Growth Advisor</strong> position with Arriv Estate Media has been scheduled.</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">When</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">${whenLabel}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Duration: ${durationLabel}</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Where</h2>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview will be conducted through our built-in video calling system. Join using the link below at your scheduled time.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${meetingLink}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Join Interview</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A;word-break:break-all;">Or copy this link: <a href="${meetingLink}" style="color:#B8956A;">${meetingLink}</a></p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A calendar invitation has also been sent to your email from Google Calendar so you can add it to your schedule.</p>

          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please join a few minutes early and ensure you have a stable internet connection, camera, and microphone ready.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you need to reschedule, simply reply to this email.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder &amp; CEO<br/>Arriv Estate Media</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInterviewScheduledEmail(base44: any, opts: {
  to: string;
  fullName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  meetingLink: string;
}) {
  const { to, fullName, scheduledDate, scheduledTime, durationMinutes, meetingLink } = opts;
  const firstName = deriveFirstName(fullName);
  const whenLabel = formatInterviewWhen(scheduledDate, scheduledTime);
  const durationLabel = formatInterviewDuration(durationMinutes);
  const html = buildInterviewScheduledHtml(firstName, whenLabel, durationLabel, meetingLink);
  await sendBusinessEmailOrQueue(base44, {
    to,
    subject: "Your Interview is Scheduled \u2013 Arriv Sales Growth Advisor",
    htmlContent: html,
  });
}

export function buildInterviewScheduledAdminCopyHtml(adminName: string, applicantName: string, applicantEmail: string, whenLabel: string, durationLabel: string, meetingLink: string): string {
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
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${adminName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">An interview has been scheduled with <strong>${applicantName}</strong> for the Sales Growth Advisor position.</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Applicant</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">${applicantName}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">${applicantEmail}</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">When</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">${whenLabel}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Duration: ${durationLabel}</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Interview Link</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;word-break:break-all;"><a href="${meetingLink}" style="color:#B8956A;">${meetingLink}</a></p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">A calendar invitation and confirmation email have been sent to the applicant.</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInterviewScheduledAdminCopy(base44: any, opts: {
  to: string;
  adminName: string;
  applicantName: string;
  applicantEmail: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  meetingLink: string;
}) {
  const { to, adminName, applicantName, applicantEmail, scheduledDate, scheduledTime, durationMinutes, meetingLink } = opts;
  const whenLabel = formatInterviewWhen(scheduledDate, scheduledTime);
  const durationLabel = formatInterviewDuration(durationMinutes);
  const html = buildInterviewScheduledAdminCopyHtml(adminName, applicantName, applicantEmail, whenLabel, durationLabel, meetingLink);
  await sendBusinessEmailOrQueue(base44, {
    to,
    subject: `Interview Scheduled: ${applicantName} — Sales Growth Advisor`,
    htmlContent: html,
  });
}

export function buildInterviewRescheduledHtml(firstName: string, whenLabel: string, durationLabel: string, meetingLink: string): string {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview for the <strong>Sales Growth Advisor</strong> position with Arriv Estate Media has been <strong>rescheduled</strong>. The updated details are below.</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">New Time</h2>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">${whenLabel}</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Duration: ${durationLabel}</p>

          <h2 style="margin:24px 0 10px;font-size:18px;color:#B8956A;">Where</h2>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your interview link stays the same. Join using the button below at your new scheduled time.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${meetingLink}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Join Interview</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#1A1A1A;word-break:break-all;">Or copy this link: <a href="${meetingLink}" style="color:#B8956A;">${meetingLink}</a></p>

          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">An updated calendar invitation has also been sent to your email from Google Calendar.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If the new time doesn't work, simply reply to this email.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder &amp; CEO<br/>Arriv Estate Media</p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendInterviewRescheduledEmail(base44: any, opts: {
  to: string;
  fullName: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  meetingLink: string;
}) {
  const { to, fullName, scheduledDate, scheduledTime, durationMinutes, meetingLink } = opts;
  const firstName = deriveFirstName(fullName);
  const whenLabel = formatInterviewWhen(scheduledDate, scheduledTime);
  const durationLabel = formatInterviewDuration(durationMinutes);
  const html = buildInterviewRescheduledHtml(firstName, whenLabel, durationLabel, meetingLink);
  await sendBusinessEmailOrQueue(base44, {
    to,
    subject: "Your Interview Has Been Rescheduled – Arriv Sales Growth Advisor",
    htmlContent: html,
  });
}

export async function sendInterviewRescheduledAdminCopy(base44: any, opts: {
  to: string;
  adminName: string;
  applicantName: string;
  applicantEmail: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMinutes: number;
  meetingLink: string;
}) {
  const { to, adminName, applicantName, applicantEmail, scheduledDate, scheduledTime, durationMinutes, meetingLink } = opts;
  const whenLabel = formatInterviewWhen(scheduledDate, scheduledTime);
  const durationLabel = formatInterviewDuration(durationMinutes);
  const html = buildInterviewScheduledAdminCopyHtml(adminName, applicantName, applicantEmail, whenLabel, durationLabel, meetingLink);
  await sendBusinessEmailOrQueue(base44, {
    to,
    subject: `Interview Rescheduled: ${applicantName} — Sales Growth Advisor`,
    htmlContent: html,
  });
}