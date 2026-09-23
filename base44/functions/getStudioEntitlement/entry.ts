import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Verifies the authenticated user's Arriv Studio for Real Estate entitlement.
// This is the backend security gate — UI tab visibility is NOT the security boundary.
// Returns active/inactive, plan, minutes, and entitlement source.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', active: false }, { status: 401 });

    const clientEmail = (user.email || '').toLowerCase();

    // Look up active subscription
    const subs = await base44.asServiceRole.entities.ArrivStudioSubscription.filter({
      client_email: clientEmail,
      status: 'active',
    });

    const subscription = subs && subs.length > 0 ? subs[0] : null;

    if (!subscription) {
      return Response.json({
        active: false,
        plan_id: null,
        plan_name: null,
        monthly_minutes: 0,
        minutes_remaining: 0,
        minutes_used: 0,
        organization_id: null,
        entitlement_source: null,
        entitlement_overrides: null,
      });
    }

    const planMinutes = subscription.production_minutes_per_month || 0;
    const bonusMinutes = subscription.entitlement_overrides?.studio_included_minutes_bonus || 0;
    const totalMinutes = planMinutes + bonusMinutes;

    return Response.json({
      active: true,
      plan_id: subscription.plan_id,
      plan_name: subscription.plan_name,
      monthly_minutes: totalMinutes,
      minutes_remaining: subscription.minutes_remaining ?? 0,
      minutes_used: subscription.minutes_used_this_period ?? 0,
      organization_id: subscription.organization_id,
      entitlement_source: 'ESTATE_MEDIA_SUBSCRIPTION',
      entitlement_overrides: subscription.entitlement_overrides || null,
      subscription_id: subscription.id,
      current_period_end: subscription.current_period_end,
    });
  } catch (error) {
    return Response.json({ error: error.message, active: false }, { status: 500 });
  }
}