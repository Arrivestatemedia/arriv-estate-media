import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveRecordActor } from '../../shared/recordAccess.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

/**
 * The browser path to a customer's OWN Booking records.
 *
 * Booking is closed to browsers (its read rule is administrator-only), so the customer portal used
 * to read it directly and received a 401. Every read now goes through here:
 *
 *   client  -> only rows whose client_email is the signed-in session's own address
 *   admin   -> every booking (the staff screens)
 *   sales   -> every booking (the media-delivery screens)
 *
 * Identity is re-derived from the server-verifiable credential; nothing here trusts an email the
 * browser sends. A single-booking read is ownership-checked before anything is returned, so one
 * customer can never pull another customer's order.
 */

const SAFE_FIELDS = [
  'id',
  'property_address',
  'street_address',
  'city',
  'state',
  'package',
  'add_ons',
  'status',
  'preferred_date',
  'preferred_time',
  'notes',
  'total_price',
  'custom_price_text',
  'request_pay_at_closing',
  'property_sqft',
  'sales_member_id',
  'payAtClosing',
  'created_date',
  'updated_date',
];

function safeBooking(record: any) {
  const out: any = {};
  SAFE_FIELDS.forEach((key) => {
    if (record && record[key] !== undefined) out[key] = record[key];
  });
  return out;
}

export default async function (req: Request) {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const actor = await resolveRecordActor(base44, req, body);
  if (!actor) {
    return Response.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!['client', 'admin', 'sales'].includes(actor.kind)) {
    return Response.json({ error: 'Not authorized for this view.' }, { status: 403 });
  }

  const bookings = base44.asServiceRole.entities.Booking;
  const bookingId = String(body.bookingId || '').trim();

  try {
    if (bookingId) {
      const record: any = await bookings
        .get(bookingId)
        .catch((error: any) => (error?.status === 404 ? null : Promise.reject(error)));
      if (!record) {
        return Response.json({ error: 'Booking not found.' }, { status: 404 });
      }
      const owns = [record.client_email, record.ordering_user_email].some((email) => String(email || '').trim().toLowerCase() === actor.email);
      if (actor.kind !== 'admin' && !owns) {
        return Response.json({ error: 'Not authorized for this booking.' }, { status: 403 });
      }
      return Response.json({ booking: safeBooking(record) });
    }

    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);

    if (actor.kind === 'admin' || actor.kind === 'sales') {
      const rows = await bookings.list('-created_date', limit);
      return Response.json({ items: (rows || []).map(safeBooking) });
    }

    // Match both verified ownership fields, including mixed-case historical orders,
    // in ONE scoped query. Never scan other customers' bookings as a fallback.
    const page = await bookings.filter({ $or: [
      customerEmailQuery('client_email', actor.email),
      customerEmailQuery('ordering_user_email', actor.email),
    ] }, { sort: '-created_date', limit, ...(body.cursor ? { cursor: body.cursor } : {}) });
    return Response.json({ items: page.items.map(safeBooking), next_cursor: page.next_cursor, has_more: page.has_more });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Could not load bookings.' }, { status: 500 });
  }
}