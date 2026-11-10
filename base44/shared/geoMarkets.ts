// Geographic property discovery: one data-driven definition of what a market page is and when it may
// exist publicly.
//
// A market page is never created empty. A page can only become public and indexable when all of the
// following hold: an administrator approved it, the publication switch is on, and the market actually
// has the stated minimum number of genuinely published, eligible properties. A market that loses its
// inventory stops being indexable on the next evaluation rather than lingering as a thin page.

import { directoryQuery } from "./propertyDirectoryQuery.ts";
import { normalizeSlug } from "./professionalProfile.ts";

export const DEFAULT_MIN_PUBLISHED_LISTINGS = 3;

export function marketSlugFor(city: any, state: any): string {
  const cityPart = normalizeSlug(city);
  const statePart = normalizeSlug(state).replace(/-/g, "");
  if (!cityPart || !statePart) return "";
  return `${cityPart}-${statePart.slice(0, 2)}`;
}

export function parseMarketSlug(slug: string): { city_slug: string; state: string } {
  const clean = normalizeSlug(slug);
  const match = clean.match(/^(.*)-([a-z]{2})$/);
  if (!match) return { city_slug: clean, state: "" };
  return { city_slug: match[1], state: match[2].toUpperCase() };
}

// The market's listings are the directory's own eligibility query narrowed to this city and state, so
// an unpublished, sold or stale-unconfirmed property can never appear on a geographic page.
export function marketQuery(market: any, opts: { testMode: boolean }): Record<string, any> {
  const query = directoryQuery({ testMode: opts.testMode });
  const city = String(market?.city || "").trim();
  const state = String(market?.state || "").trim().toUpperCase();
  if (city) query.city = { $regex: `^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  if (state) query.state = { $regex: `^${state}$`, $options: "i" };
  return query;
}

export interface MarketEligibility {
  eligible: boolean;
  reason: string;
  published_listings: number;
  published_agents: number;
  required_listings: number;
  evaluated_at: string;
}

export function evaluateMarket(
  market: any,
  counts: { published_listings: number; published_agents?: number },
  now = new Date(),
): MarketEligibility {
  const required = Number(market?.minimum_published_listings ?? DEFAULT_MIN_PUBLISHED_LISTINGS);
  const listings = Math.max(0, Number(counts?.published_listings || 0));
  const agents = Math.max(0, Number(counts?.published_agents || 0));
  const evaluatedAt = now.toISOString();

  let reason = "";
  if (!String(market?.city || "").trim() || !String(market?.state || "").trim()) {
    reason = "missing_location";
  } else if (market?.certification_mode === true) {
    reason = "certification_market";
  } else if (listings < required) {
    reason = `insufficient_listings:${listings}/${required}`;
  }

  return {
    eligible: reason === "",
    reason,
    published_listings: listings,
    published_agents: agents,
    required_listings: required,
    evaluated_at: evaluatedAt,
  };
}

// A market is indexable only when it is published, approved, currently eligible, and its own indexing
// flag says index. Any single failure makes it non-indexable — never a judgement call.
export function marketIndexable(market: any, eligibility: MarketEligibility): boolean {
  return (
    !!market &&
    market.status === "published" &&
    !!market.approved_at &&
    String(market.indexing || "noindex") === "index" &&
    eligibility.eligible === true &&
    market.certification_mode !== true
  );
}

// Public exposure and sitemap membership are the same decision, so a page can never be listed in the
// sitemap while a visitor cannot see it, or vice versa.
export function sitemapMarketEntry(market: any, eligibility: MarketEligibility, origin: string) {
  if (!marketIndexable(market, eligibility)) return null;
  const base = String(origin || "").replace(/\/+$/, "");
  return {
    loc: `${base}/properties/in/${market.slug}`,
    changefreq: "daily",
    priority: "0.7",
    lastmod: market.updated_at || market.approved_at || undefined,
  };
}

export function marketCountsFrom(listings: any[]): { published_listings: number } {
  const seen = new Set<string>();
  for (const listing of listings || []) {
    const key = String(listing?.listing_id || listing?.id || "");
    if (key) seen.add(key);
  }
  return { published_listings: seen.size };
}

// The market a listing belongs to, used to link properties into discovery pages without storing a
// second copy of the geography on the listing.
export function marketSlugOfListing(listing: any): string {
  return marketSlugFor(listing?.city, listing?.state);
}