# MLS publishing destinations

Recorded 2026-11-09. Implements automatic MLS detection, overlapping-territory selection and
independent per-MLS submissions behind the single existing **Publish to MLS** button.

Related: `BRIGHT_MLS_SERVICE_AREA_ROUTING.md` (the geographic map), `BRIGHT_MLS_CERTIFICATION_STATUS.md`
(the integration tests that keep Bright dark).

## The registry

Two layers, both data:

**Territories** — `mls_service_regions` (AppSetting, over `DEFAULT_MLS_SERVICE_REGIONS` in
`base44/shared/mlsRegions.ts`). Each region carries the provider it publishes to and its coverage:
`jurisdictions` (state + county / independent city), `zip_prefixes`, `counties`, `cities`, and `states`
as the map's *scope* only. Coverage is verified per region.

**Providers** — `mls_providers` (AppSetting, over `MLS_PROVIDER_DEFAULTS` in
`base44/shared/mlsProviders.ts`). Two flags beyond `enabled`:

| provider | advertised | operational | enabled (automation) | certification |
| --- | --- | --- | --- | --- |
| fmls | yes | yes (Matrix, by hand) | yes | not required |
| bright_mls | yes | yes (by hand until activated) | **no** | **not passed** |
| georgia_mls | **no** | **no** | no | not passed |

`advertised && operational` is what makes an MLS a destination a property can be routed to. Georgia
MLS is neither, so no address is ever sent there and it is never named to a customer. Making it a real
destination later is: add its service area, flip the two flags. The customer experience does not
change, because the flow below is already plural.

## Detection

`resolveDestinationPlan(regions, providers, location)` (`base44/shared/mlsTerritories.ts`):

1. `collectTerritoryMatches` returns the **union** of every region covering the address, each at the
   most specific level it can match (zip → county → city → official jurisdiction → state-wide). Union
   matters: a state-wide MLS and a county-level MLS both cover the same property, and both must be
   visible.
2. Each match is reduced to its provider; only advertised + operational providers survive. Two regions
   of one provider still produce one destination.
3. Policy:
   - **1 eligible** → `auto`. Selected server-side. No selection screen, no membership question.
   - **2+ eligible** → `selection_required`. Only those systems are offered, all preselected, policy
     stated verbatim (`MLS_SELECTION_POLICY`), customer may keep one, several, or all.
   - **0 eligible** → `review`, with `jurisdiction_unknown`, `coverage_unmapped`,
     `provider_not_advertised` or `missing_location`, and the likely provider named for the MLS team.
     Never a guess, never a blocked customer.

A destination's `publishing_mode` is `automatic` only when the provider is live **and** API-driven;
everything else is `arriv_team`, and the customer copy says so instead of implying an import finished.

## Submission

`submitMlsUploadRequest` re-resolves the plan server-side (the browser's answer is only a preference)
and then writes **one `MlsUploadRequest` row per selected MLS**, plus one `MlsPublishingRequest` group
recording the selection, the policy shown and each destination's outcome.

- Each row keeps its own status, retries, manifest, provider identifier and status history.
- `runDestinations` isolates each write: a failure on one destination cannot roll back, rewrite or
  duplicate another. The response lists one result per destination, and a group is `partial` when some
  succeeded and some did not.
- Idempotency is per destination — `destinationIdempotencyKey(jobId, provider, normalizedNumber)` —
  and per submission — `selectionKey(providerIds)`. A repeated click or a refresh returns the open
  group instead of writing again, and a row already open for that MLS + listing is returned as
  `duplicate` rather than recreated.
- Listing numbers: one field when one destination needs one; per-MLS fields when several do.

## Service area is not the compulsory listing area

FMLS has members in every Georgia county; its compulsory listing area (where a member must enter the
listing into FMLS) is a much smaller set. Those are different facts and are kept apart:

- **Routing boundary** — `mls_service_regions.fmls_georgia` stays state-wide: `states: ["GA"]`, no
  counties, no zips, no jurisdiction list. Every Georgia property therefore routes to FMLS exactly as
  it always has.
- **Metadata** — `fmls_georgia.compulsory_counties` holds the 23 compulsory counties
  (`FMLS_COMPULSORY_LISTING_AREA`, Rule 6.1(a), FMLS Rules & Regulations effective 14 Jan 2026, with
  its source recorded). It is never read by the matcher: the matcher only looks at
  `zip_prefixes`, `counties`, `cities`, `jurisdictions` and `states`.
- **Georgia MLS** — `service_area_metadata` records that it advertises all 159 Georgia counties. That
  is advertised coverage, not routing coverage: the provider is `advertised: false`,
  `operational: false`, `enabled: false`, so no address is routed to it and it is never named to a
  customer. When it becomes operational, coverage is added as its own region and the real overlap with
  FMLS decides what the customer is offered — the compulsory list is not used to guess it.

## Incomplete addresses

A property publishes against one specific listing, so the address that decides the MLS has to be the
real one: street line, city, state and ZIP (`assessAddressCompleteness`).

- **Incomplete and unroutable** → the plan is `needs_address` (`incomplete_address`), with the missing
  parts named and no provider chosen. The Publish to MLS button is unchanged; the modal shows a short
  address form instead of destinations, and the customer completes it there.
- **Re-detection** — the completed address is sent back as `propertyAddress`; both endpoints re-geocode
  it (Census geocoder) and re-run detection from scratch. Nothing is written to the Booking or Job.
  The submission records the corrected address, so the request is judged against the address that was
  actually checked.
- **Still ambiguous, or complete but uncovered** → administrative review, exactly as before, with no
  guessed provider. A complete address never prompts, and a resolvable address never prompts — the
  existing Georgia/FMLS flow is untouched by this.

## Deliberately unchanged

FMLS's manual queue and validation, Bright's manifest building and gating, the delivery gallery,
photo selection and order, unbranded YouTube tour links, and the Property Listing Page Builder.

Bright stays dark: region `enabled: false`, provider `enabled: false`, all four certification switches
`false`. No live Bright submission was made while building this.

## Test results

Routing tests (unit, over the real shared modules, real addresses through the Census geocoder):
**29 passed, 0 failed.**

| # | Case | Result |
| --- | --- | --- |
| 1 | Vienna, VA — one eligible MLS | `auto`, Bright selected, coverage "Fairfax County, VA" |
| 2 | DMV address | only the covering MLS offered |
| 3 | Atlanta, GA — default registry | `auto`, FMLS; Georgia MLS not offered |
| 4 | Georgia with a second operational MLS (simulated) | `selection_required`, exactly 2 eligible, both preselected, policy present |
| 5 | Customer picks one / several / all | accepted; a system that does not cover the property is refused; empty selection refused |
| 6 | "Bethesda, MD" (no street, county unresolvable) | `review` / `jurisdiction_unknown`, Bright named as candidate, nothing preselected |
| 7 | Bright eligible, publishing disabled | `arriv_team`, `live_for_customers: false`, copy says activation is finishing |
| 7b | Same code, Bright certified + activated (simulated) | flips to `automatic`; no UI change needed |
| 8 | One MLS succeeds, another fails | 2 results, one `ok` with its request id, one `failed` with its error; no retry, no loss |
| 9 | Duplicate clicks / refresh | idempotency key stable; group signature order-independent; open row matched instead of duplicated |
| 10 | Registry honesty | Georgia MLS neither advertised nor operational; FMLS and Bright are, Bright still unactivated |
| 6e | "Atlanta, GA" (incomplete but resolvable) | `auto` → FMLS; the existing FMLS workflow is not interrupted |
| 6c | "Bethesda, MD" → corrected "7001 Arlington Rd, Bethesda, MD 20814" | prompt → re-geocode → `auto`, Bright, "Montgomery County, MD" |
| 6d | "100 Main St, Wilmington, DE 19801" (complete, no mapped MLS) | review `coverage_unmapped`, no prompt |
| 6f | Submitting an unplaced address | refused: no destination can be selected |
| 13 | FMLS compulsory metadata | 23 counties (Fulton in, Bibb out), Rule 6.1(a) source recorded |
| 13b | Compulsory list vs routing boundary | coverage still state-wide: no counties/zips/jurisdictions on the region |
| 13c | Macon GA (Bibb, outside the compulsory area) | `auto` → FMLS; service area, not compulsory area, decides |
| 13d | Admin override without the metadata | documented compulsory list preserved |
| 14 | Georgia MLS | unadvertised, not operational, inactive; all-159-county coverage recorded as metadata only, and Atlanta still offers FMLS alone |

Endpoint checks: `getMlsUploadRequests` (client mode) returns a `review` plan for the one delivered
fixture job with no invented destination; `submitMlsUploadRequest` still rejects a non-owner (403)
before any write. Client build passes. No production records were created and no provider API was
called.

## Unresolved routing ambiguities

1. **FMLS is configured state-wide.** The moment any second Georgia MLS becomes operational for one
   county, every Georgia address becomes an overlap and customers see the selection screen. That is
   literally correct ("both systems cover the property"), but if Arriv wants Georgia addresses outside
   that MLS's counties to keep the no-question flow, FMLS's region should be narrowed to its
   documented counties. Decision needed before Georgia MLS is activated.
2. **No street = no county.** Addresses like "Bethesda, MD" cannot be geocoded, so they route to
   review. Asking the customer to correct the property address would clear these faster than an
   administrator; not built, because it changes the gallery's data entry.
3. **Membership is never inferred.** Eligibility is geographic only. The selection screen's copy is
   what asks the customer to keep only the MLS systems they belong to; if a customer keeps a system
   they do not belong to, the MLS will reject the listing and that destination alone fails.
4. **Bright's media link lifetime** (14 days) is per destination row; a regenerated manifest after
   expiry is still an administrator action.
5. Deployment: these changes reach customers on **Publish**; the editor's function runner already
   reflects them.