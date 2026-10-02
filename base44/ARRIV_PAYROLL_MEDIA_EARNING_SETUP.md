# Arriv Payroll — Media Specialist Earning Intake Setup

This guide describes the two backend functions the **Arriv Payroll** app must add so that Arriv Estate Media can sync media-specialist earning records and so media specialists can download their weekly/monthly statements and tax documents.

> **Critical rule:** Estate Media pays media specialists directly via Stripe Connect. Arriv Payroll must **never** issue a payment to a media specialist. The earning sync is for **statement and tax-document generation only** (`sync_purpose: "document_and_tax_only"`).

---

## 0. Secrets to set in the Arriv Payroll app

| Secret name | Purpose | Must match |
|---|---|---|
| `ARRIV_PAYROLL_API_SECRET` | Verifies inbound requests from Estate Media | The same-named secret already set in the Estate Media app |
| `ARRIV_PAYROLL_WEBHOOK_SECRET` | Signs outbound statement/tax webhooks back to Estate Media | The same-named secret already set in the Estate Media app |
| `ESTATE_MEDIA_WEBHOOK_URL` | Estate Media's receiver endpoint | `https://arrivestatemedia.base44.app/functions/receivePayrollContractorDocument` |

If the Estate Media app's `ARRIV_PAYROLL_ENDPOINT` / `ARRIV_PAYROLL_API_ENDPOINT` secret does not already point at the Payroll app's host, update it to `https://<payroll-host>` (any path is stripped — Estate Media appends `/functions/<action>` per call).

---

## 1. Function: `mediaSpecialistEarningSync`

> The function **must be named exactly `mediaSpecialistEarningSync`** — Estate Media builds the URL from the action name (`/functions/<action>`).

Receives a single earning record from Estate Media after a payout is disbursed.

### Request

`POST /functions/mediaSpecialistEarningSync`

#### Headers (sent by Estate Media)

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Arriv-Signature` | Hex HMAC-SHA256 of the canonical string (see §3) |
| `X-Arriv-Timestamp` | ISO-8601 UTC timestamp |
| `X-Arriv-Request-Id` | `req_<uuid>` |
| `X-Arriv-Source-App` | `arriv-estate-media` |

#### Body

```json
{
  "action": "mediaSpecialistEarningSync",
  "company_id": "arriv-estate-media",
  "sync_purpose": "document_and_tax_only",
  "tenant_id": "tnt_estate_media",
  "media_specialist_id": "<Estate Media partner ID>",
  "media_specialist_email": "contractor@example.com",
  "media_specialist_name": "Jack Walker",
  "shared_person_id": "<shared person ID if linked>",
  "earning_id": "earn_<job_id>",
  "job_id": "<job ID>",
  "job_date": "2026-09-26",
  "service_type": "photo",
  "gross_job_amount": 350.00,
  "media_specialist_percentage": 100,
  "gross_earning": 150.00,
  "fees": 0,
  "adjustments": 0,
  "net_earning": 150.00,
  "payout_status": "paid",
  "scheduled_payout_date": "2026-10-02",
  "actual_payout_date": "2026-10-02",
  "provider_transaction_reference": "po_<stripe_transfer_id>",
  "currency": "USD"
}
```

### Verification (must perform on every request)

1. Read `X-Arriv-Timestamp`; reject if missing or older than **5 minutes** (`isTimestampFresh`).
2. Rebuild the canonical string and verify the HMAC-SHA256 signature using `ARRIV_PAYROLL_API_SECRET` (see §3). Reject with `401` on mismatch.
3. **Idempotency:** dedupe on `earning_id`. If a record with the same `earning_id` already exists, return `{ "success": true, "duplicate": true }` — do not create a duplicate.

### Response

```json
{ "success": true, "earning_id": "earn_<job_id>", "status": "accepted" }
```

On validation error return `400` with `{ "error": "..." }`.

### What Payroll should do with the record

- Store the earning under the media specialist's payroll profile (matched by `media_specialist_email` or `shared_person_id`).
- Aggregate earnings into the specialist's weekly and monthly statement periods.
- **Do not** create a payment/run. The `sync_purpose` field is `document_and_tax_only`.

---

## 2. Function: `contractorDocumentDownload`

> The function **must be named exactly `contractorDocumentDownload`** — Estate Media builds the URL from the action name.

Returns a time-limited signed download URL when a media specialist requests a statement or tax document from the Estate Media app.

### Request

`POST /functions/contractorDocumentDownload`

Same signed headers as §1 (signed with `ARRIV_PAYROLL_API_SECRET`).

#### Body

```json
{
  "action": "contractorDocumentDownload",
  "company_id": "arriv-estate-media",
  "media_specialist_id": "<Estate Media partner ID>",
  "payroll_document_id": "<Payroll's authoritative document ID>",
  "secure_document_reference": "<opaque reference stored on the ContractorPayoutDocument>"
}
```

### Response

```json
{
  "success": true,
  "download_url": "https://<signed-time-limited-url>",
  "expires_at": "2026-10-02T20:00:00Z"
}
```

The `download_url` must be a short-lived (≤ 10 min) signed URL to the PDF/HTML document. Never return a public storage URL.

---

## 3. Signing contract (both directions)

### Inbound (Estate Media → Payroll) — canonical string

```
<body>\n<timestamp>\n<request_id>\n<source_app_id>
```

- `body` = the exact JSON string sent in the request body
- `timestamp` = the `X-Arriv-Timestamp` header value
- `request_id` = the `X-Arriv-Request-Id` header value
- `source_app_id` = `arriv-estate-media`

Signature = `HMAC-SHA256(ARRIV_PAYROLL_API_SECRET, canonical)` → hex string.

Reference implementation (copy into the Payroll app):

```ts
const enc = new TextEncoder();
function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function signPayload(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}
export function canonicalString({ body, timestamp, requestId, sourceAppId }) {
  return [body || "", timestamp || "", requestId || "", sourceAppId || ""].join("\n");
}
export async function verifySignedRequest(secret, { body, timestamp, requestId, sourceAppId, signature }) {
  if (!signature) return false;
  const ts = Date.parse(timestamp);
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return false;
  const expected = await signPayload(secret, canonicalString({ body, timestamp, requestId, sourceAppId }));
  if (expected.length !== signature.length) return false;
  let res = 0;
  for (let i = 0; i < expected.length; i++) res |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return res === 0;
}
```

### Outbound (Payroll → Estate Media) — statement/tax webhooks

When Payroll generates a weekly/monthly/YTD statement, W-9 status update, or tax document, it POSTs to:

```
POST https://arrivestatemedia.base44.app/functions/receivePayrollContractorDocument
```

#### Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Arriv-Signature` | Hex HMAC-SHA256 of the **raw body** (not the canonical string) using `ARRIV_PAYROLL_WEBHOOK_SECRET` |
| `X-Arriv-Timestamp` | ISO-8601 UTC timestamp |
| `X-Arriv-Request-Id` | `req_<uuid>` |
| `X-Arriv-Source-App` | `arriv_payroll` |

> Note: the outbound signature is over the **raw body only** (simpler), not the canonical string. Estate Media verifies with `verifySignature(webhookSecret, rawBody, signature)`.

#### Body

```json
{
  "event_type": "media_statement.weekly_created",
  "tenant_id": "tnt_estate_media",
  "media_specialist_id": "<Estate Media partner ID>",
  "media_specialist_email": "contractor@example.com",
  "media_specialist_name": "Jack Walker",
  "payroll_document_id": "<Payroll authoritative doc ID>",
  "document_type": "weekly_statement",
  "title": "Weekly Statement — Sep 26 to Oct 02, 2026",
  "period_start": "2026-09-26",
  "period_end": "2026-10-02",
  "tax_year": null,
  "status": "available",
  "secure_document_reference": "<opaque reference for download>",
  "version": 1,
  "gross_amount": 612.00,
  "net_amount": 612.00,
  "generated_at": "2026-10-02T18:00:00Z",
  "available_at": "2026-10-02T18:00:00Z",
  "supersedes_document_id": null
}
```

#### Supported `event_type` values

| `event_type` | `document_type` | When to send |
|---|---|---|
| `media_statement.weekly_created` | `weekly_statement` | After the weekly payout cycle closes (Fridays) |
| `media_statement.monthly_created` | `monthly_statement` | At month end |
| `media_statement.ytd_created` | `ytd_statement` | On demand or year-end |
| `media_statement.amended` | (same as original) | When a prior statement is corrected; include `supersedes_document_id` and an incremented `version` |
| `media_w9.status_updated` | `w9` | When W-9 status changes (received/verified/missing) |
| `media_tax_document.available` | `tax_document` | When a 1099 or other tax doc is available |
| `media_tax_document.corrected` | `corrected_tax_document` | When a tax doc is corrected; include `supersedes_document_id` |

Estate Media dedupes on `(media_specialist_id + payroll_document_id + version)`.

---

## 4. End-to-end flow

```
Estate Media pays specialist via Stripe
        │
        ▼
processWeeklyPayouts / processInstantPayout
        │  builds earning record (buildEarningParamsFromJob)
        ▼
syncEarningRecord  ──►  POST /functions/receiveMediaSpecialistEarning  (Payroll)
        │                         │  verifies HMAC, dedupes on earning_id
        │                         ▼
        │                   stores earning for statement aggregation
        │
        ▼  (weekly cycle)
Payroll generates statement  ──►  POST /functions/receivePayrollContractorDocument  (Estate Media)
        │                         │  verifies HMAC over raw body, dedupes on doc+version
        │                         ▼
        │                   creates ContractorPayoutDocument record
        │
        ▼  (specialist opens Payout Records → Weekly Statements)
getPayoutRecords  ──►  POST /functions/contractorDocumentDownload  (Payroll)
        │                         │  verifies HMAC, returns signed URL
        │                         ▼
        └── specialist downloads PDF
```

---

## 5. Acceptance checklist

- [ ] `receiveMediaSpecialistEarning` deployed and returns 200 on a signed test request
- [ ] `contractorDocumentDownload` deployed and returns a signed URL on a signed test request
- [ ] `ARRIV_PAYROLL_API_SECRET` in Payroll matches the Estate Media app's value
- [ ] `ARRIV_PAYROLL_WEBHOOK_SECRET` in Payroll matches the Estate Media app's value
- [ ] `ESTATE_MEDIA_WEBHOOK_URL` set to `https://arrivestatemedia.base44.app/functions/receivePayrollContractorDocument`
- [ ] Estate Media's `ARRIV_PAYROLL_ENDPOINT` points to `https://<payroll-host>/functions/mediaSpecialistEarningSync` (the endpoint secret is stripped to its host, then `/functions/<action>` is appended per call)
- [ ] Weekly statement webhook fires after the Friday payout cycle
- [ ] Media specialist's Weekly Statements tab in Payout Records shows statements