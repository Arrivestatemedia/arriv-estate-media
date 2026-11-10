import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveVisibilityActor, rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { canManageProfile, isBrokerageManager, profilePath, isPubliclyVisible } from '../../shared/professionalProfile.ts';
import { planCatalog, planPriceLabel, entitlementsFor, seatAllowance, DOWNGRADE_POLICY_TEXT, RECURRING_DISCLOSURE } from '../../shared/visibilityPlans.ts';
import { subscriptionView, seatUsage } from '../../shared/visibilitySubscriptionEngine.ts';
import { directoryQuery } from '../../shared/propertyDirectoryQuery.ts';
import { publicOrigin } from '../../shared/propertyVisibility.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const base44 = createClientFromRequest(req);
    const actor = await resolveVisibilityActor(base44, body);
    const switches = await readVisibilitySwitches(base44);
    const origin = publicOrigin();

    let profile = null;
    if (body?.profileId) {
      profile = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: String(body.profileId) }))[0] || null;
    } else if (actor.email) {
      profile = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
        { owner_email: actor.email },
        { sort: '-created_date', limit: 1 },
      ))[0] || null;
      if (!profile) {
        const managed = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
          { team_emails: actor.email },
          { limit: 1 },
        ))[0];
        profile = managed || null;
      }
    }

    if (!profile) {
      return jsonResponse({ ok: true, profile: null, plans: planCatalog([]), switches, origin });
    }
    if (!canManageProfile(profile, actor)) {
      return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
    }

    const plans = planCatalog(rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50)));
    const subscription = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter(
      { profile_id: profile.profile_id },
      { sort: '-created_date', limit: 1 },
    ))[0] || null;
    const view = subscriptionView(subscription);
    // Benefits follow the subscription's real state: an active status without a paid period unlocks
    // nothing, so entitlements are never read from a stored plan_key alone.
    const entitlements = entitlementsFor(view.plan_key, view.benefits_active ? 'active' : view.status);
    const plan = plans.find((p) => p.product_key === view.plan_key) || null;

    const seats = plan ? seatAllowance(plan, view.seats_purchased) : null;
    const seatManagement = plan && seats
      ? {
        plan_key: plan.product_key,
        plan_name: plan.name,
        seats_included: seats.included,
        seats_purchased: seats.purchased,
        seats_total: seats.total,
        seat_price_cents: Number(plan.additional_seat_price_cents || 0),
        seat_price_label: planPriceLabel(Number(plan.additional_seat_price_cents || 0)),
        monthly_total_cents: Number(plan.price_cents || 0) + seats.purchased * Number(plan.additional_seat_price_cents || 0),
        price_configured: !!plan.stripe_seat_price_id,
        can_change: seats.canAdd && switches.subscription_checkout === true && view.benefits_active === true,
        min_seats: 0,
        max_seats: 50,
        blocked_reason: !seats.canAdd
          ? 'This plan does not allow additional seats.'
          : switches.subscription_checkout !== true
            ? 'Subscription billing is currently switched off.'
            : view.benefits_active !== true
              ? 'Seats can be changed while the plan is active.'
              : '',
      }
      : null;

    // --- the customer's own listings -----------------------------------------------------------
    const eligibility = directoryQuery({ testMode: false });
    const emails = [String(profile.contact_email || '').toLowerCase()].filter(Boolean);
    const owned = emails.length
      ? rowsOf(await base44.asServiceRole.entities.PropertyListing.filter(
        { $or: [{ agent_email: emails[0] }, { client_email: emails[0] }] },
        { sort: '-updated_at', limit: 100 },
      ))
      : [];
    const listingIds = owned.map((l) => String(l.listing_id || '')).filter(Boolean);

    const listings = owned.slice(0, Number(entitlements.showcase_limit || 3)).map((l) => ({
      listing_id: l.listing_id,
      public_slug: l.public_slug,
      property_address: l.property_address,
      city: l.city,
      state: l.state,
      listing_status: l.listing_status,
      publication_state: l.publication_state,
      public_url: l.publication_state === 'PUBLISHED' ? `${origin}/properties/${l.public_slug}` : '',
    }));

    // --- traffic and leads (aggregated reads, never a per-view write) ---------------------------
    let traffic = { total_views: 0, by_channel: [] };
    if (listingIds.length) {
      try {
        const grouped = await base44.asServiceRole.entities.PropertyTrafficDaily.aggregate({
          query: { listing_id: { $in: listingIds.slice(0, 100) } },
          groupBy: 'channel',
          sum: ['views'],
        });
        const rows = Array.isArray(grouped) ? grouped : grouped?.rows || [];
        traffic = {
          total_views: rows.reduce((sum, r) => sum + Number(r?.sum_views || 0), 0),
          by_channel: rows.map((r) => ({ channel: r.channel || 'unknown', views: Number(r.sum_views || 0) })),
        };
      } catch {
        traffic = { total_views: 0, by_channel: [] };
      }
    }

    const profileLeads = rowsOf(await base44.asServiceRole.entities.ProfileInquiry.filter(
      { profile_id: profile.profile_id },
      { sort: '-created_at', limit: 200 },
    ));
    const delivered = profileLeads.filter((l) => l.notification_status === 'delivered').length;
    const leadSources = {};
    for (const lead of profileLeads) {
      const key = String(lead.channel || 'direct');
      leadSources[key] = (leadSources[key] || 0) + 1;
    }

    // --- brokerage team view -------------------------------------------------------------------
    let roster = [];
    let team = null;
    if (profile.profile_type === 'brokerage' && (isBrokerageManager(profile, actor) || actor.isAdmin)) {
      const ids = Array.isArray(profile.managed_agent_profile_ids) ? profile.managed_agent_profile_ids : [];
      if (ids.length) {
        const agents = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter(
          { profile_id: { $in: ids.slice(0, 60) } },
          { limit: 60 },
        ));
        for (const agent of agents) {
          const leads = await base44.asServiceRole.entities.ProfileInquiry.count({ profile_id: agent.profile_id });
          roster.push({
            profile_id: agent.profile_id,
            display_name: agent.display_name,
            path: profilePath(agent),
            publication_state: agent.publication_state,
            affiliation_verified: agent.brokerage_affiliation_verified === true,
            inquiries: Number(leads || 0),
            plan_key: agent.plan_key || '',
          });
        }
      }
      team = {
        agents: roster.length,
        published_agents: roster.filter((r) => r.publication_state === 'PUBLISHED').length,
        unverified_affiliations: roster.filter((r) => !r.affiliation_verified).length,
        inquiries: roster.reduce((sum, r) => sum + r.inquiries, 0),
        seats: seatUsage(subscription, plan, roster.length),
      };
    }

    return jsonResponse({
      ok: true,
      origin,
      switches,
      profile: {
        profile_id: profile.profile_id,
        profile_type: profile.profile_type,
        display_name: profile.display_name,
        slug: profile.slug,
        path: profilePath(profile),
        public_url: isPubliclyVisible(profile) ? `${origin}${profilePath(profile)}` : '',
        publication_state: profile.publication_state,
        authorization_confirmed: profile.authorization_confirmed === true,
        admin_approved_at: profile.admin_approved_at || '',
        indexing: profile.indexing || 'noindex',
        contact_email: profile.contact_email || '',
        plan_key: profile.plan_key || '',
        city: profile.city || '',
        state: profile.state || '',
        // The owner's own editable fields, so the form is filled from what was saved rather than being
        // blank and wiping the biography or the stated brokerage on the next save.
        headline: profile.headline || '',
        bio: profile.bio || '',
        contact_phone: profile.contact_phone || '',
        website_url: profile.website_url || '',
        brokerage_name: profile.brokerage_name || '',
        service_areas: Array.isArray(profile.service_areas) ? profile.service_areas : [],
      },
      subscription: {
        ...view,
        record_id: subscription?.id || '',
        seats: seatAllowance(plan, subscription?.seats_purchased || 0),
        billing_history: Array.isArray(subscription?.billing_history) ? subscription.billing_history : [],
        amount_label: subscription ? planPriceLabel(subscription.amount_cents || 0) : '',
        disclosure: RECURRING_DISCLOSURE,
      },
      entitlements,
      seat_management: seatManagement,
      plans: plans.map((p) => ({
        product_key: p.product_key,
        name: p.name,
        price_label: planPriceLabel(p.price_cents),
        features: p.features,
        seats_included: p.seats_included,
        seat_policy: p.seat_policy,
        additional_seat_price_label: planPriceLabel(Number(p.additional_seat_price_cents || 0)),
        stripe_ready: !!p.stripe_price_id,
        purchasable: switches.subscription_checkout === true && !!p.stripe_price_id,
      })),
      downgrade_policy: DOWNGRADE_POLICY_TEXT,
      listings,
      listing_eligibility_query: eligibility,
      traffic,
      leads: {
        total: profileLeads.length,
        delivered,
        failed: profileLeads.filter((l) => l.notification_status === 'failed').length,
        pending: profileLeads.filter((l) => ['pending_recipient_delivery', 'retrying'].includes(String(l.notification_status))).length,
        by_source: leadSources,
        recent: profileLeads.slice(0, 10).map((l) => ({
          inquiry_id: l.inquiry_id,
          name: l.name,
          email: l.email,
          status: l.status,
          notification_status: l.notification_status,
          channel: l.channel || '',
          created_at: l.created_at,
        })),
      },
      marketing_assets_available: entitlements.marketing_graphics === true,
      team,
      roster,
      report: {
        profile_visits: traffic.total_views,
        inquiry_count: profileLeads.length,
        delivered_count: delivered,
        listing_count: listings.length,
        subscription_status: view.status,
        reporting_note:
          'These figures come from Arriv’s own recorded property traffic and inquiries. Arriv does not report search-engine rankings, Google impressions or lead volume it cannot measure.',
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});