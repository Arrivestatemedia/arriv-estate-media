import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifyAndGet, computeStep } from "../../shared/salesOnboardingShared.ts";
import { sendSalesAccountReadyEmail } from "../../shared/brevoSalesAccountReady.ts";
import { sendBrevoEmail } from "../../shared/brevoClient.ts";

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

    // Archive the job application once onboarding is fully completed
    if (step === "training") {
      try {
        await base44.asServiceRole.entities.JobApplication.update(applicationId, { archived: true });
      } catch (e) {
        console.error("archive application after onboarding failed:", e.message);
      }
      try {
        const adminEmail = Deno.env.get("ADMIN_EMAIL");
        if (adminEmail) {
          await sendBrevoEmail({
            to: adminEmail,
            subject: `Sales onboarding complete: ${v.app.full_name}`,
            textContent: `${v.app.full_name} has completed all onboarding steps and is ready to begin training.\n\nApplication email: ${v.app.email}\nCompleted at: ${now}`,
          });
        }
      } catch (e) {
        console.error("training admin notify failed:", e.message);
      }

      // Provision the sales account + send the "Sales Account Is Ready" email (idempotent)
      try {
        const existingMembers = await base44.asServiceRole.entities.SalesTeamMember.filter({ email: v.app.email });
        let tempPassword = null;
        if (!existingMembers || existingMembers.length === 0) {
          // Generate a temporary password and create the sales account
          tempPassword = (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8).toUpperCase());
          const encoder = new TextEncoder();
          const data = encoder.encode(tempPassword);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const passwordHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          await base44.asServiceRole.entities.SalesTeamMember.create({
            email: v.app.email,
            full_name: v.app.full_name,
            phone_number: v.app.phone || '',
            password_hash: passwordHash,
            is_active: true,
            force_password_change: true,
          });
        }
        // Always send the ready email (temp password line only included if newly created)
        await sendSalesAccountReadyEmail(v.app.email, v.app.full_name, tempPassword);
      } catch (e) {
        console.error("training sales account provisioning failed:", e.message);
      }
    }

    return Response.json({ success: true, onboarding: rec });
  } catch (error) {
    console.error("saveSalesOnboardingStep error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});