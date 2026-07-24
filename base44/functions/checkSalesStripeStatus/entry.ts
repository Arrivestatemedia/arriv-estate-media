import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
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

    const existing = await base44.asServiceRole.entities.SalesOnboarding.filter({ application_id: applicationId });
    const rec = existing && existing[0];
    if (!rec || !rec.stripe_account_id) {
      return Response.json({ error: "No Stripe account found" }, { status: 404 });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    const account = await stripe.accounts.retrieve(rec.stripe_account_id);
    const detailsSubmitted = !!account.details_submitted;

    const update = { stripe_details_submitted: detailsSubmitted };
    if (detailsSubmitted && !rec.stripe_connected_at) {
      update.stripe_connected_at = new Date().toISOString();
    }

    let updated = await base44.asServiceRole.entities.SalesOnboarding.update(rec.id, update);
    updated = { ...updated, ...update };
    const nextStep = computeStep(updated);
    await base44.asServiceRole.entities.SalesOnboarding.update(rec.id, { current_step: nextStep });
    updated.current_step = nextStep;

    return Response.json({
      success: true,
      onboarding: updated,
      stripe_details_submitted: detailsSubmitted,
    });
  } catch (error) {
    console.error("checkSalesStripeStatus error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});