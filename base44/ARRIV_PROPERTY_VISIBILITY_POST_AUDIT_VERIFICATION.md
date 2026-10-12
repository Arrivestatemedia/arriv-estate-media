# ARRIV PROPERTY VISIBILITY — POST-AUDIT VERIFICATION & SEO LAUNCH PLAN

**Date:** 2026-10-12 (UTC)
**Type:** READ-ONLY VERIFICATION + IMPLEMENTATION PLAN FOR OWNER APPROVAL.
**Not done in this phase:** the edge layer was not implemented, DNS was not modified, no feature flag was activated, nothing was published, and no production record was created. The only write is this document.
**Method:** repository inspection (file mtimes, git history, source reading), read-only live HTTP probes of the published app and its public function endpoints (raw `curl`, no JavaScript executed, so the responses below are exactly what a crawler receives), entity reads, and Base44 platform documentation.

---

# PART 1 — VERIFICATION RESULTS

## 1. What changed during and after the Phase 0 audit

| # | Commit | Committed | Files | Nature |
|---|---|---|---|---|
| 1 | `01ac38c6` — "Add Phase 0 property marketing audit document" | 2026-10-12 05:01 UTC | `base44/ARRIV_PROPERTY_MARKETING_PHASE0_READ_ONLY_AUDIT.md` | Documentation only |
| 2 | `c97de090` — "Redesign property marketing page to match delivery gallery aesthetic" | 2026-10-12 05:04 UTC | `src/pages/PublicPropertyPage.jsx`, `src/components/property/PropertyMarketingHero.jsx` (new), `src/components/property/PropertyMediaGallery.jsx` (new), `src/components/property/PropertyInfoPanel.jsx` (new), `src/components/property/PropertyCard.jsx` | Presentation only — no data fetching, approval, publication or inquiry logic changed |

**Exact file timestamps (UTC):**

| File | mtime |
|---|---|
| `src/pages/PublicPropertyPage.jsx` | 2026-10-12 05:04:30 |
| `src/components/property/PropertyMarketingHero.jsx` | 2026-10-12 05:04:30 |
| `src/components/property/PropertyMediaGallery.jsx` | 2026-10-12 05:04:30 |
| `src/components/property/PropertyInfoPanel.jsx` | 2026-10-12 05:04:30 |
| `src/components/property/PropertyCard.jsx` | 2026-10-12 05:04:30 |
| `base44/ARRIV_PROPERTY_MARKETING_PHASE0_READ_ONLY_AUDIT.md` | 2026-10-12 05:01:30 |

`git status` is clean — the working tree matches HEAD, so nothing is uncommitted.

**Deployment status:** the code is committed in the repository. It is **not verified as published**: the live production app does not currently serve the property routes (evidence in §1.1). Publishing is an owner action in the dashboard and was deliberately not performed.

**Visible to customers: NO.** Three independent reasons, all verified:

1. **Feature flag is off in production.** `AppSetting` key `PROPERTY_VISIBILITY_ENABLED` = `"false"` (record updated 2026-10-12 04:57 UTC).
2. **No listings exist.** `PropertyListing` contains **0 records**, so there is nothing to show even if the flag were on.
3. **The live app does not serve `/properties`.** `GET https://arrivestatemedia.base44.app/properties` returns the SPA shell (HTTP 200) and, after the client router runs, a platform "Page Not Found — The page *"properties"* could not be found in this application" screen. The same path on `https://app.arrivestatemedia.com/properties` returns HTTP 200 with the same shell. Because `src/App.jsx` *does* declare `/properties` and `/properties/:slug`, this most likely means **the published build predates the property routes and needs a republish**; a second possibility is that the platform's router only serves paths registered in `pages.config.js`. These two causes must be distinguished before the pilot (republish, then re-probe).

Live fail-closed behaviour was independently confirmed on all four public endpoints (raw, no JS):

| Endpoint (live, 2026-10-12 05:08 UTC) | Response |
|---|---|
| `/functions/getPublicPropertyPage?slug=…&format=html` | HTTP 404 `{"ok":false,"feature_disabled":true,"message":"Property pages are not yet available."}` |
| `/functions/searchProperties?q=Austin` | `{"ok":false,"feature_disabled":true,"results":[],"total":0,"message":"The property directory is not yet available."}` |
| `/functions/generatePropertySitemap` | empty `<urlset>` XML |
| `/functions/streamPropertyMedia?listing=…&file=…` | `{"error":"Not found"}` |

## 2. Property engine — verified surface by surface

Legend: **LIVE** = independently probed against production right now · **CODE** = verified by reading the implementation · **SUITE** = an automated test exists in `certifyPropertyVisibility` (not run in this phase).

| Capability | Status | Evidence |
|---|---|---|
| Global feature flag, fails closed | **LIVE + CODE** | Live 404s above; `isPropertyVisibilityEnabled` returns `false` on any read error and the flag is read before any other work in all four endpoints |
| Delivered-media eligibility gate | **CODE + SUITE** | `isJobEligibleForPropertyPage` requires `production_status ∈ {delivered, ready_for_delivery, no_editing_required}`; the suite creates a delivered job fixture and asserts the gate |
| Media selection limited to delivered files | **CODE + SUITE** | `normalizeSelection` is allow-listed against the job's own folder listing; foreign ids and non-photo/video files are rejected; the suite submits `not_a_delivered_file` and a PDF fixture and asserts rejection |
| Cover/order handling | **CODE + SUITE** | Positions renumbered from zero in the customer's order; cover falls back to the first photograph |
| Customer approval gate | **CODE + SUITE** | `publish` returns HTTP 409 `APPROVAL_REQUIRED` unless `publication_consent_at` is set; `canApprovePublication` returns `false` for admins, so approval is reserved to the owning customer |
| Publication state machine | **CODE** | Six states with an explicit transition table (`DRAFT → READY_FOR_REVIEW → APPROVED → PUBLISHED ⇄ UNPUBLISHED → ARCHIVED`); invalid transitions rejected by `transitionError` |
| Reachable vs. available (sold/withdrawn/expired) | **CODE + SUITE** | `isPubliclyReachable` (PUBLISHED) is separate from `isPubliclyActive` (PUBLISHED **and** active/pending **and** status confirmed within 30 days); a sold page stays reachable but is never presented as available and is served `noindex` |
| Status-confirmation policy (30/60 days) | **CODE** | `STATUS_CONFIRMATION_WINDOW_DAYS = 30`, `STATUS_AUTO_DEACTIVATE_AFTER_DAYS = 60`, sweep behaviour documented in the shared module |
| Media streaming / no public duplication | **CODE + SUITE + LIVE** | `streamPropertyMedia` re-checks flag, listing, `certification_mode`, PUBLISHED state **and** that the requested file id is inside `selected_media`; video additionally requires `include_video`. Live probe returns `Not found`. Nothing is copied to public storage — bytes are read from the job's private Drive folder |
| Inquiry capture | **CODE + SUITE + LIVE** | `submitPropertyInquiry` requires the listing to be active, validates the email, requires consent, honours a honeypot, scores spam signals, hashes IP/user-agent, routes only to the authorized contact, and keeps lead sharing `not_shared` |
| Structured data (JSON-LD) | **CODE + SUITE** | `buildStructuredData` emits `RealEstateListing` with address, offer price, bedrooms/bathrooms/sq ft as `additionalProperty`, and agent + brokerage as `RealEstateAgent.memberOf` |
| Sitemap | **CODE + LIVE** | `generatePropertySitemap` filters `publication_state: PUBLISHED`, `listing_status ∈ {active,pending}`, `certification_mode != true`, and `last_status_confirmed_at ≥ 30 days`; live output is an empty `urlset` while the flag is off |
| Directory search | **CODE + LIVE** | `searchProperties` applies the *same* eligibility filter server-side and returns `feature_disabled` today |
| Branded/private asset hygiene | **CODE** | Property media is never a raw Drive URL: it is always `…/functions/streamPropertyMedia?listing=…&file=…` |
| Certification isolation | **CODE + SUITE** | `certification_mode` listings are excluded from every public surface; the suite sweeps its own fixtures by `certification_run_id` and re-verifies |
| Data access control | **CODE** | `PropertyListing`, `PropertyInquiry`, `PropertyListingEvent` are admin-only RLS; every customer and public read/write goes through a function that re-verifies ownership (`client_email`) |

**Automated tests vs. independently verified live behaviour — the honest split:**

* **Automated (exists, not executed in this phase):** `certifyPropertyVisibility` — 464 lines covering policy unit checks (selection normalisation, RESO projection, eligibility, cost assumptions) plus an end-to-end run that creates a synthetic job and listing, exercises submission → content approval → publication approval → publish → public read → inquiry (valid, invalid, honeypot) → media protection → status change → flag behaviour, then tears its fixtures down and asserts nothing is left behind.
* **Two operational cautions about that suite (both verified in its code):** it **temporarily writes the production feature flag to `true`** and restores the previous value at the end (lines 174-182, 368-369, 422-426) — so it must be run deliberately, with the flag-restore step re-verified afterwards; and it is **not wired into the umbrella suite** (`runCertificationSuite` does not reference it), so it must be invoked directly by an admin.
* **Independently verified live right now:** only the fail-closed behaviour of the four endpoints and the flag/record state. **Not** independently verified: a real end-to-end publish, crawlable HTML at a canonical URL, indexing behaviour, real-asset streaming, and production AI content cost — because the flag is off and no listing exists. Those require a pilot (§7 Step 8).

## 3. Canonical URL and the public HTML response

**Canonical URL** = `publicOrigin() + "/properties/" + public_slug` (`propertyPageUrl`). `publicOrigin()` reads the backend environment variable **`BASE44_APP_DOMAIN`** (value not readable by me) and falls back to `https://arrivestatemedia.base44.app`. **Action: confirm that variable's current value** — it determines whether canonical URLs point at the custom domain or at the Base44 host.

**What a crawler actually receives today (`curl`, no JS):**

| Aspect | Verified result |
|---|---|
| `GET /properties` (both hosts) | HTTP 200, `content-type: text/html`, `cf-cache-status: DYNAMIC` |
| Initial HTML content | SPA shell only: `<div id="root"></div>`, `<title>Arriv Estate Media</title>`, the app's generic description, a JS bundle and CSS. **No property title, no property description, no image references, no JSON-LD, no agent/brokerage** |
| Platform header | `x-robots-tag: noindex, follow` **on the `arrivestatemedia.base44.app` host**; the custom domain `app.arrivestatemedia.com` returned 200 **without** that header |
| `robots.txt` | `User-agent: * / Allow: /` with `Sitemap: https://arrivestatemedia.base44.app/sitemap.xml` — that is the **platform's own** sitemap, not the property sitemap (`/sitemap.xml` returns 200 `application/xml`) |
| `GET /functions/getPublicPropertyPage?slug=…&format=html` | The **complete crawlable document does exist**: `<title>`, meta description, `<link rel="canonical">`, `noindex` only when not available, OG tags, `application/ld+json`, `<h1>`, description, `<address>`, facts list, "Listed by {agent}, {brokerage}", `<figure>`+`<img alt>` per approved photo, video, disclosures. Served today with HTTP 404 because the flag is off |
| Hosting constraints (platform docs) | SPA-only hosting — every route is served from `index.html`; **no custom server routes documented**; automatic Cloudflare CDN caching; **the CDN cache cannot be cleared manually** (republishing refreshes files); 301 redirects are configurable per path/prefix in Dashboard → Domains |

**Conclusion:** the content needed for SEO is already produced correctly — the missing piece is *hosting it at the canonical URL*. Confirmed: the gap is hosting, not content.

---

# PART 2 — RECOMMENDED EDGE-SERVING SOLUTION (design only; nothing deployed)

## 4. Smallest practical Arriv-controlled edge layer

**Shape:** one static edge worker (single `fetch` handler) in front of the **existing** Base44 function endpoints, on an Arriv-controlled hostname. No new data store, no new backend, no change to the property engine.

**Route contract (allow-list only — anything else 404s):**

| Public path on the edge | Origin call | Notes |
|---|---|---|
| `/<slug>` (and `/properties/<slug>` for compatibility) | `GET /functions/getPublicPropertyPage?slug=<slug>&format=html` | The crawlable document, served verbatim; only `200` responses are cached |
| `/media/<listingId>/<fileId>` | `GET /functions/streamPropertyMedia?listing=…&file=…` | Rendered into the HTML as this edge URL so images are served from the property host, not the Base44 host |
| `/sitemap.xml` | `GET /functions/generatePropertySitemap` | Cached 900 s at the edge |
| `/robots.txt` | generated at the edge | Points at the edge sitemap |
| everything else | 404 at the edge | No passthrough, no generic proxy, no directory listing |

**Requirements, each with how the design meets it:**

* **Crawlable HTML at the canonical URL** — the edge returns the function's HTML (already complete, §3) at `https://<subdomain>/<slug>`, so canonical, sitemap, OG and the served document agree.
* **Canonical URL preserved** — canonical comes from the listing record; the plan sets the property origin to the subdomain (dedicated variable, §7 Step 1) so records, sitemap and served HTML all carry the same URL. The edge does not rewrite canonicals.
* **XML sitemap + robots directives** — edge `/sitemap.xml` (cached) and edge `/robots.txt`; `X-Robots-Tag` set by the edge: `index, follow` only for a listing that is publicly active, otherwise the origin's `noindex, follow` is passed through unchanged. The Base44 host's blanket `noindex` header never applies here.
* **Safe caching of approved public media** — only `200` responses from `streamPropertyMedia` are cached, i.e. only files the origin has already proven are inside a PUBLISHED listing's approved selection. Nothing else is ever cacheable.
* **Invalidation after edits, status changes or unpublishing** — (a) a signed purge endpoint (`POST /__purge`, HMAC over timestamp+body, replay window, method+secret guarded) accepting `{ listing_id }` / `{ slug }`, purging `/<slug>`, `/media/<listingId>/*` and `/sitemap.xml`; (b) an optional fire-and-forget call to it from the publish / unpublish / archive / status-change / details-change paths in `managePropertyListing` (a customer action must never fail because the edge is unreachable); (c) short TTLs as the backstop: HTML 300 s (origin already sends `max-age=300`), media **capped at 3600 s + `stale-while-revalidate`** rather than the origin's 86 400 s, so the worst-case exposure after an unpublish is one hour instead of a day; sitemap 900 s.
* **Never exposes private delivery assets or unauthorized listings** — the edge has no Drive access and no ability to list anything; its only inputs are two endpoints whose origin checks (flag → listing → certification → PUBLISHED → file-id allow-list) remain the final authority. A draft, unpublished, sold-out-of-policy or certification listing 404s at origin and that 404 is never cached beyond 60 s. The worker never emits a Drive or Base44 storage URL.
* **Minimizes Base44 function invocations** — cache hits are served entirely at the edge; media is cached once per asset and shared by every visitor; the sitemap is fetched at most once per 15 minutes. Today every hit is an origin invocation (`cf-cache-status: DYNAMIC` on function responses).
* **Portable** — one `fetch` handler, the standard Web Cache API, and configuration only in environment variables (origin base URL + purge secret). No proprietary storage, no bindings required. Moving it to another edge (Vercel, Netlify, Fastly, or nginx+Varnish) is a re-implementation of the same six routes.

## 5. Subdomain recommendation

**Recommend `properties.arrivestatemedia.com`** (fallback: `homes.arrivestatemedia.com`).

Verified today: `app.arrivestatemedia.com` resolves and serves the app (HTTP 200, no `noindex` header); `www.arrivestatemedia.com` returns 404; the apex `arrivestatemedia.com` 301s to `www`. So the app owns `app.*`, and `www`/apex are elsewhere — a **new subdomain** avoids touching any of them and keeps a clean separation between the authenticated app and the public marketing surface.

**DNS requirements (owner action; I cannot verify DNS control):** a `CNAME` for `properties` pointing at the edge provider's hostname, issued over TLS, plus whatever domain-verification record the provider requires. If Arriv prefers to keep everything on the app host, the only alternative is redirecting `app.*/properties/*` to the subdomain via the dashboard's 301 rules so no duplicate URLs exist.

**Two things this must NOT change:** `BASE44_APP_DOMAIN` is read by 18 shared modules (emails, signing links, Twilio webhook validation, recovery links, careers links). It must be left alone, which is why the plan introduces a dedicated property-origin variable instead.

## 6. Expected operating costs and traffic assumptions

**Assumptions (all flagged, not measured):** 15 photos + 1 video per property; the engine's own planning assumptions (`COST_MODEL`: 150 page views, 20 directory searches, 2 inquiries per listing per month); ~10 media requests per view; 5 crawler fetches per listing per month; the engine's documented unit rates ($0.35 per 10,000 page views, $0.90 per 10,000 media responses, $0.25 per 10,000 searches, $0.02 per AI content generation, $0 storage duplication); Base44 credit rate from the platform docs (≈1 credit per 100 function invocations).

| Scale | Edge requests / month (all traffic) | Origin invocations — **no edge cache** | Origin invocations — **90% hit** | Origin invocations — **95% hit** |
|---|---|---|---|---|
| 100 properties | ~168k | ~168k (~1.7k credits) | ~19k (~190 credits) | ~11k (~110 credits) |
| 1,000 properties | ~1.68M | ~1.68M (~16.8k credits) | ~188k (~1.9k credits) | ~105k (~1.05k credits) |
| 10,000 properties | ~16.8M | ~16.8M (~168k credits) | ~1.88M (~18.8k credits) | ~1.05M (~10.5k credits) |

**Reading:** the edge does not add meaningful cost — it removes ~90-95% of origin invocations, and those invocations are the only unit that scales linearly with traffic. Even at 10,000 properties the origin drops from ~168k to ~11k credits/month. Edge-side cost is the provider's request pricing on ~168k / 1.68M / 16.8M requests (a free tier covers the 100-property scale; the 10,000-property scale lands in a low single-digit-dollar-per-month tier at current published list pricing — **verify current pricing before committing**).

**Still unknown and required before any pricing promise:** the workspace's credit price in dollars (not documented), Base44 storage/bandwidth pricing (not documented), and whether the edge provider charges egress (assumed not). Two further cost notes: AI content is one-time per content change (~$0.02) and is hash-gated, so it does not scale with traffic; and nothing is duplicated or transcoded, so there is no storage or video-processing cost.

---

# PART 3 — IMPLEMENTATION PLAN (for owner approval; not executed)

## 7. Steps, code changes, DNS, tests, rollback, pilot

**Step 0 — Owner decisions (blocking).** (a) Approve the subdomain; (b) confirm the `BASE44_APP_DOMAIN` secret's current value; (c) authorise a publish of the current build and re-probe `/properties` (distinguishes "stale publish" from "route not registered"); (d) approve the pilot below.

**Step 1 — Property public origin (small code change, no behaviour change while the flag is off).**
`base44/shared/propertyVisibility.ts` only: `publicOrigin()` reads a new **`PROPERTY_PUBLIC_ORIGIN`** variable first, then `BASE44_APP_DOMAIN`, then the base44.app fallback. Publish/unpublish in `managePropertyListing` then writes `public_url`/`canonical_url` from it, so every record, the sitemap and served HTML agree.

**Step 2 — Sitemap scaling fix (small code change).** `base44/functions/generatePropertySitemap/entry.ts` currently reads at most **500** listings (`limit: 500`). Add cursor pagination (or split into a sitemap index) so 1,000+ properties are fully listed, and align it with the `sitemap_included` flag the listing record already maintains.

**Step 3 — Edge worker (new, standalone).** A separate deployable (own directory/repo, not inside the app bundle): `index.js` implementing the six-route contract in §4, plus `wrangler.toml` (or the equivalent), env vars `ORIGIN_BASE`, `PURGE_SECRET`, and a test file. No app code is imported.

**Step 4 — Cache invalidation wiring (small, failure-tolerant).** New `base44/shared/edgeCache.ts` (sign + send a purge request, short timeout, never throws) called from the publish, unpublish, archive, `update_listing_status`, `update_details` and `save_media` paths in `managePropertyListing`. If the edge is unreachable the customer action still succeeds; the TTL backstop covers it.

**Step 5 — DNS.** `CNAME properties → <edge host>`, TLS issued, provider verification record added. Owner/DNS-holder action.

**Step 6 — SEO wiring.** Edge `/robots.txt`; submit `https://properties.arrivestatemedia.com/sitemap.xml` to Google Search Console (owner account — note the `google_search_console` connector exists but is not authorized); optional 301 from the old `app.*/properties/*` paths to the subdomain to avoid duplicate URLs.

**Step 7 — Security tests (must pass before the pilot goes public).** Private/undelivered asset → 404 · draft listing → 404 · certification listing → 404 · unpublished listing → 404 and its media not served from cache after purge · asset id not in the approved selection → 404 · unknown path → 404 (no passthrough) · non-GET/HEAD → 405 · purge without a valid signature → 401 · replayed purge (stale timestamp) → 401 · query-string tampering never reaches an unapproved listing · no Drive or Base44 storage URL appears anywhere in served HTML or headers · unpublish → page and media both stop serving within the TTL window (and immediately after a successful purge) · status change to sold → page reachable but `noindex`.

**Step 8 — SEO tests.** Raw `curl` (no JS) of the canonical URL contains title, meta description, canonical, OG, JSON-LD, `<h1>`, address, photo `<img>`+`alt`, agent and brokerage · JSON-LD validates as `RealEstateListing` · canonical is self-referential and identical in page, sitemap and record · sitemap is valid XML and lists exactly the publicly active listings · non-available listing carries `noindex` · 404s return 404 (not 200) · no duplicate content between old and new URLs.

**Step 9 — Rollback.** Remove the worker route / point the subdomain away → the public surface disappears; the app is untouched. Purge failures degrade to TTL-only expiry. Feature flag off returns every surface to today's fail-closed state (verified live). No data migration is involved, so rollback is URL-level only.

**Step 10 — Pilot procedure (single property, 7 days).**
1. Owner publishes the current build; re-probe `/properties` (resolves Step 0c).
2. Enable `PROPERTY_VISIBILITY_ENABLED` (the flag is **global**, not per-customer — so the pilot is "flag on with exactly one published listing", which is the smallest safe exposure given 0 listings exist today).
3. Publish one real property through the customer flow: select delivered media → approve content → record authorizations → customer approves publication → publish.
4. Verify §7 Step 7 and Step 8 against that one listing, including a deliberate unpublish/re-publish to prove invalidation.
5. Monitor for 7 days: crawler hits vs. cache hits, origin invocation count, 404 rate, inquiry arrival, any stale-content report. Then expand to all properties; only after that, revisit Releases 2 and 3.

**Recommended sequencing note:** Steps 3-6 can be built and validated while the flag is **off** (the edge will faithfully return 404s), which means the entire infrastructure can be proven before a single property becomes public.

## 8. Deferrals confirmed

Meta publishing (Instagram/Facebook) and paid advertising (Meta Ads, custom Google Ads API) remain **deferred** until the crawlable property-page infrastructure is live and verified. No Meta or Google connector was authorized, no ad account was touched, and no publishing code was written. Native Base44 Google Ads remains unusable for this use case (single app-tied, owner-funded account), as established in the Phase 0 audit.

---

*End of post-audit verification. Nothing was deployed, published, activated or created.*