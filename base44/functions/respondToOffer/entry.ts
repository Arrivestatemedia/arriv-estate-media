import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBrevoEmail } from "../../shared/brevoClient.ts";
import { deriveFirstName } from "../../shared/brevoWelcomeEmail.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const applicationId = body?.applicationId;
    const fullName = (body.fullName || "").trim();
    const addressPrefix = (body.addressPrefix || "").trim().slice(0, 4);
    const response = body?.response; // "accept" | "decline"

    if (!applicationId || !fullName || !addressPrefix) {
      return Response.json({ error: "applicationId, fullName, and addressPrefix are required" }, { status: 400 });
    }
    if (response !== "accept" && response !== "decline") {
      return Response.json({ error: "response must be 'accept' or 'decline'" }, { status: 400 });
    }

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    // Verify identity (name + address digits) so only the real applicant can respond
    const nameOk = (app.full_name || "").trim().toLowerCase() === fullName.toLowerCase();
    const addrOk = (app.address || "").trim().toLowerCase().startsWith(addressPrefix.toLowerCase());
    if (!nameOk || !addrOk) {
      return Response.json({ error: "Application details did not match our records" }, { status: 403 });
    }

    const now = new Date().toISOString();

    if (response === "accept") {
      await base44.asServiceRole.entities.JobApplication.update(applicationId, {
        status: "hired",
        offer_accepted_at: now,
      });

      // Best-effort confirmation email
      try {
        const firstName = deriveFirstName(app.full_name);
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
<tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;"><img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;"/></td></tr>
<tr><td style="padding:40px 44px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Welcome to Arriv!</strong></p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for accepting the Sales Growth Advisor position. We're thrilled to have you on board.</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Your onboarding will begin shortly. You can track your next steps anytime in your Arriv Candidate Portal.</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We'll be in touch with your training schedule and everything you need to get started.</p>
</td></tr>
<tr><td style="padding:0 44px 36px;"><p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p><p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder &amp; CEO<br/>Arriv Estate Media</p></td></tr>
<tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;"><p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p></td></tr>
</table></td></tr></table></body></html>`;
        await sendBrevoEmail({
          to: app.email,
          subject: "Welcome to Arriv — Offer Accepted",
          htmlContent: html,
        });
      } catch (e) {
        console.error("respondToOffer accept email failed:", e.message);
      }

      return Response.json({ success: true, status: "hired" });
    } else {
      await base44.asServiceRole.entities.JobApplication.update(applicationId, {
        status: "offer_not_extended",
        offer_declined_at: now,
      });

      try {
        const firstName = deriveFirstName(app.full_name);
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background-color:#FFFBF5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFBF5;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:14px;border:1px solid rgba(184,149,106,0.25);overflow:hidden;">
<tr><td style="background-color:#1A1A1A;padding:36px 32px;text-align:center;"><img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698b3b9e4b7d348873dbf213/4c4bb5dc6_ArrivLogo.png" alt="Arriv Estate Media" height="110" style="height:110px;width:auto;display:block;margin:0 auto;"/></td></tr>
<tr><td style="padding:40px 44px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#1A1A1A;">Hi ${firstName},</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">Thank you for letting us know. We've recorded that you've declined the Sales Growth Advisor offer.</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#1A1A1A;">We appreciate the time you spent with us, and we wish you the very best in your next opportunity.</p>
</td></tr>
<tr><td style="padding:0 44px 36px;"><p style="margin:0 0 4px;font-size:16px;line-height:1.6;color:#1A1A1A;">Best regards,</p><p style="margin:0;font-size:16px;line-height:1.6;color:#1A1A1A;"><strong>Brad Burke</strong><br/>Founder &amp; CEO<br/>Arriv Estate Media</p></td></tr>
<tr><td style="background-color:#F7F1E8;padding:18px 44px;text-align:center;"><p style="margin:0;font-size:12px;color:#9a8560;">© Arriv Estate Media, LLC · careers@arrivestatemedia.com</p></td></tr>
</table></td></tr></table></body></html>`;
        await sendBrevoEmail({
          to: app.email,
          subject: "Your Arriv Offer — Decline Confirmed",
          htmlContent: html,
        });
      } catch (e) {
        console.error("respondToOffer decline email failed:", e.message);
      }

      return Response.json({ success: true, status: "offer_not_extended" });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});