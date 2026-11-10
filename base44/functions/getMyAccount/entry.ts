import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { requireCustomer } from '../../shared/customerSession.ts';
import { customerEmailQuery } from '../../shared/customerEmail.ts';

/**
 * Server-verified account identity and service linkage for the unified client portal.
 *
 * Identity comes ONLY from the signed session token. Every other figure is derived
 * server-side from the account's own verified email, so a caller cannot read another
 * customer's services by supplying an email. Read-only: no records are written.
 */
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const body = await req.json().catch(() => ({}));

    const auth = await requireCustomer(base44, req, body);
    if (!auth.ok) return Response.json({ ok: false, code: auth.code, error: auth.error }, { status: auth.status, headers: { 'Cache-Control': 'no-store' } });

    const { actor, record } = auth;
    const email = actor.email;
    const account = {
      id: actor.account_id, email, full_name: actor.full_name, user_type: actor.user_type,
      role: actor.role, phone_number: record.phone_number || '',
      orientationCompleted: !!record.orientationCompleted, onboardingFeePaid: !!record.onboardingFeePaid,
    };
    // A health check must not query bookings, Stripe, wallets, Studio or visibility.
    if (body.identity_only === true) return Response.json({
      ok: true, account, session_contract: 'customer-v1',
    }, { headers: { 'Cache-Control': 'no-store' } });

    const rowsOf = async (entity: string, query: Record<string, unknown>) => {
      try {
        const scoped = Object.fromEntries(Object.entries(query).map(([field, value]) => [field, customerEmailQuery(field, value)[field]]));
        const result = await (base44.asServiceRole.entities as any)[entity].filter(scoped);
        const list = Array.isArray(result) ? result : (result?.items || []);
        return list;
      } catch {
        return [];
      }
    };

    const [bookings, jobs, invoices, listings, wallets, profiles, memberships] = await Promise.all([
      rowsOf('Booking', { client_email: email }),
      rowsOf('Job', { client_email: email }),
      rowsOf('Invoice', { client_email: email }),
      rowsOf('PropertyListing', { client_email: email }),
      rowsOf('PrepaidWallet', { customer_email: email }),
      rowsOf('ProfessionalProfile', { owner_email: email }),
      rowsOf('B2BOrganizationMember', { user_email: email }),
    ]);

    const now = Date.now();
    const upcomingBookings = bookings.filter((b: any) => {
      const when = Date.parse(b.scheduled_date || b.preferred_date || b.created_date || '');
      return Number.isFinite(when) && when >= now;
    }).length;

    const publishedProperties = listings.filter(
      (l: any) => l.publication_state === 'PUBLISHED' || l.listing_status === 'published',
    ).length;

    const profile = profiles[0] || null;
    const wallet = wallets[0] || null;

    return Response.json({
      ok: true,
      account,
      session_contract: 'customer-v1',
      services: {
        bookings: { total: bookings.length, upcoming: upcomingBookings },
        jobs: { total: jobs.length },
        invoices: { total: invoices.length },
        properties: { total: listings.length, published: publishedProperties },
        prepaid: wallet ? { present: true, tier: wallet.tier || null } : { present: false },
        visibility: profile
          ? {
              present: true,
              profile_id: profile.profile_id,
              profile_type: profile.profile_type,
              publication_state: profile.publication_state,
              plan_key: profile.plan_key || null,
            }
          : { present: false },
        organizations: memberships.map((m: any) => ({
          organization_id: m.organization_id,
          role: m.role || 'member',
          status: m.status || 'active',
        })),
      },
      // Media partner's own operational fields. Credential and payout-account
      // details are never returned to the browser.
      contractor:
        actor.user_type === 'media_partner'
          ? {
              stripe_account_id: record.stripe_account_id || '',
              stripe_payouts_enabled: !!record.stripe_payouts_enabled,
              background_check_status: record.background_check_status || '',
              orientationCompleted: !!record.orientationCompleted,
              onboardingFeePaid: !!record.onboardingFeePaid,
              apparelPurchased: !!record.apparelPurchased,
              coverage_area: record.coverage_area || '',
              state: record.state || '',
              max_travel_distance: record.max_travel_distance ?? null,
            }
          : null,
      // Record-linkage only. Financial figures continue to come from the existing
      // invoice, wallet and Auto-Fund services so no calculation is duplicated here.
      linkage: {
        bookings: bookings.length,
        jobs: jobs.length,
        invoices: invoices.length,
        properties: listings.length,
      },
    });
  } catch (error) {
    console.error('getMyAccount error:', error?.message);
    return Response.json({ ok: false, error: 'Could not load your account' }, { status: 500 });
  }
}