import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { rowsOf, jsonResponse, resolveVisibilityActor } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { readAdSwitches } from '../../shared/propertyAdSwitches.ts';
import { isCheckoutEnabled, CHECKOUT_GATE_KEY } from '../../shared/propertyPackages.ts';
import { PROPERTY_FEATURE_FLAG_KEY } from '../../shared/propertyVisibility.ts';
import { marketQuery, evaluateMarket, marketIndexable } from '../../shared/geoMarkets.ts';
import { DEFAULT_MIN_PUBLISHED_LISTINGS } from '../../shared/geoMarkets.ts';

// Launch readiness.
//
// Every row states what is TRUE right now, read from the app's own configuration and records. A
// passing test suite is never used as evidence that a live service works: anything that depends on an
// external account or a deployed Worker is reported as requiring verification, not as ready.

const STATE = {
  ready: 'ready',
  configuration: 'requires_configuration',
  authorization: 'requires_authorization',
  verification: 'requires_production_verification',
  blocked: 'blocked',
};

function envPresent(name) {
  return !!String((globalThis as any)?.process?.env?.[name] || '').trim();
}

function settingValue(rows, key) {
  const found = rows.find((r) => String(r?.key || '') === key);
  const raw = String(found?.value ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await resolveVisibilityActor(base44, {});
    if (!actor.isAdmin) return jsonResponse({ ok: false, error: 'Administrator access required.' }, 403);
    const settings = rowsOf(await base44.asServiceRole.entities.AppSetting.list('-created_date', 500));
    const switches = await readVisibilitySwitches(base44);
    const adSwitches = await readAdSwitches(base44);
    const packageCheckout = await isCheckoutEnabled(base44);
    const propertyVisibility = settingValue(settings, PROPERTY_FEATURE_FLAG_KEY);

    const [publishedListings, publishedProfiles, markets, subscriptions, profileInquiries, propertyInquiries, campaigns, planProducts] = await Promise.all([
      base44.asServiceRole.entities.PropertyListing.count({ publication_state: 'PUBLISHED' }).catch(() => 0),
      base44.asServiceRole.entities.ProfessionalProfile.count({ publication_state: 'PUBLISHED' }).catch(() => 0),
      base44.asServiceRole.entities.GeographicMarket.list('-updated_at', 200).catch(() => []),
      base44.asServiceRole.entities.VisibilitySubscription.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.ProfileInquiry.list('-created_at', 200).catch(() => []),
      base44.asServiceRole.entities.PropertyInquiry.list('-created_at', 200).catch(() => []),
      base44.asServiceRole.entities.PropertyAdCampaign.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50).catch(() => []),
    ]);

    const marketList = rowsOf(markets);
    const eligibleMarkets = [];
    for (const market of marketList) {
      const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false })).catch(() => 0);
      const eligibility = evaluateMarket(market, { published_listings: counts });
      eligibleMarkets.push({ slug: market.slug, status: market.status, ...eligibility, indexable: marketIndexable(market, eligibility) });
    }

    const planList = rowsOf(planProducts);
    const stripePrices = {
      agent_presence: !!planList.find((p) => p.product_key === 'agent_presence')?.stripe_price_id,
      agent_growth: !!planList.find((p) => p.product_key === 'agent_growth')?.stripe_price_id,
      brokerage: !!planList.find((p) => p.product_key === 'brokerage')?.stripe_price_id,
    };
    const allPricesConfigured = Object.values(stripePrices).every(Boolean);

    const subList = rowsOf(subscriptions);
    const leadRows = [...rowsOf(profileInquiries), ...rowsOf(propertyInquiries)];
    const deliveredLeads = leadRows.filter((l) => ['delivered', 'routed'].includes(String(l.notification_status || l.status || ''))).length;
    const failedLeads = leadRows.filter((l) => String(l.notification_status || '') === 'failed').length;

    const stripeReady = envPresent('STRIPE_SECRET_KEY');
    const brevoReady = envPresent('BREVO_API_KEY');
    const workerPurgeReady = envPresent('PROPERTY_EDGE_PURGE_URL') && envPresent('PROPERTY_EDGE_PURGE_SECRET');
    const publicOriginReady = envPresent('PROPERTY_PUBLIC_ORIGIN');

    const components = [
      {
        id: 'stripe',
        label: 'Stripe billing',
        state: !stripeReady ? STATE.configuration : STATE.verification,
        detail: stripeReady
          ? 'Stripe credentials are present. Live one-time purchases and recurring subscriptions still need a real transaction to be verified end to end.'
          : 'STRIPE_SECRET_KEY is not set, so no payment can be created.',
        action: stripeReady ? 'Run one real (or Stripe test-mode) purchase and confirm the webhook flips the entitlement.' : 'Add the Stripe secret key.',
      },
      {
        id: 'brevo',
        label: 'Brevo email',
        state: !brevoReady ? STATE.configuration : STATE.verification,
        detail: brevoReady
          ? 'Brevo credentials are present; the bookings sender must be an active, verified sender before live delivery works.'
          : 'BREVO_API_KEY is not set, so lead notifications and subscription emails cannot be sent.',
        action: brevoReady ? 'Confirm the sender address is active in Brevo, then send one test inquiry.' : 'Add the Brevo API key.',
      },
      {
        id: 'cloudflare_worker',
        label: 'Cloudflare Worker (properties host)',
        state: !workerPurgeReady || !publicOriginReady ? STATE.configuration : STATE.verification,
        detail: workerPurgeReady && publicOriginReady
          ? 'Purge credentials and the public origin are configured. The Worker itself is deployed outside this app, so its deployed routes cannot be verified here.'
          : 'The purge URL/secret or the public origin is missing.',
        action: 'Deploy the Phase 4 Worker routes and run the post-deploy verification in the Phase 4 runbook.',
      },
      {
        id: 'public_seo_routes',
        label: 'Public SEO routes (properties, agents, brokerages, discovery)',
        state: STATE.verification,
        detail:
          `Published properties: ${publishedListings}. Published profiles: ${publishedProfiles}. ` +
          'Property pages are served by the existing Worker. Agent, brokerage and discovery routes need the Phase 4 Worker route deployment before they can render on the public host.',
        action: 'Apply the Worker additions, then load each route on properties.arrivestatemedia.com and confirm 200 + canonical + robots.',
      },
      {
        id: 'sitemap_indexing',
        label: 'Sitemap and indexing',
        state: eligibleMarkets.some((m) => m.indexable) ? STATE.verification : STATE.authorization,
        detail:
          `Indexable geographic pages: ${eligibleMarkets.filter((m) => m.indexable).length}. ` +
          `Geographic publication switch: ${switches.geo_publication ? 'on' : 'off'}. ` +
          'Agent and brokerage pages only enter the sitemap once published and approved.',
        action: 'Confirm sitemap.xml on the public host lists exactly the pages you intend to index, then submit it in Search Console.',
      },
      {
        id: 'property_publication',
        label: 'Property publication (Phase 1)',
        state: propertyVisibility ? STATE.verification : STATE.authorization,
        detail: propertyVisibility
          ? `Feature gate is on with ${publishedListings} published propert${publishedListings === 1 ? 'y' : 'ies'}.`
          : `The property visibility gate (${PROPERTY_FEATURE_FLAG_KEY}) is off.`,
        action: propertyVisibility ? 'Verify a real customer publishing flow end to end.' : 'Turn the property visibility gate on when ready.',
      },
      {
        id: 'customer_leads',
        label: 'Customer leads',
        state: failedLeads > 0 ? STATE.blocked : leadRows.length === 0 ? STATE.verification : STATE.verification,
        detail: `${leadRows.length} inquiry record${leadRows.length === 1 ? '' : 's'} recorded, ${deliveredLeads} delivered, ${failedLeads} failed. Inquiry records are written before any send, so a failed delivery never loses a lead.`,
        action: failedLeads > 0 ? 'Work the failed deliveries in the leads list.' : 'Submit one real inquiry on a published page and confirm the recipient receives it.',
      },
      {
        id: 'visibility_packages',
        label: 'Visibility packages (Phase 2)',
        state: packageCheckout ? STATE.verification : STATE.authorization,
        detail: packageCheckout
          ? `Package checkout is open (${CHECKOUT_GATE_KEY}).`
          : 'One-time package checkout is closed. Plus and Pro are visible but cannot be purchased.',
        action: packageCheckout ? 'Verify one real Plus purchase and its promotion lifecycle.' : 'Open package checkout only after a verified test purchase.',
      },
      {
        id: 'managed_advertising',
        label: 'Managed advertising (Phase 3)',
        state: adSwitches.customer_checkout ? STATE.verification : STATE.authorization,
        detail:
          `Advertising checkout ${adSwitches.customer_checkout ? 'on' : 'off'}, Meta connection ${adSwitches.meta_connection ? 'on' : 'off'}, ` +
          `budget execution ${adSwitches.budget_execution ? 'on' : 'off'}. ${rowsOf(campaigns).length} campaign record(s).`,
        action: 'Manual Meta fulfilment is usable without API credentials; campaign checkout stays closed until you authorize it.',
      },
      {
        id: 'meta_integration',
        label: 'Meta advertising API',
        state: STATE.blocked,
        detail: 'No Meta credentials are configured. Automatic publishing and automatic performance sync cannot operate.',
        action: 'Remains unavailable by design. Manual fulfilment is the supported path.',
      },
      {
        id: 'agent_subscriptions',
        label: 'Agent subscriptions',
        state: !switches.subscription_checkout
          ? STATE.authorization
          : !stripePrices.agent_presence || !stripePrices.agent_growth
            ? STATE.configuration
            : STATE.verification,
        detail:
          `Checkout ${switches.subscription_checkout ? 'on' : 'off'}. Stripe prices configured: ` +
          `Agent Presence ${stripePrices.agent_presence ? 'yes' : 'no'}, Agent Growth ${stripePrices.agent_growth ? 'yes' : 'no'}. ` +
          `${subList.filter((s) => ['agent_presence', 'agent_growth'].includes(String(s.plan_key))).length} agent subscription record(s).`,
        action: 'Create the Stripe prices, then verify one subscription end to end before opening checkout.',
      },
      {
        id: 'brokerage_subscriptions',
        label: 'Brokerage subscriptions',
        state: !switches.subscription_checkout
          ? STATE.authorization
          : !stripePrices.brokerage
            ? STATE.configuration
            : STATE.verification,
        detail:
          `Checkout ${switches.subscription_checkout ? 'on' : 'off'}. Brokerage Stripe price ${stripePrices.brokerage ? 'configured' : 'missing'}. ` +
          'Seat allowance is enforced from the plan record, never assumed unlimited.',
        action: 'Create the brokerage price and verify a seat-limited roster end to end.',
      },
      {
        id: 'scheduled_jobs',
        label: 'Scheduled jobs',
        state: STATE.verification,
        detail:
          'Property promotion sweep, advertising sweep, listing lifecycle, lead retry and the Phase 4 subscription sweep are defined as workflows. ' +
          'This app cannot prove from code that each one has run; their run history is in Workflows.',
        action: 'Open Workflows and confirm each scheduled job has a recent successful run.',
      },
      {
        id: 'customer_notifications',
        label: 'Customer notifications',
        state: switches.customer_notifications ? STATE.verification : STATE.authorization,
        detail: switches.customer_notifications
          ? 'Subscription notification emails are switched on.'
          : 'Subscription and billing emails are switched off; nothing is sent to customers.',
        action: 'Turn notifications on only after Brevo delivery is verified.',
      },
      {
        id: 'profile_publication',
        label: 'Agent & brokerage profile publication',
        state: switches.profile_publication ? STATE.verification : STATE.authorization,
        detail: switches.profile_publication
          ? 'Profile publication is switched on.'
          : 'Profile publication is switched off: an authorized, approved profile still cannot become public.',
        action: 'Turn publication on only after reviewing the profiles waiting in review.',
      },
      {
        id: 'subscription_billing',
        label: 'Recurring subscription billing',
        state: !switches.subscription_checkout ? STATE.authorization : !allPricesConfigured ? STATE.configuration : STATE.verification,
        detail:
          `Checkout ${switches.subscription_checkout ? 'on' : 'off'}; all three Stripe prices ${allPricesConfigured ? 'configured' : 'not configured'}. ` +
          `${subList.filter((s) => s.status === 'active').length} active subscription record(s).`,
        action: 'Nothing charges a customer until you enable checkout with Stripe prices in place.',
      },
    ];

    const summary = {
      ready: components.filter((c) => c.state === STATE.ready).length,
      requires_configuration: components.filter((c) => c.state === STATE.configuration).length,
      requires_authorization: components.filter((c) => c.state === STATE.authorization).length,
      requires_production_verification: components.filter((c) => c.state === STATE.verification).length,
      blocked: components.filter((c) => c.state === STATE.blocked).length,
    };

    return jsonResponse({
      ok: true,
      generated_at: new Date().toISOString(),
      summary,
      components,
      switches: {
        subscription_checkout: switches.subscription_checkout,
        profile_publication: switches.profile_publication,
        geo_publication: switches.geo_publication,
        customer_notifications: switches.customer_notifications,
        package_checkout: packageCheckout,
        advertising_checkout: adSwitches.customer_checkout,
      },
      markets: eligibleMarkets,
      minimum_market_listings: DEFAULT_MIN_PUBLISHED_LISTINGS,
      note:
        'States describe configuration and records in this app. Nothing is marked ready on the basis of automated tests alone, ' +
        'and no external account, deployment or payment is represented as verified here.',
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});