import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { nextEt9amAfter48hIso } from "../../shared/businessEmailQueue.ts";
import { buildOfferNotExtendedEmail } from "../../shared/offerNotExtendedEmail.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const conferenceId = body?.conferenceId;
    if (!conferenceId) return Response.json({ error: "conferenceId is required" }, { status: 400 });

    const conference = await base44.asServiceRole.entities.Conference.get(conferenceId);
    if (!conference) return Response.json({ error: "Conference not found" }, { status: 404 });

    const participant = conference.participants?.[0];
    if (!participant?.id) return Response.json({ error: "No applicant linked to this interview" }, { status: 400 });

    const app = await base44.asServiceRole.entities.JobApplication.get(participant.id);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    // Mark the application as offer_not_extended (same as the manual offer-not-extended flow)
    if (app.status !== "offer_not_extended") {
      await base44.asServiceRole.entities.JobApplication.update(app.id, { status: "offer_not_extended" });
    }

    // Cancel the conference
    if (conference.status !== "cancelled") {
      await base44.asServiceRole.entities.Conference.update(conferenceId, { status: "cancelled" });
    }

    // Queue the same "offer not extended" email for 9:00 AM ET, no sooner than 48 hours from now
    const { to, subject, htmlContent } = buildOfferNotExtendedEmail(app);
    const scheduledFor = nextEt9amAfter48hIso();

    await base44.asServiceRole.entities.QueuedApplicationEmail.create({
      recipient_email: to,
      subject,
      html_content: htmlContent,
      scheduled_for: scheduledFor,
      status: "pending",
      attempts: 0,
    });

    return Response.json({
      success: true,
      applicationId: app.id,
      conferenceId,
      emailScheduledFor: scheduledFor,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});