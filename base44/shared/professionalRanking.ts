// Directory ranking for professionals — deliberately a SEPARATE implementation from the property
// directory's placement ranking (base44/shared/propertyDirectoryRanking.ts).
//
// The two are kept apart on purpose: a paid agent subscription must never silently reorder paid
// property promotions, and a property promotion must never promote an agent profile. Each list has
// its own eligibility rule, its own paid weight and its own label.
//
// Order: eligibility first (a non-published or unauthorized profile is absent, not demoted), then
// the plan's directory weight (Agent Growth above Agent Presence), then a stable alphabetical order
// so a page never reshuffles between two identical reads.

import { entitlementsFor } from "./visibilityPlans.ts";
import { isPubliclyVisible } from "./professionalProfile.ts";

export const AGENT_DIRECTORY_LIMIT = 24;
export const BROKERAGE_DIRECTORY_LIMIT = 24;

export function directoryEligible(profile: any): boolean {
  return isPubliclyVisible(profile);
}

export function placementWeight(profile: any, subscriptionStatus: string): number {
  const entitlements = entitlementsFor(profile?.plan_key, subscriptionStatus);
  return Number(entitlements.directory_priority || 0);
}

export function placementLabel(profile: any, subscriptionStatus: string): string {
  const weight = placementWeight(profile, subscriptionStatus);
  if (weight <= 0) return "";
  return String(profile?.plan_key) === "agent_growth" ? "Priority agent" : "Featured listing";
}

// `subscriptionsByProfile` maps profile_id -> subscription status. An absent entry means no active
// subscription, which is exactly the free position.
export function rankProfessionals(
  profiles: any[],
  opts: { profileType: "agent" | "brokerage"; subscriptionsByProfile?: Record<string, string> },
): any[] {
  const subs = opts.subscriptionsByProfile || {};
  const eligible = (profiles || []).filter((p) => p && p.profile_type === opts.profileType && directoryEligible(p));
  return eligible
    .map((profile) => {
      const status = subs[String(profile.profile_id || "")] || "";
      return {
        ...profile,
        placement_weight: placementWeight(profile, status),
        placement_label: placementLabel(profile, status),
        subscription_status: status,
      };
    })
    .sort((a, b) => {
      if (a.placement_weight !== b.placement_weight) return b.placement_weight - a.placement_weight;
      const byName = String(a.display_name || "").localeCompare(String(b.display_name || ""));
      if (byName !== 0) return byName;
      return String(a.profile_id || "").localeCompare(String(b.profile_id || ""));
    });
}

export function publicDirectoryCard(profile: any): any {
  return {
    profile_id: profile.profile_id,
    profile_type: profile.profile_type,
    slug: profile.slug,
    display_name: profile.display_name,
    headline: profile.headline || "",
    photo_url: profile.photo_url || "",
    logo_url: profile.logo_url || "",
    city: profile.city || "",
    state: profile.state || "",
    service_areas: Array.isArray(profile.service_areas) ? profile.service_areas : [],
    brokerage_name: profile.brokerage_affiliation_verified ? profile.brokerage_name || "" : "",
    placement_label: profile.placement_label || "",
    placement_weight: profile.placement_weight || 0,
  };
}

// The disclosure attached to a paid placement, so a visitor always knows why an entry is first.
export function placementDisclosure(profile: any): string {
  if (!profile?.placement_weight) return "";
  return "Priority placement is a paid subscription benefit and does not reflect an endorsement, ranking of quality, or any claim about results.";
}