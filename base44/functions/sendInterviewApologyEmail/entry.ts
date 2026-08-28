import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";

/**
 * Sends an apology + resume-interview email to a candidate whose AI interview
 * disconnected, and sends an exact copy to the admin (ADMIN_EMAIL).
 *
 * Body: { conferenceId }  (optional; falls back to roomName)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const conferenceId = body?.conferenceId;
    const roomName = body?.roomName;

    if (!conferenceId && !roomName) {
      return Response.json({ error: "conferenceId or roomName is required" }, { status: 400 });
    }

    let conference;
    if (conferenceId) {
      conference = await base44.asServiceRole.entities.Conference.get(conferenceId);
    } else {
      const res = await base44.asServiceRole.entities.Conference.filter({ room_name: roomName }, "-created_date", 1);
      const list = res?.data ?? res ?? [];
      conference = Array.isArray(list) ? list[0] : null;
    }
    if (!conference) return Response.json({ error: "Conference not found" }, { status: 404 });

    const candidate = (conference.participants || [])[0] || {};
    const candidateName = candidate.name || "there";
    const firstName = candidateName.split(" ")[0];
    const candidateEmail = candidate.email;
    const meetingLink = conference.meeting_link;
    if (!candidateEmail || !meetingLink) {
      return Response.json({ error: "Missing candidate email or meeting link on conference" }, { status: 400 });
    }

    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    if (!adminEmail) return Response.json({ error: "ADMIN_EMAIL not configured" }, { status: 500 });

    const subject = "Your Arriv Interview — Let's Pick Up Where We Left Off";

    const htmlContent = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:Georgia,'Times New Roman',serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid rgba(184,149,106,0.25);border-radius:12px;overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:24px 32px;text-align:center;">
          <span style="color:#B8956A;font-size:22px;letter-spacing:3px;font-weight:bold;">ARRIV</span>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="font-size:20px;color:#1A1A1A;margin:0 0 20px 0;font-weight:bold;">Hi ${firstName},</p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 18px 0;">
            I'm really sorry about what happened this morning with your interview — the connection dropped on our end, and that's on us, not you. I know you'd set aside the time and were ready to go, and I sincerely apologize for the disruption.
          </p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 18px 0;">
            The good news: you can <strong>resume your interview right now using the same link from this morning</strong>. Everything you already covered is saved, so our AI interviewer (Ashley) will pick right back up where you left off — you won't need to start over or re-answer anything.
          </p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 24px 0;">
            Here's your link again:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
            <tr><td align="center">
              <a href="${meetingLink}" style="display:inline-block;background-color:#B8956A;color:#1A1A1A;font-family:Georgia,serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:0.5px;">Join the Interview</a>
            </td></tr>
          </table>
          <p style="font-size:13px;color:rgba(26,26,26,0.6);margin:0 0 28px 0;text-align:center;word-break:break-all;">
            ${meetingLink}
          </p>
          <p style="font-size:15px;line-height:1.7;color:#1A1A1A;margin:0 0 12px 0;"><strong>A few quick tips for a smooth session:</strong></p>
          <ul style="font-size:15px;line-height:1.8;color:#1A1A1A;margin:0 0 24px 0;padding-left:22px;">
            <li>Make sure you're on a stable Wi-Fi or cellular connection</li>
            <li>Find a quiet space with good lighting</li>
            <li>You can join from your phone or computer</li>
            <li>If anything hiccups, just re-click the link — the session stays open and you'll rejoin automatically</li>
          </ul>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 28px 0;">
            Take your time — whenever you're ready today, just click the link and Ashley will welcome you back.
          </p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:0 0 8px 0;">
            Again, I apologize for the inconvenience this morning. We're excited to hear from you.
          </p>
          <p style="font-size:16px;line-height:1.7;color:#1A1A1A;margin:18px 0 0 0;">
            Best,<br>
            <strong>Brad</strong><br>
            <span style="color:#B8956A;">Arriv Estate Media</span>
          </p>
        </td></tr>
        <tr><td style="background-color:#F3EFE9;padding:18px 40px;border-top:1px solid rgba(184,149,106,0.2);">
          <p style="font-size:12px;color:rgba(26,26,26,0.5);margin:0;text-align:center;">
            This is an automated message from Arriv Estate Media. Please do not reply to this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // Send to the candidate
    const candidateResult = await sendBusinessEmailOrQueue(base44, {
      to: candidateEmail,
      subject,
      htmlContent,
    });

    // Send an exact copy to the admin
    let adminResult = null;
    try {
      adminResult = await sendBusinessEmailOrQueue(base44, {
        to: adminEmail,
        subject: `[COPY] ${subject}`,
        htmlContent,
      });
    } catch (e) {
      adminResult = { error: e.message };
    }

    return Response.json({
      success: true,
      sentTo: candidateEmail,
      candidateResult,
      adminCopySentTo: adminEmail,
      adminResult,
      meetingLink,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});