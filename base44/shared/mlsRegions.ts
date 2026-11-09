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
// Matching precedence is most-specific-first: zip prefix, then county, then city, then the provider's
// official jurisdiction list (normalized state + county/independent city), then state. If the winning
// level matches regions belonging to more than one provider the coverage is overlapping and the case
// goes to administrative review — never to a customer-facing provider choice.
//
// A state listed in `states` is the SCOPE of a region's map, not proof of state-wide coverage: a
// region that carries jurisdictions (or counties, cities or zips) never matches on state alone. That
// is what keeps a county-by-county provider like Bright MLS from claiming an entire state.

import {
  BRIGHT_DMV_JURISDICTIONS,
  BRIGHT_SERVICE_AREA_SOURCE,
  BRIGHT_SERVICE_AREA_STATES,
  type MlsJurisdiction,
} from "./brightServiceArea.ts";

export type { MlsJurisdiction, MlsJurisdictionKind } from "./brightServiceArea.ts";

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
  /**
   * The provider's official jurisdiction list, keyed by state. When present this is the only way the
   * region can match an address: state plus county or independent city, normalized. Empty for a
   * genuinely state-wide provider such as FMLS.
   */
  jurisdictions: MlsJurisdiction[];
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
    jurisdictions: [],
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
    label: "DMV — Bright MLS service area",
    provider_id: "bright_mls",
    states: BRIGHT_SERVICE_AREA_STATES,
    counties: [],
    cities: [],
    zip_prefixes: [],
    jurisdictions: BRIGHT_DMV_JURISDICTIONS,
    // Coverage is verified against Bright's published jurisdiction list; the route itself stays
    // unactivated until every integration certification test has passed. An eligible property is
    // therefore named as Bright's and worked by our MLS team, not published automatically.
    enabled: false,
    verified: true,
    verified_at: "2026-11-09T00:00:00.000Z",
    verified_by: "bright-published-service-area",
    notes:
      `${BRIGHT_SERVICE_AREA_SOURCE.label} (${BRIGHT_SERVICE_AREA_SOURCE.url}, retrieved ` +
      `${BRIGHT_SERVICE_AREA_SOURCE.retrieved_at}): all of Washington, D.C.; all Maryland counties plus ` +
      "Baltimore City; and the Virginia counties and independent cities Bright publishes. Matched on " +
      "normalized state + county/independent city only — never on a zip prefix or a town name. " +
      "Coverage is geographic eligibility, not proof the customer belongs to Bright. Delaware, New Jersey, " +
      "Pennsylvania and West Virginia are not mapped, so those addresses go to MLS review.",
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
    jurisdictions: [],
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
    jurisdictions: Array.isArray(source.jurisdictions)
      ? source.jurisdictions
          .map((j: any) => ({
            state: String(j?.state || "").trim().toUpperCase(),
            name: String(j?.name || "").replace(/\s+/g, " ").trim(),
            kind: (["county", "independent_city", "district"].includes(String(j?.kind))
              ? String(j.kind)
              : "county") as MlsJurisdiction["kind"],
          }))
          .filter((j: MlsJurisdiction) => j.state && j.name)
      : base.jurisdictions,
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

/**
 * "Fairfax County" → "fairfax", "Manassas Park city" → "manassas park",
 * "Queen Anne's County" → "queen annes". The trailing jurisdiction word and punctuation are
 * removed on both sides of a comparison, so the same jurisdiction is never missed over spelling.
 */
export function normalizeJurisdictionKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/\b(county|city|parish|borough)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Fairfax County, VA" / "Alexandria, VA" / "District of Columbia, DC". */
export function describeJurisdiction(jurisdiction: MlsJurisdiction | null | undefined): string | null {
  if (!jurisdiction) return null;
  const suffix = jurisdiction.kind === "county" ? " County" : "";
  return `${jurisdiction.name}${suffix}, ${jurisdiction.state}`;
}

export type MlsRoutingBasis = "zip" | "county" | "city" | "state" | "none";

/** Levels a region can match at, most specific first. Not the same as the stored `basis`. */
type MlsMatchLevel = "zip" | "county" | "city" | "jurisdiction" | "state";

export interface MlsRegionMatch {
  region_id: string;
  provider_id: string;
  region_label: string;
  basis: MlsRoutingBasis;
  /** The jurisdiction that produced this match, when it came from the official list. */
  jurisdiction?: MlsJurisdiction | null;
}

/**
 * What the match proves. Geographic eligibility inside a provider's published service area is NOT
 * proof that the customer belongs to that MLS — membership is only confirmed by the listing itself.
 */
export interface MlsCoverage {
  eligible: boolean;
  jurisdiction_label: string | null;
  source: string | null;
  membership_confirmed: boolean;
}

// There is no "unsupported" route: every address can be published to an MLS. When the map cannot
// name the provider yet, the request is queued for our MLS team, who publish it by hand.
export type MlsRoutingStatus = "resolved" | "pending_activation" | "review";

export interface MlsRegionResolution {
  status: MlsRoutingStatus;
  reason: string;
  basis: MlsRoutingBasis;
  provider_id: string | null;
  provider_live: boolean;
  region_id: string | null;
  region_label: string | null;
  /** The jurisdiction from the provider's official list that decided the route, when there is one. */
  jurisdiction: MlsJurisdiction | null;
  coverage: MlsCoverage;
  matches: MlsRegionMatch[];
  location: PropertyLocation;
}

/**
 * The jurisdiction this region covers for the address, from its official list.
 *
 * Both sides are normalized, and the state must match exactly, so a county in one state can never
 * stand in for the same-named county in another ("Washington" MD vs "Washington" VA, or the
 * "Caroline" counties in Maryland and Virginia). A district jurisdiction (Washington, D.C.) covers
 * its whole state code because the district IS the state. A town name inside a county never matches:
 * only a real county or a real independent city can.
 */
function matchJurisdictionAt(region: MlsServiceRegion, location: PropertyLocation): MlsJurisdiction | null {
  if (!location.state || region.jurisdictions.length === 0) return null;
  const countyKey = normalizeJurisdictionKey(location.county);
  const cityKey = normalizeJurisdictionKey(location.city);
  // A geocoder labels an independent city "Baltimore City" in the county field, which would otherwise
  // look like Baltimore County. "… City" is read as the city it is.
  const countyNamesCity = /\bcity\b/i.test(String(location.county || ""));
  const scoped = region.jurisdictions.filter((j) => j.state === location.state);
  if (scoped.length === 0) return null;

  const district = scoped.find((j) => j.kind === "district");
  if (district) return district;

  const find = (kind: MlsJurisdiction["kind"], key: string) =>
    key ? scoped.find((j) => j.kind === kind && normalizeJurisdictionKey(j.name) === key) || null : null;

  // 1. An independent city the address is actually in wins, because the county around it is a
  //    different jurisdiction with its own name.
  const asCity = find("independent_city", cityKey) || (countyNamesCity ? find("independent_city", countyKey) : null);
  if (asCity) return asCity;
  // 2. Otherwise the county the address sits in.
  const asCounty = find("county", countyKey) || (countyNamesCity ? null : find("county", cityKey));
  if (asCounty) return asCounty;
  // 3. A city name that only exists on the list as a county-level jurisdiction.
  return find("county", cityKey) || find("independent_city", countyKey) || null;
}

function regionMatchesAt(region: MlsServiceRegion, location: PropertyLocation, level: MlsMatchLevel): boolean {
  if (level === "zip") {
    const zip = location.zip;
    if (!zip || region.zip_prefixes.length === 0) return false;
    return region.zip_prefixes.some((prefix) => zip.startsWith(prefix));
  }
  if (level === "county") {
    if (!location.county || region.counties.length === 0) return false;
    const wanted = normalizeJurisdictionKey(location.county);
    return region.counties.some((c) => normalizeJurisdictionKey(c) === wanted);
  }
  if (level === "city") {
    if (!location.city || region.cities.length === 0) return false;
    const wanted = normalizeJurisdictionKey(location.city);
    return region.cities.some((c) => normalizeJurisdictionKey(c) === wanted);
  }
  if (level === "state") {
    if (!location.state || region.states.length === 0) return false;
    // A state in `states` is the scope of the map, not coverage of the whole state. Only a genuinely
    // state-wide region (no jurisdictions, counties, cities or zips) may match on the state alone.
    if (
      region.jurisdictions.length > 0 ||
      region.counties.length > 0 ||
      region.cities.length > 0 ||
      region.zip_prefixes.length > 0
    ) return false;
    return region.states.includes(location.state);
  }
  return false;
}

const MATCH_LEVEL_ORDER: MlsMatchLevel[] = ["zip", "county", "city", "jurisdiction", "state"];

/**
 * Decides the MLS workflow for one property.
 * `isLive(providerId)` says whether that provider's integration may serve customers today.
 */
export function resolveMlsRegion(
  regions: MlsServiceRegion[],
  location: PropertyLocation,
  isLive: (providerId: string) => boolean = () => true,
): MlsRegionResolution {
  // Every mapped region is considered, switched on or not: a region that is not activated yet still
  // names the provider that will publish the property, so the request can be worked by hand.
  const mapped = (regions || []).filter((r) => r && String(r.provider_id || "").trim());
  const base = {
    location,
    provider_id: null as string | null,
    provider_live: false,
    region_id: null as string | null,
    region_label: null as string | null,
    jurisdiction: null as MlsJurisdiction | null,
    coverage: {
      eligible: false,
      jurisdiction_label: null,
      source: null,
      membership_confirmed: false,
    } as MlsCoverage,
    matches: [] as MlsRegionMatch[],
  };

  if (!location.state && !location.zip) {
    return { ...base, status: "review", reason: "missing_location", basis: "none" };
  }

  for (const level of MATCH_LEVEL_ORDER) {
    const matches: MlsRegionMatch[] = [];
    const jurisdictionMatches: MlsJurisdiction[] = [];
    mapped.forEach((region) => {
      if (level === "jurisdiction") {
        const jurisdiction = matchJurisdictionAt(region, location);
        if (!jurisdiction) return;
        // A county or a district reports at county level; an independent city reports at city level.
        const matchBasis: MlsRoutingBasis = jurisdiction.kind === "independent_city" ? "city" : "county";
        jurisdictionMatches.push(jurisdiction);
        matches.push({
          region_id: region.id,
          provider_id: region.provider_id,
          region_label: region.label,
          basis: matchBasis,
          jurisdiction,
        });
        return;
      }
      if (regionMatchesAt(region, location, level)) {
        matches.push({
          region_id: region.id,
          provider_id: region.provider_id,
          region_label: region.label,
          basis: level as MlsRoutingBasis,
        });
      }
    });
    if (matches.length === 0) continue;

    const basis = matches[0].basis;
    const providers = Array.from(new Set(matches.map((m) => m.provider_id)));
    if (providers.length > 1) {
      return { ...base, status: "review", reason: "overlapping_coverage", basis, matches };
    }

    const providerId = providers[0];
    const region = mapped.find((r) => r.id === matches[0].region_id)!;
    const live = isLive(providerId);
    const jurisdiction = jurisdictionMatches[0] || null;
    const routed = {
      ...base,
      basis,
      provider_id: providerId,
      provider_live: live,
      region_id: region.id,
      region_label: region.label,
      jurisdiction,
      matches,
      coverage: {
        eligible: true,
        jurisdiction_label: describeJurisdiction(jurisdiction),
        source: region.verified_by || null,
        membership_confirmed: false,
      } as MlsCoverage,
    };

    // A region that is not switched on yet is still the answer for this property — the provider is
    // known and the request is worked by our MLS team until the route is automated.
    if (!region.enabled) {
      return { ...routed, status: "pending_activation", reason: "region_not_activated" };
    }
    if (!region.verified) {
      return { ...routed, status: "review", reason: "region_unverified" };
    }

    return {
      ...routed,
      status: live ? "resolved" : "pending_activation",
      reason: live ? "region_resolved" : "provider_not_live",
    };
  }

  const scoped = mapped.filter(
    (r) => r.jurisdictions.length > 0 && !!location.state && r.states.includes(location.state),
  );
  const scopedMatches: MlsRegionMatch[] = scoped.map((r) => ({
    region_id: r.id,
    provider_id: r.provider_id,
    region_label: r.label,
    basis: "none" as MlsRoutingBasis,
  }));
  const scopedSource = scoped.length === 1 ? scoped[0].verified_by || null : null;

  // The state is mapped jurisdiction by jurisdiction, but the address names no county or independent
  // city at all — the county could not be confirmed. Deciding the provider would be a guess, so an
  // administrator decides which MLS serves it.
  const hasJurisdictionHint = !!(normalizeJurisdictionKey(location.county) || normalizeJurisdictionKey(location.city));
  if (scoped.length > 0 && !hasJurisdictionHint) {
    const only = scoped.length === 1 ? scoped[0] : null;
    return {
      ...base,
      status: "review",
      reason: "jurisdiction_unknown",
      basis: "none",
      provider_id: only ? only.provider_id : null,
      region_id: only ? only.id : null,
      region_label: only ? only.label : null,
      matches: scopedMatches,
      coverage: { ...base.coverage, source: scopedSource },
    };
  }

  // The address names a jurisdiction that no region covers, or nothing in the map covers it yet.
  // Publishing is still available and never blocked: our MLS team confirms the provider and widens
  // coverage afterwards.
  return {
    ...base,
    status: "review",
    reason: "coverage_unmapped",
    basis: "none",
    matches: scopedMatches,
    coverage: { ...base.coverage, source: scopedSource },
  };
}

/** The customer-facing sentence for a resolution. Never names another provider as an option. */
export function describeRouting(resolution: MlsRegionResolution, providerLabel?: string | null): string {
  const label = providerLabel || "your MLS";
  const covered = resolution.coverage?.jurisdiction_label || resolution.region_label;
  switch (resolution.status) {
    case "resolved":
      return `${covered} is inside ${label}'s service area, so Arriv publishes through ${label}.`;
    case "pending_activation":
      return `${covered} is inside ${label}'s service area. Arriv is finishing activation of that route, so your request goes to our MLS team to publish for you.`;
    case "review":
      return resolution.provider_id
        ? `Arriv's MLS team is confirming ${label} for this address. They publish your selected media for you.`
        : "Arriv's MLS team confirms the right MLS for this address and publishes your selected media for you.";
    default:
      return "Arriv publishes this property for you. Our MLS team confirms the provider and completes the upload.";
  }
}