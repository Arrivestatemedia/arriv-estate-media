// Stripe helpers for advertising purchases.
//
// The app already has one Stripe integration; this module only shapes a payment intent for an
// advertising campaign and verifies it afterwards. It never creates a second payment system and
// never grants anything on a browser's word alone.

export async function createAdPaymentIntent(opts: {
  amountCents: number;
  campaignId: string;
  listingId: string;
  tier: string;
  clientEmail: string;
  address: string;
}): Promise<any> {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");

  const form = new URLSearchParams({
    amount: String(opts.amountCents),
    currency: "usd",
    "automatic_payment_methods[enabled]": "true",
    description: `Arriv Estate Media — property advertising campaign (${opts.tier})`,
    "metadata[purpose]": "property_ad_purchase",
    "metadata[campaign_id]": opts.campaignId,
    "metadata[listing_id]": opts.listingId,
    "metadata[tier]": opts.tier,
    "metadata[client_email]": opts.clientEmail,
  });
  if (String(opts.clientEmail || "").includes("@")) form.set("receipt_email", opts.clientEmail);

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe could not start the payment (${res.status}): ${body?.error?.message || ""}`);
  return body;
}

export interface VerifiedPayment {
  id: string;
  paid: boolean;
  status: string;
  amountCents: number;
  metadata: Record<string, string>;
}

export async function verifyAdPayment(paymentIntentId: string): Promise<VerifiedPayment> {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe could not confirm the payment (${res.status}): ${body?.error?.message || ""}`);
  const status = String(body?.status || "");
  return {
    id: String(body?.id || paymentIntentId),
    paid: status === "succeeded",
    status,
    amountCents: Number(body?.amount_received ?? body?.amount ?? 0),
    metadata: body?.metadata || {},
  };
}

// Refunds are only ever issued after an administrator decision, and only for an amount that has
// not been spent at the advertising platform.
export async function issueAdRefund(paymentIntentId: string, amountCents: number): Promise<any> {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");
  const form = new URLSearchParams({
    payment_intent: paymentIntentId,
    amount: String(amountCents),
    "metadata[reason]": "property_advertising_refund",
  });
  const res = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe could not issue the refund (${res.status}): ${body?.error?.message || ""}`);
  return body;
}