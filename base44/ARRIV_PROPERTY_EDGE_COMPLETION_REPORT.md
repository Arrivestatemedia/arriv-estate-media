# ARRIV PROPERTY VISIBILITY — EDGE IMPLEMENTATION & STAGING COMPLETION REPORT

**Date:** 2026-10-12 · **Status:** implementation COMPLETE and locally verified · **Staging deploy: NOT PERFORMED (external credentials)** · **Production activation: NOT APPROVED**

Nothing was deployed, published, flagged, or changed in DNS or in any live record. `PROPERTY_VISIBILITY_ENABLED` remains false, no test property was published to the live directory, and no existing system (bookings, media delivery, Arriv Pay, Stripe, prepaid, Auto-Fund, billing, commissions, payouts, Arriv One/Assist) was touched.

---

## 1. What was implemented

**Edge serving layer** (`edge/property-edge/worker.mjs`) — a single dependency-free module, no new database, no new storage, no duplication of media.

| Capability | Implementation |
|---|---|
| Crawlable HTML | The origin's server-rendered page is proxied, with canonical/OG/media URLs rewritten to the public host so the served copy is self-consistent. JSON-LD structured data and social metadata pass through intact. |
| Canonical URLs & SEO metadata | Canonical, `og:*`, `title`, description and JSON-LD preserved; `X-Robots-Tag: index, follow`, automatically downgraded to `noindex, follow` whenever the origin marks the listing unavailable (sold/withdrawn/expired/unconfirmed). |
| Sitemap | `/sitemap.xml` proxied from the sitemap endpoint, host rewritten, cached 15 minutes. |
| Robots | `/robots.txt` generated at the edge: allows crawling, disallows the signed operator endpoints and the duplicate media path, and points at the public sitemap. |
| Approved media | Streamed only through the gated media endpoint (`/media/<listing>/<file>` alias included). The edge cannot enumerate files, cannot reach Drive, holds no Drive credentials, and re-checks nothing less than the origin does. |
| Caching | Standard Cache API only (no KV/D1/R2/Durable Objects). One entry per page regardless of which of the two page paths is used; canonicalised keys so parameter order never splits the cache; **single-flight coalescing** so concurrent identical views cause one origin call; page 5 min, media 5 min, sitemap 15 min, refusals 60 s. |
| Invalidation | Signed purge (`POST /__purge`, HMAC-SHA-256 over `timestamp.body`, 5-minute replay window) dropping the exact keys: both page paths, the sitemap, and every media URL shape. Wired app-side so every mutation (publish, unpublish, archive, listing-status change, media change, detail change, authorization change) invalidates through one code path. Purge stays reachable while the surface is dark. |
| Purge verification | `verify: true` re-reads every key after deletion and reports `verified` only when none survives. **This is what the activation checklist gates on.** |
| Emergency shutdown | `PROPERTY_EDGE_DISABLED=true` → every public path 503 with `no-store`, **never reading the cache**, tagged `X-Arriv-Edge: KILL-SWITCH`; the purge endpoint stays reachable. |
| Error responses | 404 (refused/unknown), 405 + `Allow` (non-read methods), 401 (bad/stale signature), 400 (bad JSON), 503 (origin outage or unexpected error, never cached). |

**Config and deployment artifacts:** `wrangler.toml` (vars, staging environment on a `workers.dev` address, secrets, commented production binding, the DNS reality documented inline) and `adapters/deno-deploy.mjs` (the CNAME-based production path, explained in §6).

**App-side:** `PROPERTY_PUBLIC_ORIGIN` is now the property layer's own origin setting, preferred over `BASE44_APP_DOMAIN` (which 50+ other modules read) and inert while unset. Property URLs — canonical, sitemap, media — derive from it when it is set.

**Corrections made this execution (real defects, not cosmetics):**

1. **Drive file ids were rejected on the media alias and never purged.** The media route used the slug pattern, which excludes uppercase, dots and underscores — i.e. nearly every real Drive file id. Fixed with a dedicated permissive file-id pattern, used by both the route and the purge key builder.
2. **An origin outage was reported as 404.** A 5xx made the edge tell visitors and search engines that a live listing had been deleted. Origin failures are now 503 `no-store`, never cached.
3. **Credentials could have produced a cacheable private view.** A request carrying a cookie or `Authorization` header now bypasses the cache entirely, is stored with `private, no-store`, and client credentials are never forwarded to the origin.
4. **Unexpected content types could be stored as a page or as media** (e.g. a JSON envelope). Such responses pass through with `no-store`, uncached.
5. **Two cache entries and two origin calls for one page** (bare slug vs `/properties/<slug>`) — unified to one key.
6. **Duplicate origin calls under concurrency** — single-flight coalescing added.
7. **Trailing slashes 404'd** — normalised.

## 2. Which tests passed or failed

**Edge suite: 37 of 37 pass** (`edge/property-edge/worker.test.mjs`, run against the real worker with the origin fetch and cache stubbed — hermetic, no network, no account, no Base44 invocation, no production record, no flag change).

Coverage by requirement: crawlable HTML, structured data + social metadata, host rewriting, both page paths sharing one entry, trailing slash, HEAD; noindex propagation for unavailable listings; sitemap served/cached/host-rewritten; robots directives; cache hit without an origin call; 5 concurrent views → 1 origin call; media TTL capped at 300 s against an origin offer of 86,400 s and parameter-order-insensitive keys; origin refusal → 404 uncached; unknown slug resolved by the authority and refused uncached; non-slug path refused with zero origin calls; cross-listing media decided by the origin and its refusal not cached; unauthorized media 404 uncached; media alias → same gated origin call; Drive-style file ids accepted; credentialed request bypasses and is never stored, credentials never forwarded; origin outage → 503 uncached; unexpected content types passed through uncached; non-read methods refused; health reports config without secrets; kill switch refuses every path without reading the cache; purge reachable while dark; purge removes page+sitemap+media keys; purge forces revalidation; alias key dropped for Drive-style ids; purge verification succeeds; **purge verification correctly FAILS when a key survives**; bad signature, replayed timestamp and unsigned request all 401.

**Live read-only production probes (3 invocations, no writes):**

| Probe | Result |
|---|---|
| Public page with the flag off | 404 `feature_disabled: true` — dark as required |
| Public page with `test_mode: true` | 404 `feature_disabled: true` — **test mode is unreachable in production** because the certification configuration was not set |
| Sitemap | 200 with an empty `<urlset>` — no URLs advertised while dark (an empty sitemap is safer than a 404, which would raise Search Console errors) |

**Not run (externally blocked or deliberately gated):**

- **The property certification suite** (`certifyPropertyVisibility`) — it requires the certification-only configuration, and the owner chose not to set it this turn. It cannot run without it. This is by design: test mode is unreachable until that configuration exists.
- **Any remote staging execution** — no Cloudflare account credentials are available to me.
- **Regression suite for existing property functionality** — the shared policy engine is TypeScript and the platform's function runner is the only place it executes; its certification harness is blocked as above. Existing property surfaces were verified by grep to be uniformly on the new gate (all six endpoints; no stale flag reads), and only two files changed outside the edge folder (`propertyVisibility.ts` for the origin variable, `managePropertyListing` for the purge call).

## 3. Was the worker deployed to staging?

**No — and it was not tested remotely either.** Deployment requires Cloudflare account credentials and an account-level authorisation, which is the specific blocker. Everything needed to deploy is complete and inert:

```bash
cd edge/property-edge
npm install -g wrangler                  # or: npx wrangler …
wrangler login                           # authorises the owner's Cloudflare account
wrangler deploy --env staging            # prints: https://arriv-property-edge-staging.<subdomain>.workers.dev
wrangler secret put PURGE_SECRET --env staging
```

After the first deploy, set `PUBLIC_HOST` in `wrangler.toml` under `[env.staging.vars]` to the hostname wrangler printed (so canonical/media URLs are self-consistent on the staging host), redeploy, then verify with the staging checklist in §4. The staging address needs **no DNS at all** and is not under the Arriv domain, so nothing is public.

## 4. What remains before launch

1. **Staging deploy** (above) — owner credentials.
2. **Staging verification:** `GET /__health` (switch state, TTLs, `purge_secret_configured: true`); an unknown slug → 404; a non-slug path → 404 with no origin call; `POST /robots.txt`-safe checks; `GET /sitemap.xml` (empty while dark); a signed purge with `verify: true` → `verified: true`; then `PROPERTY_EDGE_DISABLED=true`, confirm 503 on every public path, and confirm the purge endpoint is still reachable.
3. **App-side secrets** (`PROPERTY_EDGE_PURGE_URL`, `PROPERTY_EDGE_PURGE_SECRET`) so invalidation is live. Until they exist, invalidation is inert and the 5-minute TTL is the only bound — which by the owner's own gate is **not** sufficient for activation.
4. **The production hostname decision** (§6) — the one genuine architectural blocker.
5. **Republish** the app once, so the `/properties` routes exist in the live bundle (unchanged finding from the readiness report: the published bundle contains zero property routes).
6. **Pilot activation:** `PROPERTY_PUBLIC_ORIGIN` set, flag enabled, exactly one real property published, full security/SEO checklist against it, 7-day observation, then expand.

## 5. Required Cloudflare account actions

- Create or use an existing Cloudflare account (free tier is sufficient) and authorise `wrangler login`.
- Deploy the staging worker and upload `PURGE_SECRET`.
- **Do not enable any paid Cloudflare feature.** Nothing in the implementation uses KV, D1, R2, Durable Objects, WAF add-ons or Cloudflare for SaaS.
- **Production hostname caveat:** a Worker can answer on a custom hostname only if the zone is on Cloudflare (Custom Domain) or through Cloudflare for SaaS. `arrivestatemedia.com` keeps its nameservers at Squarespace and those must not change, so the production subdomain **cannot** be bound to a Cloudflare Worker. The Cloudflare path is therefore staging-only unless the owner later authorises moving the zone. No paid service is proposed to work around this.

## 6. Required Squarespace DNS changes

**None today.** Nothing in this work touches DNS.

For the eventual public hostname, with nameservers staying at Squarespace: add **one CNAME record** at Squarespace, host `properties`, pointing at the edge provider's assigned target, with the provider issuing TLS automatically. Because the Cloudflare production binding is unavailable (§5), the practical path is the included adapter:

1. Deploy `edge/property-edge/adapters/deno-deploy.mjs` to Deno Deploy (Free plan supports custom domains — confirm current terms), set the same variables and `PURGE_SECRET`.
2. In Deno Deploy, add the custom domain `properties.arrivestatemedia.com`; it will show the CNAME target to use.
3. At Squarespace, add exactly: `properties` → **CNAME** → that target. No other record is created, changed or removed; nameservers are untouched.
4. Optionally, once live, redirect `app.arrivestatemedia.com/properties/*` → `https://properties.arrivestatemedia.com/*` (301) from the app dashboard's Domains page — no DNS change.

The same single-file handler runs on Vercel Edge or Netlify Edge with a five-line adapter; say the word and I will add either.

## 7. Expected ongoing costs

| Published properties | Edge requests / month | Cloudflare Workers cost at list price |
|---|---|---|
| 100 | ~168k | **$0** (free tier: 100k/day) |
| 1,000 | ~1.68M | **$0** (free tier allows ~3M/month; close to the ceiling) |
| 10,000 | ~16.8M | **≈ $7.04/month** ($5 base + 6.8M requests × $0.30) |

Egress/bandwidth is not charged by Cloudflare. No paid service is enabled. Base44-side cost falls as caching engages: one origin invocation per listing page, per media asset and for the sitemap per TTL window, coalesced under concurrency, with no new entities and no media duplication. The workspace's credit price in dollars remains undocumented, so I cannot convert that to currency.

## 8. Is the system ready for a controlled customer pilot?

**Not yet — implementation complete, activation not approved.** The code, security model, invalidation design (including its verification gate) and 37 automated tests are complete and passing, and the production surface is dark and fail-closed. Two things stand between here and a pilot, and both are owner-gated:

1. **Staging verification** of the deployed worker, including a signed purge returning `verified: true` — I could not perform it without account credentials.
2. **Live invalidation credentials.** They were skipped this turn, so invalidation is inert and only the 5-minute TTL protects stale or de-authorized content. By the owner's own rule — "if immediate invalidation cannot be verified, do not approve production activation" — activation must wait for them.

What that means in practice until the skipped values are added (they can be added any time from the app dashboard's Secrets page): the public hostname will not be used for canonical URLs (property URLs keep resolving through the app host, with the edge rewriting them as a safety net), cache invalidation stays inert, and the isolated property certification suite cannot run at all. None of this affects the 37 edge tests, which are hermetic.