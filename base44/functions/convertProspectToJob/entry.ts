import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { sendBrevoEmail } from "../../shared/brevoClient.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const {
      sales_member_id,
      contact_name,
      contact_email,
      client_name,
      client_email,
      client_phone,
      company,
      pkg,
      package_name,
      locked_add_ons,
      locked_total_price,
      notes,
    } = body;

    if (!sales_member_id || !client_email || !pkg) {
      return Response.json({ error: "sales_member_id, client_email and package are required" }, { status: 400 });
    }

    // Look up the sales rep to confirm and denormalize name/email
    let rep = null;
    try {
      const reps = await base44.asServiceRole.entities.SalesTeamMember.filter({ id: sales_member_id });
      rep = reps && reps[0] ? reps[0] : null;
    } catch (e) {
      // ignore lookup errors
    }
    const repName = rep?.full_name || body.sales_member_name || "";
    const repEmail = rep?.email || body.sales_member_email || "";

    const token = crypto.randomUUID();
    const now = new Date().toISOString();

    const invite = await base44.asServiceRole.entities.ClientSignupInvite.create({
      token,
      sales_member_id,
      sales_member_name: repName,
      sales_member_email: repEmail,
      contact_name: contact_name || client_name || "",
      contact_email: contact_email || client_email || "",
      client_name: client_name || "",
      client_email,
      client_phone: client_phone || "",
      company: company || "",
      package: pkg,
      package_name: package_name || pkg,
      locked_add_ons: locked_add_ons || [],
      locked_total_price: locked_total_price || 0,
      status: "sent",
      notes: notes || "",
      created_at: now,
      email_sent_at: now,
    });

    // Build the signup link from the app domain
    let domain = (Deno.env.get("BASE44_APP_DOMAIN") || "").replace(/\/$/, "");
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    const link = `${base}/ClientSignup?invite=${token}`;

    // Send the invite email to the client via Brevo
    const firstName = (client_name || "").split(" ")[0] || "there";
    const addOnList = (locked_add_ons || [])
      .map((id) => {
        const map = {
          drone: "Drone add-on",
          "3d_tour": "3D Tour",
          twilight: "Twilight exterior edits",
          rush_delivery: "Next-day rush delivery",
          vertical_reel: "Additional vertical reel",
          ai_staging: "AI Staging",
        };
        return `<li>${map[id] || id}</li>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>${repName ? repName + " from " : ""}Arriv Estate Media has put together a media package for your listing. Your information is already filled in — just click the link below, review, and submit.</p>
  <p><strong>Your selected services:</strong></p>
  <ul style="line-height: 1.8;">
    <li><strong>Package:</strong> ${package_name || pkg}</li>
    ${addOnList}
  </ul>
  <p style="text-align: center; margin: 30px 0;">
    <a href="${link}" style="background-color: #B8956A; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Complete My Signup</a>
  </p>
  <p style="font-size: 13px; color: #666;">This link is tied to your sales representative so your booking is credited correctly. You can add more services, but to remove anything please contact your rep.</p>
  <p>Best regards,<br><strong>Arriv Estate Media</strong><br>🌐 arrivestatemedia.com</p>
</body></html>`;

    try {
      await sendBrevoEmail({
        to: client_email,
        subject: "Your Arriv Media Package — Complete Your Signup",
        htmlContent: html,
        senderName: repName ? `${repName} — Arriv Estate Media` : "Arriv Estate Media",
        senderEmail: "careers@arrivestatemedia.com",
      });
    } catch (emailErr) {
      // Still return the link so the rep can share it manually
      return Response.json({
        success: true,
        invite,
        link,
        email_error: emailErr.message,
      });
    }

    return Response.json({ success: true, invite, link });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});