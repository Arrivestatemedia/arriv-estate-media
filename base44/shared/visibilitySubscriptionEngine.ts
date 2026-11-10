// Subscription state machine.
//
// One place decides what a Stripe subscription event means for our record. Everything here is a pure
// function of the record and the event, so:
//   * a redelivered event is applied once (the event id is checked before anything changes),
//   * a stale event can never move a live subscription backwards,
//   * benefits are never granted from a stored flag — they are recomputed from status + period.

export const SUBSCRIPTION_STATUSES = [
  "pending_checkout",
  "incomplete",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const TERMINAL_STATUSES: string[] = ["canceled", "expired"];
export const APPLIED_EVENT_LIMIT = 50;

export function mapStripeStatus(status: string): SubscriptionStatus {
  const value = String(status || "").toLowerCase();
  if (value === "active" || value === "trialing") return "active";
  if (value === "past_due" || value === "unpaid") return "past_due";
  if (value === "canceled") return "canceled";
  if (value === "incomplete" || value === "incomplete_expired") return "incomplete";
  if (value === "paused") return "paused";
  return "incomplete";
}

function isoFromSeconds(seconds: any): string | undefined {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value * 1000).toISOString();
}

function pushEvent(record: any, type: string, actor: string, note = ""): any[] {
  const events = Array.isArray(record?.events) ? record.events : [];
  return [...events, { type, at: new Date().toISOString(), actor, note }].slice(-40);
}

export function alreadyApplied(record: any, eventId: string): boolean {
  if (!eventId) return false;
  const applied = Array.isArray(record?.applied_event_ids) ? record.applied_event_ids : [];
  return applied.includes(String(eventId));
}

function markApplied(record: any, eventId: string): string[] {
  const applied = Array.isArray(record?.applied_event_ids) ? record.applied_event_ids : [];
  const next = eventId ? [...applied, String(eventId)] : applied;
  return next.slice(-APPLIED_EVENT_LIMIT);
}

function periodPatch(subscription: any): Record<string, any> {
  return {
    current_period_start: isoFromSeconds(subscription?.current_period_start) || undefined,
    current_period_end: isoFromSeconds(subscription?.current_period_end) || undefined,
    cancel_at_period_end: subscription?.cancel_at_period_end === true,
    stripe_price_id: subscription?.items?.data?.[0]?.price?.id || undefined,
    amount_cents: subscription?.items?.data?.[0]?.price?.unit_amount ?? undefined,
  };
}

// customer.subscription.created / .updated
export function applySubscriptionUpsert(record: any, subscription: any, eventId: string, actor = "stripe"): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  const nextStatus = mapStripeStatus(subscription?.status);
  const current = String(record?.status || "");
  // A late event must not resurrect a subscription that already ended.
  const regressing = TERMINAL_STATUSES.includes(current) && !TERMINAL_STATUSES.includes(nextStatus);
  const patch: Record<string, any> = {
    ...periodPatch(subscription),
    stripe_subscription_id: subscription?.id || record?.stripe_subscription_id,
    stripe_customer_id: subscription?.customer || record?.stripe_customer_id,
    last_stripe_event_id: eventId || undefined,
    last_stripe_event_at: new Date().toISOString(),
    applied_event_ids: markApplied(record, eventId),
  };
  if (!regressing) patch.status = nextStatus;
  if (record?.cancel_at_period_end === false && subscription?.cancel_at_period_end === true) {
    patch.canceled_at = new Date().toISOString();
    patch.cancel_reason = "cancel_at_period_end";
  }
  if (nextStatus === "canceled") patch.ended_at = isoFromSeconds(subscription?.ended_at) || new Date().toISOString();
  patch.events = pushEvent(record, regressing ? "stripe_event_ignored_regression" : `stripe_${String(subscription?.status || "")}`, actor);
  return { changed: true, patch };
}

export function applySubscriptionDeleted(record: any, subscription: any, eventId: string, actor = "stripe"): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  return {
    changed: true,
    patch: {
      status: "canceled",
      cancel_at_period_end: false,
      ended_at: isoFromSeconds(subscription?.ended_at) || new Date().toISOString(),
      ...periodPatch(subscription),
      last_stripe_event_id: eventId || undefined,
      last_stripe_event_at: new Date().toISOString(),
      applied_event_ids: markApplied(record, eventId),
      events: pushEvent(record, "stripe_subscription_deleted", actor),
    },
  };
}

export function invoiceEntry(invoice: any): any {
  return {
    invoice_id: invoice?.id || "",
    amount_cents: Number(invoice?.amount_paid ?? invoice?.amount_due ?? 0),
    currency: invoice?.currency || "usd",
    status: invoice?.status || "",
    period_start: isoFromSeconds(invoice?.period_start) || "",
    period_end: isoFromSeconds(invoice?.period_end) || "",
    paid_at: isoFromSeconds(invoice?.status_transitions?.paid_at) || "",
    hosted_invoice_url: invoice?.hosted_invoice_url || "",
    receipt_url: invoice?.receipt_url || "",
  };
}

// invoice.paid — records the payment and extends the period. Never a second subscription record.
export function applyInvoicePaid(record: any, invoice: any, eventId: string, actor = "stripe"): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  const entry = invoiceEntry(invoice);
  const history = Array.isArray(record?.billing_history) ? record.billing_history : [];
  const deduped = history.some((h: any) => h?.invoice_id && h.invoice_id === entry.invoice_id) ? history : [...history, entry];
  return {
    changed: true,
    patch: {
      status: "active",
      last_invoice_id: entry.invoice_id,
      last_payment_at: entry.paid_at || new Date().toISOString(),
      last_failure_at: undefined,
      last_failure_reason: undefined,
      current_period_start: entry.period_start || record?.current_period_start,
      current_period_end: entry.period_end || record?.current_period_end,
      billing_history: deduped.slice(-24),
      last_stripe_event_id: eventId || undefined,
      last_stripe_event_at: new Date().toISOString(),
      applied_event_ids: markApplied(record, eventId),
      events: pushEvent(record, "invoice_paid", actor, entry.invoice_id),
    },
  };
}

// invoice.payment_failed — benefits stop being reliable, so the record moves to past_due. Nothing is
// deleted and no data is lost.
export function applyInvoiceFailed(record: any, invoice: any, eventId: string, actor = "stripe"): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  return {
    changed: true,
    patch: {
      status: "past_due",
      last_failure_at: new Date().toISOString(),
      last_failure_reason: String(invoice?.last_finalization_error?.message || invoice?.status || "payment_failed").slice(0, 300),
      last_invoice_id: invoice?.id || record?.last_invoice_id,
      last_stripe_event_id: eventId || undefined,
      last_stripe_event_at: new Date().toISOString(),
      applied_event_ids: markApplied(record, eventId),
      events: pushEvent(record, "invoice_payment_failed", actor, invoice?.id || ""),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a subscription's real state at any moment.

export function benefitsActive(record: any, now = new Date()): boolean {
  if (!record) return false;
  if (String(record.status || "") !== "active") return false;
  const end = Date.parse(String(record.current_period_end || ""));
  if (Number.isFinite(end) && end <= now.getTime()) return false;
  return true;
}

export function periodElapsed(record: any, now = new Date()): boolean {
  const end = Date.parse(String(record?.current_period_end || ""));
  return Number.isFinite(end) && end <= now.getTime();
}

// What the customer currently holds. `cancel_at_period_end` keeps benefits until the paid period ends.
export function subscriptionView(record: any, now = new Date()) {
  if (!record) {
    return { status: "none", plan_key: "", benefits_active: false, cancel_at_period_end: false, days_remaining: 0, in_grace: false };
  }
  const end = Date.parse(String(record.current_period_end || ""));
  const daysRemaining = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now.getTime()) / 86400000)) : 0;
  return {
    status: String(record.status || ""),
    plan_key: String(record.plan_key || ""),
    benefits_active: benefitsActive(record, now),
    cancel_at_period_end: record.cancel_at_period_end === true,
    current_period_end: record.current_period_end || "",
    days_remaining: daysRemaining,
    in_grace: String(record.status || "") === "past_due",
    plan_key_pending: record.pending_plan_key || "",
  };
}

// The sweep's judgement: a period that has ended and was never renewed has expired.
export function shouldExpire(record: any, now = new Date()): boolean {
  if (!record) return false;
  if (TERMINAL_STATUSES.includes(String(record.status || ""))) return false;
  if (String(record.status || "") === "pending_checkout") return false;
  return periodElapsed(record, now);
}

export function expirePatch(record: any, actor = "system"): Record<string, any> {
  return {
    status: "expired",
    ended_at: new Date().toISOString(),
    events: pushEvent(record, "subscription_expired", actor, "billing period ended without renewal"),
  };
}

export function renewalNoticeDue(record: any, now = new Date(), windowDays = 5): boolean {
  if (!record || !benefitsActive(record, now)) return false;
  if (record.cancel_at_period_end === true) return false;
  if (record.notified_renewal_at) return false;
  const end = Date.parse(String(record.current_period_end || ""));
  if (!Number.isFinite(end)) return false;
  const days = (end - now.getTime()) / 86400000;
  return days > 0 && days <= windowDays;
}

// Seats: the allowance is included + purchased, never unlimited.
export function seatUsage(record: any, plan: any, rosterCount: number) {
  const included = Number(plan?.seats_included ?? record?.seats_included ?? 1);
  const purchased = Number(record?.seats_purchased || 0);
  const allowed = included + purchased;
  const used = Math.max(0, Number(rosterCount || 0));
  return { included, purchased, allowed, used, remaining: Math.max(0, allowed - used), exceeded: used > allowed };
}