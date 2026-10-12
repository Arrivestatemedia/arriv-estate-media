# ARRIV ESTATE MEDIA — PROPERTY VISIBILITY & MARKETING AUTOMATION
## Phase 0 — Read-Only Architecture and Integration Audit

**Date:** 2026-10-12
**Type:** READ-ONLY AUDIT AND BLUEPRINT. No entity, page, function, feature flag, credential, webhook, scheduled job, price, invoice, subscription, commission event or production record was created, modified or deleted. No account was connected, no notification sent, no customer charged, no advertisement launched, no synthetic transaction run against production.
**Method:** live inspection of this application's own code and data model, the Base44 platform documentation (Google Ads, credits, hosting, server routes, connectors), and the official Meta and Google provider documentation.

---

## 0. DESIGN DIRECTIVE (recorded, deliberately NOT implemented in this phase)

> "This should have the same design look and feel as the client's image gallery but with white or off white included."

**Verified current state**
- **Client delivery gallery** (`ClientJobGallery.jsx`) is the cinematic surface: near-black gradient canvas (`#0a0b0f`, `#1a1d24`), gold accent system (`#B8956A` → `#C9A87B` → `#8a6d4a`), serif display headings over medium-weight sans body, media-card grid, selection tray with tri-state marks, full-screen lightbox, motion transitions.
- **Property surfaces today** (`PublicPropertyPage`, `PropertyDirectory`, `PropertyCard`, `PropertyPageBuilder` and the `components/property/*` set) are light-first: cream `#FFFBF5` canvas, white cards, gold accents, serif headings for titles only, no dark hero, no lightbox, no motion language.

**Adopted design specification for Release 1 (to implement on authorization)**
1. **Same language as the gallery:** dark cinematic hero/frame around media, gold accent system, serif display headings, media-first composition, selection and lightbox interactions.
2. **With white / off-white included:** cream `#FFFBF5` (or plain white) remains the base reading surface for property facts, disclosures and inquiry forms — dark never wraps body copy. Recommended split: dark gallery-style hero + media rail, cream/white information and form sections, gold active states.
3. Reuse the gallery's existing tokens and components where they are already generic (`PropertyMediaSelector` selection semantics mirror the gallery's selection tray), rather than inventing a second visual system.
4. No green anywhere (existing house preference); status colours stay amber/gold/red.

This is a visual directive only. It is **NOT** applied in Phase 0 because the phase forbids page or component modification.

---

## 1. EXECUTIVE FEASIBILITY ASSESSMENT

| Question | Verdict | Classification |
|---|---|---|
| Can the customer select approved photos/video from the delivered gallery? | Already built, certified | VERIFIED |
| Can an SEO-ready property page be created automatically? | Page, metadata, structured data and sitemap XML all exist | VERIFIED |
| Will search engines reliably index those pages today? | **No.** Hosting is SPA-only; crawlable HTML exists at a function URL, not at the canonical page URL | VERIFIED (constraint) |
| Instagram / Facebook publishing | Platform connectors exist; Arriv's own Meta app + App Review required; token lifetime is a real risk | REQUIRES EXTERNAL APPROVAL / FEASIBLE BUT UNTESTED |
| Meta (Facebook/Instagram) advertising | Connector exists with ad-management scopes; housing Special Ad Category restrictions apply | FEASIBLE BUT UNTESTED |
| Google advertising through Base44's native Google Ads | **Cannot serve this use case.** It is a single app-tied account funded by the app owner | BLOCKED (for per-customer ads) |
| Google advertising through the Google Ads API | Technically feasible; requires Google Cloud project, developer-token Basic access and OAuth verification | REQUIRES EXTERNAL APPROVAL |
| Automated, authorization-gated campaign lifecycle | Feasible on the existing workflow/entity-trigger machinery | FEASIBLE BUT UNTESTED |
| Economical at 10,000 properties | Only with edge caching of media and pages — streaming every asset through a function is the dominant cost | FEASIBLE BUT UNTESTED |

**Headline:** Release 1 is ~80% already built and certified inside this app (property engine, approval states, private media streaming, inquiries, sitemap function). The genuinely new work is (a) fixing the *crawlable-URL* gap, (b) the visual uplift, (c) Meta per-customer connections, (d) customer-funded advertising. Native Base44 Google Ads does **not** replace the custom Google Ads integration.

---

## 2. VERIFIED EXISTING ARCHITECTURE (Section A)

### 2.1 Order, booking and job records
| Component | Verified role |
|---|---|
| `Booking` | Customer order: package, add-ons, address, price, discounts, wallet funding classification, status workflow (pending → confirmed → approved → completed). |
| `ScheduledBooking` | Deferred booking submission, holds the scheduled media delivery link fields. |
| `Job` | The operational shoot record and the marketing source of truth: `type`, `location`, `state`, `date`, `duration_hours`, `pay_rate`, `client_price`, `status`, `production_status`, `capture_status`, `source_upload_status`, **`delivery_status`**, `delivered_to_customer`, `delivered_at`, `client_access_selection`, plus Drive fields `google_drive_folder_url`, `source_storage_folder_id`, `final_edits_folder_id`, `final_edits_folder_url`, `source_archive_folder_id`. |
| `JobApplication`, `EditorProfile`, `EditingTask` | Contractor/editor side of fulfilment. |

### 2.2 Media delivery and gallery
- `getJobMediaForClient` — client-facing gallery data. Enforces: signed-in owner match against the job's `client_email`, verified admin preview path, and **hides media while editing is incomplete**. Stranger → 403 (regression-tested).
- `downloadJobMedia` — binary download with the same ownership/authorization model.
- `sendMediaToClient`, `notifyClientJobCompleted`, `uploadFinalEditsBatch`, `uploadFinalEdit` — delivery dispatch and Drive writes, all through the authorized Google Drive connection.
- `jobMedia.ts` (shared) — the single Drive-folder resolution/listing policy: source folder, final-edits folder, job folder.
- `createGoogleDriveFolderForJob`, `initiateFootageUpload`, `confirmFootageUpload` — folder lifecycle, so every job already has a private, per-job media container.
- `ClientJobGallery` page + `AdminClientGalleryPreview`; `PropertyPagePrompt` is already embedded in the gallery (post-delivery upsell surface).
- Branded masking: `getBrandedFileLinks`, `trackLinkClick`, `ShortLink` entity, `lib/brandedLinks.js`, `BrandedFileLink` / `BrandedFileViewer` — existing policy that no Base44-hosted or raw Drive URL is shown to a customer.

### 2.3 Storage and asset authorization
- **Originals stay in Google Drive** (`source_storage_provider`, per-job folders). Nothing is copied or re-uploaded.
- Public property assets are **streamed** through `streamPropertyMedia`, which re-verifies: feature flag on, listing exists, not certification, publication state `PUBLISHED`, the requested file id is inside the listing's `selected_media` allow-list, then reads the Drive file and returns its mime type. Unpublished listing → 404; asset outside the approved selection → 404 (regression-tested).
- AWS S3 secrets exist (`AWS_S3_*`) but are **not** used by the property/media path (UNKNOWN/for other features).

### 2.4 Property / listing information
- `PropertyListing` (13516 chars of schema) — identification (`listing_id`, `tenant_id`, `job_id`, `booking_id`, deterministic `duplicate_key`), customer ownership (`client_email`), property facts, listing status with a confirmation cadence, agent/brokerage attribution and licence, authority + brokerage-approval + disclosures evidence, the approved `selected_media` selection with `cover_file_id`/`include_video`, the publication state machine and history, approval + consent snapshots, SEO fields, AI draft + generation counter, `reso` reservation, `certification_mode` and now `certification_run_id`.
- `PropertyInquiry` — inquiry with consent snapshot, privacy disclosures, spam scoring, IP/user-agent hashing, routing target, deliberate `lead_sharing_status: not_shared`.
- `PropertyListingEvent` — append-only listing audit trail (19 event types: created, details updated, media saved, SEO generated, content approved, authority/brokerage/disclosures recorded, submitted, publication approved, published, unpublished, archived, status changed/confirmed/due, auto-deactivated, inquiry received).
- Address/price/square-footage sourcing: `lookupPropertySqft`, `PropertyLookup`, `propertyDataProvider.ts` (never AI-invented).

### 2.5 Customers, agents and brokerage relationships
- `Contact` (Customer 360, sales-rep ownership, billing jurisdiction mirror), `Account`, `B2BOrganization` (+ member/seat/contract/credit entities) — a brokerage/team entity already exists with contract, seat and delinquency concepts; usable as the brokerage attribution layer for property pages.
- `SalesTeamMember` — rep identity, per-rep email/OAuth credentials, payroll and commission linkage.

### 2.6 Public routes (verified in the router)
`/properties` (directory), `/properties/:slug` (public property page), `/careers`, `/careers/:jobId`, `/join`, `/sign/:token`, `/r/:code` (short-link redirect), `/ClientJobGallery`, `/AdminClientGalleryPreview`. Public function endpoints additionally serve `getPublicPropertyPage`, `searchProperties`, `streamPropertyMedia`, `generatePropertySitemap`, `submitPropertyInquiry`.

### 2.7 Backend functions and scheduled capability
- 500+ backend functions; **72 workflows**, including daily/hourly/minute schedules (`Job Reminders`, `Footage Reminder Check (5/7min)`, `Prepaid Lot Expiration (daily)`, `Auto-Fund Renewal Notices`, `B2B Delinquency Daily Scan`, `Studio Library Hourly Sync`, `Support Session Expiry (1min)`) and **entity-trigger workflows** (`Sync Trigger — Contact`, `— Deal`, `— SalesTeamMember`, `— ActivityLog`, …). Trigger-driven automation is therefore an established, working pattern in this app.
- Connector-backed functions exist (`sendMediaToClient`, `uploadFinalEditsBatch`, `getGmailAttachments`, `sendDailySummaryEmails`, `syncChatStatusWithCalendar`, `sendPropertyAccessNotification`).

### 2.8 Existing OAuth infrastructure
- App-level connectors declared: `googledrive`, `googlecalendar`, `gmail`, `slack` (`base44/connectors/*.jsonc`) and consumed with `base44.asServiceRole.connectors.getConnection(type)`.
- **Per-person OAuth already exists for reps**: `repEmailConnection.ts`, `microsoftGraphProvider.ts`, per-rep Gmail/Microsoft tokens and AES-GCM encrypted secrets on `SalesTeamMember`, with `generateSalesRepGmailAuthUrl` / `exchangeSalesRepGmailAuthCode` / `manageRepEmailConnection`. This is a working precedent for "each person connects their own external account", though it is Arriv-built rather than platform-managed.
- Platform-native **app-user connectors** are available (per-user consent via `connectAppUser`, per-user tokens via `getCurrentAppUserConnection`) but **no workspace connector is registered yet** (`registered_workspace_connectors` is empty).

### 2.9 Audit logging and security controls
`securityAudit.ts` (canonical SecurityAuditLog writer, explicitly never logs secrets/tokens/passwords, hashes IPs), `rateLimiter.ts` (window-based limits for login/reset via immutable audit records), `syncHmacAuth.ts`, `payrollCrypto.ts` (HMAC signing + canonical request/freshness), `adminAuth.ts`, `twilioWebhookValidation.ts`, `phoneNumberBlocker.ts`, entities `SecurityAuditLog`, `ActivityLog`, `IntegrationAuditLog`, `B2BAuditLog`, `AuditEvent`, `AgreementAuditTrail`, `PropertyListingEvent`.
Certification machinery: `certificationMode.ts`, `certFixtures.ts`, `certRunCleanup.ts`, `certificationContract.ts`, `certificationDeliveryGuard.ts`, `applyCertificationMark`, `manageCertificationAuthorization`, `inventoryCertificationData`, `reconcileCertificationFixtures`, plus 30+ `test*`/`certify*` suites.

### 2.10 Payments, payroll and commission
- **Stripe**: `stripeConnectOnboard`, `createSalesStripeOnboarding`, `checkSalesStripeStatus`, `savePayoutSettings`, `handleStripeWebhook`, `createDirectDepositSession`, `processInstantPayout`, `processWeeklyPayouts` (Friday 4:45am ET), `Weekly Payment Statements`.
- **Arriv Pay**: `ARRIV_PAYROLL_*` secrets, `payrollEmployeeSync` + queue + `Process Employee Payroll Sync Queue`, `sendPayrollSubmission`, `receivePayroll*` webhooks, `payrollSettings.ts`, `payrollCrypto.ts`, `processPayrollSubmissions`.
- **Commission**: `Commission`, `PrepaidCompensationEvent`, `SalesCompensationEvent`, `commissionSourceEngine.ts`, `commissionReversalEngine.ts`, `deliverPrepaidCompensation`, `deliverB2BCommission`, `processCommissionEligibility`, `computeSalesPerformance`.

---

## 3. REUSABLE COMPONENTS (do not rebuild)

| Need | Reuse |
|---|---|
| Approved media selection | `PropertyListing.selected_media` + `normalizeSelection` + `PropertyMediaSelector` |
| Delivery eligibility gate | `isDeliveredAndEligible` policy in `propertyVisibility.ts` (`delivery_status` / `delivered_to_customer`) |
| Publication control | `PUBLICATION_STATES` + `TRANSITIONS` + `approve_publication` / `publish` / `unpublish` / `archive` actions |
| Private asset serving | `streamPropertyMedia` (+ allow-list check) |
| Crawler-readable HTML | `getPublicPropertyPage?format=html` (`renderHtml`) |
| Sitemap XML | `generatePropertySitemap` |
| Public search | `searchProperties` (eligibility enforced inside the query) |
| Buyer inquiries | `submitPropertyInquiry` (consent, spam, hashing, routing) |
| Listing audit trail | `PropertyListingEvent` |
| Security logging / limits | `securityAudit.ts`, `rateLimiter.ts`, `SecurityAuditLog` |
| Scheduled + trigger automation | existing workflow patterns (72 workflows, entity triggers) |
| Branded link masking | `getBrandedFileLinks` / `trackLinkClick` / `ShortLink` |
| Certification isolation | `certificationMode` / `certRunCleanup` / `manageCertificationAuthorization` |
| Payments + payout rails | Stripe Connect + Arriv Pay functions above |
| Multi-tenant + ownership | `tenant_id` on records, `client_email` ownership checks inside functions |

---

## 4. MISSING CAPABILITIES (verified absent)

1. **Crawlable hosting at the canonical URL** — hosting is SPA-only ("all routes are served from index.html"); `/properties/:slug` returns the SPA shell; the sitemap function is not mounted at a public `/sitemap.xml` path.
2. **No marketing entities**: no campaign, asset, connected-account, scheduled-publication, advertising-authorization, budget or performance record exists (`HirePerformance`/`ScheduledBooking`/`ScheduledEmail`/`ScheduledMediaMessage` are unrelated).
3. **No social publishing code** of any kind; no Instagram/Facebook/Ads connector authorized.
4. **No app-user OAuth connector registered** — the per-customer consent path exists in the platform but is not configured for this workspace.
5. **No UTM/campaign attribution on property surfaces** (`utm_` appears only on careers/job pages), no property view counting beyond inquiry events, no performance ingestion.
6. **No token health/refresh monitoring** for external connections.
7. **No comment moderation** (Meta has refused `pages_read_user_content` / `pages_manage_engagement` — unavailable by platform policy).
8. **No image/video derivative pipeline** (by design: originals stream from Drive; no transcoding, no re-hosting).

---

## 5. SEO RENDERING FEASIBILITY (Section B / F) — VERIFIED CONSTRAINT + RECOMMENDATION

**Verified facts**
- `getPublicPropertyPage` with `format=html` returns a complete, crawler-readable document: `<title>`, meta description, canonical, robots (`noindex` when not publicly active), Open Graph tags, `RealEstateListing` JSON-LD, address block, fact list, photos, video, agent/brokerage attribution, disclosures. Regression-tested.
- The **canonical URL written into that document points at the SPA route** (`/properties/<slug>`), where a crawler receives the JavaScript shell.
- Platform docs state hosting is SPA-only and do not document HTML at a clean server route. Therefore Base44 hosting **cannot** serve the crawlable document at the canonical URL as configured.

**Recommendation (minimal external cost)**
- Serve property pages from an **Arriv-controlled static/edge layer** (e.g. a subdomain such as `homes.<arriv-domain>` on Cloudflare Workers / Pages free tier) which reverse-proxies two existing endpoints: `getPublicPropertyPage?format=html` for HTML and `streamPropertyMedia` for assets (cached at the edge with the existing `Cache-Control` headers), and serves `generatePropertySitemap` output at `/sitemap.xml`.
- Set `canonical_url` (`propertyPageUrl` base) to that subdomain so canonical, sitemap, Open Graph and the crawlable document agree on one URL.
- This also removes the dominant invocation cost (see §11). Classification: **FEASIBLE BUT UNTESTED** (needs an owner domain/DNS decision and one external deployment).
- **No guarantee of indexing, ranking or traffic is made or implied.** Google Search Console and Google Analytics connectors exist in the platform (`google_search_console`: webmasters.readonly/edit; `google_analytics`: analytics.readonly/edit) but are **not connected**; property surfaces currently carry no GA/UTM instrumentation. Organic impressions (Search Console), site visits (analytics) and paid impressions (ad platforms) are three different sources and must be reported separately.

---

## 6. META INTEGRATION FEASIBILITY (Section C)

**Verified from platform connector documentation**
- **Instagram Business** connector: scopes `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`; must use `graph.instagram.com` (Instagram Login), **not** the Facebook Graph API, and no Facebook scopes may be mixed in. Not currently authorized.
- **Facebook Pages** connector: `pages_show_list`, `pages_read_engagement`, `pages_messaging`, `pages_manage_posts`, `read_insights`, `pages_manage_metadata`, `pages_manage_ads`, `business_management`. **`pages_read_user_content` and `pages_manage_engagement` were refused by Meta** — comment reading/replying/moderation and visitor-post handling are **not buildable**. The impressions/fans insight family is retired; use `page_media_view`, `page_total_media_view_unique`, `page_follows`, `page_post_engagements`, `post_media_view` (one invalid metric name fails the whole call).
- **Meta Ads** connector: `ads_read` (reporting) or full access with `ads_management` + `pages_manage_ads`; ad-account ids must be prefixed `act_`; performance comes from the ad account `/insights` edge.
- **Token lifetime risk (platform-documented):** generic OAuth does not perform Meta's `fb_exchange_token` long-lived exchange, so credentials must be treated as expiring when Meta's token expires. Scheduled publishing therefore needs a connection-health check and a customer re-consent path.
- No connector trigger for these three (webhooks would need `select_or_create_workflow_webhook`).

**Verified from Meta's own documentation**
- Instagram publishing: JPEG only for images; carousels up to 10 items (reels cannot be in carousels); rate limit **100 API-published posts per 24-hour period** (carousel = 1); container-then-publish flow with `status_code` polling; resumable upload for large video; **Page Publishing Authorization (PPA)** and 2FA requirements can block publishing on Page-linked accounts; the publishing user needs `MANAGE`/`CREATE_CONTENT` on the linked Page.
- Required permissions (Instagram-Login path) are exactly the two the platform connector already lists: `instagram_business_basic` + `instagram_business_content_publish`.
- Ads: housing requires Meta's **Special Ad Category**, which blocks ZIP targeting (states only), removes detailed targeting/exclusions and lookalikes, forces 18–65+ and all genders.

**Recommendations**
1. **Per-customer connections (not shared):** use platform **app-user connectors**, which requires an Arriv-registered workspace connector (OAuth app) — each customer consents individually, tokens are held per user by the platform, and the app calls `getCurrentAppUserConnection`. Passwords are never requested or stored. Classification: **REQUIRES EXTERNAL APPROVAL** (Arriv Meta app, Business Verification, App Review for `instagram_business_content_publish`, `pages_manage_posts`, `ads_management`).
2. Treat Instagram and Facebook Page as **two separate connections** (they are two connectors with disjoint scope sets). Eligible content: single image, carousel (mixed image/video, max 10), video/Reel (not inside a carousel), Page posts (link, photo, video). Not supported: comment moderation, story/Reels alt-text or stories publishing via this API surface, filters, shopping tags.
3. **Base44 can host this integration** — the platform holds and refreshes connection tokens and isolates them per user; nothing sensitive is stored in this app's entities. A dedicated service is **not** required for security reasons. It may still be required for *long-lived* scheduling reliability, which is the UNKNOWN in this section.
4. If Arriv instead builds Meta OAuth directly, mirror the existing `repEmailConnection` precedent (AES-GCM encrypted credentials, per-record isolation, audit rows) — but that puts token custody on Arriv and should be a deliberate decision, not a default.

---

## 7. GOOGLE ADS: NATIVE BASE44 CAPABILITY (the 10 questions) + CUSTOM PATH (Section E)

### 7.1 Verified answers about the native integration
| # | Question | Verified answer | Classification |
|---|---|---|---|
| 1 | Only for advertising the Base44 app, or can each customer advertise an individual property? | **App-level only.** Base44 generates assets from the published app's content and the ad leads to a page of *that app*. Docs do not describe advertising an unrelated business or an arbitrary external landing page per customer. | VERIFIED |
| 2 | Can each customer connect their own Google Ads account? | **No.** Base44 *creates* one account tied to the app on first launch; you cannot connect an existing Google Ads account. | VERIFIED |
| 3 | Can backend automations create/schedule/pause/manage campaigns? | The dashboard supports create, edit budget, pause/resume, archive; platform API-reference endpoints exist for campaign creation and pausing **all** campaigns. The docs do **not** state that backend functions can call these, and there is no Google Ads activity/connector for automations. Operationally, pausing is app-wide, not per-customer. | VERIFIED (UI/API exists) / **UNKNOWN** (backend automation) |
| 4 | Can campaigns use property photographs, videos, descriptions and Arriv landing pages? | Only app-derived assets and app pages. Property media and `/properties/:slug` landing pages are not a documented input. | VERIFIED (limitation) |
| 5 | Can customers authorize their own budgets with spend billed directly to them? | **No.** Spend is billed to the payment method on the **app owner's** account (estimated clicks + **15% Base44 service fee**); new ad accounts are charged every 3 days, older weekly. Customer-funded budgets are not part of this model. | VERIFIED |
| 6 | Can Arriv retrieve impressions, clicks, spend and conversions? | Yes for the app's own account: dashboard reporting covers impressions, clicks, CTR, conversions, spend and active campaigns, with campaign/asset/search-term detail. Per-customer reporting is not available because there are no per-customer accounts. | VERIFIED (for the app account only) |
| 7 | Does it support housing advertising requirements? | Not addressed by the platform docs; they point to Google's ad policies. Housing ads are separately restricted by Google's **Personalized advertising** policy: age, gender, marital status, parental status and **ZIP-code** targeting are prohibited for housing ads in the US/Canada (city/state/radius remain). Any housing campaign must be built to that rule set. | REQUIRES EXTERNAL APPROVAL (policy) |
| 8 | What additional Base44 or Google charges apply? | Confirmed: ad spend (Google) + **15% Base44 service fee**; Google promotional credits are separate from Base44 credits and may apply. Budget is an average — Google may spend up to ~2× on a busy day within a monthly ceiling. | VERIFIED |
| 9 | Can it be integrated into the existing customer dashboard? | Not per customer — the account is app-scoped and owner-funded, so exposing it to customers would expose the owner's billing relationship and mix all customers into one account. | VERIFIED (unsuitable) |
| 10 | Which features are available vs needing external APIs? | Available natively: one app-tied campaign set, asset generation, budget/pause/archive, app-level reporting. Needing external APIs: per-customer ad accounts, per-customer budgets/authorization, per-property campaigns, customer-funded spend, per-campaign reporting, housing-compliant per-property targeting. | VERIFIED |

**Verdict: native Base44 Google Ads does NOT replace the custom Google Ads integration for Property Visibility.** It is a single-tenant, owner-funded app-marketing channel; Property Visibility requires multi-customer, customer-funded, per-property advertising. It *is* potentially useful for advertising Arriv's own marketing site/app as a business, which is a separate, owner-level decision.

### 7.2 Custom Google Ads path (if authorized)
- Google Cloud project + OAuth client, consent-screen verification, **developer token** with at least Basic access (production accounts; ~15,000 operations/day), manager-account linkage, and advertiser verification. Provider docs note access approvals have become slower and recommend Explorer access unless Basic is essential.
- Per-customer OAuth (customer signs in with their own Google account and authorizes their own Ads account) — no Base44 connector provides this, so it must be built (platform app-user connectors cover Instagram/Facebook/Meta Ads, not Google Ads).
- Campaign creation must set the **housing** designation and obey the no-age/gender/ZIP rules; ad review can reject, and approval/ad delivery is never guaranteed.
- Recommendation: **customer-funded ad accounts only** (customer pays Google directly; Arriv never fronts ad spend). Separate any Arriv service fee from the ad budget explicitly (`AdvertisingBudget` fields below). Do not launch spend without a recorded, timestamped authorization for a specific amount and period.
- Meta Ads equivalent: reachable through the platform `meta_ads` connector in app-user mode with `ads_management`, subject to Meta's housing Special Ad Category and the token-expiry caveat.

---

## 8. SECURITY AND COMPLIANCE (Section J)

| Risk | Existing control | Control still required |
|---|---|---|
| Cross-customer account access | `client_email` ownership checks inside every function; RLS on property entities is admin-only; public reads go through functions that re-verify ownership | Extend the same model to marketing-account records; add an explicit "acting customer" assertion on every marketing action |
| OAuth token leakage | Platform holds app-user connector tokens; AES-GCM pattern exists for Arriv-held credentials; `securityAudit` never logs secrets | Never persist tokens in this app's entities for platform connectors; log only connection status changes |
| Unauthorized social publishing | Nothing publishes today | Mandatory per-listing + per-campaign authorization records with consent snapshots; no publish without a live authorization; pause/revoke must be immediately effective |
| Unauthorized advertising spend | Nothing spends today | Explicit amount + period + currency authorization; hard budget caps; kill-switch (pattern already exists: Auto-Fund emergency-stop) |
| Duplicate campaigns/posts on retry | Idempotency patterns exist elsewhere (payment events, sync queues) | Idempotency key per (property, channel, campaign, scheduled slot); unique scheduled-publication record before dispatch |
| Failed scheduled jobs left silently broken | Workflow run history + audit entities | Attempt counters, terminal-failure surfacing, and a customer-visible status on the campaign |
| Housing / Fair Housing compliance | Advertising + inquiry disclosures already defined in the engine; inquiries are `not_shared` | Counsel review of advertising copy rules and targeting; enforce Special Ad Category / housing designation programmatically; never auto-generate fair-housing-sensitive claims |
| Brokerage advertising disclosures | `authority_confirmed`, `brokerage_approved`, `disclosures_accepted(_snapshot)` already gate publication | Extend the same gates to *every* social/ad asset, not just the page; per-brokerage approval where required |
| Unlicensed media distribution | Media allow-list + private streaming; branded masking | Keep assets served only through authorized endpoints; never expose raw Drive URLs; audit external platform uploads |
| Listing information accuracy | Facts are customer-supplied/verified; AI drafts are never published unreviewed; 60-day status deactivation policy | Carry the same "approved content only" rule into captions and ad copy; regenerate only on meaningful change |
| Customer account disconnection / token expiry | None for marketing | Connection health checks, reconnect prompts, automatic pause of scheduled work on disconnect (fail closed) |
| Data retention and deletion | Consent retention policy pattern exists (24 months, IP/user-agent purge) | Define retention for marketing assets, performance data and connection metadata; honour deletion requests across all marketing records |
| Rate/cost abuse | `rateLimiter.ts`; per-function limits; inquiry spam scoring | Per-customer publishing and spend rate limits; alerting on abnormal spend or publish volume |

---

## 9. RECOMMENDED DATA ARCHITECTURE (Section G)

Reuse first; add only what cannot be expressed on existing records.

| Conceptual name | Recommendation |
|---|---|
| `PropertyListing` | **Reuse as-is** (single property record; multiple campaigns reference it, never duplicate it) |
| `PropertyMediaSelection` | **Do not create** — already `PropertyListing.selected_media` + `cover_file_id` + `include_video` |
| `PropertyPublication` | **Do not create** — already `publication_state` + `publication_history` + approval/consent fields |
| `ConnectedMarketingAccount` | **New**: owner (`customer_email`, `tenant_id`), channel (`instagram`/`facebook_page`/`meta_ads`/`google_ads`), external account id (never a credential), connection status + last verified timestamp, connector reference, granted scopes, disconnected_at/reason. Never stores tokens or refresh tokens. |
| `MarketingCampaign` | **New**: property reference, channel set, campaign type (just_listed, highlight, open_house, price_change, sold), state (draft/authorized/scheduled/active/paused/completed/cancelled), authorization reference, date window, and an idempotency key |
| `MarketingAsset` | **New**: generated copy/creative per channel with the source-content hash it was generated from (regenerate only on real change, mirroring `seo_source_hash`), approval state, and the media file ids used |
| `ScheduledPublication` | **New**: campaign + channel + due timestamp + payload snapshot + delivery state + attempt count + provider post id (idempotent dispatch key) |
| `AdvertisingAuthorization` | **New**: customer email, channel, authorized amount + currency + period, budget cap, consent text snapshot, IP/user-agent hash, authorized_at, revoked_at — the only thing that permits spend |
| `AdvertisingBudget` | **New**: authorization reference, funded amount, platform-reported spend, service fee (kept strictly separate from ad budget), pacing state |
| `MarketingPerformance` | **New**: daily/periodic roll-up per campaign/channel: impressions, clicks, spend, leads, inquiries, with the source (organic/paid) recorded explicitly |
| `MarketingAuditEvent` | **Do not create** — use `PropertyListingEvent` for listing-scoped events and `SecurityAuditLog` for account/authorization events |

Controls on every new record: `tenant_id`, ownership email + verification, approval/authorization snapshots, lifecycle state machine, append-only history, `certification_mode`, and RLS mirroring the existing admin-only + function-mediated pattern.

---

## 10. AUTOMATION WORKFLOW (Section H)

Mechanism is already available: scheduled workflows + entity-trigger workflows (both proven in this app) calling backend functions. Every trigger below is **authorization-gated**; none may publish, spend, or change listing status on its own.

| Trigger | Feasible | Design |
|---|---|---|
| MEDIA_DELIVERED | Yes | On `Job` delivery fields becoming delivered → create marketing draft + notify customer (no external action) |
| PROPERTY_APPROVED | Yes | On `content_approved` / `publication_approved` → prepare public page (already exists) |
| PROPERTY_PUBLISHED | Yes | On `publish` → create scheduled social content **only if** an active publication authorization exists |
| CAMPAIGN_APPROVED | Yes | On campaign authorization → activate only within the authorized budget window |
| PRICE_CHANGED | Yes | On `update_details` with a price delta → prepare a price-change asset; post only with a standing authorization |
| OPEN_HOUSE_CREATED | Yes | New open-house record/field → prepare promotional asset |
| PROPERTY_PENDING | Yes | On status → `pending` → pause "for sale" promotion, keep listing page up (already the documented behaviour) |
| PROPERTY_SOLD | Yes | On status → `sold` → stop active promotion, switch to sold-announcement asset, keep page reachable but non-advertised (already implemented for pages) |
| CAMPAIGN_COMPLETED | Yes | On window end → generate performance report from `MarketingPerformance` |
| Fail-closed rule | Required | Connection expired, authorization revoked, listing unpublished or status-not-confirmed → pause, never publish |

---

## 11. COST ESTIMATES AND ASSUMPTIONS (Section I)

**Confirmed platform numbers (documentation)**
- Backend function invocation ≈ **1 credit per 100 invocations**; `InvokeLLM` ≈ **1 credit/call** (non-default models from ≈3); `GenerateImage` ≈ 1 credit/image; `SendEmail` ≈ 1 (2 with a custom domain); workflows ≈ **1 credit per 10 steps** plus step costs.
- Database reads and writes do **not** consume integration credits.
- Storage and bandwidth: **not documented** → UNKNOWN.
- Credit-to-dollar conversion: **not stated in docs** → the owner must confirm from workspace billing before any margin commitment (I will not invent a rate).
- Native Google Ads (if ever used for Arriv's own app): ad spend + **15% service fee**; Meta/Google ad spend for customer accounts is paid by the customer directly.

**This app's own modelled figures (in-code cost model, verified present)**
- ≈ **$0.0393 per published property per month**, of which ≈ **$0.02 one-time AI content** per listing.
- Media is **not duplicated or transcoded**: originals stream from Drive, so there is no storage/egress duplication and no video-processing cost (the two costs that normally dominate a listing platform). AI content is generated once and regenerated only on relevant change (`seo_source_hash`, `ai_generation_count`).

**Scale model (assumption-driven — flagged as ASSUMPTION, not confirmed)**
Assumptions per property per month: 1 published page, ~15 photos + 1 video, ~100 page views, ~2 crawler fetches, 3 social posts, 1 AI caption set, occasional status update; every page/media request is one function invocation at ≈1 credit/100.

| Scale | Page + media invocations (assumption) | AI content | Publishing (assumption) | Dominant cost driver |
|---|---|---|---|---|
| 10 properties | ~15k | 1 credit set | ~30 posts | negligible |
| 100 | ~150k | ~10 credits | ~300 posts | negligible |
| 1,000 | ~1.5M | ~100 credits | ~3,000 posts | function invocations |
| 10,000 | **~15M** | ~1,000 credits | ~30,000 posts | **function invocations — ~150k credits/month** |

**Conclusion:** the economics break on *serving*, not on AI or storage. Edge caching of pages and media (and/or serving cached derivatives) is the single highest-value optimisation and should be part of the external rendering layer, not a later phase. Ad management cost is API-call only (free) plus Arriv's service fee decision.

**Hypothetical product economics (prices NOT approved, NO pricing objects created)**
| Proposal | Assessment |
|---|---|
| $49 per property (one-off marketing package) | Covers AI copy (~$0.02) and ~1 month of page hosting comfortably; the variable cost is social/ad management attention, not infrastructure. Viable if publishing stays automated. |
| $99 per property | Same infrastructure, more room for assisted setup/branding; viable if it includes ad *setup* but excludes ad spend. |
| $79/month subscription | Depends entirely on how many properties and how much media traffic each subscriber generates (the invocation driver). Requires the caching layer first, plus a defined property/asset ceiling per subscription. |

All three must be modelled against the owner's actual credit price and Meta/Google service scope before being offered; no price, invoice, subscription or commission event was created.

---

## 12. THREE-RELEASE IMPLEMENTATION PLAN (Section K)

### Release 1 — Property pages, SEO and generated marketing assets
- **Build/reuse:** reuse the entire `propertyVisibility` engine, `managePropertyListing`, `getPublicPropertyPage`, `searchProperties`, `streamPropertyMedia`, `generatePropertySitemap`, `submitPropertyInquiry`, `PropertyPageBuilder` + `components/property/*`; **build** the crawlable serving path (edge layer serving HTML + sitemap + cached media on an Arriv subdomain), the visual uplift per §0, and `MarketingAsset` generation for captions/copy.
- **Dependencies:** feature flag authorized; owner decision on the public subdomain; DNS control.
- **External accounts/permissions:** none (no Meta/Google approvals needed).
- **Development risks:** canonical consistency; cache invalidation on unpublish/status change; keeping the "no raw Drive URL" rule.
- **Operating cost:** AI ≈ $0.02/listing one-off; page/media invocations as modelled in §11 (reduced by edge caching); edge hosting on a free/low tier.
- **Acceptance tests:** published listing reachable at the canonical URL with correct HTML/metadata/JSON-LD; unpublished/sold/unconfirmed listings excluded from sitemap and search; media 404 outside the approved selection; inquiry routed only to the authorized contact; visual parity checks against the delivery gallery.
- **Flags:** existing `PROPERTY_VISIBILITY_ENABLED` (dark) + a per-customer pilot flag.
- **Rollback:** flag off (already fails closed) — public surfaces disappear immediately.
- **Prerequisites:** owner authorization of the flag, subdomain decision, design sign-off.

### Release 2 — Authorized Instagram and Facebook publishing
- **Build/reuse:** reuse `MarketingCampaign`/`MarketingAsset`/`ScheduledPublication`, workflow + audit patterns, consent-snapshot pattern; **build** app-user connector integration (connect/disconnect UI, connection status, publish functions), caption/creative generation, idempotent dispatch, connection-health checks.
- **Dependencies:** Release 1 asset pipeline; registered workspace connector; Arriv Meta app.
- **External accounts/permissions:** Meta Business Verification, App Review for `instagram_business_content_publish` and `pages_manage_posts`, Instagram professional accounts and/or Facebook Pages per customer, PPA/2FA guidance for customers.
- **Risks:** token expiry (platform does not perform Meta's long-lived exchange) → scheduled posts failing; the 100-posts/24h limit; no comment moderation; Page insight metric changes.
- **Cost:** API calls free; AI caption ≈1 credit/post; negligible infra.
- **Acceptance tests:** connect/disconnect per customer; publish single image, carousel and video/Reel; duplicate retry never double-posts; revoked authorization stops all future posts; expired connection fails closed with a customer-visible prompt.
- **Flags:** `SOCIAL_PUBLISHING_ENABLED` (new, dark); per-channel flags.
- **Rollback:** flag off; already-scheduled publications cancelled rather than dispatched.
- **Prerequisites:** Meta app review approved; legal review of caption rules; brokerage approval workflow extended to posts.

### Release 3 — Customer-funded Google and Meta advertising
- **Build/reuse:** reuse `AdvertisingAuthorization`/`AdvertisingBudget`/`MarketingPerformance` + Stripe (for any *service* fee, never ad spend) + kill-switch pattern; **build** Meta Ads via the platform connector (app-user mode, `ads_management`) and Google Ads via a new Google Cloud + Ads API integration.
- **Dependencies:** Releases 1–2; housing-compliance rules encoded; reporting ingestion; spend alerting.
- **External accounts/permissions:** Google developer token (Basic), OAuth verification, manager-account linkage, advertiser verification; Meta ads permissions/App Review; each customer's own ad accounts.
- **Risks:** Google access approvals are currently slow; ad review rejection is outside Arriv's control; housing targeting restrictions limit reach (no ZIP/age/gender); spend errors are financially material — hard caps and kill-switch mandatory.
- **Cost:** API calls free; Arriv service fee is a business decision; ad spend is customer-funded and must never be fronted.
- **Acceptance tests:** no spend without a live authorization; campaign cannot exceed its cap; pausing is immediate and per-customer; revoked authorization stops spend; reported metrics reconcile with the platform's own totals; housing designation enforced on every campaign.
- **Flags:** `ADVERTISING_AUTOMATION_ENABLED` (new, dark) per channel.
- **Rollback:** pause-all per customer; global kill-switch; authorization revocation.
- **Prerequisites:** owner-approved commercial terms; counsel sign-off on housing advertising; billing separation proven.

---

## 13. BLOCKERS REQUIRING OWNER DECISIONS

1. **Enable property pages?** `PROPERTY_VISIBILITY_ENABLED` is currently dark and all public surfaces fail closed. Nothing can be published until this is authorized.
2. **Crawlable hosting decision.** Accept the SPA limitation (weak SEO) or approve an external rendering layer on an Arriv-controlled subdomain (recommended). Requires DNS/subdomain ownership.
3. **Meta app decision.** Commit to Arriv's own Meta app (Business Verification + App Review) to enable per-customer Instagram/Facebook connections, and accept the documented token-expiry/re-consent behaviour.
4. **Google Ads decision.** Confirm the custom Google Ads API route (native Base44 Google Ads cannot serve customers), including developer-token access and OAuth verification effort.
5. **Commercial terms.** Whether the $49 / $99 per-property packages and $79/month subscription are real, and what Arriv's service fee is versus customer ad spend.
6. **Legal.** Fair-housing/advertising copy rules and brokerage disclosure requirements for social and paid ads (counsel), plus retention/deletion policy for marketing data.
7. **Pilot scope.** Which customer(s), how many properties, and what "approved" means operationally for the first release.
8. **Credit economics.** Provide the workspace's credit price so §11's invocation model can be converted to dollars before any pricing promise.

---

## 14. RECOMMENDATION FOR THE FIRST IMPLEMENTATION STEP

Do **Release 1 only**, and start with the two things that are cheap, reversible and unblock everything else:

1. **Stand up the crawlable serving path** for the already-certified property engine on an Arriv-controlled subdomain (HTML, sitemap and cached media), leaving the feature flag dark until the owner flips it for a single pilot customer.
2. **Deliver the visual uplift** described in §0 (gallery-grade cinematic media treatment with cream/white reading surfaces) on the existing property surfaces.

Both reuse code that is already built and certified (37/37 checks, with no synthetic records left behind), require **no external approvals**, no new spend, and no customer-facing commitments — and they are the prerequisites for social publishing (Release 2) and advertising (Release 3).

---

*End of Phase 0 audit. No implementation was started and no production object was modified.*