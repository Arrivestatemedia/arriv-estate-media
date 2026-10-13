// Arriv Property Visibility — edge serving layer.
//
// Serves the public property host (properties.arrivestatemedia.com) in front of the existing
// Base44 function endpoints. It adds NO new data, NO new storage and NO new authority: the
// origin functions remain the single source of truth for whether a listing may be seen, and this
// worker only caches what the origin has already proved is publicly serviceable.
//
// Routes (everything else 404s at the edge — there is no generic passthrough):
//   GET /<slug>                          → origin getPublicPropertyPage?slug=<slug>&format=html
//   GET /properties/<slug>               → same, for URL compatibility
//   GET /properties?<search filters>     → same directory page with the visitor's search applied
//                                          (never cached: one document per query string)
//   GET /media/<listingId>/<fileId>      → origin streamPropertyMedia
//   GET /functions/streamPropertyMedia   → same (the shape the rendered HTML already emits)
//   GET /sitemap.xml                     → origin generatePropertySitemap
//   GET /robots.txt                      → generated here
//   POST /__purge                        → signed cache invalidation (reachable while disabled)
//   GET /__health                        → liveness and configuration state, no secrets
//
// Safety properties required by design:
//   * FAILS CLOSED — a non-200 origin response is never cached as content, an origin outage is
//     reported as 503 (never as a 404, which would tell search engines a live page is gone),
//     unknown paths 404 at the edge, and a hard kill switch (PROPERTY_EDGE_DISABLED) refuses to
//     read or write the cache at all.
//   * NO PRIVATE ASSETS — media is only ever fetched through streamPropertyMedia, which re-checks
//     publication state and the listing's own approved selection on every request. The worker
//     cannot enumerate files, cannot reach Drive, and holds no credentials of any kind.
//   * NO AUTHENTICATED OR PRIVATE RESPONSES ARE CACHED — a request carrying a cookie or an
//     Authorization header bypasses the cache entirely, and client credentials are never
//     forwarded to the origin.
//   * BOUNDED EXPOSURE — media and HTML are cached for 300 seconds (not the origin's 24h), so an
//     unpublish or an authorization change is bounded even if a purge call is lost; a successful
//     signed purge removes the exact keys immediately, and can prove it did (verify: true). Only
//     the canonical, unfiltered directory page is cached at all — a search is fetched fresh.
//   * PORTABLE — the only origin dependency is two function URLs, configurable via ORIGIN_BASE,
//     so the layer can be pointed at a non-Base44 origin without touching this file.
//
// Deliberately NOT used: KV, D1, R2, Durable Objects, or any paid feature. Caching uses the
// standard Cache API only, which exists on every edge runtime this file targets.

const DEFAULT_ORIGIN = "https://arrivestatemedia.base44.app";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,118})[a-z0-9]$/;
// Drive file ids are mixed case and may contain dots, dashes and underscores, so the media route
// uses its own permissive pattern rather than the slug pattern.
const FILE_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
// The canonical public directory address, matching the app's DIRECTORY_PATH. Held as a literal
// because this worker is deliberately self-contained: it imports no app code, so it can be
// deployed and reasoned about on its own.
const DIRECTORY_PATH = "/properties";
// The directory's reserved slug, and the only query names the edge forwards. A visitor's search is
// answered by the origin, which owns eligibility: the edge adds no query language of its own and
// drops every parameter it does not recognise.
const DIRECTORY_SLUG = "properties";
const DIRECTORY_FILTER_KEYS = ["q", "min_price", "max_price", "min_bedrooms", "min_bathrooms", "property_type", "status"];
const DIRECTORY_FILTER_MAX_LENGTH = 120;
const PURGE_MAX_SKEW_SECONDS = 300;
const MAX_PURGE_FILE_IDS = 200;

function config(env) {
  const origin = String(env?.ORIGIN_BASE || DEFAULT_ORIGIN).replace(/\/+$/, "");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = "";
  }
  const publicHost = String(env?.PUBLIC_HOST || originHost).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    origin,
    originHost,
    publicHost,
    publicBase: `https://${publicHost}`,
    htmlTtl: num(env?.HTML_TTL_SECONDS, 300),
    mediaTtl: num(env?.MEDIA_TTL_SECONDS, 300),
    sitemapTtl: num(env?.SITEMAP_TTL_SECONDS, 900),
    notFoundTtl: num(env?.NOT_FOUND_TTL_SECONDS, 60),
    disabled: String(env?.PROPERTY_EDGE_DISABLED || "false").trim().toLowerCase() === "true",
    purgeSecret: String(env?.PURGE_SECRET || ""),
  };
}

// Origin fetch and cache are injectable so the worker can be exercised in tests without touching
// the network. Both hooks are server-side configuration only.
function depsOf(env) {
  const originFetch = typeof env?.__test_fetch === "function" ? env.__test_fetch : fetch;
  const cache = env?.__test_cache || (typeof globalThis.caches !== "undefined" && globalThis.caches?.default) || null;
  return { originFetch, cache };
}

function canonicalCacheKey(publicBase, pathname, params) {
  const search = params ? [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  return new Request(`${publicBase}${pathname}${search ? `?${search}` : ""}`, { method: "GET" });
}

// One cache entry per page, whichever of the two page paths the visitor used, so a purge always
// has exactly one key to drop and two routes never cause two origin calls for the same page.
function pageCacheKey(c, slug) {
  return canonicalCacheKey(c.publicBase, `/properties/${slug}`);
}

function mediaCacheKey(c, listingId, fileId) {
  return canonicalCacheKey(c.publicBase, "/functions/streamPropertyMedia", new URLSearchParams({ listing: listingId, file: fileId }));
}

// Concurrent identical public requests share a single origin call. The map lives in the isolate
// and holds only in-flight promises.
const inflight = new Map();

async function singleFlight(key, factory) {
  const pending = inflight.get(key);
  if (pending) return (await pending).clone();
  const promise = factory();
  inflight.set(key, promise);
  try {
    return (await promise).clone();
  } finally {
    inflight.delete(key);
  }
}

function carriesCredentials(request) {
  return !!request.headers.get("authorization") || !!request.headers.get("cookie");
}

function contentTypeOf(response) {
  return String(response.headers.get("content-type") || "").toLowerCase();
}

// Every response leaving the edge is rebuilt through here so a HEAD request never carries a body
// and every public response can be tagged for observability (HIT / MISS / BYPASS / NO-STORE).
function finalize(request, response, tag) {
  const headers = new Headers(response.headers);
  if (tag) headers.set("X-Arriv-Edge", tag);
  if (String(request.method).toUpperCase() === "HEAD") return new Response(null, { status: response.status, headers });
  return new Response(response.body, { status: response.status, headers });
}

function notFoundResponse(ttl, reason = "Not found") {
  return new Response(reason, {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": `public, max-age=${ttl}`,
      "X-Robots-Tag": "noindex, follow",
    },
  });
}

// An origin outage is NOT a 404. A 404 would tell search engines that a live listing has gone
// away, so an origin failure is reported as temporarily unavailable and is never cached.
function originUnavailable() {
  return new Response("Property pages are temporarily unavailable.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// A 200 whose body is not the content type we expect (e.g. a JSON error envelope) is passed
// through untouched and never stored as a page or as media.
function uncacheableResponse(body, contentType) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType || "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

// The emergency stop. It never reads the cache, so nothing already stored can be served through
// the edge while it is on. Any copy already held by a browser or an intermediary is bounded by
// the response TTLs below (5 minutes by default).
function emergencyResponse() {
  return new Response("Property pages are temporarily unavailable.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Retry-After": "3600",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Arriv-Edge": "KILL-SWITCH",
    },
  });
}

// The domain root is a doorway, not a second page: it sends the visitor to the one canonical
// directory address. Answered entirely at the edge, with no origin call, so the front door of the
// property site keeps working even while the origin is briefly unavailable.
function directoryRedirect(c) {
  return new Response(null, {
    status: 301,
    headers: {
      Location: `${c.publicBase}${DIRECTORY_PATH}`,
      "Cache-Control": `public, max-age=${c.htmlTtl}`,
    },
  });
}

// A visitor's search, reduced to the filters the origin understands. Anything else in the query
// string is dropped rather than passed on, and each value is bounded.
function directoryFilters(url) {
  const filters = new URLSearchParams();
  for (const key of DIRECTORY_FILTER_KEYS) {
    const value = String(url.searchParams.get(key) ?? "").trim().slice(0, DIRECTORY_FILTER_MAX_LENGTH);
    if (value) filters.set(key, value);
  }
  return filters;
}

function robotsResponse(c) {
  return new Response(
    [
      "User-agent: *",
      "Allow: /",
      // The compatibility media path would duplicate every image for a crawler; the /media/ alias
      // is the crawlable one. The operator endpoints are never crawlable.
      "Disallow: /functions/",
      "Disallow: /__purge",
      "Disallow: /__health",
      "",
      `Sitemap: ${c.publicBase}/sitemap.xml`,
      "",
    ].join("\n"),
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}

// The origin renders canonical and media URLs from its own configured origin. Whatever that is,
// the copy we serve must be self-consistent on the public host, so the host is normalised on the
// way out. With PROPERTY_PUBLIC_ORIGIN set on the app this is a no-op safety net.
function normaliseHosts(body, c) {
  if (!c.originHost || c.originHost === c.publicHost) return body;
  return body.split(`//${c.originHost}`).join(`//${c.publicHost}`);
}

async function servePage(request, env, c, slug, filters) {
  const { originFetch, cache } = depsOf(env);
  const credentials = carriesCredentials(request);
  const filtered = !!(filters && filters.toString());
  // A filtered view is a different document for every query string, so it is neither read from nor
  // written to the shared cache: only the one canonical, unfiltered page is cached, and it keeps
  // exactly the one key a purge has to drop.
  const cacheable = !credentials && !filtered;
  const key = pageCacheKey(c, slug);

  // A request that carries credentials is never served from, or written to, the shared cache.
  if (cacheable && cache) {
    const hit = await cache.match(key);
    if (hit) return finalize(request, hit, "HIT");
  }

  const built = await singleFlight(filtered ? `${key.url}?${filters}` : key.url, async () => {
    const params = new URLSearchParams({ slug, format: "html" });
    if (filtered) for (const [name, value] of filters) params.set(name, value);
    const originUrl = `${c.origin}/functions/getPublicPropertyPage?${params.toString()}`;
    const origin = await originFetch(new Request(originUrl, { method: "GET", headers: { Accept: "text/html" } }));
    if (origin.status >= 500) return originUnavailable();
    if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Property page not found");
    const contentType = contentTypeOf(origin);
    if (!contentType.includes("text/html")) return uncacheableResponse(await origin.text(), contentType);

    const html = normaliseHosts(await origin.text(), c);
    const indexable = !/name="robots"\s+content="noindex/i.test(html);
    const response = new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": cacheable ? `public, max-age=${c.htmlTtl}` : "private, no-store",
        "X-Robots-Tag": indexable ? "index, follow" : "noindex, follow",
      },
    });
    if (cache && cacheable) await cache.put(key, response.clone());
    return response;
  });

  return finalize(request, built, credentials ? "BYPASS" : filtered ? "SEARCH" : "MISS");
}

async function serveSitemap(request, env, c) {
  const { originFetch, cache } = depsOf(env);
  const credentials = carriesCredentials(request);
  const key = canonicalCacheKey(c.publicBase, "/sitemap.xml");

  if (!credentials && cache) {
    const hit = await cache.match(key);
    if (hit) return finalize(request, hit, "HIT");
  }

  const built = await singleFlight(key.url, async () => {
    const origin = await originFetch(new Request(`${c.origin}/functions/generatePropertySitemap`, { method: "GET" }));
    if (origin.status >= 500) return originUnavailable();
    if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Sitemap unavailable");
    const contentType = contentTypeOf(origin);
    if (!contentType.includes("xml")) return uncacheableResponse(await origin.text(), contentType);

    const response = new Response(normaliseHosts(await origin.text(), c), {
      status: 200,
      headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": `public, max-age=${c.sitemapTtl}` },
    });
    if (cache && !credentials) await cache.put(key, response.clone());
    return response;
  });

  return finalize(request, built, credentials ? "BYPASS" : "MISS");
}

async function serveMedia(request, env, c, listingId, fileId) {
  const { originFetch, cache } = depsOf(env);
  const credentials = carriesCredentials(request);
  const key = mediaCacheKey(c, listingId, fileId);

  if (!credentials && cache) {
    const hit = await cache.match(key);
    if (hit) return finalize(request, hit, "HIT");
  }

  const built = await singleFlight(key.url, async () => {
    const originUrl = `${c.origin}/functions/streamPropertyMedia?listing=${encodeURIComponent(listingId)}&file=${encodeURIComponent(fileId)}`;
    const origin = await originFetch(new Request(originUrl, { method: "GET" }));
    // A non-200 here is the origin refusing: an unpublished listing, an asset outside the
    // approved selection, or a file belonging to another customer. It must never become content
    // and must never be cached.
    if (origin.status >= 500) return originUnavailable();
    if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Not found");

    const contentType = contentTypeOf(origin);
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      return uncacheableResponse(await origin.text(), contentType);
    }

    const headers = new Headers(origin.headers);
    // The media TTL is capped here rather than trusting the origin's 24h.
    headers.set("Cache-Control", credentials ? "private, no-store" : `public, max-age=${c.mediaTtl}`);
    headers.set("X-Robots-Tag", "noindex, nofollow");
    const response = new Response(origin.body, { status: 200, headers });
    if (cache && !credentials) await cache.put(key, response.clone());
    return response;
  });

  return finalize(request, built, credentials ? "BYPASS" : "MISS");
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validPurgeSignature(secret, timestamp, body, provided) {
  if (!secret || !timestamp || !provided) return { ok: false, reason: "Missing signature" };
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > PURGE_MAX_SKEW_SECONDS) return { ok: false, reason: "Stale or invalid timestamp" };
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)));
  if (mac.length !== String(provided).length) return { ok: false, reason: "Bad signature" };
  let diff = 0;
  for (let i = 0; i < mac.length; i += 1) diff |= mac.charCodeAt(i) ^ String(provided).charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, reason: "Bad signature" };
}

// Keys a listing's purge must drop: both page paths (older entries may exist under the bare slug),
// the sitemap, and every media URL shape the rendered HTML can emit.
function purgeKeysFor(c, payload) {
  const slugs = [String(payload.slug || ""), ...(Array.isArray(payload.slugs) ? payload.slugs.map(String) : [])].filter((s) => SLUG_PATTERN.test(s));
  const listingId = String(payload.listing_id || "");
  const fileIds = (Array.isArray(payload.file_ids) ? payload.file_ids.map(String) : []).slice(0, MAX_PURGE_FILE_IDS).filter((f) => FILE_ID_PATTERN.test(f));

  const keys = [];
  for (const slug of slugs) {
    keys.push(pageCacheKey(c, slug));
    keys.push(canonicalCacheKey(c.publicBase, `/${slug}`));
  }
  keys.push(canonicalCacheKey(c.publicBase, "/sitemap.xml"));
  for (const fileId of fileIds) {
    if (!listingId || !FILE_ID_PATTERN.test(listingId)) break;
    keys.push(mediaCacheKey(c, listingId, fileId));
    keys.push(canonicalCacheKey(c.publicBase, `/media/${listingId}/${fileId}`));
  }
  return keys;
}

async function handlePurge(request, env, c) {
  const raw = await request.text();
  const signature = request.headers.get("x-arriv-signature") || "";
  const timestamp = request.headers.get("x-arriv-timestamp") || "";
  const check = await validPurgeSignature(c.purgeSecret, timestamp, raw, signature);
  if (!check.ok) return Response.json({ ok: false, error: check.reason }, { status: 401 });

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { cache } = depsOf(env);
  const keys = purgeKeysFor(c, payload);
  if (!cache) return Response.json({ ok: true, requested: keys.length, purged: [], verified: false, note: "No cache binding available" });

  const purged = [];
  for (const key of keys) {
    const deleted = await cache.delete(key);
    if (deleted) purged.push(key.url);
  }

  // verify: true is what the production activation checklist gates on. It re-reads every key and
  // reports success only when none of them is still present.
  if (payload.verify === true) {
    const remaining = [];
    for (const key of keys) {
      if (await cache.match(key)) remaining.push(key.url);
    }
    const verified = remaining.length === 0;
    return Response.json({ ok: verified, requested: keys.length, purged, verified, remaining });
  }

  return Response.json({ ok: true, requested: keys.length, purged });
}

async function handle(request, env) {
  const c = config(env);
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  // The purge endpoint stays reachable while the feature is disabled, so an operator can clear
  // the cache and then keep the surface dark.
  if (path === "/__purge") return handlePurge(request, env, c);
  if (path === "/__health") {
    return Response.json({
      ok: true,
      disabled: c.disabled,
      host: c.publicHost,
      origin_host: c.originHost,
      purge_secret_configured: !!c.purgeSecret,
      ttl_seconds: { html: c.htmlTtl, media: c.mediaTtl, sitemap: c.sitemapTtl, not_found: c.notFoundTtl },
    });
  }

  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  if (c.disabled) return emergencyResponse();

  if (path === "/robots.txt") return finalize(request, robotsResponse(c), "EDGE");
  if (path === "/sitemap.xml") return serveSitemap(request, env, c);
  if (path === "/functions/streamPropertyMedia") {
    const listingId = String(url.searchParams.get("listing") || "");
    const fileId = String(url.searchParams.get("file") || "");
    if (!FILE_ID_PATTERN.test(listingId) || !FILE_ID_PATTERN.test(fileId)) return notFoundResponse(c.notFoundTtl);
    return serveMedia(request, env, c, listingId, fileId);
  }
  if (path.startsWith("/media/")) {
    const [, , listingId, fileId] = path.split("/");
    const decodedListing = decodeURIComponent(listingId || "");
    const decodedFile = decodeURIComponent(fileId || "");
    if (!FILE_ID_PATTERN.test(decodedListing) || !FILE_ID_PATTERN.test(decodedFile)) return notFoundResponse(c.notFoundTtl);
    return serveMedia(request, env, c, decodedListing, decodedFile);
  }

  // The bare domain is where a visitor arrives when they type the property address, so it must
  // not answer 404. The directory has exactly one canonical address — /properties, the path every
  // page, the footer and the sitemap link to — so the root permanently redirects there rather
  // than serving a second, duplicate copy of it.
  if (path === "/") return finalize(request, directoryRedirect(c), "EDGE");

  const slug = path.startsWith("/properties/") ? path.slice("/properties/".length) : path.replace(/^\//, "");
  // Only the directory page accepts a search, and its filters ride along to the origin, which
  // decides what may be seen. A listing page ignores them.
  if (slug && SLUG_PATTERN.test(slug)) {
    return servePage(request, env, c, slug, slug === DIRECTORY_SLUG ? directoryFilters(url) : null);
  }

  return notFoundResponse(c.notFoundTtl);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (_error) {
      // Fail closed: an unexpected error is never a cached or indexable response.
      return new Response("Property pages are temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }
  },
};

// Exported for the automated tests.
export const __test = {
  config,
  handle,
  directoryFilters,
  normaliseHosts,
  validPurgeSignature,
  canonicalCacheKey,
  pageCacheKey,
  purgeKeysFor,
  SLUG_PATTERN,
  FILE_ID_PATTERN,
};