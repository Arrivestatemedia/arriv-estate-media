import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';

/**
 * Entitlement gate for the Arriv Preferred Concierge.
 *
 * This is the only thing the browser asks before showing the premium portal. The
 * answer is derived server-side from the verified customer session, so a standard
 * customer cannot reveal the concierge by editing local storage, and buying a
 * visibility plan cannot unlock it.
 */

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ ok: false, reason: 'SESSION_REQUIRED', error: auth.error }, { status: auth.status });
    }

    const entitlement = await resolvePreferredEntitlement(base44, {
      email: auth.actor.email,
      accountId: auth.actor.account_id,
    });

    const unread = entitlement.active
      ? await base44.asServiceRole.entities.ConciergeNotice
        .count({ customer_email: auth.actor.email, read_at: { $exists: false } })
        .catch(() => 0)
      : 0;

    return Response.json({
      ok: true,
      preferred: entitlement.active === true,
      entitlement: {
        active: entitlement.active === true,
        reason: entitlement.reason,
        plan: entitlement.plan || '',
        status: entitlement.status || '',
        started_at: entitlement.started_at || '',
        current_period_end: entitlement.current_period_end || '',
        cancel_at_period_end: entitlement.cancel_at_period_end === true,
        monthly_price: Number(entitlement.monthly_price || 0),
        benefits: entitlement.benefits || [],
        concierge_enabled: entitlement.concierge_enabled !== false,
        video_enabled: entitlement.video_enabled !== false,
      },
      customer: {
        full_name: auth.actor.full_name,
        first_name: String(auth.actor.full_name || '').split(' ')[0] || '',
      },
      unread_notices: Number(unread || 0),
    });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}