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
    // The card is authorized now and captured later, when the campaign actually starts running, so
    // a customer is never charged while the property page is still waiting to be approved.
    capture_method: "manual",
    description: `Arriv Estate Media — property advertising campaign (${opts.tier})`,
    "metadata[purpose]": "property_ad_purchase",
    "metadata[capture_timing]": "on_launch",
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
  // `paid` means the money is safely secured for this campaign: either captured already, or held
  // on the customer's card and waiting to be captured when the campaign starts.
  paid: boolean;
  authorized: boolean;
  captured: boolean;
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
  const authorized = status === "requires_capture";
  const captured = status === "succeeded";
  return {
    id: String(body?.id || paymentIntentId),
    paid: captured || authorized,
    authorized,
    captured,
    status,
    amountCents: Number(
      captured ? body?.amount_received ?? body?.amount ?? 0 : body?.amount_capturable ?? body?.amount ?? 0,
    ),
    metadata: body?.metadata || {},
  };
}

// Takes the money that was held when the customer confirmed the card. Called at the moment the
// campaign is about to start running, so the charge always follows the page being approved.
export async function captureAdPayment(paymentIntentId: string): Promise<{
  ok: boolean;
  status: string;
  amountCents: number;
  error?: string;
}> {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  const status = String(body?.status || "");
  if (!res.ok || status !== "succeeded") {
    return {
      ok: false,
      status,
      amountCents: 0,
      error: body?.error?.message || `Stripe did not take the held payment (${res.status}).`,
    };
  }
  return { ok: true, status, amountCents: Number(body?.amount_received ?? body?.amount ?? 0) };
}

// Releases a hold on a card for a campaign that will never run. Nothing was charged, so there is
// nothing to refund: the customer simply keeps the money.
export async function voidAdAuthorization(paymentIntentId: string): Promise<{ ok: boolean; status: string; error?: string }> {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured");
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntentId)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({}),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: String(body?.status || ""), error: body?.error?.message || `Stripe could not release the hold (${res.status}).` };
  }
  return { ok: true, status: String(body?.status || "canceled") };
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