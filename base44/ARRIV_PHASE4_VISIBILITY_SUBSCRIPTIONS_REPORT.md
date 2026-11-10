# Arriv Estate Media — Phase 4 Implementation Report

**Recurring SEO, Local Property Discovery & Lead Generation Subscriptions**

Date: 2026-11-10 · Scope: Phase 4 (final development phase) plus Phase 1–3 correction review

---

## 0. Status in one paragraph

Phase 4 is implemented and tested. Subscription products, agent and brokerage profiles, geographic
discovery, profile lead routing, recurring billing state handling, the customer Subscription & Visibility
dashboard, the administrative Visibility & SEO console and a Launch Readiness screen all exist and are
wired. Every new activation path is fail-closed: no customer can be charged, no profile can become public
and no geographic page can be indexed until an administrator deliberately turns on the matching switch.
Nothing external is claimed as verified. The app builds cleanly, the Phase 4 suite passes **134/134**, and
the Phase 1 (46), Phase 2 (77) and Phase 3 (182) suites still pass unchanged.

---

## 1. Features implemented

### Subscription products
- Three configurable monthly products: **Agent Presence $49**, **Agent Growth $99**, **Brokerage $249**
  (defaults; every price, seat allowance and feature list is a stored, administrator-editable record).
- Configurable seat allowance per plan (Brokerage includes 3) and an explicit additional-seat policy
  (`included_only`, `per_seat`, `contact_support`). Nothing is treated as unlimited.
- Entitlements are recomputed from subscription status on every read. A stored `plan_key` never unlocks
  anything on its own.

### Agent and brokerage profiles
- One record type for both, with publication states `DRAFT → READY_FOR_REVIEW → APPROVED → PUBLISHED`,
  plus `UNPUBLISHED` / `ARCHIVED`.
- Publication requires **three** independent things: the owner's recorded authorization, an
  administrator's approval, and the publication switch.
- Licences and brokerage affiliations are displayed **only** after an administrator verifies them; a
  changed licence or affiliation automatically reverts to unverified.
- Brokerage management of an agent profile requires: an active brokerage manager, the agent actually on
  that brokerage's roster, and a verified affiliation. Every step is checked server-side.
- Public projection deliberately omits owner/team addresses, verification evidence and routing rules.

### Local property discovery
- Data-driven markets (`GeographicMarket`) with a per-market minimum published-property threshold
  (default 3). A market page is indexable only when it is published, approved, flagged `index`, **and**
  currently meets its threshold.
- Market pages reuse the directory's own eligibility query, so a sold, withdrawn or stale listing can
  never appear on a city page.
- No market pages are pre-created and none are fabricated: the admin must write a factual introduction
  (minimum 120 characters) and clear the property threshold before publishing.

### Lead generation and routing
- `ProfileInquiry` is written **before** any delivery is attempted, then delivered through Brevo with the
  visitor as reply-to.
- Routing goes only to an address the profile authorized: the owner, or a brokerage's configured team
  addresses. A configured-but-unauthorized address is ignored. An unroutable profile refuses the
  inquiry rather than silently dropping it.
- Consent is a required, recorded checkbox; the exact consent and disclosure wording is snapshotted on
  the record. Spam scoring (honeypot, links, commercial keywords, caps, repeat sender/IP) sends a
  borderline message to review and a definitive bot to `rejected_spam` without delivering anything.
- Failed deliveries are retried by the hourly sweep with backoff, up to four attempts.

### Subscription billing
- Stripe Checkout in `subscription` mode on the existing Stripe account. Cards and the recurring mandate
  stay in Stripe.
- Webhook handling added for `customer.subscription.created/updated/deleted` and
  `invoice.paid` / `invoice.payment_failed`, applied **once** per Stripe event id, and unable to move a
  cancelled subscription back to active.
- Customer controls: cancel at period end, keep the plan (reverse cancellation), upgrade (immediate,
  prorated) and downgrade (next renewal, no double charge). Billing history is built only from invoices
  Stripe actually reported.
- An hourly sweep reconciles with Stripe so a missed webhook cannot leave entitlements wrong for long,
  and expires periods that ended without renewal.
- Existing one-time payment, commission, Preferred-membership and Connect webhook branches are untouched;
  the new block never returns early.

### Customer dashboard
`/VisibilityDashboard` — plan and billing status, upgrade/downgrade/cancel, billing history, profile
editing, authorize/submit/unpublish, authorized listings, recorded traffic by channel, inquiries with
delivery state and source, marketing-asset availability, and a brokerage team view with seat usage.

### Administration
`/AdminVisibility` — activation switches (each requiring confirmation), product/pricing configuration,
profile approval and publication, licence and affiliation verification, market creation and publication,
subscription list, and the lead queue with delivery state and source.

### Launch Readiness
`/LaunchReadiness` — 16 components each reported as Ready / Requires configuration / Requires your
authorization / Requires production verification / Blocked, with the concrete next step for each.

---

## 2. Files, entities and functions

### New entities
`VisibilityPlanProduct`, `ProfessionalProfile`, `VisibilitySubscription`, `ProfileInquiry`,
`GeographicMarket` — all with admin-only RLS. Every public surface is served by a service-role function
that applies the publication rules, so no customer or visitor reads these records directly.

### New shared modules
`visibilityPlans.ts` (catalogue, entitlements, seats, change policy) · `visibilitySwitches.ts` (four
fail-closed switches) · `professionalProfile.ts` (slug, publication blockers, permissions, public
projection) · `professionalSeo.ts` (canonical, metadata, JSON-LD, breadcrumbs) · `professionalRanking.ts`
(professional directory order, deliberately separate from property placement) · `geoMarkets.ts` (market
slug, eligibility, indexability, sitemap entry) · `visibilitySubscriptionEngine.ts` (Stripe event →
record state, idempotent) · `stripeSubscriptions.ts` (checkout, cancel, resume, plan change, invoices) ·
`profileInquiry.ts` (validation, consent, spam, routing, email body) · `visibilityActor.ts` (identity) ·
`professionalPageRender.ts` (server-rendered HTML).

### New functions
`manageProfessionalProfile` · `manageVisibilitySubscription` · `submitProfileInquiry` ·
`getVisibilityDashboard` · `getPublicProfessionalDirectory` · `getPublicGeographicPage` ·
`getPublicVisibilityPage` (server-rendered HTML for the Worker) · `adminVisibilityConsole` ·
`processVisibilitySubscriptions` · `getLaunchReadiness` · `testPhase4VisibilitySuite`.

### New workflow
`Visibility Subscription Sweep (hourly)`.

### New pages and components
`AgentDirectory` · `PublicProfessionalProfile` · `GeographicProperties` · `VisibilityDashboard` ·
`AdminVisibility` · `LaunchReadiness`; components `PlanCard`, `ProfileInquiryForm`, `MarketLinks`; libs
`professionalVisibility.js`, `seoMeta.js`.

### Existing files changed (minimal, additive)
- `generatePropertySitemap` — appends eligible market pages and published, approved, indexed profiles.
- `handleStripeWebhook` — added the visibility-subscription block (imports + one non-returning branch).
- `PropertyDirectory` — renders `MarketLinks` (internal links to city pages that actually exist).
- `App.jsx` — six new routes (public pages unwrapped, internal pages wrapped like the rest).
- `Layout.jsx` — "Subscription & Visibility" for customers, "Visibility & SEO" and "Launch Readiness"
  for administrators.

---

## 3. Automated test results

| Suite | Result |
|---|---|
| `testPhase4VisibilitySuite` | **134 / 134 pass** |
| `testPhase1LeadFlow` | 46 / 46 pass |
| `testPhase2PropertyPackageSuite` | 77 / 77 pass |
| `testPhase3AdCampaignSuite` | 182 / 182 pass |
| `testPropertyCertificationGuards` | 31 / 31 pass |
| `vite build` | exit 0, no unresolved imports |

Phase 4 coverage: plan pricing and distinctness from Phases 2–3; seat allowance and policy; entitlements
on active/unpaid/expired/cancelled states; upgrade vs downgrade timing and proration; publication
blockers and public visibility; licence and affiliation suppression until verified; owner, stranger,
administrator and brokerage-manager permissions; directory eligibility-before-ranking and paid labels;
market slug, eligibility thresholds, indexability and sitemap exclusion of thin pages; canonical URLs,
robots directives, JSON-LD omission of unverified facts, breadcrumbs and metadata length; inquiry
validation, consent, spam scoring, routing (owner, team, unrelated-address refusal, unroutable), and
channel attribution; subscription state machine including redelivery idempotency, invoice history
de-duplication, cancellation non-resurrection, past-due handling, expiry, period-end benefit loss and
renewal-notice windows.

**These are deterministic checks.** No Stripe request, no email and no record write occurs during the
suite. Passing them does not prove Stripe, Brevo or the Cloudflare Worker are configured or deployed.

---

## 4. Subscription products

| Product | Price | Interval | Seats | Additional seat | Directory weight |
|---|---|---|---|---|---|
| Agent Presence | $49 | monthly | 1 | — | 0 |
| Agent Growth | $99 | monthly | 1 | — | 20 (priority) |
| Brokerage | $249 | monthly | 3 | $29/month, per-seat policy | 20 |

All values are stored on `VisibilityPlanProduct` and editable in Administration → Visibility & SEO →
Plans. Stripe price ids are empty until an administrator creates them in Stripe.

---

## 5. SEO and directory capabilities

- Canonical URL, unique description, `robots` directive, Open Graph tags and BreadcrumbList on every new
  page type; JSON-LD `RealEstateAgent` / `Organization` for profiles and `CollectionPage` + `ItemList`
  for discovery pages.
- Structured data omits unverified licences and unverified affiliations rather than publishing them with
  caveats.
- Server-rendered HTML for `/agents`, `/agents/:slug`, `/brokerages`, `/brokerages/:slug` and
  `/properties/in/:city-state` via `getPublicVisibilityPage` (`format=html`).
- Sitemap now includes only published+approved+indexed profiles and only published+eligible markets.
- Internal linking: the directory links to eligible city pages; profiles link to their properties; city
  pages link to local agents.
- Professional ranking is a **separate** implementation from property placement: a paid agent subscription
  cannot reorder paid property promotions, and property promotion cannot promote a profile.
- No guaranteed rankings, indexing, traffic or lead volume is claimed anywhere in the UI.

---

## 6. Features remaining disabled

All of the following are OFF and unchanged by this work:

- Subscription checkout (`visibility_subscription_checkout`).
- Agent/brokerage profile publication (`visibility_profile_publication`).
- Geographic page publication (`visibility_geo_publication`).
- Subscription/billing customer emails (`visibility_customer_notifications`).
- Phase 2 package checkout, Phase 3 advertising checkout, Meta connection, automated publishing and
  budget execution (all still unset/off).
- No Cloudflare Worker change was deployed; no Stripe price was created; no customer was charged.

---

## 7. Cloudflare deployment requirements

The Worker currently proxies one page path (`/properties/:slug`) to
`functions/getPublicPropertyPage`. The Phase 4 public routes need an equivalent proxy. The exact patch and
verification steps are in `edge/property-edge/PHASE4_WORKER_ROUTES.md`. Summary:

1. `/agents`, `/agents/:slug`, `/brokerages`, `/brokerages/:slug`, `/properties/in/:city-state` must each be
   forwarded to `functions/getPublicVisibilityPage` with the matching `kind` and `slug`.
2. Cache keys must be the public URL, and the existing `X-Robots-Tag` logic can stay: the renderer already
   emits `noindex` for anything unpublishable.
3. The new paths must be added to the purge key list so an unpublish or eligibility change drops the page.
4. `/sitemap.xml` needs no change — it reads the same function, which now includes the new page types.

**Not deployed. Requires authorization.**

---

## 8. Stripe activation requirements

1. Create three recurring prices in the existing Stripe account ($49, $99, $249 monthly) and paste the
   `price_…` ids into Administration → Visibility & SEO → Plans.
2. Confirm the webhook endpoint subscribes to `customer.subscription.*`, `invoice.paid` and
   `invoice.payment_failed` in addition to the existing events.
3. Run one Stripe test-mode subscription end to end: checkout → `active` record → billing history entry →
   cancel at period end → expiry.
4. Only then enable `visibility_subscription_checkout`.

No new Stripe account, no additional test charges and no change to one-time payment flows are required.

---

## 9. Estimated operating costs

These are orders of magnitude, not quotes — confirm against current provider pricing.

| Item | Driver | Estimate |
|---|---|---|
| Base44 entities / functions | Reads and writes per visit | Linear in traffic; public pages are served from the Worker cache, so origin renders are absorbed by cache hits |
| Cloudflare Worker | Requests + CPU | Small; static HTML cached with `Cache-Control`, so origin calls are proportional to cache misses, not visits |
| Brevo email | 1 send per profile inquiry + ~2 per subscription per month | Tens of messages per month at current volume |
| Stripe | 2.9% + $0.30 per charge | Per transaction only |
| AI calls | None added in Phase 4 | $0 |
| Property traffic | One aggregated row per property/day/channel | Growth is per property per day, not per view |

Scalability risks, stated plainly: (a) the profile directory filter loads published profiles (limit 300)
in memory — fine for hundreds, should move to indexed queries beyond a few thousand; (b) the launch
readiness screen counts listings per market sequentially — fine for tens of markets, should be batched
beyond that; (c) market eligibility is refreshed hourly, so an inventory drop can remain indexable for up
to an hour.

**Cloudflare Analytics Engine assessment:** it would let the Worker record page views without touching the
app database at all, and it is priced per data point written rather than per request — attractive at high
volume. The current design already avoids per-view database writes (one aggregated `PropertyTrafficDaily`
row per property/day/channel), so adopting Analytics Engine is a cost optimization, not a requirement. It
also adds a second source of truth for traffic figures, which would need reconciliation before replacing
the current numbers. Recommendation: evaluate after launch, once real visit volume is known. No change
made.

---

## 10. Remaining live verification requirements

Nothing below is claimed as done.

1. Deploy the Worker routes, then load each public path on the properties host and confirm status 200,
   canonical, robots and rendered content.
2. Confirm `sitemap.xml` on the public host lists only intended pages, then submit it in Search Console.
3. Stripe: create the three prices and verify one full subscription lifecycle in test mode.
4. Brevo: confirm the sending address is active; send one real inquiry and one real renewal notice to a
   controlled inbox.
5. Publish one real agent profile end to end (authorize → approve → publish → inquire → lead delivered).
6. Publish one real market page and confirm eligibility and indexing behaviour with a listing removed.
7. Confirm the hourly sweep has a successful run in Workflows.
8. Phase 1–3 live paths (package purchase, advertising manual fulfilment) remain unverified for the same
   reason as before: they require a real transaction and, for advertising, real Meta work.

---

## 11. Phase 1–3 correction review

Audited during this phase. No unfinished software path was found that blocks the agreed launch scope, and
no feature was left disguised as future work. Two integration paths remain deliberately unavailable for
external reasons rather than missing code:

- **Automatic Meta publishing/reporting** — no credentials. Manual fulfilment is the complete, supported
  path and is fully wired.
- **Worker route deployment** — the artifacts are prepared and documented; deploying is a deliberate
  external action.

---

## 12. Conclusion

For the agreed launch scope — free property pages and buyer lead delivery, $79/$149 visibility upgrades,
$149/$299/$599 managed advertising, and $49/$99/$249 recurring agent and brokerage subscriptions, with
customer dashboards, reporting, billing and administration — no further application development is
required. What remains is configuration, credential entry, one Worker deployment and live verification,
each listed in `PHASE4_ACTIVATION_CHECKLIST.md`.