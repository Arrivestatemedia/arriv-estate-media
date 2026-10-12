import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  AVAILABLE_LISTING_STATUSES,
  ADVERTISING_DISCLOSURES,
  INQUIRY_PRIVACY_DISCLOSURES,
  isPropertyVisibilityEnabled,
  isPubliclyActive,
  isPubliclyReachable,
  mediaStreamUrl,
  propertyPageUrl,
} from "../../shared/propertyVisibility.ts";

// Public property page data.
//
// Only a PUBLISHED, non-certification listing is ever described, and only the customer's
// approved media selection is exposed — every asset is served through streamPropertyMedia,
// never from a raw private URL and never from a draft listing.
//
// A crawler-readable HTML rendering is returned when format=html, because this app renders
// client-side and search engines must not have to execute JavaScript to read the page.

function statusLabel(status: string) {
  return status === "active" ? "For sale"
    : status === "pending" ? "Pending"
    : status === "sold" ? "Sold"
    : status === "withdrawn" ? "Withdrawn"
    : status === "expired" ? "Expired"
    : "Not available";
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(listing: any, payload: any) {
  const photos = (payload.media || []).map(
    (m: any) => `<figure><img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.alt_text || m.name)}" loading="lazy" />${m.alt_text ? `<figcaption>${escapeHtml(m.alt_text)}</figcaption>` : ""}</figure>`,
  ).join("\n");
  const details = [
    payload.listing_price != null ? `Price: $${Number(payload.listing_price).toLocaleString("en-US")}` : "",
    payload.bedrooms != null ? `Bedrooms: ${payload.bedrooms}` : "",
    payload.bathrooms != null ? `Bathrooms: ${payload.bathrooms}` : "",
    payload.square_footage != null ? `Square footage: ${payload.square_footage}` : "",
    payload.property_type ? `Property type: ${payload.property_type}` : "",
    `Status: ${statusLabel(payload.listing_status)}`,
  ].filter(Boolean).map((line) => `<li>${escapeHtml(line)}</li>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(payload.seo_title || payload.property_address)}</title>
<meta name="description" content="${escapeHtml(payload.meta_description)}" />
<link rel="canonical" href="${escapeHtml(payload.canonical_url)}" />
${payload.indexable ? "" : "<meta name=\"robots\" content=\"noindex,follow\" />"}
<meta property="og:type" content="website" />
<meta property="og:title" content="${escapeHtml(payload.seo_title)}" />
<meta property="og:description" content="${escapeHtml(payload.meta_description)}" />
<meta property="og:url" content="${escapeHtml(payload.canonical_url)}" />
${payload.cover_url ? `<meta property="og:image" content="${escapeHtml(payload.cover_url)}" />` : ""}
<script type="application/ld+json">${JSON.stringify(payload.structured_data)}</script>
</head>
<body>
<main>
<h1>${escapeHtml(payload.seo_title || payload.property_address)}</h1>
<p>${escapeHtml(payload.property_description)}</p>
<address>${escapeHtml([payload.property_address, payload.city, payload.state, payload.zip].filter(Boolean).join(", "))}</address>
<ul>
${details}
</ul>
${payload.agent_name ? `<p>Listed by ${escapeHtml(payload.agent_name)}${payload.brokerage_name ? `, ${escapeHtml(payload.brokerage_name)}` : ""}</p>` : ""}
${photos}
${payload.video_url ? `<p><video controls preload="metadata" src="${escapeHtml(payload.video_url)}"></video></p>` : ""}
<p>${escapeHtml(payload.disclosures.join(" "))}</p>
<p><a href="${escapeHtml(payload.canonical_url)}">View this property page</a></p>
</main>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const slug = String(body.slug || url.searchParams.get("slug") || "");
    const listingId = String(body.listing_id || url.searchParams.get("listing_id") || "");
    const format = String(body.format || url.searchParams.get("format") || "json");

    if (!slug && !listingId) return Response.json({ error: "slug is required" }, { status: 400 });

    const enabled = await isPropertyVisibilityEnabled(base44);
    if (!enabled) {
      return Response.json({ ok: false, feature_disabled: true, message: "Property pages are not yet available." }, { status: 404 });
    }

    const query = slug ? { public_slug: slug } : { listing_id: listingId };
    const rows = await base44.asServiceRole.entities.PropertyListing.filter(query);
    const listing = (Array.isArray(rows) ? rows : (rows?.items || []))[0];
    if (!listing || listing.certification_mode === true || !isPubliclyReachable(listing)) {
      return Response.json({ ok: false, error: "Property page not found" }, { status: 404 });
    }

    const media = (listing.selected_media || [])
      .filter((m: any) => m.kind === "photo" || (m.kind === "video" && listing.include_video))
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    const video = media.find((m: any) => m.kind === "video");
    const active = isPubliclyActive(listing);

    const payload: any = {
      ok: true,
      listing_id: listing.listing_id,
      public_slug: listing.public_slug,
      canonical_url: listing.canonical_url || propertyPageUrl(listing.public_slug),
      public_url: listing.public_url || propertyPageUrl(listing.public_slug),
      listing_status: listing.listing_status,
      status_label: statusLabel(listing.listing_status),
      publicly_available: active,
      // A sold / withdrawn / expired / unconfirmed listing is reachable but must never be
      // represented as available, and must not be indexed as an available home.
      indexable: active,
      property_address: listing.property_address,
      city: listing.city,
      state: listing.state,
      zip: listing.zip,
      listing_price: listing.listing_price ?? null,
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      square_footage: listing.square_footage ?? null,
      square_footage_source: listing.square_footage_source || "",
      property_type: listing.property_type || "",
      property_description: listing.property_description || "",
      amenities: listing.amenities || [],
      media: media.map((m: any) => ({
        drive_file_id: m.drive_file_id,
        kind: m.kind,
        alt_text: m.alt_text || "",
        name: m.name,
        url: mediaStreamUrl(listing.listing_id, m.drive_file_id),
      })),
      cover_url: listing.cover_file_id ? mediaStreamUrl(listing.listing_id, listing.cover_file_id) : "",
      video_url: video ? mediaStreamUrl(listing.listing_id, video.drive_file_id) : "",
      published_at: listing.published_at || null,
      last_status_confirmed_at: listing.last_status_confirmed_at || null,
      agent: {
        name: listing.agent_name || "",
        brokerage: listing.brokerage_name || "",
        license_number: listing.agent_license_number || "",
        contact_email: listing.approved_contact_email || "",
        contact_phone: listing.approved_contact_phone || "",
      },
      inquiries_enabled: active && AVAILABLE_LISTING_STATUSES.includes(listing.listing_status),
      seo_title: listing.seo_title || "",
      meta_description: listing.meta_description || "",
      structured_data: listing.structured_data || {},
      disclosures: ADVERTISING_DISCLOSURES,
      inquiry_disclosures: INQUIRY_PRIVACY_DISCLOSURES,
      property_reference: `ARRIV-${String(listing.listing_id || "").slice(-6).toUpperCase()}`,
    };

    if (format === "html") {
      return new Response(renderHtml(listing, payload), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
      });
    }
    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});