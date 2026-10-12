import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  AVAILABLE_LISTING_STATUSES,
  STATUS_CONFIRMATION_WINDOW_DAYS,
  isPropertyVisibilityEnabled,
  propertyPageUrl,
} from "../../shared/propertyVisibility.ts";

// Sitemap for published property pages.
//
// Only published, non-certification listings that are currently publicly active are included.
// A sold, withdrawn, expired or unconfirmed listing is deliberately absent, so the sitemap can
// never advertise a property that is not available.

function escapeXml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const enabled = await isPropertyVisibilityEnabled(base44);
    if (!enabled) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
        { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } },
      );
    }

    const cutoff = new Date(Date.now() - STATUS_CONFIRMATION_WINDOW_DAYS * 86400000).toISOString();
    const rows = await base44.asServiceRole.entities.PropertyListing.filter({
      publication_state: "PUBLISHED",
      listing_status: { $in: AVAILABLE_LISTING_STATUSES },
      certification_mode: { $ne: true },
      last_status_confirmed_at: { $gte: cutoff },
    }, { sort: "-published_at", limit: 500 });

    const listings = Array.isArray(rows) ? rows : (rows?.items || []);
    const urls = listings
      .map((l: any) => `  <url>\n    <loc>${escapeXml(l.canonical_url || propertyPageUrl(l.public_slug))}</loc>\n    <lastmod>${escapeXml((l.updated_at || l.published_at || "").slice(0, 10))}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
    return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});