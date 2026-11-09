// mlsRegions.ts
// The MLS service-area map that decides which MLS workflow a property belongs to.
//
// A customer never chooses a provider. The property's own booking address is matched against the
// configured service areas below, and only the workflow for the matched area is ever offered.
//
// The map is data, not code: it lives in AppSetting under `mls_service_regions` (a JSON array of
// regions keyed by id, merged over the defaults) so an administrator can correct a county, add a
// zip prefix or mark a region verified without a deploy. A region only routes live traffic once it
// is BOTH enabled and verified — an unverified region sends the case to administrative review
// instead of guessing.
//
// Matching precedence is most-specific-first: zip prefix, then county, then city, then state. If the
// winning level matches regions belonging to more than one provider the coverage is overlapping and
// the case goes to administrative review — never to a customer-facing provider choice.

export const MLS_SERVICE_REGIONS_KEY = "mls_service_regions";

export interface MlsServiceRegion {
  id: string;
  label: string;
  provider_id: string;
  /** Two-letter state codes. An empty array means "no state-wide scope". */
  states: string[];
  /** County names, without the word "County". */
  counties: string[];
  cities: string[];
  /** 3-digit zip prefixes, e.g. "300" matches 300xx. */
  zip_prefixes: string[];
  enabled: boolean;
  /** Only a verified region may route a customer automatically. */
  verified: boolean;
  verified_at?: string;
  verified_by?: string;
  notes: string;
}

export const DEFAULT_MLS_SERVICE_REGIONS: MlsServiceRegion[] = [
  {
    id: "fmls_georgia",
    label: "Georgia — FMLS service area",
    provider_id: "fmls",
    states: ["GA"],
    counties: [],
    cities: [],
    zip_prefixes: [],
    enabled: true,
    verified: true,
    verified_at: "2026-01-01T00:00:00.000Z",
    verified_by: "system-default",
    notes:
      "FMLS (First Multiple Listing Service) is the MLS Arriv uploads to for Georgia properties. " +
      "State-wide scope preserves the FMLS workflow these jobs have always used; add zip prefixes or " +
      "counties here to narrow coverage as FMLS confirms them.",
  },
  {
    id: "bright_mid_atlantic",
    label: "Mid-Atlantic — Bright MLS service area",
    provider_id: "bright_mls",
    states: ["DC", "MD", "VA", "DE", "PA", "NJ", "WV"],
    counties: [],
    cities: [],
    zip_prefixes: [],
    enabled: false,
    verified: false,
    notes:
      "Bright MLS publishes its service area county by county. Confirm the county list with Bright and " +
      "mark this region verified before enabling it; until then Bright addresses route to administrative " +
      "review and Bright Media Sync stays off for customers.",
  },
];

export function normalizeServiceRegion(raw: any, fallback: MlsServiceRegion | null): MlsServiceRegion {
  const source = raw || {};
  const base = fallback || {
    id: String(source.id || ""),
    label: String(source.label || source.id || "Service area"),
    provider_id: String(source.provider_id || ""),
    states: [],
    counties: [],
    cities: [],
    zip_prefixes: [],
    enabled: false,
    verified: false,
    notes: "",
  };
  const list = (value: any, upper = false) =>
    Array.isArray(value)
      ? value.map((v: any) => String(v || "").trim()).filter(Boolean).map((v: string) => (upper ? v.toUpperCase() : v))
      : base as any;
  return {
    id: String(source.id || base.id),
    label: source.label !== undefined ? String(source.label) : base.label,
    provider_id: String(source.provider_id || base.provider_id),
    states: Array.isArray(source.states) ? list(source.states, true) : base.states,
    counties: Array.isArray(source.counties) ? list(source.counties) : base.counties,
    cities: Array.isArray(source.cities) ? list(source.cities) : base.cities,
    zip_prefixes: Array.isArray(source.zip_prefixes)
      ? source.zip_prefixes.map((z: any) => String(z || "").trim()).filter((z: string) => /^\d{3,5}$/.test(z))
      : base.zip_prefixes,
    enabled: source.enabled !== undefined ? source.enabled === true : base.enabled,
    verified: source.verified !== undefined ? source.verified === true : base.verified,
    verified_at: source.verified_at || base.verified_at,
    verified_by: source.verified_by || base.verified_by,
    notes: source.notes !== undefined ? String(source.notes) : base.notes,
  };
}

/** Configured regions, merged over the documented defaults. A malformed value never breaks routing. */
export async function loadMlsServiceRegions(base44: any): Promise<MlsServiceRegion[]> {
  const defaults = DEFAULT_MLS_SERVICE_REGIONS.map((r) => normalizeServiceRegion(r, null));
  try {
    const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: MLS_SERVICE_REGIONS_KEY }, undefined, 1);
    const raw = rows?.[0]?.value;
    if (!raw) return defaults;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const configured = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.regions) ? parsed.regions : [];
    if (configured.length === 0) return defaults;

    const merged = defaults.map((region) => {
      const override = configured.find((c: any) => String(c?.id || "") === region.id);
      return override ? normalizeServiceRegion(override, region) : region;
    });
    configured.forEach((c: any) => {
      const id = String(c?.id || "").trim();
      if (!id || merged.some((r) => r.id === id)) return;
      merged.push(normalizeServiceRegion(c, null));
    });
    return merged;
  } catch {
    return defaults;
  }
}

export interface PropertyLocation {
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
}

/** Pulls city / state / zip out of whichever address fields the booking or job actually has. */
export function parsePropertyLocation(address: string, city?: string, state?: string, zip?: string, county?: string): PropertyLocation {
  const raw = String(address || "").trim();
  const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
  const stateMatch = raw.match(/(?:^|[,\s])([A-Z]{2})\s*(?:\d{5}(?:-\d{4})?)?\s*$/);
  const cityMatch = raw.match(/,\s*([A-Za-z][A-Za-z .'-]*?)\s*,\s*[A-Z]{2}\s*(?:\d{5})?\s*$/);
  const countyMatch = raw.match(/([A-Za-z .'-]+?)\s+County\b/i);
  return {
    address: raw,
    city: String(city || cityMatch?.[1] || "").trim(),
    state: String(state || stateMatch?.[1] || "").trim().toUpperCase(),
    zip: String(zip || zipMatch?.[1] || "").trim(),
    county: String(county || countyMatch?.[1] || "").trim(),
  };
}

export type MlsRoutingBasis = "zip" | "county" | "city" | "state" | "none";

export interface MlsRegionMatch {
  region_id: string;
  provider_id: string;
  region_label: string;
  basis: MlsRoutingBasis;
}

export type MlsRoutingStatus = "resolved" | "pending_activation" | "review" | "unsupported";

export interface MlsRegionResolution {
  status: MlsRoutingStatus;
  reason: string;
  basis: MlsRoutingBasis;
  provider_id: string | null;
  provider_live: boolean;
  region_id: string | null;
  region_label: string | null;
  matches: MlsRegionMatch[];
  location: PropertyLocation;
}

function regionMatchesAt(region: MlsServiceRegion, location: PropertyLocation, basis: MlsRoutingBasis): boolean {
  if (basis === "zip") {
    const zip = location.zip;
    if (!zip || region.zip_prefixes.length === 0) return false;
    return region.zip_prefixes.some((prefix) => zip.startsWith(prefix));
  }
  if (basis === "county") {
    if (!location.county || region.counties.length === 0) return false;
    const wanted = location.county.toLowerCase();
    return region.counties.some((c) => c.toLowerCase() === wanted);
  }
  if (basis === "city") {
    if (!location.city || region.cities.length === 0) return false;
    const wanted = location.city.toLowerCase();
    return region.cities.some((c) => c.toLowerCase() === wanted);
  }
  if (basis === "state") {
    if (!location.state || region.states.length === 0) return false;
    return region.states.includes(location.state);
  }
  return false;
}

const BASIS_ORDER: MlsRoutingBasis[] = ["zip", "county", "city", "state"];

/**
 * Decides the MLS workflow for one property.
 * `isLive(providerId)` says whether that provider's integration may serve customers today.
 */
export function resolveMlsRegion(
  regions: MlsServiceRegion[],
  location: PropertyLocation,
  isLive: (providerId: string) => boolean = () => true,
): MlsRegionResolution {
  const active = (regions || []).filter((r) => r && r.enabled && String(r.provider_id || "").trim());
  const base = {
    location,
    provider_id: null as string | null,
    provider_live: false,
    region_id: null as string | null,
    region_label: null as string | null,
    matches: [] as MlsRegionMatch[],
  };

  if (!location.state && !location.zip) {
    return { ...base, status: "review", reason: "missing_location", basis: "none" };
  }

  for (const basis of BASIS_ORDER) {
    const matches: MlsRegionMatch[] = [];
    active.forEach((region) => {
      if (regionMatchesAt(region, location, basis)) {
        matches.push({ region_id: region.id, provider_id: region.provider_id, region_label: region.label, basis });
      }
    });
    if (matches.length === 0) continue;

    const providers = Array.from(new Set(matches.map((m) => m.provider_id)));
    if (providers.length > 1) {
      return { ...base, status: "review", reason: "overlapping_coverage", basis, matches };
    }

    const providerId = providers[0];
    const region = active.find((r) => r.id === matches[0].region_id)!;
    const live = isLive(providerId);

    if (!region.verified) {
      return {
        ...base,
        status: "review",
        reason: "region_unverified",
        basis,
        provider_id: providerId,
        provider_live: live,
        region_id: region.id,
        region_label: region.label,
        matches,
      };
    }

    return {
      ...base,
      status: live ? "resolved" : "pending_activation",
      reason: live ? "region_resolved" : "provider_not_live",
      basis,
      provider_id: providerId,
      provider_live: live,
      region_id: region.id,
      region_label: region.label,
      matches,
    };
  }

  return { ...base, status: "unsupported", reason: "outside_coverage", basis: "none" };
}

/** The customer-facing sentence for a resolution. Never names another provider as an option. */
export function describeRouting(resolution: MlsRegionResolution, providerLabel?: string | null): string {
  const label = providerLabel || "your MLS";
  switch (resolution.status) {
    case "resolved":
      return `${resolution.region_label} covers this property, so Arriv publishes through ${label}.`;
    case "pending_activation":
      return `${resolution.region_label} is served by ${label}. Arriv is finishing activation of that route, so your request goes to our MLS team to publish for you.`;
    case "review":
      return "We're confirming which MLS serves this property. Arriv will review your request before anything is published.";
    default:
      return "Arriv doesn't publish to an MLS for this address yet. You can still download your full gallery.";
  }
}