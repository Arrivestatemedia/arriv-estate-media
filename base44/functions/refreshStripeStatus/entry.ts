import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
import { findPartnerRecord, updatePartnerRecord } from '../../shared/stripeConnect.ts';

// Pulls the live Stripe Connect account status and writes it back to the
// partner's record. Called when a media partner returns from Stripe onboarding
// so the dashboard reflects completion immediately — without depending on the
// account.updated webhook having arrived yet.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    let email = body.email;

    if (!email) {
      const user = await base44.auth.me();
      email = user?.email;
    }
    if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const rec = await findPartnerRecord(base44, email);
    if (!rec || !rec.record.stripe_account_id) {
      return Response.json({ error: 'No Stripe account found' }, { status: 404 });
    }

    const account = await stripe.accounts.retrieve(rec.record.stripe_account_id);
    const payoutsEnabled = !!account.payouts_enabled;
    const detailsSubmitted = !!account.details_submitted;

    await updatePartnerRecord(base44, rec, {
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
    });

    return Response.json({
      stripe_account_id: rec.record.stripe_account_id,
      stripe_payouts_enabled: payoutsEnabled,
      stripe_details_submitted: detailsSubmitted,
    });
  } catch (error) {
    console.error('refreshStripeStatus error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});