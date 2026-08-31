import { sendBrevoEmail } from "./brevoClient.ts";

function deriveFirstName(fullName) {
  if (!fullName) return "there";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "there";
}

export function buildCustomerOnboardingHtml(firstName, customerEmail, loginUrl, temporaryPassword) {
  let appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
  while (/^https?:\/\//i.test(appDomain)) appDomain = appDomain.replace(/^https?:\/\//i, "");
  appDomain = appDomain.replace(/\/+$/, "");
  const signInUrl = `https://${appDomain}/SignIn`;

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
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#1A1A1A;">Your Arriv Estate Media Account Is Ready</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Hi ${firstName},</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your Arriv Estate Media account has been created so you can easily access and book your real estate media services.</p>

          <h2 style="margin:24px 0 12px;font-size:18px;color:#B8956A;">Your Account Details</h2>
          <table cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border:1px solid rgba(184,149,106,0.2);border-radius:8px;overflow:hidden;">
            <tr><td style="padding:12px 16px;background-color:#F7F1E8;font-size:14px;font-weight:600;color:#1A1A1A;width:40%;">Email</td><td style="padding:12px 16px;font-size:14px;color:#1A1A1A;">${customerEmail}</td></tr>
            <tr><td style="padding:12px 16px;background-color:#F7F1E8;font-size:14px;font-weight:600;color:#1A1A1A;">Temporary Password</td><td style="padding:12px 16px;font-size:14px;color:#1A1A1A;font-family:monospace;font-weight:bold;">${temporaryPassword}</td></tr>
          </table>

          <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:rgba(26,26,26,0.7);"><strong>For your security, you'll be asked to create a new password when you first sign in.</strong></p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Log In to Arriv Estate Media</h2>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
            <tr><td style="border-radius:8px;background-color:#B8956A;">
              <a href="${signInUrl}" style="display:inline-block;padding:13px 28px;font-size:16px;font-weight:600;color:#1A1A1A;text-decoration:none;border-radius:8px;">Log In to Arriv Estate Media</a>
            </td></tr>
          </table>

          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:rgba(26,26,26,0.6);">If you have questions, reply to this email or contact your Arriv Estate Media sales representative.</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>The Arriv Estate Media Team</strong></p>
        </td></tr>
        <tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · Sales@arrivestatemedia.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendCustomerOnboardingEmail(toEmail, fullName, temporaryPassword) {
  const firstName = deriveFirstName(fullName);
  const html = buildCustomerOnboardingHtml(firstName, toEmail, null, temporaryPassword);
  return sendBrevoEmail({
    to: toEmail,
    subject: "Your Arriv Estate Media Account Is Ready",
    htmlContent: html,
    senderName: "Arriv Estate Media Sales",
    senderEmail: "Sales@arrivestatemedia.com",
  });
}