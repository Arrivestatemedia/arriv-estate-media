import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail } from "../../shared/brevoClient.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

function buildPortalLink(app) {
  let appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
  while (/^https?:\/\//i.test(appDomain)) {
    appDomain = appDomain.replace(/^https?:\/\//i, "");
  }
  appDomain = appDomain.replace(/\/+$/, "");
  const name = encodeURIComponent(app.full_name || "");
  const digits = (app.address || "").match(/\d+/)?.[0] || "";
  return `https://${appDomain}/ApplicationPortal?name=${name}&addr=${encodeURIComponent(digits)}`;
}

function buildOfferHtml(firstName, portalUrl) {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Congratulations!</strong></p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited to offer you the position of <strong>Sales Growth Advisor</strong> with Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After reviewing your application and speaking with you during the interview process, we believe you'll be a great addition to our team. We're looking forward to having you help us grow Arriv as we continue expanding across new markets.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Your Offer</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As a Sales Growth Advisor, you'll play an important role in introducing Arriv Estate Media to real estate professionals and helping us build lasting relationships with new clients.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background-color:#F7F1E8;border-radius:8px;">
            <tr><td style="padding:16px 20px;font-size:16px;line-height:1.7;color:#1A1A1A;">
              <p style="margin:0 0 6px;"><strong>Position:</strong> Sales Growth Advisor</p>
              <p style="margin:0 0 6px;"><strong>Employment Type:</strong> Independent Contractor (1099)</p>
              <p style="margin:0;"><strong>Compensation:</strong> Commission-based, plus a $500 training bonus after successfully completing your first two weeks of training and meeting the program requirements.</p>
            </td></tr>
          </table>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Next Steps</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">To officially accept your offer, please log in to your Arriv Candidate Portal using the button below.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${portalUrl}" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Accept My Offer</a>
            </td></tr>
          </table>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once logged in, you'll be able to:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Review your official offer</li>
            <li>Accept or decline the position</li>
            <li>Complete your onboarding paperwork</li>
            <li>Sign your Independent Contractor Agreement</li>
            <li>Begin your onboarding and training</li>
          </ul>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please review and respond to your offer within <strong>7 days</strong>. If you need additional time or have any questions before making your decision, simply reply to this email—we're happy to help.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited about the possibility of working together and can't wait to see the impact you'll make as part of the Arriv team.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Welcome to Arriv!</strong></p>
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
    if (!applicationId) return Response.json({ error: "applicationId is required" }, { status: 400 });

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    const firstName = deriveFirstName(app.full_name);
    const portalUrl = buildPortalLink(app);
    const html = buildOfferHtml(firstName, portalUrl);

    const now = new Date().toISOString();
    const updateData = { offer_extended_at: now };
    if (app.status !== "offer_extended") updateData.status = "offer_extended";

    await base44.asServiceRole.entities.JobApplication.update(applicationId, updateData);

    await sendBrevoEmail({
      to: app.email,
      subject: "Congratulations! Your Offer from Arriv Estate Media",
      htmlContent: html,
    });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});