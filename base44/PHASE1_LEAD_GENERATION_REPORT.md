# PHASE 1 — FREE PROPERTY VISIBILITY AND LEAD GENERATION

**Status:** implemented and verified. No customer billing, advertising campaign or publication was created or changed.
**Date:** 2026-11-10

---

## 1. What was added

### Lead delivery (Brevo)
- `shared/propertyLeadDelivery.ts` — the delivery engine. Builds the agent notification, sends it through the existing Brevo client, and records every attempt on the inquiry.
- The inquiry record is written **before** any send is attempted (`shared/propertyInquiry.ts`), so a provider failure delays a notification but never loses a lead.
- Retry schedule: 5 attempts at 1, 5, 15, 60 and 240 minutes. Each attempt records `delivery_attempts`, `last_delivery_attempt_at`, `next_delivery_attempt_at`, `delivery_error`.
- Terminal failure sets `notification_status: "failed"` and emails the administrators once (`ADMIN_EMAIL`), recorded in `admin_alerted_at`.
- `functions/processPropertyLeadDeliveries` + workflow **Property Lead Delivery Retry (10min)** — bounded to 25 per run.
- The notification is sent from `bookings@arrivestatemedia.com` (verified active in Brevo) with the **buyer as reply-to**, so the agent answers the buyer by replying.

### Agent inquiry dashboard
- `pages/PropertyLeads.jsx` at `/PropertyLeads`, linked for customers ("Property Leads") and administrators.
- `functions/getPropertyLeads` decides access server-side: a customer sees leads for listings whose `client_email` matches their own session address; an administrator sees all. A customer cannot read another customer's leads (asserted in tests).
- Actions: mark handled / reopen, resend a failed delivery. `PropertyInquiry` RLS stays admin-only, so leads cannot be read by addressing the database.

### Traffic attribution and conversion tracking
- `shared/propertyAttribution.ts` — turns campaign parameters and the referring host into a small record: channel (`paid`, `social`, `organic`, `referral`, `internal`, `direct`), source, campaign. Referring URLs are reduced to hostname; landing pages to path only, so a query string is never stored.
- The public page renders **one anonymous beacon per view**. No cookie, no device id, no third-party script, no client storage (verified against rendered HTML).
- `functions/recordPropertyTraffic` aggregates into `PropertyTrafficDaily`: **one row per property per day per channel**, incremented atomically. A month of traffic is a handful of rows, not one row per visit. Bots and link-preview fetchers are dropped before writing.
- Inquiries carry their own attribution (`channel`, `utm_*`, `referrer_host`, `landing_page`), so conversion is computed from the lead itself, not inferred from view counts.

### Structured-data synchronisation
- `managePropertyListing` now rebuilds `structured_data` inside its single `update()` path whenever the listing is `PUBLISHED`. Price, size, status, photography and contact changes therefore reach the machine-readable markup without a re-approval, and the customer-approved text and `seo_source_hash` are left untouched.

### Listing lifecycle
- `functions/processPropertyLifecycle` + workflow **Property Listing Lifecycle (daily, 9am ET)**.
- 30 days unconfirmed → the owner is asked to confirm (one reminder per period, deduped from the `status_confirmation_due` audit event).
- 60 days unconfirmed → unpublished, with the reason recorded on the publication history and an `auto_deactivated_stale_status` event, edge purge, and a notice to the owner explaining that nothing was deleted and how to restore it.
- It can never publish, approve or delete anything. A `dry_run` mode reports the plan and writes nothing.

### Free page independence from paid promotion
- `isPubliclyActive` is untouched by any placement or entitlement field; a test asserts a listing whose paid promotion expired long ago is still public, and that unpublishing still removes the page.

---

## 2. Files

**New entities:** `PropertyTrafficDaily`. **Extended:** `PropertyInquiry` (attribution, delivery state, closed fields).

**New shared modules:** `propertyAttribution.ts`, `propertyLeadDelivery.ts`, `propertyLifecycleNotices.ts`, `propertyActor.ts`.

**New functions:** `recordPropertyTraffic`, `getPropertyLeads`, `processPropertyLeadDeliveries`, `processPropertyLifecycle`, `testPhase1LeadFlow`.

**New workflows:** `Property Lead Delivery Retry (10min)`, `Property Listing Lifecycle (daily)`.

**New UI:** `pages/PropertyLeads.jsx`, `components/property/leads/LeadStatsGrid.jsx`, `LeadCard.jsx`, `LeadPropertyFilter.jsx`, `lib/propertyLeads.js`; route and navigation entry.

**Modified (no behaviour removed):** `shared/propertyInquiry.ts`, `shared/propertyPageRender.ts`, `shared/brevoClient.ts` (optional `replyTo`), `shared/propertyVisibility.ts` (traffic endpoint), `functions/submitPropertyInquiry`, `functions/managePropertyListing`, `components/property/PropertyInquiryForm.jsx`, `App.jsx`, `Layout.jsx`.

**Untouched by design:** the Cloudflare Worker, the property renderer's structure, the sitemap generator, media streaming, publication approval, MLS publishing, gallery workflows.

---

## 3. Test results

`testPhase1LeadFlow` — **46/46 checks passed**, writes nothing:

- 15 attribution checks (paid, click-id, organic, social, direct, internal, path-only landing page, control-character stripping, lead labelling, bot detection, operating-day boundary, bucket determinism).
- 10 delivery checks (backoff schedule, due-window logic, delivered/exhausted/synthetic immunity, email content, escaping of a script injection, reply attribution).
- 5 access checks (owner allowed, stranger refused, case-insensitivity, admin allowed, signed-out refused).
- 7 structured-data checks (price present, price change propagates, approved text preserved).
- 6 lifecycle checks (5-day quiet, 31-day confirmation request, no early unpublish, 61-day unpublish, sold listings never auto-unpublished).
- 3 paid-independence checks.

Runtime verification: `getPropertyLeads` returned the correct two listings with zero leads; `recordPropertyTraffic` refused an unpublished listing (`NOT_PUBLISHED`, nothing written); `processPropertyLifecycle` dry run reported an empty plan; the retry workflow's first scheduled run completed; every touched file compiles; the production build succeeded; the rendered property page contains the beacon and the attribution payload with no cookie, storage or third-party tracker.

---

## 4. Remaining production verification (needs owner action)

1. **No published listing exists** (1 DRAFT, 1 UNPUBLISHED), so the live path — view counted, inquiry stored, agent emailed, lead in the dashboard — has not been exercised end to end. It needs one authorized published page.
2. First real inquiry is the proof of the Brevo round-trip (sender and reply-to are verified as configured).
3. The daily lifecycle job is live; it will do nothing until a page is published and left unconfirmed.
4. Cheaper view counting (Cloudflare Analytics Engine, no per-view invocation) is documented in `recordPropertyTraffic` and needs a worker redeploy to adopt — deliberately not deployed.
5. Search Console submission remains unchanged from the prior audit.