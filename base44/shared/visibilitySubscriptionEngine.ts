// Subscription state machine.
//
// One place decides what a Stripe subscription event means for our record. Everything here is a pure
// function of the record and the event, so:
//   * a redelivered event is applied once (the Stripe event id is checked before anything changes),
//   * a stale event can never move a live subscription backwards,
//   * a periodic reconciliation is derived only from Stripe's live state, so it is safe to repeat and
//     can never discard a later renewal,
//   * benefits are never granted from a stored flag, and never indefinitely: a subscription with no
//     known billing period does not grant benefits.
//
// All Stripe shapes are read through ./stripeObjects.ts, which speaks the 2025-12-15.clover contract
// (period on the subscription items, invoice subscription under invoice.parent) with legacy fallbacks.

import {
  secondsToIso,
  subscriptionPeriod,
  subscriptionTotalCents,
  subscriptionSeats,
  planItemOf,
  invoiceSummary,
} from "./stripeObjects.ts";

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

// The subscription metadata key that names which price is the additional-seat line. It lets every
// reader tell the plan apart from the seats without guessing from amounts.
export const SEAT_METADATA_KEY = "seat_price_id";

export function mapStripeStatus(status: string): SubscriptionStatus {
  const value = String(status || "").toLowerCase();
  if (value === "active" || value === "trialing") return "active";
  if (value === "past_due" || value === "unpaid") return "past_due";
  if (value === "canceled") return "canceled";
  if (value === "incomplete" || value === "incomplete_expired") return "incomplete";
  if (value === "paused") return "paused";
  return "incomplete";
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

function pushEvent(record: any, type: string, actor: string, note = ""): any[] {
  const events = Array.isArray(record?.events) ? record.events : [];
  return [...events, { type, at: new Date().toISOString(), actor, note }].slice(-40);
}

function seatPriceIdFor(subscription: any, fallback = ""): string {
  return String(subscription?.metadata?.[SEAT_METADATA_KEY] || fallback || "");
}

// The billing facts a Stripe subscription states. Absent values are omitted rather than written as a
// false date, so a missing period can never be mistaken for a paid one.
export function periodPatch(subscription: any, options: { seatPriceId?: string } = {}): Record<string, any> {
  const seatPriceId = seatPriceIdFor(subscription, options?.seatPriceId);
  const period = subscriptionPeriod(subscription, seatPriceId);
  const planItem = planItemOf(subscription, seatPriceId);

  const patch: Record<string, any> = {
    cancel_at_period_end: subscription?.cancel_at_period_end === true,
  };

  const start = secondsToIso(period.start);
  const end = secondsToIso(period.end);
  if (start) patch.current_period_start = start;
  if (end) patch.current_period_end = end;

  const priceId = planItem?.price?.id;
  if (priceId) patch.stripe_price_id = String(priceId);

  const total = subscriptionTotalCents(subscription);
  if (Number.isFinite(total)) patch.amount_cents = Number(total);

  const seats = subscriptionSeats(subscription, seatPriceId);
  if (seats !== null) patch.seats_purchased = seats;

  return patch;
}

// customer.subscription.created / .updated
export function applySubscriptionUpsert(
  record: any,
  subscription: any,
  eventId: string,
  actor = "stripe",
  options: { seatPriceId?: string } = {},
): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  const nextStatus = mapStripeStatus(subscription?.status);
  const current = String(record?.status || "");
  // A late event must not resurrect a subscription that already ended.
  const regressing = TERMINAL_STATUSES.includes(current) && !TERMINAL_STATUSES.includes(nextStatus);
  const patch: Record<string, any> = {
    ...periodPatch(subscription, options),
    stripe_subscription_id: subscription?.id || record?.stripe_subscription_id,
    stripe_customer_id: subscription?.customer || record?.stripe_customer_id,
    updated_at: new Date().toISOString(),
    last_stripe_event_id: eventId || undefined,
    last_stripe_event_at: new Date().toISOString(),
    applied_event_ids: markApplied(record, eventId),
  };
  if (!regressing) patch.status = nextStatus;
  if (record?.cancel_at_period_end === false && subscription?.cancel_at_period_end === true) {
    patch.canceled_at = new Date().toISOString();
    patch.cancel_reason = "cancel_at_period_end";
  }
  if (nextStatus === "canceled") patch.ended_at = secondsToIso(subscription?.ended_at) || new Date().toISOString();
  patch.events = pushEvent(record, regressing ? "stripe_event_ignored_regression" : `stripe_${String(subscription?.status || "")}`, actor);
  return { changed: true, patch };
}

export function applySubscriptionDeleted(
  record: any,
  subscription: any,
  eventId: string,
  actor = "stripe",
  options: { seatPriceId?: string } = {},
): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  return {
    changed: true,
    patch: {
      status: "canceled",
      cancel_at_period_end: false,
      ended_at: secondsToIso(subscription?.ended_at) || new Date().toISOString(),
      ...periodPatch(subscription, options),
      updated_at: new Date().toISOString(),
      last_stripe_event_id: eventId || undefined,
      last_stripe_event_at: new Date().toISOString(),
      applied_event_ids: markApplied(record, eventId),
      events: pushEvent(record, "stripe_subscription_deleted", actor),
    },
  };
}

// A reconciliation is not an event: it is Stripe's live state applied to the record. It is therefore
// repeatable by construction — the same Stripe state always produces the same result, and a second run
// writes nothing. It deliberately does not touch applied_event_ids, because it is not consuming an
// event and must never block a later one.
export function reconcileFromStripe(
  record: any,
  subscription: any,
  actor = "sweep",
  options: { seatPriceId?: string } = {},
): { changed: boolean; patch: Record<string, any> } {
  const nextStatus = mapStripeStatus(subscription?.status);
  const current = String(record?.status || "");
  const regressing = TERMINAL_STATUSES.includes(current) && !TERMINAL_STATUSES.includes(nextStatus);

  const patch: Record<string, any> = {};
  const derived = periodPatch(subscription, options);
  for (const [key, value] of Object.entries(derived)) {
    if (value === undefined || value === null) continue;
    if (String(record?.[key] ?? "") !== String(value)) patch[key] = value;
  }

  if (subscription?.id && String(record?.stripe_subscription_id || "") !== String(subscription.id)) {
    patch.stripe_subscription_id = String(subscription.id);
  }
  if (subscription?.customer && String(record?.stripe_customer_id || "") !== String(subscription.customer)) {
    patch.stripe_customer_id = String(subscription.customer);
  }
  if (!regressing && nextStatus !== current) patch.status = nextStatus;
  if (subscription?.cancel_at_period_end === true && record?.cancel_at_period_end !== true) {
    patch.canceled_at = new Date().toISOString();
    patch.cancel_reason = "cancel_at_period_end";
  }
  if (nextStatus === "canceled" && current !== "canceled") {
    patch.ended_at = secondsToIso(subscription?.ended_at) || new Date().toISOString();
  }

  if (!Object.keys(patch).length) return { changed: false, patch: {} };

  patch.updated_at = new Date().toISOString();
  patch.events = pushEvent(record, "stripe_reconciled", actor, `${current || "none"} to ${nextStatus}`);
  return { changed: true, patch };
}

export function invoiceEntry(invoice: any): any {
  return invoiceSummary(invoice);
}

// invoice.paid — records the payment and extends the period. Never a second subscription record.
export function applyInvoicePaid(
  record: any,
  invoice: any,
  eventId: string,
  actor = "stripe",
  options: { seatPriceId?: string } = {},
): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  const entry = invoiceEntry(invoice);
  const history = Array.isArray(record?.billing_history) ? record.billing_history : [];
  const deduped = history.some((h: any) => h?.invoice_id && h.invoice_id === entry.invoice_id) ? history : [...history, entry];

  const patch: Record<string, any> = {
    status: "active",
    last_invoice_id: entry.invoice_id,
    last_payment_at: entry.paid_at || new Date().toISOString(),
    last_failure_at: undefined,
    last_failure_reason: undefined,
    billing_history: deduped.slice(-24),
    updated_at: new Date().toISOString(),
    last_stripe_event_id: eventId || undefined,
    last_stripe_event_at: new Date().toISOString(),
    applied_event_ids: markApplied(record, eventId),
    events: pushEvent(record, "invoice_paid", actor, entry.invoice_id),
  };

  // An invoice states the period it paid for. A seat change invoice covers the same running period, so
  // the stored period only ever moves forward to a later end date.
  if (entry.period_start) patch.current_period_start = entry.period_start;
  if (entry.period_end) {
    const recordedEnd = Date.parse(String(record?.current_period_end || ""));
    const invoiceEnd = Date.parse(entry.period_end);
    if (!Number.isFinite(recordedEnd) || (Number.isFinite(invoiceEnd) && invoiceEnd >= recordedEnd)) {
      patch.current_period_end = entry.period_end;
    }
  }

  return { changed: true, patch };
}

// invoice.payment_failed — benefits stop being reliable, so the record moves to past_due. Nothing is
// deleted and no data is lost.
export function applyInvoiceFailed(
  record: any,
  invoice: any,
  eventId: string,
  actor = "stripe",
): { changed: boolean; patch: Record<string, any> } {
  if (alreadyApplied(record, eventId)) return { changed: false, patch: {} };
  const entry = invoiceEntry(invoice);
  return {
    changed: true,
    patch: {
      status: "past_due",
      last_failure_at: new Date().toISOString(),
      last_failure_reason: String(invoice?.last_finalization_error?.message || invoice?.status || "payment_failed").slice(0, 300),
      last_invoice_id: entry.invoice_id || record?.last_invoice_id,
      updated_at: new Date().toISOString(),
      last_stripe_event_id: eventId || undefined,
      last_stripe_event_at: new Date().toISOString(),
      applied_event_ids: markApplied(record, eventId),
      events: pushEvent(record, "invoice_payment_failed", actor, entry.invoice_id),
    },
  };
}

// A seat change confirmed by Stripe. The quantity is written from Stripe's own answer, never from the
// request, so a rolled-back or partial change can never leave an overstated allowance.
export function seatChangePatch(record: any, seats: any, actor: string, note = ""): Record<string, any> {
  return {
    seats_purchased: Math.max(0, Math.round(Number(seats) || 0)),
    updated_at: new Date().toISOString(),
    events: pushEvent(record, "seats_changed", actor, note),
  };
}

// ---------------------------------------------------------------------------------------------
// Reading a subscription's real state at any moment.

export function benefitsActive(record: any, now = new Date()): boolean {
  if (!record) return false;
  if (String(record.status || "") !== "active") return false;
  const end = Date.parse(String(record.current_period_end || ""));
  // No known end date means no proven paid period, so nothing is granted. A benefits flag is never
  // derived from status alone.
  if (!Number.isFinite(end)) return false;
  return end > now.getTime();
}

export function periodElapsed(record: any, now = new Date()): boolean {
  const end = Date.parse(String(record?.current_period_end || ""));
  return Number.isFinite(end) && end <= now.getTime();
}

// What the customer currently holds. `cancel_at_period_end` keeps benefits until the paid period ends.
export function subscriptionView(record: any, now = new Date()) {
  if (!record) {
    return {
      status: "none",
      plan_key: "",
      benefits_active: false,
      cancel_at_period_end: false,
      current_period_end: "",
      days_remaining: 0,
      in_grace: false,
      seats_included: 1,
      seats_purchased: 0,
      seats_total: 1,
    };
  }
  const end = Date.parse(String(record.current_period_end || ""));
  const daysRemaining = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now.getTime()) / 86400000)) : 0;
  const seatsIncluded = Number(record.seats_included ?? 1);
  const seatsPurchased = Math.max(0, Number(record.seats_purchased || 0));
  return {
    status: String(record.status || ""),
    plan_key: String(record.plan_key || ""),
    benefits_active: benefitsActive(record, now),
    cancel_at_period_end: record.cancel_at_period_end === true,
    current_period_start: record.current_period_start || "",
    current_period_end: record.current_period_end || "",
    days_remaining: daysRemaining,
    in_grace: String(record.status || "") === "past_due",
    plan_key_pending: record.pending_plan_key || "",
    seats_included: seatsIncluded,
    seats_purchased: seatsPurchased,
    seats_total: seatsIncluded + seatsPurchased,
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
    updated_at: new Date().toISOString(),
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