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
  DIRECTORY_PATH,
  INQUIRY_PRIVACY_DISCLOSURES,
  MEDIA_SERVICES_URL,
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

// How many photographs the page shows before it offers the rest. A buyer should reach the property
// facts and the inquiry form quickly on a phone; the remaining media stays one tap away, and the
// photograph viewer always holds every photograph the customer approved.
const INITIAL_PHOTO_COUNT = 8;

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
      // The listing contact's own approved headshot. Deliberately a public asset: this page renders
      // without a session, so a private file could not be shown here at all.
      photo_url: listing.agent_photo_url || "",
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
// finished, readable page on a phone as well as a crawler. It is built in the same visual language
// as the client delivery gallery — dark cinematic frame, gold ambient glow and gold lockup, serif
// display type, media first — with off-white (cream) reading surfaces carrying the approved facts,
// the approved media in the customer's order, the listing contact and the inquiry form.
//
// The form posts cross-origin to the public inquiry endpoint on the app host (the edge proxies GET
// content only); that endpoint validates, screens and rate-limits every submission and routes it to
// the listing's own authorized contact, and nothing else.
export function renderPropertyPageHtml(payload: any) {
  const agent = payload.agent || {};
  const address = String(payload.property_address || "").trim();
  const location = [payload.property_address, payload.city, payload.state, payload.zip].filter(Boolean).join(", ");
  const photos = (payload.media || []).filter((m: any) => m.kind === "photo");
  const visiblePhotos = photos.slice(0, INITIAL_PHOTO_COUNT);
  const remainingPhotos = photos.slice(INITIAL_PHOTO_COUNT);

  const shot = (m: any, index: number) => {
    const alt = String(m.alt_text || m.name || `Photograph of ${address}`);
    return `<figure class="shot">
  <button type="button" class="shot-btn" aria-label="View photograph full size: ${escapeHtml(alt)}">
    <img src="${escapeHtml(m.url)}" alt="${escapeHtml(alt)}" loading="${index < 2 ? "eager" : "lazy"}" decoding="async" />
  </button>
  ${m.alt_text ? `<figcaption>${escapeHtml(m.alt_text)}</figcaption>` : ""}
</figure>`;
  };
  const shots = visiblePhotos.map(shot).join("\n");
  // The rest of the gallery, held back until asked for. Hidden rather than omitted, so the
  // photograph viewer still moves through the customer's whole approved sequence.
  const moreShots = remainingPhotos.length
    ? `<div class="shots" id="arriv-shots-more" hidden>
${remainingPhotos.map((m: any, i: number) => shot(m, visiblePhotos.length + i)).join("\n")}
</div>`
    : "";
  const moreButton = remainingPhotos.length
    ? `<button type="button" class="more" id="arriv-more-shots">View all ${photos.length} photographs</button>`
    : "";
  // The two things a buyer actually wants to do, placed with the address rather than at the foot
  // of the gallery. Both jump to the inquiry form and open their message.
  const ctaRow = payload.inquiries_enabled === true
    ? `<div class="cta-row">
  <a class="cta" href="#inquire" data-ask="Please send me more information about ${escapeHtml(location)}.">Ask about this property</a>
  <a class="cta ghost" href="#inquire" data-ask="I would like to schedule a showing of ${escapeHtml(location)}.">Schedule a showing</a>
</div>`
    : "";

  const heroPills = [
    payload.bedrooms != null ? `${payload.bedrooms} bed` : null,
    payload.bathrooms != null ? `${payload.bathrooms} bath` : null,
    payload.square_footage != null ? `${Number(payload.square_footage).toLocaleString("en-US")} sq ft` : null,
    payload.property_type ? String(payload.property_type).replace(/_/g, " ") : null,
  ].filter(Boolean) as string[];

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

  const amenities = (payload.amenities || []).length
    ? `<section class="card">
  <h2>Amenities</h2>
  <ul class="chips">${(payload.amenities || []).map((a: string) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
</section>`
    : "";

  // The listing contact exactly as the contact approved it, with the brokerage named for itself
  // (advertising rules require the brokerage to be identifiable), then the agent, the license
  // number, the contact details they chose and their own photograph when they supplied one.
  const contactLinks = [
    agent.contact_email ? `<a href="mailto:${escapeHtml(agent.contact_email)}">${escapeHtml(agent.contact_email)}</a>` : "",
    agent.contact_phone ? `<a href="tel:${escapeHtml(String(agent.contact_phone).replace(/[^0-9+]/g, ""))}">${escapeHtml(agent.contact_phone)}</a>` : "",
  ].filter(Boolean);
  const agentCard = agent.name
    ? `<section class="card">
  ${agent.photo_url ? `<img class="agent-photo" src="${escapeHtml(agent.photo_url)}" alt="${escapeHtml(agent.name)}" decoding="async" />` : ""}
  <h2>Listing contact</h2>
  ${agent.brokerage ? `<p class="brokerage">${escapeHtml(agent.brokerage)}</p>` : ""}
  <p class="agent-name">${escapeHtml(agent.name)}</p>
  ${agent.license_number ? `<p class="muted">License ${escapeHtml(agent.license_number)}</p>` : ""}
  ${contactLinks.length ? `<p class="contact">${contactLinks.join(" &middot; ")}</p>` : ""}
</section>`
    : "";

  const inquiry = payload.inquiries_enabled === true
    ? `<section class="form-card" id="inquire">
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
    <ul class="small">${(payload.inquiry_disclosures || []).map((d: string) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
    <p id="arriv-inquiry-error" class="error" hidden></p>
    <button type="submit" id="arriv-submit" class="submit">Send inquiry</button>
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
  // The buttons beside the address bring the visitor straight here and open the message with what
  // they came to ask, so an inquiry is one tap from the top of the page.
  [].slice.call(document.querySelectorAll(".cta[data-ask]")).forEach(function (link) {
    link.addEventListener("click", function () {
      var field = document.getElementById("arriv-message");
      if (!field) return;
      field.value = link.getAttribute("data-ask") || "";
      window.setTimeout(function () { field.focus(); }, 400);
    });
  });
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
    : `<section class="form-card">
  <h2>Enquiries</h2>
  <p class="muted">This property is ${escapeHtml(statusLabel(payload.listing_status).toLowerCase())} and is not currently accepting inquiries.</p>
</section>`;

  const lightbox = photos.length
    ? `<div id="arriv-lightbox" class="lightbox" hidden role="dialog" aria-modal="true" aria-label="Photograph viewer">
  <button type="button" class="lb-btn lb-close" aria-label="Close photograph viewer">&#10005;</button>
  <button type="button" class="lb-btn lb-prev" aria-label="Previous photograph">&#8249;</button>
  <img id="arriv-lightbox-img" alt="" />
  <button type="button" class="lb-btn lb-next" aria-label="Next photograph">&#8250;</button>
  <p id="arriv-lightbox-cap" class="lb-cap" hidden></p>
</div>
<script>
(function () {
  var buttons = [].slice.call(document.querySelectorAll(".shot-btn"));
  if (!buttons.length) return;
  var box = document.getElementById("arriv-lightbox");
  var image = document.getElementById("arriv-lightbox-img");
  var caption = document.getElementById("arriv-lightbox-cap");
  var index = 0;
  var total = buttons.length;
  function show(next) {
    index = (next + total) % total;
    var source = buttons[index].querySelector("img");
    image.src = source.getAttribute("src");
    image.alt = source.getAttribute("alt") || "";
    var figure = buttons[index].parentNode;
    var label = figure ? figure.querySelector("figcaption") : null;
    var text = label ? label.textContent : "";
    if (total > 1) text = (text ? text + " &middot; " : "") + (index + 1) + " / " + total;
    caption.textContent = text;
    caption.hidden = !text;
    box.hidden = false;
  }
  function close() { box.hidden = true; }
  // "View all" just reveals the photographs the first view held back; the viewer above already
  // holds every one of them, so nothing is fetched twice and nothing is withheld from a buyer.
  var moreButton = document.getElementById("arriv-more-shots");
  var moreShots = document.getElementById("arriv-shots-more");
  if (moreButton && moreShots) {
    moreButton.addEventListener("click", function () { moreShots.hidden = false; moreButton.hidden = true; });
  }
  buttons.forEach(function (button, i) { button.addEventListener("click", function () { show(i); }); });
  box.querySelector(".lb-close").addEventListener("click", close);
  box.querySelector(".lb-prev").addEventListener("click", function () { show(index - 1); });
  box.querySelector(".lb-next").addEventListener("click", function () { show(index + 1); });
  box.addEventListener("click", function (event) { if (event.target === box) close(); });
  // Swipe left / right inside the viewer, so a visitor on a phone moves between photographs
  // without closing it and tapping another thumbnail.
  var touchX = null;
  var touchY = null;
  box.addEventListener("touchstart", function (event) {
    if (event.touches.length !== 1) { touchX = null; return; }
    touchX = event.touches[0].clientX;
    touchY = event.touches[0].clientY;
  }, { passive: true });
  box.addEventListener("touchend", function (event) {
    if (touchX === null) return;
    var touch = event.changedTouches[0];
    var dx = touch.clientX - touchX;
    var dy = touch.clientY - touchY;
    touchX = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
  document.addEventListener("keydown", function (event) {
    if (box.hidden) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
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
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #0a0b0f; color: rgba(255, 251, 245, 0.72); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
img, video { max-width: 100%; }
.glow { position: fixed; inset: 0; overflow: hidden; pointer-events: none; }
.glow i { position: absolute; display: block; border-radius: 999px; background: #b8956a; filter: blur(110px); }
.glow i.a { top: -180px; left: -10%; width: 620px; height: 620px; opacity: 0.10; }
.glow i.b { bottom: -220px; right: -8%; width: 520px; height: 520px; opacity: 0.07; }
.gridlines { position: fixed; inset: 0; pointer-events: none; opacity: 0.035; background-image: linear-gradient(#b8956a 1px, transparent 1px), linear-gradient(90deg, #b8956a 1px, transparent 1px); background-size: 44px 44px; }
.frame { position: relative; z-index: 1; }
.wrap { width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 20px; }
.topbar { padding: 22px 0 4px; }
.bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.lock { display: flex; align-items: center; gap: 11px; text-decoration: none; }
.mark { position: relative; width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #b8956a, #8a6d4a); display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 34px rgba(184, 149, 106, 0.35); }
.mark svg { width: 20px; height: 20px; }
.eyebrow { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #b8956a; line-height: 1; }
.sub { display: block; font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(255, 251, 245, 0.32); line-height: 1; margin-top: 6px; }
.nav { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.nav a { display: inline-block; padding: 7px 13px; border-radius: 999px; font-size: 12px; font-weight: 600; text-decoration: none; color: rgba(255, 251, 245, 0.72); background: rgba(255, 251, 245, 0.05); border: 1px solid rgba(255, 251, 245, 0.12); }
.nav a:hover { color: #fffbf5; border-color: rgba(184, 149, 106, 0.5); }
.nav a.gold { background: linear-gradient(135deg, #c9a87b, #b8956a); border-color: transparent; color: #0a0b0f; box-shadow: 0 10px 26px rgba(184, 149, 106, 0.28); }
.nav a.gold:hover { opacity: 0.94; }
.status { margin-left: auto; flex: 0 0 auto; padding: 7px 14px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(184, 149, 106, 0.15); border: 1px solid rgba(184, 149, 106, 0.3); color: #b8956a; }
h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; color: #fffbf5; font-size: clamp(1.9rem, 6.2vw, 3rem); line-height: 1.12; letter-spacing: -0.015em; margin: 26px 0 12px; }
.loc { display: flex; align-items: center; gap: 8px; color: rgba(255, 251, 245, 0.5); font-size: 14px; margin: 0 0 8px; }
.loc svg { width: 15px; height: 15px; flex: 0 0 auto; }
.price { font-family: Georgia, "Times New Roman", serif; color: #fffbf5; font-size: clamp(1.4rem, 4.4vw, 1.9rem); margin: 16px 0 0; }
.pills { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 24px; padding: 0; list-style: none; }
.pills li { padding: 7px 14px; border-radius: 999px; background: rgba(255, 251, 245, 0.05); border: 1px solid rgba(255, 251, 245, 0.1); font-size: 12px; font-weight: 500; color: rgba(255, 251, 245, 0.72); }
.notice { display: flex; align-items: center; gap: 10px; margin: 0 0 20px; padding: 13px 16px; border-radius: 14px; background: rgba(184, 149, 106, 0.1); border: 1px solid rgba(184, 149, 106, 0.3); font-size: 13.5px; color: rgba(255, 251, 245, 0.75); }
.notice span { flex: 0 0 auto; padding: 4px 9px; border-radius: 6px; background: #b8956a; color: #0a0b0f; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.cover { margin: 0 0 26px; border-radius: 20px; overflow: hidden; border: 1px solid rgba(184, 149, 106, 0.28); box-shadow: 0 30px 80px rgba(184, 149, 106, 0.18); background: rgba(255, 255, 255, 0.04); }
.cover img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; }
.shots { columns: 2; column-gap: 12px; margin: 0 0 30px; }
.shot { margin: 0 0 12px; break-inside: avoid; display: inline-block; width: 100%; }
.shot-btn { display: block; width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; border-radius: 14px; overflow: hidden; box-shadow: inset 0 0 0 1px rgba(255, 251, 245, 0.08); transition: box-shadow 0.3s ease, transform 0.3s ease; }
.shot-btn:hover { box-shadow: inset 0 0 0 1px rgba(184, 149, 106, 0.6), 0 18px 40px rgba(184, 149, 106, 0.22); transform: translateY(-2px); }
.shot img { display: block; width: 100%; height: auto; }
.shot figcaption { font-size: 11px; color: rgba(255, 251, 245, 0.4); padding-top: 6px; }
.tour { width: 100%; display: block; border-radius: 18px; margin: 0 0 30px; border: 1px solid rgba(184, 149, 106, 0.25); background: #000; }
.cream { background: #fffbf5; color: #1a1a1a; border-radius: 28px 28px 0 0; margin-top: 34px; padding: 34px 0 42px; }
.cream h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 1.2rem; color: #1a1a1a; margin: 0 0 12px; }
.cols { display: grid; gap: 20px; }
.card { background: #ffffff; border: 1px solid rgba(26, 26, 26, 0.06); border-radius: 18px; padding: 22px; margin: 0 0 18px; }
.card p { margin: 0 0 8px; }
.card p:last-child { margin-bottom: 0; }
.facts2 { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 10px; padding: 0; margin: 0; }
.facts2 li { background: #fffbf5; border: 1px solid rgba(184, 149, 106, 0.22); border-radius: 14px; padding: 12px 14px; }
.facts2 span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(26, 26, 26, 0.45); }
.facts2 strong { display: block; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 1.1rem; color: #1a1a1a; }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0; }
.chips li { padding: 6px 12px; border-radius: 999px; background: #fffbf5; border: 1px solid rgba(184, 149, 106, 0.22); font-size: 13px; color: rgba(26, 26, 26, 0.7); }
.form-card { background: #ffffff; border: 1px solid rgba(184, 149, 106, 0.3); border-radius: 18px; padding: 22px; margin: 0 0 18px; box-shadow: 0 24px 60px rgba(26, 26, 26, 0.06); }
.muted { color: rgba(26, 26, 26, 0.5); font-size: 12.5px; margin: 0 0 10px; }
label { display: block; font-size: 12px; font-weight: 600; color: rgba(26, 26, 26, 0.6); margin: 14px 0 5px; }
input, textarea { width: 100%; font: inherit; font-size: 15px; padding: 12px 14px; border: 1px solid rgba(26, 26, 26, 0.14); border-radius: 12px; background: #fffbf5; color: #1a1a1a; }
input:focus, textarea:focus { outline: 2px solid rgba(184, 149, 106, 0.45); outline-offset: 1px; border-color: #b8956a; }
label.check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; font-size: 12.5px; color: rgba(26, 26, 26, 0.7); margin-top: 16px; }
label.check input { width: auto; flex: 0 0 auto; margin-top: 3px; }
.honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.small { font-size: 11.5px; line-height: 1.5; color: rgba(26, 26, 26, 0.5); padding-left: 16px; margin: 12px 0 0; }
button.submit { margin-top: 18px; width: 100%; font: inherit; font-size: 15px; font-weight: 600; padding: 15px 22px; border: 0; border-radius: 999px; background: linear-gradient(135deg, #c9a87b, #b8956a); color: #0a0b0f; cursor: pointer; box-shadow: 0 16px 34px rgba(184, 149, 106, 0.32); }
button.submit[disabled] { opacity: 0.6; cursor: default; }
.error { color: #a33327; font-size: 13px; font-weight: 600; margin: 14px 0 0; }
.sent { background: #fffbf5; border: 1px solid rgba(184, 149, 106, 0.35); border-radius: 14px; padding: 16px; margin: 14px 0 0; font-size: 14px; }
.cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 22px; }
.cta { display: inline-flex; align-items: center; justify-content: center; padding: 14px 22px; border-radius: 999px; font-size: 14px; font-weight: 700; text-decoration: none; background: linear-gradient(135deg, #c9a87b, #b8956a); color: #0a0b0f; box-shadow: 0 14px 32px rgba(184, 149, 106, 0.3); }
.cta.ghost { background: rgba(255, 251, 245, 0.05); border: 1px solid rgba(184, 149, 106, 0.45); color: #fffbf5; box-shadow: none; }
.cta:hover { opacity: 0.94; }
.more { display: block; width: 100%; margin: 0 0 26px; padding: 15px 22px; font: inherit; font-size: 14px; font-weight: 600; border-radius: 999px; border: 1px solid rgba(184, 149, 106, 0.45); background: rgba(184, 149, 106, 0.1); color: #fffbf5; cursor: pointer; }
.more:hover { background: rgba(184, 149, 106, 0.18); }
.more[hidden] { display: none; }
.card .agent-photo { width: 76px; height: 76px; object-fit: cover; border-radius: 16px; border: 1px solid rgba(184, 149, 106, 0.3); margin: 0 0 14px; }
.card .brokerage { font-family: Georgia, "Times New Roman", serif; font-size: 1.05rem; color: #1a1a1a; margin: 0 0 3px; }
.card .agent-name { font-size: 14px; color: rgba(26, 26, 26, 0.7); margin: 0 0 8px; }
.card .contact { margin: 6px 0 0; }
.card .contact a { color: #8a6d4a; font-weight: 600; text-decoration: none; }
.card .contact a:hover { text-decoration: underline; }
.disc { font-size: 11.5px; line-height: 1.6; color: rgba(26, 26, 26, 0.5); }
.disc ul { padding-left: 16px; margin: 8px 0 0; }
.disc li { margin-bottom: 5px; }
.foot { padding: 28px 0 44px; }
.foot p { margin: 10px 0 0; font-size: 11.5px; color: rgba(255, 251, 245, 0.35); }
.foot a { color: #b8956a; text-decoration: none; }
.foot a:hover { text-decoration: underline; }
.footlinks { margin-top: 14px !important; }
.footlinks a { font-weight: 600; }
.lightbox { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(5, 5, 7, 0.95); }
.lightbox[hidden] { display: none; }
.lightbox img { max-width: 95vw; max-height: 86vh; object-fit: contain; border-radius: 12px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6); }
.lb-btn { position: absolute; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: rgba(255, 251, 245, 0.08); border: 1px solid rgba(255, 251, 245, 0.15); color: #fffbf5; font-size: 20px; line-height: 1; cursor: pointer; }
.lb-close { top: 16px; right: 16px; }
.lb-prev { left: 12px; top: 50%; transform: translateY(-50%); }
.lb-next { right: 12px; top: 50%; transform: translateY(-50%); }
.lb-cap { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); margin: 0; padding: 8px 16px; border-radius: 999px; background: rgba(255, 251, 245, 0.06); border: 1px solid rgba(255, 251, 245, 0.12); font-size: 12px; color: rgba(255, 251, 245, 0.8); max-width: 90vw; text-align: center; }
@media (min-width: 720px) { .shots { columns: 3; column-gap: 14px; } .shot { margin-bottom: 14px; } .cream { padding: 46px 0 56px; } }
@media (min-width: 900px) { .cols { grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); gap: 30px; align-items: start; } .card, .form-card { padding: 26px; } }
</style>
</head>
<body>
<div class="glow" aria-hidden="true"><i class="a"></i><i class="b"></i></div>
<div class="gridlines" aria-hidden="true"></div>
<div class="frame">
<header class="topbar"><div class="wrap bar">
  <a class="lock" href="${DIRECTORY_PATH}">
    <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="#0a0b0f"><path d="M12 3 3 10.2V21h6.2v-6.1h5.6V21H21V10.2z"/></svg></span>
    <span><span class="eyebrow">Arriv Estate Media</span><span class="sub">Property Marketing</span></span>
  </a>
  <nav class="nav">
    <a href="${DIRECTORY_PATH}">Browse properties</a>
    <a class="gold" href="${MEDIA_SERVICES_URL}">Need media services?</a>
  </nav>
  <span class="status">${escapeHtml(statusLabel(payload.listing_status))}</span>
</div></header>
<main class="wrap">
<h1>${escapeHtml(address)}</h1>
<p class="loc"><svg viewBox="0 0 24 24" fill="none" stroke="#b8956a" stroke-width="1.7" aria-hidden="true"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>${escapeHtml(location)}</p>
${payload.publicly_available ? "" : `<div class="notice"><span>${escapeHtml(statusLabel(payload.listing_status))}</span>This property is ${escapeHtml(statusLabel(payload.listing_status).toLowerCase())} and is not currently available.</div>`}
${payload.listing_price != null ? `<p class="price">$${Number(payload.listing_price).toLocaleString("en-US")}</p>` : ""}
${heroPills.length ? `<ul class="pills">${heroPills.map((p: string) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
${ctaRow}
${payload.cover_url ? `<div class="cover"><img src="${escapeHtml(payload.cover_url)}" alt="${escapeHtml(photos[0]?.alt_text || `Photograph of ${address}`)}" decoding="async" /></div>` : ""}
${shots ? `<section class="shots" aria-label="Photographs of this property">
  ${shots}
</section>` : ""}
${moreButton}
${moreShots}
${payload.video_url ? `<video class="tour" controls preload="metadata" playsinline src="${escapeHtml(payload.video_url)}"></video>` : ""}
</main>
<section class="cream">
<div class="wrap">
<div class="cols">
<div>
${payload.property_description ? `<section class="card">
  <h2>About this property</h2>
  <p>${escapeHtml(payload.property_description)}</p>
</section>` : ""}
<section class="card">
  <h2>Property details</h2>
  <ul class="facts2">
${facts}
  </ul>
</section>
${amenities}
${agentCard}
</div>
<div>
${inquiry}
<section class="card disc">
  <h2>Disclosures</h2>
  <ul>${(payload.disclosures || []).map((d: string) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
</section>
</div>
</div>
</div>
</section>
<footer class="foot"><div class="wrap">
<span class="eyebrow">Arriv Estate Media</span>
<p>Media and marketing page delivered by Arriv Estate Media. Property details and photographs on this page are published on behalf of the listing contact identified above.</p>
<p class="footlinks"><a href="${DIRECTORY_PATH}">Browse all properties</a> &middot; <a href="${MEDIA_SERVICES_URL}">Need media services?</a></p>
</div></footer>
</div>
${lightbox}
</body>
</html>`;
}