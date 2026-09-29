import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { organization_id } = await req.json();

    const org = await base44.asServiceRole.entities.B2BOrganization.get(organization_id);
    if (!org) return Response.json({ status: 'ERROR', error: 'Organization not found' }, { status: 404 });

    // Load all related data in parallel
    const [contracts, members, seatEntitlements, implOrders, creditPeriods, capacityPeriods, commissionTranches, commissionEvents, auditLogs, overages, capacityReviews, expansions, renewals] = await Promise.all([
      base44.asServiceRole.entities.B2BContract.filter({ organization_id }),
      base44.asServiceRole.entities.B2BOrganizationMember.filter({ organization_id }),
      base44.asServiceRole.entities.B2BSeatEntitlement.filter({ organization_id, status: 'active' }),
      base44.asServiceRole.entities.B2BImplementationOrder.filter({ organization_id }),
      base44.asServiceRole.entities.B2BMediaCreditPeriod.filter({ organization_id }, '-created_at', 12),
      base44.asServiceRole.entities.B2BReservedCapacityPeriod.filter({ organization_id }, '-created_at', 12),
      base44.asServiceRole.entities.B2BCommissionTranche.filter({ organization_id }),
      base44.asServiceRole.entities.B2BCommissionEvent.filter({ organization_id }, '-created_at', 50),
      base44.asServiceRole.entities.B2BAuditLog.filter({ entity_id: organization_id }, '-timestamp', 50),
      base44.asServiceRole.entities.B2BContractOverage.filter({ organization_id }, '-created_at', 20),
      base44.asServiceRole.entities.B2BCapacityReview.filter({ organization_id }, '-created_at', 10),
      base44.asServiceRole.entities.B2BContractExpansion.filter({ organization_id }, '-created_at', 10),
      base44.asServiceRole.entities.B2BContractRenewal.filter({ organization_id }, '-created_at', 10),
    ]);

    // Get current contract
    const currentContract = contracts.find((c: any) => ['active', 'live', 'implementing', 'awaiting_payment'].includes(c.status)) || contracts[0];

    // Get current credit period
    const currentCreditPeriod = creditPeriods.find((p: any) => p.status === 'active');

    // Get current capacity period
    const currentCapacityPeriod = capacityPeriods.find((p: any) => p.status === 'active');

    // Get credit ledger for current period
    let creditLedger: any[] = [];
    if (currentCreditPeriod) {
      creditLedger = await base44.asServiceRole.entities.B2BMediaCreditLedger.filter({ period_id: currentCreditPeriod.id }, '-timestamp', 50);
    }

    // Get capacity ledger for current period
    let capacityLedger: any[] = [];
    if (currentCapacityPeriod) {
      capacityLedger = await base44.asServiceRole.entities.B2BReservedCapacityLedger.filter({ period_id: currentCapacityPeriod.id }, '-timestamp', 50);
    }

    // Get invoices
    const invoices = await base44.asServiceRole.entities.Invoice.filter({ b2b_organization_id: organization_id }, '-created_date', 20);

    return Response.json({
      status: 'OK',
      data: {
        organization: org,
        contracts,
        current_contract: currentContract,
        members,
        seat_entitlement: seatEntitlements[0] || null,
        implementation_orders: implOrders,
        current_implementation_order: implOrders[0] || null,
        current_credit_period: currentCreditPeriod || null,
        current_capacity_period: currentCapacityPeriod || null,
        credit_ledger: creditLedger,
        capacity_ledger: capacityLedger,
        credit_periods: creditPeriods,
        capacity_periods: capacityPeriods,
        commission_tranches: commissionTranches,
        commission_events: commissionEvents,
        audit_logs: auditLogs,
        overages,
        capacity_reviews: capacityReviews,
        expansions,
        renewals,
        invoices,
      },
    });
  } catch (e) {
    return Response.json({ status: 'ERROR', error: e.message }, { status: 500 });
  }
});