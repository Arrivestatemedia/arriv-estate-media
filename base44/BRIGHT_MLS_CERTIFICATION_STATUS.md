# Bright MLS — certification status record

Recorded 2026-11-09. Arriv is a **Media Sync vendor**, not a Bright MLS subscriber agent, so the
agent-side half of the flow can only be completed by the listing agent. No Arriv administrator is
ever expected to hold Bright MLS agent credentials.

## Tested so far (evidence: Bright Media Sync Code Playground)

| Test | Status | Evidence |
| --- | --- | --- |
| API authentication | **Verified** | A manifest POSTed from Bright's official Code Playground with our API key / vendor ID was accepted — not rejected with 401/403. |
| Basic manifest acceptance | **Verified** | Bright returned a valid `manifestId` for the submitted manifest. |
| Bright redirect to MLS login | **Verified** | The returned import URL (`/mlsredirect/bright/{manifestId}`) opened Bright MLS's Okta sign-in page. |
| Retrieval of Arriv's signed media by Bright | **Not yet verified** | Requires a completed import; nothing has observed Bright fetching `serveBrightMedia` links. |
| Actual agent-side media import | **Not yet verified** | Requires a Bright subscriber agent to sign in and finish the import. |

## What the playground run does and does not prove

- It proves the credentials and the documented request shape are accepted, and that Bright issues a
  `manifestId` plus a working redirect.
- It does **not** prove Bright can fetch our signed media (14-day links, single-file tokens), and it
  does not prove the media lands on a listing.
- The playground submission happened outside this app: it is not recorded on any
  `MlsUploadRequest`, so it must never be treated as a manifest this app already sent.

## Geographic service area — verified separately

Bright's published jurisdiction list is transcribed and used for address routing (see
`BRIGHT_MLS_SERVICE_AREA_ROUTING.md`, 2026-11-09). That makes the routing map authoritative, and it
changes none of the switches below: being inside Bright's area proves which MLS serves a property, not
that the integration is certified, and not that the customer belongs to Bright.

## Activation for customer publishing — 2026-11-10

The owner authorized live customer publishing so that the **first Bright customer submission is the
supervised end-to-end test**. Operational activation is recorded in a field of its own and never
written into the certification switches, which still say only what was actually proven.

`mlsProviders.ts`, provider `bright_mls`:

- `enabled: true`, `advertised: true`, `operational: true`;
- `certification`: still `authentication/manifest/media_accessibility/authorized_import = false` —
  the two verified tests from the playground are recorded in the table above, not here, and the two
  unverified ones stay false;
- `activation: { customer_publishing: true, pilot: true, pending_verification: ["media_accessibility",
  "authorized_import"] }`.

`isProviderLiveForCustomers()` now accepts **either** a full certification **or** an explicit
activation, so the route serves customers while `certificationPassed()` still reports `false`. The
customer gallery therefore shows `publishing_mode: automatic`, `certificate_complete: false`,
`pilot: true`, and the admin panel states "Live under a pilot activation — 2 certification test(s)
still unproven" rather than claiming the integration is certified.

What a Bright-eligible customer gets now: clicking **Publish to MLS** builds the manifest and POSTs it
to Bright Media Sync immediately, stores the returned `manifestId`, and opens the
`/mlsredirect/bright/{manifestId}` link (with a Continue to Bright MLS button as the fallback). The
customer signs in with their own Bright credentials; Arriv never asks for or stores them.

Pilot behaviour: every accepted submission raises an immediate administrator alert with the manifest
id, import link, media counts, Bright's HTTP status and the media-link expiry; Bright's raw reply,
attempt count and link expiry stay on the request. Recovery is the existing authorized-replacement
path in the MLS upload queue, which records a second billable manifest deliberately.

## Verified locally before activation (2026-11-10, no Bright submission)

Run with real credentials through `testBrightConnection` and `transmitBrightManifest` (preview mode,
which makes no network call to Bright):

| Check | Result |
| --- | --- |
| Configuration / secrets present | Pass — api key, vendor id, vendor name, endpoint, import-link base, signing secret |
| Manifest endpoint and redirect base | `https://agl1paz1msaasservices.bright-solutions.co` (https) |
| Media signing | A link signed and verified with the configured secret |
| Manifest contract | `validateBrightBody` on the real body: 0 blocking issues, 0 warnings, 0 gaps |
| Signed media accessibility from our side | `serveBrightMedia` returned HTTP 200, `image/png`, 155,637 bytes for the exact Drive file; a tampered token returned 401 |
| Redirect generation | `https://…/mlsredirect/bright/{manifestId}` formed correctly |
| Routing | Bethesda, MD → Montgomery County → Bright, `publishing_mode: automatic`, `can_submit: true` |
| Duplicate protection | An accepted manifest is never re-sent; an ambiguous earlier outcome blocks another send |

## Still unverified (pending the live pilot)

1. **Media accessibility by Bright** — proving Bright's own servers fetched the signed links. Locally
   the links serve the right bytes; only a live import can show Bright retrieved them.
2. **Authorized import** — a Bright subscriber agent finishing the import from the `manifestId` link.

When the pilot completes, set the two remaining certification switches after confirming both items,
which moves Bright from "pilot activation" to "certified" with no other change.