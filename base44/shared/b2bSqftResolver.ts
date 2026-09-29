// ============================================================================
// B2B SQFT RESOLVER — Completely separate from the retail propertyDataProvider.
//
// This module NEVER imports or modifies base44/shared/propertyDataProvider.ts.
// It exists exclusively in the B2B commercial domain.
//
// Canonical B2B tiers:
//   B2B_TIER_1   ≤2,500
//   B2B_TIER_2   2,501–3,500
//   B2B_TIER_3   3,501–5,000
//   B2B_TIER_4   5,001–7,500
//   B2B_TIER_5   7,501–10,000
//   B2B_LARGE_1  10,001–12,500
//   B2B_LARGE_2  12,501–15,000
//   B2B_LARGE_3  15,001–17,500
//   B2B_LARGE_4  17,501–20,000
//   B2B_LARGE_5  20,001–25,000
//   B2B_CUSTOM   25,001+
// ============================================================================

export type B2BTier =
  | "B2B_TIER_1"
  | "B2B_TIER_2"
  | "B2B_TIER_3"
  | "B2B_TIER_4"
  | "B2B_TIER_5"
  | "B2B_LARGE_1"
  | "B2B_LARGE_2"
  | "B2B_LARGE_3"
  | "B2B_LARGE_4"
  | "B2B_LARGE_5"
  | "B2B_CUSTOM";

export const B2B_TIER_LABELS: Record<B2BTier, string> = {
  B2B_TIER_1: "0–2,500 sq ft",
  B2B_TIER_2: "2,501–3,500 sq ft",
  B2B_TIER_3: "3,501–5,000 sq ft",
  B2B_TIER_4: "5,001–7,500 sq ft",
  B2B_TIER_5: "7,501–10,000 sq ft",
  B2B_LARGE_1: "10,001–12,500 sq ft",
  B2B_LARGE_2: "12,501–15,000 sq ft",
  B2B_LARGE_3: "15,001–17,500 sq ft",
  B2B_LARGE_4: "17,501–20,000 sq ft",
  B2B_LARGE_5: "20,001–25,000 sq ft",
  B2B_CUSTOM: "25,001+ sq ft (Custom Quote)",
};

/**
 * Determine the B2B pricing tier from square footage.
 * Uses inclusive boundaries exactly as specified.
 * Returns B2B_CUSTOM for 25,001+ or when sqft is null/invalid.
 */
export function determineB2BTier(sqft: number | null): B2BTier {
  if (sqft == null || sqft <= 0 || isNaN(sqft)) return "B2B_CUSTOM";
  if (sqft <= 2500) return "B2B_TIER_1";
  if (sqft <= 3500) return "B2B_TIER_2";
  if (sqft <= 5000) return "B2B_TIER_3";
  if (sqft <= 7500) return "B2B_TIER_4";
  if (sqft <= 10000) return "B2B_TIER_5";
  if (sqft <= 12500) return "B2B_LARGE_1";
  if (sqft <= 15000) return "B2B_LARGE_2";
  if (sqft <= 17500) return "B2B_LARGE_3";
  if (sqft <= 20000) return "B2B_LARGE_4";
  if (sqft <= 25000) return "B2B_LARGE_5";
  return "B2B_CUSTOM";
}

/** Human-readable tier label for display. */
export function b2bTierLabel(tier: B2BTier): string {
  return B2B_TIER_LABELS[tier] || tier;
}

/** Whether a tier is a large-property tier (above 10,000 sqft). */
export function isB2BLargeTier(tier: B2BTier): boolean {
  return (
    tier === "B2B_LARGE_1" ||
    tier === "B2B_LARGE_2" ||
    tier === "B2B_LARGE_3" ||
    tier === "B2B_LARGE_4" ||
    tier === "B2B_LARGE_5"
  );
}

/** Whether a tier requires a custom quote. */
export function isB2BCustomTier(tier: B2BTier): boolean {
  return tier === "B2B_CUSTOM";
}