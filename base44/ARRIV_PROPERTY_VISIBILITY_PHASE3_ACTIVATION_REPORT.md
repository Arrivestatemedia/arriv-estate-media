# ARRIV Property Visibility v1.0 — Phase 3 Production Activation Report

**STATUS: LIVE WITH CUSTOMER APPROVAL PENDING.**

`PROPERTY_VISIBILITY_ENABLED` = **`true`** (set 2026-10-12T21:25:34Z, from `false`). The public
property layer, the customer-facing builder and the directory are live. Laurinda Massey's listing is
prepared and **unpublished**, because publication approval belongs to her and has not been given.

---

## 1. What was activated, and what activation did not do

| Item | Result |
| --- | --- |
| `PROPERTY_VISIBILITY_ENABLED` | `false` → `true`, persisted (re-read), row `6acc661fb7a0d5ae19bb5bdc` |
| Existing properties auto-published | **No.** 0 published listings before and after activation; publication still requires the customer's explicit consent |
| Synthetic certification records exposed | **No.** 0 certification records exist; the absolute block on synthetic records is asserted with the flag live (certification suite, below) |
| Customer entry point | Live: the delivery gallery (`ClientJobGallery`) shows *Create Your Free Property Page* for every eligible delivered order, and the builder route is registered |
| Directory (`searchProperties`) | Live: `ok: true`, `total: 0` (no published listings yet) |
| Public page | Live: any unpublished or unknown slug returns `404` (origin and edge) |
| Other Arriv systems | Untouched. Only one AppSetting row, one draft listing and its two audit events were written. Delivery gallery, bookings, invoicing and payouts verified unaffected |

**Certification re-run with the feature LIVE: 40 / 40 assertions passed** (run
`cert_prop_1791840479755`, 31.5 s), including financial isolation (deltas 0 across PayrollSubmission,
PayrollPeriod, Commission, SalesCompensationEvent, PrepaidCompensationEvent, AutoFundSubscription,
PrepaidWallet, CreditLot, Invoice, PayoutHistory), 15 certification artifacts cleaned with 0
remaining, and the run lock released. 11 signed cache purges were issued over the publication
lifecycle, all answered `200` by the deployed edge.

---

## 2. Deployed Cloudflare verification (the deployed worker, not the repository)

Verified against the running endpoint:

| Check | Result |
| --- | --- |
| `/__health` (property host **and** workers.dev) | `200` `{ok:true, disabled:false, purge_secret_configured:true, ttl_seconds:{html:300,media:300,sitemap:900,not_found:60}}` |
| Emergency switch | `disabled: false` (live). `POST /__purge` stays reachable while dark — verified (`401` unsigned) |
| `/robots.txt` | `200`, `Allow: /`, `Disallow: /functions/`, `/__purge`, `/__health`, `Sitemap: https://properties.arrivestatemedia.com/sitemap.xml` |
| `/sitemap.xml` | `200`, valid XML, empty (no published listings) — and it does **not** contain the unpublished draft |
| Page route `/properties/<slug>` | Routed; unpublished/unknown → the edge's own `404` (never cached as content) |
| Media routes `/functions/streamPropertyMedia` and `/media/<listing>/<file>` | Routed to the gated origin endpoint; a file outside the approved selection → `404` |
| Non-GET content requests | `405` at the edge |
| Signed purge | `200` `{ok:true, requested:5, purged:[…], verified:true, remaining:[]}`, issued to the app's configured endpoint **and** directly to the property host — both reach the same cache |
| Canonical URLs | Emitted by the origin on `properties.arrivestatemedia.com` (`PROPERTY_PUBLIC_ORIGIN` set); no `app.` URL appears in a rendered page |
| Existing Squarespace site, other DNS | Untouched — no DNS or nameserver change was made in this phase |

**One configuration difference, analysed rather than assumed.** The deployed worker reports
`PUBLIC_HOST` unset (so it falls back to the app host, `origin_host == host ==
arrivestatemedia.base44.app`) even though `wrangler.toml` intends
`PUBLIC_HOST = "properties.arrivestatemedia.com"`. Its effect was measured, not inferred:

* **Cache keys** are namespaced on the app host (`purged: ["https://arrivestatemedia.base44.app/sitemap.xml"]`), and the app's purge
  endpoint targets that same worker — so serving and invalidation are self-consistent and purge is
  verified effective on the property host (`verified: true`, then a follow-up read shows `MISS`).
* **Host rewriting** (`normaliseHosts`) is a no-op because origin and public host are equal — which is
  harmless only because the origin already emits property-domain URLs, and it does (verified above).

Conclusion: **functionally safe for activation** — public URL correctness, media security, cache
invalidation and availability all verified live. Recommendation for the next deploy (needs Cloudflare
credentials this workspace does not hold): set `PUBLIC_HOST=properties.arrivestatemedia.com` so the
rewrite becomes a real safety net and cache keys are namespaced where an operator expects them, and
keep `ORIGIN_BASE` on the app origin, which is the host that serves the functions.

---

## 3. Defects found in this phase and repaired

**a. Certification scope was suppressed once the feature was live.** `resolveFeatureGate` returned the
production scope whenever the flag was on, so a certification request (`test_mode: true`) was promoted
into the production scope: the suite's synthetic records fell out of scope, the certification-only
endpoint refused them (6 assertions failed with `403`), and the suite briefly created
non-certification records instead of reusing its own synthetic ones. Repaired: certification scope is
now resolved **first and independently of the production flag**, so the flag can never promote a
certification request into production, and the suite is valid before *and* after activation. The
earlier run's records were removed by its own teardown and independently verified afterwards: 1
listing total (Laurinda's), 0 certification residue, 0 stray certification events, 0 stray
certification inquiries, 0 sample jobs. A live production request still cannot enter test mode because
the certification configuration is absent from the deployed app (verified).

**b. The suite asserted the wrong thing with the flag on.** Its production-scope check expected `200`
for a synthetic page once the feature was live — the opposite of the absolute block. Repaired to
assert refusal in both scopes, and (when the feature is live) that the directory is legitimately
enabled and simply never contains the synthetic listing.

**c. The public property page was a bare document with no way to inquire.** It carried correct SEO
markup but no presentation, no listing contact and no inquiry form — so the page a visitor lands on
from a search result could not convert. It is now a finished, brand-consistent, mobile-first page:
headline, address, approved facts (price/beds/baths/square footage/type/status), the approved media in
the customer's order, cover image, optional video, listing contact, disclosures, and an inquiry form
with consent, a honeypot and the privacy disclosures. The form posts to the public inquiry endpoint on
the app host (the edge proxies GET only), which was verified CORS-open for exactly that origin; the
endpoint validates, screens, rate-limits and routes every inquiry only to the listing's own authorized
contact. A sold or unavailable listing renders with `noindex` and no form. HTML escaping was verified
against an injected `<script>` payload.

---

## 4. Laurinda Massey — 9809 Dellcastle Rd, Gaithersburg, MD 20886

| Field | Value |
| --- | --- |
| Listing ID | `prop_mv5rhct71qm7dp` |
| Slug / canonical URL | `9809-dellcastle-rd-gaithersburg-md-mv5rhct7` · `https://properties.arrivestatemedia.com/properties/9809-dellcastle-rd-gaithersburg-md-mv5rhct7` |
| Publication state | **DRAFT — unpublished** (not publicly reachable, not in the directory, not in the sitemap) |
| Ownership | `client_email` = laurindamassey@outlook.com, from job `6ab566748823adf58133d4ac` ("Photography - 9809 DellCastle Rd., Gaithersburg, MD"), booking `6ab565946a843d431d3babf1` |
| Delivered media | 48 delivered photographs, no video (`getJobMediaForClient` 200; media partner fulfilment completed) |
| Verified facts recorded | Address `9809 Dellcastle Rd`, Gaithersburg, MD **20886**, square footage **2,802** — ZIP and square footage both verified through the property-data provider (Trulia-sourced, `property_sqft_verified: true`), not inferred |
| Deliberately left empty | Price, bedrooms, bathrooms, property type, description, media selection, listing contact, authority, brokerage approval, disclosures, content approval, publication consent |
| Audit trail | `listing_created` and `details_updated`, both recorded as administrator actions in `PropertyListingEvent` |

**Nothing was published, approved or impersonated.** Verified live with the feature on: an admin
attempt at `approve_publication` → `403 CUSTOMER_APPROVAL_REQUIRED`; an admin attempt at `publish` →
`403`; a stranger's email attempting to edit her listing → `403` and the address unchanged; her state
after all attempts → `DRAFT`, no approver, no consent, no `published_at`.

**What she must do (all of it, in the builder, signed in as herself).** Publication prerequisites the
API enforces: `approved_content`, `media`, `cover`, `agent_authority`, `brokerage_approval`,
`disclosures`, `listing_contact`, `seo_metadata`, then explicit consent. Concretely: select media from
her 48 delivered photos → enter price/beds/baths/type/description → generate and approve the page
content → record listing contact + authority + brokerage approval + disclosures → submit for review →
tick the consent box and press *Approve and publish*.

**One prerequisite is outside her control:** she has no app account. She exists only as a
`PendingSignup` (status `pending`, created 2026-10-01) — her signup was never completed, and this is
the only reason she cannot review the page today. No account was created and no email was sent to her
in this phase; completing or re-sending that invite is a manual action for Arriv.

---

## 5. Live production verification

| # | Check | Result |
| --- | --- | --- |
| 1 | Feature flag enabled | **PASS** — `true`, persisted, re-read |
| 2 | Public property domain responds | **PASS** — `/__health` 200, `/robots.txt` 200, `/sitemap.xml` 200 |
| 3 | Eligible customers can reach listing management | **PASS** — `get_context` for her job with her email: `feature_enabled: true`, `eligible: true`; gallery prompt wired in `ClientJobGallery`; builder route live |
| 4 | Publication still requires explicit customer authorization | **PASS** — admin `approve_publication` → 403; admin `publish` → 403; no consent recorded |
| 5 | Approved public pages render correctly | **PASS (certified) / PENDING (live)** — the renderer is exercised 40/40 by certification and verified by construction; no real page renders publicly until she publishes |
| 6 | Approved media loads | **PASS (certified) / PENDING (live)** — media URLs resolve to the property host; a non-approved file → 404 |
| 7 | Unauthorized media remains inaccessible | **PASS** — non-selected file 404, unpublished listing's media 404, credentials bypass the edge cache |
| 8 | Public inquiries route to the correct authorized contact | **PASS (certified) / PENDING (live)** — routing asserted against the real engine; unavailable listings refuse (her draft: `404 LISTING_NOT_AVAILABLE`) |
| 9 | Unpublished properties cannot be accessed publicly | **PASS** — 404 on the edge and the origin, absent from directory and sitemap |
| 10 | Cache invalidation functional | **PASS** — 11 lifecycle purges all 200; signed purge with `verify: true` on the property host |
| 11 | Sitemap and robots correct | **PASS** — robots allows crawling, sitemap lists only eligible published listings (currently none) |
| 12 | Mobile presentation and basic accessibility | **PASS (by construction)** — viewport meta, fluid grid, labelled inputs, alt text, contrast-checked palette, semantic `main`/`h1`/`address` |
| 13 | Existing Arriv workflows operational | **PASS** — delivery gallery 200, booking and invoice records intact, payouts intact, financial isolation asserted (deltas 0) |

---

## 6. SEO verification (individual property pages)

Present and verified in the rendered page: unique customer-approved `<title>`, unique meta
description, canonical URL on the property domain, crawlable server-rendered HTML (no JavaScript
needed to read the content), Open Graph tags for sharing, JSON-LD `RealEstateListing` with
`PostalAddress` (street, locality, region, postal code, country), `Offer` price when authorized,
`additionalProperty` for beds/baths/square footage and a `RealEstateAgent` when named, lazy-loaded
responsive images with approved alt text, `noindex` only for unavailable listings, sitemap inclusion
only for published and currently-available listings, and no fabricated facts (every field is either
customer-supplied, provider-verified or absent).

Search Console is **not** connected (no connector is authorized). Manual steps: verify
`properties.arrivestatemedia.com` in Google Search Console, then submit
`https://properties.arrivestatemedia.com/sitemap.xml`. No indexing, placement or ranking is claimed —
none has been measured.

---

## 7. Geographic discovery: what is live, and what is not

**Operational now:** address/city/state/ZIP text search, price range, minimum beds/baths, property
type and status filters (`searchProperties`); the directory page at
`app.arrivestatemedia.com/properties`; crawlable individual listing pages on the property host;
an XML sitemap; `robots.txt` allowing crawling.

**Not built, deliberately:** crawlable city/ZIP/neighbourhood landing pages and a crawlable directory
on the property host. With one prepared (unpublished) listing, any such page would be empty or thin,
which is exactly what the brief forbids. The edge worker has no `/properties` index route, so even the
existing directory is not served on the property host — that needs a Cloudflare deploy.

**Longer-term competitive opportunities (separate from this launch):** a worker route serving a
crawlable directory and city/ZIP landing pages backed by real inventory; neighbourhood and
school-district pages only where verifiable; saved-search and alert pages; IndexNow/Bing ping on
publish; richer structured data (FAQ, video, virtual tour); agent and brokerage profile pages; and
MLS/IDX integration only with explicit authorization. Ranking against Zillow/Realtor/Redfin is not
claimed and will require measured search performance.

---

## 8. Monitoring and rollback

**Controls confirmed functional:** feature-flag disable (writable, verified); signed cache invalidation
with verification; the edge kill switch (`PROPERTY_EDGE_DISABLED`, reachable and currently `false`);
fail-closed access control (unknown paths 404, origin outage 503 never 404, authenticated responses
never cached); publication audit history (`PropertyListingEvent`, append-only); certification cleanup
(sweep verified, 0 residue); error logging (worker logs purge failures; the app's Logs explorer covers
function errors).

**Minimal rollback procedure**

1. *One listing, immediately:* an administrator archives it (state change plus signed purge), or the
   customer unpublishes it. Its public URL and every media asset are invalidated at the same moment.
2. *The whole feature:* set `PROPERTY_VISIBILITY_ENABLED` to `false`. Every customer surface refuses
   immediately and the public gate refuses first; pages already cached at the edge are bounded by the
   300-second TTL, and a signed purge clears them at once.
3. *The edge layer itself:* an operator holding Cloudflare credentials sets
   `PROPERTY_EDGE_DISABLED=true` (or rolls the worker back). Not possible from this workspace.
4. Nothing is deleted by a rollback: listings keep their history and media stays in the customer's own
   Drive folder.

---

## 9. Mandatory manual actions and honest limitations

**Manual actions**
1. Complete or re-send Laurinda's account setup (her `PendingSignup` from 2026-10-01 is still
   `pending`); she then reviews and completes her page and gives consent.
2. Verify the property domain in Search Console and submit the sitemap.
3. On the next edge deploy, set `PUBLIC_HOST=properties.arrivestatemedia.com` (see §2).

**Limitations stated plainly**
* No customer listing is public yet, so a real `200` page served through the edge, a real media load and
  a real inquiry on a live listing are **pending her consent**. Those paths are certified (40/40) and
  the fail-closed behaviour is verified live.
* The public page is verified by construction and by the certification renderer; it has not been seen
  rendered in a browser against a live listing.
* **Customer identity is email-based, app-wide.** This app's clients are not platform accounts yet:
  the delivery gallery, account settings and the builder all identify a client by the email supplied
  with the request. That means publication approval is bound to the customer's email rather than to a
  verified session — so an attacker who knew a customer's email and listing id could in principle
  record an approval. Nothing was approved here and no listing is published, but the recommended
  hardening before scaling is to provision client app accounts (the invite flow already exists) and
  then require a verified session — not a supplied email — for `approve_publication` and `publish`.
  This is a pre-existing app-wide identity model, not something Property Visibility introduced.
* No Google indexing, ranking or search placement is claimed; none has been measured.