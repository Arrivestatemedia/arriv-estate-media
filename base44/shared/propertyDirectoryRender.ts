// The public property directory — the front page a visitor browses before opening a listing.
//
// Server-rendered for the same reason the property page is: a visitor arriving from a search
// result gets a finished, readable page on a phone without executing JavaScript, and a crawler
// reads every listing the directory offers. It is built in the same visual language as the
// property pages — dark cinematic frame, gold ambient glow and gold lockup, serif display type —
// with an off-white surface carrying the listings themselves.
//
// Search narrows the listings already rendered into this document. It is not a second data read:
// the edge caches this page by path, so a query string could not vary it, and nothing a visitor
// types can reveal a listing that was not published.

import { escapeHtml, statusLabel } from "./propertyPageRender.ts";
import {
  DIRECTORY_PATH,
  MEDIA_SERVICES_URL,
  directoryUrl,
  mediaStreamUrl,
} from "./propertyVisibility.ts";

export function buildDirectoryPayload(items: any[]) {
  const listings = (items || []).map((l: any) => ({
    listing_id: l.listing_id,
    slug: l.public_slug,
    url: `${DIRECTORY_PATH}/${l.public_slug}`,
    property_address: l.property_address || "",
    location: [l.city, l.state, l.zip].filter(Boolean).join(", "),
    listing_price: l.listing_price ?? null,
    bedrooms: l.bedrooms ?? null,
    bathrooms: l.bathrooms ?? null,
    square_footage: l.square_footage ?? null,
    property_type: l.property_type || "",
    status_label: statusLabel(l.listing_status),
    cover_url: l.cover_file_id ? mediaStreamUrl(l.listing_id, l.cover_file_id) : "",
    brokerage: l.brokerage_name || "",
    search_text: [l.property_address, l.city, l.state, l.zip, l.property_type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }));

  return { ok: true, count: listings.length, listings };
}

export function renderPropertyDirectoryHtml(payload: any) {
  const listings = payload.listings || [];

  const cards = listings.map((l: any) => {
    const facts = [
      l.bedrooms != null ? `${l.bedrooms} bed` : null,
      l.bathrooms != null ? `${l.bathrooms} bath` : null,
      l.square_footage != null ? `${Number(l.square_footage).toLocaleString("en-US")} sq ft` : null,
      l.property_type ? String(l.property_type).replace(/_/g, " ") : null,
    ].filter(Boolean) as string[];

    return `<a class="listing" href="${escapeHtml(l.url)}" data-search="${escapeHtml(l.search_text)}">
  ${l.cover_url
      ? `<span class="shot"><img src="${escapeHtml(l.cover_url)}" alt="Photograph of ${escapeHtml(l.property_address)}" loading="lazy" decoding="async" /></span>`
      : `<span class="shot shot-empty" aria-hidden="true"></span>`}
  <span class="body">
    <span class="statuschip">${escapeHtml(l.status_label)}</span>
    <strong class="addr">${escapeHtml(l.property_address)}</strong>
    <span class="loc">${escapeHtml(l.location)}</span>
    ${l.listing_price != null ? `<span class="price">$${Number(l.listing_price).toLocaleString("en-US")}</span>` : ""}
    ${facts.length ? `<ul class="pills">${facts.map((f: string) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
    <span class="cta">View property &rarr;</span>
  </span>
</a>`;
  }).join("\n");

  const results = listings.length
    ? `<div class="grid">
${cards}
</div>
<p class="empty" id="dir-empty" hidden><strong>No properties match your search</strong>Try a different city, state or ZIP.</p>`
    : `<p class="empty"><strong>No properties are published yet</strong>Approved listings appear here as soon as their owner publishes them.</p>`;

  const search = listings.length
    ? `<div class="searchbox">
  <input id="dir-q" type="search" placeholder="Search by city, state or ZIP" aria-label="Search properties by city, state or ZIP" autocomplete="off" />
  <p class="count" id="dir-count">${listings.length} ${listings.length === 1 ? "property" : "properties"}</p>
</div>
<script>
(function () {
  var input = document.getElementById("dir-q");
  if (!input) return;
  var cards = [].slice.call(document.querySelectorAll(".listing"));
  var count = document.getElementById("dir-count");
  var empty = document.getElementById("dir-empty");
  function label(n) { return n + (n === 1 ? " property" : " properties"); }
  function apply() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (card) {
      var match = !q || String(card.getAttribute("data-search") || "").indexOf(q) !== -1;
      card.hidden = !match;
      if (match) shown += 1;
    });
    count.textContent = label(shown);
    empty.hidden = shown !== 0;
  }
  input.addEventListener("input", apply);
})();
</script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Properties | Arriv Estate Media</title>
<meta name="description" content="Browse properties photographed and delivered by Arriv Estate Media. Every listing here was approved and published by its authorized owner." />
<link rel="canonical" href="${escapeHtml(directoryUrl())}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="Properties | Arriv Estate Media" />
<meta property="og:description" content="Browse properties photographed and delivered by Arriv Estate Media." />
<meta property="og:url" content="${escapeHtml(directoryUrl())}" />
<meta property="og:site_name" content="Arriv Estate Media" />
<style>
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #0a0b0f; color: rgba(255, 251, 245, 0.72); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; -webkit-font-smoothing: antialiased; }
img { max-width: 100%; }
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
h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; color: #fffbf5; font-size: clamp(2rem, 6.4vw, 3.1rem); line-height: 1.1; letter-spacing: -0.015em; margin: 26px 0 12px; }
.lede { font-size: 14.5px; color: rgba(255, 251, 245, 0.5); margin: 0 0 22px; max-width: 640px; }
.searchbox { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 24px; }
.searchbox input { flex: 1 1 240px; font: inherit; font-size: 15px; padding: 13px 16px; border-radius: 999px; border: 1px solid rgba(255, 251, 245, 0.14); background: rgba(255, 251, 245, 0.05); color: #fffbf5; }
.searchbox input:focus { outline: 2px solid rgba(184, 149, 106, 0.5); outline-offset: 1px; border-color: #b8956a; }
.count { margin: 0; font-size: 12.5px; color: rgba(255, 251, 245, 0.45); }
.cream { background: #fffbf5; color: #1a1a1a; border-radius: 28px 28px 0 0; margin-top: 26px; padding: 30px 0 44px; }
.grid { display: grid; gap: 18px; grid-template-columns: 1fr; }
.listing { display: block; text-decoration: none; background: #ffffff; border: 1px solid rgba(184, 149, 106, 0.25); border-radius: 18px; overflow: hidden; box-shadow: 0 18px 44px rgba(26, 26, 26, 0.06); transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease; }
.listing[hidden] { display: none; }
.listing:hover { transform: translateY(-3px); border-color: rgba(184, 149, 106, 0.6); box-shadow: 0 26px 60px rgba(184, 149, 106, 0.22); }
.listing .shot { display: block; background: #0a0b0f; }
.listing .shot img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.listing .shot-empty { aspect-ratio: 16 / 10; background: linear-gradient(135deg, #1a1a1a, #0a0b0f); }
.listing .body { display: block; padding: 18px 20px 20px; }
.statuschip { display: inline-block; padding: 5px 11px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: rgba(184, 149, 106, 0.16); border: 1px solid rgba(184, 149, 106, 0.35); color: #8a6d4a; margin: 0 0 10px; }
.addr { display: block; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 1.15rem; color: #1a1a1a; line-height: 1.25; }
.loc { display: block; font-size: 13px; color: rgba(26, 26, 26, 0.5); margin: 4px 0 0; }
.price { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 1.3rem; color: #1a1a1a; margin: 12px 0 0; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
.pills li { padding: 5px 11px; border-radius: 999px; background: #fffbf5; border: 1px solid rgba(184, 149, 106, 0.22); font-size: 12px; color: rgba(26, 26, 26, 0.7); }
.cta { display: block; margin: 14px 0 0; font-size: 12.5px; font-weight: 600; color: #8a6d4a; }
.empty { border-radius: 18px; border: 1px solid rgba(184, 149, 106, 0.25); background: #ffffff; padding: 34px 22px; text-align: center; color: rgba(26, 26, 26, 0.6); margin: 0; }
.empty[hidden] { display: none; }
.empty strong { display: block; font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: 1.1rem; color: #1a1a1a; margin-bottom: 6px; }
.foot { padding: 30px 0 46px; }
.foot p { margin: 10px 0 0; font-size: 11.5px; color: rgba(255, 251, 245, 0.35); }
.foot a { color: #b8956a; text-decoration: none; }
.foot a:hover { text-decoration: underline; }
@media (min-width: 640px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 960px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cream { padding: 40px 0 56px; } }
</style>
</head>
<body>
<div class="glow" aria-hidden="true"><i class="a"></i><i class="b"></i></div>
<div class="gridlines" aria-hidden="true"></div>
<div class="frame">
<header class="topbar"><div class="wrap bar">
  <a class="lock" href="${DIRECTORY_PATH}">
    <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="#0a0b0f"><path d="M12 3 3 10.2V21h6.2v-6.1h5.6V21H21V10.2z"/></svg></span>
    <span><span class="eyebrow">Arriv Estate Media</span><span class="sub">Property Portfolio</span></span>
  </a>
  <nav class="nav">
    <a class="gold" href="${MEDIA_SERVICES_URL}">Need media services?</a>
  </nav>
</div></header>
<main class="wrap">
<h1>Properties</h1>
<p class="lede">Photographed and delivered by Arriv Estate Media. Every listing here was approved and published by its authorized owner, and is reconfirmed periodically by their listing contact.</p>
${search}
</main>
<section class="cream">
<div class="wrap">
${results}
</div>
</section>
<footer class="foot"><div class="wrap">
<span class="eyebrow">Arriv Estate Media</span>
<p>Need photography or video for your own listing? <a href="${MEDIA_SERVICES_URL}">Visit arrivestatemedia.com</a>.</p>
</div></footer>
</div>
</body>
</html>`;
}