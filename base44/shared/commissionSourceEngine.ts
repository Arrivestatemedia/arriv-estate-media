// Commission source-record engine: turns paid client invoices into immutable
// CommissionSourceRecord entries (Arriv One source of truth) and promotes them
// to payroll-eligible once the client payment clears. Feeds PayrollPeriod in phase 4.

import { addBusinessDays, CLIENT_PAYMENT_CLEARANCE_BUSINESS_DAYS } from "./stripeConnect.ts";
import { ensureEmployeeId } from "./payrollEmployeeSync.ts";

// Resolve the sales rep who owns a paid invoice, via the converted ClientSignupInvite.
export async function resolveEmployeeForInvoice(base44, invoice) {
  if (!invoice || !invoice.booking_id) return null;
  let invite = null;
  const byBooking = await base44.asServiceRole.entities.ClientSignupInvite.filter({
    booking_id: invoice.booking_id,
    status: "converted",
  });
  if (byBooking && byBooking.length) invite = byBooking[0];
  if (!invite && invoice.client_email) {
    const byEmail = await base44.asServiceRole.entities.ClientSignupInvite.filter({
      client_email: invoice.client_email,
      status: "converted",
    });
    if (byEmail && byEmail.length) invite = byEmail[0];
  }
  if (!invite || !invite.sales_member_id) return null;
  const member = await base44.asServiceRole.entities.SalesTeamMember.get(invite.sales_member_id);
  if (!member) return null;
  return { member, invite };
}

// Resolve the commission plan + version + rate/method for a member, preferring
// the snapshot stored on the member at assignment time.
export async function resolveCommissionPlan(base44, member) {
  const planId = member.commission_plan_id || "";
  let version = member.commission_plan_version;
  let rate = member.commission_rate;
  let method = "flat_rate";
  let fixedAmount = 0;
  let tiers = [];

  if (planId && version) {
    const versions = await base44.asServiceRole.entities.CommissionPlanVersion.filter({
      plan_id: planId,
      version,
    });
    const pv = versions && versions[0];
    if (pv) {
      method = pv.calculation_method || "flat_rate";
      if (rate == null) rate = pv.rate;
      fixedAmount = pv.fixed_amount || 0;
      tiers = pv.tiers || [];
    }
  } else if (planId) {
    const plans = await base44.asServiceRole.entities.CommissionPlan.filter({ plan_id: planId });
    const plan = plans && plans[0];
    if (plan) {
      version = plan.current_version;
      method = plan.calculation_method || "flat_rate";
      if (rate == null) rate = plan.default_rate;
    }
  }
  if (rate == null) rate = 0;
  if (!version) version = 1;
  return { planId, version, rate, method, fixedAmount, tiers };
}

export function calculateCommission(plan, commissionable) {
  const method = plan.method || "flat_rate";
  if (method === "fixed_per_deal") return +(plan.fixedAmount || 0).toFixed(2);
  if (method === "tiered" && plan.tiers && plan.tiers.length) {
    for (const t of plan.tiers) {
      const min = t.min ?? 0;
      const max = t.max == null ? Infinity : t.max;
      if (commissionable >= min && commissionable < max) {
        return +(commissionable * (t.rate ?? 0)).toFixed(2);
      }
    }
    const top = plan.tiers[plan.tiers.length - 1];
    return +(commissionable * (top.rate ?? 0)).toFixed(2);
  }
  return +((commissionable || 0) * (plan.rate ?? 0)).toFixed(2);
}

// Mirror processPaymentConfirmation's clearance logic: prefer Stripe's actual
// settlement date, else +2 business days.
export async function computeClearanceDate(base44, invoice) {
  let clearanceDate = addBusinessDays(new Date(), CLIENT_PAYMENT_CLEARANCE_BUSINESS_DAYS);
  if (invoice.stripe_payment_intent_id) {
    try {
      const Stripe = (await import("npm:stripe@17.5.0")).default;
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"));
      const pi = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id, {
        expand: ["latest_charge.balance_transaction"],
      });
      const availableOn = pi.latest_charge?.balance_transaction?.available_on;
      if (availableOn) clearanceDate = new Date(availableOn * 1000);
    } catch (_e) {
      // fall back to the business-day timer
    }
  }
  return clearanceDate;
}

// Create a CommissionSourceRecord for a paid invoice. Idempotent on customer_invoice_id.
export async function generateSourceRecord(base44, invoice, clearanceDate) {
  if (!invoice || invoice.payment_status !== "paid") return null;
  const existing = await base44.asServiceRole.entities.CommissionSourceRecord.filter({
    customer_invoice_id: invoice.id,
  });
  if (existing && existing.length) return existing[0];

  const resolved = await resolveEmployeeForInvoice(base44, invoice);
  if (!resolved) return null;
  let { member, invite } = resolved;
  if (!member.arriv_employee_id) {
    member = await ensureEmployeeId(base44, member);
  }

  const plan = await resolveCommissionPlan(base44, member);
  const collected = +(invoice.amount || 0);
  const commissionable = collected;
  const commission = calculateCommission(plan, commissionable);
  const now = new Date().toISOString();
  const cleared = clearanceDate && new Date(clearanceDate) <= new Date();
  const clearedDateStr = clearanceDate ? clearanceDate.toISOString().slice(0, 10) : "";

  return base44.asServiceRole.entities.CommissionSourceRecord.create({
    source_record_id: `csr_${crypto.randomUUID()}`,
    arriv_employee_id: member.arriv_employee_id,
    client_id: invite.contact_email || invoice.client_email || "",
    client_account_id: "",
    customer_invoice_id: invoice.id,
    stripe_payment_id: invoice.stripe_payment_intent_id || "",
    sale_id: invoice.booking_id || "",
    service_or_product: invoice.package || "",
    contract_value: collected,
    amount_collected: collected,
    commissionable_amount: commissionable,
    commission_plan_id: plan.planId,
    commission_plan_version: plan.version,
    commission_rate: plan.rate,
    commission_calculation_method: plan.method,
    calculated_commission_amount: commission,
    eligibility_date: now.slice(0, 10),
    payment_cleared_date: clearedDateStr,
    refund_status: "none",
    chargeback_status: "none",
    cancellation_status: "none",
    adjustment_status: "none",
    previous_payroll_inclusion_status: "never_included",
    payroll_inclusion_status: cleared ? "eligible" : "not_included",
    record_version: 1,
    created_timestamp: now,
    modified_timestamp: now,
  });
}

// Promote not_included records whose payment has cleared → eligible.
export async function promoteEligibleRecords(base44) {
  const today = new Date().toISOString().slice(0, 10);
  const records = await base44.asServiceRole.entities.CommissionSourceRecord.filter(
    { payroll_inclusion_status: "not_included" },
    "-created_timestamp",
    200
  );
  const promoted = [];
  for (const r of records || []) {
    if (!r.payment_cleared_date) continue;
    if (r.payment_cleared_date <= today) {
      await base44.asServiceRole.entities.CommissionSourceRecord.update(r.id, {
        payroll_inclusion_status: "eligible",
        modified_timestamp: new Date().toISOString(),
      });
      promoted.push(r.source_record_id);
    }
  }
  return promoted;
}

// Safety net: generate missing source records for recently paid invoices.
export async function backfillSourceRecords(base44) {
  const paidInvoices = await base44.asServiceRole.entities.Invoice.filter(
    { payment_status: "paid" },
    "-paid_at",
    50
  );
  let created = 0;
  for (const inv of paidInvoices || []) {
    const existing = await base44.asServiceRole.entities.CommissionSourceRecord.filter({
      customer_invoice_id: inv.id,
    });
    if (existing && existing.length) continue;
    const clearance = await computeClearanceDate(base44, inv);
    const rec = await generateSourceRecord(base44, inv, clearance);
    if (rec) created++;
  }
  return created;
}