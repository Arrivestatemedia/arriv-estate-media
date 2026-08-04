import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendBusinessEmailOrQueue } from "../../shared/businessEmailQueue.ts";
import { buildOfferNotExtendedEmail } from "../../shared/offerNotExtendedEmail.ts";

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

    const { to, subject, htmlContent } = buildOfferNotExtendedEmail(app);

    if (app.status !== "offer_not_extended") {
      await base44.asServiceRole.entities.JobApplication.update(applicationId, { status: "offer_not_extended" });
    }

    await sendBusinessEmailOrQueue(base44, { to, subject, htmlContent });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});