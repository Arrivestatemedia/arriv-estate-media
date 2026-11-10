// mlsTerritories.ts
// Which MLS systems may publish one property, and what the customer is actually asked.
//
// mlsRegions answers the geography: every MLS territory that covers the address. This module turns
// those territories into publishing DESTINATIONS using the provider registry, and then decides the
// only question a customer should ever see:
//
//   exactly one eligible system   → nothing is asked; that MLS is selected and published to
//   several overlapping systems   → only those systems are offered, preselected per the policy below
//   none, or an ambiguous address → administrative review, never a guess
//
// A provider is only ever a destination when its registry entry is both `advertised` and
// `operational`, so an MLS that is still being built (Georgia MLS) cannot leak into the customer
// experience, and switching it on later is configuration rather than a UI rewrite.
//
// Each selected destination is submitted independently (see runDestinations): one destination
// failing never rolls back or duplicates another.

import {
  collectTerritoryMatches,
  type MlsServiceRegion,
  type MlsTerritoryMatch,
  type PropertyLocation,
  type MlsRoutingBasis,
} from "./mlsRegions.ts";
import {
  certificationPassed,
  isAdvertisedDestination,
  isProviderLiveForCustomers,
  type MlsProvider,
} from "./mlsProviders.ts";

/**
 * The customer-visible preselection rule. Stated verbatim in the selection interface, because a
 * preselected box the customer cannot explain is worse than no preselection at all.
 */
export const MLS_SELECTION_POLICY =
  "We selected every MLS whose published service area covers this property. Keep only the MLS systems you belong to — each one you leave checked receives your media as a separate submission.";

export type MlsPublishingMode = "automatic" | "arriv_team";

export interface MlsDestination {
  provider_id: string;
  provider_label: string;
  short_label: string;
  region_id: string;
  region_label: string;
  basis: MlsRoutingBasis;
  jurisdiction_label: string | null;
  coverage_label: string;
  /** The provider's automated route is live for this customer now. */
  live_for_customers: boolean;
  /** Every certification test passed. Stays false while an activation carries the route. */
  certificate_complete: boolean;
  /** Live under an operator activation rather than a completed certification. */
  pilot: boolean;
  requires_certification: boolean;
  requires_listing_number: boolean;
  number_hint: string;
  number_pattern: string;
  photo_limit: number;
  video_requirement_note: string;
  /**
   * How this destination publishes today: "automatic" means submitting sends it straight to the
   * MLS API; "arriv_team" means Arriv's MLS team completes it by hand.
   */
  publishing_mode: MlsPublishingMode;
}

export type MlsPlanStatus = "auto" | "selection_required" | "review";

export interface MlsDestinationPlan {
  status: MlsPlanStatus;
  reason: string;
  basis: MlsRoutingBasis;
  jurisdiction_label: string | null;
  coverage_label: string | null;
  eligible: MlsDestination[];
  /** Provider ids preselected for the customer. Empty for a review case. */
  selected: string[];
  selection_policy: string | null;
  /** The MLS that most likely serves the property, when the route itself needs a decision. */
  candidate_provider_id: string | null;
  candidate_provider_label: string | null;
  location: PropertyLocation;
  message: string;
  can_submit: boolean;
}

function destinationFrom(provider: MlsProvider, match: MlsTerritoryMatch): MlsDestination {
  const live = isProviderLiveForCustomers(provider);
  const automatic = live && provider.upload_method === "api";
  return {
    provider_id: provider.id,
    provider_label: provider.label,
    short_label: provider.short_label,
    region_id: match.region_id,
    region_label: match.region_label,
    basis: match.basis,
    jurisdiction_label: match.jurisdiction
      ? match.jurisdiction.name + (match.jurisdiction.kind === "county" ? " County" : "") + ", " + match.jurisdiction.state
      : null,
    coverage_label: match.jurisdiction
      ? match.jurisdiction.name + (match.jurisdiction.kind === "county" ? " County" : "") + ", " + match.jurisdiction.state
      : match.region_label,
    live_for_customers: live,
    certificate_complete: certificationPassed(provider),
    pilot: live && !certificationPassed(provider),
    requires_certification: provider.requires_certification === true,
    requires_listing_number: provider.requires_listing_number !== false,
    number_hint: provider.number_hint || "Listing number",
    number_pattern: provider.number_pattern || "",
    photo_limit: Number(provider.photo_limit) || 200,
    video_requirement_note: provider.video_requirement_note || "",
    publishing_mode: automatic ? "automatic" : "arriv_team",
  };
}

/** The customer-facing sentence for one destination. Never promises automation that is not live. */
export function describeDestination(destination: MlsDestination): string {
  const covered = destination.coverage_label || "This property";
  if (destination.publishing_mode === "automatic") {
    return covered + " is inside " + destination.provider_label + "'s service area, so submitting publishes straight to " + destination.short_label + ".";
  }
  if (destination.live_for_customers) {
    return covered + " is inside " + destination.provider_label + "'s service area. Arriv's MLS team uploads your media to " + destination.short_label + " for you.";
  }
  return covered + " is inside " + destination.provider_label + "'s service area. Arriv is finishing activation of that route, so our MLS team publishes to " + destination.short_label + " for you.";
}

export interface ResolveDestinationOptions {
  /** Lets a caller (or a test) override how "live" a provider is read. */
  isLive?: (provider: MlsProvider | null) => boolean;
}

/**
 * The publishing destinations for one property.
 *
 * Geography decides eligibility; the provider registry decides what we can actually do. When more
 * than one advertised system covers the address, every one of them is offered and preselected — the
 * customer is never shown an unrelated MLS and never asked to confirm a membership when only one
 * system can possibly apply.
 */
export function resolveDestinationPlan(
  regions: MlsServiceRegion[],
  providers: Record<string, MlsProvider>,
  location: PropertyLocation,
  options: ResolveDestinationOptions = {},
): MlsDestinationPlan {
  const isLive = options.isLive || ((p: MlsProvider | null) => isProviderLiveForCustomers(p));
  const scan = collectTerritoryMatches(regions, location);
  const base: MlsDestinationPlan = {
    status: "review",
    reason: "missing_location",
    basis: "none",
    jurisdiction_label: null,
    coverage_label: null,
    eligible: [],
    selected: [],
    selection_policy: null,
    candidate_provider_id: null,
    candidate_provider_label: null,
    location,
    message: "Arriv's MLS team confirms the right MLS for this address and publishes your selected media for you.",
    can_submit: true,
  };

  if (!scan.location_known) {
    return { ...base, reason: "missing_location" };
  }

  // One destination per provider: if two regions of the same provider match (an overlap inside one
  // MLS), the address is still published to that MLS once.
  const byProvider = new Map<string, MlsTerritoryMatch>();
  for (const match of scan.matches) {
    const provider = providers[match.provider_id] || null;
    if (!isAdvertisedDestination(provider)) continue;
    if (!byProvider.has(match.provider_id)) byProvider.set(match.provider_id, match);
  }

  const eligible = Array.from(byProvider.values()).map((match) =>
    destinationFrom(providers[match.provider_id], match),
  ).map((destination) => {
    const provider = providers[destination.provider_id] || null;
    const live = isLive(provider);
    return {
      ...destination,
      live_for_customers: live,
      publishing_mode: (live && provider?.upload_method === "api" ? "automatic" : "arriv_team") as MlsPublishingMode,
    };
  });

  if (eligible.length === 1) {
    const only = eligible[0];
    return {
      ...base,
      status: "auto",
      reason: "single_eligible_system",
      basis: only.basis,
      jurisdiction_label: only.jurisdiction_label,
      coverage_label: only.coverage_label,
      eligible,
      selected: [only.provider_id],
      message: describeDestination(only),
    };
  }

  if (eligible.length > 1) {
    const coverage = eligible[0].coverage_label;
    return {
      ...base,
      status: "selection_required",
      reason: "overlapping_territories",
      basis: eligible[0].basis,
      jurisdiction_label: eligible[0].jurisdiction_label,
      coverage_label: coverage,
      eligible,
      // Preselected per the stated policy: everything that legitimately covers the property.
      selected: eligible.map((d) => d.provider_id),
      selection_policy: MLS_SELECTION_POLICY,
      message: coverage + " is covered by " + eligible.length + " MLS systems we publish to. Choose the ones you belong to.",
    };
  }

  // Nothing we can publish to claims this address. Name the likely provider so the MLS team is not
  // starting from nothing, but never route to it without a decision.
  const matchedProviders = Array.from(new Set(scan.matches.map((m) => m.provider_id)));
  const candidateId = matchedProviders.length === 1
    ? matchedProviders[0]
    : scan.state_regions.length === 1
      ? scan.state_regions[0].provider_id
      : null;
  const candidate = candidateId ? providers[candidateId] || null : null;
  const candidateFields = {
    candidate_provider_id: candidate ? candidate.id : null,
    candidate_provider_label: candidate ? candidate.short_label : null,
  };

  if (matchedProviders.length > 0) {
    // The territory is mapped, but only to an MLS we cannot publish to yet.
    return {
      ...base,
      ...candidateFields,
      reason: "provider_not_advertised",
      basis: scan.basis,
      jurisdiction_label: scan.matches[0]?.jurisdiction
        ? scan.matches[0].jurisdiction.name + ", " + scan.matches[0].jurisdiction.state
        : null,
      message: candidate
        ? "Arriv's MLS team is confirming " + candidate.short_label + " for this address. They publish your media for you."
        : base.message,
    };
  }

  // The state is mapped jurisdiction by jurisdiction but the address names no county or independent
  // city: deciding would be a guess, so an administrator decides (or the customer corrects the address).
  if (scan.state_regions.length > 0 && !scan.jurisdiction_known) {
    return {
      ...base,
      ...candidateFields,
      reason: "jurisdiction_unknown",
      message: "Arriv's MLS team is confirming which MLS serves this address. They publish your media for you.",
    };
  }

  return {
    ...base,
    ...candidateFields,
    reason: "coverage_unmapped",
    message: "Arriv's MLS team confirms the right MLS for this address and publishes your selected media for you.",
  };
}

/**
 * Checks the customer's selection against the eligible destinations.
 * A selection must be non-empty and can only contain systems that actually cover the property.
 */
export function validateDestinationSelection(
  plan: MlsDestinationPlan,
  requested: string[] | undefined | null,
): { ok: boolean; provider_ids: string[]; error?: string } {
  const eligibleIds = plan.eligible.map((d) => d.provider_id);
  const wanted = Array.from(new Set(
    (Array.isArray(requested) ? requested : [])
      .map((id) => String(id || "").trim().toLowerCase())
      .filter(Boolean),
  ));
  const unknown = wanted.filter((id) => !eligibleIds.includes(id));
  if (unknown.length > 0) {
    return {
      ok: false,
      provider_ids: [],
      error: "One of the selected MLS systems does not cover this property. Refresh and choose again.",
    };
  }
  if (wanted.length === 0) {
    return { ok: false, provider_ids: [], error: "Choose at least one MLS to publish to." };
  }
  return { ok: true, provider_ids: wanted };
}

/** Stable per-destination idempotency key: one submission per job + MLS + listing. */
export function destinationIdempotencyKey(jobId: string, providerId: string, normalizedListingNumber: string): string {
  return [String(jobId || ""), String(providerId || ""), String(normalizedListingNumber || "")].join(":");
}

/** Order-independent signature of a set of destinations, for spotting a repeated submission. */
export function selectionKey(providerIds: string[]): string {
  return Array.from(new Set((providerIds || []).map((id) => String(id || "").trim().toLowerCase()).filter(Boolean)))
    .sort()
    .join("+");
}

export interface DestinationResult<T> {
  provider_id: string;
  provider_label: string;
  short_label: string;
  publishing_mode: MlsPublishingMode;
  ok: boolean;
  value: T | null;
  error: string | null;
}

/**
 * Runs one write per destination, isolated.
 *
 * Each MLS is a separate publishing destination: a failure on one must not roll back, rewrite or
 * duplicate a destination that already succeeded, so every write is caught on its own and the
 * caller receives one result per destination.
 */
export async function runDestinations<T>(
  destinations: MlsDestination[],
  write: (destination: MlsDestination) => Promise<T>,
): Promise<DestinationResult<T>[]> {
  const results: DestinationResult<T>[] = [];
  for (const destination of destinations || []) {
    const shell = {
      provider_id: destination.provider_id,
      provider_label: destination.provider_label,
      short_label: destination.short_label,
      publishing_mode: destination.publishing_mode,
    };
    try {
      const value = await write(destination);
      results.push({ ...shell, ok: true, value, error: null });
    } catch (error: any) {
      results.push({ ...shell, ok: false, value: null, error: error?.message || "This MLS could not be submitted" });
    }
  }
  return results;
}