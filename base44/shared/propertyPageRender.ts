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
  inquiryEndpointUrl,
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
//
// The page a visitor actually lands on from a search result is this document, so it has to be a
// finished, readable page on a phone as well as a crawler: brand-consistent presentation, the
// approved facts, the approved media in the customer's order, the listing contact, and a working
// inquiry form. The form posts cross-origin to the public inquiry endpoint on the app host (the
// edge proxies GET content only); that endpoint validates, screens and rate-limits every submission
// and routes it to the listing's own authorized contact, and nothing else.
export function renderPropertyPageHtml(payload: any) {
  const agent = payload.agent || {};
  const photos = (payload.media || [])
    .filter((m: any) => m.kind === "photo")
    .map(
      (m: any) =>
        `<figure><img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.alt_text || m.name)}" loading="lazy" decoding="async" />${m.alt_text ? `<figcaption>${escapeHtml(m.alt_text)}</figcaption>` : ""}</figure>`,
    )
    .join("\n");

  const facts: [string, string][] = ([
    payload.listing_price != null ? ["Price", `$${Number(payload.listing_price).toLocaleString("en-US")}`] : null,
    payload.bedrooms != null ? ["Bedrooms", String(payload.bedrooms)] : null,
    payload.bathrooms != null ? ["Bathrooms", String(payload.bathrooms)] : null,
    payload.square_footage != null ? ["Square footage", Number(payload.square_footage).toLocaleString("en-US")] : null,
    payload.property_type ? ["Property type", String(payload.property_type).replace(/_/g, " ")] : null,
    ["Status", statusLabel(payload.listing_status)],
  ].filter(Boolean) as [string, string][]).map(
    ([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`,
  ).join("\n");

  const contactLines = [agent.contact_email, agent.contact_phone].filter(Boolean);
  const agentCard = agent.name
    ? `<section class="card">
  <h2>Listing contact</h2>
  <p><strong>${escapeHtml(agent.name)}</strong>${agent.brokerage ? ` &middot; ${escapeHtml(agent.brokerage)}` : ""}</p>
  ${agent.license_number ? `<p class="muted">License ${escapeHtml(agent.license_number)}</p>` : ""}
  ${contactLines.length ? `<p class="muted">${escapeHtml(contactLines.join(" \u00b7 "))}</p>` : ""}
</section>`
    : "";

  const inquiry = payload.inquiries_enabled === true
    ? `<section class="card" id="inquire">
  <h2>Ask about this property</h2>
  <p class="muted">Property reference ${escapeHtml(payload.property_reference)}</p>
  <form id="arriv-inquiry-form" novalidate>
    <label for="arriv-name">Your name</label>
    <input id="arriv-name" name="name" autocomplete="name" required />
    <label for="arriv-email">Email address</label>
    <input id="arriv-email" name="email" type="email" autocomplete="email" required />
    <label for="arriv-phone">Phone (optional)</label>
    <input id="arriv-phone" name="phone" type="tel" autocomplete="tel" />
    <label for="arriv-message">Your message</label>
    <textarea id="arriv-message" name="message" rows="4" required></textarea>
    <input id="arriv-honeypot" name="company_website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot" />
    <label class="check"><input id="arriv-consent" type="checkbox" required /> I consent to being contacted about this property and I have read the privacy disclosures below.</label>
    <ul class="small muted">${(payload.inquiry_disclosures || []).map((d: string) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
    <p id="arriv-inquiry-error" class="error" hidden></p>
    <button type="submit" id="arriv-submit">Send inquiry</button>
  </form>
  <p id="arriv-inquiry-sent" class="sent" hidden></p>
</section>
<script>
(function () {
  var form = document.getElementById("arriv-inquiry-form");
  if (!form) return;
  var endpoint = ${JSON.stringify(inquiryEndpointUrl())};
  var slug = ${JSON.stringify(payload.public_slug)};
  var error = document.getElementById("arriv-inquiry-error");
  var sent = document.getElementById("arriv-inquiry-sent");
  var button = document.getElementById("arriv-submit");
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    error.hidden = true;
    button.disabled = true;
    button.textContent = "Sending...";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: slug,
        name: document.getElementById("arriv-name").value,
        email: document.getElementById("arriv-email").value,
        phone: document.getElementById("arriv-phone").value,
        message: document.getElementById("arriv-message").value,
        consent_privacy: document.getElementById("arriv-consent").checked,
        company_website: document.getElementById("arriv-honeypot").value,
      }),
    })
      .then(function (response) { return response.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (!data || data.ok !== true) { throw new Error((data && data.message) || "Your inquiry could not be sent."); }
        form.hidden = true;
        sent.textContent = "Your inquiry has been sent" + (data.reference ? " (reference " + data.reference + ")" : "") + ". The listing contact will respond directly.";
        sent.hidden = false;
      })
      .catch(function (err) {
        error.textContent = (err && err.message) || "Your inquiry could not be sent.";
        error.hidden = false;
        button.disabled = false;
        button.textContent = "Send inquiry";
      });
  });
})();
</script>`
    : "";

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
<meta property="og:site_name" content="Arriv Estate Media" />
${payload.cover_url ? `<meta property="og:image" content="${escapeHtml(payload.cover_url)}" />` : ""}
<script type="application/ld+json">${JSON.stringify(payload.structured_data)}</script>
<style>
* { box-sizing: border-box; }
body { margin: 0; background: #fffbf5; color: #1a1a1a; font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; -webkit-text-size-adjust: 100%; }
.wrap { max-width: 980px; margin: 0 auto; padding: 0 20px; }
.band { background: #1a1a1a; padding: 14px 0; }
.band .wrap { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.brand { color: #b8956a; text-transform: uppercase; letter-spacing: 0.16em; font-size: 12px; }
.band .status { color: #fffbf5; opacity: 0.75; font-size: 12px; }
main.wrap { padding-top: 30px; padding-bottom: 60px; }
h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 700; font-size: clamp(1.7rem, 4.4vw, 2.5rem); line-height: 1.15; margin: 0 0 8px; }
h2 { font-size: 1.05rem; margin: 0 0 10px; }
.addr { opacity: 0.65; margin: 0 0 20px; }
.desc { margin: 0 0 22px; }
.facts { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 0; margin: 0 0 28px; }
.facts li { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; }
.facts span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.55; }
.facts strong { font-size: 1.02rem; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; margin: 0 0 28px; padding: 0; }
.gallery figure { margin: 0; }
.gallery img { width: 100%; height: auto; display: block; border-radius: 12px; background: #ffffff; }
.gallery figcaption { font-size: 12px; opacity: 0.6; margin-top: 6px; }
.video { width: 100%; height: auto; border-radius: 12px; margin-bottom: 28px; display: block; }
.card { background: #ffffff; border: 1px solid rgba(184, 149, 106, 0.35); border-radius: 14px; padding: 22px; margin: 0 0 20px; }
.muted { opacity: 0.6; font-size: 13px; margin: 0 0 12px; }
.small { font-size: 12px; padding-left: 18px; }
label { display: block; font-size: 13px; margin: 12px 0 4px; }
input, textarea { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid #d7d2c8; border-radius: 10px; background: #fffbf5; }
label.check { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; font-size: 13px; }
label.check input { width: auto; margin-top: 3px; }
.honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; }
button { margin-top: 18px; width: 100%; font: inherit; font-weight: 600; padding: 13px 20px; border: 0; border-radius: 999px; background: #b8956a; color: #1a1a1a; cursor: pointer; }
button[disabled] { opacity: 0.6; cursor: default; }
.error { color: #b3261e; font-size: 13px; margin: 14px 0 0; }
.sent { background: #f3efe9; border: 1px solid rgba(184, 149, 106, 0.35); border-radius: 12px; padding: 16px; margin: 14px 0 0; }
.disclosures { border-top: 1px solid #e5e7eb; margin-top: 28px; padding-top: 18px; font-size: 12px; opacity: 0.65; }
.disclosures li { margin-bottom: 6px; }
@media (min-width: 720px) { .card { padding: 28px; } }
</style>
</head>
<body>
<header class="band"><div class="wrap"><span class="brand">Arriv Estate Media</span><span class="status">${escapeHtml(statusLabel(payload.listing_status))}</span></div></header>
<main class="wrap">
<h1>${escapeHtml(payload.seo_title || payload.property_address)}</h1>
<p class="addr">${escapeHtml([payload.property_address, payload.city, payload.state, payload.zip].filter(Boolean).join(", "))}</p>
<p class="desc">${escapeHtml(payload.property_description)}</p>
<ul class="facts">
${facts}
</ul>
<section class="gallery">
${photos}
</section>
${payload.video_url ? `<video class="video" controls preload="metadata" playsinline src="${escapeHtml(payload.video_url)}"></video>` : ""}
${agentCard}
${inquiry}
<section class="disclosures">
<p>Disclosures</p>
<ul>${(payload.disclosures || []).map((d: string) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
</section>
</main>
</body>
</html>`;
}