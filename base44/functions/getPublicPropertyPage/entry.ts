import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  isPubliclyActive,
  isPubliclyReachable,
  recordInScope,
  resolveFeatureGate,
} from "../../shared/propertyVisibility.ts";
import {
  buildPropertyPagePayload,
  renderPropertyPageHtml,
} from "../../shared/propertyPageRender.ts";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const slug = String(body.slug || url.searchParams.get("slug") || "");
    const listingId = String(body.listing_id || url.searchParams.get("listing_id") || "");
    const format = String(body.format || url.searchParams.get("format") || "json");

    if (!slug && !listingId) return Response.json({ error: "slug is required" }, { status: 400 });

    // ABSOLUTE BLOCK on synthetic records: this endpoint accepts no test-mode parameter at all, so
    // no request can put it into a mode that resolves a certification record. Production scope
    // governs every call. Certification exercises the real renderer through the administrator-
    // authorized, certification-only endpoint instead.
    const gate = await resolveFeatureGate(base44, false);
    if (!gate.enabled) {
      return Response.json({ ok: false, feature_disabled: true, message: "Property pages are not yet available." }, { status: 404 });
    }

    const query = slug ? { public_slug: slug } : { listing_id: listingId };
    const rows = await base44.asServiceRole.entities.PropertyListing.filter(query);
    const listing = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
    if (!listing || !recordInScope(listing, gate.test_mode) || !isPubliclyReachable(listing)) {
      return Response.json({ ok: false, error: "Property page not found" }, { status: 404 });
    }

    const payload = buildPropertyPagePayload(listing, { publiclyAvailable: isPubliclyActive(listing) });

    if (format === "html") {
      return new Response(renderPropertyPageHtml(payload), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});