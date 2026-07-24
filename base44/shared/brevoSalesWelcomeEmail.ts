import { sendBrevoEmail } from "./brevoClient.ts";
import { deriveFirstName } from "./brevoWelcomeEmail.ts";

export function buildSalesWelcomeHtml(firstName) {
  let appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
  while (/^https?:\/\//i.test(appDomain)) {
    appDomain = appDomain.replace(/^https?:\/\//i, "");
  }
  appDomain = appDomain.replace(/\/+$/, "");
  const portalUrl = `https://${appDomain}/ApplicationPortal`;
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
          <h1 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your interest in joining Arriv Estate Media as a Sales Growth Advisor.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited that you've applied to be part of our growing team.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This email confirms that we've successfully received your application.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our hiring team will review your qualifications, experience, and application materials. If your background aligns with what we're looking for, we'll contact you regarding the next steps in the hiring process.</p>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">In the meantime, you can monitor the status of your application anytime through your Arriv Candidate Portal.</p>

          <p style="margin:24px 0 6px;font-size:16px;font-weight:600;color:#1A1A1A;">Check Your Application Status</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;">
            <tr><td align="center" style="padding:8px 0;">
              <a href="${portalUrl}" style="display:inline-block;background-color:#B8956A;color:#1A1A1A;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;padding:13px 28px;">Candidate Portal</a>
            </td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#1A1A1A;">There you'll be able to:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>View your current application status</li>
            <li>Receive updates throughout the hiring process</li>
            <li>Access future interview invitations and communications</li>
            <li>Complete additional hiring steps if requested</li>
          </ul>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We'll also continue sending important updates to the email address you used to apply, so please keep an eye on both your inbox and your Candidate Portal.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in Arriv Estate Media.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We appreciate your time and look forward to reviewing your application.</p>
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

export async function sendSalesWelcomeEmail(toEmail, fullName) {
  const firstName = deriveFirstName(fullName);
  const html = buildSalesWelcomeHtml(firstName);
  return sendBrevoEmail({
    to: toEmail,
    subject: "We've Received Your Application – Arriv Sales Growth Advisor",
    htmlContent: html,
  });
}