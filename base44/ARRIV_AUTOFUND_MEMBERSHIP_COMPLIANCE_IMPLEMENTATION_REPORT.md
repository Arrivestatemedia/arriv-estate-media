# ARRIV AUTO-FUND — MEMBERSHIP COMPLIANCE IMPLEMENTATION REPORT

**Date:** 2026-10-11
**Scope:** Legally conservative Auto-Fund membership policy — pre-authorization disclosure, durable enrollment consent, renewal notification, cancellation confirmation, wallet-terms truthfulness, the five-tier enrollment list, and customer billing-jurisdiction capture.
**Status:** Implementation complete and verified. **Enrollment remains closed. Nothing was activated. No price changed. No customer charged.**

> **Certification note.** A passing software suite is not legal certification. Every result below verifies software *behaviour*. It is not a legal opinion, and it does not substitute for counsel confirming the statutory cadences, the membership-fee refund policy, or the wallet terms.

---

## A. COMPLETED IMPLEMENTATION

| # | Requirement | Implementation |
|---|---|---|
| 1 | **Unified pre-authorization disclosure** | `base44/shared/autoFundComplianceDisclosure.ts` — one `buildComplianceDisclosure()` is the single source. Both the tier catalog on the enrollment page and the enrollment result render from it, so the two enrollment channels cannot diverge. |
| 2 | **Every material disclosure stated in text** | 11 material items per tier (plan, wallet funding, promotional bonus, membership fee, total recurring charge, frequency + renewal date, benefits, promotional restrictions, how to cancel, fee refund policy, wallet terms). The complete versioned terms are linked **in addition to** these statements — never as a substitute. |
| 3 | **Customer-personal consent** | `CURRENT_TERMS_VERSION` = `autofund_membership_v1`. The engine rejects `terms_accepted_by !== customer_email`; consent is written to the subscription as `terms_accepted_at` / `terms_accepted_by` / `terms_version`. |
| 4 | **Durable enrollment acknowledgment** | `sendEnrollmentAcknowledgment()` in `autoFundMembershipNotices.ts`, invoked from `manageAutoFund`. Records tier, fee breakdown, total, frequency, renewal date, cancellation instructions, terms version and refund policy; body snapshot stored for audit. |
| 5 | **Renewal notification eligibility and timing** | `base44/shared/autoFundRenewalPolicy.ts` — per-jurisdiction rule table (DEFAULT 7d; GA/MD 30d), conservative. A monthly renewal is **not** assumed to need a reminder everywhere. |
| 6 | **Renewal scheduler** | `base44/functions/sendAutoFundRenewalNotices` + workflow **Auto-Fund Renewal Notices** (daily 8am ET). Sends only where a notice is due; idempotent per renewal cycle. Every subscription answers for **its own** captured jurisdiction — there is no bulk override. |
| 7 | **Cancellation** | Customer self-service from the dashboard; works online if enrolled online, with no salesperson, call or email. Stops all future recurring charges. |
| 8 | **Cancellation confirmation** | `sendCancellationConfirmation()` states the effective date, the end of the paid benefit period, and that the wallet balance was **not** forfeited — with the balance snapshot. Wired into the cancel action. |
| 9 | **Membership-fee refund exceptions** | Four legally required exceptions on **every** policy variant: future period + cancel before it starts; duplicate/erroneous/unauthorized charges; material failure to provide benefits; **applicable law overrides these terms**. |
| 10 | **Wallet balance preservation** | Preserved on cancellation. `balance_preserved_on_cancellation: true`; the confirmation reports the balance so the promise is evidenced. |
| 11 | **Idempotency** | Deterministic `notice_id` per (type, subscription, cycle) + immutable `payment_event_id`. A duplicate dispatch cannot create a second notice or charge. |
| 12 | **Delivery failure and retry** | Failures recorded with a safe reason and attempt count; retry re-uses the **same** record and increments attempts — no duplicate rows. |
| 13 | **Separate wallet terms** | `base44/shared/autoFundWalletTerms.ts` — states only verified behaviour. Flagged `pending_legal_review`. |
| 14 | **Customer-facing terms** | `base44/ARRIV_AUTOFUND_MEMBERSHIP_TERMS_V1.md` + a rendered page at **`/AutoFundTerms`**, version-labelled `autofund_membership_v1` with a visible "draft for legal review" banner. |
| 15 | **Interface** | `AutoFundDisclosureList.jsx` shows every material item in full above an **unchecked** authorization control; `AutoFundEnrollPanel.jsx` (now with the required billing-address control and a blocking message naming what is missing) and `AutoFundMembershipPanel.jsx` updated. |
| 16 | **Five approved enrollment tiers** | `AutoFundSubscription.amount` enum corrected to accept all five current tiers **and** the three retired amounts, so a legacy contract can still be stored. `$150` and `$250` were previously **rejected by the database**, making Starter and Growth unenrollable. |
| 17 | **Retired tiers cannot be sold** | The enrollment engine guards on the **enrollable** list, not the resolvable one. See correction 2 below. |
| 18 | **Billing jurisdiction captured at enrollment** | `base44/shared/autoFundJurisdiction.ts` + `AutoFundJurisdictionAudit`. Captured from the customer's own billing address, validated, persisted on the subscription, mirrored onto the customer record, and audited. Missing or invalid jurisdiction **blocks** enrollment. |
| 19 | **Jurisdiction-aware renewal notices** | A missing or invalid jurisdiction sends **no** notice and is reported for correction instead of silently defaulting to a generic cadence. |

### Corrections made during verification (real defects, all fixed)

1. **Promotional-credit restriction never reached the customer.** `buildComplianceDisclosure` read `promotional_credit_usable_on_standalone_mls`, but the builder returns `..._standalone_mls_walkthrough`. The field was always `undefined`, so the VIP restriction never reached the customer record or the interface.

2. **Retired tiers were still enrollable as new business.** The engine resolved the tier through `getAutoFundConfig`, which *also* resolves the grandfathered `$50 / $100 / $200` tiers so an existing contract keeps its terms. The resolvable list is wider than the sellable list, so guarding on it silently re-opened the retired tiers. Enrollment now guards on the enrollable list. **This was not theoretical:** the first verification run enrolled `$50` through the retired-tier test and left a live subscription, wallet and customer record behind. Those records were located and removed; the run after the fix leaks nothing.

3. **The membership fee and the recurring charge were resolved inconsistently.** `getMembershipFee()` honours the membership-fee switch (`0` while billing is off), but `getTotalMonthlyCharge()` read the fee table directly. With billing off, a `$350` enrollment stored `membership_fee: 0` against `total_monthly_charge: 375` and handed checkout `fee 0` against `recurring 37500` — a $375 charge carrying an unnamed $25 that would have been commingled into wallet funding. That is the precise failure the separate fee component exists to prevent. Both now resolve through the same gate, so the charge always equals deposit + the chargeable fee.

4. **A pre-existing certifier asserted two mutually exclusive things about the same tier.** `certifyAutoFundEnrollment` checked that `$350` charges `$375` *and* that the chargeable fee is `$0`. The schedule and the charge are now asserted separately and the invariant between them is asserted directly. **That certifier now passes 23 / 23.**

---

## B. VERIFIED TEST RESULTS

**Suite:** `testAutoFundMembershipCompliance` (admin-only; synthetic `cert_` fixtures and an **injected** mail sender — no customer charged, no real address emailed). Fixtures are removed after every run; cleanup confirmed (14 subscriptions, 5 wallets, 5 customer records).

> **74 checks — 73 PASS · 0 FAIL · 1 BLOCKED**

| Group | Verified |
|---|---|
| A · Gate & safety | Enrollment gate reported closed; the engine still refuses **ordinary** enrollment while closed; **the certification bypass cannot be used on a non-certification address**; self-service and sales-assisted enrollment complete end-to-end; unaccepted terms are refused; an advisor cannot accept the recurring terms for the customer. |
| B · Disclosure | 11 material items × 5 tiers; recurring charge / fee / deposit correct on every tier; fee only on Professional/Premier/VIP; frequency + renewal date; cancellation in text; versioned terms linked *in addition*; **no absolute non-refundability language in any policy variant**; all four legally required exceptions; refundability not claimed as approved; wallet terms state only verified behaviour and are flagged pending; VIP promotional restriction differs correctly. |
| C · Consent | Consent is affirmative, names the exact charge, binds the accepted terms version, and states the fee is not spendable and earns no promotional credit. |
| D · Acknowledgment | Delivered; records the full fee breakdown, terms version, refund policy and cancellation instructions; states the wallet position and support contact; no credentials in the body; idempotent (repeat = duplicate, one record); failure recorded with reason; retry succeeds on the **same** record with attempts incremented. |
| E · Renewal | Due inside the lead window, not due outside it; no notice when paused/cancelled or on a recovery hold; GA/MD lead wider than DEFAULT; every cadence declared unconfirmed by counsel; idempotent per cycle; records rule, lead time and confirmation state; **a missing jurisdiction sends no notice**; **an invalid jurisdiction sends no notice**; a known state without its own rule still uses the conservative default. |
| F · Cancellation | Stops future scheduled charges; confirmation delivered; states effective date and end of paid benefit period; states the balance was not forfeited with the snapshot; **wallet balance unchanged**; confirmation idempotent. |
| G · Auditability | Terms version, consent identity and date recorded on the subscription; full notice trail retrievable with delivery status; append-only (unique `notice_id`). |
| H · Tier list (approved fix 1) | All five approved tiers resolve to the authorised structure; **the database accepts all five current tiers and all three legacy amounts** (each written and removed); legacy customers keep their contracted terms ($50→$50, $100→$105, $200→$220) and their legacy plan IDs; a retired tier is **refused at enrollment**. |
| I · Jurisdiction (approved fix 2) | Captured from the customer's billing address and persisted on the subscription; mirrored onto the customer record; available to the renewal engine (a GA subscription resolves `GA_30D`); state-specific rules selected correctly; refused when the address is absent, has no state, or the state is invalid; a state conflict with the payment method is captured, flagged and **not** auto-resolved; a non-US address is flagged; decisions recorded in an append-only audit trail. |
| J · Channel parity & fee separation | Both channels produce identical financial terms and identical material disclosures; the fee never inflates Booking Value; **the recurring charge always equals wallet funding + the recorded fee**; the promotional-credit restriction is attached to the correct record. |

### The 1 blocked check — and why it is not faked as passing

`J6 · Disclosed fee schedule equals the fee actually billed` is **BLOCKED**. The pre-authorization disclosure states the **approved fee schedule** ($25 on a $375 charge), while the charge is gated by the membership-fee switch, which is **off**. No real enrollment can occur while the switch is off, because the gate requires both switches — so this cannot reach a customer today. But opening enrollment **without** the fee switch would have a customer authorize $375 and be charged $350. Reported as a launch blocker and an operating instruction rather than silently reconciled, because which of the two the disclosure should state is the owner's call, not an engineering decision.

**The three previously-blocked enrollment checks now run.** The suite exercises the real enrollment engine through an isolated certification path whose bypass requires **three independent conditions** (`authorized` flag, a named admin the calling function verifies, and a synthetic `cert_` address) and which **no user-facing route forwards**. The engine's refusal of every ordinary enrollment is still asserted (A2, A3), so the gate is verified closed rather than merely assumed.

---

## C. REMAINING CUSTOMER-FACING DEFICIENCIES

1. **The terms page is a draft.** It states plainly that it is prepared for legal review and not yet operative — meaning no customer can presently be shown final terms.
2. **Customer-funded value expires.** All funding lots carry a 12-month validity and the daily expiration job reduces the balance. Now disclosed truthfully — but expiring value a customer paid for is an unresolved legal question, not merely a disclosure to be written.
3. **No cash-out or customer-requested wallet refund.** Disclosed honestly rather than promised; still a commercial limitation customers may object to.
4. **Flagged jurisdictions have no review workflow.** A state conflict or a non-US billing address is captured, flagged and billed correctly, but nothing currently routes the case to a human for resolution. Flagging without a reviewer accumulates unreviewed cases.
5. **The renewal job is live and will begin emailing customers the moment any subscription becomes active.** It is a no-op today because there are zero AutoFund subscriptions. If the owner prefers it held until launch, it should be deactivated.

*Closed since the previous revision:* the missing `$150` / `$250` tiers are enrollable, and jurisdiction is now captured at enrollment and drives the renewal rules.

---

## D. EXACT REMAINING PRODUCTION LAUNCH BLOCKERS

**Legal (none of these can be resolved by engineering):**
1. **Membership-fee refundability is `undetermined` and unapproved.** The system deliberately asserts no policy. A position must be set by the owner after legal review.
2. **Renewal-notice statutory cadence is unconfirmed for every jurisdiction.** GA/MD rules are conservative internal defaults, not legal determinations.
3. **Separate wallet refund / expiration / unclaimed-property terms are unapproved.** The wallet terms module explicitly cannot answer four of its own questions.
4. **The membership terms are not final**, so no customer can be shown operative terms and consent cannot be taken against them.

**Operational sequencing:**
5. **Open enrollment and the membership-fee switch TOGETHER — never enrollment alone.** While the switch is off the disclosed schedule and the amount charged diverge (blocked check `J6`).
6. **Decide what the disclosure must state** while any switch is off: the approved schedule or the amount currently charged.

**Engineering / data:**
7. **Build the jurisdiction review workflow** for flagged conflicts and non-US addresses.
8. **Terms page must be replaced with final counsel-approved text** and the version label advanced if the content changes materially — a material change requires refreshed customer consent.

**Deliberately untouched:** enrollment gate closed (`autofund_enrollment_enabled` absent), membership-fee flag off, promotional restriction flag inactive, no production tier or price changed, no live subscription created, no fee charged, no wallet credit issued.

---

## E. WHAT THIS DOES AND DOES NOT ESTABLISH

**Does:** every compliance obligation in the request is implemented in one authoritative place, rendered identically on both enrollment channels, recorded durably and idempotently, and verified by a suite that now exercises enrollment end-to-end instead of reporting it blocked. The five approved tiers are enrollable, the retired tiers are not, jurisdiction is captured and drives the renewal rules, and the charge a customer authorizes always equals the breakdown recorded against it. **Four real defects were found and fixed during verification** — two of them (the retired-tier leak and the fee/charge split) could have moved money incorrectly.

**Does not:** certify legal compliance. Fee refundability, statutory renewal cadence, and the separate wallet terms remain open legal questions. No real customer enrollment has been executed against live payment rails.

---

## F. RECOMMENDED IMMEDIATE ACTION

Both previously recommended engineering items are now **done and verified**. Remaining:

1. **Owner decision** — membership-fee refundability, and the disclosure-vs-charge question while switches are off.
2. **Counsel** — statutory renewal cadence by state, and the separate wallet terms.
3. **Build the jurisdiction review workflow** so flagged cases have an owner.
4. **Hold the renewal scheduler** until launch if the owner prefers no scheduler activity before then.
5. **Do not open enrollment** until the fee switch is opened with it.