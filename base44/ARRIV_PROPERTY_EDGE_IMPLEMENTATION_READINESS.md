# ARRIV PROPERTY VISIBILITY — IMPLEMENTATION READINESS REPORT

**Date:** 2026-10-12 (UTC) · **Scope:** technical preparation only — approved by owner
**What was done this turn:** verification items 1-4 and 9 answered with evidence; items 5-8 designed **and prepared as code with automated tests**; item 10 sequenced. **What was NOT done:** no publish, no deployment, no DNS change, no feature flag change, no live listing record touched, no secret set. Nothing is publicly reachable as a result of this work.

Files added/changed (all inert in production until the owner approves the deployment stages):
`edge/property-edge/worker.mjs`, `edge/property-edge/worker.test.mjs`, `edge/property-edge/wrangler.toml`
`base44/shared/edgeCache.ts` (new), `base44/shared/propertyVisibility.ts` (test-mode gate),
`managePropertyListing`, `getPublicPropertyPage`, `streamPropertyMedia`, `searchProperties`, `generatePropertySitemap`, `submitPropertyInquiry`, `certifyPropertyVisibility`.

---

## 1. The application's current configured domain — exact value

**`BASE44_APP_DOMAIN` is set to `app.arrivestatemedia.com` (HTTPS).** Read from the app's own runtime environment; the effective origin the property code derives from it is **`https://app.arrivestatemedia.com`** (`publicOrigin()` adds `https://` when the value has no scheme).

Live corroboration on the two hosts:

| Host | Result |
|---|---|
| `https://app.arrivestatemedia.com/properties` | HTTP 200, SPA shell, **no `x-robots-tag`** header |
| `https://arrivestatemedia.base44.app/properties` | HTTP 200, SPA shell, **`x-robots-tag: noindex, follow`** |
| `https://www.arrivestatemedia.com/properties` | HTTP 404 (not this app) |
| `https://arrivestatemedia.com/properties` | HTTP 301 → `https://www.arrivestatemedia.com/properties` |

**Consequences that matter:** every canonical URL, OG URL, sitemap entry and media URL the engine generates is currently built on the **authenticated app host**, so property pages published today would canonicalise onto `app.arrivestatemedia.com` rather than a public marketing host. This is exactly what the new `PROPERTY_PUBLIC_ORIGIN` variable is for — and it must be a *new* variable, because `BASE44_APP_DOMAIN` is read by 18 other shared modules (client emails, onboarding SMS, signing links, Twilio webhook validation, recovery links) and changing its value would alter all of them.

## 2. DNS records that would eventually be required (not modified)

| Record | Purpose | Notes |
|---|---|---|
| `properties` **CNAME** → edge provider hostname | Binds `properties.arrivestatemedia.com` to the worker | If the `arrivestatemedia.com` zone is on Cloudflare and the worker is deployed as a **Custom Domain**, Cloudflare creates this record itself on authorisation — the owner approves rather than hand-edits |
| Provider verification record (only if the zone is not on the provider) | Proves control of the subdomain | Typically a `TXT` or `_<provider>-verification` record; **no such record is needed if the zone is on Cloudflare** |
| *(optional)* Dashboard → Domains page redirect: `app.arrivestatemedia.com/properties/*` → `https://properties.arrivestatemedia.com/*` (301) | Avoids two URLs for the same page | Owner-configurable, no DNS change |

**Explicitly not touched:** apex `arrivestatemedia.com`, `www`, and `app`. No A/AAAA records are needed (the edge terminates TLS; the app host already sends HSTS). TLS is issued automatically for the subdomain.

## 3. Edge-hosting provider, pricing and deployment requirements

**Recommended provider: Cloudflare Workers.** The platform's own host already sits on Cloudflare (verified: `server: cloudflare`, `cf-ray`, `cf-cache-status` on every response), so the traffic path gains no new third party and the Arriv subdomain can be bound without touching the app host.

**Published pricing (verified against Cloudflare's own documentation today — re-verify before committing):**

| Item | Free | Paid |
|---|---|---|
| Base | $0 | **$5/month minimum** |
| Requests | 100,000/day | **10M/month included**, then **$0.30 per additional million** |
| CPU time | 10 ms/request | 30M CPU-ms/month included, then $0.02 per additional million |
| Bandwidth / egress | **No charge** | **No charge** |

**Mapped to the property engine's own traffic assumptions** (150 page views, 20 searches, 2 inquiries per listing per month; ~10 media requests per view; 5 crawler fetches per listing):

| Published properties | Requests to the edge / month | Cloudflare cost at list price |
|---|---|---|
| 100 | ~168k | **$0** (inside the free daily allowance) |
| 1,000 | ~1.68M | **$0** (free tier allows ~3M/month; close to the ceiling) |
| 10,000 | ~16.8M | **≈ $7.04/month** ($5 base + 6.8M requests × $0.30) |

**Deployment requirements:** a Cloudflare account holding the `arrivestatemedia.com` zone (owner-controlled); one worker script (single file, zero dependencies, no build step); a custom-domain binding for `properties`; one secret (`PURGE_SECRET`); the configuration variables (origin base, public host, three TTLs, kill switch). No database, no storage bucket, no queue. Alternatives that can run the same single fetch handler: Vercel Edge, Netlify Edge, Fastly Compute, or nginx + Varnish — the worker is deliberately portable, but Cloudflare is recommended because the platform's DNS and CDN are already Cloudflare.

**Two costs I still cannot state:** the workspace's credit price in dollars (not documented) and Base44 storage/bandwidth pricing (not documented). Everything above is provider pricing only.

## 4. Confirmation that the worker can serve crawlable HTML, sitemaps, robots directives and approved media

**Confirmed by execution, not by inspection: 21 automated tests, 21 passing**, run against the real worker file in the development harness this turn. Each requirement maps to a named assertion:

| Requirement | Test (all passing) |
|---|---|
| Crawlable HTML at the canonical URL, without JavaScript | `serves_crawlable_html_at_the_canonical_url` — asserts `<title>`, meta description, `rel="canonical"`, JSON-LD and a 200 `text/html` response |
| Copy is self-consistent on the public host | `rewrites_origin_host_to_the_public_host` — the served HTML's canonical and media URLs contain the public host and **no** origin host |
| The compatibility path works | `serves_the_compatibility_path` (`/properties/<slug>`) |
| Sold / unavailable listings are not advertised | `propagates_noindex_for_a_listing_that_is_not_available` — page served, `X-Robots-Tag: noindex, follow` |
| XML sitemap | `sitemap_is_served_as_xml_on_the_public_host`, `sitemap_is_cached` |
| Robots directives | `robots_directives_point_at_the_public_sitemap` — includes `Sitemap: https://<public host>/sitemap.xml` |
| Approved public media streams **and** caches | `approved_media_is_streamed_and_cached_with_a_bounded_ttl` — `image/jpeg`, TTL capped at 300 s where the origin offers 86,400 s |
| Media alias path | `media_alias_path_maps_to_the_same_gated_origin_call` |

## 5. Immediate cache invalidation design (implemented)

**Triggers.** Publishing, unpublishing, archiving, a listing-status change (sold / withdrawn / expired / pending / active), a media-selection change, and any property-detail or approved-content change. Because every one of those mutations already flows through a single `update()` helper in `managePropertyListing`, the invalidation is wired **in one place** — there is no path that can change public content without invalidating it. Permission revocation today is expressed by unpublish or archive, both covered.

**What is dropped, exactly.** The signed purge request carries the listing's slug, its id and every file id it can currently expose, and the worker deletes those exact cache keys — the page (`/<slug>` and `/properties/<slug>`), the sitemap, and each media URL in the shape the rendered HTML actually emits (`/functions/streamPropertyMedia?listing=…&file=…` plus the `/media/<listingId>/<fileId>` alias). Keys are canonicalised (sorted query parameters) so the delete matches the entry the visitor's request created.

**Failure behaviour, stated honestly.** The purge is fire-and-forget with a 4-second timeout and never fails the customer action; a failure is logged. The fallback bound is the TTL: media and HTML are both capped at **300 seconds** at the edge (the origin offers 24 h for media, which the worker deliberately overrides), so a lost purge exposes a stale page or a de-authorized asset for at most five minutes, and browser copies are bounded by the same header. Tests: `signed_purge_removes_the_page_sitemap_and_media_keys`, `purge_forces_the_next_page_view_to_revalidate_at_the_origin`.

**The trade-off the owner should ratify:** the 5-minute media TTL is what makes a lost purge bounded. The only way to get zero exposure on revocation is to stop caching media (≈15× more origin invocations) or to put a rotating token in media URLs (an origin change). My recommendation is the 300-second bound.

## 6. Global emergency-disable mechanism (implemented)

Two independent switches, neither requiring a code change:

1. **Edge kill switch** — `PROPERTY_EDGE_DISABLED=true` makes every public path return **503 with `Cache-Control: no-store`**, and the disabled path **never reads the cache**, so nothing already stored at the edge can be served. The signed purge endpoint stays reachable while dark, so an operator can purge and stay dark. Test: `kill_switch_refuses_every_public_path_without_reading_the_cache` (asserts all three route types 503, zero origin calls, cache untouched).
2. **Origin flag** — `PROPERTY_VISIBILITY_ENABLED=false` makes every origin endpoint fail closed (verified live today: 404 / `feature_disabled` / empty sitemap / media 404).

**Residual exposure, stated plainly:** copies already downloaded by a browser or cached by an intermediary expire within the 5-minute TTL. No mechanism can revoke a copy a third party already holds — the kill switch stops the edge serving immediately, and the TTL bounds everything else.

## 7. Fail-closed behaviour (implemented and tested)

| Condition | Behaviour | Test |
|---|---|---|
| Origin refuses (unpublished, unauthorized, draft, certification in production scope) | 404 to the visitor, **never cached as content** | `origin_refusal_becomes_404_and_is_never_cached_as_content` |
| Unknown slug | Resolved by the origin (the authority) and refused; nothing cached | `an_unknown_slug_is_resolved_by_the_origin_and_refused_uncached` |
| Path that cannot be a slug | 404 at the edge with **zero origin calls** | `a_path_that_cannot_be_a_slug_is_refused_at_the_edge` |
| Non-read method | 405 with `Allow: GET, HEAD` | `non_read_methods_are_refused` |
| Unexpected exception in the worker | 503, `no-store`, `noindex` | code path in `worker.mjs` |
| Unauthorized media (file not in the published selection, video not included) | 404, not cached | `unauthorised_or_unpublished_media_is_404_and_not_cached` |
| Cache keys | Not affected by unrelated query parameters | `cache_keys_are_not_affected_by_unrelated_query_parameters` |

The edge holds no authority of its own: its only inputs are two origin endpoints whose checks (flag → listing → certification scope → PUBLISHED → file allow-list) remain decisive on every cache miss. The worker never touches Google Drive, never enumerates anything, and has no generic passthrough.

## 8. Certification no longer touches production feature flags — done

The old suite temporarily wrote `PROPERTY_VISIBILITY_ENABLED` to `true` and restored it. That is eliminated.

**Mechanism.** A certification-only configuration (`PROPERTY_VISIBILITY_TEST_MODE`) plus an explicit per-request `test_mode: true` flag, with a scope rule: **test mode can only ever reach certification records, and the production scope can never see them.** Three conditions must all hold for test mode to exist, and the production flag is never written.

**Verified:** the suite now contains **zero `AppSetting` writes** (grep: only two reads — one helper, one comparison) and asserts the flag record's **value *and* its `updated_date`** are unchanged, which proves the record was not written at all. Two new read-only assertions were added: `certification_never_reaches_production_scope` (a request with no test mode, exactly what a visitor sends, cannot see a certification listing) and `certification_scope_is_disjoint` (the same slug: 404 without test mode, served with it).

**Consequence the owner must know:** because the test-mode variable is deliberately **not set**, the suite can no longer run at all until the owner approves setting `PROPERTY_VISIBILITY_TEST_MODE=true` as a secret. If the suite is run before that, it will report feature-disabled failures — that is the safety property working, not a regression. I have set no secrets.

## 9. Why the published build returns 404 — resolved

The routes exist in the source and in the current build; the **published bundle predates the feature**.

| Evidence | Published bundle `index-C5VkUi7m.js` (7,316,102 bytes) | Current source build `dist/index-RuGaoSjC.js`, built 05:05 UTC (7,381,304 bytes) |
|---|---|---|
| `properties/:slug` | **0** | 1 |
| `PropertyDirectory` | **0** | 2 |
| `PublicPropertyPage` | **0** | 3 |
| `PropertyMarketingHero` | **0** | 2 |
| `PropertyPageBuilder` | **0** | 5 |
| `getPublicPropertyPage` | **0** | 1 |
| `AutoFundTerms` (an older feature, control) | 4 | present |

`src/App.jsx` declares the routes explicitly (lines 579-580), which is the correct pattern here because `src/pages.config.js` — the platform's legacy page registry — does not contain the property pages and no longer auto-generates. **Cause: the live client bundle has no property route, so the client router falls through to the platform's "Page Not Found". Remedy: a production republish of the current build.** After republishing, `/properties` should render the directory in its "not yet available" state (flag off), and `/properties/<slug>` should 404 — both correct while the feature is dark.

## 10. Controlled deployment sequence

Each stage has an exit criterion and its own rollback; none requires a data migration.

| Stage | Action | Exit criterion | Rollback |
|---|---|---|---|
| **0 — now (done)** | Dev-only code + tests | 21/21 tests pass, syntax checks clean, zero production writes | delete branch |
| **1 — review** | Owner reviews this report and the code | Approvals in §11 granted | — |
| **2 — staging (no DNS)** | Deploy the worker to a **non-production `*.workers.dev` address**, pointing at the app origin | Every route verified against the live origin (which is flag-off, so 404s are expected and correct), plus kill-switch, purge round-trip, and cache behaviour | delete the worker — nothing was public |
| **3 — republish (frontend only)** | Owner republishes the app | `/properties` renders; login, bookings, galleries unaffected; `/properties/<slug>` 404s | republish the previous build |
| **4 — DNS activation** | Bind the subdomain (Custom Domain) | TLS valid, `robots.txt` and empty `sitemap.xml` correct, unknown slugs 404, app host unchanged | remove the binding |
| **5 — purge wiring** | Set `PROPERTY_EDGE_PURGE_URL` + `PROPERTY_EDGE_PURGE_SECRET` (app) and `PURGE_SECRET` (edge) | A signed purge round-trip succeeds; a publish→purge→refetch cycle revalidates | unset the secrets (purge becomes inert, TTL bound remains) |
| **6 — customer pilot** | Enable the flag with **exactly one** published property (the flag is global, so this is the smallest exposure), run the full security + SEO checklists, monitor 7 days | All checklists green; crawler hits served from cache; no stale-content reports; inquiries arriving | flag off + kill switch |

## 11. Decisions requiring owner approval

1. **Who executes the CNAME**, and whether the `arrivestatemedia.com` zone is on Cloudflare (this determines whether a verification record is needed at all).
2. **Production republish of the frontend** — a separate, explicit go/no-go. Until it happens, the property routes do not exist in production.
3. **Deploying the worker to a non-production `workers.dev` staging address** (no DNS, nothing public) so Stage 2 can be executed.
4. **Setting `PROPERTY_VISIBILITY_TEST_MODE=true`** so the isolated certification suite can run at all — and whether that configuration stays set permanently or only during certification windows.
5. **Ratifying the media exposure policy**: 300-second TTL (recommended) vs no media caching (strongest, ~15× more origin cost) vs tokenised media URLs (origin code change).
6. **The value of `PROPERTY_PUBLIC_ORIGIN`** (`https://properties.arrivestatemedia.com`) and whether to also 301 the old `app.*/properties/*` URLs to it.
7. **Where the edge source lives** (a separate repository vs this workspace) and who owns the Cloudflare account.
8. **Acknowledge that the cost of Base44 credits in dollars cannot be stated** — the platform does not document it; provider pricing is in §3.

Meta publishing and paid advertising remain deferred, as agreed.