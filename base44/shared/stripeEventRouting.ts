// Routing rules for Stripe events.
//
// One Stripe account serves four unrelated money flows: one-time media orders and property packages,
// recurring Preferred memberships, Stripe Connect payouts, and (from Phase 4) recurring Visibility
// subscriptions. Once subscription and invoice events are enabled, the same event type can arrive for a
// subscription belonging to any of them, so every branch must decide from the event itself whether it is
// allowed to act. These functions make that decision explicit and testable, instead of letting each
// branch re-guess it.
//
// The rules are conservative in one direction only: a branch is skipped when the event positively
// belongs to another flow. An event that carries no recognisable marker keeps the behaviour it has
// always had, so nothing that works today changes.

export const VISIBILITY_PURPOSE = "visibility_subscription";
export const PREFERRED_PURPOSE = "preferred_membership";
export const VISIBILITY_PLAN_KEYS = ["agent_presence", "agent_growth", "brokerage"];

export type ObjectRoute = "visibility" | "preferred" | "ambiguous" | "unknown";

function metadataOf(object: any): Record<string, any> {
  const meta = object?.metadata;
  return meta && typeof meta === "object" ? meta : {};
}

// The first price on the object. A subscription carries it under items.data[0]; an invoice line carries
// its own. Either is Stripe's own identifier, so a match is proof of which product is being billed.
export function priceIdOf(object: any): string {
  const fromItems = object?.items?.data?.[0]?.price?.id;
  if (fromItems) return String(fromItems);
  const fromPlan = object?.plan?.id;
  if (fromPlan) return String(fromPlan);
  const fromLines = object?.lines?.data?.[0]?.price?.id;
  if (fromLines) return String(fromLines);
  return "";
}

export function linePriceIds(object: any): string[] {
  const lines = object?.lines?.data;
  if (!Array.isArray(lines)) return [];
  return lines.map((line: any) => String(line?.price?.id || "")).filter(Boolean);
}

// A Visibility object is proven by its purpose, by one of the Visibility prices this account actually
// bills, or by carrying both a known plan key and the profile it belongs to.
export function isVisibilityObject(object: any, visibilityPriceIds: string[] = []): boolean {
  const meta = metadataOf(object);
  if (meta.purpose === VISIBILITY_PURPOSE) return true;
  const ids = Array.isArray(visibilityPriceIds) ? visibilityPriceIds : [];
  if (ids.length) {
    const own = priceIdOf(object);
    if (own && ids.includes(own)) return true;
    if (linePriceIds(object).some((id) => ids.includes(id))) return true;
  }
  const planKey = String(meta.plan_key || "");
  return VISIBILITY_PLAN_KEYS.includes(planKey) && !!meta.profile_id;
}

// A Preferred object is proven by the trusted metadata the membership checkout writes, or by its purpose.
export function isPreferredObject(object: any): boolean {
  const meta = metadataOf(object);
  if (meta.purpose === PREFERRED_PURPOSE) return true;
  if (meta.client_id || meta.client_email) return true;
  return String(meta.plan || "") === "preferred_monthly";
}

// The single decision a branch consults. 'ambiguous' means the object carries markers of both flows,
// which never happens legitimately, so both branches refuse it rather than guess.
export function routeObject(object: any, visibilityPriceIds: string[] = []): ObjectRoute {
  const visibility = isVisibilityObject(object, visibilityPriceIds);
  const preferred = isPreferredObject(object);
  if (visibility && preferred) return "ambiguous";
  if (visibility) return "visibility";
  if (preferred) return "preferred";
  return "unknown";
}

// Preferred branches act unless the event belongs to a Visibility subscription. An unknown event keeps
// its existing behaviour, which is what makes this change safe for memberships already in flight.
export function preferredBranchMayAct(object: any, visibilityPriceIds: string[] = []): boolean {
  const route = routeObject(object, visibilityPriceIds);
  return route !== "visibility" && route !== "ambiguous";
}

// The Visibility branch acts only on a proven Visibility object.
export function visibilityBranchMayAct(object: any, visibilityPriceIds: string[] = []): boolean {
  return routeObject(object, visibilityPriceIds) === "visibility";
}

// A subscription-mode Checkout Session is a recurring mandate, never a media order. Its completion must
// never be matched against an unpaid media invoice, which is what the order branch does by email.
export function sessionIsRecurring(session: any): boolean {
  return String(session?.mode || "") === "subscription";
}

// A payment intent created by a subscription invoice must never be matched to a media-order invoice.
export function paymentIntentBelongsToSubscription(paymentIntent: any): boolean {
  return !!paymentIntent?.invoice;
}

// Out-of-order guard for a membership record: a late event must not reopen a membership that already
// ended. Mirrors the guard the subscription state machine applies to Visibility records.
export function preferredStatusMayChange(existingStatus: string, incomingStatus: string): boolean {
  const terminal = ["canceled", "cancelled", "expired"];
  const current = String(existingStatus || "").toLowerCase();
  const next = String(incomingStatus || "").toLowerCase();
  if (!terminal.includes(current)) return true;
  return terminal.includes(next);
}