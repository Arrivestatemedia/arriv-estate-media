# Property Visibility — Phase 3: Arriv-Managed Advertising

Implementation report. Every claim below is either enforced in code or explicitly marked as not yet
available. Nothing here has run against a live advertising platform.

## What Phase 3 adds

A fourth paid product, separate from Visibility Plus and Pro: Arriv creates, publishes and manages an
advertising campaign for one property page, inside Arriv's own advertising accounts.

| Package | Price | Advertising budget | Management fee | Duration | Creative |
| --- | --- | --- | --- | --- | --- |
| Starter Campaign | $149 | $75 | $74 | 7 days | 1 |
| Growth Campaign (recommended) | $299 | $175 | $124 | 14 days | 3 |
| Premium Campaign | $599 | $400 | $199 | 30 days | 5 |

Advertising is never bundled into a visibility package and never implied by one. Advertising spend is
reserved customer money: it is booked as a budget commitment, never as Arriv revenue, and it cannot be
spent outside its own campaign.

**One naming risk to note:** Starter Campaign is $149 and Visibility Pro is also $149. They are
different products recorded in different entities, and the UI labels each one, but the two $149 price
points sit close enough to be worth watching in the checkout screens.

## Customer journey

1. `prepare` builds a draft campaign and assembles deterministic creative from the **approved** listing
   content only. No feature, price, amenity or availability is invented.
2. The customer sees the exact creative, the budget and the total, and accepts the authorization. The
   authorization snapshot and a creative fingerprint are stored: a material change invalidates the
   approval.
3. Customer approval moves the campaign to `APPROVED`, then `AWAITING_PAYMENT`.
4. Payment is a one-time Stripe payment intent created by the server. The browser only receives its
   client secret; the amount and the entitlement are never decided client-side.
5. `confirm_purchase` re-verifies the payment with Stripe. A success webhook does the same,
   idempotently, so a repeated delivery can never create a second campaign or a second budget.
6. Payment alone lands the campaign at `READY_FOR_REVIEW`. It never reaches launch by itself.

## State machine and launch gates

`DRAFT → AWAITING_CUSTOMER_APPROVAL → APPROVED → AWAITING_PAYMENT → PAID → READY_FOR_REVIEW →
READY_TO_LAUNCH → SUBMITTED → ACTIVE → COMPLETED`, plus `REJECTED`, `PAUSED`, `FAILED`, `CANCELLED`,
`REFUND_PENDING`, `REFUNDED`. Illegal transitions are refused server-side.

A launch requires all of the following, checked in `launchBlockers()` on every attempt:

- the campaign's scheduled start has arrived and its stored status allows a launch;
- administrator approval, and a customer authorization that is still current for the approved creative;
- the listing is still published, available, and authority is still confirmed;
- the provider account is `connected`, its special ad category includes `HOUSING`, and its native
  lifetime-budget controls are verified;
- all three execution switches are on: `meta_connection`, `auto_publish`, `budget_execution`.

`provider_campaign_id` is the launch idempotency key: once it exists, no second launch is possible.
Campaigns that cannot launch are held with the blocking reasons written back to the record, so a delay
is never silent.

## Advertising budget

- `ad_budget_cents` is committed to the ledger on payment; `management_fee_cents` is recognised
  separately. Committed budget is never treated as revenue.
- Spend is recorded only from what the platform reports, with a ledger entry per observation and a
  running balance after each entry, so any campaign can be reconciled.
- The authorized budget is a hard ceiling: if reported spend ever equals or exceeds it, the campaign is
  paused rather than allowed to overspend.
- Every entry is append-only (`PropertyAdLedgerEntry`) with the actor, reference and timestamp.

## Property eligibility and immediate enforcement

Advertising follows the listing, in two layers:

1. The 15-minute sweep pauses any campaign whose property has become ineligible (sold, withdrawn,
   unpublished, archived, or authority no longer confirmed).
2. `managePropertyListing` calls the same guard the moment a listing's publication state, status or
   authority changes — so a sold property stops advertising immediately, not up to 15 minutes later.

Critically, a campaign that exists at the platform is **never** marked paused locally when the platform
cannot be reached from that call. It is flagged for review and reported for a manual stop, because a
local pause does not stop delivery. Administrators are emailed when that happens.

## Reporting

Figures are the platform's own, stored as returned, with the report time and source. Anything not yet
reported renders as "not reported yet" rather than a zero. Inquiries captured on the property page are
attributed through campaign parameters, so leads can be tied back to the campaign that produced them.

## Surface area

- Customer: an advertising panel on the property page builder (packages → creative approval → card
  payment → live status, budget and platform results).
- Admin: `/AdminPropertyAdCampaigns` — portfolio table (status filters, sorting, paging, CSV export of
  the filtered set), account readiness, the four safety switches, and a per-campaign panel with
  approve / launch / sync / pause / resume / reject / refund / terminate, each written to the audit trail.
- Automation: workflow **Property Ad Campaign Sweep (15min)** → `processPropertyAdCampaigns {sweep}`.

## What is deliberately not live

- **Meta Marketing API**: the provider adapter, account model and readiness checks are implemented, but
  the API credentials were not provided, so no campaign has ever been sent to Meta. `publishing_available`
  reports false and the UI says so.
- **Google Ads**: readiness reporting only. There is no Google Ads channel implementation, and none is
  claimed.
- **Refunds**: an administrator's recorded decision is required; refunds run through the existing Stripe
  rails. No refund is issued automatically.

## Activation checklist

1. Add the platform secrets (dashboard → Secrets): `META_MARKETING_ACCESS_TOKEN`, `META_BUSINESS_ID`,
   `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, optionally `META_GRAPH_API_VERSION`.
2. Confirm the Meta business is verified, the `HOUSING` special ad category is enabled, and native
   lifetime budget + scheduling controls work on that account. Mark the provider account `connected`
   and `spend_controls_verified` only after a real check.
3. Run one supervised campaign end to end with `auto_publish` off: approve and launch manually, then
   reconcile the first reported spend against the ledger.
4. Turn `budget_execution` on only after that reconciliation.

## Verification

`testPhase3AdCampaignSuite` — **151 checks, 151 passing.** Covers the pricing and budget split, quote and
disclosure content, eligibility, authorization currency, illegal transitions, payment idempotency,
launch gating on each safeguard, budget ceiling enforcement, pause and resume accounting, refund
decisions, reporting attribution, listing-change enforcement and certification isolation.

The suite simulates every advertising call. A passing suite proves accounting, eligibility, state
transitions and safeguards; it does not establish live advertising capability. Phase 2 remains green
(77 checks) and the app builds cleanly.