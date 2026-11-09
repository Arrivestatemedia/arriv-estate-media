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

## Certification switches — deliberately still OFF

`mlsProviders.ts`, provider `bright_mls`: `enabled: false`, certification
`authentication/manifest/media_accessibility/authorized_import` all `false`.

`isProviderLiveForCustomers()` requires **all four** flags, so two verified tests cannot activate the
route. The two remaining tests (`media_accessibility`, `authorized_import`) must pass before an
administrator turns anything on. Until then:

- customer requests route by address as before and, where the address maps to Bright, land in the
  manual queue with `manifest_status: blocked_pending_certification`;
- nothing is transmitted to Bright automatically;
- the FMLS manual Matrix queue is unchanged.

## Remaining tests, in order

1. **Media accessibility** — confirm Bright can fetch `serveBrightMedia` links for a real selected
   photo set (correct content type, bytes, 14-day expiry tolerance). Must be observed in Bright's
   logs or by the media appearing on a test listing.
2. **Authorized import** — a Bright subscriber agent completes the import from the `manifestId` link.

Only after both are confirmed should an administrator set `enabled: true` and complete the four
certification flags. Customer publishing stays disabled until then, and no further manifest is sent
without explicit authorization.