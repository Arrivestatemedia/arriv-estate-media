// Property marketing packages — the single definition of what each tier includes, what it costs,
// and how it is placed in the directory.
//
// FREE is the published property page itself. It never expires and is never taken away because a
// paid package ended: the paid tiers only add promotional benefits on top of a page that is already
// approved and published by its owner.
//
// Nothing in here promises traffic, ranking, leads, impressions or advertising delivery. Every paid
// benefit is either a placement Arriv controls inside its own directory, or a deliverable Arriv
// produces from the customer's own approved content. Advertising spend is always separate and is
// never included, quoted or implied.

export type PackageTier = "free" | "plus" | "pro";

export const DAY_MS = 86400000;
export const PROMOTION_TERM_DAYS = 30;
export const MAX_PAUSE_DAYS = 30;

// Checkout is closed until the owner opens it deliberately. Fail-closed: a missing row means closed.
export const CHECKOUT_GATE_KEY = "PROPERTY_PACKAGE_CHECKOUT_ENABLED";

export const PACKAGE_PRICE_CENTS: Record<string, number> = { free: 0, plus: 7900, pro: 14900 };

// An active Plus customer pays only the difference to move to Pro.
export const UPGRADE_PRICE_CENTS = 7000;

export const PLACEMENT_RANK: Record<string, number> = { free: 0, none: 0, plus: 1, pro: 2 };
export const PLACEMENT_LABEL: Record<string, string> = { plus: "Featured", pro: "Priority" };

// The customer-facing refund terms. The final decision always belongs to an authorised
// administrator; these are the rules that decision is made against.
export const REFUND_POLICY = [
  "Full refund before the promotion is activated.",
  "Full refund within 48 hours of activation when no paid promotional deliverable has been provided.",
  "Prorated refund for undelivered placement days when Arriv Estate Media cannot provide the placement purchased.",
  "No automatic refund for voluntary cancellation once paid promotional services have been delivered, except where law or the published terms require otherwise.",
];

export const REFUND_DISCLOSURE =
  "Marketing packages are promotional placements and deliverables provided by Arriv Estate Media. They do not guarantee traffic, search ranking, leads, impressions or advertising results, and advertising spend is never included.";

export const ADVERTISING_UNAVAILABLE_NOTE =
  "Advertising delivery is not part of any package. Package materials prepare a campaign; buying, publishing and managing ads requires a separate agreement and a connected advertising provider.";

export const PACKAGES = [
  {
    tier: "free",
    name: "Free",
    price_cents: 0,
    price_label: "Free",
    term_days: null,
    placement: "",
    tagline: "Everything a published property page needs.",
    benefits: [
      "Public SEO-optimized property page",
      "Approved photos, video and tour links",
      "Agent and brokerage information",
      "Property directory inclusion",
      "Buyer inquiry form",
      "Agent lead delivery",
      "Basic traffic and inquiry analytics",
      "Shareable public property URL",
    ],
    unavailable: [],
  },
  {
    tier: "plus",
    name: "Visibility Plus",
    price_cents: PACKAGE_PRICE_CENTS.plus,
    price_label: "$79",
    term_days: PROMOTION_TERM_DAYS,
    placement: "Featured",
    tagline: "30 days of featured placement and ready-to-post marketing.",
    benefits: [
      "Everything in Free",
      "Enhanced property presentation",
      "Featured placement in the Arriv directory",
      "Branded downloadable social graphics",
      "Ready-to-post Facebook and Instagram captions",
      "Shareable marketing links with campaign tracking",
      "Enhanced lead and traffic reporting",
      "30-day marketing performance summary",
    ],
    unavailable: [],
  },
  {
    tier: "pro",
    name: "Visibility Pro",
    price_cents: PACKAGE_PRICE_CENTS.pro,
    price_label: "$149",
    term_days: PROMOTION_TERM_DAYS,
    placement: "Priority",
    tagline: "30 days of priority placement plus campaign preparation.",
    benefits: [
      "Everything in Plus",
      "Priority placement above featured listings",
      "Additional graphics and caption variations",
      "Campaign-ready promotional materials",
      "Suggested campaign structure and geographic targeting",
      "UTM-tagged destination links",
      "Advanced lead-source and conversion reporting",
      "Weekly performance summaries",
      "Campaign preparation area",
    ],
    // Deliberately listed as NOT included, so no customer can read Pro as including ad spend.
    unavailable: [
      "Buying, publishing or managing Google or Meta advertisements",
      "Advertising spend of any kind",
      "Guaranteed traffic, ranking, leads or impressions",
    ],
  },
];

export function packageFor(tier: string) {
  return PACKAGES.find((p) => p.tier === String(tier || "").toLowerCase()) || PACKAGES[0];
}

export function rankFor(tier: string): number {
  return PLACEMENT_RANK[String(tier || "").toLowerCase()] || 0;
}

export function placementLabelFor(tier: string): string {
  return PLACEMENT_LABEL[String(tier || "").toLowerCase()] || "";
}

export function isPaidTier(tier: string): boolean {
  return ["plus", "pro"].includes(String(tier || "").toLowerCase());
}

export function priceLabelFromCents(cents: number): string {
  const n = Number(cents || 0);
  return n % 100 === 0 ? `$${(n / 100).toLocaleString("en-US")}` : `$${(n / 100).toFixed(2)}`;
}

// Checkout gate. Fail closed: only an explicit "true" opens it.
export async function isCheckoutEnabled(client: any): Promise<boolean> {
  try {
    const rows = await client.asServiceRole.entities.AppSetting.filter({ key: CHECKOUT_GATE_KEY });
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    return String(list?.[0]?.value ?? "false").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

// Advice for the administrator deciding a refund — never an automatic payout.
export function refundAdvice(promotion: any, now = new Date()): { eligible: boolean; rule: string } {
  if (!promotion) return { eligible: false, rule: "No promotion" };
  if (promotion.status === "pending_payment") return { eligible: true, rule: "Full refund: promotion never activated." };
  if (promotion.refund_status === "full" || promotion.refund_status === "partial") {
    return { eligible: false, rule: "A refund has already been decided for this promotion." };
  }
  const activatedAt = Date.parse(String(promotion.activated_at || ""));
  if (Number.isFinite(activatedAt) && now.getTime() - activatedAt <= 48 * 3600000) {
    return { eligible: true, rule: "Full refund available: within 48 hours of activation." };
  }
  if (promotion.status === "active" || promotion.status === "paused") {
    const endsAt = Date.parse(String(promotion.ends_at || ""));
    if (Number.isFinite(endsAt) && endsAt > now.getTime() && promotion.ended_reason === "arriv_cannot_serve") {
      return { eligible: true, rule: "Prorated refund for undelivered placement days." };
    }
  }
  return { eligible: false, rule: "Discretionary: requires an authorised administrative decision." };
}