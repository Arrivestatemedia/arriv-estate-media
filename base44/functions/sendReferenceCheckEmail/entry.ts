import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

function genId() {
  return "ref_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
}

// Deadline = end of business the day after the email is sent (Eastern Time).
function deadlineDisplayAndDate() {
  const now = new Date();
  // Tomorrow in ET
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (t) => Number(etParts.find((p) => p.type === t).value);
  const tomorrowUtc = Date.UTC(get("year"), get("month") - 1, get("day")) + 86400000;
  const t = new Date(tomorrowUtc);
  const dateStr = t.toISOString().slice(0, 10);
  const display = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date(tomorrowUtc + 12 * 3600000));
  return { dateStr, display };
}

export function buildReferenceEmailHtml(firstName, submitUrl, deadlineDisplay) {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for taking the time to interview for the Sales Growth Advisor position with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As the next step in our hiring process, please provide your professional references using the link below. We ask that you include people who can speak to your work ethic, dependability, communication, professionalism, and ability to meet goals.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr><td align="center">
              <a href="${submitUrl}" style="display:inline-block;background-color:#B8956A;color:#1A1A1A;font-weight:600;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.3px;">SUBMIT YOUR REFERENCES</a>
            </td></tr>
          </table>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please complete the reference form by <strong>${deadlineDisplay}</strong>. We will contact your references only as part of our hiring evaluation, and submitting references does not guarantee an offer of employment.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your continued interest in joining Arriv Estate Media. We appreciate your time and look forward to completing the next stage of the process.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder<br/>Arriv Estate Media<br/>careers@arrivestatemedia.com</p>
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
    if (!applicationId) return Response.json({ error: "applicationId is required" }, { status: 400 });

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    // Reuse an existing pending request for this application if one exists (idempotent).
    let existing = [];
    try {
      existing = await base44.asServiceRole.entities.ApplicantReference.filter({ application_id: applicationId, status: "requested" });
    } catch (e) {}
    let record = existing && existing[0];

    const now = new Date().toISOString();
    const { dateStr, display } = deadlineDisplayAndDate();

    if (!record) {
      const referenceId = genId();
      record = await base44.asServiceRole.entities.ApplicantReference.create({
        reference_id: referenceId,
        application_id: applicationId,
        applicant_email: app.email,
        applicant_name: app.full_name,
        position: app.position || "sales_growth_advisor",
        request_sent_at: now,
        deadline: dateStr,
        status: "requested",
      });
    } else {
      // Refresh deadline/sent timestamp on re-send.
      await base44.asServiceRole.entities.ApplicantReference.update(record.id, {
        request_sent_at: now,
        deadline: dateStr,
      });
    }

    let appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
    while (/^https?:\/\//i.test(appDomain)) appDomain = appDomain.replace(/^https?:\/\//i, "");
    appDomain = appDomain.replace(/\/+$/, "");
    const submitUrl = `https://${appDomain}/SubmitReferences?ref=${record.reference_id}`;

    const firstName = deriveFirstName(app.full_name);
    const html = buildReferenceEmailHtml(firstName, submitUrl, display);

    await sendBusinessEmailOrQueue(base44, {
      to: app.email,
      subject: "Next Step: Provide Your References – Arriv Sales Growth Advisor",
      htmlContent: html,
    });

    return Response.json({ success: true, sentTo: app.email, reference_id: record.reference_id, deadline: display });
  } catch (error) {
    console.error("sendReferenceCheckEmail error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});