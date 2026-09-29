import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email, user_id } = await req.json();

    // Resolve B2B entitlement
    const entitlementRes = await base44.asServiceRole.functions.invoke('resolveB2BEntitlement', { email, user_id });
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

    // Get recent bookings for this organization's members
    const members = await base44.asServiceRole.entities.B2BOrganizationMember.filter({ organization_id: entitlement.organization_id, status: 'active' });
    const memberEmails = members.map((m: any) => m.user_email).filter(Boolean);
    let recentBookings: any[] = [];
    if (memberEmails.length > 0) {
      // Get bookings for any member email
      for (const email of memberEmails.slice(0, 10)) {
        const bookings = await base44.asServiceRole.entities.Booking.filter({ client_email: email }, '-created_date', 5);
        recentBookings.push(...bookings);
      }
      recentBookings = recentBookings.sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime()).slice(0, 10);
    }

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
          members: members.map((m: any) => ({ name: m.user_name, email: m.user_email, role: m.role, status: m.status })),
        },
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});