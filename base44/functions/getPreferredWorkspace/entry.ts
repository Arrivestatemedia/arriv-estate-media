import { createClientFromRequest } from 'npm:@base44/sdk@0.8.59';
import { requireCustomer } from '../../shared/customerSession.ts';
import { resolvePreferredEntitlement } from '../../shared/preferredEntitlement.ts';

/**
 * Summary numbers for the Arriv Preferred workspace.
 *
 * Every figure is counted from records that already exist for the signed-in customer —
 * nothing is estimated. A customer with no bookings yet sees a real zero, not a sample.
 */

const ACTIVE_LISTING_STATES = ['active', 'pending'];
const CLOSED_BOOKING_STATES = ['cancelled', 'denied', 'completed'];

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function settingValue(record: any): string {
  if (!record?.value) return '';
  const text = String(record.value).trim();
  return text.replace(/^"|"$/g, '');
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) {
      return Response.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const email = auth.actor.email;
    const entitlement = await resolvePreferredEntitlement(base44, { email, accountId: auth.actor.account_id });
    if (!entitlement.active) {
      return Response.json({ ok: false, error: 'Preferred membership required' }, { status: 403 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

    const [bookingResult, listingResult, jobResult, nameSetting] = await Promise.all([
      base44.asServiceRole.entities.Booking
        .filter({ client_email: email }, { sort: '-preferred_date', limit: 100 }).catch(() => []),
      base44.asServiceRole.entities.PropertyListing
        .filter({ client_email: email }, { sort: '-updated_date', limit: 50 }).catch(() => []),
      base44.asServiceRole.entities.Job
        .filter({ client_email: email }, { sort: '-delivered_at', limit: 25 }).catch(() => []),
      base44.asServiceRole.entities.AppSetting.filter({ key: 'preferred_concierge_name' }).catch(() => []),
    ]);

    const bookings = rows(bookingResult);
    const listings = rows(listingResult);
    const jobs = rows(jobResult);

    const savingsCents = bookings
      .filter((booking) => String(booking.created_date || '') >= yearStart)
      .reduce((sum, booking) => sum + Number(booking.preferred_discount || 0), 0);

    const upcomingShoots = bookings.filter((booking) => {
      const status = String(booking.status || '').toLowerCase();
      return String(booking.preferred_date || '') >= today && !CLOSED_BOOKING_STATES.includes(status);
    }).length;

    const activeListings = listings.filter((listing) =>
      ACTIVE_LISTING_STATES.includes(String(listing.listing_status || '').toLowerCase())
      || String(listing.publication_state || '') === 'PUBLISHED'
    ).length;

    const deliveredJob = jobs.find((job) => job.delivered_to_customer === true) || null;
    let latestMedia = null;
    if (deliveredJob) {
      const listing = listings.find((row) => row.job_id && row.job_id === deliveredJob.id) || null;
      const media = Array.isArray(listing?.selected_media) ? listing.selected_media : [];
      const image = media.find((item) => item?.source === 'uploaded' && item?.url) || null;
      latestMedia = {
        job_id: deliveredJob.id,
        title: listing?.property_address || deliveredJob.title || deliveredJob.location || 'Latest delivery',
        city: listing?.city || '',
        state: listing?.state || '',
        delivered_at: deliveredJob.delivered_at || deliveredJob.completed_at || '',
        image_url: image?.url || '',
      };
    }

    return Response.json({
      ok: true,
      customer: {
        full_name: auth.actor.full_name || '',
        first_name: String(auth.actor.full_name || '').split(' ')[0] || '',
      },
      plan: entitlement.plan || '',
      period_end: entitlement.current_period_end || '',
      concierge_name: settingValue(rows(nameSetting)[0]),
      stats: {
        savings_cents: savingsCents,
        active_listings: activeListings,
        upcoming_shoots: upcomingShoots,
      },
      latest_media: latestMedia,
    });
  } catch (error: any) {
    console.error('getPreferredWorkspace error:', error);
    return Response.json({ ok: false, error: 'The workspace could not be loaded.' }, { status: 500 });
  }
}