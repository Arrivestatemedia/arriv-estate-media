import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifyAndGet, computeStep } from "../../shared/salesOnboardingShared.ts";

const STEP_FIELDS = {
  personal_info: ["mailing_address", "city", "state", "zip", "phone", "emergency_contact_name", "emergency_contact_phone"],
  ica: ["ica_signature", "ica_version"],
  w9: ["w9_legal_name", "w9_business_name", "w9_address", "w9_tax_classification", "w9_llc_classification", "w9_tin", "w9_signature"],
  welcome_video: [],
  training: [],
};

const ICA_VERSION = "2026-07-24";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { applicationId, fullName, addressPrefix, step, data } = body;
    if (!applicationId || !fullName || !addressPrefix || !step) {
      return Response.json({ error: "applicationId, fullName, addressPrefix, and step are required" }, { status: 400 });
    }
    const v = await verifyAndGet(base44, applicationId, fullName, addressPrefix);
    if (v.error) return Response.json({ error: v.error }, { status: v.status });

    const existing = await base44.asServiceRole.entities.SalesOnboarding.filter({ application_id: applicationId });
    let rec = existing && existing[0];
    if (!rec) {
      rec = await base44.asServiceRole.entities.SalesOnboarding.create({
        application_id: applicationId,
        full_name: v.app.full_name,
        email: v.app.email,
        current_step: 1,
      });
    }

    const update = {};
    const now = new Date().toISOString();
    (STEP_FIELDS[step] || []).forEach((f) => {
      if (data && data[f] !== undefined) update[f] = data[f];
    });

    if (step === "personal_info") update.personal_info_completed_at = now;
    if (step === "ica") { update.ica_signature = data?.ica_signature || v.app.full_name; update.ica_version = ICA_VERSION; update.ica_signed_at = now; }
    if (step === "w9") update.w9_completed_at = now;
    if (step === "welcome_video") update.welcome_video_watched_at = now;
    if (step === "training") {
      update.training_started_at = now;
      update.completed_at = now;
    }

    rec = await base44.asServiceRole.entities.SalesOnboarding.update(rec.id, update);
    rec = { ...rec, ...update };
    const nextStep = computeStep(rec);
    await base44.asServiceRole.entities.SalesOnboarding.update(rec.id, { current_step: nextStep });
    rec.current_step = nextStep;

    // Notify admin when onboarding is fully completed
    if (step === "training") {
      try {
        const adminEmail = Deno.env.get("ADMIN_EMAIL");
        if (adminEmail) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: adminEmail,
            subject: `Sales onboarding complete: ${v.app.full_name}`,
            body: `${v.app.full_name} has completed all onboarding steps and is ready to begin training.\n\nApplication email: ${v.app.email}\nCompleted at: ${now}`,
          });
        }
      } catch (e) {
        console.error("training admin notify failed:", e.message);
      }
    }

    return Response.json({ success: true, onboarding: rec });
  } catch (error) {
    console.error("saveSalesOnboardingStep error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});