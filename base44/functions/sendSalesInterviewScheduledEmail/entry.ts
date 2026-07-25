import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

function formatWhen(scheduledDate, scheduledTime) {
  const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
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

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return "30 minutes";
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes >= 120 ? "s" : ""}`;
  return `${minutes} minutes`;
}

function buildHtml(firstName, whenLabel, durationLabel, meetingLink) {
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const applicationId = body?.applicationId;
    const meetingLink = body?.meetingLink;
    const scheduledDate = body?.scheduledDate;
    const scheduledTime = body?.scheduledTime;
    const durationMinutes = body?.durationMinutes || 30;

    if (!applicationId || !meetingLink || !scheduledDate || !scheduledTime) {
      return Response.json({ error: "applicationId, meetingLink, scheduledDate, scheduledTime are required" }, { status: 400 });
    }

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    const firstName = deriveFirstName(app.full_name);
    const whenLabel = formatWhen(scheduledDate, scheduledTime);
    const durationLabel = formatDuration(durationMinutes);
    const html = buildHtml(firstName, whenLabel, durationLabel, meetingLink);

    await sendBusinessEmailOrQueue(base44, {
      to: app.email,
      subject: "Your Interview is Scheduled \u2013 Arriv Sales Growth Advisor",
      htmlContent: html,
    });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});