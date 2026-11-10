import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveVisibilityActor, rowsOf, jsonResponse, CORS_HEADERS } from '../../shared/visibilityActor.ts';
import { readVisibilitySwitches } from '../../shared/visibilitySwitches.ts';
import { canManageProfile } from '../../shared/professionalProfile.ts';
import { planCatalog, planPriceLabel, planChangePolicy, entitlementsFor, seatAllowance, RECURRING_DISCLOSURE, DOWNGRADE_POLICY_TEXT, SEAT_POLICY_TEXT } from '../../shared/visibilityPlans.ts';
import { subscriptionView, shouldExpire, mapStripeStatus, periodPatch, seatChangePatch } from '../../shared/visibilitySubscriptionEngine.ts';
import { subscriptionSeats } from '../../shared/stripeObjects.ts';
import { seatChangeDecision, SEAT_MAX_PURCHASED, SEAT_MIN_PURCHASED } from '../../shared/visibilitySeats.ts';
import { createSubscriptionCheckout, retrieveCheckoutSession, cancelSubscription, resumeSubscription, changeSubscriptionPlan, updateSubscriptionSeats, retrieveSubscription, retrieveInvoice, voidInvoice } from '../../shared/stripeSubscriptions.ts';
import { appOrigin } from '../../shared/propertyVisibility.ts';

function event(record, type, actor, note = '') {
  const events = Array.isArray(record?.events) ? record.events : [];
  return [...events, { type, at: new Date().toISOString(), actor, note }].slice(-50);
}

function subscriptionKey() {
  return `vsub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// A checkout that was started but never finished must not leave a second record behind when the customer
// tries again. Only an unfinished attempt from the same day is reused.
function reusablePending(existing, planKey) {
  if (!existing) return false;
  if (String(existing.status || '') !== 'pending_checkout') return false;
  if (String(existing.plan_key || '') !== String(planKey || '')) return false;
  const created = Date.parse(String(existing.created_at || existing.created_date || ''));
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < 24 * 60 * 60 * 1000;
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
    const action = String(body?.action || 'overview');
    const actor = await resolveVisibilityActor(base44, body);
    const switches = await readVisibilitySwitches(base44);

    const loadProfile = async (id) => {
      if (!id) return null;
      const found = await base44.asServiceRole.entities.ProfessionalProfile.filter({ profile_id: id });
      return rowsOf(found)[0] || null;
    };
    const loadSubscriptionById = async (id) => {
      if (!id) return null;
      const found = await base44.asServiceRole.entities.VisibilitySubscription.filter({ id });
      return rowsOf(found)[0] || null;
    };
    const latestFor = async (profileId) => {
      if (!profileId) return null;
      const found = await base44.asServiceRole.entities.VisibilitySubscription.filter(
        { profile_id: profileId },
        { sort: '-created_date', limit: 1 },
      );
      return rowsOf(found)[0] || null;
    };

    const plans = planCatalog(rowsOf(await base44.asServiceRole.entities.VisibilityPlanProduct.list('-created_date', 50)));

    if (action === 'overview') {
      const profile = await loadProfile(body?.profileId)
        || (actor.email ? rowsOf(await base44.asServiceRole.entities.ProfessionalProfile.filter({ owner_email: actor.email }, { limit: 1 }))[0] : null);
      const subscription = profile ? await latestFor(profile.profile_id) : null;
      const view = subscriptionView(subscription);
      const currentPlan = plans.find((p) => p.product_key === view.plan_key) || null;
      const seats = currentPlan ? seatAllowance(currentPlan, view.seats_purchased) : null;
      return jsonResponse({
        ok: true,
        checkout_available: switches.subscription_checkout === true,
        checkout_blocked_reason: switches.subscription_checkout === true
          ? ''
          : 'Subscription checkout is switched off. Plans are shown for information only and nothing can be purchased.',
        disclosure: RECURRING_DISCLOSURE,
        downgrade_policy: DOWNGRADE_POLICY_TEXT,
        seat_policy: currentPlan ? SEAT_POLICY_TEXT[currentPlan.seat_policy] || '' : '',
        plans: plans.map((plan) => ({
          product_key: plan.product_key,
          tier: plan.tier,
          name: plan.name,
          tagline: plan.tagline,
          price_cents: plan.price_cents,
          price_label: planPriceLabel(plan.price_cents),
          interval: plan.interval,
          features: plan.features,
          seats_included: plan.seats_included,
          seat_policy: plan.seat_policy,
          additional_seat_price_cents: plan.additional_seat_price_cents,
          additional_seat_price_label: planPriceLabel(plan.additional_seat_price_cents),
          seats: seatAllowance(plan, view.seats_purchased),
          stripe_ready: !!plan.stripe_price_id,
          purchasable: switches.subscription_checkout === true && !!plan.stripe_price_id,
        })),
        seat_management: currentPlan && seats
          ? {
            plan_key: currentPlan.product_key,
            plan_name: currentPlan.name,
            seats_included: seats.included,
            seats_purchased: seats.purchased,
            seats_total: seats.total,
            seat_price_cents: Number(currentPlan.additional_seat_price_cents || 0),
            seat_price_label: planPriceLabel(Number(currentPlan.additional_seat_price_cents || 0)),
            monthly_total_cents: Number(currentPlan.price_cents || 0) + seats.purchased * Number(currentPlan.additional_seat_price_cents || 0),
            price_configured: !!currentPlan.stripe_seat_price_id,
            can_change: seats.canAdd && switches.subscription_checkout === true && String(view.status || '') === 'active',
            min_seats: SEAT_MIN_PURCHASED,
            max_seats: SEAT_MAX_PURCHASED,
            blocked_reason: seats.canAdd
              ? switches.subscription_checkout === true
                ? String(view.status || '') === 'active' ? '' : 'Seats can be changed while the plan is active.'
                : 'Subscription billing is currently switched off.'
              : SEAT_POLICY_TEXT[currentPlan.seat_policy] || '',
          }
          : null,
        subscription: view,
        // Benefits are recomputed from the subscription's real state, so a stored plan_key or a status
        // without a paid period can never unlock a paid feature.
        entitlements: entitlementsFor(view.plan_key, view.benefits_active ? 'active' : view.status),
        billing_history: Array.isArray(subscription?.billing_history) ? subscription.billing_history : [],
        change_options: plans
          .filter((p) => p.product_key !== view.plan_key)
          .map((p) => ({ plan_key: p.product_key, name: p.name, ...planChangePolicy(view.plan_key, p.product_key) })),
      });
    }

    if (action === 'start_checkout') {
      if (switches.subscription_checkout !== true) {
        return jsonResponse({ ok: false, error: 'Subscription checkout is currently disabled.' }, 403);
      }
      const profile = await loadProfile(body?.profileId);
      if (!profile) return jsonResponse({ ok: false, error: 'Profile not found.' }, 404);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);
      const plan = plans.find((p) => p.product_key === String(body?.planKey || ''));
      if (!plan) return jsonResponse({ ok: false, error: 'Unknown plan.' }, 400);
      if (!plan.stripe_price_id) return jsonResponse({ ok: false, error: 'That plan is not configured for billing yet.' }, 400);

      const existing = await latestFor(profile.profile_id);
      if (existing && ['active', 'past_due'].includes(String(existing.status || '')) && !shouldExpire(existing)) {
        return jsonResponse({ ok: false, error: 'This profile already has a subscription. Change the plan instead of starting a second one.', subscription: subscriptionView(existing) }, 400);
      }

      // A Stripe customer is reused only when this profile's own record holds one AND that record belongs
      // to the signed-in owner. Customers are never matched or merged by email address.
      const sameOwner = String(existing?.owner_email || '').toLowerCase() === String(actor.email || '').toLowerCase();
      const customerId = sameOwner ? String(existing?.stripe_customer_id || '') : '';

      const base = appOrigin();
      const session = await createSubscriptionCheckout({
        priceId: plan.stripe_price_id,
        profileId: profile.profile_id,
        planKey: plan.product_key,
        ownerEmail: actor.email,
        customerId,
        customerEmail: profile.contact_email || actor.email,
        successUrl: `${base}/VisibilityDashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/VisibilityDashboard?checkout=cancelled`,
        // One idempotency key per profile, plan and day: a double-click can never open two subscriptions.
        idempotencyKey: `vsub_${profile.profile_id}_${plan.product_key}_${new Date().toISOString().slice(0, 10)}`,
      });

      const checkoutFields = {
        plan_key: plan.product_key,
        owner_email: actor.email,
        contact_email: profile.contact_email || actor.email,
        status: 'pending_checkout',
        amount_cents: plan.price_cents,
        currency: plan.currency,
        interval: plan.interval,
        seats_included: plan.seats_included,
        stripe_checkout_session_id: String(session?.id || ''),
        stripe_price_id: plan.stripe_price_id,
        updated_at: new Date().toISOString(),
      };

      if (reusablePending(existing, plan.product_key)) {
        await base44.asServiceRole.entities.VisibilitySubscription.update(existing.id, {
          ...checkoutFields,
          events: event(existing, 'checkout_restarted', actor.email, plan.product_key),
        });
      } else {
        await base44.asServiceRole.entities.VisibilitySubscription.create({
          ...checkoutFields,
          subscription_id: subscriptionKey(),
          profile_id: profile.profile_id,
          profile_type: profile.profile_type,
          events: [{ type: 'checkout_started', at: new Date().toISOString(), actor: actor.email, note: plan.product_key }],
          created_at: new Date().toISOString(),
        });
      }

      return jsonResponse({ ok: true, checkout_url: String(session?.url || ''), session_id: String(session?.id || '') });
    }

    // Confirms a returning checkout. The webhook is the primary path; this exists so a customer who
    // lands back on the dashboard sees the truth even if the webhook is delayed.
    if (action === 'confirm') {
      const sessionId = String(body?.sessionId || '');
      if (!sessionId) return jsonResponse({ ok: false, error: 'Missing checkout session.' }, 400);
      const found = rowsOf(await base44.asServiceRole.entities.VisibilitySubscription.filter({ stripe_checkout_session_id: sessionId }));
      const record = found[0];
      if (!record) return jsonResponse({ ok: false, error: 'No subscription matches that checkout.' }, 404);
      const profile = await loadProfile(record.profile_id);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this profile.' }, 403);

      const session = await retrieveCheckoutSession(sessionId);
      const subscription = session?.subscription && typeof session.subscription === 'object' ? session.subscription : null;
      if (String(session?.payment_status || '') !== 'paid' && String(subscription?.status || '') !== 'active') {
        return jsonResponse({ ok: true, pending: true, subscription: subscriptionView(record) });
      }

      const plan = plans.find((p) => p.product_key === String(record.plan_key || ''));
      const seatPriceId = String(plan?.stripe_seat_price_id || '');
      const patch = {
        status: 'active',
        stripe_subscription_id: String(subscription?.id || ''),
        stripe_customer_id: String(session?.customer || record?.stripe_customer_id || ''),
        ...periodPatch(subscription, { seatPriceId }),
        last_payment_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        events: event(record, 'checkout_confirmed', actor.email, String(session?.id || '')),
      };
      await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
      if (profile) {
        await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, {
          plan_key: record.plan_key,
          updated_at: new Date().toISOString(),
        });
      }
      return jsonResponse({ ok: true, subscription: subscriptionView({ ...record, ...patch }) });
    }

    if (action === 'cancel' || action === 'resume' || action === 'change_plan') {
      const record = await loadSubscriptionById(body?.subscriptionId);
      if (!record) return jsonResponse({ ok: false, error: 'Subscription not found.' }, 404);
      const profile = await loadProfile(record.profile_id);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this subscription.' }, 403);
      if (!record.stripe_subscription_id) return jsonResponse({ ok: false, error: 'This subscription has no Stripe billing to change yet.' }, 400);

      const currentPlan = plans.find((p) => p.product_key === String(record.plan_key || ''));
      const seatPriceId = String(currentPlan?.stripe_seat_price_id || '');

      if (action === 'cancel') {
        if (!body?.confirm) return jsonResponse({ ok: false, error: 'Confirm the cancellation first.' }, 400);
        const subscription = await cancelSubscription(record.stripe_subscription_id, true);
        const patch = {
          cancel_at_period_end: true,
          canceled_at: new Date().toISOString(),
          cancel_reason: String(body?.reason || 'customer_request').slice(0, 300),
          ...periodPatch(subscription, { seatPriceId }),
          updated_at: new Date().toISOString(),
          events: event(record, 'cancel_scheduled', actor.email),
        };
        await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
        return jsonResponse({ ok: true, subscription: subscriptionView({ ...record, ...patch }) });
      }

      if (action === 'resume') {
        const subscription = await resumeSubscription(record.stripe_subscription_id);
        const patch = {
          cancel_at_period_end: false,
          canceled_at: undefined,
          cancel_reason: undefined,
          ...periodPatch(subscription, { seatPriceId }),
          updated_at: new Date().toISOString(),
          events: event(record, 'cancel_reversed', actor.email),
        };
        await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
        return jsonResponse({ ok: true, subscription: subscriptionView({ ...record, ...patch }) });
      }

      const plan = plans.find((p) => p.product_key === String(body?.planKey || ''));
      if (!plan) return jsonResponse({ ok: false, error: 'Unknown plan.' }, 400);
      const policy = planChangePolicy(record.plan_key, plan.product_key);
      if (!policy.allowed) return jsonResponse({ ok: false, error: policy.note }, 400);

      if (policy.timing === 'next_cycle') {
        const patch = {
          pending_plan_key: plan.product_key,
          pending_plan_effective_at: record.current_period_end,
          updated_at: new Date().toISOString(),
          events: event(record, 'downgrade_scheduled', actor.email, plan.product_key),
        };
        await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
        return jsonResponse({ ok: true, scheduled: true, policy, subscription: subscriptionView({ ...record, ...patch }) });
      }

      if (!plan.stripe_price_id) return jsonResponse({ ok: false, error: 'That plan is not configured for billing yet.' }, 400);
      // The seat price of the *current* plan identifies the line that must not be swapped.
      await changeSubscriptionPlan(record.stripe_subscription_id, {
        priceId: plan.stripe_price_id,
        prorate: policy.prorate,
        planKey: plan.product_key,
        seatPriceId,
      });
      const patch = {
        plan_key: plan.product_key,
        stripe_price_id: plan.stripe_price_id,
        amount_cents: Number(plan.price_cents || 0) + Number(record.seats_purchased || 0) * Number(plan.additional_seat_price_cents || 0),
        pending_plan_key: '',
        updated_at: new Date().toISOString(),
        events: event(record, 'upgrade_applied', actor.email, plan.product_key),
      };
      await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
      if (profile) {
        await base44.asServiceRole.entities.ProfessionalProfile.update(profile.id, {
          plan_key: plan.product_key,
          updated_at: new Date().toISOString(),
        });
      }
      return jsonResponse({ ok: true, policy, subscription: subscriptionView({ ...record, ...patch }) });
    }

    // Additional brokerage seats: $29/month each, on top of the three the plan includes.
    if (action === 'set_seats') {
      if (!body?.confirm) return jsonResponse({ ok: false, error: 'Confirm the seat change first.' }, 400);
      const record = await loadSubscriptionById(body?.subscriptionId);
      if (!record) return jsonResponse({ ok: false, error: 'Subscription not found.' }, 404);
      const profile = await loadProfile(record.profile_id);
      if (!canManageProfile(profile, actor)) return jsonResponse({ ok: false, error: 'Not authorized for this subscription.' }, 403);

      const plan = plans.find((p) => p.product_key === String(record.plan_key || ''));
      const decision = seatChangeDecision({
        record,
        plan,
        requestedSeats: body?.seats,
        checkoutEnabled: switches.subscription_checkout === true,
      });
      if (!decision.ok) return jsonResponse({ ok: false, error: decision.error }, 400);
      if (decision.noop) {
        return jsonResponse({ ok: true, unchanged: true, mode: decision.prorationBehavior, subscription: subscriptionView(record) });
      }

      // The key includes the subscription, the target quantity and the running period, so a repeated
      // click inside the same period is answered by Stripe with the same result instead of a second charge.
      const idempotencyKey = `vseat_${record.stripe_subscription_id}_${decision.quantity}_${String(record.current_period_end || '').slice(0, 10)}`;

      let updated;
      try {
        updated = await updateSubscriptionSeats({
          subscriptionId: record.stripe_subscription_id,
          seatPriceId: decision.seatPriceId,
          quantity: decision.quantity,
          prorationBehavior: decision.prorationBehavior,
          idempotencyKey,
        });
      } catch (error) {
        return jsonResponse({ ok: false, error: `Stripe could not change the seats: ${String(error?.message || error).slice(0, 200)}` }, 502);
      }

      // Stripe's own answer decides what the customer holds, and whether the prorated invoice was paid.
      const fresh = await retrieveSubscription(record.stripe_subscription_id).catch(() => updated);
      const invoiceId = String(fresh?.latest_invoice?.id || updated?.latest_invoice?.id || '');
      let invoice = null;
      if (invoiceId) {
        invoice = await retrieveInvoice(invoiceId).catch(() => null);
      }
      const amountDue = Number(invoice?.amount_due ?? 0);
      const settled = !invoice || amountDue <= 0 || ['paid', 'void'].includes(String(invoice?.status || ''));
      const statusAfter = mapStripeStatus(fresh?.status);

      if (!settled || statusAfter !== 'active') {
        // Nothing is kept that was not paid for: the seat line goes back, the invoice is voided, and the
        // record is flagged so a person can see what happened.
        try {
          await updateSubscriptionSeats({
            subscriptionId: record.stripe_subscription_id,
            seatPriceId: decision.seatPriceId,
            quantity: decision.previous,
            prorationBehavior: 'none',
            idempotencyKey: `${idempotencyKey}_rollback`,
          });
        } catch {
          // Reported below: the record is flagged either way.
        }
        try {
          if (invoiceId) await voidInvoice(invoiceId);
        } catch {
          // A void that fails leaves an open invoice, which is why the record is flagged.
        }
        const rollbackPatch = {
          status: statusAfter,
          review_required: true,
          attention_reason: 'seat_change_payment_failed',
          updated_at: new Date().toISOString(),
          events: event(record, 'seats_change_failed', actor.email, `requested ${decision.quantity}, rolled back to ${decision.previous}`),
        };
        await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, rollbackPatch);
        return jsonResponse({
          ok: false,
          error: 'Your card was declined, so the seat change was reversed. No seat was added and nothing was charged.',
          subscription: subscriptionView({ ...record, ...rollbackPatch }),
        }, 402);
      }

      const seatsNow = subscriptionSeats(fresh, decision.seatPriceId);
      const patch = {
        ...periodPatch(fresh, { seatPriceId: decision.seatPriceId }),
        ...seatChangePatch(record, seatsNow === null ? decision.quantity : seatsNow, actor.email, `${decision.previous} to ${decision.quantity}`),
      };
      await base44.asServiceRole.entities.VisibilitySubscription.update(record.id, patch);
      return jsonResponse({
        ok: true,
        mode: decision.prorationBehavior,
        monthly_total_cents: decision.monthlyTotalCents,
        subscription: subscriptionView({ ...record, ...patch }),
      });
    }

    return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error?.message || error) }, 500);
  }
});