// Deterministic advertising creative assembly.
//
// Everything here is built from content the customer already approved on their property page.
// No AI call is made, no feature is invented, and a missing fact is simply left out rather than
// guessed: if the listing has no price, the headline does not imply one.
//
// Targeting is location-only. Housing advertising under Meta's Special Ad Category may not use
// age, gender, detailed interests, lookalike or custom audiences, so none are ever produced.

import { AD_SPECIAL_CATEGORY, AD_CREATIVE_VARIATIONS, adPackage } from "./propertyAdPackages.ts";

export interface AdMedia {
  drive_file_id: string;
  kind: "photo" | "video";
  name: string;
}

export interface AdTargeting {
  locations: Array<Record<string, any>>;
  radius_miles: number | null;
  publisher_platforms: string[];
  age_min: number;
  age_max: number;
  excluded: string[];
}

export interface AdVariation {
  label: string;
  headline: string;
  primary_text: string;
  media_file_id: string;
}

export interface AdCreative {
  headline: string;
  primary_text: string;
  description: string;
  call_to_action: string;
  display_link: string;
  link_url: string;
  variations: AdVariation[];
  media: AdMedia[];
  targeting: AdTargeting;
  special_ad_category: string;
  utm: Record<string, string>;
  generated_at: string;
}

// Small deterministic string hash — used for creative fingerprints, never for security.
export function fingerprint(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 = (h1 ^ code) * 16777619 >>> 0;
    h2 = (h2 + code * (i + 7)) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function clean(value: any): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function approvedMedia(listing: any, limit = 5): AdMedia[] {
  const selected = Array.isArray(listing?.selected_media) ? listing.selected_media : [];
  const usable = selected
    .filter((item: any) => item && item.drive_file_id && (item.kind === "photo" || item.kind === "video"))
    // The cover photograph leads when it is part of the approved selection.
    .sort((a: any, b: any) => {
      const aCover = a.drive_file_id === listing?.cover_file_id ? 0 : 1;
      const bCover = b.drive_file_id === listing?.cover_file_id ? 0 : 1;
      if (aCover !== bCover) return aCover - bCover;
      return Number(a.position || 0) - Number(b.position || 0);
    });
  return usable.slice(0, limit).map((item: any) => ({
    drive_file_id: String(item.drive_file_id),
    kind: item.kind === "video" ? "video" : "photo",
    name: clean(item.name) || "Property media",
  }));
}

function priceLabel(listing: any): string {
  const price = Number(listing?.listing_price);
  if (!Number.isFinite(price) || price <= 0) return "";
  return `$${Math.round(price).toLocaleString("en-US")}`;
}

function bedBath(listing: any): string {
  const beds = Number(listing?.bedrooms) || 0;
  const baths = Number(listing?.bathrooms) || 0;
  const parts: string[] = [];
  if (beds > 0) parts.push(`${beds} bd`);
  if (baths > 0) parts.push(`${Number.isInteger(baths) ? baths : baths.toFixed(1)} ba`);
  return parts.join(" · ");
}

export function headlineFor(listing: any, variant = 0): string {
  const city = clean(listing?.city);
  const state = clean(listing?.state);
  const place = [city, state].filter(Boolean).join(", ");
  const price = priceLabel(listing);
  const facts = bedBath(listing);
  const kind = clean(listing?.property_type).replace(/_/g, " ");
  const options = [
    [price, facts, place].filter(Boolean).join(" · "),
    [kind ? `${kind.replace(/\b\w/g, (c) => c.toUpperCase())} in ${place || "your area"}` : "", price].filter(Boolean).join(" · "),
    [price ? `New listing: ${price}` : "New listing", facts].filter(Boolean).join(" · "),
    [clean(listing?.property_address), place].filter(Boolean).join(", "),
  ].filter((line) => line && line.trim().length > 3);
  const headline = options[variant % Math.max(options.length, 1)] || clean(listing?.property_address) || "Property listing";
  return headline.slice(0, 60);
}

export function primaryTextFor(listing: any, variant = 0): string {
  const approved = clean(listing?.property_description);
  if (approved) return approved.slice(0, 220);
  // No approved description: state only what the record actually contains.
  const lines = [
    [headlineFor(listing, variant)].filter(Boolean).join(""),
    [clean(listing?.property_address), [clean(listing?.city), clean(listing?.state)].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);
  const facts = [bedBath(listing), Number(listing?.square_footage) ? `${Number(listing.square_footage).toLocaleString("en-US")} sq ft` : ""]
    .filter(Boolean)
    .join(" · ");
  if (facts) lines.push(facts);
  lines.push("See the full listing, photos and video.");
  return lines.join("\n").slice(0, 220);
}

function displayLinkFor(url: string): string {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return host.toUpperCase();
  } catch {
    return "ARRIVESTATEMEDIA.COM";
  }
}

export function buildAdCreative(input: {
  listing: any;
  tier: string;
  publicUrl: string;
  campaignId: string;
  now?: Date;
}): AdCreative {
  const { listing, tier, publicUrl, campaignId } = input;
  const now = input.now || new Date();
  const pkg = adPackage(tier);
  const variationCount = Math.max(1, Math.min(AD_CREATIVE_VARIATIONS[(pkg?.tier as any) || "starter"] || 1, 5));
  const media = approvedMedia(listing, Math.max(variationCount, 2));
  const utm = { utm_source: "facebook", utm_medium: "paid", utm_campaign: campaignId, utm_content: "" };

  const variations: AdVariation[] = [];
  for (let i = 0; i < variationCount; i += 1) {
    variations.push({
      label: variationCount === 1 ? "Primary" : `Variation ${i + 1}`,
      headline: headlineFor(listing, i),
      primary_text: primaryTextFor(listing, i),
      media_file_id: media[i % Math.max(media.length, 1)]?.drive_file_id || "",
    });
  }

  const city = clean(listing?.city);
  const state = clean(listing?.state);
  const locations: Array<Record<string, any>> = [];
  // Location only. No behaviour, demographic or interest targeting is ever generated for housing.
  if (city && state) {
    locations.push({ kind: "city", city, state, radius_miles: 25 });
  } else if (state) {
    locations.push({ kind: "region", state, radius_miles: null });
  }

  return {
    headline: variations[0].headline,
    primary_text: variations[0].primary_text,
    description: [clean(listing?.property_address), [city, state].filter(Boolean).join(", ")].filter(Boolean).join(", ").slice(0, 120),
    call_to_action: "LEARN_MORE",
    display_link: displayLinkFor(publicUrl),
    link_url: publicUrl,
    variations,
    media,
    targeting: {
      locations,
      radius_miles: locations[0]?.radius_miles ?? null,
      publisher_platforms: ["facebook", "instagram"],
      age_min: 18,
      age_max: 65,
      excluded: ["age_targeting", "gender_targeting", "detailed_interests", "lookalike_audiences", "custom_audiences"],
    },
    special_ad_category: AD_SPECIAL_CATEGORY,
    utm,
    generated_at: now.toISOString(),
  };
}

// The exact details a customer approves. Any change to these invalidates that approval.
export function approvedDetails(campaign: any) {
  return {
    campaign_id: campaign?.campaign_id || "",
    listing_id: campaign?.listing_id || "",
    package_tier: campaign?.package_tier || "",
    total_cents: Number(campaign?.total_cents || 0),
    ad_budget_cents: Number(campaign?.ad_budget_cents || 0),
    management_fee_cents: Number(campaign?.management_fee_cents || 0),
    duration_days: Number(campaign?.duration_days || 0),
    provider: campaign?.provider || "meta",
    creative_fingerprint: campaign?.creative_fingerprint || fingerprint(campaign?.creative || {}),
  };
}

export function campaignFingerprint(campaign: any): string {
  return fingerprint(approvedDetails(campaign));
}

// Fair-housing guard: refuses targeting or claims that may not be used for housing advertising.
export function creativeComplianceIssues(creative: any): string[] {
  const issues: string[] = [];
  if (!creative) return ["Creative is missing"];
  if (String(creative.special_ad_category || "") !== AD_SPECIAL_CATEGORY) {
    issues.push("Housing special ad category is required");
  }
  const targeting = creative.targeting || {};
  const banned = ["interests", "behaviors", "custom_audiences", "excluded_custom_audiences", "genders", "age_min_targeting", "lookalikes"];
  for (const key of banned) {
    if (targeting[key]) issues.push(`Prohibited housing targeting: ${key}`);
  }
  if (!Array.isArray(targeting.locations) || targeting.locations.length === 0) {
    issues.push("At least one location is required");
  }
  for (const location of targeting.locations || []) {
    if (location?.kind === "zip" || location?.zip) issues.push("Zip-code level targeting is not permitted for housing campaigns");
  }
  const text = `${creative.headline || ""} ${creative.primary_text || ""} ${creative.description || ""}`.toLowerCase();
  const bannedClaims = ["guaranteed", "best investment", "no children", "adults only", "perfect for families", "christian", "safe neighborhood", "exclusive neighborhood"];
  for (const claim of bannedClaims) {
    if (text.includes(claim)) issues.push(`Prohibited advertising claim: ${claim}`);
  }
  if (!creative.link_url) issues.push("Landing page link is required");
  if (!Array.isArray(creative.media) || creative.media.length === 0) issues.push("At least one approved image is required");
  return issues;
}