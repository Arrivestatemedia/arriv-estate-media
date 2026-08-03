import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifyAndGet, computeStep } from "../../shared/salesOnboardingShared.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { applicationId, fullName, addressPrefix } = body;
    if (!applicationId || !fullName || !addressPrefix) {
      return Response.json({ error: "applicationId, fullName, and addressPrefix are required" }, { status: 400 });
    }
    const v = await verifyAndGet(base44, applicationId, fullName, addressPrefix);
    if (v.error) return Response.json({ error: v.error }, { status: v.status });

    const app = v.app;
    const existing = await base44.asServiceRole.entities.SalesOnboarding.filter({ application_id: applicationId });
    let onboarding = existing && existing[0];

    if (!onboarding) {
      onboarding = await base44.asServiceRole.entities.SalesOnboarding.create({
        application_id: applicationId,
        full_name: app.full_name,
        email: app.email,
        current_step: 1,
      });
    }

    // Always recompute current_step from the actual completion flags so the
    // wizard resumes at the correct step even if the stored value is stale.
    const correctStep = computeStep(onboarding);
    if (onboarding.current_step !== correctStep) {
      await base44.asServiceRole.entities.SalesOnboarding.update(onboarding.id, { current_step: correctStep });
      onboarding.current_step = correctStep;
    }

    // Best-effort: attach admin-configured welcome video URL
    let welcome_video_url = "";
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_welcome_video_url" });
      if (settings && settings[0]) welcome_video_url = settings[0].value || "";
    } catch (_e) {}

    return Response.json({ onboarding, welcome_video_url });
  } catch (error) {
    console.error("getSalesOnboarding error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});