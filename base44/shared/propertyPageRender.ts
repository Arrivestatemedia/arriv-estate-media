// The property page renderer — ONE implementation, two callers with strictly different reach.
//
//   getPublicPropertyPage — the ordinary public surface. Production scope only: a PUBLISHED,
//                           non-certification listing. It accepts no mode that resolves a
//                           synthetic record.
//   certifyPropertyRender — the certification-only surface. Synthetic records that are owned by
//                           the calling administrator's own active certification run, nothing else.
//
// Sharing the renderer is what makes the certification path worth running: it exercises the same
// payload and the same HTML a real customer page produces. The entire difference between the two
// callers is which records they are allowed to reach — never what they render.

import {
  ADVERTISING_DISCLOSURES,
  AVAILABLE_LISTING_STATUSES,
  INQUIRY_PRIVACY_DISCLOSURES,
  mediaStreamUrl,
  propertyPageUrl,
} from "./propertyVisibility.ts";

export function statusLabel(status: string) {
  return status === "active" ? "For sale"
    : status === "pending" ? "Pending"
    : status === "sold" ? "Sold"
    : status === "withdrawn" ? "Withdrawn"
    : status === "expired" ? "Expired"
    : "Not available";
}

export function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// `publiclyAvailable` is supplied by the caller because the two callers decide availability with
// their own predicate: the public surface uses isPubliclyActive (which refuses synthetic records
// absolutely), the certification surface uses isCertificationListingAvailable (which accepts a
// record already proven synthetic and owned by the acting run).
export function buildPropertyPagePayload(listing: any, opts: { publiclyAvailable: boolean }) {
  const available = opts?.publiclyAvailable === true;
  const media = (listing.selected_media || [])
    .filter((m: any) => m.kind === "photo" || (m.kind === "video" && listing.include_video))
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  const video = media.find((m: any) => m.kind === "video");
  const streamUrl = (fileId: string) => mediaStreamUrl(listing.listing_id, fileId);

  return {
    ok: true,
    listing_id: listing.listing_id,
    public_slug: listing.public_slug,
    canonical_url: listing.canonical_url || propertyPageUrl(listing.public_slug),
    public_url: listing.public_url || propertyPageUrl(listing.public_slug),
    listing_status: listing.listing_status,
    status_label: statusLabel(listing.listing_status),
    publicly_available: available,
    // A sold / withdrawn / expired / unconfirmed listing is reachable but must never be
    // represented as available, and must not be indexed as an available home.
    indexable: available,
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
      url: streamUrl(m.drive_file_id),
    })),
    cover_url: listing.cover_file_id ? streamUrl(listing.cover_file_id) : "",
    video_url: video ? streamUrl(video.drive_file_id) : "",
    published_at: listing.published_at || null,
    last_status_confirmed_at: listing.last_status_confirmed_at || null,
    agent: {
      name: listing.agent_name || "",
      brokerage: listing.brokerage_name || "",
      license_number: listing.agent_license_number || "",
      contact_email: listing.approved_contact_email || "",
      contact_phone: listing.approved_contact_phone || "",
    },
    inquiries_enabled: available && AVAILABLE_LISTING_STATUSES.includes(listing.listing_status),
    seo_title: listing.seo_title || "",
    meta_description: listing.meta_description || "",
    structured_data: listing.structured_data || {},
    disclosures: ADVERTISING_DISCLOSURES,
    inquiry_disclosures: INQUIRY_PRIVACY_DISCLOSURES,
    property_reference: `ARRIV-${String(listing.listing_id || "").slice(-6).toUpperCase()}`,
  };
}

// Crawler-readable rendering, because this app renders client-side and search engines must not
// have to execute JavaScript to read a property page.
export function renderPropertyPageHtml(payload: any) {
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
<p>${escapeHtml((payload.disclosures || []).join(" "))}</p>
<p><a href="${escapeHtml(payload.canonical_url)}">View this property page</a></p>
</main>
</body>
</html>`;
}