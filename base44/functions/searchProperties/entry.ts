import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  resolveFeatureGate,
  testModeRequested,
  mediaStreamUrl,
  propertyPageUrl,
} from "../../shared/propertyVisibility.ts";
import {
  DIRECTORY_MAX_RESULTS,
  applyDirectoryFilters,
  directoryFilterValues,
  directoryQuery,
} from "../../shared/propertyDirectoryQuery.ts";

// Public property directory search.
//
// Eligibility is enforced in the query itself, not in the response: only PUBLISHED,
// non-certification listings whose status is active or pending AND whose status was
// confirmed inside the documented window can ever be returned. Sold, withdrawn, expired and
// stale-unconfirmed listings are structurally absent from active results.

const MAX_LIMIT = DIRECTORY_MAX_RESULTS;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const p = (name: string) => body[name] ?? url.searchParams.get(name) ?? undefined;

    const gate = await resolveFeatureGate(base44, testModeRequested(p("test_mode")));
    if (!gate.enabled) {
      return Response.json({ ok: false, feature_disabled: true, results: [], total: 0, message: "The property directory is not yet available." });
    }

    // One definition of directory eligibility and one definition of the search filters, both
    // shared with the server-rendered directory page, so the two can never disagree about which
    // listings a search may show.
    const query: Record<string, any> = directoryQuery({ testMode: gate.test_mode });
    applyDirectoryFilters(query, directoryFilterValues(p));

    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(p("limit") || 12)));
    const cursor = p("cursor") || undefined;

    const page = await base44.asServiceRole.entities.PropertyListing.filter(query, {
      sort: "-published_at",
      limit,
      cursor,
    });
    const items: any[] = page?.items || [];
    const total = await base44.asServiceRole.entities.PropertyListing.count(query);

    return Response.json({
      ok: true,
      total,
      has_more: !!page?.has_more,
      next_cursor: page?.next_cursor || null,
      results: items.map((l: any) => ({
        listing_id: l.listing_id,
        slug: l.public_slug,
        url: l.public_url || propertyPageUrl(l.public_slug),
        property_address: l.property_address,
        city: l.city,
        state: l.state,
        zip: l.zip,
        listing_price: l.listing_price ?? null,
        bedrooms: l.bedrooms ?? null,
        bathrooms: l.bathrooms ?? null,
        square_footage: l.square_footage ?? null,
        property_type: l.property_type || "",
        listing_status: l.listing_status,
        cover_url: l.cover_file_id ? mediaStreamUrl(l.listing_id, l.cover_file_id) : "",
        published_at: l.published_at || null,
        brokerage: l.brokerage_name || "",
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});