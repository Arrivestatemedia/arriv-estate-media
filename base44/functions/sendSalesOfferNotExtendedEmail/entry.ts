import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

function buildOfferNotExtendedHtml(firstName) {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for taking the time to apply and interview for the Sales Growth Advisor position with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We sincerely appreciate your interest in joining our team and the opportunity to learn more about your background and experience.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After careful consideration, we've decided to move forward with other candidates whose experience and qualifications more closely align with our current needs.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This decision was not an easy one. We received applications from many talented individuals, and we truly appreciate the time and effort you invested throughout the hiring process.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As Arriv continues to grow, new opportunities will become available, and we'd be happy to consider your application for future positions that may be a better fit.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in Arriv Estate Media. We wish you the very best in your career and future endeavors.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Kind regards,</p>
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
    if (!applicationId) return Response.json({ error: "applicationId is required" }, { status: 400 });

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    const firstName = deriveFirstName(app.full_name);
    const html = buildOfferNotExtendedHtml(firstName);

    if (app.status !== "offer_not_extended") {
      await base44.asServiceRole.entities.JobApplication.update(applicationId, { status: "offer_not_extended" });
    }

    await sendBusinessEmailOrQueue(base44, {
      to: app.email,
      subject: "Update on Your Application – Arriv Sales Growth Advisor",
      htmlContent: html,
    });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});