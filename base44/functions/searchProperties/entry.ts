import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  AVAILABLE_LISTING_STATUSES,
  STATUS_CONFIRMATION_WINDOW_DAYS,
  isPropertyVisibilityEnabled,
  mediaStreamUrl,
  propertyPageUrl,
} from "../../shared/propertyVisibility.ts";

// Public property directory search.
//
// Eligibility is enforced in the query itself, not in the response: only PUBLISHED,
// non-certification listings whose status is active or pending AND whose status was
// confirmed inside the documented window can ever be returned. Sold, withdrawn, expired and
// stale-unconfirmed listings are structurally absent from active results.

const MAX_LIMIT = 24;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const p = (name: string) => body[name] ?? url.searchParams.get(name) ?? undefined;

    if (!(await isPropertyVisibilityEnabled(base44))) {
      return Response.json({ ok: false, feature_disabled: true, results: [], total: 0, message: "The property directory is not yet available." });
    }

    const cutoff = new Date(Date.now() - STATUS_CONFIRMATION_WINDOW_DAYS * 86400000).toISOString();
    const query: Record<string, any> = {
      publication_state: "PUBLISHED",
      listing_status: { $in: AVAILABLE_LISTING_STATUSES },
      certification_mode: { $ne: true },
      last_status_confirmed_at: { $gte: cutoff },
    };

    const q = String(p("q") || "").trim();
    if (q) {
      // Location search across the fields a visitor actually types.
      const rx = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { city: { $regex: rx, $options: "i" } },
        { state: { $regex: rx, $options: "i" } },
        { zip: { $regex: rx, $options: "i" } },
        { property_address: { $regex: rx, $options: "i" } },
      ];
    }
    const num = (v: any) => (v === undefined || v === null || v === "" ? null : Number(v));
    const minPrice = num(p("min_price"));
    const maxPrice = num(p("max_price"));
    if (minPrice != null || maxPrice != null) {
      query.listing_price = {};
      if (minPrice != null) query.listing_price.$gte = minPrice;
      if (maxPrice != null) query.listing_price.$lte = maxPrice;
    }
    const minBeds = num(p("min_bedrooms") ?? p("bedrooms"));
    if (minBeds != null) query.bedrooms = { $gte: minBeds };
    const minBaths = num(p("min_bathrooms") ?? p("bathrooms"));
    if (minBaths != null) query.bathrooms = { $gte: minBaths };
    const propertyType = String(p("property_type") || "").trim();
    if (propertyType) query.property_type = propertyType;
    const status = String(p("status") || "").trim();
    if (status && AVAILABLE_LISTING_STATUSES.includes(status)) query.listing_status = status;

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