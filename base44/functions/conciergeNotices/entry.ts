import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

/**
 * Proactive white-glove notices for Preferred members.
 *
 * Every notice is derived from a real record the customer already owns: a delivered job,
 * an appointment inside three days, an unpaid invoice, an unused benefit, or recorded
 * property traffic. Nothing is generated, guessed or sent anywhere — this function only
 * queues what the portal shows, deduplicated by the source record so the same event can
 * never appear twice.
 */

function rowsOf(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function addressOf(record: any) {
  const street = String(record?.property_address || record?.street_address || record?.location || '').trim();
  return street || 'your property';
}

function noticeId() {
  return `cntc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

async function derive(base44: any, email: string, entitlement: any) {
  const [jobs, bookings, invoices, listings] = await Promise.all([
    base44.asServiceRole.entities.Job.filter(customerEmailQuery('client_email', email), { sort: '-created_date', limit: 40 }).then(rowsOf).catch(() => []),
    base44.asServiceRole.entities.Booking.filter(
      { $or: [customerEmailQuery('client_email', email), customerEmailQuery('ordering_user_email', email)] },
      { sort: '-created_date', limit: 60 },
    ).then(rowsOf).catch(() => []),
    base44.asServiceRole.entities.Invoice.filter(customerEmailQuery('client_email', email), { sort: '-created_date', limit: 40 }).then(rowsOf).catch(() => []),
    base44.asServiceRole.entities.PropertyListing.filter(customerEmailQuery('client_email', email), { sort: '-updated_at', limit: 40 }).then(rowsOf).catch(() => []),
  ]);

  const stamp = today();
  const soon = inDays(3);
  const candidates: any[] = [];

  for (const job of jobs) {
    const delivered = job.delivered_to_customer === true || String(job.delivery_status || '') === 'delivered';
    if (!delivered) continue;
    const deliveredAt = new Date(job.delivered_at || job.completed_at || job.updated_date || 0).getTime();
    if (!Number.isFinite(deliveredAt) || Date.now() - deliveredAt > 60 * 86400000) continue;
    candidates.push({
      kind: 'media_ready',
      title: 'Your media is ready',
      body: `The photographs and video for ${addressOf(job)} have been delivered and are ready to download.`,
      severity: 'info',
      source_type: 'Job',
      source_id: String(job.id),
      action_hint: 'open_gallery',
      dedupe_key: `${email}|media_ready|${job.id}`,
    });
  }

  for (const booking of bookings) {
    const date = String(booking.preferred_date || '');
    if (!date || date < stamp || date > soon) continue;
    if (String(booking.status || '') === 'cancelled') continue;
    candidates.push({
      kind: 'appointment_attention',
      title: 'A shoot needs your attention',
      body: `${addressOf(booking)} is booked for ${date}${booking.preferred_time ? ` at ${booking.preferred_time}` : ''}. Confirming property access now avoids a delay on the day.`,
      severity: 'attention',
      source_type: 'Booking',
      source_id: String(booking.id),
      action_hint: 'list_bookings',
      dedupe_key: `${email}|appointment_attention|${booking.id}`,
    });
  }

  for (const invoice of invoices) {
    if (String(invoice.payment_status || '') === 'paid') continue;
    const created = new Date(invoice.created_date || 0).getTime();
    if (!Number.isFinite(created) || Date.now() - created > 90 * 86400000) continue;
    candidates.push({
      kind: 'invoice_outstanding',
      title: 'An invoice is outstanding',
      body: `Invoice ${invoice.invoice_number || ''} for ${Number(invoice.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} is still unpaid.`,
      severity: 'attention',
      source_type: 'Invoice',
      source_id: String(invoice.id),
      action_hint: 'list_invoices',
      dedupe_key: `${email}|invoice_outstanding|${invoice.id}`,
    });
  }

  const hasUpcoming = bookings.some((booking: any) => {
    const date = String(booking.preferred_date || '');
    return date >= stamp && String(booking.status || '') !== 'cancelled';
  });
  if (entitlement?.active === true && !hasUpcoming) {
    const period = String(entitlement.current_period_end || '').slice(0, 10);
    candidates.push({
      kind: 'benefit_available',
      title: 'Your Preferred pricing is ready',
      body: `Your member pricing applies to your next shoot${period ? `, and your membership runs to ${period}` : ''}. The concierge can quote it before you book.`,
      severity: 'info',
      source_type: 'PreferredMembership',
      source_id: String(entitlement.membership_id || 'membership'),
      action_hint: 'prepare_booking',
      dedupe_key: `${email}|benefit_available|${stamp.slice(0, 7)}`,
    });
  }

  const published = listings.filter((listing: any) => listing.publication_state === 'PUBLISHED' && listing.listing_id);
  if (published.length) {
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    let views = 0;
    try {
      const grouped = await base44.asServiceRole.entities.PropertyTrafficDaily.aggregate({
        query: { listing_id: { $in: published.map((listing: any) => listing.listing_id).slice(0, 50) }, day: { $gte: since } },
        groupBy: 'listing_id',
        sum: ['views'],
      });
      views = (Array.isArray(grouped) ? grouped : grouped?.rows || [])
        .reduce((sum: number, row: any) => sum + Number(row.sum_views || 0), 0);
    } catch {
      views = 0;
    }
    if (views > 0) {
      candidates.push({
        kind: 'performance_report',
        title: 'This week’s property performance',
        body: `Your published property pages received ${views} view${views === 1 ? '' : 's'} in the last seven days.`,
        severity: 'info',
        source_type: 'PropertyListing',
        source_id: published.map((listing: any) => listing.listing_id).join(',').slice(0, 200),
        action_hint: 'get_property_performance',
        dedupe_key: `${email}|performance_report|${since}`,
      });
    }
  }

  return candidates.slice(0, 12);
}

async function ensureNotices(base44: any, email: string, candidates: any[]) {
  if (!candidates.length) return;
  const keys = candidates.map((item) => item.dedupe_key);
  const existing = rowsOf(await base44.asServiceRole.entities.ConciergeNotice
    .filter({ customer_email: email, dedupe_key: { $in: keys } }, { limit: 100 }).catch(() => []));
  const seen = new Set(existing.map((row: any) => row.dedupe_key));
  const missing = candidates.filter((item) => !seen.has(item.dedupe_key));
  if (!missing.length) return;
  await base44.asServiceRole.entities.ConciergeNotice.bulkCreate(
    missing.map((item) => ({
      notice_id: noticeId(),
      customer_email: email,
      ...item,
      created_at: new Date().toISOString(),
    })),
  ).catch(() => null);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ ok: false, reason: 'SESSION_REQUIRED', error: auth.error }, { status: auth.status });
    }
    const email = auth.actor.email;
    const entitlement = await resolvePreferredEntitlement(base44, { email, accountId: auth.actor.account_id });
    if (!entitlement.active) {
      return Response.json({ ok: false, reason: 'PREFERRED_REQUIRED', notices: [] }, { status: 403 });
    }

    const action = String(body?.action || 'list');
    const noticeKey = String(body?.notice_id || '').trim();

    if (action === 'read' || action === 'dismiss') {
      if (!noticeKey) return Response.json({ ok: false, error: 'A notice is required.' }, { status: 400 });
      const record = rowsOf(await base44.asServiceRole.entities.ConciergeNotice
        .filter({ notice_id: noticeKey, customer_email: email }, { limit: 1 }))[0];
      if (!record) return Response.json({ ok: false, reason: 'NOT_FOUND' }, { status: 404 });
      const patch: any = action === 'read'
        ? { read_at: new Date().toISOString() }
        : { dismissed_at: new Date().toISOString(), read_at: record.read_at || new Date().toISOString() };
      await base44.asServiceRole.entities.ConciergeNotice.update(record.id, patch);
      return Response.json({ ok: true });
    }

    if (action === 'refresh') {
      const candidates = await derive(base44, email, entitlement);
      await ensureNotices(base44, email, candidates);
    }

    const notices = rowsOf(await base44.asServiceRole.entities.ConciergeNotice
      .filter({ customer_email: email }, { sort: '-created_at', limit: 30 }))
      .filter((row: any) => !row.dismissed_at)
      .map((row: any) => ({
        notice_id: row.notice_id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        severity: row.severity || 'info',
        source_type: row.source_type || '',
        source_id: row.source_id || '',
        action_hint: row.action_hint || '',
        read: !!row.read_at,
        created_at: row.created_at || row.created_date || '',
      }));

    return Response.json({ ok: true, notices, unread: notices.filter((item: any) => !item.read).length });
  } catch (error: any) {
    console.error('conciergeNotices error:', error);
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}