# ARRIV ESTATE MEDIA — SMS DELIVERY & ENGAGEMENT TRACKING
## Phase 0: Audit, Feasibility, and Proposed Implementation

Status: **AUDIT ONLY — nothing implemented. No production webhook, send path, phone number, or link has been changed.**
Prepared: 2026-10-21

---

## 1. Audit of the existing messaging architecture

### 1.1 How outbound SMS is sent today

There is **no Twilio Messaging Service** in this account (`MessagingServiceSid` appears nowhere in the codebase;
no `TWILIO_MESSAGING_SERVICE_SID` secret exists). Every message is sent with a direct `From` number against
`/2010-04-01/Accounts/{sid}/Messages.json`.

Conversation sends (the ones a rep sees in the dialer):

| Path | From number | Records an `SmsMessage` row? |
|---|---|---|
| `sendSms` (dialer compose + reply) | rep's `SalesTeamMember.twilio_phone_number`, company number as fallback | Yes, with `twilio_sid` |
| `twilioSmsWebhook` relay sends (relay to client / media partner, support acks, access prompts, block notice) | company `TWILIO_CALLING_PHONE_NUMBER` / `TWILIO_PHONE_NUMBER` | Yes (some paths), with `twilio_sid` |

Transactional, out-of-thread texts are sent by **~20 other functions** (job reminders, footage reminders,
missed-call owner alert, payroll owner notices, property/Supra access guides, media delivery, background
check, payout notices, recruiting, etc.). These do **not** create `SmsMessage` rows and are not part of any
conversation, so they are out of scope for the in-thread indicators unless we decide otherwise.

### 1.2 Delivery status today

**None for SMS.** The only Twilio status callbacks configured anywhere are voice/recording related
(`handleMissedCall`, `transferStatusCallback`, `twilioRecordingCallback`). Outbound SMS records carry a
`twilio_sid` and nothing else — no status, no timestamps, no error code.

### 1.3 Inbound SMS today

`twilioSmsWebhook` handles all inbound SMS and MMS:

1. Validates the Twilio request signature (HMAC-SHA1 + `X-Twilio-Signature`, with candidate-URL resolution
   because the public URL differs from `req.url` behind the platform dispatcher).
2. Admin-number branch: support reply routing (support sessions, `to +<number>` prefix, recent-sender fallback).
3. Media-specialist relay branch: matches the sender to an active job (client ↔ media partner), handles the
   property-access selection flow, personal-phone-number blocking, support prefix.
4. Default branch: routes to the rep whose `twilio_phone_number` matches the `To` number, finds/creates the
   `SmsConversation` keyed by the external `from_number`, stores the inbound `SmsMessage`, bumps `unread_count`.

Gaps found:

- **No `MessageSid` dedup.** A Twilio retry of the same inbound event creates a second row and bumps
  `unread_count` again (and can double-relay).
- A **temporary debug block** writes a `MessageLog` row on every inbound request and returns raw debug JSON
  on signature failure. Leftover from webhook debugging; should be removed as part of this work.
- **No local opt-out/suppression store.** "Reply STOP" wording exists only as AI-generated copy in recruiting.
  Stop/help blocking today is carrier/Twilio-level only; we hold no suppression flag of our own.

### 1.4 Message records and access isolation

- `SmsConversation`: keyed by the external number, carries `sales_member_id`, relay/job fields, `unread_count`.
- `SmsMessage`: `conversation_id`, `from_number`, `to_number`, `body`, `direction`, `twilio_sid`.
- Neither entity has RLS configured, so any signed-in app user can read every conversation through the SDK.
  The dialer hides this by filtering client-side to `sales_member_id` (`IphoneDialer.loadConversations`), and
  `getSalesDashboardData` filters server-side, but the data itself is not restricted.
- `SmsMessage` has no `sales_member_id`, so row-level rules cannot be expressed on it today.
- `src/components/sales/SmsInbox.jsx` is **dead code** (no importer). It also calls `sendSms` **without**
  `salesMemberId`, so it would have sent from the company number rather than the rep's. The live UI is the
  dialer's Messages tab. Recommend deleting the orphan rather than maintaining two bubble renderers.

### 1.5 Existing link/redirect infrastructure (reusable)

- `ShortLink` entity + `/r/:code` route (`ShortRedirect`) — used to brand platform-hosted file URLs. It does
  **not** record clicks, and `/r` is a React page (client-side), so it is not ideal for SMS click measurement.
- `trackLinkClick` — invoice-token based, tracks first click of that specific mechanism only.
- No per-message click tracking exists for SMS/MMS.

---

## 2. Can Twilio's native link shortening be enabled? (Step 3 of the process)

**Answer: not on the current account, and not without changing production sending.**

Per Twilio's documentation:

- Link Shortening is **only available with Messaging Services**, and click tracking is part of the paid
  **Engagement Suite** add-on. It requires: creating a Messaging Service, adding every rep number into its
  sender pool, onboarding link shortening with a click callback URL, and sending with `ShortenLinks=true`.
- Shortened links use Twilio's Link Shortening domain unless a custom domain is onboarded; links expire
  (90 days) and click events stop with the messaging records retention period.
- Click callbacks do give us exactly what we want (`event_type: click | preview`, `sms_sid`, original link,
  `click_time`, `user_agent`) — device-generated previews are distinguished by Twilio.

Why we should **not** do this now:

1. Moving sends onto a Messaging Service changes the sending path for every message and risks the "one number
   per rep" guarantee (sender pool selection), which is a hard requirement.
2. It is a console-side production change, which the brief forbids without approval.
3. It adds a per-message cost and takes our links off our own branded domain unless we onboard a custom
   shortening domain anyway.

**Recommendation: Arriv-owned HTTPS redirect service** for Phase 2 (details below), which keeps numbers,
the send path, our domain, and the brand intact — and can be disclosed and audited on our own terms.

---

## 3. Proposed implementation (nothing here is built yet)

### 3.1 Internal status model → customer-facing display

| Internal (Twilio) | Rank | Stored as | Shown to rep |
|---|---|---|---|
| `queued` | 1 | queued | Sending (clock, muted) |
| `accepted`/`sending` | 2 | sending | Sending (clock, muted) |
| `sent` | 3 | sent | **✓ Sent** |
| `delivered` | 4 | delivered | **✓✓ Delivered** |
| `undelivered` | terminal | undelivered | **⚠ Not delivered** + plain-language reason from the Twilio error code |
| `failed` | terminal | failed | **⚠ Failed to send** + plain-language reason |
| local send failure (API rejected the request) | terminal | failed | **⚠ Failed to send** + reason |
| legacy rows (no status yet) | 0 | unset | no checkmark (never implies delivery) |

Rules enforced server-side:

- `Delivered` is only ever written from a Twilio `delivered` callback — never inferred from a 2xx API
  response (a successful POST only means `queued`).
- **Ordering guard:** every update compares the incoming rank against the stored rank; a delayed
  `sent`/`queued` callback arriving after `delivered` is recorded in history but never downgrades the visible
  status. Terminal failure states never overwrite a later `delivered`.
- **Idempotency:** duplicate callbacks (same `MessageSid` + same status, e.g. Twilio retries) are ignored.
- **No message is lost:** the `SmsMessage` row is written *before* the Twilio API call with internal status
  `queued`; if the API call rejects, the same row is marked `failed` with the reason. Today a failed API call
  writes no row at all.
- **Read receipts:** not requested, not shown, and impossible for ordinary SMS/MMS.

### 3.2 Data model additions (additive only)

`SmsMessage` gains: `status`, `status_rank`, `status_updated_at`, `sent_at`, `delivered_at`, `failed_at`,
`twilio_error_code`, `twilio_error_message`, `segment_count`, `sales_member_id` (denormalized so isolation can
be expressed), `delivery_events` (small append-only audit trail, capped), `reply_to_twilio_sid`, `replied_at`,
`has_links`, and `link_engagement` (`{ click_count, human_click_count, preview_count, first_click_at,
last_click_at, last_destination_label, last_destination_url, last_event_type }`).

`SmsConversation` gains: `last_inbound_at`, `last_outbound_at`, `last_reply_at` (drives the conversation
activity strip). Existing fields and behaviour are untouched.

New entity `SmsTrackedLink`: `code`, `target_url`, `dest_label`, `message_sid`, `conversation_id`,
`sales_member_id`, `customer_number`, `created_at`, `first_click_at`, `last_click_at`, `click_count`,
`human_click_count`, `preview_count`, `last_event_type`, `expires_at`.

**No IP addresses are stored.** Scanner/preview detection uses only a one-pass User-Agent classification
(bot/preview crawlers, link unfurlers) written as a category, never the raw agent string. Tradeoff: without an
IP we cannot dedupe a person's repeated taps, so counts are "clicks observed", not "unique people".

### 3.3 New / changed server logic

1. **`twilioMessageStatusCallback` (new)** — Twilio signature-validated, deduped, rank-guarded status ingest;
   writes status, timestamps, error code + friendly reason; appends to `delivery_events`; never throws away a
   callback (unknown SIDs are logged and dropped safely without losing the message).
2. **`sendSms` (changed, additive)** — records the row first, passes `StatusCallback` on the send, stores the
   Twilio status from the API response, stores `sales_member_id` and link metadata, and still sends from the
   exact same rep number it does today.
3. **`twilioSmsWebhook` (changed, additive)** — inbound `MessageSid` dedup; reply attribution; STOP/START/HELP
   *recording* (no behaviour change in phase 1); removal of the temporary debug block; same signature
   validation and the same routing branches (support, relay, rep inbox) untouched.
4. **`rewriteSmsLinks` (new shared module)** — rewriting + classification, used only by the conversation send
   paths. Exclusion list: authentication/password-reset/verification, payment/invoice/checkout/Stripe links,
   links already on our own domain (`/r/` etc.), `mailto:`/`tel:`, and anything already shortened. Everything
   excluded is sent exactly as authored.
5. **`smsLinkRedirect` (new, GET on our own domain)** — resolves a code and returns a fast server-side 302 to
   the preserved destination, records first/last click + counts, classifies preview/bot traffic, and fails open
   to the destination if the code is unknown (a broken link is worse than an untracked one).
6. **`testSmsTracking` (new, admin-only, no real sends)** — dry-run harness for the 12 scenarios in section 6,
   using generated Twilio signatures against the callback handlers.

### 3.4 Reply attribution rule (deliberately conservative)

A customer reply is **never** assumed to answer the most recent outbound message.

- Conversation-level `Replied` = an inbound message exists after the latest outbound message. Always shown,
  with the inbound timestamp.
- Message-level reply attribution is recorded only when the inbound arrives on a conversation whose most recent
  message is a trackable outbound **and** that outbound was sent within the reply window (proposed: 72 hours).
- If the rep has sent anything newer since, the reply is shown at conversation level only — we state "Replied"
  without claiming which message it answered. This is the "replies to an older message" case, and honest
  behaviour is the requirement.
- `Link Opened` is presented as its own indicator, never merged with `Replied`, and never worded as "read".

### 3.5 Messaging interface

One shared bubble component (`MessageBubble`) used by the dialer Messages tab, replacing the duplicated inline
bubble markup:

- outbound bubble: body, timestamp, status row (clock / ✓ Sent / ✓✓ Delivered / ⚠ Failed + reason),
  `Link opened <time>` when a tracked click exists, `Replied <time>` when the conversation has been answered.
- inbound bubble: body, timestamp, and a subtle marker when it is the reply that cleared the rep's last message.
- conversation list: unread badge (existing), plus a compact activity line (last inbound/last outbound/last
  reply) so a rep can see engagement without opening every thread.
- Desktop and mobile share the same component; the mobile dialer takeover and desktop 600px panel keep their
  current layouts.

### 3.6 Delivery-tracking scope

Phase 1 covers **conversation messages** (rep ↔ customer, relay threads, in-dialer sends) because those are the
messages a rep sees and judges. The ~20 transactional senders (job reminders, access guides, payroll notices)
have no thread and no bubble to attach a checkmark to; giving them delivery records means writing rows for
messages that were never conversations. If you want them tracked, the clean version is a separate lightweight
delivery log for transactional texts, not mixing them into the inbox — flag for a decision.

### 3.7 Rep isolation hardening (needs its own approval + test pass)

Proposed, because the brief asks for enforced authorization:

- store `sales_member_id` on each `SmsMessage` (new field, backfilled from its conversation);
- add RLS to `SmsConversation` and `SmsMessage`: read = own rows or admin; writes = admin/service-role only;
- keep unassigned/company-number relay threads readable so the support/relay flows keep working;
- re-check every current reader: dialer messages, admin activity pages, call-map regeneration, performance
  engine, and the two admin pages that query conversations by contact name.

Risk: this changes who can read what, so it is proposed as a separate, explicitly approved step with a test
pass rather than bundled into the tracking work.

---

## 4. Configuration, cost, and compliance notes (Step 4)

**Configuration required**

- Nothing in the Twilio console for delivery status: a per-message `StatusCallback` needs no Messaging Service,
  no sender-pool change, and no change to any rep's number.
- No change to the inbound webhook URL or to its signature validation.
- Link tracking needs a stable HTTPS origin for the redirect. Our app domain (and the existing branded
  redirect pattern) works today; a short dedicated host (e.g. `a.`) would be nicer in an SMS body but is a DNS
  change to plan separately.

**Costs**

- Status callbacks: standard Twilio webhook traffic, no per-message add-on.
- Arriv-owned redirect: no third-party fee; runs on existing app hosting.
- Twilio native link shortening (if ever chosen): a paid Engagement Suite add-on, priced per message on top of
  SMS pricing. Confirm current rates in the Twilio console before deciding; I will not quote a number I cannot
  verify.
- No new carrier fees; tracked links are still one SMS segment as long as the replacement URL is not longer
  than the original.

**Compliance**

- Disclosure: shortening/tracking in the SMS program should be stated in the consent language (the SmsConsent
  page and privacy policy). Proposal: one plain sentence, e.g. "Links in our text messages may be shortened and
  may record that they were opened."
- Never present a click as proof of reading, and never as consent to anything.
- Excluded from rewriting: auth/password-reset, payment/invoice/checkout, and our own internal links.
- No recipient IP retention; only click counts, first/last click, and a bot/preview category.
- Carrier filtering: shortened links can be treated as a spam signal, so we use a branded domain and never a
  public shortener (public shorteners are already a documented dead end in this app).
- Opt-out: recorded locally as a decision item, without changing current behaviour until you approve a
  suppression rule (carrier-level STOP continues to work as it does today).

---

## 5. Rollout plan (after approval)

1. **Phase 1 — delivery accuracy (no external config):** schema fields, status callback, send-path changes,
   inbound dedup, reply attribution, shared bubble UI, test harness.
2. **Phase 2 — link engagement:** rewriting module, redirect endpoint, `Link opened` indicators, consent copy.
3. **Phase 3 — hardening:** isolation rules + backfill, removal of debug leftovers, opt-out recording rule.
4. Release only after the test matrix below passes on the preview app, with a live end-to-end check on one test
   number and one real number owned by the company.

---

## 6. Test matrix (the 12 required scenarios)

| # | Scenario | How it is verified |
|---|---|---|
| 1 | Message successfully sent | row created `queued` → callback `sent` → ✓ Sent |
| 2 | Message confirmed delivered | `delivered` callback → ✓✓ Delivered, `delivered_at` set |
| 3 | Message delivery fails | `failed`/`undelivered` + error code → ⚠ with reason, message still visible |
| 4 | Message contains no links | no rewrite, no `Link opened`, no false engagement |
| 5 | Message contains a tracked link | link rewritten once, destination preserved, exclusions untouched |
| 6 | Customer clicks a link | first + last click, count, indicator with timestamp/description |
| 7 | Scanner / link preview | classified `preview`, not counted as a human click, never shown as "read" |
| 8 | Customer replies | conversation `Replied` with timestamp; attributed only per 3.4 |
| 9 | Customer replies to an older message | no false attribution to the newest message |
| 10 | Two reps, different customers | each sees only their own thread and statuses |
| 11 | Duplicate / out-of-order callbacks | duplicates ignored, no status downgrade |
| 12 | Existing calling, texting, opt-outs, CRM untouched | dialer call flow, relay routings, unread badges, CRM records unchanged |

---

## 7. Decisions needed before any code is written

1. Link tracking method: Arriv-owned branded redirect (recommended) / Twilio native (Messaging Service +
   Engagement Suite, changes the send path) / defer link tracking to later.
2. Disclosure wording: add the sentence to the SMS consent page and privacy policy / privacy policy only /
   hold disclosure for now.
3. Delivery tracking scope: conversation messages only (recommended) / every text the company sends, including
   transactional notifications.