# Phase 4 — Cloudflare Worker routes (integrated, NOT deployed)

Target Worker: `edge/property-edge/worker.mjs` (properties.arrivestatemedia.com)

## 0. Status — verified 2026-11-10

- **Integrated into `worker.mjs`.** The Phase 4 routes are now real code in the Worker file, not a
  paste-in plan. Local regression suite: **60/60 passing** (`node --test`, hermetic: no network, no
  Cloudflare account, no Base44 call).
- **Not deployed — neither production nor staging.** Probed live on 2026-11-10:
  - `https://properties.arrivestatemedia.com/agents` → 404 `Property page not found` (proxied as a
    listing slug, which the pre-Phase-4 build does for any single segment)
  - `/brokerages`, `/agents/<slug>`, `/properties/in/<city-state>` → 404 at the edge
  - `https://arriv-property-staging.bradcburke.workers.dev` → identical pre-Phase-4 behaviour
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

1. **The app's `PROPERTY_EDGE_PURGE_URL` points at the staging Worker**
   (`arriv-property-staging.bradcburke.workers.dev/__purge`), not production. Verified by a signed,
   empty, verifying purge: HTTP 200, `verified: true` — so the app's secret matches **staging's**
   `PURGE_SECRET`, and production never receives a purge. Production copies therefore rely only on
   the 300-second TTL. Switch this secret to `https://properties.arrivestatemedia.com/__purge`
   **after** the deploy, then confirm a signed purge returns `verified: true`.
2. **`ORIGIN_BASE` is not set on the deployed Worker** (`/__health` → `origin_host:
   arrivestatemedia.base44.app`). This `wrangler.toml` sets it to `https://app.arrivestatemedia.com`;
   that host was re-verified today (serves `getPublicVisibilityPage`, HTTP 200 HTML). Deploying
   applies it automatically — confirm `origin_host` afterwards.
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

# 0. Confirm the right account owns the Worker
npx wrangler@latest whoami
npx wrangler@latest deployments list --name arriv-property-edge

# 1. Rehearse on staging first (the app's purge URL already targets it)
npx wrangler@latest deploy --env staging
curl -s https://arriv-property-staging.bradcburke.workers.dev/__health
curl -sI https://arriv-property-staging.bradcburke.workers.dev/agents | head -20

# 2. Production
npx wrangler@latest deploy          # name = arriv-property-edge, vars from [vars]
curl -s https://properties.arrivestatemedia.com/__health   # origin_host, host, TTLs, purge_secret_configured

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
npx wrangler@latest deployments list --name arriv-property-edge
npx wrangler@latest rollback --name arriv-property-edge [--version-id <previous>]

# b. Or redeploy the previous file
git show <last-good-sha>:edge/property-edge/worker.mjs > worker.mjs
npx wrangler@latest deploy
```

Fastest lever of all, no deploy needed: set the `PROPERTY_EDGE_DISABLED` var to `true` in the
Cloudflare dashboard — every public path then answers 503 without reading the cache, while
`/__purge` stays reachable. After any rollback, send one signed purge so a cached Phase 4 sitemap
cannot outlive the code that produced it, then re-check `/__health`, `/properties` (200) and `/agents`
(404).
