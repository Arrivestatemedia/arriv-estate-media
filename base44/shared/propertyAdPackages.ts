// Advertising packages — the single definition of what each Arriv-managed advertising campaign
// costs, how much of that money is reserved for real platform advertising spend, and what the
// customer is told before they buy.
//
// These products are deliberately separate from Visibility Plus ($79) and Visibility Pro ($149):
// advertising is never bundled into a visibility package and never implied by one. Advertising
// spend is included in these prices and the split is disclosed line by line.
//
// Nothing here promises impressions, reach, clicks, leads or sales. Every package is a managed
// service with no delivery guarantee.

export type AdPackageTier = "starter" | "growth" | "premium";

export const AD_PRICE_CENTS: Record<AdPackageTier, number> = {
  starter: 14900,
  growth: 29900,
  premium: 59900,
};

// The advertising budget is reserved customer money. It is never Arriv revenue and it is never
// spendable outside its own campaign.
export const AD_BUDGET_CENTS: Record<AdPackageTier, number> = {
  starter: 7500,
  growth: 17500,
  premium: 40000,
};

export const AD_FEE_CENTS: Record<AdPackageTier, number> = {
  starter: 7400,
  growth: 12400,
  premium: 19900,
};

export const AD_DURATION_DAYS: Record<AdPackageTier, number> = {
  starter: 7,
  growth: 14,
  premium: 30,
};

export const AD_CREATIVE_VARIATIONS: Record<AdPackageTier, number> = {
  starter: 1,
  growth: 3,
  premium: 5,
};

export const RECOMMENDED_AD_TIER: AdPackageTier = "growth";

export const AD_AGREEMENT_VERSION = "2026-11-property-advertising-v1";

// Platform policy: housing advertising requires Meta's Special Ad Category, which removes age,
// gender, detailed-interest, lookalike and custom-audience targeting.
export const AD_SPECIAL_CATEGORY = "HOUSING";

// The authorization the customer must accept, in their own words, before a payment is taken.
export const AD_AUTHORIZATION_POINTS = [
  "I am authorized to advertise this property.",
  "The property information and media provided are accurate and approved for advertising use.",
  "Arriv Estate Media may use my approved photography and video in paid advertising for this property.",
  "Arriv Estate Media will create and manage this campaign through its own advertising accounts, not mine.",
  "The advertising spend is included in the package price I am paying, as shown in the breakdown.",
  "My card is authorized when I reserve this campaign and charged only when it actually starts running.",
  "Impressions, reach, clicks, leads and sales are not guaranteed.",
  "The advertising platform may review, limit or reject the campaign, and that can delay or prevent delivery.",
  "This advertising will comply with applicable MLS, brokerage, fair housing, privacy and advertising rules.",
  "I understand the campaign ends on its scheduled end date and is not renewed automatically.",
];

export const AD_REFUND_POLICY = [
  "Nothing is charged when a campaign is reserved: the card is only held, and a campaign that never starts releases that hold.",
  "Full refund when a campaign cannot launch and no advertising budget has been spent.",
  "Refund review when the advertising platform rejects a campaign and no advertising budget has been spent.",
  "Unused advertising budget is reconciled when a campaign ends early, and any amount not spent is reviewed for refund.",
  "Partial refunds are available where part of the advertising budget has been spent and part has not.",
  "Advertising spend already incurred at the platform is never refunded.",
  "No refund is issued without an administrator's recorded decision.",
];

export const AD_DISCLOSURE =
  "Arriv Estate Media creates, publishes and manages this campaign inside its own advertising accounts. The price includes both the advertising budget and the management fee, shown separately. Arriv does not guarantee impressions, reach, clicks, leads or sales, and no advertising result is promised.";

export const AD_ELIGIBILITY_NOTE =
  "You can reserve a campaign at any time. Nothing is charged when you reserve it: your card is held and charged only once the property page is approved, live and still shown as available, and the campaign is about to start. Its paid days begin on the day it launches.";

export const AD_PLATFORM_NOTE =
  "Campaigns run on Meta advertising and must use the Housing special ad category. Targeting is location-based only.";

export const AD_PACKAGES = [
  {
    tier: "starter" as AdPackageTier,
    name: "Starter Campaign",
    price_cents: AD_PRICE_CENTS.starter,
    price_label: "$149",
    ad_budget_cents: AD_BUDGET_CENTS.starter,
    ad_budget_label: "$75",
    management_fee_cents: AD_FEE_CENTS.starter,
    management_fee_label: "$74",
    duration_days: AD_DURATION_DAYS.starter,
    duration_label: "7-day campaign",
    recommended: false,
    platform: "meta",
    tagline: "A short, focused housing campaign on Meta.",
    benefits: [
      "One Meta housing advertising campaign",
      "Approved property photography or video",
      "Automated advertising copy",
      "Property landing-page link",
      "Basic performance reporting",
    ],
  },
  {
    tier: "growth" as AdPackageTier,
    name: "Growth Campaign",
    price_cents: AD_PRICE_CENTS.growth,
    price_label: "$299",
    ad_budget_cents: AD_BUDGET_CENTS.growth,
    ad_budget_label: "$175",
    management_fee_cents: AD_FEE_CENTS.growth,
    management_fee_label: "$124",
    duration_days: AD_DURATION_DAYS.growth,
    duration_label: "14-day campaign",
    recommended: true,
    platform: "meta",
    tagline: "Two weeks of managed housing advertising with creative variations.",
    benefits: [
      "One Meta housing advertising campaign",
      "Multiple approved creative variations",
      "Automated campaign monitoring",
      "Campaign performance dashboard",
      "Final performance summary",
    ],
  },
  {
    tier: "premium" as AdPackageTier,
    name: "Premium Campaign",
    price_cents: AD_PRICE_CENTS.premium,
    price_label: "$599",
    ad_budget_cents: AD_BUDGET_CENTS.premium,
    ad_budget_label: "$400",
    management_fee_cents: AD_FEE_CENTS.premium,
    management_fee_label: "$199",
    duration_days: AD_DURATION_DAYS.premium,
    duration_label: "30-day campaign",
    recommended: false,
    platform: "meta",
    tagline: "A month of managed housing advertising with monitored optimization.",
    benefits: [
      "One Meta housing advertising campaign",
      "Multiple creative variations",
      "Periodic automated optimization within authorized changes",
      "Detailed reporting",
      "Final campaign performance summary",
    ],
  },
];

export function adPackage(tier: string) {
  return AD_PACKAGES.find((p) => p.tier === tier) || null;
}

export function isAdTier(tier: string): tier is AdPackageTier {
  return tier === "starter" || tier === "growth" || tier === "premium";
}

export function money(cents: number | null | undefined): string {
  const value = Number(cents || 0);
  return `$${(value / 100).toFixed(2).replace(/\.00$/, "")}`;
}

// Published card-processing estimate. Recorded for profitability reporting only; the customer is
// never charged it separately.
export function estimatedProcessingFee(totalCents: number): number {
  if (!totalCents) return 0;
  return Math.round(totalCents * 0.029) + 30;
}

export function adQuote(tier: string) {
  const pkg = adPackage(tier);
  if (!pkg) return null;
  const processing = estimatedProcessingFee(pkg.price_cents);
  return {
    ...pkg,
    processing_fee_estimate_cents: processing,
    // What remains for Arriv after the reserved ad budget and processing cost.
    estimated_contribution_cents: pkg.price_cents - pkg.ad_budget_cents - processing,
    spend_included: true,
    auto_renew: false,
  };
}

export function adFinancials(tier: string) {
  const pkg = adPackage(tier);
  if (!pkg) return null;
  return {
    total_cents: pkg.price_cents,
    ad_budget_cents: pkg.ad_budget_cents,
    management_fee_cents: pkg.management_fee_cents,
    duration_days: pkg.duration_days,
  };
}

export function authorizationSnapshot(input: {
  address: string;
  tier: string;
  totalCents: number;
  adBudgetCents: number;
  feeCents: number;
  durationDays: number;
  provider: string;
}): string {
  return [
    `Advertising authorization — ${AD_AGREEMENT_VERSION}`,
    `Property: ${input.address}`,
    `Package: ${input.tier} (${money(input.totalCents)} total)`,
    `Advertising budget: ${money(input.adBudgetCents)}`,
    `Management fee: ${money(input.feeCents)}`,
    `Duration: ${input.durationDays} days`,
    `Platform: ${input.provider}`,
    `Special ad category: ${AD_SPECIAL_CATEGORY}`,
    "",
    ...AD_AUTHORIZATION_POINTS.map((line, index) => `${index + 1}. ${line}`),
  ].join("\n");
}

export function adTermsSummary(): string[] {
  return [AD_DISCLOSURE, ...AD_REFUND_POLICY];
}