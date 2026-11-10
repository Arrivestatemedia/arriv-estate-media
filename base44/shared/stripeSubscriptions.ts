// Stripe helpers for recurring visibility subscriptions.
//
// This reuses the app's single existing Stripe account and secret. It does NOT touch any one-time
// payment flow: no payment intent is created here, no existing checkout is modified.
//
// Subscriptions are opened with Stripe Checkout in subscription mode, which means the card details and
// the recurring mandate are collected and stored by Stripe — Arriv never touches a card number, and the
// resulting subscription is the single source of truth for billing.

function stripeKey(): string {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");
  return key;
}

async function stripeRequest(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<any> {
  const { idempotencyKey, ...rest } = init;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    ...((rest.headers as Record<string, string>) || {}),
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
  if (req.customerEmail && String(req.customerEmail).includes("@")) form.set("customer_email", req.customerEmail);
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
export async function changeSubscriptionPlan(subscriptionId: string, opts: { priceId: string; prorate: boolean; planKey: string }): Promise<any> {
  if (!opts.priceId) throw new Error("That plan has no Stripe price configured yet.");
  // The existing subscription item id is required to swap the price in place; without it Stripe would
  // create a second item and the customer would be billed for both plans.
  const existing = await retrieveSubscription(subscriptionId);
  const itemId = String(existing?.items?.data?.[0]?.id || "");
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

export async function listInvoices(subscriptionId: string): Promise<any[]> {
  const body = await stripeRequest(`invoices?subscription=${encodeURIComponent(subscriptionId)}&limit=24`, { method: "GET" });
  return Array.isArray(body?.data) ? body.data : [];
}

export function subscriptionIdOf(subscription: any): string {
  return String(subscription?.id || "");
}