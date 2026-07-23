const SENDER_EMAIL = "careers@arrivestatemedia.com";
const SENDER_NAME = "Arriv Estate Media";

export function deriveFirstName(fullName) {
  if (!fullName) return "there";
  const name = String(fullName).trim();
  if (!name) return "there";
  const first = name.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, "");
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function buildWelcomeHtml(firstName) {
  const appDomain = Deno.env.get("BASE44_APP_DOMAIN") || "app.arrivestatemedia.com";
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for applying to become a Media Specialist with Arriv Estate Media!</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're excited that you're interested in joining our growing network of photographers, videographers, drone pilots, and other real estate media professionals.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;letter-spacing:.2px;">What Happens Next?</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">Our team will carefully review your application, portfolio, equipment, service area, and experience.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">If your qualifications align with our current needs, you'll receive an invitation to begin our onboarding process.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">What to Expect</h2>
          <table cellpadding="0" cellspacing="0" style="width:100%;font-size:16px;line-height:1.6;color:#1A1A1A;">
            <tr><td style="padding:6px 0;">1. Application &amp; Portfolio Review</td></tr>
            <tr><td style="padding:6px 0;">2. Selection Notification</td></tr>
            <tr><td style="padding:6px 0;">3. Onboarding &amp; Account Setup</td></tr>
            <tr><td style="padding:6px 0;">4. Profile Activation</td></tr>
            <tr><td style="padding:6px 0;">5. Begin Receiving Project Opportunities</td></tr>
          </table>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Track Your Application</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">You can check the status of your application at any time by visiting your Media Specialist Application Portal.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Application Portal:</strong></p>
          <p style="margin:0 0 14px;"><a href="${portalUrl}" style="color:#B8956A;font-weight:600;text-decoration:none;word-break:break-all;">${portalUrl}</a></p>
          <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;">The portal allows you to:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>View your current application status</li>
            <li>Review submitted information</li>
            <li>Upload or update requested documents (if needed)</li>
            <li>Receive important updates throughout the review process</li>
          </ul>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">How Project Opportunities Work</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">Once your account is active, you'll begin receiving project opportunities within your selected service area and travel radius.</p>
          <p style="margin:0 0 6px;font-size:16px;line-height:1.6;color:#1A1A1A;">Each opportunity includes:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Property location</li>
            <li>Services requested</li>
            <li>Scheduled date and time</li>
            <li>Your payout</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You'll always have the freedom to accept or decline any project based on your availability and preferences.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Getting Paid</h2>
          <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:#1A1A1A;">During onboarding, you'll choose your preferred payment method:</p>
          <ul style="margin:0 0 14px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Instant Pay (1% processing fee)</li>
            <li>Direct Deposit (No processing fee)</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Payments are processed for completed projects after delivery and client approval.</p>

          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We're committed to building a network of talented professionals who share our passion for quality, reliability, and exceptional service.</p>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your interest in partnering with Arriv Estate Media. We appreciate your application and look forward to reviewing it.</p>
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

export async function sendWelcomeEmail(toEmail, fullName) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY not configured");
  const firstName = deriveFirstName(fullName);
  const html = buildWelcomeHtml(firstName);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: toEmail }],
      subject: "Thank you for applying to Arriv Estate Media",
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Brevo error ${res.status}: ${errText}`);
  }
  return { ok: true };
}