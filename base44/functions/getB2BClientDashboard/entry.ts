import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { requireCustomer } from '../../shared/customerSession.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { user_id, organization_id } = body || {};

    // Who is asking: the verified session, or an administrator looking at an organization.
    const customerAuth = await requireCustomer(base44, req, body);
    if (!customerAuth.ok) {
      return Response.json({ error: customerAuth.error }, { status: customerAuth.status });
    }
    const email = customerAuth.actor.email;

    // Resolve B2B entitlement
    const entitlementRes = await base44.asServiceRole.functions.invoke('resolveB2BEntitlement', { email, user_id, organization_id });
    const entitlement = entitlementRes?.data || entitlementRes;

    if (entitlement?.commercial_domain !== 'B2B') {
      return Response.json({ status: 'OK', data: { commercial_domain: 'RETAIL', b2b: null } });
    }

    // Get organization details
    const org = await base44.asServiceRole.entities.B2BOrganization.get(entitlement.organization_id);

    // Get current period info
    let currentPeriod = null;
    let recentLedger: any[] = [];

    if (entitlement.funding_mode === 'media_credit' && entitlement.period_id) {
      currentPeriod = await base44.asServiceRole.entities.B2BMediaCreditPeriod.get(entitlement.period_id);
      recentLedger = await base44.asServiceRole.entities.B2BMediaCreditLedger.filter({ period_id: entitlement.period_id }, '-timestamp', 10);
    } else if (entitlement.funding_mode === 'reserved_capacity' && entitlement.period_id) {
      currentPeriod = await base44.asServiceRole.entities.B2BReservedCapacityPeriod.get(entitlement.period_id);
      recentLedger = await base44.asServiceRole.entities.B2BReservedCapacityLedger.filter({ period_id: entitlement.period_id }, '-timestamp', 10);
    }

    // Organization roles decide what is visible. A company administrator sees the
    // team's company orders; every other member sees only their own. Nothing here
    // exposes a colleague's bookings or standing to a non-administrator.
    const members = await base44.asServiceRole.entities.B2BOrganizationMember.filter({ organization_id: entitlement.organization_id, status: 'active' });
    const isOrgAdmin = entitlement.organization_role === 'admin';
    const visibleEmails = isOrgAdmin
      ? members.map((m: any) => m.user_email).filter(Boolean)
      : [email];

    let recentBookings: any[] = [];
    for (const memberEmail of visibleEmails.slice(0, 10)) {
      const bookings = await base44.asServiceRole.entities.Booking.filter(
        { client_email: memberEmail, purchasing_context: 'organization' },
        '-created_date',
        5
      );
      recentBookings.push(...bookings);
    }
    recentBookings = recentBookings
      .sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
      .slice(0, 10);

    // Get upcoming bookings
    const upcomingBookings = recentBookings.filter((b: any) => b.status === 'approved' || b.status === 'pending');

    return Response.json({
      status: 'OK',
      data: {
        commercial_domain: 'B2B',
        b2b: {
          entitlement,
          organization: org,
          current_period: currentPeriod,
          recent_ledger: recentLedger,
          recent_bookings: recentBookings,
          upcoming_bookings: upcomingBookings,
          is_org_admin: isOrgAdmin,
          members: (isOrgAdmin
            ? members
            : members.filter((m: any) => String(m.user_email || '').toLowerCase() === email)
          ).map((m: any) => ({ name: m.user_name, email: m.user_email, role: m.role, status: m.status })),
        },
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});