import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolvePropertyActor, actorOwnsListing } from '../../shared/propertyActor.ts';
import {
  AD_PACKAGES,
  AD_AUTHORIZATION_POINTS,
  AD_REFUND_POLICY,
  AD_DISCLOSURE,
  AD_ELIGIBILITY_NOTE,
  AD_AGREEMENT_VERSION,
  adQuote,
  isAdTier,
} from '../../shared/propertyAdPackages.ts';
import {
  AD_STATUS_LABELS,
  AD_STATUS_HELP,
  AD_CUSTOMER_ACTIONS,
} from '../../shared/propertyAdStateMachine.ts';
import {
  campaignEligibility,
  createDraftCampaign,
  recordAuthorization,
  approveByCustomer,
  attachPayment,
  confirmPayment,
  cancelCampaign,
  requestRefundReview,
  loadListing,
  loadCampaign,
  campaignsForListing,
  currentCampaignForListing,
  publicUrlFor,
} from '../../shared/propertyAdEngine.ts';
import { readAdSwitches } from '../../shared/propertyAdSwitches.ts';
import { createAdPaymentIntent, verifyAdPayment } from '../../shared/stripeAdPayments.ts';
import { buildCampaignReport, campaignAttribution, budgetPosition } from '../../shared/propertyAdReporting.ts';
import { metaProvider } from '../../shared/propertyAdProviders.ts';
import { MANUAL_STATUS_HELP, isManual, manualReportingNote } from '../../shared/propertyAdManualFulfillment.ts';

// Customer-facing advertising. A customer can only ever act on their own listing, and every
// purchase step re-checks eligibility, authorization and the advertising switches server-side.

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function customerView(campaign: any) {
  if (!campaign) return null;
  const manual = isManual(campaign);
  return {
    campaign_id: campaign.campaign_id,
    listing_id: campaign.listing_id,
    package_tier: campaign.package_tier,
    package_name: campaign.package_name,
    status: campaign.status,
    status_label: AD_STATUS_LABELS[campaign.status] || campaign.status,
    status_help: (manual && MANUAL_STATUS_HELP[campaign.status]) || AD_STATUS_HELP[campaign.status] || "",
    actions: AD_CUSTOMER_ACTIONS[campaign.status] || [],
    provider: campaign.provider,
    fulfillment_mode: manual ? "manual" : "api",
    delivery_method: manual ? "Arriv creates and manages this campaign in Meta Ads Manager." : "Arriv publishes this campaign through the advertising API.",
    // Results are only ever what Arriv read from the advertising source, and manual entry is said plainly.
    reporting_mode: campaign.metrics?.reporting_mode || (manual ? "manual" : "api"),
    reported_by: manual ? "Arriv, from Meta Ads Manager" : "Advertising platform",
    reporting_note: manualReportingNote(campaign),
    // A stop that Arriv has asked for but cannot perform is shown as outstanding, never as stopped.
    stop_outstanding: campaign.manual_stop?.required === true && campaign.manual_stop?.confirmed !== true,
    duration_days: campaign.duration_days,
    scheduled_start_at: campaign.scheduled_start_at || "",
    started_at: campaign.started_at || "",
    ends_at: campaign.ends_at || "",
    completed_at: campaign.completed_at || "",
    budget: budgetPosition(campaign),
    creative: campaign.creative || null,
    authorization: {
      confirmed: campaign.authorization?.confirmed === true,
      at: campaign.authorization?.at || "",
      agreement_version: campaign.authorization?.agreement_version || "",
    },
    review_required: campaign.review_required === true,
    attention_reason: campaign.attention_reason || "",
    rejection_reason: campaign.rejection_reason || "",
    refund_status: campaign.refund_status || "none",
    refunded_cents: Number(campaign.refunded_cents || 0),
    metrics: campaign.metrics || null,
    stripe_client_secret: campaign.stripe_client_secret || "",
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'overview');
    const listingId = String(body.listingId || body.listing_id || '');
    const campaignId = String(body.campaignId || body.campaign_id || '');
    const now = new Date();

    const actor = await resolvePropertyActor(base44, body);
    if (!actor.isAdmin && !String(actor.clientEmail || '').includes('@')) {
      return Response.json({ ok: false, error: 'SIGN_IN_REQUIRED' }, { status: 401 });
    }

    const switches = await readAdSwitches(base44);

    // ── Overview ────────────────────────────────────────────────────────────────────────────
    if (action === 'overview') {
      const listing = await loadListing(base44, listingId);
      if (!listing) return Response.json({ ok: false, error: 'PROPERTY_NOT_FOUND' }, { status: 404 });
      if (!actorOwnsListing(listing, actor)) {
        return Response.json({ ok: false, error: 'FORBIDDEN', message: 'This property belongs to another account.' }, { status: 403 });
      }

      const eligibility = campaignEligibility(listing, now);
      const current = await currentCampaignForListing(base44, listing.listing_id);
      const history = (await campaignsForListing(base44, listing.listing_id)).filter((c: any) => c.certification_mode !== true);
      const origin = String((globalThis as any)?.process?.env?.PROPERTY_PUBLIC_ORIGIN || '');
      const readiness = metaProvider.describeReadiness(null);

      return Response.json({
        ok: true,
        checkout_enabled: switches.customer_checkout,
        checkout_note: switches.customer_checkout
          ? 'Advertising campaigns can be purchased now.'
          : 'Advertising checkout is not open yet. You can review the packages and creative; nothing will be charged.',
        agreement_version: AD_AGREEMENT_VERSION,
        disclosure: AD_DISCLOSURE,
        delivery_mode: 'manual_meta_ads_manager',
        delivery_note: 'Arriv creates, publishes and manages this campaign by hand in Meta Ads Manager. No automatic advertising API is used.',
        results_note: 'Results are entered by Arriv from Meta Ads Manager and are identified as manually reported.',
        eligibility_note: AD_ELIGIBILITY_NOTE,
        authorization_points: AD_AUTHORIZATION_POINTS,
        refund_policy: AD_REFUND_POLICY,
        listing: {
          listing_id: listing.listing_id,
          property_address: listing.property_address,
          city: listing.city || '',
          state: listing.state || '',
          public_slug: listing.public_slug || '',
          public_url: publicUrlFor(listing, origin),
          cover_file_id: listing.cover_file_id || '',
          media_count: Array.isArray(listing.selected_media) ? listing.selected_media.length : 0,
          publication_state: listing.publication_state,
          listing_status: listing.listing_status,
          eligible: eligibility.eligible,
          blockers: eligibility.blockers,
        },
        packages: AD_PACKAGES.map((pkg) => adQuote(pkg.tier)),
        campaign: customerView(current),
        history: history
          .filter((c: any) => c.campaign_id !== current?.campaign_id)
          .slice(0, 10)
          .map((c: any) => ({
            campaign_id: c.campaign_id,
            package_name: c.package_name,
            status: c.status,
            status_label: AD_STATUS_LABELS[c.status] || c.status,
            started_at: c.started_at || '',
            completed_at: c.completed_at || '',
            spent_cents: Number(c.spent_cents || 0),
            ad_budget_cents: Number(c.ad_budget_cents || 0),
          })),
        // Advertising capability is reported honestly: what is configured, and what is not.
        provider_readiness: {
          configured: readiness.configured,
          connected: readiness.connected,
          publishing_available: switches.meta_connection && switches.budget_execution && readiness.connected,
        },
        switches: {
          customer_checkout: switches.customer_checkout,
          meta_connection: switches.meta_connection,
          auto_publish: switches.auto_publish,
          budget_execution: switches.budget_execution,
        },
      });
    }

    // ── Prepare a draft with proposed creative ──────────────────────────────────────────────
    if (action === 'prepare') {
      const listing = await loadListing(base44, listingId);
      if (!listing) return Response.json({ ok: false, error: 'PROPERTY_NOT_FOUND' }, { status: 404 });
      if (!actorOwnsListing(listing, actor)) {
        return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      }
      const tier = String(body.tier || '');
      if (!isAdTier(tier)) return Response.json({ ok: false, error: 'UNKNOWN_PACKAGE' }, { status: 400 });
      const origin = String((globalThis as any)?.process?.env?.PROPERTY_PUBLIC_ORIGIN || '');
      const result = await createDraftCampaign(base44, {
        listing,
        tier,
        actor: { email: actor.isAdmin ? listing.client_email : actor.email, name: listing.client_name },
        publicUrl: publicUrlFor(listing, origin),
        now,
      });
      if (!result.ok) {
        return Response.json({ ok: false, error: result.code, blockers: result.blockers || [], campaign: customerView(result.campaign) }, { status: 400 });
      }
      return Response.json({ ok: true, campaign: customerView(result.campaign) });
    }

    // ── Authorization ──────────────────────────────────────────────────────────────────────
    if (action === 'authorize') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      if (body.confirmed !== true) {
        return Response.json({ ok: false, error: 'AUTHORIZATION_NOT_CONFIRMED' }, { status: 400 });
      }
      const eligibility = campaignEligibility(listing, now);
      if (!eligibility.eligible) {
        return Response.json({ ok: false, error: 'LISTING_NOT_ELIGIBLE', blockers: eligibility.blockers }, { status: 400 });
      }
      await recordAuthorization(base44, campaign, { actor: { email: actor.email || listing.client_email }, now });
      return Response.json({ ok: true, campaign: customerView(await loadCampaign(base44, campaignId)) });
    }

    // ── Customer approval ─────────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      const result = await approveByCustomer(base44, campaign, { actor: { email: actor.email }, listing, now });
      if (!result.ok) {
        return Response.json({ ok: false, error: result.code, blockers: result.blockers || [] }, { status: 400 });
      }
      return Response.json({ ok: true, campaign: customerView(result.campaign) });
    }

    // ── Payment ───────────────────────────────────────────────────────────────────────────
    if (action === 'start_purchase') {
      if (!switches.customer_checkout) {
        return Response.json({ ok: false, error: 'CHECKOUT_CLOSED', message: 'Advertising checkout is not open yet.' }, { status: 403 });
      }
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      if (!['APPROVED', 'AWAITING_PAYMENT'].includes(campaign.status)) {
        return Response.json({ ok: false, error: 'INVALID_STATE', status: campaign.status }, { status: 400 });
      }
      if (campaign.authorization?.confirmed !== true) {
        return Response.json({ ok: false, error: 'AUTHORIZATION_REQUIRED' }, { status: 400 });
      }
      const eligibility = campaignEligibility(listing, now);
      if (!eligibility.eligible) {
        return Response.json({ ok: false, error: 'LISTING_NOT_ELIGIBLE', blockers: eligibility.blockers }, { status: 400 });
      }
      const intent = await createAdPaymentIntent({
        amountCents: Number(campaign.total_cents || 0),
        campaignId: campaign.campaign_id,
        listingId: campaign.listing_id,
        tier: campaign.package_tier,
        clientEmail: campaign.client_email,
        address: listing?.property_address || '',
      });
      const saved = await attachPayment(base44, campaign, {
        paymentIntentId: String(intent.id),
        clientSecret: String(intent.client_secret || ''),
        now,
      });
      return Response.json({
        ok: true,
        campaign_id: campaign.campaign_id,
        payment_intent_id: intent.id,
        client_secret: intent.client_secret,
        amount_cents: Number(intent.amount || campaign.total_cents || 0),
        campaign: customerView(saved),
      });
    }

    if (action === 'confirm_purchase') {
      const paymentIntentId = String(body.paymentIntentId || body.payment_intent_id || '');
      if (!paymentIntentId) return Response.json({ ok: false, error: 'PAYMENT_NOT_FOUND' }, { status: 400 });
      // Verified with Stripe: a browser claiming success grants nothing on its own.
      const payment = await verifyAdPayment(paymentIntentId);
      if (!payment.paid) {
        return Response.json({ ok: false, error: 'PAYMENT_NOT_COMPLETED', status: payment.status }, { status: 400 });
      }
      const campaign = await loadCampaign(base44, campaignId || String(payment.metadata?.campaign_id || ''));
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      const result = await confirmPayment(base44, {
        campaignId: campaign.campaign_id,
        paymentIntentId,
        amountCents: payment.amountCents,
        now,
      });
      if (!result.ok) return Response.json({ ok: false, error: result.code }, { status: 400 });
      return Response.json({ ok: true, campaign: customerView(await loadCampaign(base44, campaign.campaign_id)) });
    }

    // ── Cancel before launch ──────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      if (['SUBMITTED', 'ACTIVE'].includes(campaign.status)) {
        return Response.json({ ok: false, error: 'CAMPAIGN_RUNNING', message: 'A running campaign is stopped by Arriv support so the platform is stopped too.' }, { status: 400 });
      }
      const cancelled = await cancelCampaign(base44, campaign, { actor: actor.email || 'customer', reason: 'Cancelled by the customer before launch', now });
      if (!cancelled.ok) return Response.json({ ok: false, error: cancelled.code }, { status: 400 });
      if (Number(campaign.paid_amount_cents || 0) > 0) {
        await requestRefundReview(base44, cancelled.campaign, { actor: actor.email || 'customer', reason: 'Customer cancelled before launch', now });
      }
      return Response.json({ ok: true, campaign: customerView(await loadCampaign(base44, campaignId)) });
    }

    // ── Results ───────────────────────────────────────────────────────────────────────────
    if (action === 'report') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      const attribution = await campaignAttribution(base44, campaign, now);
      return Response.json({
        ok: true,
        report: campaign.final_report || buildCampaignReport(campaign, attribution),
        live: buildCampaignReport(campaign, attribution),
        campaign: customerView(campaign),
      });
    }

    if (action === 'list') {
      const listing = await loadListing(base44, listingId);
      if (!listing) return Response.json({ ok: false, error: 'PROPERTY_NOT_FOUND' }, { status: 404 });
      if (!actorOwnsListing(listing, actor)) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
      const campaigns = rows(await base44.asServiceRole.entities.PropertyAdCampaign.filter({ listing_id: listing.listing_id }, { sort: '-created_date', limit: 25 }));
      return Response.json({ ok: true, campaigns: campaigns.map(customerView).filter(Boolean) });
    }

    return Response.json({ ok: false, error: 'UNKNOWN_ACTION' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
});