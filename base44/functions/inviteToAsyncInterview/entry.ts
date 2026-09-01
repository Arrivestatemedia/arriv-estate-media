import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * inviteToAsyncInterview
 * Creates an InterviewSession with a secure token + 48-hour deadline and sends
 * the asynchronous first-round invitation email. Does NOT schedule a calendar slot.
 *
 * Body:
 *   applicationId  — JobApplication ID
 *   deadlineHours  — optional (default 48)
 *   createdBy      — optional admin name/id
 *
 * Returns { status, session, email_sent }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { applicationId, deadlineHours, createdBy } = body;

    if (!applicationId) {
      return Response.json({ error: "applicationId is required" }, { status: 400 });
    }

    // Load the application
    const appRes = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    const app = appRes?.data ?? appRes;
    if (!app) {
      return Response.json({ error: "Application not found" }, { status: 404 });
    }

    // Check for an existing non-expired/complete session for this application
    const existingRes = await base44.asServiceRole.entities.InterviewSession.filter(
      { application_id: applicationId },
      "-created_date",
      10
    );
    const existing = (existingRes?.data ?? existingRes) || [];
    const active = Array.isArray(existing)
      ? existing.find(s => ["INVITED", "OPENED", "FORMAT_SELECTED", "STARTED", "IN_PROGRESS", "REOPENED"].includes(s.status))
      : null;
    if (active) {
      return Response.json({
        status: "exists",
        session: active,
        message: "An active interview invitation already exists for this candidate.",
      });
    }

    const hours = Math.max(1, Math.min(168, parseInt(deadlineHours, 10) || 48));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + hours * 3600 * 1000);

    // Generate a secure opaque token
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

    const positionTitle = app.position === "sales_growth_advisor"
      ? "Sales Growth Advisor"
      : app.position === "media_specialist"
        ? "Media Specialist"
        : "Arriv Estate Media";

    const session = await base44.asServiceRole.entities.InterviewSession.create({
      session_token: token,
      application_id: applicationId,
      candidate_name: app.full_name,
      candidate_email: app.email,
      position_title: positionTitle,
      round: 1,
      status: "INVITED",
      deadline_hours: hours,
      invited_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      created_by_id: createdBy || null,
    });

    // Build the secure interview link
    const domain = Deno.env.get("BASE44_APP_DOMAIN") || "https://arrivestatemedia.base44.app";
    const interviewUrl = `${domain}/AsyncInterview?token=${token}`;

    // Send the async invitation email via the business email queue
    const firstName = (app.full_name || "").split(" ")[0] || "there";
    const deadlineDisplay = expiresAt.toLocaleString("en-US", {
      weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
      timeZone: "America/New_York",
    });

    const html = buildInvitationEmail(firstName, positionTitle, interviewUrl, deadlineDisplay);

    let emailSent = false;
    try {
      await base44.integrations.Core.SendEmail({
        to: app.email,
        subject: `Arriv Estate Media | Complete Your First-Round Interview`,
        body: html,
      });
      emailSent = true;
    } catch (e) {
      console.warn("Invitation email failed:", e.message);
    }

    return Response.json({ status: "success", session, email_sent: emailSent, interview_url: interviewUrl });
  } catch (error) {
    console.error("inviteToAsyncInterview error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function buildInvitationEmail(firstName, positionTitle, interviewUrl, deadlineDisplay) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
        <tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:40px 44px;">
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You've been selected to complete a first-round interview for the <strong>${positionTitle}</strong> position with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your first-round interview is completed virtually and can be taken at your convenience. Please use the link below to complete your interview within 48 hours.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">The interview takes approximately 15 minutes.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">You'll be able to choose between two interview experiences:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li><strong>Conversational Interview</strong> — meet with Ashley, our AI-powered virtual recruiting assistant, who will guide you through the interview.</li>
            <li><strong>Self-Guided Video Interview</strong> — complete the same interview independently by viewing each question on screen and recording your response.</li>
          </ul>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:rgba(26,26,26,0.7);">Both formats contain the same interview questions and are evaluated using the same criteria. Your choice will not affect your candidacy.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${interviewUrl}" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">COMPLETE MY INTERVIEW</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#1A1A1A;">Please complete your interview by:</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#B8956A;font-weight:600;">${deadlineDisplay}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:rgba(26,26,26,0.7);">Candidates selected to move forward will be contacted regarding the next step.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Arriv Estate Media Recruiting</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}