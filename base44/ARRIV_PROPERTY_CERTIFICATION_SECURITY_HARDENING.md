# ARRIV PROPERTY VISIBILITY — CERTIFICATION SECURITY HARDENING

**Status:** implemented, tested, NOT deployed and NOT run.
Production feature flag untouched (`PROPERTY_VISIBILITY_ENABLED = false`), `PROPERTY_VISIBILITY_TEST_MODE`
neither set nor required, no certification run executed, no DNS or edge change.

Approved scope (all four items delivered): administrator authorization, sweeper coverage for the
property entities, single-run concurrency protection, and guard tests. Deployment remains pending
explicit approval — see §5, which includes a sequencing warning that matters.

---

## 1. Administrator authorization (before any work happens)

`certifyPropertyVisibility` was the one certification entry point in this app that did not refuse
unauthenticated callers: its check was `if (user && user.role !== "admin")`, so an anonymous request
passed the gate and started a run. An anonymous POST could therefore create synthetic records and
drive the whole flow.

It now enforces, as the **first statement of the handler**:

| Caller | Result |
| --- | --- |
| Anonymous (no session) | `401` + reason, nothing read, created, deleted or called |
| Authenticated customer (`role: user`) | `403` |
| Authenticated non-admin caller | `403` |
| Authenticated administrator | proceeds to §3's lock |

Control that makes this non-forgeable:

* The role is read **only** from the platform-verified session (`base44.auth.me()`). No body field,
  query parameter or header can supply it.
* This app's `verifyAdmin` helper was **deliberately not used** here: it resolves an admin from a
  caller-supplied `email` / `sales_member_id`, so an unauthenticated caller could claim an
  administrator identity. A session token cannot be claimed.
* The predicate lives in one shared place, `propertyCertRunGuard.certificationAdminVerdict(user)`,
  so the endpoint and its tests enforce the identical rule.
* Ordering is structural: the gate returns before the lock is taken, before the pre-run entity
  counts, before the synthetic job is created and before any backend function or model call.

The other certification entry points were already anonymous-refusing and admin-gated
(`certifyAutoFundEnrollment`, `runCertificationSuite`, `runAutoFundStressTest`,
`inventoryCertificationData`, `reconcileCertificationFixtures`, `testAutoFundEmergencyStop`,
`applyCertificationMark` — all `401` on no user, `403` on non-admin). `certifyPropertyVisibility` is
now consistent with them. The umbrella `runCertificationSuite` does not invoke the property suite,
so the hardened runner is the only path into it.

## 2. Sweeper coverage for property certification artifacts

`certRunCleanup.ts` previously swept only Auto-Fund/CRM entities. A property page, its publication
events and its inquiries could survive an interrupted run indefinitely. Now:

* **Entities covered:** `PropertyListing`, `PropertyListingEvent`, `PropertyInquiry` — so a killed
  run cannot leave a synthetic property page, its publication history or its inquiries behind.
* **Identification (never by id prefix — a real page's id is an ordinary `prop_…`):** a record is
  deleted only when it is a certification record **and** attributable to this run by its
  `certification_run_id` marker, by the run's own synthetic address (`<runId>@cert.test`), or by a
  declared relationship to the run's listing. Attribution is by **prefix on the record's own marker
  fields**, never by substring.
* **Structural guard:** the property specs carry `requireField: certification_mode === true`, so even
  an over-broad query cannot remove a record that is not a certification record. Dependents
  (events, inquiries) are held to the same boolean, and are deleted **before** the listing.
* **A non-`cert_` run id is refused outright**, so cleanup can never be pointed at production data.
* **Idempotent and retry-safe:** a second call deletes nothing and reports zero remaining.
* **Auditable:** every removal is returned individually (`entity`, `id`, `key`), together with
  `remaining_by_entity` counts so a leftover is visible rather than assumed absent.
* **Not one query per entity in the generic path:** property runs are handled by their own
  run-scoped pass, so the generic sweep is never queried on their behalf (query budget is what broke
  earlier teardowns).

`reconcileCertificationFixtures` (already admin-only) now reports the property sweep automatically
under a `property` block, including `run_ids`, `deleted`, `remaining_by_entity`, and
`skipped_live_runs`.

## 3. Concurrency protection and safe expiration

**One run at a time, enforced server-side.** The lock is stored in the existing `AppSetting` entity
under `PROPERTY_CERT_RUN_LOCK` (no new entity, no new storage).

* **Refuse:** a second run reads a live foreign lock and stops **before touching a record** (`409`),
  returning the holding run and its expiry.
* **Bounded:** the lock's lifetime is a fixed TTL (20 min default, hard-capped at 60 min), so an
  interrupted run cannot lock certification for ever.
* **Safe recovery:** an expired lock (or one with an unreadable lifetime) is taken over, and the
  takeover records the run it came from (`took_over_from`, `previous_expires_at`).
* **Verified write:** the store has no compare-and-swap, so the acquirer writes, re-reads, waits a
  settle window and re-reads again, aborting as `race_lost` if it is not the stored holder. A run
  that fails verification does no work at all.
* **Holder-only release, idempotent:** a run can never release another run's lock, and releasing
  twice is a no-op. Release happens in the runner's `finally`, so success, failure and abort all
  release.
* **Data-level backstop:** before starting, the runner also asks whether certification artifacts of
  a *different* run exist (resolved through the owning listing for marker-less events/inquiries) and
  refuses if they do. This protects an active run's records even in the residual window described
  below.
* **Sweeper protection:** a sweep reads the lock and **skips the run holding a live lock** entirely,
  reporting it under `skipped_live_runs` instead of deleting from it.

**Residual risk, stated honestly:** the store offers no atomic compare-and-swap, so the guarantee is
read-then-write with a settle-and-verify window rather than a true mutual exclusion. Two operators
starting a run within the same second could in principle both proceed. The blast radius is bounded:
each run is run-scoped, marker-guarded and isolated, so the worst case is interleaved synthetic
fixtures — never customer data, billing, payroll or publication state. The settle window plus the
artifact backstop make this practically unreachable; a true CAS would require a platform-level
primitive.

## 4. Tests (guard tests only — the certification suite was NOT executed)

**Two independent runs, 50 assertions, all passing:**

1. **Live guard suite** — `testPropertyCertificationGuards`, invoked through the platform test
   harness, executed as the administrator (`bradcburke@arrivestatemedia.com`): **31 passed, 0 failed**.
2. **Hermetic guard suite** — the same pure predicates executed directly against the shared guard
   module with mocked inputs: **19 passed, 0 failed**.

Coverage by safeguard:

* **Authorization:** anonymous → `401`; ordinary customer → `403`; unauthorised authenticated caller
  → `403`; a payload *claiming* `isAdmin`/`admin` on a non-admin session → still `403`; administrator
  → allowed. Ordering asserted as "nothing precedes the gate".
* **Sweeper:** predicate accepts run-marker and declared-relationship records; rejects a
  non-certification record sharing the run's exact synthetic address; rejects another run's record;
  rejects a substring-only match; rejects a non-`cert_` run id. Live: a synthetic run's page, event
  and inquiry were created and swept (3 records across 3 entities), `remaining = 0`, a second pass
  deleted `0`, a non-certification decoy sharing the run's address **survived**, and a non-`cert_`
  run id was refused.
* **Concurrency:** acquire when free; second run refused with bounded expiry and the holder's id;
  zero-length TTL leaves the lock recoverable; expired takeover recorded with `took_over_from`;
  release refused for a non-holder; holder release idempotent and clearing state; discovery finds a
  stale run; discovery **skips** a run under a live lock.
* **Isolation:** the feature flag read `false` and was never written; `PROPERTY_VISIBILITY_TEST_MODE`
  is unset (test mode not required or configured); `Contact` 102 → 102 and `PrepaidWallet` 0 → 0
  across both runs; `certification_listings_remaining = 0`; all fixtures removed (the three
  "not found" cleanup notes are the sweep having already removed them).

**Not performed, deliberately:** the certification suite itself (never invoked on its happy path);
the live anonymous probe of the deployed runner. The probe is **unsafe before the publish** — the
published app still serves the pre-hardening runner, so an anonymous request would *start* a run
rather than be refused. Run it after §5 is approved (`{"include_live_anonymous_probe": true}`), and
it will assert `401`/`403` plus unchanged record counts.

## 5. Deployment status — a publish IS required, and it must come before any certified run

Backend function changes are live immediately in **preview and tests** (the guard suite above ran
against the new code), but **the published app keeps running the version from the last publish**.

Consequence to act on: **until the app is published, the live `certifyPropertyVisibility` endpoint is
still the permissive pre-hardening version.** No certification run should be attempted before the
publish lands, and nothing anonymous should ever be pointed at it in the meantime.

No frontend or UI change is part of this work, so the publish carries only these backend changes.

## 6. Remaining work / open items

* **Publish** the app (approval required) → then run the deferred anonymous probe to complete the
  authorization evidence end-to-end.
* **Staging certification** remains unrun (unchanged from the previous stage): it still needs the
  isolated test-mode run, the staging host correction and the cache-invalidation check, and it is
  separate from this hardening.
* **Owner decisions still open** from the edge work: DNS/`properties.arrivestatemedia.com`, staging
  deployment, and the final production flag toggle. None of them are touched here.