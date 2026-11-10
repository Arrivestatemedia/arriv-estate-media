// Directory ranking — ONE implementation shared by the public directory page and the directory
// search endpoint, so a visitor can never see a different order (or a different set) depending on
// which one answered.
//
// Order is: eligible Priority placements, then eligible Featured placements, then everything else
// in the directory's existing standard order (most recently published first).
//
// Two properties make this safe:
//   * eligibility is decided BEFORE ranking — the promoted lookup re-applies the exact same
//     directory query (`query`), so a paid placement can never surface an unpublished, sold or
//     stale-unconfirmed listing. Ranking only ever reorders rows the directory would already show.
//   * the promotion record is the single source of truth. Nothing is denormalised onto the listing,
//     so an expiry, pause, refund or upgrade takes effect on the next read and can never drift.

import { rankFor } from "./propertyPackages.ts";

// Paid placements are considered for the first page only — the directory front page is where a
// placement is bought and where it is seen. Deeper pages keep the standard order.
export const PROMOTED_LOOKUP_LIMIT = 200;

function rows(result: any): any[] {
  return Array.isArray(result) ? result : (result?.items || []);
}

function publishedMs(listing: any): number {
  const t = Date.parse(String(listing?.published_at || listing?.created_at || ""));
  return Number.isFinite(t) ? t : 0;
}

// Live placements, keyed by listing id. A paused or expired promotion is simply absent.
export async function livePlacements(client: any, now = new Date()): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  try {
    const found = await client.asServiceRole.entities.PropertyPromotion.filter(
      { status: "active" },
      { sort: "-activated_at", limit: PROMOTED_LOOKUP_LIMIT },
    );
    for (const promotion of rows(found)) {
      const endsAt = Date.parse(String(promotion?.ends_at || ""));
      if (!Number.isFinite(endsAt) || endsAt <= now.getTime()) continue;
      const rank = rankFor(promotion.package_tier);
      if (rank <= 0) continue;
      const existing = map.get(promotion.listing_id);
      if (!existing || rank > existing.rank) {
        map.set(promotion.listing_id, {
          tier: promotion.package_tier,
          rank,
          promotion_id: promotion.promotion_id || promotion.id,
        });
      }
    }
  } catch {
    // A failed placement lookup must never break the directory: it degrades to standard order.
    return new Map();
  }
  return map;
}

export function orderDirectoryResults(items: any[], placements: Map<string, any>): any[] {
  return [...(items || [])].sort((a, b) => {
    const ra = placements.get(a?.listing_id)?.rank || 0;
    const rb = placements.get(b?.listing_id)?.rank || 0;
    if (ra !== rb) return rb - ra;
    return publishedMs(b) - publishedMs(a);
  });
}

export interface RankedDirectory {
  items: any[];
  next_cursor: string | null;
  has_more: boolean;
  promoted_count: number;
  total?: number;
}

// Loads one page of the directory with placement ranking applied.
//
// `query` must already be the shared eligibility query (directoryQuery + any visitor filters).
// Every promoted listing is fetched through that same query, so ranking cannot widen eligibility.
export async function loadRankedDirectory(
  client: any,
  opts: { query: Record<string, any>; limit: number; cursor?: string },
): Promise<RankedDirectory> {
  const now = new Date();
  const firstPage = !opts.cursor;
  const placements = firstPage ? await livePlacements(client, now) : new Map<string, any>();

  const promotedIds = [...placements.keys()];

  // The promoted listings themselves, passed through the directory's own eligibility query.
  const promotedListings: any[] = [];
  if (promotedIds.length) {
    const found = await client.asServiceRole.entities.PropertyListing.filter(
      { ...opts.query, listing_id: { $in: promotedIds } },
      { limit: promotedIds.length },
    );
    for (const listing of rows(found)) promotedListings.push(listing);
  }

  const standard = await client.asServiceRole.entities.PropertyListing.filter(opts.query, {
    sort: "-published_at",
    limit: opts.limit + promotedListings.length,
    ...(opts.cursor ? { cursor: opts.cursor } : {}),
  });
  const standardItems = rows(standard);

  const seen = new Set<string>();
  const merged: any[] = [];
  for (const listing of [...promotedListings, ...standardItems]) {
    const key = String(listing?.listing_id || listing?.id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const placement = placements.get(key);
    merged.push({
      ...listing,
      placement_tier: placement?.tier || "",
      placement_label: placement ? (placement.tier === "pro" ? "Priority" : "Featured") : "",
      placement_rank: placement?.rank || 0,
    });
  }

  const ordered = orderDirectoryResults(merged, placements).slice(0, opts.limit);

  return {
    items: ordered,
    next_cursor: standard?.next_cursor || null,
    has_more: !!standard?.has_more,
    promoted_count: ordered.filter((l) => l.placement_rank > 0).length,
  };
}