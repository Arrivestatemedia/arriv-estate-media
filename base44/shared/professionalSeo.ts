// SEO for the Phase 4 public surfaces: agent profiles, brokerage profiles and geographic discovery
// pages.
//
// Every page gets exactly one canonical address, a real description built from recorded facts, and
// structured data that only contains verified values. Nothing here invents credentials, affiliations,
// coverage or rankings, and nothing here is emitted for a page that is not publicly visible.

import { affiliationForDisplay, canIndex, credentialsForDisplay, profileBasePath, profilePath, serviceAreasForDisplay } from "./professionalProfile.ts";

export const DISCOVERY_HOME = { name: "Properties", path: "/properties" };
export const AGENTS_HOME = { name: "Agents", path: "/agents" };
export const BROKERAGES_HOME = { name: "Brokerages", path: "/brokerages" };

export function absoluteUrl(origin: string, path: string): string {
  const base = String(origin || "").replace(/\/+$/, "");
  const clean = String(path || "/").startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

function truncate(text: string, max = 158): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/[\s,.;:–-]+$/, "")}…`;
}

function breadcrumbList(items: { name: string; url: string }[]): any {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function profileBreadcrumbs(profile: any, origin: string) {
  const base = profileBasePath(profile?.profile_type);
  const home = base === "/brokerages" ? BROKERAGES_HOME : AGENTS_HOME;
  return [
    { name: "Arriv Estate Media", url: absoluteUrl(origin, "/") },
    { name: home.name, url: absoluteUrl(origin, home.path) },
    { name: profile?.display_name || "", url: absoluteUrl(origin, profilePath(profile)) },
  ];
}

export function profileTitle(profile: any, marketLabel = ""): string {
  const name = String(profile?.display_name || "").trim();
  const where = marketLabel || [profile?.city, profile?.state].filter(Boolean).join(", ");
  if (profile?.profile_type === "brokerage") {
    return where ? `${name} | Real Estate Brokerage in ${where}` : `${name} | Real Estate Brokerage`;
  }
  return where ? `${name} | Real Estate Agent in ${where}` : `${name} | Real Estate Agent`;
}

export function profileDescription(profile: any): string {
  const name = String(profile?.display_name || "").trim();
  const where = [profile?.city, profile?.state].filter(Boolean).join(", ");
  const areas = serviceAreasForDisplay(profile).slice(0, 3);
  const bio = String(profile?.bio || "").replace(/\s+/g, " ").trim();
  const lead =
    profile?.profile_type === "brokerage"
      ? `${name} is a real estate brokerage${where ? ` in ${where}` : ""} with a public profile on Arriv Estate Media.`
      : `${name} is a real estate agent${where ? ` in ${where}` : ""} with a public profile on Arriv Estate Media.`;
  const served = areas.length ? ` Service areas: ${areas.join(", ")}.` : "";
  return truncate(`${lead}${served} ${bio}`);
}

// Structured data built only from facts on the record. An unverified licence or affiliation is
// omitted entirely rather than published with a caveat a crawler would drop.
export function profileStructuredData(profile: any, origin: string, marketLabel = ""): any {
  const url = absoluteUrl(origin, profilePath(profile));
  const affiliation = affiliationForDisplay(profile);
  const credentials = credentialsForDisplay(profile);
  const isBrokerage = profile?.profile_type === "brokerage";
  const areaServed = serviceAreasForDisplay(profile);

  const data: any = {
    "@context": "https://schema.org",
    "@type": isBrokerage ? ["Organization", "RealEstateAgent"] : "RealEstateAgent",
    "@id": url,
    name: profile?.display_name || "",
    url,
    description: profileDescription(profile),
    areaServed: areaServed.length ? areaServed : undefined,
    knowsLanguage: undefined,
  };
  if (profile?.photo_url) data.image = profile.photo_url;
  if (profile?.logo_url) data.logo = profile.logo_url;
  if (profile?.contact_phone) data.telephone = profile.contact_phone;
  if (profile?.contact_email) data.email = profile.contact_email;
  if (profile?.website_url) data.sameAs = [profile.website_url];
  if (profile?.city || profile?.state) {
    data.address = {
      "@type": "PostalAddress",
      addressLocality: profile?.city || undefined,
      addressRegion: profile?.state || undefined,
      postalCode: profile?.zip || undefined,
      addressCountry: "US",
    };
  }
  if (affiliation.verified) data.parentOrganization = { "@type": "Organization", name: affiliation.name };
  if (credentials.verified && credentials.license_number) {
    data.hasCredential = {
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "license",
      identifier: credentials.license_number,
      recognizedBy: credentials.license_state ? { "@type": "Organization", name: `${credentials.license_state} real estate commission` } : undefined,
    };
  }
  if (marketLabel) data.areaServed = areaServed.length ? areaServed : [marketLabel];
  return data;
}

export function profileSeoPayload(profile: any, origin: string, opts: { marketLabel?: string; listings?: any[] } = {}) {
  const canonical = absoluteUrl(origin, profilePath(profile));
  const indexable = canIndex(profile);
  const items = (opts.listings || []).slice(0, 24).map((listing) => ({
    "@type": "ListItem",
    url: absoluteUrl(origin, `/properties/${listing.public_slug}`),
    name: listing.seo_title || listing.property_address || "",
  }));
  return {
    canonical_url: canonical,
    title: profileTitle(profile, opts.marketLabel),
    meta_description: profileDescription(profile),
    robots: indexable ? "index, follow" : "noindex, nofollow",
    indexing: indexable ? "index" : "noindex",
    breadcrumbs: profileBreadcrumbs(profile, origin),
    structured_data: profileStructuredData(profile, origin, opts.marketLabel),
    item_list: items.length
      ? { "@context": "https://schema.org", "@type": "ItemList", itemListElement: items }
      : null,
    social: {
      "og:type": "profile",
      "og:title": profileTitle(profile, opts.marketLabel),
      "og:description": profileDescription(profile),
      "og:url": canonical,
      "og:image": profile?.photo_url || profile?.logo_url || "",
    },
  };
}

// --- geographic discovery --------------------------------------------------------------------

export function marketTitle(market: any): string {
  const city = String(market?.city || "").trim();
  const state = String(market?.state || "").trim().toUpperCase();
  return city && state ? `Properties in ${city}, ${state}` : "Property directory";
}

export function marketPath(market: any): string {
  return market?.slug ? `/properties/in/${market.slug}` : "/properties";
}

export function marketDescription(market: any, counts: { listings: number; agents: number }): string {
  const city = String(market?.city || "").trim();
  const state = String(market?.state || "").trim().toUpperCase();
  const intro = String(market?.intro || "").replace(/\s+/g, " ").trim();
  const listingText = counts.listings === 1
    ? `1 published property in ${city}, ${state}`
    : `${counts.listings} published properties in ${city}, ${state}`;
  const agentText = counts.agents > 0
    ? ` and ${counts.agents} real estate ${counts.agents === 1 ? "professional" : "professionals"} with public profiles`
    : "";
  const base = `Browse ${listingText}${agentText} on Arriv Estate Media.`;
  return truncate(intro ? `${intro} ${base}` : base);
}

export function marketBreadcrumbs(market: any, origin: string) {
  return [
    { name: "Arriv Estate Media", url: absoluteUrl(origin, "/") },
    { name: DISCOVERY_HOME.name, url: absoluteUrl(origin, DISCOVERY_HOME.path) },
    { name: marketTitle(market), url: absoluteUrl(origin, marketPath(market)) },
  ];
}

export function marketStructuredData(market: any, origin: string, listings: any[]): any {
  const url = absoluteUrl(origin, marketPath(market));
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name: marketTitle(market),
    description: marketDescription(market, { listings: listings.length, agents: 0 }),
    about: {
      "@type": "Place",
      name: `${market?.city || ""}, ${String(market?.state || "").toUpperCase()}`,
      address: { "@type": "PostalAddress", addressLocality: market?.city || undefined, addressRegion: market?.state || undefined, addressCountry: "US" },
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listings.length,
      itemListElement: listings.map((listing, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(origin, `/properties/${listing.public_slug}`),
        name: listing.seo_title || listing.property_address || "",
      })),
    },
  };
}

export function marketSeoPayload(market: any, origin: string, ctx: { listings: any[]; agents: any[]; eligible: boolean }) {
  const canonical = absoluteUrl(origin, marketPath(market));
  const indexable = ctx.eligible && String(market?.indexing || "noindex") === "index" && market?.status === "published";
  return {
    canonical_url: canonical,
    title: marketTitle(market),
    meta_description: marketDescription(market, { listings: ctx.listings.length, agents: ctx.agents.length }),
    robots: indexable ? "index, follow" : "noindex, follow",
    indexing: indexable ? "index" : "noindex",
    breadcrumbs: marketBreadcrumbs(market, origin),
    structured_data: marketStructuredData(market, origin, ctx.listings),
    social: {
      "og:type": "website",
      "og:title": marketTitle(market),
      "og:description": marketDescription(market, { listings: ctx.listings.length, agents: ctx.agents.length }),
      "og:url": canonical,
      "og:image": ctx.listings[0]?.structured_data?.image || "",
    },
  };
}