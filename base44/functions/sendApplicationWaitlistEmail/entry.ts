import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail } from "../../shared/brevoClient.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

function buildWaitlistHtml(firstName) {
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
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for applying to become a Media Partner with Arriv Estate Media!</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Great news! You've been approved to join Arriv Estate Media!</strong> We've reserved a future spot for you on the Arriv platform.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">As a startup, we're intentionally onboarding a limited number of Media Partners during our initial launch to ensure we deliver an exceptional experience for both our clients and our partners. Because of our phased rollout, you're currently on our approved waitlist.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We'll contact you as soon as a spot becomes available and we're ready to activate your account. At that time, you'll receive instructions to complete your onboarding, including your Media Partner Agreement, background check, payment setup, and profile activation.</p>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1A1A1A;">In the meantime, please keep an eye on your email for updates regarding:</p>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.8;color:#1A1A1A;">
            <li>Your application status</li>
            <li>Platform news and announcements</li>
            <li>Upcoming onboarding opportunities</li>
            <li>Your invitation to join the Arriv network</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We truly appreciate your patience and your interest in being part of Arriv Estate Media. We're excited about what's ahead and look forward to welcoming you to the platform as we continue to grow.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for your application—we can't wait to work with you!</p>
        </td></tr>
        <tr><td style="padding:0 44px 36px;">
          <p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Warm regards,</p>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>The Arriv Estate Media Team</strong><br/>Building the future of real estate media.</p>
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
    const html = buildWaitlistHtml(firstName);

    await sendBrevoEmail({
      to: app.email,
      subject: "Welcome to the Arriv Estate Media Waitlist",
      htmlContent: html,
    });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});