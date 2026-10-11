// ============================================================================
// MLS WALKTHROUGH PRICING — SINGLE SOURCE OF TRUTH
// ============================================================================
// Every MLS Walkthrough price in the system resolves from this module. There
// used to be four independent definitions (the pricing engine default, the
// Auto-Fund square-footage ladder, the Auto-Fund bundle-margin constant, and a
// hardcoded table inside the scheduled-booking processor). They could drift, so
// checkout, scheduled bookings, invoices and the financial ledgers could
// disagree. They now share these definitions.
//
// Two versions exist and BOTH are defined here:
//
//   V1 — AEM_MEDIA_PRICING_V1 — the price that is LIVE today.
//   V2 — AEM_MEDIA_PRICING_V2 — the price the owner approved on 2026-10-10.
//
// The live price is whichever MediaPricingConfig record has `is_active: true`.
// V1 is the active record, so the live standard price remains $100. Activating
// V2 is a data change, not a code deploy — no code path moves the live price on
// its own, so a future code push cannot change what a customer is charged.
//
// Square-footage boundaries and increments are preserved exactly. V2 moves only
// the standard (≤2,500 sqft) base, carrying the existing increments
// (+$25, +$25, +$50, +$75) over unchanged.
// ============================================================================

export type MlsPriceVersion = 'V1' | 'V2';

/** Version labels as stored on MediaPricingConfig records. */
export const MLS_PRICING_VERSION_V1 = 'AEM_MEDIA_PRICING_V1';
export const MLS_PRICING_VERSION_V2 = 'AEM_MEDIA_PRICING_V2';

/** The version whose prices are live until the owner activates V2. */
export const MLS_PRICING_VERSION_LIVE: MlsPriceVersion = 'V1';

export const MLS_PRICE_V1_BY_TIER: Record<string, number> = {
  TIER_1: 100,
  TIER_2: 125,
  TIER_3: 150,
  TIER_4: 200,
  TIER_5: 275,
};

/** The owner-approved ladder. Standard tier $120, increments preserved. */
export const MLS_PRICE_V2_BY_TIER: Record<string, number> = {
  TIER_1: 120,
  TIER_2: 145,
  TIER_3: 170,
  TIER_4: 220,
  TIER_5: 295,
};

/** Square-footage boundaries — unchanged between versions. */
export const MLS_SQFT_BANDS = [
  { tier: 'TIER_1', label: '≤2,500', min: 0, max: 2500 },
  { tier: 'TIER_2', label: '2,501–3,500', min: 2501, max: 3500 },
  { tier: 'TIER_3', label: '3,501–5,000', min: 3501, max: 5000 },
  { tier: 'TIER_4', label: '5,001–7,500', min: 5001, max: 7500 },
  { tier: 'TIER_5', label: '7,501–10,000', min: 7501, max: 10000 },
] as const;

/** The MLS ladder for a pricing version. Unknown versions fall back to the live one. */
export function mlsLadderFor(version: MlsPriceVersion): Record<string, number> {
  return version === 'V2' ? MLS_PRICE_V2_BY_TIER : MLS_PRICE_V1_BY_TIER;
}

/** Resolve a version from a MediaPricingConfig `pricing_version` label. */
export function mlsPriceVersionFromLabel(label: string | null | undefined): MlsPriceVersion {
  return String(label || '').toUpperCase().includes('V2') ? 'V2' : 'V1';
}

/** The standard (≤2,500 sqft) MLS Walkthrough price for a version. */
export function mlsStandardPrice(version: MlsPriceVersion = MLS_PRICING_VERSION_LIVE): number {
  return mlsLadderFor(version).TIER_1;
}

/** The approved standard price — used to value the Auto-Fund program. */
export const MLS_PRICE_STANDARD_APPROVED = MLS_PRICE_V2_BY_TIER.TIER_1;

/** The price live for retail customers today. */
export const MLS_PRICE_STANDARD_LIVE = MLS_PRICE_V1_BY_TIER.TIER_1;