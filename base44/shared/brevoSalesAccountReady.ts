import { sendBrevoEmail } from "./brevoClient.ts";
import { deriveFirstName } from "./brevoWelcomeEmail.ts";

export function buildSalesAccountReadyHtml(firstName, tempPassword) {
  let appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
  while (/^https?:\/\//i.test(appDomain)) appDomain = appDomain.replace(/^https?:\/\//i, "");
  appDomain = appDomain.replace(/\/+$/, "");
  const loginUrl = `https://${appDomain}/SalesLogin?tab=training`;

  const credsHtml = tempPassword
    ? `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your temporary login password is: <strong style="color:#B8956A;">${tempPassword}</strong></p>`
    : "";

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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Congratulations, and welcome to Arriv Estate Media!</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You've successfully completed your onboarding, and your account has been activated.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited to have you join our team as a Sales Growth Advisor and look forward to helping you succeed as we continue growing Arriv together.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Access the Arriv Sales System</h2>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your sales dashboard is now available.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1A1A1A;">Please use the button below to access the system:</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${loginUrl}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">🚀 Log In to the Arriv Sales System</a>
            </td></tr>
          </table>
          ${credsHtml}
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">We recommend bookmarking this page in your web browser, as you'll be using it regularly to:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>View and manage your leads</li>
            <li>Track your sales activity</li>
            <li>Log calls and notes</li>
            <li>Manage follow-ups</li>
            <li>Access sales tools and resources</li>
            <li>Monitor your performance</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">This will be your primary workspace as an Arriv Sales Growth Advisor.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If you experience any issues accessing your account or have questions as you begin, don't hesitate to reply to this email. We're here to help.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once again, welcome to the team!</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited to have you with us and can't wait to see the impact you'll make.</p>
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

export async function sendSalesAccountReadyEmail(toEmail, fullName, tempPassword) {
  const firstName = deriveFirstName(fullName);
  const html = buildSalesAccountReadyHtml(firstName, tempPassword);
  return sendBrevoEmail({
    to: toEmail,
    subject: "Welcome to Arriv! Your Sales Account Is Ready",
    htmlContent: html,
  });
}