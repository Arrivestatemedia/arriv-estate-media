import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// ============================================================================
// MANAGE B2B DELINQUENCY — Admin API
//
// Actions:
//   check_organization       — Calculate delinquency for an org's invoices
//   approve_enterprise_restriction — Admin approves enterprise booking restriction
//   approve_management_exception   — Admin approves exception/payment arrangement
//   expire_exception         — Expire a management exception
//   manual_recovery          — Mark invoice as recovered (admin override)
//   get_delinquency_dashboard — Admin visibility dashboard
//   process_payment_received — Reconcile confirmed payment, remove restrictions
// ============================================================================

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const b = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const {
      calculateDelinquency, evaluateBookingRestriction, evaluateRecovery,
      calculateOutstandingBalance, classifyCustomer, getGracePeriodDays,
      isEnterpriseClassification, DELINQUENCY_STATUS, shouldGenerateCommission,
    } = await import('../../shared/b2bDelinquencyEngine.ts');

    const { buildB2BNotification } = await import('../../shared/b2bNotificationEngine.ts');
    const { isOrganizationOnHold } = await import('../../shared/b2bGoverningContract.ts');

    // ── check_organization ──────────────────────────────────────────────
    if (action === 'check_organization') {
      const { organization_id } = body;
      if (!organization_id) return Response.json({ error: 'organization_id required' }, { status: 400 });

      const org = await b.entities.B2BOrganization.get(organization_id);
      if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

      const contracts = await b.entities.B2BContract.filter({ organization_id });
      const contract = contracts.find(c => c.status === 'active' || c.status === 'live') || contracts[0];
      const contractType = contract?.contract_type || org.contract_type;

      const invoices = await b.entities.Invoice.filter({ b2b_organization_id: organization_id });
      const b2bInvoices = invoices.filter(inv =>
        inv.invoice_type === 'b2b_annual_contract' ||
        inv.invoice_type === 'b2b_implementation' ||
        inv.invoice_type === 'b2b_approved_overage'
      );

      const results = [];
      for (const inv of b2bInvoices) {
        const calc = calculateDelinquency({
          invoice: inv,
          contract_type: contractType,
          delinquency_tier: org.delinquency_tier,
        });
        results.push({
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          amount: inv.amount,
          payment_status: inv.payment_status,
          due_date: inv.due_date,
          delinquency_status: calc.delinquency_status,
          days_past_due: calc.days_past_due,
          grace_period_days: calc.grace_period_days,
          grace_period_deadline: calc.grace_period_deadline,
          grace_expired: calc.grace_expired,
          requires_admin_review: calc.requires_admin_review,
          should_restrict: calc.should_restrict_bookings,
          requires_enterprise_approval: calc.requires_enterprise_approval,
        });
      }

      const outstanding = calculateOutstandingBalance(b2bInvoices);
      const classification = classifyCustomer(contractType, org.delinquency_tier);
      const graceDays = getGracePeriodDays(classification);

      return Response.json({
        organization_id,
        organization_name: org.display_name || org.legal_name,
        contract_type: contractType,
        customer_classification: classification,
        grace_period_days: graceDays,
        is_enterprise: isEnterpriseClassification(classification),
        outstanding_balance: outstanding.total_outstanding,
        unpaid_invoice_count: outstanding.invoice_count,
        oldest_past_due_date: outstanding.oldest_past_due_date,
        max_days_past_due: outstanding.days_past_due_max,
        invoices: results,
      });
    }

    // ── approve_enterprise_restriction ─────────────────────────────────
    if (action === 'approve_enterprise_restriction') {
      const { organization_id, reason } = body;
      if (!organization_id) return Response.json({ error: 'organization_id required' }, { status: 400 });

      const org = await b.entities.B2BOrganization.get(organization_id);
      if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

      const classification = classifyCustomer(org.contract_type);
      if (!isEnterpriseClassification(classification)) {
        return Response.json({ error: 'Enterprise restriction only applies to enterprise accounts' }, { status: 400 });
      }

      const nowIso = new Date().toISOString();
      await b.entities.B2BOrganization.update(organization_id, {
        booking_restricted: true,
        booking_restricted_at: nowIso,
        booking_restriction_reason: 'ENTERPRISE_APPROVAL_GRANTED',
        enterprise_restriction_approved_by: user.email,
        enterprise_restriction_approved_at: nowIso,
      });

      await b.entities.B2BAuditLog.create({
        actor: user.email,
        actor_type: 'admin',
        action: 'ENTERPRISE_RESTRICTION_APPROVED',
        reason: reason || 'Enterprise booking restriction approved by management',
        entity_type: 'B2BOrganization',
        entity_id: organization_id,
        timestamp: nowIso,
      });

      return Response.json({ status: 'approved', organization_id, restricted: true });
    }

    // ── approve_management_exception ────────────────────────────────────
    if (action === 'approve_management_exception') {
      const { invoice_id, reason, expires_at } = body;
      if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

      const invoice = await b.entities.Invoice.get(invoice_id);
      if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

      const nowIso = new Date().toISOString();
      await b.entities.Invoice.update(invoice_id, {
        management_exception_status: 'approved',
        management_exception_approved_by: user.email,
        management_exception_reason: reason || 'Management exception approved',
        management_exception_expires_at: expires_at || null,
      });

      if (invoice.b2b_organization_id) {
        await b.entities.B2BOrganization.update(invoice.b2b_organization_id, {
          management_exception_active: true,
        });
      }

      await b.entities.B2BAuditLog.create({
        actor: user.email,
        actor_type: 'admin',
        action: 'MANAGEMENT_EXCEPTION_APPROVED',
        reason: reason || 'Management exception approved',
        entity_type: 'Invoice',
        entity_id: invoice_id,
        timestamp: nowIso,
      });

      return Response.json({ status: 'approved', invoice_id });
    }

    // ── expire_exception ────────────────────────────────────────────────
    if (action === 'expire_exception') {
      const { invoice_id } = body;
      if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

      const invoice = await b.entities.Invoice.get(invoice_id);
      if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

      await b.entities.Invoice.update(invoice_id, {
        management_exception_status: 'expired',
      });

      await b.entities.B2BAuditLog.create({
        actor: user.email,
        actor_type: 'admin',
        action: 'MANAGEMENT_EXCEPTION_EXPIRED',
        reason: 'Management exception expired',
        entity_type: 'Invoice',
        entity_id: invoice_id,
        timestamp: new Date().toISOString(),
      });

      return Response.json({ status: 'expired', invoice_id });
    }

    // ── manual_recovery ─────────────────────────────────────────────────
    if (action === 'manual_recovery') {
      const { invoice_id, reason } = body;
      if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

      const invoice = await b.entities.Invoice.get(invoice_id);
      if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

      const nowIso = new Date().toISOString();
      await b.entities.Invoice.update(invoice_id, {
        payment_status: 'paid',
        paid_at: nowIso,
        delinquency_status: DELINQUENCY_STATUS.RECOVERED,
        recovered_at: nowIso,
      });

      // Remove org restriction if no more outstanding invoices
      if (invoice.b2b_organization_id) {
        const orgInvoices = await b.entities.Invoice.filter({ b2b_organization_id: invoice.b2b_organization_id });
        const stillUnpaid = orgInvoices.filter(inv =>
          inv.id !== invoice_id && inv.payment_status === 'unpaid' &&
          (inv.invoice_type === 'b2b_annual_contract' || inv.invoice_type === 'b2b_implementation' || inv.invoice_type === 'b2b_approved_overage')
        );
        if (stillUnpaid.length === 0) {
          await b.entities.B2BOrganization.update(invoice.b2b_organization_id, {
            booking_restricted: false,
            booking_restricted_at: null,
            booking_restriction_reason: null,
            management_exception_active: false,
          });
        }
      }

      await b.entities.B2BAuditLog.create({
        actor: user.email,
        actor_type: 'admin',
        action: 'MANUAL_RECOVERY',
        reason: reason || 'Manual payment recovery by admin',
        entity_type: 'Invoice',
        entity_id: invoice_id,
        timestamp: nowIso,
      });

      return Response.json({ status: 'recovered', invoice_id });
    }

    // ── get_delinquency_dashboard ────────────────────────────────────────
    if (action === 'get_delinquency_dashboard') {
      const allOrgs = await b.entities.B2BOrganization.list('-updated_date', 200);
      const dashboard = [];

      for (const org of allOrgs) {
        if (org.certification_mode) continue; // Skip cert fixtures
        const invoices = await b.entities.Invoice.filter({ b2b_organization_id: org.id });
        const b2bInvoices = invoices.filter(inv =>
          inv.invoice_type === 'b2b_annual_contract' ||
          inv.invoice_type === 'b2b_implementation' ||
          inv.invoice_type === 'b2b_approved_overage'
        );
        const outstanding = calculateOutstandingBalance(b2bInvoices);
        if (outstanding.invoice_count === 0 && !org.booking_restricted) continue;

        const classification = classifyCustomer(org.contract_type);
        dashboard.push({
          organization_id: org.id,
          organization_name: org.display_name || org.legal_name,
          contract_type: org.contract_type,
          classification,
          grace_period_days: getGracePeriodDays(classification),
          contract_status: org.contract_status,
          booking_restricted: org.booking_restricted,
          management_exception_active: org.management_exception_active,
          outstanding_balance: outstanding.total_outstanding,
          unpaid_invoice_count: outstanding.invoice_count,
          oldest_past_due_date: outstanding.oldest_past_due_date,
          max_days_past_due: outstanding.days_past_due_max,
          assigned_sales_rep_email: org.assigned_sales_rep_email,
          billing_contact_email: org.billing_contact_email,
        });
      }

      return Response.json({ organizations: dashboard, total: dashboard.length });
    }

    // ── process_payment_received ────────────────────────────────────────
    if (action === 'process_payment_received') {
      const { invoice_id, payment_intent_id, amount_paid, certification_mode } = body;
      if (!invoice_id) return Response.json({ error: 'invoice_id required' }, { status: 400 });

      const invoice = await b.entities.Invoice.get(invoice_id);
      if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });

      // Idempotency: already paid
      if (invoice.payment_status === 'paid') {
        return Response.json({ status: 'already_paid', invoice_id });
      }

      const nowIso = new Date().toISOString();

      // Partial payment handling
      if (amount_paid !== undefined && amount_paid < invoice.amount) {
        await b.entities.Invoice.update(invoice_id, {
          partial_payment_amount: amount_paid,
          delinquency_status: DELINQUENCY_STATUS.PAYMENT_PENDING,
        });
        return Response.json({ status: 'partial_payment', invoice_id, amount_paid, remaining: invoice.amount - amount_paid });
      }

      // Full payment — reconcile
      const wasRestricted = invoice.booking_restricted_at !== undefined && invoice.booking_restricted_at !== null;
      const recovery = evaluateRecovery({
        payment_confirmed: true,
        currently_restricted: wasRestricted,
        management_hold_active: false,
      });

      await b.entities.Invoice.update(invoice_id, {
        payment_status: 'paid',
        paid_at: nowIso,
        stripe_payment_intent_id: payment_intent_id || invoice.stripe_payment_intent_id,
        delinquency_status: DELINQUENCY_STATUS.RECOVERED,
        recovered_at: nowIso,
      });

      // Remove org restriction
      if (invoice.b2b_organization_id && recovery.restrictions_removed) {
        await b.entities.B2BOrganization.update(invoice.b2b_organization_id, {
          booking_restricted: false,
          booking_restricted_at: null,
          booking_restriction_reason: null,
        });
      }

      // Commission: only from confirmed collected revenue
      const contracts = invoice.b2b_contract_id
        ? await b.entities.B2BContract.filter({ contract_id: invoice.b2b_contract_id })
        : [];
      const contract = contracts[0];
      const salesRepId = contract?.sales_rep_id || '';
      const salesRepEmail = contract?.sales_rep_email || '';

      let commissionResult = null;
      if (salesRepId) {
        const rep = await b.entities.SalesTeamMember.get(salesRepId).catch(() => null);
        const repActive = rep?.status === 'active';
        const commCheck = shouldGenerateCommission({
          payment_confirmed: true,
          revenue_collected: invoice.amount,
          sales_rep_active: repActive,
        });
        commissionResult = { ...commCheck, sales_rep_id: salesRepId, rep_active: repActive };
      }

      await b.entities.B2BAuditLog.create({
        actor: 'system',
        actor_type: 'system',
        action: 'PAYMENT_RECOVERED',
        reason: `Payment confirmed for invoice ${invoice.invoice_number || invoice_id}`,
        entity_type: 'Invoice',
        entity_id: invoice_id,
        timestamp: nowIso,
      });

      return Response.json({
        status: 'recovered',
        invoice_id,
        restrictions_removed: recovery.restrictions_removed,
        commission: commissionResult,
        certification_mode: certification_mode === true,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}