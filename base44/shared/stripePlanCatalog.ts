// Provisioning of the Phase 4 recurring plans in Stripe.
//
// This uses the app's ONE existing Stripe account and secret (STRIPE_SECRET_KEY). It only ever touches
// products and recurring prices — it never creates a customer, a subscription, a payment intent, a
// charge or a refund, and it never changes an existing price. A price is immutable in Stripe, so a
// changed plan amount produces a new price while the old one is left exactly as it was for the
// customers already billed on it.
//
// Everything here is idempotent and matched before it is created:
//   1. a product is matched by its metadata key, then by its exact name;
//   2. a price is matched by product + recurring monthly + exact amount + currency.
// A second run therefore returns the same ids and creates nothing.

const STRIPE_API = "https://api.stripe.com/v1/";
const PRODUCT_FAMILY = "visibility_subscription";
const SEAT_KEY = "brokerage_seat";
const SEAT_NAME = "Arriv Brokerage Additional Seat";

// The Phase 4 lifecycle events the webhook must receive for subscriptions to stay true.
export const REQUIRED_WEBHOOK_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

function secretKey(): string {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) throw new Error("Stripe is not configured: STRIPE_SECRET_KEY is missing.");
  return key;
}

// The environment is reported, never the key. A caller can prove which account it acted on without a
// secret ever reaching a log, a response or the browser.
export function stripeMode(): "live" | "test" | "missing" {
  const key = String((globalThis as any)?.process?.env?.STRIPE_SECRET_KEY || "");
  if (!key) return "missing";
  return key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : "test";
}

async function call(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<any> {
  const { idempotencyKey, ...rest } = init;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    ...((rest.headers as Record<string, string>) || {}),
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, { ...rest, headers, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The message is Stripe's own and never contains the key.
    const error: any = new Error(`Stripe ${path.split("?")[0]} failed (${res.status}): ${body?.error?.message || "no detail"}`);
    error.status = res.status;
    error.stripeType = body?.error?.type || "";
    throw error;
  }
  return body;
}

function post(path: string, params: Record<string, string>, idempotencyKey?: string) {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    idempotencyKey,
  });
}

// Paginates products so a match deep in the account is still found rather than duplicated.
async function allProducts(limit = 100, maxPages = 4): Promise<any[]> {
  const out: any[] = [];
  let after = "";
  for (let page = 0; page < maxPages; page++) {
    const body = await call(`products?limit=${limit}${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`, { method: "GET" });
    const data = Array.isArray(body?.data) ? body.data : [];
    out.push(...data);
    if (!body?.has_more || !data.length) break;
    after = String(data[data.length - 1]?.id || "");
    if (!after) break;
  }
  return out;
}

async function pricesFor(productId: string): Promise<any[]> {
  const body = await call(`prices?product=${encodeURIComponent(productId)}&limit=100`, { method: "GET" });
  return Array.isArray(body?.data) ? body.data : [];
}

function nameMatches(product: any, name: string): boolean {
  return String(product?.name || "").trim().toLowerCase() === name.trim().toLowerCase();
}

function findProduct(products: any[], planKey: string, name: string): any | null {
  const byKey = products.find((p) => String(p?.metadata?.arriv_plan_key || "") === planKey);
  if (byKey) return byKey;
  const byLegacyKey = products.find((p) => String(p?.metadata?.product_key || "") === planKey);
  if (byLegacyKey) return byLegacyKey;
  return products.find((p) => nameMatches(p, name)) || null;
}

function monthlyPrice(price: any, amountCents: number, currency: string): boolean {
  if (String(price?.type || "") !== "recurring") return false;
  if (String(price?.recurring?.interval || "") !== "month") return false;
  if (Number(price?.recurring?.interval_count || 1) !== 1) return false;
  if (Number(price?.unit_amount) !== Number(amountCents)) return false;
  if (String(price?.currency || "").toLowerCase() !== currency) return false;
  return price?.active !== false;
}

export interface PlanStripeTarget {
  key: string;
  name: string;
  description: string;
  amountCents: number;
  currency: string;
}

// Read-only: returns exactly the product and price each target would match, and creates nothing. Used
// by the status report so an administrator can see Stripe's real state before anything is written.
export async function matchStripePlans(targets: PlanStripeTarget[]): Promise<{
  ok: boolean;
  mode: string;
  results: any[];
}> {
  const products = await allProducts();
  const results: any[] = [];

  for (const target of targets) {
    const entry: any = {
      plan_key: target.key,
      requested_name: target.name,
      amount_cents: target.amountCents,
      currency: target.currency,
      product_id: "",
      price_id: "",
      blocker: "",
    };
    const product = findProduct(products, target.key, target.name);
    if (!product) {
      results.push(entry);
      continue;
    }
    entry.product_id = String(product.id);
    if (product.active === false) {
      entry.blocker = `Stripe product ${product.id} for "${target.name}" is archived.`;
      results.push(entry);
      continue;
    }
    const match = (await pricesFor(entry.product_id)).find((p) => monthlyPrice(p, target.amountCents, target.currency));
    if (match) entry.price_id = String(match.id);
    results.push(entry);
  }

  return { ok: results.every((r) => !r.blocker && r.price_id), mode: stripeMode(), results };
}

// Ensures one product and one monthly price for every target. Nothing is created when a match exists.
export async function ensureStripePlans(targets: PlanStripeTarget[]): Promise<{
  ok: boolean;
  mode: string;
  results: any[];
}> {
  const products = await allProducts();
  const results: any[] = [];

  for (const target of targets) {
    const entry: any = {
      plan_key: target.key,
      requested_name: target.name,
      amount_cents: target.amountCents,
      currency: target.currency,
      product_id: "",
      price_id: "",
      product_created: false,
      price_created: false,
      matched_by: "",
      blocker: "",
    };

    try {
      let product = findProduct(products, target.key, target.name);
      if (product) {
        entry.matched_by = String(product?.metadata?.arriv_plan_key || product?.metadata?.product_key || "") === target.key
          ? "metadata"
          : "name";
        entry.product_id = String(product.id);
        if (product.active === false) {
          // Archived deliberately, so it is reported rather than silently reactivated.
          entry.blocker = `Stripe product ${product.id} for "${target.name}" is archived. Reactivate it in Stripe, then run this again.`;
          results.push(entry);
          continue;
        }
      } else {
        product = await post("products", {
          name: target.name,
          description: target.description || "",
          "metadata[arriv_plan_key]": target.key,
          "metadata[arriv_product_family]": PRODUCT_FAMILY,
        }, `arriv-vis-product-${target.key}-v1`);
        entry.product_id = String(product.id);
        entry.product_created = true;
        products.push(product);
      }

      const existing = await pricesFor(entry.product_id);
      const match = existing.find((p) => monthlyPrice(p, target.amountCents, target.currency));
      if (match) {
        entry.price_id = String(match.id);
      } else {
        const created = await post("prices", {
          product: entry.product_id,
          currency: target.currency,
          unit_amount: String(target.amountCents),
          "recurring[interval]": "month",
          "recurring[interval_count]": "1",
          nickname: target.name,
          "metadata[arriv_plan_key]": target.key,
          "metadata[arriv_product_family]": PRODUCT_FAMILY,
        }, `arriv-vis-price-${target.key}-${target.amountCents}-${target.currency}-v1`);
        entry.price_id = String(created.id);
        entry.price_created = true;
      }
    } catch (error: any) {
      entry.blocker = String(error?.message || error);
    }

    results.push(entry);
  }

  return {
    ok: results.every((r) => !r.blocker && r.price_id),
    mode: stripeMode(),
    results,
  };
}

// Reads the account's webhook endpoints and reports whether the Phase 4 events are actually delivered.
// This is a read only: an endpoint is never created, edited or deleted here, because changing a live
// endpoint would also change the one-time payment flows that share it.
export async function inspectWebhooks(expectedHost: string): Promise<{
  ok: boolean;
  endpoints: any[];
  ready: boolean;
  blocker: string;
}> {
  const body = await call("webhook_endpoints?limit=20", { method: "GET" });
  const endpoints = (Array.isArray(body?.data) ? body.data : []).map((endpoint: any) => {
    const events = Array.isArray(endpoint?.enabled_events) ? endpoint.enabled_events : [];
    const wildcard = events.includes("*");
    const missing = REQUIRED_WEBHOOK_EVENTS.filter((e) => !wildcard && !events.includes(e));
    return {
      id: String(endpoint?.id || ""),
      url: String(endpoint?.url || ""),
      status: String(endpoint?.status || ""),
      livemode: endpoint?.livemode === true,
      api_version: String(endpoint?.api_version || ""),
      enabled_events_count: events.length,
      wildcard,
      missing_events: missing,
      covers_phase4: missing.length === 0,
      host_matches: expectedHost ? String(endpoint?.url || "").includes(expectedHost) : null,
    };
  });

  const usable = endpoints.filter((e) => e.status === "enabled" && e.covers_phase4);
  const matching = usable.filter((e) => e.host_matches !== false);
  const ready = matching.length > 0;

  let blocker = "";
  if (!endpoints.length) {
    blocker = "This Stripe account has no webhook endpoint. Add one pointing at the app's handleStripeWebhook function.";
  } else if (!usable.length) {
    const closest = endpoints.slice().sort((a, b) => a.missing_events.length - b.missing_events.length)[0];
    blocker = `No enabled endpoint receives every Phase 4 event. ${closest.url} is missing: ${closest.missing_events.join(", ")}.`;
  } else if (!matching.length) {
    blocker = `An endpoint covers the Phase 4 events but its URL does not point at ${expectedHost}.`;
  }

  return { ok: ready, endpoints, ready, blocker };
}