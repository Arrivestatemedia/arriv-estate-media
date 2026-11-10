import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolvePropertyActor } from '../../shared/propertyActor.ts';
import { AD_SWITCH_KEYS, AD_SWITCH_OFF, readAdSwitches, switchSummary } from '../../shared/propertyAdSwitches.ts';
import {
  AD_STATUS_LABELS,
  canTransition,
} from '../../shared/propertyAdStateMachine.ts';
import {
  adminApprove,
  adminReject,
  approveByCustomer,
  authorizationIsCurrent,
  cancelCampaign,
  completeCampaign,
  decideRefund,
  launchCampaign,
  launchBlockers,
  loadCampaign,
  loadListing,
  pauseCampaign,
  requestRefundReview,
  resumeCampaign,
  syncCampaign,
  updateCampaign,
  refundableAmount,
  appendEvent,
} from '../../shared/propertyAdEngine.ts';
import { metaProvider, googleAdsProvider, loadProviderAccount } from '../../shared/propertyAdProviders.ts';
import { AD_REFUND_POLICY, money } from '../../shared/propertyAdPackages.ts';
import { portfolioSummary, campaignAttribution, buildCampaignReport, budgetPosition } from '../../shared/propertyAdReporting.ts';
import { issueAdRefund } from '../../shared/stripeAdPayments.ts';

// Arriv Advertising Management console. Every action re-checks that the caller is an administrator
// server-side and records who did what in the campaign's audit history.

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function adminView(campaign: any) {
  if (!campaign) return null;
  return {
    campaign_id: campaign.campaign_id,
    listing_id: campaign.listing_id,
    client_email: campaign.client_email,
    client_name: campaign.client_name,
    public_url: campaign.public_url,
    package_tier: campaign.package_tier,
    package_name: campaign.package_name,
    status: campaign.status,
    status_label: AD_STATUS_LABELS[campaign.status] || campaign.status,
    provider: campaign.provider,
    provider_campaign_id: campaign.provider_campaign_id || '',
    provider_status: campaign.provider_status || '',
    provider_last_error: campaign.provider_last_error || '',
    provider_last_sync_at: campaign.provider_last_sync_at || '',
    budget: budgetPosition(campaign),
    duration_days: campaign.duration_days,
    scheduled_start_at: campaign.scheduled_start_at || '',
    started_at: campaign.started_at || '',
    ends_at: campaign.ends_at || '',
    completed_at: campaign.completed_at || '',
    creative: campaign.creative || null,
    creative_fingerprint: campaign.creative_fingerprint || '',
    authorization: campaign.authorization || {},
    authorization_current: authorizationIsCurrent(campaign),
    admin_approved_at: campaign.admin_approved_at || '',
    admin_approved_by: campaign.admin_approved_by || '',
    customer_approved_at: campaign.customer_approved_at || '',
    launch_attempts: Number(campaign.launch_attempts || 0),
    launch_blocks: campaign.launch_blocks || [],
    review_required: campaign.review_required === true,
    attention_reason: campaign.attention_reason || '',
    rejection_reason: campaign.rejection_reason || '',
    refund_status: campaign.refund_status || 'none',
    refundable_cents: refundableAmount(campaign),
    refund_reason: campaign.refund_reason || '',
    metrics: campaign.metrics || null,
    events: campaign.events || [],
    paid_amount_cents: Number(campaign.paid_amount_cents || 0),
    processing_fee_cents: Number(campaign.processing_fee_cents || 0),
    created_at: campaign.created_at || '',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');
    const campaignId = String(body.campaignId || body.campaign_id || '');
    const now = new Date();

    const actor = await resolvePropertyActor(base44, body);
    if (!actor.isAdmin) {
      return Response.json({ ok: false, error: 'FORBIDDEN', message: 'Administrator access required.' }, { status: 403 });
    }

    const switches = await readAdSwitches(base44);
    const account = await loadProviderAccount(base44, 'meta');

    // ── Portfolio ─────────────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const filters: Record<string, any> = {};
      if (body.status && body.status !== 'all') filters.status = String(body.status);
      if (body.package_tier && body.package_tier !== 'all') filters.package_tier = String(body.package_tier);
      if (body.provider && body.provider !== 'all') filters.provider = String(body.provider);
      if (body.client_email) filters.client_email = String(body.client_email).toLowerCase();
      if (body.listing_id) filters.listing_id = String(body.listing_id);

      const all = rows(await base44.asServiceRole.entities.PropertyAdCampaign.list('-created_date', 300))
        .filter((campaign) => campaign.certification_mode !== true);
      const filtered = all.filter((campaign) => {
        for (const [key, value] of Object.entries(filters)) {
          if (String(campaign[key] || '') !== String(value)) return false;
        }
        return true;
      });
      const search = String(body.search || '').trim().toLowerCase();
      const searched = search
        ? filtered.filter((campaign) => `${campaign.client_email} ${campaign.client_name} ${campaign.listing_id} ${campaign.campaign_id} ${campaign.public_url}`.toLowerCase().includes(search))
        : filtered;

      return Response.json({
        ok: true,
        campaigns: searched.slice(0, 100).map(adminView),
        totals: portfolioSummary(searched),
        refund_policy: AD_REFUND_POLICY,
        switches: switchSummary(switches),
        provider: {
          meta: { ...metaProvider.describeReadiness(account), implemented: metaProvider.implemented, account_status: account?.status || 'unconfigured' },
          google: googleAdsProvider.describeReadiness(null),
        },
      });
    }

    if (action === 'detail') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      const attribution = await campaignAttribution(base44, campaign, now);
      return Response.json({
        ok: true,
        campaign: adminView(campaign),
        listing: listing
          ? {
              listing_id: listing.listing_id,
              property_address: listing.property_address,
              city: listing.city || '',
              state: listing.state || '',
              publication_state: listing.publication_state,
              listing_status: listing.listing_status,
              authority_confirmed: listing.authority_confirmed === true,
            }
          : null,
        attribution,
        report: campaign.final_report || buildCampaignReport(campaign, attribution),
        blockers: launchBlockers(campaign, { listing, account, switches, now, manual: true }),
      });
    }

    // ── Review and launch ─────────────────────────────────────────────────────────────────
    if (action === 'approve') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      if (!campaign.customer_approved_at) {
        return Response.json({ ok: false, error: 'CUSTOMER_APPROVAL_REQUIRED' }, { status: 400 });
      }
      const result = await adminApprove(base44, campaign, { actor: actor.email, note: String(body.note || ''), now });
      if (!result.ok) return Response.json({ ok: false, error: result.code, reason: result.reason || '' }, { status: 400 });
      if (body.launch_now === true) {
        const launched = await launchCampaign(base44, result.campaign, {
          actor: actor.email,
          listing,
          account,
          switches,
          provider: metaProvider,
          manual: true,
          imageUrl: String(body.image_url || ''),
          now,
        });
        return Response.json({ ok: launched.ok, campaign: adminView(await loadCampaign(base44, campaignId)), blockers: launched.blockers || [], error: launched.code || '' });
      }
      return Response.json({ ok: true, campaign: adminView(await loadCampaign(base44, campaignId)) });
    }

    if (action === 'reject') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const reason = String(body.reason || '').trim();
      if (!reason) return Response.json({ ok: false, error: 'REASON_REQUIRED' }, { status: 400 });
      const result = await adminReject(base44, campaign, { actor: actor.email, reason, now });
      if (!result.ok) return Response.json({ ok: false, error: result.code }, { status: 400 });
      if (Number(campaign.paid_amount_cents || 0) > 0) {
        await requestRefundReview(base44, result.campaign, { actor: actor.email, reason: `Campaign not launched: ${reason}`, now });
      }
      return Response.json({ ok: true, campaign: adminView(await loadCampaign(base44, campaignId)) });
    }

    if (action === 'launch') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      const result = await launchCampaign(base44, campaign, {
        actor: actor.email,
        listing,
        account,
        switches,
        provider: metaProvider,
        manual: true,
        imageUrl: String(body.image_url || ''),
        now,
      });
      return Response.json({
        ok: result.ok,
        blockers: result.blockers || [],
        error: result.ok ? '' : result.code,
        reason: result.reason || '',
        campaign: adminView(await loadCampaign(base44, campaignId)),
      }, { status: result.ok ? 200 : 400 });
    }

    // A failed campaign only ever returns to launch by this explicit administrator decision.
    if (action === 'retry') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      if (!canTransition(campaign.status, 'READY_TO_LAUNCH')) {
        return Response.json({ ok: false, error: 'INVALID_STATE', status: campaign.status }, { status: 400 });
      }
      if (campaign.provider_campaign_id) {
        return Response.json({
          ok: false,
          error: 'PLATFORM_CAMPAIGN_EXISTS',
          message: 'A platform campaign already exists for this purchase. Confirm its state at the platform before any further send.',
        }, { status: 400 });
      }
      const saved = await updateCampaign(
        base44,
        campaign,
        { status: 'READY_TO_LAUNCH', review_required: false, provider_last_error: '', attention_reason: '' },
        { type: 'retry_authorized', actor: actor.email, note: String(body.reason || '') },
        now,
      );
      return Response.json({ ok: true, campaign: adminView(saved) });
    }

    // ── Runtime control ───────────────────────────────────────────────────────────────────
    if (action === 'pause' || action === 'resume' || action === 'terminate') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const listing = await loadListing(base44, campaign.listing_id);
      const reason = String(body.reason || '').trim() || `${action} by administrator`;

      if (action === 'pause') {
        const result = await pauseCampaign(base44, campaign, { actor: actor.email, reason, provider: metaProvider, account, switches, now });
        if (!result.ok) return Response.json({ ok: false, error: result.code }, { status: 400 });
      }
      if (action === 'resume') {
        const result = await resumeCampaign(base44, campaign, { actor: actor.email, provider: metaProvider, account, switches, listing, now });
        if (!result.ok) return Response.json({ ok: false, error: result.code, blockers: result.blockers || [], reason: result.reason || '' }, { status: 400 });
      }
      if (action === 'terminate') {
        const result = await completeCampaign(base44, campaign, { actor: actor.email, reason: `Terminated: ${reason}`, provider: metaProvider, account, switches, now });
        if (!result.ok) return Response.json({ ok: false, error: result.code }, { status: 400 });
        await requestRefundReview(base44, result.campaign, { actor: actor.email, reason: `Campaign terminated early: ${reason}`, now });
      }
      return Response.json({ ok: true, campaign: adminView(await loadCampaign(base44, campaignId)) });
    }

    if (action === 'sync') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const result = await syncCampaign(base44, campaign, { provider: metaProvider, account, switches, now });
      return Response.json({ ok: result.ok !== false, campaign: adminView(await loadCampaign(base44, campaignId)) });
    }

    // ── Refunds ──────────────────────────────────────────────────────────────────────────
    if (action === 'refund') {
      const campaign = await loadCampaign(base44, campaignId);
      if (!campaign) return Response.json({ ok: false, error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
      const decision = String(body.decision || '');
      if (!['full', 'partial', 'decline'].includes(decision)) {
        return Response.json({ ok: false, error: 'INVALID_DECISION' }, { status: 400 });
      }
      const reason = String(body.reason || '').trim();
      if (!reason) return Response.json({ ok: false, error: 'REASON_REQUIRED' }, { status: 400 });

      let stripeRefundId = '';
      let amountCents = Number(body.amountCents || body.amount_cents || 0);
      // A Stripe refund is only ever attempted when the administrator explicitly asks for it.
      if (decision !== 'decline' && body.issue_refund === true) {
        const refundable = refundableAmount(campaign);
        amountCents = decision === 'full' ? refundable : Math.min(amountCents, refundable);
        if (amountCents <= 0) return Response.json({ ok: false, error: 'NOTHING_TO_REFUND' }, { status: 400 });
        if (!campaign.stripe_payment_intent_id) return Response.json({ ok: false, error: 'NO_PAYMENT_ON_FILE' }, { status: 400 });
        const refund = await issueAdRefund(campaign.stripe_payment_intent_id, amountCents);
        stripeRefundId = String(refund?.id || '');
      }

      const result = await decideRefund(base44, campaign, {
        actor: actor.email,
        decision: decision as any,
        amountCents,
        reason,
        stripeRefundId,
        now,
      });
      if (!result.ok) return Response.json({ ok: false, error: result.code, refundable_cents: result.refundable_cents }, { status: 400 });
      return Response.json({ ok: true, campaign: adminView(await loadCampaign(base44, campaignId)), refunded_cents: result.refunded_cents });
    }

    // ── Advertising account configuration ───────────────────────────────────────────────
    if (action === 'provider_account') {
      if (body.provider === 'google') {
        return Response.json({ ok: true, account: null, readiness: googleAdsProvider.describeReadiness(null) });
      }
      if (body.save === true) {
        const patch: Record<string, any> = {
          provider: 'meta',
          label: String(body.label || 'Arriv Meta advertising account'),
          business_id: String(body.business_id || ''),
          ad_account_id: String(body.ad_account_id || ''),
          page_id: String(body.page_id || ''),
          api_version: String(body.api_version || 'v21.0'),
          currency: String(body.currency || 'USD'),
          credential_secret_name: 'META_MARKETING_ACCESS_TOKEN',
          special_ad_categories: ['HOUSING'],
          spend_controls_verified: body.spend_controls_verified === true,
          business_verification_status: String(body.business_verification_status || ''),
          notes: String(body.notes || ''),
          updated_at: now.toISOString(),
        };
        patch.status = body.mark_connected === true ? 'connected' : (patch.ad_account_id ? 'configured' : 'unconfigured');
        if (patch.status === 'connected') {
          patch.last_verified_at = now.toISOString();
          patch.last_verified_by = actor.email;
        }
        const existing = account;
        const saved = existing
          ? await base44.asServiceRole.entities.PropertyAdProviderAccount.update(existing.id, patch)
          : await base44.asServiceRole.entities.PropertyAdProviderAccount.create(patch);
        return Response.json({ ok: true, account: saved, readiness: metaProvider.describeReadiness(saved) });
      }
      return Response.json({ ok: true, account, readiness: metaProvider.describeReadiness(account) });
    }

    // ── Switches ────────────────────────────────────────────────────────────────────────
    if (action === 'switches') {
      if (body.set && body.name) {
        const name = String(body.name);
        if (!(name in AD_SWITCH_KEYS)) return Response.json({ ok: false, error: 'UNKNOWN_SWITCH' }, { status: 400 });
        if (body.confirm !== true) {
          return Response.json({ ok: false, error: 'CONFIRMATION_REQUIRED', message: 'Enabling or disabling a live advertising control must be confirmed explicitly.' }, { status: 400 });
        }
        const key = (AD_SWITCH_KEYS as any)[name];
        const value = body.enabled === true ? 'true' : 'false';
        const existing = rows(await base44.asServiceRole.entities.AppSetting.filter({ key }));
        if (existing[0]) {
          await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value });
        } else {
          await base44.asServiceRole.entities.AppSetting.create({ key, value });
        }
        return Response.json({ ok: true, switches: switchSummary(await readAdSwitches(base44)) });
      }
      return Response.json({ ok: true, switches: switchSummary(switches) });
    }

    return Response.json({ ok: false, error: 'UNKNOWN_ACTION' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
});