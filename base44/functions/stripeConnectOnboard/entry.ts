import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
import { findPartnerRecord, updatePartnerRecord } from '../../shared/stripeConnect.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Prefer the email passed from the frontend (the app uses custom auth with
    // the email in localStorage) so onboarding doesn't depend on a base44 session.
    const body = await req.json().catch(() => ({}));
    let email = body.email;
    let userId = '';

    if (!email) {
      const user = await base44.auth.me();
      email = user?.email;
      userId = user?.id || '';
    }
    if (!email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const rec = await findPartnerRecord(base44, email);
    if (!rec) return Response.json({ error: 'No partner record found' }, { status: 404 });

    let accountId = rec.record.stripe_account_id;

    // Create an Express connected account the first time.
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email,
        metadata: {
          base44_email: email,
          base44_user_id: userId
        }
      });
      accountId = account.id;
      await updatePartnerRecord(base44, rec, {
        stripe_account_id: accountId,
        payout_method: 'stripe_connect'
      });
    }

    // Always issue a fresh onboarding link (works for first-time setup and updates).
    const origin = req.headers.get('origin') || Deno.env.get('BASE44_APP_DOMAIN') || 'https://app.base44.com';
    const returnUrl = `${origin}/MediaPartnerDashboard?stripe_done=1`;
    const refreshUrl = `${origin}/MediaPartnerDashboard?stripe_refresh=1`;

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });

    return Response.json({ url: accountLink.url, account_id: accountId });
  } catch (error) {
    console.error('stripeConnectOnboard error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});