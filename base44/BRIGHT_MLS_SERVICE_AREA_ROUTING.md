# Address-based MLS routing — Bright service area

Recorded 2026-11-09. Companion to `BRIGHT_MLS_CERTIFICATION_STATUS.md` (integration tests).

## What changed

**Matching key.** A property is now matched on normalized **state + county or independent city**. Zip
prefixes and town names are no longer able to decide a route on their own. Both sides of every comparison
are normalized (case, punctuation, and a trailing `County`/`City`), so `Fairfax County`, `Fairfax county`
and `Fairfax city` compare as `fairfax` without confusing them across states.

**County resolution.** Most addresses do not spell out their county, and the app previously left it empty.
`resolvePropertyLocation` now looks the county up with the U.S. Census Bureau geocoder (keyless), which
returns the jurisdiction at exactly the level coverage is published at — `Montgomery County`,
`Alexandria city`, `Baltimore city`. Lookups are cached per address, and an address the geocoder cannot
match is left with no county rather than assumed into the nearest town. A lookup that lands in a different
state is discarded.

**A state is a scope, not coverage.** `states` on a region now only bounds the map. A region that carries
jurisdictions (or counties, cities or zips) can never match on the state alone. That is the specific fix
for the DMV being treated as one unverified block: Bright's region no longer claims "VA", it claims fifty
named jurisdictions inside VA, MD and DC.

**Match order.** zip prefix → explicit county → explicit city → official jurisdiction (state + county /
independent city) → state-wide region. Overlap between providers at the winning level still goes to review.

## The transcribed coverage

Source: Bright MLS, "Our Associations" — <https://www.brightmls.com/our-associations>, retrieved
2026-11-09. Bright's own site names the participating associations and the jurisdictions each covers.

- **Washington, D.C.** — District of Columbia (1), a single district jurisdiction, so every DC address
  matches on its state code.
- **Maryland** — all 23 counties plus Baltimore City (24): Allegany, Anne Arundel, Baltimore (county),
  Baltimore (city), Calvert, Caroline, Carroll, Cecil, Charles, Dorchester, Frederick, Garrett, Harford,
  Howard, Kent, Montgomery, Prince George's, Queen Anne's, St. Mary's, Somerset, Talbot, Washington,
  Wicomico, Worcester.
- **Virginia** — the full NVAR / DAAR / PWAR / GPR / BRAR / MAR / FAAR list, counties and independent cities
  together (25): Alexandria, Arlington, Caroline, Clarke, Culpeper, Fairfax (county), Fairfax (city),
  Falls Church, Fauquier, Frederick, Fredericksburg, King George, Loudoun, Madison, Manassas,
  Manassas Park, Orange, Page, Prince William, Rappahannock, Shenandoah, Spotsylvania, Stafford, Warren,
  Winchester.

**Not transcribed:** Delaware, New Jersey, Pennsylvania and West Virginia. Bright serves parts of each, but
this app publishes DMV properties, so an address there goes to MLS review instead of a guessed provider.

## Verified behaviour

| Address | County resolved | Route |
| --- | --- | --- |
| 123 Maple Ave, Vienna, VA | Fairfax County | Bright — Fairfax County, VA |
| 301 King St, Alexandria, VA | Alexandria city | Bright — Alexandria, VA (independent city) |
| 100 Pratt St, Baltimore, MD | Baltimore city | Bright — Baltimore, MD (not Baltimore County) |
| 1600 Pennsylvania Ave NW, Washington, DC | District of Columbia | Bright — District of Columbia, DC |
| 1 E Market St, Leesburg, VA | Loudoun County | Bright — Loudoun County, VA |
| 9809 DellCastle Rd, Gaithersburg, MD | Montgomery County | Bright — Montgomery County, MD |
| 900 E Broad St, Richmond, VA | Richmond city | Review — outside Bright's published area |
| 1 Main St, Henrico, VA | Henrico County | Review — outside Bright's published area |
| Bethesda, MD (no street, no county) | not resolvable | Review — jurisdiction unknown, Bright named as candidate |
| 123 Peachtree St, Atlanta, GA | Fulton County | FMLS (unchanged, state-wide) |
| 1 Market St, Wilmington, DE | — | Review — state not mapped |

## Eligibility is not membership

Coverage answers *which MLS serves this property*. It does not prove the customer belongs to Bright, and
nothing in the route is treated as membership. The resolution records
`coverage.eligible`, the deciding `jurisdiction`, and `coverage.membership_confirmed: false`; membership is
only evidenced later by Bright accepting a manifest for that listing.

## What was deliberately not changed

- **FMLS**: same Georgia-wide region, same manual Matrix queue, same validation. Untouched.
- **One Publish to MLS button**: the customer gallery and modal were not changed; only the route behind
  them is more precise.
- **Bright publishing stays off**: the region is `verified: true` (the coverage list is authoritative) but
  still `enabled: false`, and all four certification switches stay false. An eligible property is named as
  Bright's and worked by our MLS team; `isProviderLiveForCustomers` still returns false, so no manifest is
  transmitted and no customer is ever sent to an import link.

## Remaining certification requirements

Unchanged by this work, and all still required before an administrator activates the route:

1. **Media accessibility** — Bright fetching Arriv's signed `serveBrightMedia` links for a real photo set.
2. **Authorized import** — a Bright subscriber agent completing an import from a `manifestId` link.

Then, in order: set `media_accessibility` and `authorized_import` (with the two already verified,
`authentication` and `manifest`), activate the Bright region, and enable the provider. Only when the
region is enabled **and** all four tests pass does `submitBrightManifest` run from the customer's own
Publish to MLS.

Deployment: backend functions and shared modules change the published app only when the app is
**published**; the editor's function runner already reflects this code.