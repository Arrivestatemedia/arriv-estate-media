// Reading Stripe objects under the 2025-12-15.clover contract.
//
// Clover (from the Basil release onward) changed two things this application depends on:
//   1. current_period_start / current_period_end are no longer on the Subscription object. They live on
//      each Subscription Item.
//   2. invoice.subscription is deprecated in favour of invoice.parent.subscription_details.subscription.
//
// Every read of a Stripe object goes through this module so the new shape is handled in one place, and a
// legacy object that still carries the old fields keeps working. Nothing here guesses a date: a value
// that is absent stays absent, which is what stops a missing period being mistaken for a paid one.

function numeric(value: any): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function secondsToIso(seconds: any): string | undefined {
  const value = numeric(seconds);
  if (!value) return undefined;
  return new Date(value * 1000).toISOString();
}

export function subscriptionItems(subscription: any): any[] {
  const items = subscription?.items?.data;
  return Array.isArray(items) ? items : [];
}

function itemQuantity(item: any): number {
  const quantity = Number(item?.quantity ?? 1);
  return Number.isFinite(quantity) ? quantity : 1;
}

// The item that carries the plan itself, never the additional-seat line.
export function planItemOf(subscription: any, seatPriceId = ""): any | null {
  const items = subscriptionItems(subscription);
  if (!items.length) return null;
  const seatId = String(seatPriceId || "");
  const billable = items.filter((item) => itemQuantity(item) > 0);
  return billable.find((item) => String(item?.price?.id || "") !== seatId)
    || billable[0]
    || null;
}

export function seatItemOf(subscription: any, seatPriceId = ""): any | null {
  const seatId = String(seatPriceId || "");
  if (!seatId) return null;
  return subscriptionItems(subscription).find((item) => String(item?.price?.id || "") === seatId) || null;
}

// The billing period, read from the items (clover) with the subscription-level fields as a fallback for
// any object created before the version change.
export function subscriptionPeriod(subscription: any, seatPriceId = ""): { start?: number; end?: number } {
  const seatId = String(seatPriceId || "");

  const preferredItems = subscriptionItems(subscription)
    .filter((item) => itemQuantity(item) > 0 && String(item?.price?.id || "") !== seatId);
  const candidates = preferredItems.length ? preferredItems : subscriptionItems(subscription);

  for (const item of candidates) {
    const start = numeric(item?.current_period_start);
    const end = numeric(item?.current_period_end);
    if (start || end) return { start, end };
  }

  return {
    start: numeric(subscription?.current_period_start),
    end: numeric(subscription?.current_period_end),
  };
}

// What Stripe is actually billing per interval: every item, quantity included.
export function subscriptionTotalCents(subscription: any): number | undefined {
  const items = subscriptionItems(subscription);
  if (!items.length) return undefined;
  let total = 0;
  let seen = false;
  for (const item of items) {
    const unit = Number(item?.price?.unit_amount);
    if (!Number.isFinite(unit)) continue;
    total += unit * itemQuantity(item);
    seen = true;
  }
  return seen ? total : undefined;
}

// How many additional seats are billed. Returns null when the quantity cannot be known from the object,
// so a caller never records a guessed zero.
export function subscriptionSeats(subscription: any, seatPriceId = ""): number | null {
  const seatId = String(seatPriceId || "");
  if (seatId) {
    const item = seatItemOf(subscription, seatId);
    return item ? Math.max(0, Math.round(itemQuantity(item))) : 0;
  }
  const meta = subscription?.metadata?.seat_price_id;
  if (meta) return subscriptionSeats(subscription, String(meta));
  return null;
}

// The subscription an invoice bills, under clover first and the deprecated field second.
export function invoiceSubscriptionId(invoice: any): string {
  const parent = invoice?.parent?.subscription_details?.subscription;
  if (typeof parent === "string" && parent) return parent;
  if (parent && typeof parent === "object" && parent.id) return String(parent.id);

  const legacy = invoice?.subscription;
  if (typeof legacy === "string" && legacy) return legacy;
  if (legacy && typeof legacy === "object" && legacy.id) return String(legacy.id);

  return "";
}

// The period an invoice paid for, with the line-item period as the fallback.
export function invoicePeriod(invoice: any): { start?: number; end?: number } {
  const start = numeric(invoice?.period_start);
  const end = numeric(invoice?.period_end);
  if (start || end) return { start, end };

  const lines = invoice?.lines?.data;
  if (Array.isArray(lines)) {
    for (const line of lines) {
      const lineStart = numeric(line?.period?.start);
      const lineEnd = numeric(line?.period?.end);
      if (lineStart || lineEnd) return { start: lineStart, end: lineEnd };
    }
  }
  return {};
}

export function invoicePaidAt(invoice: any): number | undefined {
  return numeric(invoice?.status_transitions?.paid_at);
}

// A display-safe invoice summary. Amounts and periods are only ever what Stripe reported.
export function invoiceSummary(invoice: any): any {
  const period = invoicePeriod(invoice);
  return {
    invoice_id: String(invoice?.id || ""),
    amount_cents: Number(invoice?.amount_paid ?? invoice?.amount_due ?? 0),
    currency: String(invoice?.currency || "usd"),
    status: String(invoice?.status || ""),
    period_start: secondsToIso(period.start) || "",
    period_end: secondsToIso(period.end) || "",
    paid_at: secondsToIso(invoicePaidAt(invoice)) || "",
    hosted_invoice_url: String(invoice?.hosted_invoice_url || ""),
    receipt_url: String(invoice?.receipt_url || ""),
    subscription_id: invoiceSubscriptionId(invoice),
  };
}