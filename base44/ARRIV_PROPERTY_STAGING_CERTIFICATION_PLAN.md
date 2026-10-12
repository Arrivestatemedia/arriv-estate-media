# ARRIV PROPERTY VISIBILITY — STAGING CERTIFICATION PLAN (PHASE 2)

**Date:** 2026-10-12 · When written: read-only planning, nothing executed. **Since then: executed once — see
§11** (the outcome, and the one decision it needs).

§1–§10 are the plan as approved and are left unedited as the record of what was authorised.

State confirmed by inspection this turn (not assumed):

| Fact | Value |
|---|---|
| Property listing records | 0 (certification 0, published 0) |
| Publication events / inquiries | 0 / 0 |
| `PROPERTY_VISIBILITY_ENABLED` | `false` — and the setting record's `updated_date` is available as an untouched-baseline |
| `PROPERTY_VISIBILITY_TEST_MODE` | not configured |
| Edge staging worker | live at `arriv-property-staging.bradcburke.workers.dev`, health OK, kill switch off |
| Edge purge credentials | set app-side (`PROPERTY_EDGE_PURGE_URL`, `PROPERTY_EDGE_PURGE_SECRET`) — transport never exercised |
| `PROPERTY_PUBLIC_ORIGIN` | not configured |
| Certification suite | `certifyPropertyVisibility` — 38 assertions, self-provisioning, self-cleaning, admin-visible |

---

## 1. Exact configuration for an isolated synthetic run, with the public surface still off

**Exactly one configuration change is required, and it is temporary:**

| Setting | Value during the run | Where | Reverted |
|---|---|---|---|
| `PROPERTY_VISIBILITY_TEST_MODE` | `"true"` | app environment variable (Secrets page) | **immediately after the run** |

Nothing else changes: `PROPERTY_VISIBILITY_ENABLED` stays `false`, no `AppSetting` row is written, no secret value changes, no DNS, no edge redeploy, and `PROPERTY_PUBLIC_ORIGIN` stays unset.

Why that is sufficient — the gate requires **all three** conditions, so it cannot reach production traffic:

1. the environment variable is exactly `"true"` (deliberately absent in production);
2. the individual request opts in explicitly with `test_mode: true` (production traffic never sends it);
3. every record in play is a certification record (`certification_mode === true`) — enforced in **both** directions: `certificationScope(testMode)` yields `true` in test mode and `{$ne: true}` in production, and `recordInScope()` rejects a record that belongs to the other scope.

**How the run is invoked:** `certifyPropertyVisibility` is invoked directly as an admin (no workflow or orchestrator triggers it — inspected). Note a real finding: the guard rejects an authenticated *non-admin* but **not an anonymous caller** (`if (user && user.role !== "admin")` — a null user passes). Recommend an admin gate or run-token before this phase runs; see §6 risk and checkpoint 1.

**Inputs the run creates and removes itself:** one synthetic `Job`, one `PropertyListing` (plus events), one `PropertyInquiry`, synthetic `@cert.test` identities. Exactly **one** AI content generation (the suite asserts the second call is cached, `ai_calls: 0`).

**Run window and exit criteria:** ~1–2 minutes. The run passes only when `failed: 0` **and** `cleanup.error` is absent **and** `financial_system_isolation`, `no_production_property_records_touched` (count before = count after, leftovers = 0) and `production_feature_flag_untouched` (value **and** `updated_date`) all pass — 38 assertions total.

## 2. Does the framework already support unpublished → published → unpublished synthetic listings without public exposure?

**Yes — supported today, and safe by construction rather than by convention.** Four independent mechanisms each block exposure on its own:

1. **`recordInScope()`** — the public page and media endpoints 404 any record outside the acting scope, so a certification listing is invisible to ordinary visitors and a real listing is invisible in test mode.
2. **`isPubliclyReachable()`** — `certification_mode !== true` is part of the definition, so **even a PUBLISHED synthetic listing can never be resolved publicly**, in any flag state.
3. **`isPubliclyActive()`** — likewise excludes certification records, so a synthetic listing can never be advertised as available in the directory or sitemap.
4. **Query scoping** — the directory and sitemap filter on `certification_mode: {$ne: true}` in production scope.

The suite already walks the full lifecycle: DRAFT → duplicate-prevention → media rules → details → SEO → content approval → authority/brokerage/disclosures → submit for review → consent-gated publication approval → PUBLISHED → public rendering (test mode) → sitemap → directory → inquiry routing → sold-status change → status confirmation → **UNPUBLISHED** → post-unpublish refusal. It closes with two isolation proofs: the same slug 404s with no test mode while serving with test mode (`certification_scope_is_disjoint`), and the production scope never exposes it (`certification_never_reaches_production_scope`).

**Honest limits of that support** (they shape §7):

- "PUBLISHED" here means the real state machine and the real rendering path served **in test mode**; there is never a publicly resolvable URL, and the slug appears in no production sitemap or directory.
- The suite reaches the **origin** functions, not the Cloudflare edge — the edge intentionally never forwards `test_mode`, so no synthetic listing can be served, cached or media-streamed through the edge.
- Media asserts are seeding + refusal, not streaming: the synthetic job has no Drive folder, so the approved-selection path is asserted by the origin (`streamPropertyMedia` must refuse), while ordering/cover/rejection rules are asserted against the shared engine.
- `update_listing_status` in the run happens under test mode only.

## 3. Correct staging canonical / public-origin configuration (nothing modified)

Two findings from comparing the committed config with the live worker:

1. **Config drift.** The committed staging block sets `ORIGIN_BASE = https://app.arrivestatemedia.com` and `PUBLIC_HOST = arriv-property-edge-staging.workers.dev`, but the deployed worker reports both `host` and `origin_host` as **`arrivestatemedia.base44.app`** and answers on `arriv-property-staging.bradcburke.workers.dev`. The deployment therefore did not come from `wrangler deploy --env staging`, and the live staging worker currently emits canonical/sitemap/media URLs pointing at the **production app host**.
2. **Correct staging target.**
   - `ORIGIN_BASE` = `https://arrivestatemedia.base44.app` — the origin confirmed live by direct invocation. Do **not** use `app.arrivestatemedia.com` unless it is confirmed to serve these functions; that is a checkpoint question, not an assumption.
   - `PUBLIC_HOST` = the worker's own staging address, so canonical links, sitemap entries and media URLs served by staging point at staging and are self-consistent.
   - Apply by correcting `[env.staging.vars]` and redeploying with `wrangler deploy --env staging`. No route, no custom domain, no DNS.

**`PROPERTY_PUBLIC_ORIGIN` stays unset for staging.** It is a single global variable read by the origin functions, and the edge already rewrites the origin host to `PUBLIC_HOST`; setting it now would either inject a staging host into every listing's canonical output (including future production listings) or pre-empt a hostname decision that hasn't been made. It becomes a one-line activation step: set it to the production public host at activation, not before.

## 4. How the signed cache-invalidation round trip will be tested

Two halves, deliberately separated, so the eviction proof never depends on private content.

**(a) Transport, acceptance and verification contract on the real edge — no listing involved.**

1. `GET /sitemap.xml` through the staging edge → warms exactly **one** key, a public non-sensitive one that is currently empty.
2. `POST /__purge`, signed HMAC over `timestamp.body` with the app's existing secret, for a **reserved synthetic slug** plus synthetic listing id and synthetic file ids, with `verify: true`.
3. Assert: `200`, `ok: true`, `verified: true`, `remaining: []`, `requested >= 3` (both page paths + the sitemap), and that `purged` **includes the sitemap key** — that is what makes it a real eviction rather than a no-op.
4. Assert the next `GET /sitemap.xml` is an edge `MISS` (revalidated at the origin) → the deletion took effect.
5. Negative cases: unsigned, wrong secret, and a timestamp older than the 300 s window → `401`; correctly signed malformed JSON → `400`.
6. Assert no response body contains a listing id, address, email, Drive file id, or any secret, and that `/__health` still exposes no secret value.

*Safety:* the only warm key is the already-public sitemap; the identifiers are reserved and reference no record; nothing is created; no state outside the edge cache changes.

**(b) App → edge wiring from a real mutation.** The certification run's own listing mutations call the purge client, so the run exercises signature building, transport, timeout handling and acceptance end to end. Because the edge can never serve a synthetic listing (it never sends `test_mode`), that listing's keys were never warm — `purged` will be empty and `verified: true`. What this half proves is **transport, signature and acceptance**; what half (a) proves is **eviction**; what the hermetic unit tests prove is the **failure path** (verification reporting `ok: false` when a key survives) plus purge→revalidation, single-flight, kill switch and credentialed-bypass behaviour.

No private data ever enters a purge payload beyond synthetic identifiers.

## 5. Test definitions for the five requested areas

| Area | Already covered (38-assertion suite) | Recommended additions (cheap, in-run) | Cannot be done yet |
|---|---|---|---|
| Publication authorization | `publication_authorization` (customer yes / admin no), `publication_requires_explicit_consent` → `CONSENT_REQUIRED`, `ownership_enforced_by_api` (stranger refused), `publication_state_machine` (illegal transitions rejected), `publishing_workflow_draft_to_published`, `publication_history_recorded` | anonymous `approve_publication` attempt; `publish` while merely APPROVED-without-consent-record; `publish` an ARCHIVED listing; admin `publish` attempt must be refused | — |
| Private media protection | `private_media_access_protection` (unpublished asset → 404; file outside the approved selection → 404), `media_allowlist_refuses_foreign_assets` (outside the delivered folder → `MEDIA_SELECTION_REQUIRED`), `existing_delivery_regression` (gallery stranger 403 / owner 200, download stranger 403), engine rules for ordering/rejection/counts | a photo excluded from the selection → 404; the selection re-probed while UNPUBLISHED → 404; wrong listing id → 404; assert no Drive URL appears in any public response and no media URL appears in any production-scope response | successful streaming of synthetic media (no Drive folder — deliberately) |
| Cache invalidation | 12 hermetic edge tests (purge targets both page paths + sitemap + media + alias, verification succeeds, and **verification fails when a key survives**, 401s, kill switch, credentialed bypass, single-flight, origin outage) | real-edge round trip §4(a); assert the run's mutations produced an accepted purge (§4(b)) | eviction of a *listing's* page/media keys — needs a real published listing |
| Sitemap changes | `sitemap_inclusion` (published appears in the test-mode sitemap), `listing_status_change_removes_from_active_search`, `unpublish_removes_public_access` | production-scope sitemap must not contain the synthetic slug (currently asserted only for the directory); test-mode sitemap contains the run's listing and no production entry; `sitemap_included` false after unpublish | real multi-listing sitemap rendering |
| Immediate refusal after unpublishing | `unpublish_removes_public_access` — public page 404 **and** directory exclusion in the same run; `private_media_access_protection` re-probes media post-unpublish; `listing_status_change_removes_from_active_search` (sold) | re-request the same slug in production scope after unpublish (must 404); re-publish returns to served; assert the unpublish requested a purge for that slug | **edge**-level refusal after unpublish — the bound today is the 300 s TTL plus the purge, and the definitive test needs a real listing |

## 6. Identification, isolation and complete cleanup of synthetic records

**Identification** — by marker, not by id prefix (important: the generated listing id is an ordinary `prop_…` id):

- `certification_mode === true` (set at creation because the request is in test mode);
- `certification_run_id` = `cert_prop_<timestamp>` (written at creation **and** re-stamped immediately after, so an interrupted run remains identifiable);
- synthetic identities: `client_email = <run>@cert.test`, agent `<run>.agent@cert.test`, job marker `<run>_job`.

**Isolation** — four layers, each independently sufficient: the three-condition gate; disjoint scope filters; `isPubliclyReachable`/`isPubliclyActive` excluding certification records (so no public URL, no directory entry, no sitemap entry, no media stream in any flag state); and admin-only row-level security on the listing, event and inquiry entities (app users cannot read them at all).

**Cleanup** — the suite deletes in a `finally` block through four strategies (run marker sweep → created-id sweep → synthetic client email → synthetic job/emails/job record), then proves it: leftover count for the run must be 0, total property listings before = after, and the flag's value and `updated_date` unchanged.

**Gap found (needs a decision, not a silent fix):** the generic stale-run sweeper `sweepStaleCertRuns` / `cleanupCertRun` used by `reconcileCertificationFixtures` covers Auto-Fund, wallet, commission, contact and queue entities but **does not include `PropertyListing`, `PropertyListingEvent` or `PropertyInquiry`** (verified: zero references). If a property run is interrupted before its own cleanup, the leftovers persist — invisible to the public and to app users, but present. Mitigation options at checkpoint 4: (i) add the three property entities to the sweep list (small code change, needs approval), or (ii) accept and rely on the next run's marker sweep plus a manual `certification_mode: true` query after any interrupted run.

**Residual risk while the run is in flight:** a synthetic listing is PUBLISHED in test mode for a short window. It is never publicly reachable, but it is reachable by anyone who knows the slug *and* passes `test_mode` *and* only while the certification variable exists. That is the reason for the admin-gating recommendation in §1.

## 7. Tests that cannot be performed without a public endpoint — and safer alternatives

| Cannot be done safely now | Why | Safer alternative |
|---|---|---|
| Edge page render, edge media stream, edge cache HIT/MISS and edge-level eviction for a *listing* | The edge deliberately never forwards `test_mode`; with the flag off the origin 404s everything, so the edge has no cacheable listing content | Real-edge round trip on the shared public sitemap key (§4a); hermetic edge suite (cache HIT, single-flight, purge→revalidation, kill switch, credentialed bypass, outage); origin-side refusal proofs in test mode |
| Proving a listing's keys are evicted immediately on unpublish, through Cloudflare | Requires a warm listing key, i.e. a publicly served listing | Same as above, plus TTL arithmetic as the worst case: unpublish worst case exposure = 300 s even if a purge is lost, and the purge request for that slug is asserted |
| A stranger hitting the synthetic listing's "public URL" | There is no publicly resolvable URL for a synthetic listing — by design | Already proven: the same slug 404s with no test mode while serving in test mode (`certification_scope_is_disjoint`) |
| Cache-eviction *failure* path on real Cloudflare (a key surviving delete) | Not simulable without a stuck store or test hook | Hermetic test `purge_reports_verification_failure_when_a_key_survives` |
| Directory/sitemap behaviour at multi-listing scale | Needs ≥2 published real listings | Defer to the controlled pilot (one listing, then a second), not to this phase |

## 8. Execution plan (ordered, each step gated)

| # | Step | Proves | Gate |
|---|---|---|---|
| 1 | Correct `[env.staging.vars]` (`PUBLIC_HOST` = staging address, `ORIGIN_BASE` = confirmed origin) and redeploy `--env staging` | Staging is self-consistent and emits no production hostname | **CP2** |
| 2 | Re-run the edge read-only checks: `/__health`, reserved-slug 404 on both page paths, media 404, robots, sitemap | Health, refusal, no content leakage | CP2 |
| 3 | Signed purge round trip §4(a), including the three 401 negatives and the post-purge MISS | Immediate invalidation verified on real infrastructure, with zero private data | **CP3** |
| 4 | Set `PROPERTY_VISIBILITY_TEST_MODE = true` (and, if approved, the admin gate) | Test mode existence only; flag untouched, customer surface still dark | **CP1** |
| 5 | Run `certifyPropertyVisibility` once | 38 assertions: authorization, media protection, lifecycle, sitemap, directory, inquiry routing, isolation, financial isolation | CP1 |
| 6 | Read the report: `failed: 0`, `cleanup.error` absent, leftovers 0, financial deltas all 0, flag untouched | The run actually executed and left nothing behind | **CP5** |
| 7 | **Remove** `PROPERTY_VISIBILITY_TEST_MODE` | Test mode no longer reachable | CP5 |
| 8 | Confirm zero records again (`certification_mode: true` → 0) and that the flag still reads `false` with an unchanged `updated_date` | Post-run cleanliness, independently of the suite's own report | CP5 |

Activation (public hostname, `PROPERTY_PUBLIC_ORIGIN`, enabling the flag, first real listing, 7-day observation) is **not part of this phase** and requires its own approval.

## 9. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Certification variable left set after the run | Low–moderate | Remove immediately (step 7); it still cannot reach real listings or enable the customer surface; verify test mode is unreachable afterwards |
| Anonymous invocation of the suite (auth guard lets a null user through) | Moderate (record churn, AI credit, purge traffic) | **Recommended fix at CP1**: require an admin identity or a run token. Not implemented — a code change outside this read-only phase |
| Interrupted run leaves a synthetic listing | Low (never publicly reachable; admin-only RLS) | Run-marker sweep on the next run; verify step 8; optionally close the sweeper gap at **CP4** |
| Staging worker emits production hostnames in canonical/SEO output | Low for 404 checks, material for HTML/SEO verification | Step 1 (CP2) |
| One AI generation per run, plus purge POSTs to the staging edge | Trivial, and bounded | Already asserted (`seo_regenerated_only_on_change`); purge calls are signature-verified and touch only cache keys |
| Any financial, booking, delivery or customer write | Very low by design | The suite touches only property entities plus its own synthetic job, and measures 10 financial entities before/after asserting zero delta — this check is part of the pass criteria |

**Explicitly not performed in this planning turn:** no records created or deleted, no feature flag or `AppSetting` change, no secret or environment-variable change, no DNS or route change, no deployment, no purge POST, no listing published, no financial, booking, delivery or customer system touched.

## 10. Approval checkpoints

- **CP1 — before the run:** approve setting `PROPERTY_VISIBILITY_TEST_MODE=true` for the run window; decide on the admin-gating fix (recommended); confirm `PROPERTY_VISIBILITY_ENABLED` stays `false` and no customer sees anything.
- **CP2 — staging config:** approve correcting the staging worker's `PUBLIC_HOST`/`ORIGIN_BASE` and redeploying `--env staging`; confirm which origin host is authoritative (`arrivestatemedia.base44.app` is confirmed live; `app.arrivestatemedia.com` is the committed value and needs confirmation).
- **CP3 — purge round trip:** approve the first signed POST to the invalidation endpoint (edge cache only, no records).
- **CP4 — sweeper hardening:** approve adding the three property entities to the stale-run sweeper, or accept the manual post-run check.
- **CP5 — post-run acceptance:** accept the report, then remove the certification variable and re-confirm zero records and the untouched flag.
- **CP6 — activation (separate phase, not requested here):** public hostname + `PROPERTY_PUBLIC_ORIGIN` + enable the flag + one real listing + 7-day observation.

---

## 11. Execution record — controlled staging run, 2026-10-12 (NOT ACCEPTED)

Executed once as approved, then a second identical run to recover the failure list (the first response was
truncated at 8.8 KB, before the failures; the failure list now prints first so it cannot be hidden again).

| Run | Assertions | Result |
|---|---|---|
| `cert_prop_1791823036469` | 38 | 32 passed / 6 failed |
| `cert_prop_1791823156837` | 38 | 31 passed / 7 failed — names captured |

**Held in both runs:** feature flag `false` before and after, that record's `updated_date` untouched; all
10 financial deltas `0`; run lock taken and released; the sweep deleted 13 artefacts with 0 remaining; an
independent read afterwards found **0 listings, 0 events, 0 inquiries, 0 synthetic jobs**. Requirement 4
holds: the production-scope checks never saw the synthetic listing.

**Run 2's seven failures** — 1–6 are one root cause, 7 is a read-consistency artifact:

| # | Assertion | Cause |
|---|---|---|
| 1 | `public_url_rendering` | page `ok=false` for the published synthetic listing |
| 2 | `seo_metadata_and_crawlable_html` | nothing to inspect (404 body) |
| 3 | `buyer_inquiry_routing` | inquiry refused, so nothing recorded or routed |
| 4 | `inquiry_validation_and_spam_prevention` | honeypot branch needs an accepted inquiry |
| 5 | `listing_status_change_removes_from_active_search` | availability flags absent (404) |
| 6 | `certification_scope_is_disjoint` | test-mode page not served |
| 7 | `no_production_property_records_touched` | `after=1` transient — a direct read now shows 0 |

**Root cause:** `isPubliclyReachable()` and `isPubliclyActive()` exclude `certification_mode === true`
unconditionally, so a published synthetic listing can never be rendered or receive an inquiry in any
scope, test mode included — while the suite expects test mode to exercise those real paths. Six assertions
are unsatisfiable as written. The failure direction was the safe one: no ordinary request ever reached the
synthetic listing.

**Decision required (owner):** **(A)** let test mode exercise the real public path by threading the acting
scope into those two predicates — production scope stays dark, and the §6 residual applies only while the
certification variable exists; or **(B)** keep the absolute block and rewrite the suite so publication,
rendering and inquiry become refusal assertions — the real rendering and inquiry paths then stay
unexercised.

**Outstanding:** `PROPERTY_VISIBILITY_TEST_MODE` was still set when this was written. The owner must remove
it (the app cannot delete a secret value); test mode being unreachable is verified afterwards.

---

## 12. Corrections after the failed run — the public block stays absolute

Owner direction: keep the absolute public block on synthetic certification listings; no anonymous or
ordinary public request may render a synthetic page or submit an inquiry, even in test mode; give
certification a separate administrator-authorized path with strict run ownership and synthetic-record
validation; do not weaken the normal public endpoints.

**1. The public block is now unconditional.** The three visitor-facing surfaces no longer accept a
test-mode parameter at all, so no request can put them into a mode that resolves a synthetic record:
`getPublicPropertyPage` (rendering), `submitPropertyInquiry` (input) and `streamPropertyMedia` (assets).
`isPubliclyReachable()` / `isPubliclyActive()` still exclude `certification_mode === true`
unconditionally, and the suite now asserts the refusal directly, so the block cannot silently disappear.
Directory and sitemap scope checks keep their isolated test mode: they enumerate and verify, they render
no page and they accept no visitor input.

**2. Certification has its own path.** New `certifyPropertyRender` (administrator-only) proves three
things before it reads or writes anything: the caller is a platform administrator (server-verified
session role); the caller holds THIS run's active lock (a run id holding no lock is refused); and the
target is a synthetic record belonging to that same run. It renders through the SAME shared renderer
(`shared/propertyPageRender.ts`) and submits through the SAME shared inquiry engine
(`shared/propertyInquiry.ts`) that the public surfaces use — extracted from those functions for exactly
this reason, so certification exercises the real code and there is one implementation, not a copy.

**3. The suite was rewired** so the six previously unsatisfiable assertions run through that path, and it
now also asserts that the public page and public inquiry endpoint refuse the synthetic record even when
the request carries `test_mode`, that the engine predicates refuse it while the certification-only
predicate accepts it, and that the certification path refuses a run id holding no lock and a record
outside the run.

**4. Cleanup — investigation, correction, verification.**
- *Investigation of the `after=1` reading:* the sweep deletes only records carrying this run's markers,
  and it reported deleting the listing — so the record was a genuine certification record, never
  production-scope residue. Independent reads then found 0 listings, 0 events, 0 inquiries and 0
  synthetic jobs. The reading was a stale read taken immediately after a burst of deletes.
- *Corrected:* the post-run check no longer compares a raw total. It probes by MARKER across all three
  property entities, names any residue, and re-reads a bounded number of times (up to 3, 1s apart), so a
  stale read cannot fail the run and a real leak cannot hide behind a passing count. A
  `run_lock_released_after_cleanup` assertion was added for the same reason.
- *Verified:* the guard suite passed 31/0 — run-scoped discovery, live-run protection, safe cleanup,
  idempotency and stale/interrupted-run discovery included — with 0 certification listings remaining and
  no change to contacts or wallets. Its three "not found" cleanup entries are the second, idempotent
  delete pass over records the first pass had already removed. An independent marker scan across
  `PropertyListing`, `PropertyListingEvent`, `PropertyInquiry` and `Job` found no synthetic residue.
- *Interrupted runs:* the runner still refuses to start while ANY foreign certification artifact exists
  (checked before the lock is taken) and the sweep discovers and removes stale runs, so an interrupted
  run blocks the next run until it is reconciled rather than accumulating silently.

**5. Verification of the new path.** Before publish, `certifyPropertyRender` was called with a run id
holding no lock → `403` (the admin authorization itself passed), so the path is unusable outside a live
run and touches nothing. Certification itself was NOT re-run at this point.

**6. Published and verified live (2026-10-12).** The corrections are live. Post-publish probes of the
published app: `getPublicPropertyPage` → `404 feature_disabled`; `submitPropertyInquiry` → `404
feature_disabled` (no record created); `searchProperties` → `200` with no results; `certifyPropertyRender`
called anonymously → `401 Authentication required`. `PROPERTY_VISIBILITY_ENABLED` is still `false`, the
run lock is inactive, and the three property entities hold 0 records with 0 synthetic residue of any kind.

The synthetic-record refusal itself cannot be observed through a published probe while the feature flag
is off, because the flag-off refusal answers first. It is asserted by the suite's test
`public_surfaces_refuse_synthetic_records_in_every_mode` together with the engine predicates, and by the
guard suite's 31/0 pass.

**Still outstanding (owner):** `PROPERTY_VISIBILITY_TEST_MODE` must be removed — it was still set when
this record was written. `PROPERTY_VISIBILITY_ENABLED` remains `false` with its record untouched and no
public listing exists.

---

## 13. Phase 2 execution — certified, with two certification-path defects repaired (2026-10-12)

Executed on synthetic records with the production flag never written. Full detail:
`ARRIV_PROPERTY_VISIBILITY_PHASE2_VERIFICATION_REPORT.md`.

**Test mode — resolved.** `PROPERTY_VISIBILITY_TEST_MODE` is **not present** among the app's secrets, so
the item left outstanding in §12 is closed: the certification scope cannot be entered from the deployed
app. This phase set it only inside its own in-process verification process, which never touched the
deployed environment.

**Two defects in the certification path itself, repaired** (no production behaviour changed — the
shared engine, the API, the renderer, the public endpoints, the edge worker and the frontend are
untouched):

1. `certPath` invoked `certifyPropertyRender` over an unauthenticated `fetch`, so every
   certification-path call was refused `401` before the endpoint read a record — the render, inquiry
   and ownership assertions were unsatisfiable, which is precisely the failure recorded in §11. It now
   invokes through the request-scoped client, which carries the session of the administrator running
   the suite: the identity that holds the run's lock. Probed live against the deployed endpoint —
   unauthenticated → `401`, `asServiceRole` → `403` (authorized, but not the lock owner),
   request-scoped session → `200`.
2. The two probes behind `certification_path_requires_run_ownership_and_synthetic_records` were
   themselves unauthenticated, so they could only ever observe the `401` that precedes both checks and
   never tested run ownership or synthetic-record validation. They now use the authenticated path and
   return the intended `403` for a run id holding no lock and for a record outside the run.

**Certification: 40 / 40.** Run `cert_prop_1791836353740` — 40 passed, 0 failed, 41.5 s (39/40 before
the repairs, 40/40 after). Cleanup deleted 15 artifacts with 0 remaining; financial deltas 0 across all
ten financial entities; feature flag value **and** `updated_date` byte-identical; run lock released.

**Deployed-path probes** (live, each with its own synthetic fixture, both removed afterwards): render
through the administrator session → `200` with the canonical `properties.arrivestatemedia.com` URL,
approved media in order, JSON-LD `RealEstateListing` with the price, and crawlable HTML that carries no
`noindex` and no `app.arrivestatemedia.com` URL; video excluded (2 media, empty `video_url`) until
expressly approved; the real inquiry engine routed only to the authorized listing contact with
`not_shared` lead state, `400` on invalid input, honeypot filtered; public page, inquiry, media, sitemap
and directory all refuse the synthetic record (flag off → fail closed); certification endpoint —
anonymous `401`, unowned run `403`, foreign record `403`.

**Cache invalidation: 11 signed purges** (HTTP `200`) across `update_details`, `generate_seo`,
`approve_content`, `record_authorizations`, `submit_for_review`, `approve_publication`, `publish`,
`update_listing_status` ×2, `confirm_status` and `unpublish` — each scoped to one listing and each
carrying that listing's media and cover keys — plus **1 purge** on administrator archive
(`PUBLISHED → ARCHIVED`, `archived_at` set, `sitemap_included` cleared). No purge payload ever
referenced another listing.

**Edge suite: 37 / 37.** `worker.test.mjs` is a Node entry point rather than an HTTP endpoint, so the
earlier attempt correctly reported "no handler captured". It now runs against the real worker file in
~30 ms and is registered as `npm run test:edge` (reports `37/37 passed`).

**Still outstanding at the end of Phase 2 (owner):** the production edge hostname/route decision for
`properties.arrivestatemedia.com`, the Cloudflare production deployment, and explicit approval to flip
`PROPERTY_VISIBILITY_ENABLED`. At that point the flag was `false`, the run lock inactive, and no
property listing existed.

---

## 14. Phase 3 execution — activated, live and verified (2026-10-12)

Owner authorization for the final activation phase. Full detail:
`ARRIV_PROPERTY_VISIBILITY_PHASE3_ACTIVATION_REPORT.md`.

**Status: LIVE WITH CUSTOMER APPROVAL PENDING.** `PROPERTY_VISIBILITY_ENABLED` = `true`
(2026-10-12T21:25:34Z). Activation published nothing: 0 published listings before and after, and the
publication path still requires the customer's explicit, recorded consent.

**Deployed edge verified, not assumed.** `/__health`, `/robots.txt`, `/sitemap.xml`, the page route,
both media routes, non-GET refusal, the signed purge (`verify: true`) and the kill switch's
reachability were all probed against the running endpoint, on both the property host and the
workers.dev host — one worker, one cache, and the purge the app issues reaches the cache that serves
the property host. The deployed worker reports `PUBLIC_HOST` unset; its measured effect (cache keys
namespaced on the app host, host rewriting a no-op) is self-consistent with the purge and harmless
because the origin emits property-domain URLs itself. Safe for activation; `PUBLIC_HOST` should be set
on the next deploy.

**Three defects found and repaired (§3 of the Phase 3 report):** certification scope was suppressed
once the flag was live (so the suite fell out of scope and briefly created non-certification records —
all removed and verified); the suite's production-scope assertion asserted the opposite of the
absolute block when the flag is on; and the public property page was a bare document with no listing
contact and no inquiry path, now a finished brand-consistent responsive page with a working, screened
inquiry form.

**Certification with the feature LIVE: 40/40** (run `cert_prop_1791840479755`), 11 signed purges all
`200`, 15 artifacts cleaned with 0 remaining, financial deltas 0, run lock released.

**Laurinda Massey — 9809 Dellcastle Rd, Gaithersburg, MD 20886.** Listing `prop_mv5rhct71qm7dp`, slug
`9809-dellcastle-rd-gaithersburg-md-mv5rhct7`, **DRAFT / unpublished**, not publicly reachable. Address
and ZIP (20886) and square footage (2,802, provider-verified) recorded; price, beds, baths, type,
description, media, listing contact, authority, brokerage approval, disclosures, content approval and
publication consent deliberately left for her. No admin approve/publish attempt succeeds (403), and a
stranger's email cannot edit the listing (403, address unchanged).

**Manual actions:** complete or re-send Laurinda's account setup (her `PendingSignup` from 2026-10-01
is still `pending` — this is the only reason she cannot review her page today); verify
`properties.arrivestatemedia.com` in Search Console and submit
`https://properties.arrivestatemedia.com/sitemap.xml`; set `PUBLIC_HOST` on the next edge deploy.

**Rollback:** archive the listing (state change plus signed purge), or set
`PROPERTY_VISIBILITY_ENABLED=false` to close every customer and public surface at once (edge copies
bounded by the 300-second TTL, cleared immediately by a signed purge). The edge's own kill switch needs
Cloudflare credentials this workspace does not hold.