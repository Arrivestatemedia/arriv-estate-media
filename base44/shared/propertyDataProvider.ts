// ============================================================================
// PROPERTY DATA PROVIDER — Abstraction for property square-footage lookup.
// Google Maps provides geocoding but NOT living-area square footage.
// This interface allows the actual property-data provider (e.g. Zillow,
// Realtor.com, county records API) to be configured without rewriting
// pricing logic. NEVER invent square footage.
// ============================================================================

export type PropertyLookupStatus =
  | "VERIFIED"
  | "MANUAL_REQUIRED"
  | "REVIEW_REQUIRED"
  | "CUSTOM_QUOTE_REQUIRED"
  | "FAILED";

export type SqftVerificationMethod =
  | "provider_api"
  | "manual_customer"
  | "manual_sales"
  | "manual_admin"
  | "admin_override";

export interface PropertyLookupResult {
  status: PropertyLookupStatus;
  normalized_address: string;
  property_lat: number | null;
  property_lng: number | null;
  property_sqft: number | null;
  property_sqft_source: string;
  property_sqft_source_record_id: string;
  property_sqft_verified: boolean;
  property_sqft_verification_method: SqftVerificationMethod | null;
  property_pricing_tier: string;
  lookup_error: string | null;
}

export interface PropertyDataProvider {
  /** Unique provider identifier (e.g. "null", "zillow", "realtor"). */
  readonly providerId: string;

  /** Whether this provider can actually look up sqft (vs. a null placeholder). */
  readonly canLookup: boolean;

  /** Look up property data for a given address. */
  lookupProperty(address: string): Promise<PropertyLookupResult>;
}

/**
 * Null provider — returns MANUAL_REQUIRED for every address.
 * This is the default when no property-data provider is configured.
 * The pricing engine still works; the customer or sales rep enters sqft manually.
 */
class NullPropertyDataProvider implements PropertyDataProvider {
  readonly providerId = "null";
  readonly canLookup = false;

  async lookupProperty(address: string): Promise<PropertyLookupResult> {
    return {
      status: "MANUAL_REQUIRED",
      normalized_address: address,
      property_lat: null,
      property_lng: null,
      property_sqft: null,
      property_sqft_source: "none",
      property_sqft_source_record_id: "",
      property_sqft_verified: false,
      property_sqft_verification_method: null,
      property_pricing_tier: "UNKNOWN",
      lookup_error: null,
    };
  }
}

/**
 * Factory: returns the configured property data provider.
 * Currently always returns the null provider.
 * To enable real lookups, implement a new provider class and return it here
 * based on a secret/env flag (e.g. PROPERTY_DATA_PROVIDER=zillow).
 */
export function getPropertyDataProvider(): PropertyDataProvider {
  return new NullPropertyDataProvider();
}

/**
 * Determine the pricing tier from square footage.
 * Uses inclusive boundaries exactly as specified:
 * 0–2,500 = TIER_1, 2,501–3,500 = TIER_2, 3,501–5,000 = TIER_3,
 * 5,001–7,500 = TIER_4, 7,501–10,000 = TIER_5, 10,001+ = CUSTOM
 */
export function determinePricingTier(sqft: number | null): string {
  if (sqft == null || sqft <= 0) return "UNKNOWN";
  if (sqft <= 2500) return "TIER_1";
  if (sqft <= 3500) return "TIER_2";
  if (sqft <= 5000) return "TIER_3";
  if (sqft <= 7500) return "TIER_4";
  if (sqft <= 10000) return "TIER_5";
  return "CUSTOM";
}

/** Human-readable tier label for display. */
export function tierLabel(tier: string): string {
  const labels: Record<string, string> = {
    TIER_1: "0–2,500 sq ft",
    TIER_2: "2,501–3,500 sq ft",
    TIER_3: "3,501–5,000 sq ft",
    TIER_4: "5,001–7,500 sq ft",
    TIER_5: "7,501–10,000 sq ft",
    CUSTOM: "10,001+ sq ft (Custom Quote)",
    UNKNOWN: "Property size not yet determined",
  };
  return labels[tier] || tier;
}