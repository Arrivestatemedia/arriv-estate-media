import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  AVAILABLE_LISTING_STATUSES,
  STATUS_CONFIRMATION_WINDOW_DAYS,
  certificationScope,
  resolveFeatureGate,
  testModeRequested,
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
    const url = new URL(req.url);
    const gate = await resolveFeatureGate(base44, testModeRequested(url.searchParams.get("test_mode")));
    if (!gate.enabled) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
        { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } },
      );
    }

    const cutoff = new Date(Date.now() - STATUS_CONFIRMATION_WINDOW_DAYS * 86400000).toISOString();
    const rows = await base44.asServiceRole.entities.PropertyListing.filter({
      publication_state: "PUBLISHED",
      listing_status: { $in: AVAILABLE_LISTING_STATUSES },
      certification_mode: certificationScope(gate.test_mode),
      last_status_confirmed_at: { $gte: cutoff },
    }, { sort: "-published_at", limit: 500 });

    const listings = Array.isArray(rows) ? rows : (rows?.items || []);
    const listingUrls = listings
      .map((l: any) => `  <url>\n    <loc>${escapeXml(l.canonical_url || propertyPageUrl(l.public_slug))}</loc>\n    <lastmod>${escapeXml((l.updated_at || l.published_at || "").slice(0, 10))}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`);

    // Phase 4 additions: geographic discovery pages and public professional profiles.
    //
    // Both lists are built from the same rules their pages use — a market only appears when it is
    // published and currently eligible, and a profile only when it is published, authorized and
    // approved. A thin or unpublished page can therefore never enter the sitemap.
    const extraUrls: string[] = [];
    try {
      const origin = (globalThis as any)?.process?.env?.PROPERTY_PUBLIC_ORIGIN
        || (globalThis as any)?.process?.env?.BASE44_APP_DOMAIN
        || "";
      const base = /^https?:\/\//i.test(String(origin)) ? String(origin).replace(/\/+$/, "") : `https://${String(origin).replace(/\/+$/, "")}`;

      const listOf = (result: any): any[] => (Array.isArray(result) ? result : result?.items || []);
      const marketRows = listOf(await base44.asServiceRole.entities.GeographicMarket.list("-updated_at", 100));
      for (const market of marketRows as any[]) {
        if (market?.status !== "published" || market?.indexing !== "index" || market?.sitemap_eligible !== true) continue;
        if (!market?.slug) continue;
        extraUrls.push(`  <url>\n    <loc>${escapeXml(`${base}/properties/in/${market.slug}`)}</loc>\n    <lastmod>${escapeXml(String(market.updated_at || market.approved_at || "").slice(0, 10))}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`);
      }

      const profileRows = listOf(await base44.asServiceRole.entities.ProfessionalProfile.list("-updated_at", 400));
      for (const profile of profileRows as any[]) {
        if (profile?.publication_state !== "PUBLISHED") continue;
        if (profile?.authorization_confirmed !== true || !profile?.admin_approved_at) continue;
        if (profile?.indexing !== "index" || profile?.certification_mode === true) continue;
        if (!profile?.slug) continue;
        const path = profile.profile_type === "brokerage" ? `/brokerages/${profile.slug}` : `/agents/${profile.slug}`;
        extraUrls.push(`  <url>\n    <loc>${escapeXml(`${base}${path}`)}</loc>\n    <lastmod>${escapeXml(String(profile.updated_at || "").slice(0, 10))}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>`);
      }
    } catch {
      // A sitemap must never fail because an optional page type is unavailable.
    }

    const urls = [...listingUrls, ...extraUrls].join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
    return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});