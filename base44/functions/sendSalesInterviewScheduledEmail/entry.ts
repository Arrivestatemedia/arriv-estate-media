import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { sendInterviewScheduledEmail } from "../../shared/interviewScheduledEmail.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const applicationId = body?.applicationId;
    const meetingLink = body?.meetingLink;
    const scheduledDate = body?.scheduledDate;
    const scheduledTime = body?.scheduledTime;
    const durationMinutes = body?.durationMinutes || 30;

    if (!applicationId || !meetingLink || !scheduledDate || !scheduledTime) {
      return Response.json({ error: "applicationId, meetingLink, scheduledDate, scheduledTime are required" }, { status: 400 });
    }

    const app = await base44.asServiceRole.entities.JobApplication.get(applicationId);
    if (!app) return Response.json({ error: "Application not found" }, { status: 404 });

    await sendInterviewScheduledEmail(base44, {
      to: app.email,
      fullName: app.full_name,
      scheduledDate,
      scheduledTime,
      durationMinutes,
      meetingLink,
    });

    return Response.json({ success: true, sentTo: app.email });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});