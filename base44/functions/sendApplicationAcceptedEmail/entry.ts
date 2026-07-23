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

function buildAcceptedHtml(firstName, portalUrl) {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After reviewing your application, we're excited to invite you to join the Arriv Estate Media network as a Media Specialist.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">The next step is to complete your onboarding and create your Media Specialist account.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Complete Your Onboarding</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please click the link below to begin your onboarding process:</p>
          <p style="margin:0 0 20px;">
            <a href="${portalUrl}" style="display:inline-block;background-color:#B8956A;color:#FFFFFF;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:16px;">Complete Onboarding</a>
          </p>
          <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;"><strong>Complete Onboarding:</strong></p>
          <p style="margin:0 0 20px;"><a href="${portalUrl}" style="color:#B8956A;font-weight:600;text-decoration:none;word-break:break-all;">${portalUrl}</a></p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">During Onboarding, You'll:</h2>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Create your Media Specialist account</li>
            <li>Review and accept the Independent Contractor Agreement</li>
            <li>Complete your tax information (W-9)</li>
            <li>Set up your preferred payment method</li>
            <li>Configure your service area and travel radius</li>
            <li>Upload any remaining required documents</li>
            <li>Complete your profile</li>
            <li>Review platform expectations and best practices</li>
          </ul>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Before You Can Receive Projects</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your account must be fully completed and approved before you can begin accepting project opportunities.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once your onboarding is complete, our team will perform a final review. After approval, your account will be activated, and you'll begin receiving project requests within your selected service area.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Need Help?</h2>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you have any questions during onboarding, simply reply to this email and a member of our team will be happy to assist you.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited to welcome you to Arriv Estate Media and look forward to partnering with you.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Welcome aboard!</strong></p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best,</p>
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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const applicationId = body?.applicationId;
    if (!applicationId) return Response.json({ error: 'applicationId is required' }, { status: 400 });

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: 'Application not found' }, { status: 404 });

    const firstName = deriveFirstName(app.full_name);
    const portalUrl = buildPortalLink(app);
    const html = buildAcceptedHtml(firstName, portalUrl);

    await sendBrevoEmail({
      to: app.email,
      subject: "Congratulations — You've been accepted to Arriv Estate Media",
      htmlContent: html,
    });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});