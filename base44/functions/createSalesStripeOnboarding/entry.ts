import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
import { verifyAndGet, buildPortalLink } from "../../shared/salesOnboardingShared.ts";

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
    let rec = existing && existing[0];
    if (!rec) {
      rec = await base44.asServiceRole.entities.SalesOnboarding.create({
        application_id: applicationId,
        full_name: v.app.full_name,
        email: v.app.email,
        current_step: 1,
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
    let accountId = rec.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: v.app.email,
        metadata: { base44_email: v.app.email, application_id: applicationId },
      });
      accountId = account.id;
      await base44.asServiceRole.entities.SalesOnboarding.update(rec.id, { stripe_account_id: accountId });
    }

    const returnBase = buildPortalLink(v.app);
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnBase,
      return_url: `${returnBase}&stripe_done=1`,
      type: "account_onboarding",
    });

    return Response.json({ url: accountLink.url, account_id: accountId });
  } catch (error) {
    console.error("createSalesStripeOnboarding error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});