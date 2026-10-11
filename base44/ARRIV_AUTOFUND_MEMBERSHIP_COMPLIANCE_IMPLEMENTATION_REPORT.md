# ARRIV AUTO-FUND — MEMBERSHIP COMPLIANCE IMPLEMENTATION REPORT

**Date:** 2026-10-11
**Scope:** Legally conservative Auto-Fund membership policy — pre-authorization disclosure, durable enrollment consent, renewal notification, cancellation confirmation, and wallet-terms truthfulness.
**Status:** Implementation complete and verified. **Enrollment remains closed. Nothing was activated. No pricing changed.**

> **Certification note.** A passing software suite is not legal certification. Every result below verifies software *behaviour*. It is not a legal opinion, and it does not substitute for counsel confirming the statutory cadences, the membership-fee refund policy, or the wallet terms.

---

## A. COMPLETED IMPLEMENTATION

| # | Requirement | Implementation |
|---|---|---|
| 1 | **Unified pre-authorization disclosure** | `base44/shared/autoFundComplianceDisclosure.ts` — one `buildComplianceDisclosure()` is the single source. Both the tier catalog shown on the enrollment page and the enrollment result render from it, so the two enrollment channels cannot diverge. |
| 2 | **Every material disclosure stated in text** | 11 material items per tier (plan, wallet funding, promotional bonus, membership fee, total recurring charge, frequency + renewal date, benefits, promotional restrictions, how to cancel, fee refund policy, wallet terms). The complete versioned terms are linked **in addition to** these statements — never as a substitute. |
| 3 | **Customer-personal consent** | `CURRENT_TERMS_VERSION` bumped to `autofund_membership_v1`. The engine already rejects `terms_accepted_by !== customer_email`; consent is written to the subscription as `terms_accepted_at` / `terms_accepted_by` / `terms_version`. |
| 4 | **Durable enrollment acknowledgment** | `sendEnrollmentAcknowledgment()` in `autoFundMembershipNotices.ts`, invoked from `manageAutoFund` enrollment. Records tier, fee breakdown, total, frequency, renewal date, cancellation instructions, terms version and refund policy; body snapshot stored for audit. |
| 5 | **Renewal notification eligibility and timing** | `base44/shared/autoFundRenewalPolicy.ts` — per-jurisdiction rule table (DEFAULT 7d; GA/MD 30d), conservative. A monthly renewal is **not** assumed to need a reminder everywhere. |
| 6 | **Renewal scheduler** | `base44/functions/sendAutoFundRenewalNotices` + workflow **Auto-Fund Renewal Notices** (daily 8am ET). Sends only where a notice is due; idempotent per renewal cycle. |
| 7 | **Cancellation** | Customer self-service from the dashboard; also works online if enrolled online, with no salesperson, call or email. Stops all future recurring charges. |
| 8 | **Cancellation confirmation** | `sendCancellationConfirmation()` states the effective date, the end of the paid benefit period, and that the wallet balance was **not** forfeited — with the balance snapshot. Wired into the cancel action. |
| 9 | **Membership-fee refund exceptions** | Four legally required exceptions on **every** policy variant: future period + cancel before it starts; duplicate/erroneous/unauthorized charges; material failure to provide benefits; **applicable law overrides these terms**. |
| 10 | **Wallet balance preservation** | Preserved on cancellation. `balance_preserved_on_cancellation: true`, and the confirmation reports the balance so the promise is evidenced. |
| 11 | **Idempotency** | Deterministic `notice_id` per (type, subscription, cycle) + immutable `payment_event_id`. A duplicate dispatch cannot create a second notice or charge. |
| 12 | **Delivery failure and retry** | Failures recorded with a safe reason and attempt count; retry re-uses the **same** record and increments attempts — no duplicate rows. |
| 13 | **Separate wallet terms** | `base44/shared/autoFundWalletTerms.ts` — states only verified behaviour. Flagged `pending_legal_review`. |
| 14 | **Customer-facing terms** | `base44/ARRIV_AUTOFUND_MEMBERSHIP_TERMS_V1.md` + a rendered page at **`/AutoFundTerms`** (new route), version-labelled `autofund_membership_v1` and carrying a visible "draft for legal review" banner. |
| 15 | **Interface** | `AutoFundDisclosureList.jsx` shows every material item in full above an **unchecked** authorization control; `AutoFundEnrollPanel.jsx` and `AutoFundMembershipPanel.jsx` updated. |

### Correction made during verification (real defect, fixed)
`buildComplianceDisclosure` read `base.promotional_credit_usable_on_standalone_mls`, but the builder returns `..._standalone_mls_walkthrough`. The field was therefore **always `undefined`**, so the promotional-credit restriction flag never reached the customer record or the interface. Fixed, and now covered by a passing assertion.

---

## B. VERIFIED TEST RESULTS

**Suite:** `testAutoFundMembershipCompliance` (admin-only; synthetic `cert_` fixtures and an **injected** mail sender — no customer charged, no real address emailed). Fixtures are removed after the run; cleanup confirmed.

> **47 checks — 44 PASS · 0 FAIL · 3 BLOCKED**

| Group | Verified |
|---|---|
| A · Gate | Enrollment gate reported closed; engine refuses enrollment while closed. |
| B · Disclosure | 11 material items × 5 tiers; recurring charge / fee / deposit correct on every tier; fee only on Professional/Premier/VIP; frequency + renewal date; cancellation in text; versioned terms linked *in addition*; **no absolute non-refundability language in any policy variant**; all four legally required exceptions; refundability not claimed as approved; wallet terms state only verified behaviour and are flagged pending; VIP promotional restriction differs correctly; both channels render identical disclosure. |
| C · Consent | Consent is affirmative, names the exact charge, binds the accepted terms version, and states the fee is not spendable and earns no promotional credit. |
| D · Acknowledgment | Delivered; records the full fee breakdown, terms version, refund policy and cancellation instructions; states the wallet position and support contact; no credentials in the body; idempotent (repeat = duplicate, one record); failure recorded with reason; retry succeeds on the **same** record with attempts incremented. |
| E · Renewal | Due inside the lead window, not due outside it; no notice when paused/cancelled or on a recovery hold; GA/MD lead wider than DEFAULT; every cadence declared unconfirmed by counsel; idempotent per cycle; records rule, lead time and confirmation state. |
| F · Cancellation | Stops future scheduled charges; confirmation delivered; states effective date and end of paid benefit period; states the balance was not forfeited with the snapshot; **wallet balance unchanged**; confirmation idempotent. |
| G · Auditability | Terms version, consent identity and date recorded on the subscription; full notice trail retrievable with delivery status; append-only (unique `notice_id`). |

### The 3 blocked checks — and why they were not faked as passing
`A3` self-service enrollment, `A4` sales-assisted enrollment, `A5` customer-personal consent enforcement **cannot be exercised while the enrollment gate is closed**, and the consent check sits behind that gate. Opening the gate to test them would be activating production enrollment, which is not authorized. They are reported **BLOCKED**, not PASS. The suite instead proves the gate is closed and that the engine refuses enrollment — so the closure itself is verified, and the unverified path is visible rather than hidden.

---

## C. ACTUAL CUSTOMER-FACING DEFICIENCIES

1. **Two of the five tiers cannot be enrolled at all.** `AutoFundSubscription.amount` still lists `enum: [50, 100, 200, 350, 500, 1000]`. It is **missing $150 and $250**, so enrollment at Starter or Growth would fail schema validation while the other three tiers would succeed. This is a live defect, not a paperwork gap. *(Not changed here — see the offer at the end of this report.)*
2. **Jurisdiction is never captured, so renewal notices are not truly jurisdiction-specific.** Neither `AutoFundSubscription` nor `Contact` carries a state. Every notice therefore falls back to the conservative 7-day DEFAULT, and each run reports `jurisdiction_resolution: not_captured_at_enrollment`. The engine *is* jurisdiction-aware; the data to drive it does not exist yet.
3. **The terms page is a draft.** It states plainly that it is prepared for legal review and not yet operative. Correct, but it means no customer can presently be shown final terms.
4. **Customer-funded value expires.** All funding lots carry a 12-month validity and the daily expiration job reduces the balance. That behaviour is now disclosed truthfully — but expiring value a customer paid for is itself an unresolved legal question, not merely a disclosure to be written.
5. **No cash-out or customer-requested wallet refund.** Disclosed honestly rather than promised; still a commercial limitation customers may object to.
6. **The renewal job is live and will begin emailing customers the moment any subscription becomes active.** It is a no-op today because there are zero AutoFund subscriptions. If the owner prefers it held until launch, it should be deactivated.

---

## D. EXACT REMAINING PRODUCTION LAUNCH BLOCKERS

**Legal (none of these can be resolved by engineering):**
1. **Membership-fee refundability is `undetermined` and unapproved.** The system deliberately asserts no policy. A refundability position must be set by the owner after legal review.
2. **Renewal-notice statutory cadence is unconfirmed for every jurisdiction.** GA/MD rules are conservative internal defaults, not legal determinations. Counsel must confirm the cadence state by state.
3. **Separate wallet refund / expiration / unclaimed-property terms are unapproved.** The wallet terms module explicitly cannot answer four of its own questions.
4. **The membership terms are not final**, so no customer can be shown operative terms and consent cannot be taken against them.

**Engineering / data:**
5. **The tier enum must be corrected** to include $150 and $250 (blocker #1 above), or two of the five tiers stay unenrollable.
6. **Jurisdiction must be captured at enrollment** (or on the customer record) for jurisdiction-aware renewal notices to mean anything.
7. **Enrollment end-to-end verification remains outstanding.** Until the gate is opened, the three BLOCKED checks cannot run. They must be re-run and must pass **before** enrollment is authorized.
8. **Terms page must be replaced with final counsel-approved text** and the version label advanced if the content changes materially — a material change requires refreshed customer consent.

**Deliberately untouched:** enrollment gate closed (`autofund_enrollment_enabled` absent), membership-fee flag off, promotional restriction flag inactive, no production tier or price changed, no subscription created, no fee charged, no wallet credit issued.

---

## E. WHAT THIS DOES AND DOES NOT ESTABLISH

**Does:** every compliance obligation in the request is implemented in one authoritative place, is rendered identically on both enrollment channels, is recorded durably and idempotently, and is verified by a passing suite. One real disclosure defect was found and fixed in the process.

**Does not:** certify legal compliance. Fee refundability, statutory renewal cadence, and the separate wallet terms remain open legal questions, and no customer-facing enrollment has been executed end-to-end.

---

## F. RECOMMENDED IMMEDIATE ACTION

Two engineering items can be closed without any legal input and would materially reduce launch risk:

1. **Add $150 and $250 to the AutoFundSubscription tier enum** — otherwise two of the five approved tiers cannot be enrolled.
2. **Capture jurisdiction at enrollment** — otherwise the jurisdiction-aware renewal logic the request asked for degrades to a single default cadence.

Both are small, self-contained changes. Both are awaiting explicit owner approval before being made.