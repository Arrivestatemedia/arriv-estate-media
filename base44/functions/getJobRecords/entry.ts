import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveRecordActor, contractorBoardQuery, canUseJobView } from '../../shared/recordAccess.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

/**
 * The only browser path to Job records.
 *
 * Job holds customer names, addresses, phone numbers, client pricing and
 * contractor pay, so direct entity reads are closed. Each caller gets one
 * server-chosen view, and a view they are not entitled to is refused:
 *
 *   contractor_board  contractor  open/booked jobs published to the board
 *   contractor_mine   contractor  jobs booked by this contractor
 *   client_mine       client      jobs for this client's own properties
 *   sales_list        sales       booking-sourced jobs (media delivery screens)
 *   sales_client      sales       booking-sourced jobs for one customer
 *   admin_list        admin       arbitrary query
 *   admin_one         admin       a single job by id
 *
 * The views an ordinary contractor can reach never include another customer's
 * job: the board is limited to from_booking open/booked gigs, and "mine" is
 * scoped to the session's own address.
 */

const MAX_LIMIT = 500;

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const actor = await resolveRecordActor(base44, req, body);
  if (!actor) {
    return Response.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const view = String(body.view || '');

  // Single gate for every view, shared with the certification harness so the
  // tested rule and the enforced rule cannot drift apart.
  if (!canUseJobView(actor.kind, view)) {
    return Response.json({ error: 'Not authorized for this view.' }, { status: 403 });
  }

  const jobs = base44.asServiceRole.entities.Job;
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), MAX_LIMIT);
  const sort = typeof body.sort === 'string' && body.sort ? body.sort : '-created_date';
  const clientEmail = String(body.client_email || '').trim().toLowerCase();

  const deny = () => Response.json({ error: 'Not authorized for this view.' }, { status: 403 });

  try {
    // ── Contractor: the board, and their own bookings ───────────────────────
    if (actor.kind === 'contractor') {
      if (view === 'contractor_board') {
        const items = await jobs.filter(contractorBoardQuery(body.status_filter), '-created_date', limit);
        return Response.json({ items: items || [] });
      }
      if (view === 'contractor_mine') {
        const items = await jobs.filter({ booked_by: actor.email }, sort, limit);
        return Response.json({ items: items || [] });
      }
      return deny();
    }

    // ── Client: only their own properties ───────────────────────────────────
    if (actor.kind === 'client') {
      if (view !== 'client_mine') return deny();

      const query: any = customerEmailQuery('client_email', actor.email);
      if (body.footage_only) query.footage_uploaded = true;
      if (body.status) query.status = String(body.status);

      const items = await jobs.filter(query, sort, limit);
      return Response.json({ items: items || [] });
    }

    // ── Sales: booking-sourced jobs only, never arbitrary records ───────────
    if (actor.kind === 'sales') {
      if (view === 'sales_list') {
        const items = await jobs.filter({ from_booking: true }, sort, limit);
        return Response.json({ items: items || [] });
      }
      if (view === 'sales_client') {
        if (!clientEmail) return Response.json({ items: [] });
        const items = await jobs.filter({ client_email: clientEmail }, sort, limit);
        return Response.json({ items: items || [] });
      }
      return deny();
    }

    // ── Admin: full access, plus any customer view for support ──────────────
    if (actor.kind === 'admin') {
      if (view === 'admin_one') {
        const id = String(body.job_id || '');
        if (!id) return Response.json({ items: [] });
        const record = await jobs.get(id).catch(() => null);
        return Response.json({ items: record ? [record] : [] });
      }
      if (view === 'admin_list') {
        const query = body.query && typeof body.query === 'object' ? body.query : {};
        const items = await jobs.filter(query, sort, limit);
        return Response.json({ items: items || [] });
      }
      if (view === 'sales_list') {
        const items = await jobs.filter({ from_booking: true }, sort, limit);
        return Response.json({ items: items || [] });
      }
      if (view === 'sales_client') {
        if (!clientEmail) return Response.json({ items: [] });
        const items = await jobs.filter({ client_email: clientEmail }, sort, limit);
        return Response.json({ items: items || [] });
      }
      if (view === 'client_mine' || view === 'contractor_mine') {
        const query = view === 'client_mine' ? { client_email: clientEmail } : { booked_by: clientEmail };
        if (!clientEmail) return Response.json({ items: [] });
        const items = await jobs.filter(query, sort, limit);
        return Response.json({ items: items || [] });
      }
      return deny();
    }

    return deny();
  } catch (error) {
    return Response.json({ error: (error as Error).message || 'Could not load jobs.' }, { status: 500 });
  }
}