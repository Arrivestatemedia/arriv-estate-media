import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Load all B2B organizations
    const organizations = await base44.asServiceRole.entities.B2BOrganization.list('-created_date', 200);

    // Aggregate metrics
    let totalMrr = 0;
    let totalArr = 0;
    let totalAnnualPrepaid = 0;
    let totalMonthlyContracted = 0;
    let activeOrgs = 0;
    let suspendedOrgs = 0;
    let pastDueOrgs = 0;
    const orgsByPlan: Record<string, number> = {};
    const orgsByType: Record<string, number> = {};

    for (const org of organizations) {
      const contracts = await base44.asServiceRole.entities.B2BContract.filter({ organization_id: org.id });
      const activeContract = contracts.find((c: any) => ['active', 'live', 'implementing'].includes(c.status));

      if (activeContract) {
        if (activeContract.billing_frequency === 'annual_prepaid') {
          totalAnnualPrepaid += activeContract.annual_prepaid_price || 0;
          totalArr += activeContract.annual_prepaid_price || 0;
        } else {
          totalMrr += activeContract.monthly_price || 0;
          totalMonthlyContracted += activeContract.monthly_price || 0;
          totalArr += (activeContract.monthly_price || 0) * 12;
        }
        activeOrgs++;
      }

      if (org.contract_status === 'suspended') suspendedOrgs++;
      if (activeContract?.status === 'past_due') pastDueOrgs++;

      const planKey = org.plan_id || 'unknown';
      orgsByPlan[planKey] = (orgsByPlan[planKey] || 0) + 1;

      const typeKey = org.contract_type || 'unknown';
      orgsByType[typeKey] = (orgsByType[typeKey] || 0) + 1;
    }

    // Get all commission events for total B2B commission
    const commissionEvents = await base44.asServiceRole.entities.B2BCommissionEvent.list('-created_at', 100);
    const totalB2BCommission = commissionEvents.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    // Get all overages
    const overages = await base44.asServiceRole.entities.B2BContractOverage.list('-created_at', 50);
    const totalOverageRevenue = overages.reduce((sum: number, o: any) => sum + (o.overage_amount || 0), 0);

    // Get upcoming renewals (next 120 days) — defensive in case entity has no records
    const now = new Date();
    const upcomingRenewalsList: any[] = [];
    try {
      const renewalRecords = await base44.asServiceRole.entities.B2BContractRenewal.list('-created_at', 50);
      for (const r of (renewalRecords || [])) {
        const renewDate = new Date(r.renewal_date || r.effective_date || '');
        const daysUntil = (renewDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        if (daysUntil > 0 && daysUntil <= 120) {
          upcomingRenewalsList.push(r);
        }
      }
    } catch (renewalErr) {
      // Entity may not have records yet — continue with empty list
    }

    return Response.json({
      status: 'OK',
      data: {
        organizations,
        metrics: {
          total_organizations: organizations.length,
          active_organizations: activeOrgs,
          suspended_organizations: suspendedOrgs,
          past_due_organizations: pastDueOrgs,
          b2b_mrr: Math.round(totalMrr * 100) / 100,
          b2b_arr: Math.round(totalArr * 100) / 100,
          annual_prepaid_contracted: totalAnnualPrepaid,
          monthly_contracted: totalMonthlyContracted,
          orgs_by_plan: orgsByPlan,
          orgs_by_type: orgsByType,
          total_b2b_commission: Math.round(totalB2BCommission * 100) / 100,
          total_overage_revenue: Math.round(totalOverageRevenue * 100) / 100,
          upcoming_renewals_count: upcomingRenewalsList.length,
        },
        commission_events: commissionEvents,
        overages,
        upcoming_renewals: upcomingRenewalsList,
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});