# ARRIV Property Visibility v1.0 — Phase 2 Integration Verification Report

**Status: COMPLETE. Verified and certified. Production still DARK and unchanged — nothing was activated.**

Phase 2 executed the certification the staging plan called for, on synthetic records only, with the
production feature flag never written. Two genuine defects in the certification path itself were found
and repaired; the certification then passed end to end. No production behaviour was changed.

- Production flag `PROPERTY_VISIBILITY_ENABLED` = **`false`**, and its record's own `updated_date`
  (`2026-10-12T04:57:10.306`) is **byte-identical before and after every run** — the flag was not
  written at all, not merely restored.
- Certification run lock: **inactive** at the end of every run (`run_lock_released_after_cleanup`).
- Residue after all runs: **0** certification listings, **0** events, **0** inquiries, **0** sample
  jobs. Property listings total 0 → 0; inquiries 0 → 0.

---

## 1. Defects found and repaired (certification harness only)

### 1.1 The certification path could not authenticate — render, inquiry and ownership assertions were unsatisfiable

`certifyPropertyVisibility` invoked its certification-only endpoint (`certifyPropertyRender`) over a
plain unauthenticated `fetch`. That endpoint authenticates **first**: an unauthenticated caller is
refused **401 before a single record is read**. Every certification-path assertion therefore failed
against the deployed code (this is exactly the failure recorded in the staging plan's execution
results).

**Repair:** the certification path now goes through the request-scoped client, which invokes the
endpoint as the administrator running the suite — the same identity that holds this run's lock, which
is what the endpoint's run-ownership check compares against.

Both alternatives were probed live against the deployed endpoint and both are unusable here:

| Caller for the certification path | Endpoint response |
| --- | --- |
| Unauthenticated `fetch` (previous code) | **401** — refused before reading a record |
| `asServiceRole.functions.invoke` (first repair attempt) | **403** — authorized, but not the lock owner |
| Request-scoped client (final repair) | **200** — the administrator who holds the run's lock |

### 1.2 Two ownership probes could never test what they claimed

The assertion `certification_path_requires_run_ownership_and_synthetic_records` is about *run
ownership* and *synthetic-record validation*. Its two probes were sent unauthenticated, so they could
only ever observe the **401** that precedes both checks — the assertion was unsatisfiable and failed
(observed: `render with a run id that holds no lock → 401; render for a record outside this run → 401`).

**Repair:** both probes now use the same authenticated certification path as every other certification
call, with a run id that holds no lock and with a record outside this run. They now return the intended
**403** for both cases (verified live).

**Nothing else changed.** No API, rendering, publication, media, security or policy code was modified:
the shared policy engine, `managePropertyListing`, `certifyPropertyRender`, the public endpoints, the
edge worker and the frontend are untouched by this phase.

---

## 2. Certification suite — 40 / 40 assertions PASS

Executed against the real shared policy engine and the real deployed function sources, backed by the
real database, on synthetic records only. Final run `cert_prop_1791836353740`: **40 passed / 0 failed**,
41.5 s. (Intermediate runs: 39/40 before the repairs of §1, 40/40 at 115.5 s after them.)

Coverage, by assertion: completed vs incomplete orders · customer ownership · publication
authorization · publication state machine · photo selection, ordering and cover · availability and
stale-status deactivation (45 d hidden, 61 d deactivated, sold never available) · slug/duplicate-key
determinism · RESO projection reserved · cost model (no media duplication) · duplicate-page prevention ·
ownership enforced by the API · media allow-list refuses foreign assets · property details recorded ·
SEO metadata generation and regeneration **only on change** (`ai_calls: 0` on the second call) ·
customer approval of factual content · agent authority, brokerage approval, disclosures · publication
requires explicit consent · full DRAFT→PUBLISHED workflow · publication history and approved snapshots ·
public URL rendering (canonical, structured data, media order) · crawlable HTML (title, meta
description, canonical, JSON-LD) · sitemap inclusion · directory search · buyer inquiry routing ·
inquiry validation and spam prevention · listing-status change removes from active search (page
reachable but not advertised, removed from sitemap) · periodic status confirmation · unpublish removes
public access · private media protection · concurrent customer activity (one page per job) · existing
delivery/download regression · **certification never reaches the production scope** · **public surfaces
refuse synthetic records in every mode** · certification path requires run ownership and synthetic
records · financial system isolation · no synthetic records remain · run lock released · production
feature flag untouched.

Isolation evidence from that run:

- `financial_system_isolation` — deltas **0** for PayrollSubmission, PayrollPeriod, Commission,
  SalesCompensationEvent, PrepaidCompensationEvent, AutoFundSubscription, PrepaidWallet, CreditLot,
  Invoice, PayoutHistory.
- Cleanup — **15** artifacts deleted, **0** remaining across all entities, no sweep errors.
- `production_feature_flag_untouched` — value **and** `updated_date` unchanged.

---

## 3. Deployed-path (live) verification

Each probe ran against production with its own synthetic fixture and a real certification run lock,
both removed afterwards; the run lock was released and residue re-checked at the end.

**Rendering through the deployed certification endpoint** — 200, and the payload carries: canonical
URL on `https://properties.arrivestatemedia.com/properties/<slug>`, `publicly_available: true`,
`indexable: true`, status label "For sale", 4 / 3 / 2,800 details, **3 media in the approved order**,
cover URL, video URL, the agent lockup, publication and confirmation timestamps, the listing
disclosures and the inquiry disclosures. HTML (2,462 bytes) contains `<title>`, meta description,
`rel="canonical"`, Open Graph tags and JSON-LD `RealEstateListing` **with the price**; it carries no
`noindex` for an available listing; every URL is on the public host (`properties.arrivestatemedia.com`)
and **no `app.arrivestatemedia.com` URL appears anywhere in it**.

**Video is excluded unless expressly approved** — with `include_video` false the payload returns 2
media and an empty `video_url`; approval returns 3 media plus the video URL.

**Buyer inquiry, live** — `routed_to_listing_contact: true`; the stored record is
`routed_to_email = <the authorized listing contact>`, `lead_sharing_status = not_shared`,
`status = routed`, `certification_mode = true`, consent recorded, and the IP is stored only as a hash.
The acknowledgement returned to the visitor contains **no listing contact address**. Invalid input →
**400**; honeypot submission → **filtered**.

**Public surfaces refuse the synthetic record (production flag off → fail closed)** —
`getPublicPropertyPage` **404** `feature_disabled` (both plain and with a `test_mode` parameter),
`submitPropertyInquiry` **404** (and no inquiry record was created: inquiry count 0 → 0), and
`streamPropertyMedia` **404** for both an approved file id and another customer's file id.
`generatePropertySitemap` does not contain the synthetic slug and `searchProperties` returns
`feature_disabled` with 0 results.

**Certification endpoint authorisation** — anonymous **401**; unowned run **403**; record outside this
run **403**; the owner's run **200**.

---

## 4. Edge cache invalidation over the application lifecycle

**11 signed purges** were issued and accepted (HTTP **200**) by the live edge worker during the
certification, each scoped to **exactly one listing** — one distinct slug, one distinct listing id,
across all of them — triggered by: `update_details`, `generate_seo`, `approve_content`,
`record_authorizations`, `submit_for_review`, `approve_publication`, `publish`,
`update_listing_status` (×2), `confirm_status`, `unpublish`. Every payload carries the listing's page
keys **and its media/cover file keys**, so a media change invalidates the media cached at the edge, not
just the page.

**Archive** — an administrator archive of a published synthetic listing returned 200, moved
`PUBLISHED → ARCHIVED`, set `archived_at`, cleared `sitemap_included`, and issued **one purge** for that
listing (slug + 3 file ids, HTTP 200). Archive is administrator-authorized; the customer path is
flag-gated, which is why a customer archive is refused while the feature is dark.

**Unrelated listings are never touched** — no purge payload ever carried a listing id or slug other
than the run's own. Cache TTL remains the bounded five minutes with active invalidation per mutation,
and the edge fails closed (kill switch and cache semantics covered by the hermetic suite).

Note on the media-change path specifically: the API-mediated media write inside the certification was
**refused** by the media allow-list (correct — the synthetic job has no delivered folder), so no purge
was due for it. The purge coverage for media is observed both in the shared `update()` path (which
every listed action above exercises) and in the payload evidence above: every purge carries the
listing's media and cover keys.

---

## 5. Edge worker suite — 37 / 37 PASS

`edge/property-edge/worker.test.mjs` is a Node entry point, not an HTTP endpoint, so it was previously
unreachable over the network (the earlier `test:edge` attempt returned "no handler captured"). It has
been executed **against the real worker file** — 37/37 in ~30 ms, hermetic (stubbed origin and cache;
no network, no database, no Cloudflare account) — and is now registered as `npm run test:edge`, which
reports `37/37 passed`. It covers canonical serving, host rewriting, the compatibility path, cache
sharing between page paths, HEAD, `noindex` propagation, sitemap, robots directives, origin-call
batching, media TTLs, origin refusal becoming an uncached 404, slug and media-alias validation,
credential bypass and non-forwarding, outage as 503 (never a 404), content-type pass-through, method
refusal, the kill switch, and signed purge (add/remove/verify, alias keys, bad signature, replay).

---

## 6. Limitations and what is still outstanding

- **AI SEO generation**: the suite asserts the generation, the stored draft and that regeneration is
  skipped when nothing relevant changed (`ai_calls: 0`). The exact provider wording is not
  reproducible run to run, and is not asserted.
- **Agent inquiry notification delivery**: routing and the stored record are asserted. Delivery of the
  notification to a *non-app-user* agent address remains the deferred item it was in the plan
  (`notification_status: pending_agent_delivery`) — unchanged by this phase.
- **Directory and sitemap scope** were verified on the disabled path (the feature is dark). The suite is
  built to be run again with the flag on; the absolute block on synthetic records is asserted in both
  scopes regardless.
- **Public cache TTL invalidation** is verified by signed purge (§4) and by the hermetic edge suite;
  live cache-hit behaviour on the production hostname remains gated on the production edge deployment.
- **Guard suite**: `testPropertyCertificationGuards` was invoked once live and aborted mid-flight by
  the caller's timeout, leaving its run lock held until it expired on its own bounded lifetime (final
  state: inactive). Its guard logic is covered by its hermetic suite; its live probes were re-confirmed
  directly in this phase (anonymous **401**, unowned run **403**, foreign record **403**).

**Before activation (unchanged from Phase 1, none of it done here):** the owner's decision on the
production edge hostname/route for `properties.arrivestatemedia.com`, the Cloudflare production
deployment, `test:edge` passing on the deployed configuration, and explicit owner approval to flip
`PROPERTY_VISIBILITY_ENABLED`. The flag remains `false`.

---

## 7. Unrelated observation

The platform surfaced two pre-existing workflow-validation failures while this phase ran:
`September 1 Async Interview Conversion` (one-time date in the past) and `Support Session Expiry
(1min)` (interval below the five-minute minimum). Neither is related to Property Visibility; no
workflow was modified. They are recorded here because they will keep failing validation until the
dates/intervals are corrected.