import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { rowsOf, jsonResponse } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { sendBrevoEmail, BOOKINGS_SENDER_EMAIL } from '../../shared/brevoClient.ts';
import { reconcileFromStripe, shouldExpire, expirePatch, renewalNoticeDue } from '../../shared/visibilitySubscriptionEngine.ts';
import { retrieveSubscription } from '../../shared/stripeSubscriptions.ts';
import { evaluateMarket, marketQuery, marketIndexable } from '../../shared/geoMarkets.ts';
import { inquiryEmailBody } from '../../shared/profileInquiry.ts';
import { requestEdgePurge } from '../../shared/edgeCache.ts';
import { appOrigin } from '../../shared/propertyVisibility.ts';
import { noticeByKey, noticeText, isMarketingNotice } from '../../shared/visibilityEmails.ts';
import { marketingAllowed, preferenceToken, noticeAllowed } from '../../shared/notificationPreference.ts';

// The recurring sweep.
//
// It reconciles subscriptions with Stripe (so a missed webhook cannot leave a customer's benefits
// wrong for long), expires periods that ended, sends the notices the switches allow, retries lead
// deliveries that failed, and re-evaluates geographic page eligibility so a market that loses its
// inventory stops being indexable.
//
// Reconciliation is derived from Stripe's live state, not from a synthetic event id: it is repeatable,
// writes nothing when the record already matches Stripe, and can therefore never discard a renewal that
// happened after the previous sweep.

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

    // The seat price of each plan, so a seat line is never mistaken for the plan itself.
    let planRows = [];
    try {
      planRows = rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50));
    } catch (error) {
      result.errors.push(`plans unavailable: ${String(error?.message || error).slice(0, 160)}`);
    }
    const seatPriceIdFor = (planKey) =>
      String(planRows.find((plan) => String(plan?.product_key || '') === String(planKey || ''))?.stripe_seat_price_id || '');

    // ---- 1. reconcile with Stripe -------------------------------------------------------------
    const openSubs = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter(
      { status: { $in: ['active', 'past_due', 'incomplete', 'paused'] } },
      { limit: 100 },
    ));
    for (const record of openSubs) {
      try {
        if (record.stripe_subscription_id) {
          const subscription = await retrieveSubscription(record.stripe_subscription_id);
          const { changed, patch } = reconcileFromStripe(record, subscription, 'sweep', {
            seatPriceId: seatPriceIdFor(record.plan_key),
          });
          if (changed) {
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

        // ---- notices -----------------------------------------------------------------------
        // Every notice is decided from the record's own state and the notifications switch. The
        // marketing ones additionally require that this address has not opted out.
        const profile = rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: record.profile_id }))[0];
        const recipient = String(record.contact_email || profile?.contact_email || '');
        const customerName = String(profile?.display_name || '').split(' ')[0] || '';

        const sendNotice = async (noticeKey, marker, extra = {}) => {
          if (record[marker]) return false;
          const notice = noticeByKey(noticeKey);
          if (!notice || !recipient) return false;
          let allowed = noticeAllowed(notice.notice_class, { switchOn: switches.customer_notifications === true, marketingAllowed: false });
          let unsubscribeUrl = '';
          if (isMarketingNotice(notice)) {
            let optedIn = false;
            try {
              optedIn = await marketingAllowed(base44, recipient);
              unsubscribeUrl = optedIn ? `${appOrigin()}/notification-preferences?token=${await preferenceToken(recipient)}` : '';
            } catch (error) {
              // Without a working opt-out link a marketing notice is never sent.
              optedIn = false;
              result.errors.push(`preference unavailable: ${String(error?.message || error).slice(0, 120)}`);
            }
            allowed = noticeAllowed(notice.notice_class, { switchOn: switches.customer_notifications === true, marketingAllowed: optedIn });
          }
          if (!allowed) return false;

          await sendBrevoEmail({
            to: recipient,
            subject: notice.subject,
            textContent: noticeText(notice, { name: customerName, appUrl: appOrigin(), unsubscribeUrl, ...extra }),
            senderEmail: BOOKINGS_SENDER_EMAIL,
            senderName: 'Arriv Estate Media',
          });
          await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, { [marker]: new Date().toISOString() });
          record[marker] = new Date().toISOString();
          return true;
        };

        if (record.status === 'active') {
          if (await sendNotice('activated', 'notified_activated_at')) result.notices += 1;
        }
        if (record.status === 'past_due') {
          if (await sendNotice('payment_failed', 'notified_payment_failed_at')) result.notices += 1;
        }
        if (record.status === 'canceled' || record.status === 'expired') {
          if (await sendNotice('canceled', 'notified_canceled_at')) result.notices += 1;
        }

        if (renewalNoticeDue(record, now, 5)) {
          const sent = await sendNotice('renewal', 'notified_renewal_at');
          if (sent) result.notices += 1;
        }

        // Monthly performance summary, only while the plan is active and notifications are allowed.
        const lastReport = Date.parse(String(record.last_report_sent_at || ''));
        const due = record.status === 'active' && (!Number.isFinite(lastReport) || now.getTime() - lastReport > 30 * 86400000);
        if (due) {
          const leads = await base44.asServiceRole.entities.ProfileInquiry.count({ profile_id: record.profile_id });
          const delivered = await base44.asServiceRole.entities.ProfileInquiry.count({ profile_id: record.profile_id, notification_status: 'delivered' });
          const sent = await sendNotice(
            'monthly_summary',
            'last_report_sent_at',
            { detail: `Recorded this month: ${Number(leads || 0)} inquir${Number(leads) === 1 ? 'y' : 'ies'}, ${Number(delivered || 0)} delivered to you.` },
          );
          if (sent) result.reports += 1;
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

    return jsonResponse({
      ok: true,
      ...result,
      switch_state: {
        customer_notifications: switches.customer_notifications === true,
        subscription_checkout: switches.subscription_checkout === true,
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});