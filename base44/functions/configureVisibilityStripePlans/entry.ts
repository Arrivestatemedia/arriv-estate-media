// Creates or reuses the Phase 4 subscription products and monthly prices in Stripe, stores the ids on
// the plan records, and reports webhook readiness.
//
// Only products and prices are written. No customer, subscription, payment intent, charge, refund or
// email is ever created by this function, and no switch is turned on: subscription checkout stays off
// until an administrator enables it deliberately.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveVisibilityActor, rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { planCatalog, planPriceLabel, DEFAULT_PLAN_PRODUCTS } from '../../shared/visibilityPlans.ts';
import {
  ensureStripePlans,
  matchStripePlans,
  inspectWebhooks,
  addWebhookEvents,
  stripeMode,
  REQUIRED_WEBHOOK_EVENTS,
} from '../../shared/stripePlanCatalog.ts';
import {
  applySubscriptionUpsert,
  applySubscriptionDeleted,
  applyInvoicePaid,
  applyInvoiceFailed,
  benefitsActive,
  shouldExpire,
  expirePatch,
} from '../../shared/visibilitySubscriptionEngine.ts';

const SEAT_KEY = 'brokerage_seat';
const SEAT_NAME = 'Arriv Brokerage Additional Seat';

function planTargets(plans) {
  const targets = plans.map((plan) => {
    const fallback = DEFAULT_PLAN_PRODUCTS.find((p) => p.product_key === plan.product_key) || {};
    const name = String(plan.name || fallback.name || plan.product_key);
    return {
      key: String(plan.product_key),
      name: name.startsWith('Arriv ') ? name : `Arriv ${name}`,
      description: String(plan.tagline || fallback.tagline || ''),
      amountCents: Number(plan.price_cents || 0),
      currency: String(plan.currency || fallback.currency || 'usd').toLowerCase(),
    };
  });

  // The additional brokerage seat is its own line item, priced from the stored plan record. The amount
  // is read from the application — never assumed here.
  const brokerage = plans.find((p) => p.product_key === 'brokerage');
  const seatCents = Number(brokerage?.additional_seat_price_cents || 0);
  if (String(brokerage?.seat_policy || '') === 'per_seat' && seatCents > 0) {
    targets.push({
      key: SEAT_KEY,
      name: SEAT_NAME,
      description: `One additional agent seat on the ${String(brokerage?.name || 'Brokerage')} plan, billed monthly.`,
      amountCents: seatCents,
      currency: String(brokerage?.currency || 'usd').toLowerCase(),
    });
  }

  return targets;
}

// The mapping the customer actually depends on: the price stored against a plan must be a monthly price
// for that plan's own amount. A wrong id here would bill the wrong amount.
function mappingProblems(plans, results) {
  const problems = [];
  for (const plan of plans) {
    const result = results.find((r) => r.plan_key === plan.product_key);
    if (result?.blocker) {
      problems.push(`${plan.product_key}: ${result.blocker}`);
      continue;
    }
    const priceId = String(result?.price_id || plan.stripe_price_id || '');
    if (!priceId) {
      problems.push(`${plan.product_key}: no Stripe price is attached, so this plan cannot be purchased.`);
      continue;
    }
    if (result && Number(result.amount_cents) !== Number(plan.price_cents)) {
      problems.push(`${plan.product_key}: Stripe charges ${planPriceLabel(result.amount_cents)} but the plan is configured at ${planPriceLabel(plan.price_cents)}.`);
    }
  }
  return problems;
}

function recordPayload(plan, result) {
  const payload = {
    product_key: String(plan.product_key),
    tier: String(plan.tier || plan.product_key),
    name: String(plan.name || ''),
    tagline: String(plan.tagline || ''),
    price_cents: Number(plan.price_cents || 0),
    currency: String(plan.currency || 'usd'),
    interval: String(plan.interval || 'month'),
    seats_included: Number(plan.seats_included ?? 1),
    additional_seat_price_cents: Number(plan.additional_seat_price_cents || 0),
    seat_policy: String(plan.seat_policy || 'included_only'),
    features: Array.isArray(plan.features) ? plan.features : [],
    entitlements: plan.entitlements || {},
    disclosure: String(plan.disclosure || ''),
    terms_version: String(plan.terms_version || ''),
    active: plan.active !== false,
    sort_order: Number(plan.sort_order || 0),
    updated_at: new Date().toISOString(),
  };
  if (result?.product_id) payload.stripe_product_id = String(result.product_id);
  if (result?.price_id) payload.stripe_price_id = String(result.price_id);
  return payload;
}

// Pure simulation of the webhook: the same engine functions the handler calls, fed synthetic Stripe
// objects. Nothing is written, no network call is made and no email is sent.
function simulateHandlers() {
  const checks = [];
  const add = (name, pass, detail = '') => checks.push({ name, pass, detail });

  const base = { subscription_id: 'vsub_test', status: 'pending_checkout', plan_key: 'agent_growth' };
  const now = Math.floor(Date.now() / 1000);
  const future = now + 30 * 86400;

  const created = applySubscriptionUpsert(base, {
    id: 'sub_sim_1', status: 'active', customer: 'cus_sim_1', current_period_start: now,
    current_period_end: future, cancel_at_period_end: false,
    items: { data: [{ price: { id: 'price_sim_growth', unit_amount: 9900 } }] },
  }, 'evt_sim_created');
  add('A new subscription activates the record', created.changed && created.patch.status === 'active');
  add('The subscription id is captured', created.patch.stripe_subscription_id === 'sub_sim_1');
  add('The billed price and amount are captured', created.patch.stripe_price_id === 'price_sim_growth' && created.patch.amount_cents === 9900);

  const afterCreate = { ...base, ...created.patch };
  const replay = applySubscriptionUpsert(afterCreate, { id: 'sub_sim_1', status: 'active' }, 'evt_sim_created');
  add('A redelivered event is applied once', replay.changed === false);

  const pastDue = applySubscriptionUpsert(afterCreate, { id: 'sub_sim_1', status: 'past_due', current_period_end: future }, 'evt_sim_past_due');
  add('A failed payment moves the subscription to past_due', pastDue.patch.status === 'past_due');

  const paid = applyInvoicePaid(afterCreate, {
    id: 'in_sim_1', amount_paid: 9900, currency: 'usd', status: 'paid',
    period_start: now, period_end: future, status_transitions: { paid_at: now },
  }, 'evt_sim_invoice_paid');
  add('A paid invoice activates the subscription', paid.patch.status === 'active');
  add('A paid invoice is recorded once in billing history', Array.isArray(paid.patch.billing_history) && paid.patch.billing_history.length === 1);

  const paidAgain = applyInvoicePaid({ ...afterCreate, ...paid.patch }, { id: 'in_sim_1', amount_paid: 9900, status: 'paid', period_end: future }, 'evt_sim_invoice_paid_2');
  add('The same invoice is never recorded twice', paidAgain.patch.billing_history.length === 1);

  const failed = applyInvoiceFailed(afterCreate, { id: 'in_sim_2', status: 'open' }, 'evt_sim_invoice_failed');
  add('A failed invoice moves the subscription to past_due', failed.patch.status === 'past_due');
  add('A failed invoice keeps a reason', !!failed.patch.last_failure_reason);

  const deleted = applySubscriptionDeleted(afterCreate, { id: 'sub_sim_1', status: 'canceled', ended_at: now }, 'evt_sim_deleted');
  add('A deleted subscription cancels the record', deleted.patch.status === 'canceled' && !!deleted.patch.ended_at);

  const late = applySubscriptionUpsert({ ...afterCreate, status: 'canceled' }, { id: 'sub_sim_1', status: 'active', current_period_end: future }, 'evt_sim_late_arrival');
  add('A late event never resurrects a canceled subscription', late.patch.status === undefined);

  add('Benefits are on only for an active, unexpired subscription',
    benefitsActive({ status: 'active', current_period_end: new Date(future * 1000).toISOString() }) === true);
  add('An expired period stops benefits',
    benefitsActive({ status: 'active', current_period_end: new Date((now - 86400) * 1000).toISOString() }) === false);
  add('An elapsed period is flagged for expiry',
    shouldExpire({ status: 'active', current_period_end: new Date((now - 86400) * 1000).toISOString() }) === true);
  add('Expiring ends the record without deleting it', expirePatch({}).status === 'expired');

  const failedChecks = checks.filter((c) => !c.pass);
  return { ok: !failedChecks.length, passed: checks.length - failedChecks.length, total: checks.length, checks };
}

async function safeWebhooks(expectedHost) {
  try {
    return await inspectWebhooks(expectedHost);
  } catch (error) {
    return { ok: false, endpoints: [], ready: false, blocker: String(error?.message || error) };
  }
}

function expectedHostOf() {
  return String((globalThis as any)?.process?.env?.BASE44_APP_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
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

    const action = String(body?.action || 'status');
    const switches = await readVisibilitySwitches(base44);
    const stored = rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50));
    const plans = planCatalog(stored);
    const targets = planTargets(plans);
    const expectedHost = expectedHostOf();

    if (action === 'verify_handlers') {
      const simulation = simulateHandlers();
      return jsonResponse({
        ok: simulation.ok,
        action,
        handlers: simulation,
        checkout_switch_enabled: switches.subscription_checkout === true,
        note: 'Synthetic Stripe event objects passed through the same engine the webhook uses. No record written, no network call, no email.',
      });
    }

    if (action === 'status') {
      let matched = { ok: false, results: [], blocker: '' };
      try {
        matched = await matchStripePlans(targets);
      } catch (error) {
        matched = { ok: false, results: [], blocker: String(error?.message || error) };
      }
      const rows = plans.map((plan) => {
        const result = matched.results.find((r) => r.plan_key === plan.product_key);
        return {
          product_key: plan.product_key,
          name: plan.name,
          amount_cents: Number(plan.price_cents || 0),
          amount_label: planPriceLabel(Number(plan.price_cents || 0)),
          stripe_product_id: result?.product_id || String(plan.stripe_product_id || ''),
          stripe_price_id: result?.price_id || String(plan.stripe_price_id || ''),
          found_in_stripe: !!result?.price_id,
          blocker: result?.blocker || '',
        };
      });
      return jsonResponse({
        ok: matched.ok || rows.every((r) => r.stripe_price_id),
        action,
        stripe_mode: stripeMode(),
        plans: rows,
        seat: targets.some((t) => t.key === SEAT_KEY)
          ? {
            applies: true,
            amount_cents: targets.find((t) => t.key === SEAT_KEY).amountCents,
            stripe_price_id: matched.results.find((r) => r.plan_key === SEAT_KEY)?.price_id || '',
          }
          : { applies: false, reason: 'The brokerage plan is not configured with a per-seat price.' },
        blocker: matched.blocker || '',
        webhooks: await safeWebhooks(expectedHost),
        switches: {
          subscription_checkout: switches.subscription_checkout === true,
          profile_publication: switches.profile_publication === true,
          geo_publication: switches.geo_publication === true,
          customer_notifications: switches.customer_notifications === true,
        },
        note: 'Read only. Nothing was created in Stripe and no plan record was changed.',
      });
    }

    if (action === 'enable_webhook_events') {
      // Adding events changes a live endpoint, so it needs an explicit confirmation in the request and
      // must never happen as a side effect of another action.
      if (String(body?.confirm || '') !== 'add-events') {
        return jsonResponse({
          ok: false,
          error: 'Refused. Pass confirm="add-events" to add the required events to the live endpoint.',
          required_events: REQUIRED_WEBHOOK_EVENTS,
        }, 400);
      }
      const before = await safeWebhooks(expectedHost);
      const result = await addWebhookEvents(REQUIRED_WEBHOOK_EVENTS);
      const after = await safeWebhooks(expectedHost);
      return jsonResponse({
        ok: result.ok && after.ready === true,
        action,
        required_events: REQUIRED_WEBHOOK_EVENTS,
        added_events: result.added,
        endpoint: result.endpoint,
        before,
        after,
        error: result.error,
      });
    }

    if (action !== 'configure') {
      return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
    }

    // ---- configure ---------------------------------------------------------------------------
    const provisioned = await ensureStripePlans(targets);
    const results = provisioned.results;
    const problems = mappingProblems(plans, results);
    const seatResult = results.find((r) => r.plan_key === SEAT_KEY) || null;
    const seatApplies = targets.some((t) => t.key === SEAT_KEY);

    // Store the ids on the plan records so checkout bills exactly what the plan shows.
    const written = [];
    for (const plan of plans) {
      const result = results.find((r) => r.plan_key === plan.product_key);
      if (!result?.price_id) continue;
      const payload = recordPayload(plan, result);
      if (plan.product_key === 'brokerage' && seatResult?.price_id) {
        payload.stripe_seat_price_id = String(seatResult.price_id);
      }
      const existingRecord = stored.find((r) => String(r.product_key) === String(plan.product_key));
      if (existingRecord) {
        await base44.asServiceRole.entities.VisibilityPlanProduct.update(existingRecord.id, payload);
      } else {
        await base44.asServiceRole.entities.VisibilityPlanProduct.create({
          ...payload,
          created_at: new Date().toISOString(),
          updated_by: actor.email || 'stripe-provisioning',
        });
      }
      written.push({
        product_key: plan.product_key,
        stripe_product_id: payload.stripe_product_id,
        stripe_price_id: payload.stripe_price_id,
        stripe_seat_price_id: payload.stripe_seat_price_id || '',
      });
    }

    return jsonResponse({
      ok: problems.length === 0 && provisioned.ok,
      action,
      stripe_mode: provisioned.mode,
      plans: results.map((r) => ({
        product_key: r.plan_key,
        product_name: r.requested_name,
        amount_cents: r.amount_cents,
        amount_label: planPriceLabel(r.amount_cents),
        currency: r.currency,
        stripe_product_id: r.product_id,
        stripe_price_id: r.price_id,
        product_created: r.product_created,
        price_created: r.price_created,
        matched_by: r.matched_by,
        blocker: r.blocker,
        recurring: 'month',
      })),
      seat: seatApplies
        ? {
          applies: true,
          stripe_product_id: seatResult?.product_id || '',
          stripe_price_id: seatResult?.price_id || '',
          amount_cents: seatResult?.amount_cents || 0,
          amount_label: planPriceLabel(seatResult?.amount_cents || 0),
        }
        : { applies: false, reason: 'The brokerage plan is not configured with a per-seat price.' },
      stored_on_plan_records: written,
      mapping_problems: problems,
      webhooks: await safeWebhooks(expectedHost),
      switches: {
        subscription_checkout: switches.subscription_checkout === true,
        customer_notifications: switches.customer_notifications === true,
      },
      safety: {
        subscriptions_created: 0,
        customers_created: 0,
        payment_intents_created: 0,
        charges_created: 0,
        emails_sent: 0,
        checkout_switch_unchanged: true,
      },
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});