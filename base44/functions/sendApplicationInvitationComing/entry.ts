import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

function buildInvitationComingHtml(firstName) {
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
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1A1A1A;">Congratulations ${firstName}!</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">You&rsquo;ve been approved to join Arriv Estate Media as one of our Media Partners.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for your patience. As a startup, we&rsquo;re taking our time to build a strong foundation before activating new Media Partners. Over the past few weeks, we&rsquo;ve been preparing the platform, refining our onboarding experience, and building relationships with local real estate clients. Because of that, your official invitation to create your Arriv account will be arriving soon.</p>

          <h2 style="margin:28px 0 12px;font-size:18px;color:#B8956A;">Once you receive your invitation, you&rsquo;ll be able to:</h2>
          <ul style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.7;color:#1A1A1A;">
            <li>Create your Arriv account</li>
            <li>Complete your Media Partner profile</li>
            <li>Review and accept the Media Partner Agreement</li>
            <li>Connect your payment information through Stripe</li>
            <li>Watch a welcome video from our Founder</li>
          </ul>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">After your account is set up, you&rsquo;ll be ready to receive assignment opportunities in your service area. As with any growing marketplace, assignment volume will increase over time as we continue adding more real estate agents, brokerages, builders, and property managers. We&rsquo;re excited to have you join us during these early stages and look forward to growing together.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We&rsquo;re currently targeting our first Media Partner activations for your area in mid-August and will keep you updated along the way.</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you again for believing in Arriv. We can&rsquo;t wait to welcome you officially.</p>
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
    const html = buildInvitationComingHtml(firstName);

    await sendBusinessEmailOrQueue(base44, {
      to: app.email,
      subject: "You're Approved to Join Arriv Estate Media!",
      htmlContent: html,
    });

    // Mark the applicant as accepted-but-pending so their portal reflects this state.
    await base44.asServiceRole.entities.JobApplication.update(applicationId, {
      status: "accepted_pending",
    });

    return Response.json({ success: true, sentTo: app.email, status: "accepted_pending" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});