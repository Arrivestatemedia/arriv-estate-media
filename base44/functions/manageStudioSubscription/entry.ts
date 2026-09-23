import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Subscribe, cancel, or manage an Arriv Studio for Real Estate subscription.
// Admins can also set entitlement overrides (Preferred membership hooks).

const PLAN_DETAILS = {
  studio_creator: { name: 'Studio for Real Estate — Creator', priceCents: 4900, minutes: 5 },
  studio_pro: { name: 'Studio for Real Estate — Pro', priceCents: 9900, minutes: 15 },
  studio_brokerage: { name: 'Studio for Real Estate — Brokerage', priceCents: 24900, minutes: 40 },
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, plan_id, entitlement_overrides, subscription_id } = body;

    const clientEmail = (user.email || '').toLowerCase();

    if (action === 'subscribe') {
      if (!plan_id || !PLAN_DETAILS[plan_id]) {
        return Response.json({ error: 'Invalid plan_id' }, { status: 400 });
      }
      const plan = PLAN_DETAILS[plan_id];
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      // Check for existing active subscription
      const existing = await base44.asServiceRole.entities.ArrivStudioSubscription.filter({
        client_email: clientEmail,
        status: 'active',
      });

      if (existing && existing.length > 0) {
        const sub = existing[0];
        if (sub.plan_id === plan_id) {
          return Response.json({ error: 'You already have this subscription', subscription: sub }, { status: 409 });
        }
        // Upgrade/downgrade: update existing
        const updated = await base44.asServiceRole.entities.ArrivStudioSubscription.update(sub.id, {
          plan_id,
          plan_name: plan.name,
          monthly_price_cents: plan.priceCents,
          production_minutes_per_month: plan.minutes,
          minutes_remaining: plan.minutes,
          minutes_used_this_period: 0,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        });
        return Response.json({ success: true, subscription: updated, action: 'changed' });
      }

      // Create new subscription
      const subscription = await base44.asServiceRole.entities.ArrivStudioSubscription.create({
        client_email: clientEmail,
        client_name: user.full_name || user.email,
        organization_id: `estate_media_${clientEmail}`,
        plan_id,
        plan_name: plan.name,
        monthly_price_cents: plan.priceCents,
        production_minutes_per_month: plan.minutes,
        minutes_remaining: plan.minutes,
        minutes_used_this_period: 0,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        entitlement_overrides: null,
        created_at: now.toISOString(),
      });

      return Response.json({ success: true, subscription, action: 'created' });
    }

    if (action === 'cancel') {
      const subs = await base44.asServiceRole.entities.ArrivStudioSubscription.filter({
        client_email: clientEmail,
        status: 'active',
      });
      if (!subs || subs.length === 0) {
        return Response.json({ error: 'No active subscription found' }, { status: 404 });
      }
      const sub = subs[0];
      const updated = await base44.asServiceRole.entities.ArrivStudioSubscription.update(sub.id, {
        status: 'canceled',
        canceled_at: new Date().toISOString(),
      });
      return Response.json({ success: true, subscription: updated, action: 'canceled' });
    }

    if (action === 'get') {
      const subs = await base44.asServiceRole.entities.ArrivStudioSubscription.filter({
        client_email: clientEmail,
        status: 'active',
      });
      return Response.json({
        success: true,
        subscription: subs && subs.length > 0 ? subs[0] : null,
      });
    }

    if (action === 'set_entitlements') {
      // Admin-only: set Preferred membership entitlement overrides
      if (user.role !== 'admin') {
        return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
      }
      if (!subscription_id) {
        return Response.json({ error: 'subscription_id required' }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.ArrivStudioSubscription.update(subscription_id, {
        entitlement_overrides: entitlement_overrides || null,
      });
      return Response.json({ success: true, subscription: updated, action: 'entitlements_updated' });
    }

    return Response.json({ error: 'Unknown action. Use: subscribe, cancel, get, set_entitlements' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}