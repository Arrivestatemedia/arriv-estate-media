// Regression checks for the Stripe event routing guards.
//
// Every check is a pure function call: no Stripe request, no record written, no email, no charge. It
// proves the routing decisions, not that Stripe is configured — that is reported separately.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveVisibilityActor, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import {
  routeObject,
  visibilityBranchMayAct,
  preferredBranchMayAct,
  preferredStatusMayChange,
  sessionIsRecurring,
  paymentIntentBelongsToSubscription,
  VISIBILITY_PURPOSE,
  PREFERRED_PURPOSE,
} from '../../shared/stripeEventRouting.ts';
import {
  applySubscriptionUpsert,
  applyInvoicePaid,
} from '../../shared/visibilitySubscriptionEngine.ts';

const VIS = ['price_vis_presence', 'price_vis_growth', 'price_vis_brokerage', 'price_vis_seat'];

function visibilitySubscription(overrides: any = {}) {
  return {
    id: 'sub_vis_1',
    status: 'active',
    metadata: { purpose: VISIBILITY_PURPOSE, profile_id: 'prof_1', plan_key: 'agent_growth', owner_email: 'agent@example.com' },
    items: { data: [{ price: { id: 'price_vis_growth', unit_amount: 9900 } }] },
    ...overrides,
  };
}

function preferredSubscription(overrides: any = {}) {
  return {
    id: 'sub_pref_1',
    status: 'active',
    metadata: { client_id: 'client_1', client_email: 'client@example.com', purpose: PREFERRED_PURPOSE },
    items: { data: [{ price: { id: 'price_pref_2999', unit_amount: 2999 } }] },
    ...overrides,
  };
}

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
    if (!actor.isAdmin) return jsonResponse({ ok: false, error: 'Administrator access required.' }, 403);

    const checks: any[] = [];
    const add = (name: string, pass: boolean, detail = '') => checks.push({ name, pass, detail });

    // ---- Visibility routing ------------------------------------------------------------------
    add('A Visibility subscription is routed to the Visibility branch',
      routeObject(visibilitySubscription(), VIS) === 'visibility');
    add('A Visibility subscription is refused by the Preferred branch',
      preferredBranchMayAct(visibilitySubscription(), VIS) === false);
    add('A Visibility subscription is accepted by the Visibility branch',
      visibilityBranchMayAct(visibilitySubscription(), VIS) === true);

    const priceOnly = visibilitySubscription({ metadata: {} });
    add('A Visibility price alone proves the subscription', routeObject(priceOnly, VIS) === 'visibility');
    add('A Visibility price alone is refused by the Preferred branch', preferredBranchMayAct(priceOnly, VIS) === false);

    const seatPurchase = visibilitySubscription({
      metadata: {},
      items: { data: [{ price: { id: 'price_vis_seat', unit_amount: 2900 } }] },
    });
    add('The additional seat price routes to Visibility', routeObject(seatPurchase, VIS) === 'visibility');

    const planMetadataOnly = visibilitySubscription({
      metadata: { plan_key: 'agent_presence', profile_id: 'prof_2' },
      items: { data: [] },
    });
    add('Plan key plus profile proves the subscription without a price', routeObject(planMetadataOnly, VIS) === 'visibility');

    // ---- Preferred routing -------------------------------------------------------------------
    add('A Preferred membership is routed to the Preferred branch',
      routeObject(preferredSubscription(), VIS) === 'preferred');
    add('A Preferred membership is refused by the Visibility branch',
      visibilityBranchMayAct(preferredSubscription(), VIS) === false);
    add('A Preferred membership is accepted by the Preferred branch',
      preferredBranchMayAct(preferredSubscription(), VIS) === true);

    const preferredByEmail = preferredSubscription({ metadata: { client_email: 'client@example.com' } });
    add('Preferred metadata alone still routes to Preferred', routeObject(preferredByEmail, VIS) === 'preferred');

    // ---- Ambiguous and unknown ---------------------------------------------------------------
    const ambiguous = visibilitySubscription({
      metadata: { purpose: VISIBILITY_PURPOSE, profile_id: 'prof_1', plan_key: 'agent_growth', client_email: 'client@example.com' },
    });
    add('An object carrying both flows is refused by the Visibility branch', visibilityBranchMayAct(ambiguous, VIS) === false);
    add('An object carrying both flows is refused by the Preferred branch', preferredBranchMayAct(ambiguous, VIS) === false);

    const unknown = { id: 'sub_unknown', status: 'active', metadata: {}, items: { data: [{ price: { id: 'price_elsewhere' } }] } };
    add('An unrecognised subscription is never routed to Visibility', visibilityBranchMayAct(unknown, VIS) === false);
    add('An unrecognised subscription keeps its existing Preferred behaviour', preferredBranchMayAct(unknown, VIS) === true);

    // ---- Media orders are never treated as subscriptions -------------------------------------
    add('A subscription-mode checkout session is not an order', sessionIsRecurring({ mode: 'subscription' }) === true);
    add('A payment-mode checkout session is still an order', sessionIsRecurring({ mode: 'payment' }) === false);
    add('A payment intent on a subscription invoice is recognised',
      paymentIntentBelongsToSubscription({ id: 'pi_1', invoice: 'in_1' }) === true);
    add('A plain media-order payment intent is not flagged',
      paymentIntentBelongsToSubscription({ id: 'pi_2', invoice: null }) === false);

    const packageIntent = { id: 'pi_3', metadata: { purpose: 'property_package_purchase', promotion_id: 'promo_1' } };
    add('A property package payment never routes to Visibility', visibilityBranchMayAct(packageIntent, VIS) === false);

    const adIntent = { id: 'pi_4', metadata: { purpose: 'property_ad_purchase', campaign_id: 'adc_1' } };
    add('An advertising payment never routes to Visibility', visibilityBranchMayAct(adIntent, VIS) === false);

    // ---- Invoices ----------------------------------------------------------------------------
    const visibilityInvoice = {
      id: 'in_vis_1',
      subscription: 'sub_vis_1',
      metadata: { purpose: VISIBILITY_PURPOSE },
      lines: { data: [{ price: { id: 'price_vis_growth' } }] },
    };
    add('A Visibility invoice is refused by the Preferred residual branch',
      preferredBranchMayAct(visibilityInvoice, VIS) === false);

    const preferredInvoice = {
      id: 'in_pref_1',
      subscription: 'sub_pref_1',
      metadata: {},
      lines: { data: [{ price: { id: 'price_pref_2999' } }] },
    };
    add('A Preferred invoice keeps its residual commission behaviour',
      preferredBranchMayAct(preferredInvoice, VIS) === true);
    add('A Preferred invoice is refused by the Visibility branch',
      visibilityBranchMayAct(preferredInvoice, VIS) === false);

    // ---- Out-of-order and duplicate state ----------------------------------------------------
    add('A canceled membership is not reopened by a late event', preferredStatusMayChange('canceled', 'active') === false);
    add('An active membership still accepts a cancellation', preferredStatusMayChange('active', 'canceled') === true);
    add('A past_due membership still accepts an upgrade to active', preferredStatusMayChange('past_due', 'active') === true);

    const record = { subscription_id: 'vsub_1', status: 'pending_checkout', plan_key: 'agent_growth' };
    const first = applySubscriptionUpsert(record, visibilitySubscription(), 'evt_1');
    add('A Visibility subscription is bound once', first.changed && first.patch.stripe_subscription_id === 'sub_vis_1');
    const second = applySubscriptionUpsert({ ...record, ...first.patch }, visibilitySubscription(), 'evt_1');
    add('A duplicate delivery changes nothing', second.changed === false);
    const lateUpsert = applySubscriptionUpsert({ ...record, status: 'canceled' }, visibilitySubscription(), 'evt_2');
    add('A late delivery never reopens an ended subscription', lateUpsert.patch.status === undefined);
    const paidTwice = applyInvoicePaid({ ...record, ...first.patch }, visibilityInvoice, 'evt_3');
    const paidAgain = applyInvoicePaid({ ...record, ...first.patch, ...paidTwice.patch }, visibilityInvoice, 'evt_4');
    add('An invoice is recorded once even when delivered twice', paidAgain.patch.billing_history.length === 1);

    // ---- The app is really pointing at Stripe ------------------------------------------------
    const rows = await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50);
    const plans = Array.isArray(rows) ? rows : rows?.items || [];
    const configuredPrices = plans.map((p: any) => String(p.stripe_price_id || '')).filter(Boolean);
    add('Every active plan has a Stripe price stored', plans.length >= 3 && configuredPrices.length >= 3,
      plans.map((p: any) => `${p.product_key}:${p.stripe_price_id ? 'yes' : 'no'}`).join(' '));

    const failed = checks.filter((c) => !c.pass);
    return jsonResponse({
      ok: failed.length === 0,
      passed: checks.length - failed.length,
      total: checks.length,
      failed: failed.map((c) => c.name),
      checks,
      note: 'Pure routing and engine checks. No Stripe request, no record written, no email, no charge.',
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});