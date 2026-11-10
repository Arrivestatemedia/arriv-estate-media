// Stripe helpers for recurring visibility subscriptions.
//
// This reuses the app's single existing Stripe account and secret. It does NOT touch any one-time
// payment flow: no payment intent is created here, no existing checkout is modified.
//
// Subscriptions are opened with Stripe Checkout in subscription mode, which means the card details and
// the recurring mandate are collected and stored by Stripe — Arriv never touches a card number, and the
// resulting subscription is the single source of truth for billing.
//
// Every request pins STRIPE_API_VERSION so the objects we read are the same shape the webhook receives.

import { STRIPE_API_VERSION, stripeHeaders } from "./stripeApiVersion.ts";
import { planItemOf } from "./stripeObjects.ts";

function stripeKey(): string {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");
  return key;
}

async function stripeRequest(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<any> {
  const { idempotencyKey, ...rest } = init;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    ...stripeHeaders((rest.headers as Record<string, string>) || {}),
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { ...rest, headers, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${path.split("?")[0]} failed (${res.status}): ${body?.error?.message || ""}`);
  return body;
}

export interface CheckoutRequest {
  priceId: string;
  profileId: string;
  planKey: string;
  ownerEmail: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  // An existing Stripe customer this profile already verified. Reusing it keeps a repeat checkout, its
  // billing history and its billing-portal access on one customer record. It is never chosen by email.
  customerId?: string;
  idempotencyKey?: string;
}

// A hosted Checkout Session in subscription mode. `client_reference_id` and the metadata carry the
// profile and plan so the webhook can attach the subscription to exactly one profile.
export async function createSubscriptionCheckout(req: CheckoutRequest): Promise<any> {
  if (!req.priceId) throw new Error("That plan has no Stripe price configured yet.");
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": req.priceId,
    "line_items[0][quantity]": "1",
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    client_reference_id: req.profileId,
    "metadata[purpose]": "visibility_subscription",
    "metadata[profile_id]": req.profileId,
    "metadata[plan_key]": req.planKey,
    "metadata[owner_email]": req.ownerEmail,
    "subscription_data[metadata][purpose]": "visibility_subscription",
    "subscription_data[metadata][profile_id]": req.profileId,
    "subscription_data[metadata][plan_key]": req.planKey,
    "subscription_data[metadata][owner_email]": req.ownerEmail,
    allow_promotion_codes: "true",
    "billing_address_collection": "auto",
  });
  if (req.customerId) {
    // An existing customer always wins over an address: Stripe then reuses its saved payment method and
    // keeps every invoice on one customer.
    form.set("customer", req.customerId);
  } else if (req.customerEmail && String(req.customerEmail).includes("@")) {
    form.set("customer_email", req.customerEmail);
  }
  return stripeRequest("checkout/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    idempotencyKey: req.idempotencyKey,
  });
}

export async function retrieveCheckoutSession(sessionId: string): Promise<any> {
  return stripeRequest(`checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`, { method: "GET" });
}

export async function retrieveSubscription(subscriptionId: string): Promise<any> {
  return stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
}

export async function retrieveInvoice(invoiceId: string): Promise<any> {
  return stripeRequest(`invoices/${encodeURIComponent(invoiceId)}`, { method: "GET" });
}

// Cancellation is always "at period end" from the customer's own dashboard: they keep what they paid
// for. An immediate cancel is reserved for an administrator decision.
export async function cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<any> {
  if (atPeriodEnd) {
    return stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ cancel_at_period_end: "true" }),
    });
  }
  return stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
}

export async function resumeSubscription(subscriptionId: string): Promise<any> {
  return stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ cancel_at_period_end: "false" }),
  });
}

// Plan change: the price is swapped on the single existing subscription, so no second subscription
// and no second charge is ever created. Proration follows the documented policy.
//
// The plan item is identified by price, not by position, so a subscription that also carries an
// additional-seat line can never have its seat line swapped for a plan or the reverse.
export async function changeSubscriptionPlan(
  subscriptionId: string,
  opts: { priceId: string; prorate: boolean; planKey: string; seatPriceId?: string },
): Promise<any> {
  if (!opts.priceId) throw new Error("That plan has no Stripe price configured yet.");
  const existing = await retrieveSubscription(subscriptionId);
  const planItem = planItemOf(existing, opts.seatPriceId || "");
  const itemId = String(planItem?.id || "");
  if (!itemId) throw new Error("Stripe did not return this subscription's billing item.");
  return stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "items[0][id]": itemId,
      "items[0][price]": opts.priceId,
      proration_behavior: opts.prorate ? "always_invoice" : "none",
      "metadata[plan_key]": opts.planKey,
    }),
  });
}

export interface SeatUpdateRequest {
  subscriptionId: string;
  seatPriceId: string;
  quantity: number;
  prorationBehavior: "always_invoice" | "create_prorations" | "none";
  idempotencyKey?: string;
}

// Adds, increases or removes the additional-seat line.
//
// The line is addressed by its own price, so the plan line is never touched. Removing every seat deletes
// the line rather than leaving a zero-quantity item behind, which is what keeps a later change from
// billing a seat nobody holds.
export async function updateSubscriptionSeats(req: SeatUpdateRequest): Promise<any> {
  if (!req.seatPriceId) throw new Error("The additional seat is not configured for billing yet.");
  const quantity = Math.max(0, Math.round(Number(req.quantity) || 0));
  const existing = await retrieveSubscription(req.subscriptionId);
  const seatItem = (existing?.items?.data || []).find(
    (item: any) => String(item?.price?.id || "") === String(req.seatPriceId),
  );

  const params: Record<string, string> = {
    "metadata[seat_price_id]": String(req.seatPriceId),
    proration_behavior: req.prorationBehavior === "none" ? "none" : req.prorationBehavior,
  };

  if (quantity === 0) {
    if (seatItem) params["items[0][id]"] = String(seatItem.id);
    if (seatItem) params["items[0][deleted]"] = "true";
  } else {
    if (seatItem) params["items[0][id]"] = String(seatItem.id);
    else params["items[0][price]"] = String(req.seatPriceId);
    params["items[0][quantity]"] = String(quantity);
  }

  return stripeRequest(`subscriptions/${encodeURIComponent(req.subscriptionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    idempotencyKey: req.idempotencyKey,
  });
}

// A prorated invoice that could not be paid is voided before the seat change is rolled back, so the
// customer is never left holding a charge for a seat that is not on the subscription.
export async function voidInvoice(invoiceId: string): Promise<any> {
  if (!invoiceId) return null;
  return stripeRequest(`invoices/${encodeURIComponent(invoiceId)}/void`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}),
  });
}

export async function listInvoices(subscriptionId: string): Promise<any[]> {
  const body = await stripeRequest(
    `invoices?limit=24&status=paid&subscription=${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
  return Array.isArray(body?.data) ? body.data : [];
}

export function subscriptionIdOf(subscription: any): string {
  return String(subscription?.id || "");
}

export { STRIPE_API_VERSION };