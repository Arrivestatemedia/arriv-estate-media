# ARRIV AUTO-FUND — COUNSEL REVIEW PACKAGE

**Prepared:** 2026-10-11 · Arriv Estate Media
**Purpose:** the final documents and the exact legal determinations that remain, for
counsel review. **No approval is recorded, implied or pre-filled anywhere.**

---

## 1. Documents submitted for review

| Document | Version | Path | Purpose |
| --- | --- | --- | --- |
| Membership Agreement (final) | `autofund_membership_v1` | `base44/ARRIV_AUTOFUND_MEMBERSHIP_AGREEMENT_FINAL.md` | Recurring charges, fee, promotional and cash-funded value, rollover, cancellation, refunds, disputes, renewal notices, VIP enhanced support |
| Wallet Agreement (final) | `autofund_wallet_v1` | `base44/ARRIV_AUTOFUND_WALLET_AGREEMENT_FINAL.md` | Wallet value, lots and validity, rollover, cancellation, dormant balances, unclaimed property, disputes, cash-out |
| Membership fee refund policy (owner-adopted) | `autofund_fee_policy_v1` | `base44/shared/autoFundFeePolicy.ts` | The adopted policy, clause by clause, with its enforcement map |
| Wallet disclosure facts and open questions | — | `base44/shared/autoFundWalletTerms.ts` | Verified wallet facts versus unresolved questions, and the topic-by-topic status |

The customer-visible wording is generated from these same modules, so the text
counsel reviews and the text a customer would see cannot drift apart.

---

## 2. What is already decided (not open)

- **Membership-fee refundability** — the owner adopted the policy on 2026-10-11: ordinarily nonrefundable once the period begins and benefits are available, with refunds always provided for pre-period cancellation, duplicate/erroneous/unauthorized charges, post-cancellation charges, and material failure to provide benefits, and with applicable law overriding any conflicting provision.
- **VIP enhanced support** — finalized by owner directive: priority Arriv Assist access with escalation when necessary. No promised number of human sessions, no guaranteed hours, no fixed consultations, and no reduction of existing support rights.
- **Tier structure, funding amounts, promotional bonuses, membership fees and redemption policy** — approved and unchanged.
- **Approved MLS V2 ladder** — $120 / $145 / $170 / $220 / $295 by property size.

Owner adoption is a **business** decision. It is not counsel approval, and this
package records it as such.

---

## 3. Remaining jurisdiction-specific determinations

Each item below is currently **undetermined** in the system. The system deliberately
asserts no rule for any of them; where behaviour exists it is stated as a fact, not
as a legal position.

| # | Determination | Why it matters | Current behaviour | What is needed |
| --- | --- | --- | --- | --- |
| 1 | **Renewal-notice cadence per state.** Is an advance renewal notice required, and how many days in advance, for a monthly recurring charge in each state where members will be enrolled? | A notice sent too late, or not at all, breaches the state's automatic-renewal rule | A conservative internal default is applied and every notice records `statutory_cadence_confirmed = false` | Confirmation of the required cadence per launch state (and any required notice content/consent format) |
| 2 | **Lawfulness of the 12-month lot validity** for cash-funded value | If a state limits expiry of prepaid balances, the current validity is unenforceable there | Validity is enforced as issued per lot; no other expiry is imposed | A state-by-state position, and the fallback if a period is not permitted |
| 3 | **Refund of an unused cash-funded balance on cancellation** | Determines whether preservation-as-usable-value is sufficient or a cash refund is required | Balance is preserved and remains usable; no refund asserted either way | Determination of whether a refund is required, and in what form |
| 4 | **Dormant-balance obligations** — must dormancy be tracked, reported to the member, or treated in a particular way? | Creates a tracking and notification obligation that does not exist today | No dormancy tracking exists | Whether tracking is required, from what dormancy period, and what must be done |
| 5 | **Unclaimed property / escheat** — what obligations apply, from when, and to whose custody? | Determines whether and when a balance must be remitted to a state | No escheat process exists; no balance is taken | The applicable regime per state of the member's last known address |
| 6 | **Refund of unused value outside cancellation** (on request) | If a cash-out right exists, the absence of a facility must be addressed | No cash-out facility exists; no right asserted or denied | Whether such a right exists and how it must be met |
| 7 | **Treatment of value already redeemed in a period later disputed** | Determines what may be recovered from a member when a charge is reversed after the value was used | Dispute suspension and reversal apply to unspent value only | The permitted treatment of the redeemed portion |
| 8 | **Billing-jurisdiction capture and validation** | Drives items 1–7; an incorrect jurisdiction applies the wrong rule set | Jurisdiction comes from the customer's billing address and is validated; conflicts with the payment method and non-US addresses are flagged for human review rather than auto-resolved | Confirmation of the validation approach and the required review workflow |
| 9 | **Membership-terms approval of the exact version** | The agreement cannot be presented until the version is approved | Terms approval gate is unsatisfied; enrollment remains closed | Approval of `autofund_membership_v1` as submitted |
| 10 | **Wallet-terms approval of the exact version** | Wallet value cannot be marketed until the wallet terms are approved | Wallet-terms gate is unsatisfied | Approval of `autofund_wallet_v1` as submitted |

---

## 4. What the system will not do without that approval

- It will not enroll a customer.
- It will not charge or bill a membership fee.
- It will not present these documents to a customer.
- It will not record any approval on counsel's behalf, and the launch interlock reads the approval gates directly and reports them as unmet.

---

## 5. Verified system facts counsel can rely on

- A membership fee **cannot** become wallet value: it is recorded with zero Booking Value issued, no wallet transaction, no lot, and no commission.
- Renewals are charged at the amount **frozen in the member's accepted contract**, and a fee cannot be re-priced by a later schedule change.
- Wallet funding and membership fees are **separate accounting components** in the ledger and in the billing history the customer sees.
- Disputed value is **suspended per lot, never deleted**, so a won dispute restores the exact amount.
- Cancellation stops future charges and does not touch the wallet balance.
- The emergency stop halts new enrollment, new fee billing and new funding issuance, and leaves cancellation, redemption, refunds, disputes and support working.