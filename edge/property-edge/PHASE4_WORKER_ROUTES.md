# Phase 4 — Cloudflare Worker routes (integrated, NOT deployed)

Target Worker: `edge/property-edge/worker.mjs` (properties.arrivestatemedia.com)

## 0. Status — verified 2026-11-10

- **Integrated into `worker.mjs`.** The Phase 4 routes are now real code in the Worker file, not a
  paste-in plan. Local regression suite: **60/60 passing** (`node --test`, hermetic: no network, no
  Cloudflare account, no Base44 call).
- **Worker identity (verified 2026-11-10).** The Worker serving production is named
  **`arriv-property-staging`** — a legacy name; it is the Worker the custom domain
  `properties.arrivestatemedia.com` is attached to, and it holds the live `PURGE_SECRET`. Its
  workers.dev alias (`arriv-property-staging.<account-subdomain>.workers.dev`) answers with an
  identical `/__health`, so both hostnames are one deployment, one cache. Staging is a separate,
  not-yet-created Worker: **`arriv-property-edge-staging`** (workers.dev only, no route, no domain).
  `wrangler.toml` names both; a deploy with any other name would create a Worker that serves nothing
  while the property host keeps answering from the old one.
- **Not deployed:** the new Phase 4 code is in `worker.mjs` but not on the edge. Probed live on
  2026-11-10 on both production hostnames:
  - `/agents` → 404 `Property page not found` (the pre-Phase-4 build proxies any single segment as a
    listing slug)
  - `/brokerages`, `/agents/<slug>`, `/properties/in/<city-state>` → 404 at the edge
- Everything already live is unchanged by this work: property pages, `/properties` search, media
  streaming (both URL shapes), `/sitemap.xml`, `/robots.txt`, root 301, signed purge, `/__health`.

### What was added to `worker.mjs`

| Piece | Behaviour |
| --- | --- |
| `visibilityRoute(path)` | the only place these paths are recognised; a non-slug-shaped address is refused at the edge without an origin call |
| `serveVisibilityPage()` | mirrors `servePage`: cache key is the public path, credentials bypass the cache, only a 200 HTML response is stored, an origin refusal is a 404 that is never cached |
| `visibilityIndexable()` | repeats the origin's robots decision into `X-Robots-Tag` (an origin noindex header always wins), and adds one rule: a directory with no profile card in it is served but never indexed |
| `purgeKeysFor()` | now accepts `paths` (e.g. `/agents/jane-doe`, `/properties/in/atlanta-ga`); rejects unrooted, traversal and query-bearing paths; de-duplicates keys so `verify: true` stays exact |

## 1. Routes

| Public path | Origin call (`getPublicVisibilityPage`) |
| --- | --- |
| `/agents` | `?kind=agent_directory&format=html` |
| `/brokerages` | `?kind=brokerage_directory&format=html` |
| `/agents/<slug>` | `?kind=profile&profileType=agent&slug=<slug>&format=html` |
| `/brokerages/<slug>` | `?kind=profile&profileType=brokerage&slug=<slug>&format=html` |
| `/properties/in/<city-state>` | `?kind=market&slug=<city-state>&format=html` |

Matched **before** the generic slug branch. `/properties/in/<slug>` cannot collide with it, because
that branch only ever accepts a single segment.

## 2. Preflight results (2026-11-10, non-destructive)

| Check | Result |
| --- | --- |
| Publisher, media, sitemap, robots, purge, health routes | unchanged; 43 pre-existing tests still pass |
| Phase 4 routing (all five families, both profile types) | pass — worker tests |
| Unpublished profile / unpublished market → 404, noindex, uncached | pass — worker tests **and** live origin probe (404 + `X-Robots-Tag: noindex, nofollow`) |
| Published market below its minimum → served, `X-Robots-Tag: noindex, follow` | pass — worker test |
| Empty directory → served, `noindex, follow` | pass — worker test |
| Canonical host | origin renderer already emits `https://properties.arrivestatemedia.com/...`, so the Worker's host rewrite is a confirmed no-op safety net |
| Structured data / breadcrumbs | present in the origin HTML (`application/ld+json`, canonical, robots meta) |
| Sitemap gates | verified in `generatePropertySitemap`: a market needs `status=published` **and** `indexing=index` **and** `sitemap_eligible=true`; a profile needs `PUBLISHED` + `authorization_confirmed` + `admin_approved_at` + `indexing=index` + not certification |
| Sitemap content today | empty `<urlset>` — correct: 0 published listings, 0 profiles, 0 markets |
| Signed purge accepts `paths` | pass — worker test, including rejection of `/../x`, `agents/x`, `https://evil.example/x` |

**Not exercised (cannot be, without activating what is switched off):** publishing a real profile and
then unpublishing it, a market crossing its listing threshold, and the withdraw-then-sweep revert of
check 7. Each needs real data plus profile/city publication, which remains off.

## 3. Findings the operator must act on before deploying

1. **The app's `PROPERTY_EDGE_PURGE_URL` uses the production Worker's workers.dev alias**
   (`arriv-property-staging.<subdomain>.workers.dev/__purge`). A signed, empty, verifying purge
   returned HTTP 200 `verified: true`, and that alias is the same deployment as the property host —
   so purges **do** reach the cache that serves production, and the app secret matches the
   production `PURGE_SECRET`. Nothing is broken today; the only fragility is that purges depend on
   the alias staying enabled. After the deploy, point the secret at
   `https://properties.arrivestatemedia.com/__purge` so purges travel over the custom domain, then
   confirm one signed purge still returns `verified: true`.
2. **`ORIGIN_BASE` drift.** The deployed Worker has it unset (`/__health` → `origin_host:
   arrivestatemedia.base44.app`); `wrangler.toml` pins it to `https://app.arrivestatemedia.com`.
   That branded host was re-verified today on all four proxied surfaces: `/properties` → the SPA,
   `generatePropertySitemap` → the app's XML, `getPublicPropertyPage` → the app's JSON,
   `getPublicVisibilityPage` → the app's HTML. Deploying applies the var; confirm `origin_host`
   reads `app.arrivestatemedia.com` afterwards. Cache keys are namespaced on `PUBLIC_HOST`, so
   changing `ORIGIN_BASE` orphans no cached entry. Fallback if that host is ever down: delete the
   var, and the Worker uses its built-in platform origin.
3. **No Cloudflare credentials in this workspace** — no `CLOUDFLARE_API_TOKEN`/`ACCOUNT_ID` secret and
   no `wrangler` dependency, so the builder session cannot deploy. An operator with Cloudflare access
   must run the commands below.
4. **Route binding lives in the dashboard, not this file.** The production `[[routes]]` block is
   commented out because the custom domain was attached in the Cloudflare dashboard. A deploy by
   Worker name preserves that attachment, but confirm "Domains & Routes" still lists
   `properties.arrivestatemedia.com` afterwards.
5. **Check 5 below was corrected.** A market that is *published but below its minimum* answers
   **200 with `noindex`**, not 404; only an unpublished market 404s. Both are non-indexable.

## 4. Deployment method (exact)

```bash
cd edge/property-edge

# 0. Confirm the right account owns the Worker before anything else
npx wrangler@latest whoami
npx wrangler@latest deployments list --name arriv-property-staging   # production (legacy name)

# 1. Rehearse on the separate staging Worker (workers.dev only, nothing public under the Arriv domain)
npx wrangler@latest deploy --env staging        # creates arriv-property-edge-staging
#    Wrangler prints the real hostname; put it in [env.staging.vars] PUBLIC_HOST
#    (<worker-name>.<account-subdomain>.workers.dev) or the canonical rewrite targets a dead host.
npx wrangler@latest secret put PURGE_SECRET --env staging   # staging has its own secret
curl -s https://arriv-property-edge-staging.<account-subdomain>.workers.dev/__health
curl -sI https://arriv-property-edge-staging.<account-subdomain>.workers.dev/agents | head -20

# 2. Production — deploys arriv-property-staging, the Worker the custom domain and PURGE_SECRET
#    already belong to. A deploy of the same name preserves both.
npx wrangler@latest deploy
curl -s https://properties.arrivestatemedia.com/__health   # expect origin_host=app.arrivestatemedia.com
#    and in the dashboard: Workers → arriv-property-staging → Settings → Domains & Routes
#    must still list properties.arrivestatemedia.com

# 3. Only if /__health reports purge_secret_configured:false
npx wrangler@latest secret put PURGE_SECRET   # must equal the app's PROPERTY_EDGE_PURGE_SECRET
```

Then, in the app dashboard → **Secrets**, set `PROPERTY_EDGE_PURGE_URL` to
`https://properties.arrivestatemedia.com/__purge` and run one signed purge to confirm `verified: true`.

Do **not** enable `visibility_profile_publication`, `visibility_geo_publication`,
`visibility_subscription_checkout`, advertising or customer emails as part of this deploy. The Worker
serves only what the origin already considers public, and with all four switches off only `/agents`,
`/brokerages` and `/properties` can answer — the first two carry no profile card, so they serve
`noindex` by the rule above.

## 5. Post-deploy verification (required, in order)

1. `GET https://properties.arrivestatemedia.com/agents` → 200, HTML, canonical on the property host,
   `X-Robots-Tag: noindex, follow` while no profile is published.
2. Publish one real profile, purge, `GET /agents/<slug>` → 200 with that profile's name in the `<h1>`.
   Confirm neither `owner_email` nor any `team_emails` address appears in the HTML.
3. Unpublish it, purge, `GET /agents/<slug>` → 404 with `X-Robots-Tag: noindex`.
4. `GET /properties/in/<a market with ≥3 published listings>` → 200, listings rendered, canonical
   correct, `X-Robots-Tag: index, follow`.
5. `GET /properties/in/<a market below the threshold>` → **200 with `X-Robots-Tag: noindex, follow`**
   (corrected — an *unpublished* market is the 404 case).
6. `GET /sitemap.xml` → contains `/properties/<slug>` for published listings, published profile paths,
   and only eligible market paths. No draft, unpublished or thin page appears.
7. Revert test: sell/withdraw a property in an eligible market, run the hourly sweep, confirm the
   market leaves the sitemap when it falls below its threshold.

Do not mark the Launch Readiness "Cloudflare Worker" item verified until 1–7 pass on production.

## 6. Rollback

The Phase 4 change is **additive routes only** — no existing route, cache key, header or purge
behaviour was altered. Reverting therefore removes `/agents`, `/brokerages` and `/properties/in`
serving and breaks nothing else: every origin function is independent of the Worker.

```bash
# a. Instant: Cloudflare keeps prior versions
npx wrangler@latest deployments list --name arriv-property-staging
npx wrangler@latest rollback --name arriv-property-staging [--version-id <previous>]

# b. Or redeploy the previous file
git show <last-good-sha>:edge/property-edge/worker.mjs > worker.mjs
npx wrangler@latest deploy
```

Fastest lever of all, no deploy needed: set the `PROPERTY_EDGE_DISABLED` var to `true` in the
Cloudflare dashboard — every public path then answers 503 without reading the cache, while
`/__purge` stays reachable. After any rollback, send one signed purge so a cached Phase 4 sitemap
cannot outlive the code that produced it, then re-check `/__health`, `/properties` (200) and `/agents`
(404).
