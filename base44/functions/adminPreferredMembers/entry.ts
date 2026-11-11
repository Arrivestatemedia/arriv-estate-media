import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { verifyAdmin } from '../../shared/adminAuth.ts';
import {
  cancelPreferredMembershipNow,
  pickRep,
  rowsOf,
} from '../../shared/preferredCancellation.ts';

/**
 * Administrator control over Preferred memberships.
 *
 * `list`   – every membership, with the advisor on file and any open cancellation request.
 * `cancel` – ends the membership for real (Stripe subscription cancelled immediately).
 * `close`  – closes a cancellation request without cancelling, once the advisor has spoken
 *            to the customer.
 *
 * Every action re-checks the caller server-side; nothing here trusts the browser's flags.
 */

function requestView(request: any) {
  return {
    request_id: request.request_id,
    membership_id: request.membership_id,
    client_email: request.client_email,
    client_name: request.client_name || '',
    plan: request.plan || '',
    membership_status: request.membership_status || '',
    period_end: request.period_end || '',
    status: request.status || 'requested',
    requested_via: request.requested_via || '',
    utterance: request.utterance || '',
    sales_rep_name: request.sales_rep_name || '',
    sales_rep_email: request.sales_rep_email || '',
    sales_rep_phone: request.sales_rep_phone || '',
    email_sent_at: request.email_sent_at || '',
    sms_sent_at: request.sms_sent_at || '',
    notification_error: request.notification_error || '',
    handled_at: request.handled_at || '',
    handled_by: request.handled_by || '',
    handler_note: request.handler_note || '',
    created_at: request.created_at || request.created_date || '',
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const auth = await verifyAdmin(base44, body, new URL(req.url));
    if (!auth.authorized) {
      return Response.json({ ok: false, error: 'FORBIDDEN', message: 'Administrator access required.' }, { status: 403 });
    }
    const action = String(body?.action || 'list');

    if (action === 'list') {
      const [membershipsRaw, requestsRaw, repsRaw] = await Promise.all([
        base44.asServiceRole.entities.PreferredMembership.list('-created_date', 200),
        base44.asServiceRole.entities.PreferredCancellationRequest.filter({ status: 'requested' }, { sort: '-created_date', limit: 100 }),
        base44.asServiceRole.entities.SalesTeamMember.list('-created_date', 500).catch(() => []),
      ]);
      const memberships = rowsOf(membershipsRaw);
      const requests = rowsOf(requestsRaw).map(requestView);
      const reps = rowsOf(repsRaw);

      const openByMembership: Record<string, any> = {};
      for (const request of requests) {
        if (request.membership_id && !openByMembership[request.membership_id]) openByMembership[request.membership_id] = request;
      }

      return Response.json({
        ok: true,
        memberships: memberships.map((membership: any) => {
          const rep = pickRep(reps, membership);
          return {
            id: membership.id,
            client_email: membership.client_email || '',
            client_name: membership.client_name || '',
            plan: membership.plan || '',
            status: String(membership.status || '').toLowerCase(),
            billing_source: membership.billing_source || 'stripe',
            monthly_price: Number(membership.monthly_price || 0),
            started_at: membership.started_at || '',
            current_period_end: membership.current_period_end || '',
            cancelled_at: membership.cancelled_at || '',
            cancel_at_period_end: membership.cancel_at_period_end === true,
            sales_rep_name: rep.name,
            sales_rep_email: rep.email,
            sales_rep_phone: rep.phone,
            stripe_subscription_id: membership.stripe_subscription_id || '',
            open_request: openByMembership[membership.id] || null,
          };
        }),
        requests,
      });
    }

    if (action === 'cancel') {
      const membershipId = String(body?.membership_id || '').trim();
      const email = String(body?.email || '').trim().toLowerCase();
      let membership: any = null;
      if (membershipId) {
        membership = await base44.asServiceRole.entities.PreferredMembership.get(membershipId).catch(() => null);
      }
      if (!membership && email) {
        const found = rowsOf(await base44.asServiceRole.entities.PreferredMembership
          .filter({ client_email: email }, { sort: '-created_date', limit: 10 }).catch(() => []));
        membership = found.find((record: any) => ['active', 'trialing', 'past_due', 'paused'].includes(String(record.status || '').toLowerCase()))
          || found[0]
          || null;
      }
      if (!membership) {
        return Response.json({ ok: false, error: 'MEMBERSHIP_NOT_FOUND', message: 'No membership matches that.' }, { status: 404 });
      }

      const result = await cancelPreferredMembershipNow(base44, membership, {
        actorEmail: auth.actorEmail || 'administrator',
        reason: String(body?.reason || '').trim() || 'Membership cancelled by Arriv.',
      });

      return Response.json({
        ok: true,
        membership_id: membership.id,
        client_email: membership.client_email || '',
        stripe_cancelled: result.stripe_cancelled,
        stripe_error: result.stripe_error,
        note: result.stripe_error
          ? `The membership is now cancelled in Arriv, but Stripe did not confirm the subscription cancellation: ${result.stripe_error}`
          : 'Membership cancelled. Preferred access has ended.',
      });
    }

    if (action === 'close') {
      const requestId = String(body?.request_id || '').trim();
      if (!requestId) return Response.json({ ok: false, error: 'REQUEST_REQUIRED' }, { status: 400 });
      const request = rowsOf(await base44.asServiceRole.entities.PreferredCancellationRequest
        .filter({ request_id: requestId }, { limit: 1 }))[0];
      if (!request) return Response.json({ ok: false, error: 'REQUEST_NOT_FOUND' }, { status: 404 });
      const decision = String(body?.decision || 'closed');
      if (!['closed', 'declined'].includes(decision)) {
        return Response.json({ ok: false, error: 'INVALID_DECISION' }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.PreferredCancellationRequest.update(request.id, {
        status: decision,
        handled_at: new Date().toISOString(),
        handled_by: String(auth.actorEmail || 'administrator'),
        handler_note: String(body?.note || '').trim() || 'Handled by Arriv.',
      });
      return Response.json({ ok: true, request: requestView(updated), note: 'Request closed. The membership is unchanged.' });
    }

    return Response.json({ ok: false, error: 'UNKNOWN_ACTION' }, { status: 400 });
  } catch (error: any) {
    console.error('adminPreferredMembers error:', error);
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}