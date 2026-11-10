// Visibility subscription products — the single definition of what each recurring plan costs and
// what it unlocks.
//
// These plans are a separate product family from the Phase 2 visibility packages (one-time, on a
// property) and the Phase 3 advertising campaigns (one-time, on a campaign). Nothing here reads or
// changes either of those records: a subscription only ever grants the benefits listed below.

export const PLAN_KEYS = ["agent_presence", "agent_growth", "brokerage"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanEntitlements {
  directory_priority: number;
  enhanced_profile: boolean;
  expanded_showcase: boolean;
  showcase_limit: number;
  marketing_graphics: boolean;
  enhanced_reporting: boolean;
  monthly_summary: boolean;
  team_reporting: boolean;
  agent_management: boolean;
  inquiry_routing: boolean;
}

// What a profile keeps with no active subscription: a published profile, its own property pages and
// its inquiry form. Everything paid sits on top of this and is never needed for the free page.
export const FREE_ENTITLEMENTS: PlanEntitlements = {
  directory_priority: 0,
  enhanced_profile: false,
  expanded_showcase: false,
  showcase_limit: 3,
  marketing_graphics: false,
  enhanced_reporting: false,
  monthly_summary: false,
  team_reporting: false,
  agent_management: false,
  inquiry_routing: true,
};

export const RECURRING_DISCLOSURE =
  "This is a monthly subscription that renews automatically at the price shown until you cancel. " +
  "You can cancel at any time from your Subscription & Visibility dashboard and your benefits continue " +
  "until the end of the period you already paid for. Prices are monthly, exclusive of any tax Stripe calculates.";

export const SEAT_POLICY_TEXT: Record<string, string> = {
  included_only: "Includes the listed seats. Additional seats are not available on this plan.",
  per_seat: "Includes the listed seats. Additional seats can be added at the monthly seat price shown.",
  contact_support: "Includes the listed seats. Contact your Arriv representative before adding more.",
};

export const DOWNGRADE_POLICY_TEXT =
  "When a subscription ends, paid benefits stop: directory priority, enhanced profile layout, marketing " +
  "graphics, monthly summaries and team reporting. Your profile and your property pages stay exactly as " +
  "authorized, and every lead, report and invoice already recorded stays in your account.";

const AGENT_PRESENCE_FEATURES = [
  "Public agent profile with your biography and branding",
  "Business contact information and brokerage affiliation",
  "Your active Arriv property listings",
  "Inclusion in the agent directory",
  "Profile inquiry form with leads delivered to you",
  "Basic profile traffic and inquiry reporting",
];

const AGENT_GROWTH_FEATURES = [
  "Everything in Agent Presence",
  "Enhanced profile layout",
  "Priority placement within eligible agent directory results",
  "Expanded property showcase",
  "Lead-source reporting",
  "Downloadable marketing graphics",
  "Monthly performance summary",
];

const BROKERAGE_FEATURES = [
  "Public brokerage profile with your branding",
  "Configurable agent roster",
  "Active Arriv property showcase",
  "Brokerage inquiry form with routing to your team",
  "Team reporting dashboard",
  "Agent profile management",
  "Brokerage directory inclusion",
];

// Administrator-editable defaults. Stored records win over these, so pricing can be changed without
// a deploy; these exist so the system always has a complete, correct product definition.
export const DEFAULT_PLAN_PRODUCTS = [
  {
    product_key: "agent_presence",
    tier: "agent_presence",
    name: "Agent Presence",
    tagline: "Be found where buyers and sellers are already looking.",
    price_cents: 4900,
    currency: "usd",
    interval: "month",
    seats_included: 1,
    additional_seat_price_cents: 0,
    seat_policy: "included_only",
    features: AGENT_PRESENCE_FEATURES,
    entitlements: { ...FREE_ENTITLEMENTS, showcase_limit: 6 },
    disclosure: RECURRING_DISCLOSURE,
    terms_version: "2026-11",
    active: true,
    sort_order: 1,
  },
  {
    product_key: "agent_growth",
    tier: "agent_growth",
    name: "Agent Growth",
    tagline: "Priority placement and the reporting that shows what worked.",
    price_cents: 9900,
    currency: "usd",
    interval: "month",
    seats_included: 1,
    additional_seat_price_cents: 0,
    seat_policy: "included_only",
    features: AGENT_GROWTH_FEATURES,
    entitlements: {
      ...FREE_ENTITLEMENTS,
      directory_priority: 20,
      enhanced_profile: true,
      expanded_showcase: true,
      showcase_limit: 12,
      marketing_graphics: true,
      enhanced_reporting: true,
      monthly_summary: true,
    },
    disclosure: RECURRING_DISCLOSURE,
    terms_version: "2026-11",
    active: true,
    sort_order: 2,
  },
  {
    product_key: "brokerage",
    tier: "brokerage",
    name: "Brokerage",
    tagline: "One profile, your roster, and leads routed to the right desk.",
    price_cents: 24900,
    currency: "usd",
    interval: "month",
    seats_included: 3,
    additional_seat_price_cents: 2900,
    seat_policy: "per_seat",
    features: BROKERAGE_FEATURES,
    entitlements: {
      ...FREE_ENTITLEMENTS,
      directory_priority: 20,
      enhanced_profile: true,
      expanded_showcase: true,
      showcase_limit: 24,
      team_reporting: true,
      agent_management: true,
      enhanced_reporting: true,
      monthly_summary: true,
      marketing_graphics: true,
    },
    disclosure: RECURRING_DISCLOSURE,
    terms_version: "2026-11",
    active: true,
    sort_order: 3,
  },
];

export function planPriceLabel(cents: number): string {
  const value = Number(cents || 0) / 100;
  return value % 1 === 0 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}

export function isPlanKey(value: any): boolean {
  return PLAN_KEYS.includes(String(value || "") as PlanKey);
}

// A stored product merged over its default, so a record missing a field can never present a plan
// with undefined benefits.
export function normalizePlan(record: any): any {
  const fallback = DEFAULT_PLAN_PRODUCTS.find((p) => p.product_key === record?.product_key) || DEFAULT_PLAN_PRODUCTS[0];
  return {
    ...fallback,
    ...(record || {}),
    entitlements: { ...fallback.entitlements, ...(record?.entitlements || {}) },
    features: Array.isArray(record?.features) && record.features.length ? record.features : fallback.features,
  };
}

export function planCatalog(records: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const record of records || []) {
    if (!record?.product_key || record.active === false) continue;
    byKey.set(String(record.product_key), normalizePlan(record));
  }
  if (!byKey.size) return DEFAULT_PLAN_PRODUCTS.map((p) => normalizePlan(p));
  return [...byKey.values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

export function planFor(records: any[], planKey: string): any | null {
  const normalized = String(planKey || "");
  if (!isPlanKey(normalized)) return null;
  return planCatalog(records).find((p) => p.product_key === normalized) || null;
}

export function benefitsActive(status: string): boolean {
  return String(status || "") === "active";
}

// Entitlements are always recomputed from the subscription's own state. A stored plan_key is display
// only and is never trusted to unlock anything.
export function entitlementsFor(planKey: string, status: string): PlanEntitlements {
  if (!benefitsActive(status)) return { ...FREE_ENTITLEMENTS };
  const plan = DEFAULT_PLAN_PRODUCTS.find((p) => p.product_key === String(planKey || ""));
  return { ...FREE_ENTITLEMENTS, ...(plan?.entitlements || {}) };
}

export function seatAllowance(plan: any, seatsPurchased = 0): { included: number; purchased: number; total: number; canAdd: boolean; additionalPriceLabel: string } {
  const included = Number(plan?.seats_included ?? 1);
  const purchased = Math.max(0, Number(seatsPurchased || 0));
  return {
    included,
    purchased,
    total: included + purchased,
    canAdd: plan?.seat_policy === "per_seat" && Number(plan?.additional_seat_price_cents || 0) > 0,
    additionalPriceLabel: planPriceLabel(Number(plan?.additional_seat_price_cents || 0)),
  };
}

// Plan changes are priced explicitly: an upgrade takes effect immediately with proration, a downgrade
// takes effect at the next renewal so the customer is never credited and re-charged twice in a month.
export function planChangePolicy(fromPlanKey: string, toPlanKey: string): { allowed: boolean; direction: "upgrade" | "downgrade" | "lateral" | "none"; timing: "immediate" | "next_cycle"; prorate: boolean; note: string } {
  const from = DEFAULT_PLAN_PRODUCTS.find((p) => p.product_key === String(fromPlanKey || ""));
  const to = DEFAULT_PLAN_PRODUCTS.find((p) => p.product_key === String(toPlanKey || ""));
  if (!from || !to) return { allowed: false, direction: "none", timing: "next_cycle", prorate: false, note: "Unknown plan." };
  if (from.product_key === to.product_key) return { allowed: false, direction: "none", timing: "next_cycle", prorate: false, note: "That is already the current plan." };
  const upgrade = to.price_cents > from.price_cents;
  return {
    allowed: true,
    direction: upgrade ? "upgrade" : "downgrade",
    timing: upgrade ? "immediate" : "next_cycle",
    prorate: upgrade,
    note: upgrade
      ? "Upgrades take effect immediately. Stripe charges the prorated difference for the rest of this billing period."
      : "Downgrades take effect at the next renewal, so the period you already paid for is delivered in full.",
  };
}