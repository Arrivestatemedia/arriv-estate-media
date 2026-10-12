// Arriv Property Visibility — edge serving layer.
//
// Serves the public property host (properties.arrivestatemedia.com) in front of the existing
// Base44 function endpoints. It adds NO new data and NO new authority: the origin functions
// remain the single source of truth for whether a listing may be seen, and this worker only
// caches what the origin has already proved is publicly serviceable.
//
// Routes (everything else 404s at the edge — there is no generic passthrough):
//   GET /<slug>                          → origin getPublicPropertyPage?slug=<slug>&format=html
//   GET /properties/<slug>               → same, for URL compatibility
//   GET /media/<listingId>/<fileId>      → origin streamPropertyMedia
//   GET /functions/streamPropertyMedia   → same (the shape the rendered HTML already emits)
//   GET /sitemap.xml                     → origin generatePropertySitemap
//   GET /robots.txt                      → generated here
//   POST /__purge                        → signed cache invalidation (works while disabled)
//   GET /__health                        → liveness
//
// Safety properties required by design:
//   * FAILS CLOSED — non-200 origin responses are never cached as content, unknown paths 404,
//     and a hard kill switch (PROPERTY_EDGE_DISABLED) refuses to read or write the cache.
//   * NO PRIVATE ASSETS — media is only ever fetched through streamPropertyMedia, which
//     re-checks publication state and the listing's own approved selection on every request.
//   * BOUNDED EXPOSURE — media is cached for MEDIA_TTL_SECONDS (default 300) rather than the
//     origin's 24h, so an unpublish or an authorization change is bounded even if a purge call
//     is lost; a successful purge removes the exact keys immediately.

const DEFAULT_ORIGIN = "https://arrivestatemedia.base44.app";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,118})[a-z0-9]$/;
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

// Origin fetch and cache are injectable so the worker can be exercised in tests without
// touching the network. Both hooks are server-side configuration only.
function depsOf(env) {
  const originFetch = typeof env?.__test_fetch === "function" ? env.__test_fetch : fetch;
  const cache = env?.__test_cache || (typeof globalThis.caches !== "undefined" && globalThis.caches?.default) || null;
  return { originFetch, cache };
}

function canonicalCacheKey(publicBase, pathname, params) {
  const search = params ? [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&") : "";
  return new Request(`${publicBase}${pathname}${search ? `?${search}` : ""}`, { method: "GET" });
}

async function cachedJson(cache, key, value, status = 200) {
  const response = Response.json(value, { status });
  if (cache && status === 200) await cache.put(key, response.clone());
  return response;
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

// The emergency stop. It never reads the cache, so nothing already stored can be served
// through the edge while it is on. Any copy already held by a browser or an intermediary is
// bounded by the response TTLs above (5 minutes by default).
function emergencyResponse() {
  return new Response("Property pages are temporarily unavailable.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Retry-After": "3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function robotsResponse(c) {
  return new Response(
    ["User-agent: *", "Allow: /", "Disallow: /__purge", "Disallow: /__health", "", `Sitemap: ${c.publicBase}/sitemap.xml`, ""].join("\n"),
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}

// The origin renders canonical and media URLs from its own configured app domain. Whatever
// that domain is, the copy we serve must be self-consistent on the public host, so the host
// is normalised on the way out.
function normaliseHosts(body, c) {
  if (!c.originHost || c.originHost === c.publicHost) return body;
  return body.split(`//${c.originHost}`).join(`//${c.publicHost}`);
}

async function servePage(request, env, c, slug) {
  const { originFetch, cache } = depsOf(env);
  const key = canonicalCacheKey(c.publicBase, `/${slug}`);
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }

  const originUrl = `${c.origin}/functions/getPublicPropertyPage?slug=${encodeURIComponent(slug)}&format=html`;
  const origin = await originFetch(new Request(originUrl, { method: "GET", headers: { Accept: "text/html" } }));
  if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Property page not found");

  const html = normaliseHosts(await origin.text(), c);
  const indexable = !/name="robots"\s+content="noindex/i.test(html);
  const response = new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${c.htmlTtl}`,
      "X-Robots-Tag": indexable ? "index, follow" : "noindex, follow",
    },
  });
  if (cache) await cache.put(key, response.clone());
  return response;
}

async function serveSitemap(request, env, c) {
  const { originFetch, cache } = depsOf(env);
  const key = canonicalCacheKey(c.publicBase, "/sitemap.xml");
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const origin = await originFetch(new Request(`${c.origin}/functions/generatePropertySitemap`, { method: "GET" }));
  if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Sitemap unavailable");
  const xml = normaliseHosts(await origin.text(), c);
  const response = new Response(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": `public, max-age=${c.sitemapTtl}` },
  });
  if (cache) await cache.put(key, response.clone());
  return response;
}

async function serveMedia(request, env, c, listingId, fileId) {
  const { originFetch, cache } = depsOf(env);
  const key = canonicalCacheKey(c.publicBase, "/functions/streamPropertyMedia", new URLSearchParams({ listing: listingId, file: fileId }));
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  const originUrl = `${c.origin}/functions/streamPropertyMedia?listing=${encodeURIComponent(listingId)}&file=${encodeURIComponent(fileId)}`;
  const origin = await originFetch(new Request(originUrl, { method: "GET" }));
  // Only an origin 200 is cacheable: a 404 is the origin refusing an unpublished listing or an
  // asset outside the approved selection, and must never be turned into content.
  if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Not found");

  const headers = new Headers(origin.headers);
  headers.set("Cache-Control", `public, max-age=${c.mediaTtl}`);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  const response = new Response(origin.body, { status: 200, headers });
  if (cache) await cache.put(key, response.clone());
  return response;
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
  if (!cache) return Response.json({ ok: true, purged: [], note: "No cache binding available" });

  const slugs = [String(payload.slug || ""), ...(Array.isArray(payload.slugs) ? payload.slugs.map(String) : [])].filter((s) => SLUG_PATTERN.test(s));
  const listingId = String(payload.listing_id || "");
  const fileIds = (Array.isArray(payload.file_ids) ? payload.file_ids.map(String) : []).slice(0, MAX_PURGE_FILE_IDS).filter(Boolean);

  const keys = [];
  for (const slug of slugs) {
    keys.push(canonicalCacheKey(c.publicBase, `/${slug}`));
    keys.push(canonicalCacheKey(c.publicBase, `/properties/${slug}`));
  }
  keys.push(canonicalCacheKey(c.publicBase, "/sitemap.xml"));
  for (const fileId of fileIds) {
    if (!listingId) break;
    keys.push(canonicalCacheKey(c.publicBase, "/functions/streamPropertyMedia", new URLSearchParams({ listing: listingId, file: fileId })));
    if (SLUG_PATTERN.test(fileId)) keys.push(canonicalCacheKey(c.publicBase, `/media/${listingId}/${fileId}`));
  }

  const purged = [];
  for (const key of keys) {
    const deleted = await cache.delete(key);
    if (deleted) purged.push(key.url);
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
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // The purge endpoint stays reachable while the feature is disabled, so an operator can clear
  // the cache and then keep the surface dark.
  if (path === "/__purge") return handlePurge(request, env, c);
  if (path === "/__health") return Response.json({ ok: true, disabled: c.disabled, host: c.publicHost });

  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  if (c.disabled) return emergencyResponse();

  if (path === "/robots.txt") return robotsResponse(c);
  if (path === "/sitemap.xml") return serveSitemap(request, env, c);
  if (path === "/functions/streamPropertyMedia") {
    const listingId = String(url.searchParams.get("listing") || "");
    const fileId = String(url.searchParams.get("file") || "");
    if (!listingId || !fileId) return notFoundResponse(c.notFoundTtl);
    return serveMedia(request, env, c, listingId, fileId);
  }
  if (path.startsWith("/media/")) {
    const [, , listingId, fileId] = path.split("/");
    if (!listingId || !fileId) return notFoundResponse(c.notFoundTtl);
    return serveMedia(request, env, c, decodeURIComponent(listingId), decodeURIComponent(fileId));
  }

  const slug = path.startsWith("/properties/") ? path.slice("/properties/".length) : path.replace(/^\//, "");
  if (slug && SLUG_PATTERN.test(slug)) return servePage(request, env, c, slug);

  return notFoundResponse(c.notFoundTtl);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      // Fail closed: an unexpected error is never a cached or indexable response.
      return new Response("Property pages are temporarily unavailable.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
      });
    }
  },
};

// Exported for the automated tests.
export const __test = { config, handle, normaliseHosts, validPurgeSignature, canonicalCacheKey, SLUG_PATTERN };