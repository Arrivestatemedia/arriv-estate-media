# Phase 4 — Cloudflare Worker routes (prepared, NOT deployed)

Target Worker: `edge/property-edge/worker.mjs` (properties.arrivestatemedia.com)

Status: **not deployed.** Nothing in this file has been applied to the live Worker. Deploying is your
decision and must be followed by the verification in section 4.

The existing Worker already proxies `/properties/:slug` to
`functions/getPublicPropertyPage?slug=…&format=html` and caches the public URL. Phase 4 adds three public
page families that need the same treatment. The origin renderer for them already exists and is deployed as
an app function: `getPublicVisibilityPage` (`kind`, `slug`, `profileType`, `format=html`).

---

## 1. Add a renderer that mirrors `servePage`

Paste this next to the existing `servePage`:

```js
// Phase 4 public pages: agent/brokerage profiles and geographic discovery. It mirrors servePage: the
// cache key is the public path, credentials bypass the cache, and only a 200 HTML response is cached.
async function serveVisibilityPage(request, env, c, route) {
  const { originFetch, cache } = depsOf(env);
  const credentials = carriesCredentials(request);
  const url = new URL(request.url);
  const key = canonicalCacheKey(c.publicBase, url.pathname.replace(/\/+$/, "") || "/");

  if (!credentials && cache) {
    const hit = await cache.match(key);
    if (hit) return finalize(request, hit, "HIT");
  }

  const params = new URLSearchParams({ kind: route.kind, format: "html" });
  if (route.slug) params.set("slug", route.slug);
  if (route.profileType) params.set("profileType", route.profileType);

  const built = await singleFlight(key.url, async () => {
    const origin = await originFetch(
      new Request(`${c.origin}/functions/getPublicVisibilityPage?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "text/html" },
      }),
    );
    if (origin.status >= 500) return originUnavailable();
    if (origin.status !== 200) return notFoundResponse(c.notFoundTtl, "Page not found");
    const contentType = contentTypeOf(origin);
    if (!contentType.includes("text/html")) return uncacheableResponse(await origin.text(), contentType);

    const html = normaliseHosts(await origin.text(), c);
    // The renderer already emits noindex for anything that is not publishable; this header repeats it
    // so a crawler that ignores meta tags still sees the truth.
    const indexable = !/name="robots"\s+content="noindex/i.test(html);
    const response = new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": credentials ? "private, no-store" : `public, max-age=${c.htmlTtl}`,
        "X-Robots-Tag": indexable ? "index, follow" : "noindex, follow",
      },
    });
    if (cache && !credentials) await cache.put(key, response.clone());
    return response;
  });

  return finalize(request, built, credentials ? "BYPASS" : "MISS");
}
```

## 2. Route the new paths

Insert in `handle()` **before** the existing generic slug branch:

```js
  // ---- Phase 4 public routes -------------------------------------------------------------
  const VISIBILITY_ROUTES = [
    { pattern: /^\/agents$/, kind: "agent_directory" },
    { pattern: /^\/brokerages$/, kind: "brokerage_directory" },
    { pattern: /^\/agents\/([a-z0-9](?:[a-z0-9-]{1,118})[a-z0-9])$/, kind: "profile", profileType: "agent" },
    { pattern: /^\/brokerages\/([a-z0-9](?:[a-z0-9-]{1,118})[a-z0-9])$/, kind: "profile", profileType: "brokerage" },
    { pattern: /^\/properties\/in\/([a-z0-9](?:[a-z0-9-]{1,118})[a-z0-9])$/, kind: "market" },
  ];
  for (const route of VISIBILITY_ROUTES) {
    const match = path.match(route.pattern);
    if (!match) continue;
    return serveVisibilityPage(request, env, c, {
      kind: route.kind,
      slug: match[1] || "",
      profileType: route.profileType || "",
    });
  }
```

`/properties/in/:city-state` is matched before the generic property branch and cannot collide, because
the generic branch only accepts a single segment.

## 3. Let a purge drop the new keys

The app now sends `paths: ["/agents/jane-doe", "/sitemap.xml"]`. The current purge handler ignores
`paths`. Add it to `handlePurge` beside the existing `slugs` handling:

```js
  const paths = (Array.isArray(payload.paths) ? payload.paths : [])
    .map((p) => String(p))
    .filter((p) => p.startsWith("/") && !p.includes(".."))
    .slice(0, 50);
  for (const path of paths) keys.push(canonicalCacheKey(c.publicBase, path));
```

Without this, publishing or unpublishing a profile or a market is still correct at the origin but the
public page can stay stale for up to `htmlTtl`.

## 4. Post-deploy verification (manual, required)

Run each of these in order and record the results:

1. `GET https://properties.arrivestatemedia.com/agents` → 200, HTML, `<link rel="canonical" href="…/agents">`.
2. Publish one real profile, then `GET /agents/<slug>` → 200 with that profile's name in the `<h1>`.
   Confirm owner email and team addresses do **not** appear in the HTML.
3. Unpublish it, purge, `GET /agents/<slug>` → 404 and `X-Robots-Tag: noindex`.
4. `GET /properties/in/<a market with ≥3 published listings>` → 200, listings rendered, canonical correct.
5. `GET /properties/in/<a market below the threshold>` → 404, noindex.
6. `GET /sitemap.xml` → contains `/properties/<slug>`, the published profile paths, and only eligible
   market paths. No draft, unpublished or thin page appears.
7. Revert test: sell/withdraw a property in an eligible market, run the hourly sweep, confirm the market
   drops out of the sitemap when it falls below its threshold.

Do not mark the Launch Readiness "Cloudflare Worker" item verified until steps 1–7 pass on production.

## 5. Rollback

Revert to the previously deployed Worker version. Because the app function `getPublicVisibilityPage` is
independent, reverting the Worker only removes the public routes; nothing else breaks.