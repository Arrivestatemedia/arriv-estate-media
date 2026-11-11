import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolvePropertyActor } from '../../shared/propertyActor.ts';
import { readAdSwitches } from '../../shared/propertyAdSwitches.ts';
import { metaProvider, loadProviderAccount } from '../../shared/propertyAdProviders.ts';
import {
  campaignEligibility,
  completeCampaign,
  confirmPayment,
  guardListingEligibility,
  loadListing,
  markPaymentFailed,
  pauseCampaign,
  launchCampaign,
  recordPaymentCaptured,
  remainingBudget,
  syncCampaign,
} from '../../shared/propertyAdEngine.ts';
import { buildCampaignReport, campaignAttribution, notifyAdmins, notify } from '../../shared/propertyAdReporting.ts';
import { money } from '../../shared/propertyAdPackages.ts';
import { ensureCampaignCaptured } from '../../shared/propertyAdPaymentCapture.ts';

// Advertising sweep and payment entry points.
//
// The sweep is deliberately conservative: it never launches anything without every safeguard
// passing, never retries a failed platform call on its own, and never spends past the authorized
// budget. It is also not the only line of defence — a listing that becomes ineligible is enforced
// immediately where the listing changes, not here.

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const SWEEP_LIMIT = 60;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'sweep');
    const now = new Date();

    // Public URL, workflow-invoked: refuses anyone who is not an authenticated administrator.
    let platformUser: any = null;
    try {
      platformUser = await base44.auth.me();
    } catch {
      platformUser = null;
    }
    if (!platformUser) {
      return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }
    const platformAdmin = platformUser?.role === 'admin';
    const actor = await resolvePropertyActor(base44, body);
    if (!platformAdmin && !actor.isAdmin) {
      return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    }

    // ── Payment events (from the Stripe webhook) ─────────────────────────────────────────
    // The card is authorized when the campaign is bought…
    if (action === 'payment_authorized') {
      const result = await confirmPayment(base44, {
        campaignId: String(body.campaign_id || ''),
        paymentIntentId: String(body.payment_intent_id || ''),
        amountCents: Number(body.amount_cents || 0),
        now,
      });
      if (!result.ok) return Response.json({ ok: false, error: result.code }, { status: 400 });
      if (!result.duplicate && result.campaign?.client_email) {
        const switches = await readAdSwitches(base44);
        if (switches.customer_notifications) {
          await notify(
            base44,
            'Your advertising campaign is reserved',
            `Your ${result.campaign.package_name} is reserved for this property. Your card has not been charged: it is only charged once your property page is approved and the campaign starts running.\n\nAdvertising budget: ${money(result.campaign.ad_budget_cents)}\nManagement fee: ${money(result.campaign.management_fee_cents)}\nDuration: ${result.campaign.duration_days} days\n\nYour campaign then goes through our final review before launch. Nothing is published until that review passes.\n\n— Arriv Estate Media`,
            { to: result.campaign.client_email },
          );
        }
      }
      return Response.json({ ok: true, duplicate: result.duplicate === true, status: result.campaign?.status || '' });
    }

    // …and captured only when it is about to start running.
    if (action === 'payment_succeeded') {
      const found = rows(await base44.asServiceRole.entities.PropertyAdCampaign.filter({
        stripe_payment_intent_id: String(body.payment_intent_id || ''),
      }));
      const secured = found[0];
      if (secured && ['authorized', 'capture_failed'].includes(String(secured.payment_state || ''))) {
        const captured = await recordPaymentCaptured(base44, secured, {
          amountCents: Number(body.amount_cents || 0),
          actor: 'stripe',
          reference: String(body.payment_intent_id || ''),
          now,
        });
        return Response.json({ ok: true, captured: true, status: captured.campaign?.status || '' });
      }
      const result = await confirmPayment(base44, {
        campaignId: String(body.campaign_id || ''),
        paymentIntentId: String(body.payment_intent_id || ''),
        amountCents: Number(body.amount_cents || 0),
        captured: true,
        now,
      });
      if (!result.ok) return Response.json({ ok: false, error: result.code }, { status: 400 });
      if (!result.duplicate && result.campaign?.client_email) {
        const switches = await readAdSwitches(base44);
        if (switches.customer_notifications) {
          await notify(
            base44,
            'Your advertising campaign payment is confirmed',
            `We received your payment for the ${result.campaign.package_name} on this property. Your campaign now goes through our final review before launch. Nothing is published until that review passes.\n\nAdvertising budget: ${money(result.campaign.ad_budget_cents)}\nManagement fee: ${money(result.campaign.management_fee_cents)}\nDuration: ${result.campaign.duration_days} days\n\n— Arriv Estate Media`,
            { to: result.campaign.client_email },
          );
        }
      }
      return Response.json({ ok: true, duplicate: result.duplicate === true, status: result.campaign?.status || '' });
    }

    if (action === 'payment_failed') {
      const found = rows(await base44.asServiceRole.entities.PropertyAdCampaign.filter({ stripe_payment_intent_id: String(body.payment_intent_id || '') }));
      if (!found[0]) return Response.json({ ok: true, ignored: true });
      const result = await markPaymentFailed(base44, found[0], {
        paymentIntentId: String(body.payment_intent_id || ''),
        reason: String(body.reason || 'The payment did not complete.'),
        now,
      });
      return Response.json({ ok: true, status: result.campaign?.status || '' });
    }

    const switches = await readAdSwitches(base44);
    const account = await loadProviderAccount(base44, 'meta');

    const wanted = action === 'sync'
      ? ['SUBMITTED', 'ACTIVE']
      : ['READY_TO_LAUNCH', 'SUBMITTED', 'ACTIVE', 'PAUSED'];

    const campaigns = rows(await base44.asServiceRole.entities.PropertyAdCampaign.filter(
      { status: { $in: wanted } },
      { sort: 'created_date', limit: SWEEP_LIMIT },
    )).filter((campaign) => campaign.certification_mode !== true);

    const summary = {
      scanned: campaigns.length,
      launched: 0,
      blocked: 0,
      synced: 0,
      completed: 0,
      paused_ineligible: 0,
      budget_stopped: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const listings = new Map<string, any>();
    const guarded = new Set<string>();

    for (const campaign of campaigns) {
      try {
        let listing = listings.get(campaign.listing_id);
        if (listing === undefined) {
          listing = await loadListing(base44, campaign.listing_id);
          listings.set(campaign.listing_id, listing);
        }

        // Eligibility is enforced before anything else. Losing it stops advertising now.
        const eligibility = listing ? campaignEligibility(listing, now) : { eligible: false, blockers: ['The property could not be found.'] };
        if (!eligibility.eligible && ['READY_TO_LAUNCH', 'SUBMITTED', 'ACTIVE'].includes(campaign.status)) {
          if (!guarded.has(campaign.listing_id)) {
            guarded.add(campaign.listing_id);
            const result = await guardListingEligibility(base44, {
              listing,
              reason: eligibility.blockers[0],
              actor: 'sweep',
              provider: metaProvider,
              account,
              switches,
              now,
            });
            summary.paused_ineligible += result.paused.length;
            if (result.paused.length) {
              await notifyAdmins(
                base44,
                'Advertising stopped: property no longer eligible',
                `Advertising for listing ${campaign.listing_id} was stopped.\n\nReason: ${eligibility.blockers[0]}\nCampaigns affected: ${result.paused.join(', ')}\n\nUnspent advertising budget needs reconciliation.`,
              );
            }
          }
          continue;
        }

        if (campaign.status === 'READY_TO_LAUNCH') {
          // The charge only happens here: the page is approved and live, and the campaign is about
          // to run. Until the capture succeeds nothing launches.
          const captured = await ensureCampaignCaptured(base44, campaign, { actor: 'sweep', now });
          if (!captured.ok) {
            summary.blocked += 1;
            await notifyAdmins(
              base44,
              'Advertising campaign not charged, not launched',
              `Campaign ${campaign.campaign_id} (${campaign.package_name}) was due to start but the card could not be charged.\n\nReason: ${captured.reason || captured.code}\n\nThe campaign has not been launched and needs attention.`,
            );
            continue;
          }
          const result = await launchCampaign(base44, captured.campaign || campaign, {
            actor: 'sweep',
            listing,
            account,
            switches,
            provider: metaProvider,
            manual: false,
            now,
          });
          if (result.ok) {
            summary.launched += 1;
            await notifyAdmins(base44, 'Advertising campaign launched', `Campaign ${campaign.campaign_id} (${campaign.package_name}) is now ${result.campaign?.status}.`);
          } else {
            summary.blocked += 1;
          }
          continue;
        }

        if (campaign.status === 'PAUSED') {
          const ended = Date.parse(String(campaign.ends_at || ''));
          if (Number.isFinite(ended) && ended <= now.getTime()) {
            const result = await completeCampaign(base44, campaign, { actor: 'sweep', reason: 'scheduled_end', provider: metaProvider, account, switches, now });
            if (result.ok) summary.completed += 1;
          } else {
            summary.skipped += 1;
          }
          continue;
        }

        // SUBMITTED / ACTIVE
        const lastSync = Date.parse(String(campaign.provider_last_sync_at || ''));
        const due = action === 'sync' || !Number.isFinite(lastSync) || now.getTime() - lastSync >= SYNC_INTERVAL_MS;
        if (!due) {
          summary.skipped += 1;
          continue;
        }

        const before = campaign.status;
        const synced: any = await syncCampaign(base44, campaign, { provider: metaProvider, account, switches, now });
        summary.synced += 1;
        if (synced?.campaign?.status === 'COMPLETED' && before !== 'COMPLETED') {
          summary.completed += 1;
          const finalCampaign = synced.campaign;
          const attribution = await campaignAttribution(base44, finalCampaign, now);
          const report = buildCampaignReport(finalCampaign, attribution);
          await base44.asServiceRole.entities.PropertyAdCampaign.update(finalCampaign.id, {
            final_report: report,
            final_report_at: now.toISOString(),
          });
          await notifyAdmins(
            base44,
            'Advertising campaign completed',
            `Campaign ${finalCampaign.campaign_id} completed.\nSpend: ${money(finalCampaign.spent_cents)} of ${money(finalCampaign.ad_budget_cents)}\nUnused budget: ${money(remainingBudget(finalCampaign))}`,
          );
          if (switches.customer_notifications) {
            await notify(
              base44,
              'Your advertising campaign has finished',
              `Your advertising campaign has ended.\n\nAdvertising budget: ${money(finalCampaign.ad_budget_cents)}\nActually spent: ${money(finalCampaign.spent_cents)}\nUnused: ${money(remainingBudget(finalCampaign))}\n\nYour full results are available in your property dashboard. Unused advertising budget is reviewed for refund under the published policy.\n\n— Arriv Estate Media`,
              { to: finalCampaign.client_email },
            );
          }
        }

        // Budget enforcement after every sync: a campaign is never allowed to spend past its
        // authorized advertising budget.
        if (synced?.campaign && ['ACTIVE', 'SUBMITTED'].includes(synced.campaign.status)) {
          const fresh = synced.campaign;
          if (Number(fresh.spent_cents || 0) >= Number(fresh.ad_budget_cents || 0) && Number(fresh.ad_budget_cents || 0) > 0) {
            const paused = await pauseCampaign(base44, fresh, {
              actor: 'sweep',
              reason: 'The authorized advertising budget has been fully spent.',
              provider: metaProvider,
              account,
              switches,
              now,
            });
            if (paused.ok) {
              summary.budget_stopped += 1;
              await notifyAdmins(
                base44,
                'Advertising budget exhausted',
                `Campaign ${fresh.campaign_id} reached its authorized advertising budget of ${money(fresh.ad_budget_cents)} and was paused.`,
              );
            }
          }
        }
      } catch (error: any) {
        summary.errors.push(`${campaign.campaign_id}: ${error?.message || 'unknown'}`);
      }
    }

    return Response.json({ ok: true, ...summary });
  } catch (error: any) {
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  }
});