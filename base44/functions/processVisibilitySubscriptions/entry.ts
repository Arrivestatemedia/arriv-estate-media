import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { rowsOf, jsonResponse } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';
import { applySubscriptionUpsert, shouldExpire, expirePatch, renewalNoticeDue } from '../../shared/visibilitySubscriptionEngine.ts';
import { retrieveSubscription } from '../../shared/stripeSubscriptions.ts';
import { evaluateMarket, marketQuery, marketIndexable } from '../../shared/geoMarkets.ts';
import { inquiryEmailBody } from '../../shared/profileInquiry.ts';
import { requestEdgePurge } from '../../shared/edgeCache.ts';

// The recurring sweep.
//
// It reconciles subscriptions with Stripe (so a missed webhook cannot leave a customer's benefits
// wrong for long), expires periods that ended, sends the notices the switches allow, retries lead
// deliveries that failed, and re-evaluates geographic page eligibility so a market that loses its
// inventory stops being indexable.

const MAX_ATTEMPTS = 4;

function event(record, type, actor, note = '') {
  const events = Array.isArray(record?.events) ? record.events : [];
  return [...events, { type, at: new Date().toISOString(), actor, note }].slice(-50);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const switches = await readVisibilitySwitches(base44);
    const now = new Date();
    const result = { reconciled: 0, expired: 0, notices: 0, reports: 0, leads_retried: 0, leads_delivered: 0, markets_evaluated: 0, errors: [] };

    // ---- 1. reconcile with Stripe -------------------------------------------------------------
    const openSubs = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter(
      { status: { $in: ['active', 'past_due', 'incomplete', 'paused'] } },
      { limit: 100 },
    ));
    for (const record of openSubs) {
      try {
        if (record.stripe_subscription_id) {
          const subscription = await retrieveSubscription(record.stripe_subscription_id);
          const eventId = `sweep_${subscription?.id || ''}_${subscription?.status || ''}_${subscription?.current_period_end || ''}`;
          const { changed, patch } = applySubscriptionUpsert(record, subscription, eventId, 'sweep');
          if (changed && Object.keys(patch).length) {
            await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
            result.reconciled += 1;
            Object.assign(record, patch);
          }
        }
        if (shouldExpire(record, now)) {
          await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, expirePatch(record, 'sweep'));
          result.expired += 1;
          Object.assign(record, { status: 'expired' });
        }

        if (switches.customer_notifications && renewalNoticeDue(record, now, 5)) {
          const profile = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: record.profile_id }))[0];
          if (profile && record.contact_email) {
            await sendBrevoEmail({
              to: record.contact_email,
              subject: 'Your Arriv visibility plan renews soon',
              textContent:
                `Hi ${profile.display_name || 'there'},\n\n` +
                `Your ${String(record.plan_key || '').replace(/_/g, ' ')} plan renews on ` +
                `${String(record.current_period_end || '').slice(0, 10)} and will be charged automatically at the ` +
                `price you agreed. You can review or cancel it any time from your Subscription & Visibility dashboard.\n\n` +
                `Arriv Estate Media`,
              senderEmail: BOOKINGS_SENDER_EMAIL,
              senderName: 'Arriv Estate Media',
            });
            await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, {
              notified_renewal_at: new Date().toISOString(),
            });
            result.notices += 1;
          }
        }

        // Monthly performance summary, only while the plan is active and notifications are allowed.
        const lastReport = Date.parse(String(record.last_report_sent_at || ''));
        const due = record.status === 'active' && (!Number.isFinite(lastReport) || now.getTime() - lastReport > 30 * 86400000);
        if (switches.customer_notifications && due) {
          const profile = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: record.profile_id }))[0];
          if (profile && record.contact_email) {
            const leads = await base44.asServiceRole.entities.ProfileInquiry.count({ profile_id: record.profile_id });
            const delivered = await base44.asServiceRole.entities.ProfileInquiry.count({ profile_id: record.profile_id, notification_status: 'delivered' });
            await sendBrevoEmail({
              to: record.contact_email,
              subject: 'Your monthly Arriv visibility summary',
              textContent:
                `Hi ${profile.display_name || 'there'},\n\n` +
                `Here is what your profile recorded: ${Number(leads || 0)} inquir${Number(leads) === 1 ? 'y' : 'ies'}, ` +
                `${Number(delivered || 0)} delivered to you.\n\n` +
                `Your plan status is ${record.status}. Sign in to your Subscription & Visibility dashboard for the full ` +
                `traffic and lead-source detail. Arriv reports only figures it actually records and does not report ` +
                `search rankings, Google impressions or promised lead volume.\n\nArriv Estate Media`,
              senderEmail: BOOKINGS_SENDER_EMAIL,
              senderName: 'Arriv Estate Media',
            });
            await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, {
              last_report_sent_at: new Date().toISOString(),
            });
            result.reports += 1;
          }
        }
      } catch (error) {
        result.errors.push(`${record.subscription_id}: ${String(error?.message || error).slice(0, 200)}`);
      }
    }

    // ---- 2. lead delivery retries -------------------------------------------------------------
    const pending = rowsOf(await base44.asServiceRole.entities.ProfileInquiry.filter(
      { notification_status: { $in: ['retrying', 'failed', 'pending_recipient_delivery'] } },
      { limit: 40 },
    )).filter((lead) => {
      const nextAt = Date.parse(String(lead.next_delivery_attempt_at || ''));
      const attempts = Number(lead.delivery_attempts || 0);
      return attempts < MAX_ATTEMPTS && (!Number.isFinite(nextAt) || nextAt <= now.getTime());
    });

    for (const lead of pending) {
      try {
        const profile = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: lead.profile_id }))[0];
        if (!profile || !lead.routed_to_email) continue;
        const { subject, text } = inquiryEmailBody({ profile, inquiry: lead, sourceLabel: 'your Arriv profile' });
        const sent = await sendBrevoEmail({
          to: lead.routed_to_email,
          subject,
          textContent: text,
          senderEmail: BOOKINGS_SENDER_EMAIL,
          senderName: 'Arriv Estate Media',
          replyTo: lead.email,
        });
        await base44.asServiceRole.entities.ProfileInquiry.update(lead.id, {
          notification_status: 'delivered',
          delivered_at: new Date().toISOString(),
          delivery_message_id: String(sent?.messageId || ''),
          delivery_attempts: Number(lead.delivery_attempts || 0) + 1,
          last_delivery_attempt_at: new Date().toISOString(),
          next_delivery_attempt_at: undefined,
          delivery_error: undefined,
        });
        result.leads_retried += 1;
        result.leads_delivered += 1;
      } catch (error) {
        const attempts = Number(lead.delivery_attempts || 0) + 1;
        await base44.asServiceRole.entities.ProfileInquiry.update(lead.id, {
          notification_status: attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying',
          delivery_attempts: attempts,
          last_delivery_attempt_at: new Date().toISOString(),
          next_delivery_attempt_at: new Date(now.getTime() + Math.min(60, 10 * attempts) * 60000).toISOString(),
          delivery_error: String(error?.message || error).slice(0, 400),
          admin_alerted_at: attempts >= MAX_ATTEMPTS ? new Date().toISOString() : lead.admin_alerted_at,
        });
        result.leads_retried += 1;
        result.errors.push(`lead ${lead.inquiry_id}: ${String(error?.message || error).slice(0, 160)}`);
      }
    }

    // ---- 3. geographic page eligibility ------------------------------------------------------
    const markets = rowsOf(await base44.asServiceRole.entities.GeographicMarket.filter(
      { status: { $in: ['draft', 'approved', 'published'] }, certification_mode: false },
      { limit: 100 },
    ));
    for (const market of markets) {
      try {
        const counts = await base44.asServiceRole.entities.PropertyListing.count(marketQuery(market, { testMode: false }));
        const eligibility = evaluateMarket(market, { published_listings: counts });
        const indexable = marketIndexable(market, eligibility) && switches.geo_publication === true;
        const changed = JSON.stringify(market.eligibility || {}) !== JSON.stringify(eligibility)
          || market.sitemap_eligible !== indexable
          || (indexable && market.indexing !== 'index')
          || (!indexable && market.indexing !== 'noindex');
        if (changed) {
          await base44.asServiceRole.entities.GeographicMarket.update(market.id, {
            eligibility,
            sitemap_eligible: indexable,
            indexing: indexable ? 'index' : 'noindex',
            last_index_check_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            events: event(market, 'eligibility_evaluated', 'sweep', eligibility.reason || 'eligible'),
          });
        }
        result.markets_evaluated += 1;
      } catch (error) {
        result.errors.push(`market ${market.slug}: ${String(error?.message || error).slice(0, 160)}`);
      }
    }

    if (result.markets_evaluated) {
      await requestEdgePurge({ slugs: [] });
    }

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});