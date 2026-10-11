# ARRIV AUTO-FUND — RECORDED LEGAL CLEARANCE

**Program:** Arriv Estate Media Auto-Fund membership (five tiers), MLS Walkthrough V2 pricing.
**Record prepared:** 2026-10-11 · Arriv Estate Media
**Record status:** 🔴 **INCOMPLETE — REQUIRED FIELDS NOT SUPPLIED**

> This is the recorded clearance for the Auto-Fund launch. It records **only** what the
> owner has actually supplied. Fields left blank below are blank because the information
> was not provided; they have deliberately **not** been invented, and no approval has
> been recorded in the system on counsel's behalf.

---

## 1. What is recorded

| Field | Value |
| --- | --- |
| Counsel review and approval | **ASSERTED BY THE OWNER** — "legal counsel has reviewed and approved the Auto-Fund program for launch" |
| Source of the assertion | Owner directive, 2026-10-11 |
| Scope asserted | The Auto-Fund program, for launch |
| **Approving counsel (name / firm)** | **NOT SUPPLIED — REQUIRED** |
| **Approval date** | **NOT SUPPLIED — REQUIRED** |
| **Approved document versions** | **NOT SUPPLIED — REQUIRED** (see §3) |
| Recorded in the system as a launch approval | **NO** — no `counsel_reference` exists, and the recording mechanism refuses an approval with no basis |
| Effect on enrollment | **NONE** — enrollment stays closed |

Nothing in this record, in `autoFundFeePolicy.ts`, or anywhere else in the system asserts
that counsel approved a specific document version, because no version was identified.

---

## 2. Final approved commercial configuration (owner-supplied)

| Tier | Wallet funding | Membership fee | Total recurring monthly charge | Promotional bonus |
| --- | --- | --- | --- | --- |
| Starter | $150 | $5.99 | **$155.99** | 5% |
| Growth | $250 | $10 | **$260** | 10% |
| Professional | $350 | $25 | **$375** | 15% |
| Premier | $500 | $27 | **$527** | 20% |
| VIP | $1,000 | $30 | **$1,030** | 25% |

**MLS Walkthrough V2 pricing:** $120 / $145 / $170 / $220 / $295 (approved; record exists, not activated).

**VIP enhanced support:** priority Arriv Assist access with human escalation for qualifying
service issues, without guaranteed session counts. Unchanged, and not part of the fee
change.

---

## 3. Material change requiring counsel confirmation — the reason this record is incomplete

The fee schedule changed after the documents were prepared for review:

| Tier | Fee in the reviewed drafts (v1) | **Final approved fee (v2)** | Change to the total charge |
| --- | --- | --- | --- |
| Starter | $0 | **$5.99** | $150 → $155.99 |
| Growth | $0 | **$10** | $250 → $260 |
| Professional | $25 | $25 | $375 (unchanged) |
| Premier | $25 | **$27** | $525 → $527 |
| VIP | $25 | **$30** | $1,025 → $1,030 |

Because the fee amounts are part of the membership terms, the membership-terms version
advanced to **`autofund_membership_v2`**: v1 cannot carry these amounts, and an approval
recorded against v1 does not carry to them. The fee-refund policy was re-issued as
**`autofund_fee_policy_v2`** in amount-neutral terms (the refundability itself is
unchanged). The customer-facing terms, the disclosures, the acknowledgment notices and
every fee-bearing surface resolve their amounts from the approved schedule, so all of them
now state the v2 amounts.

**What is required:** confirmation that the approval covers the **final v2 amounts**
above, naming the approved document versions. This requires no engineering change; it is a
confirmation against the versions listed in §4.

---

## 4. Document versions, and their clearance state

| Document | Version | Content changed by the fee revision? | Clearance state |
| --- | --- | --- | --- |
| Membership Agreement (final) | `autofund_membership_v2` | **Yes** — fee table and every tier's total charge | Approval asserted; **version not identified by counsel** |
| Membership terms in product (`autoFundMembershipTerms.js`) | `autofund_membership_v2` | **Yes** — section 3 states the per-tier fee | Same as above (single source of version label) |
| Fee refund policy | `autofund_fee_policy_v2` | Wording only — amount reference removed; refundability unchanged | Owner-adopted; counsel status `not_completed` |
| Wallet Agreement (final) | `autofund_wallet_v1` | **No** | Approval asserted; **not recorded** |
| Counsel review package | — | Yes — restated against v2 | For counsel |

---

## 5. What the system does with this

- **Nothing is activated by this record.** Enrollment, fee billing, the VIP restriction
  and the master gate all remain off; V2 pricing remains inactive.
- The launch interlock reads the approval gates from data, and still reports
  `LEGAL_TERMS_NOT_APPROVED` and `WALLET_TERMS_NOT_APPROVED`.
- The recording mechanism (`manageAutoFundLaunch`, action `record_legal_decision`)
  **refuses any decision without a `counsel_reference`**, by design: an approval with no
  recorded basis is not an approval.

### To complete this record

Record the two decisions through `manageAutoFundLaunch` (action `record_legal_decision`),
each with its `counsel_reference` (approving counsel and date), and enter the approved
document versions here:

1. `decision: terms_approval`, `value: autofund_membership_v2`
2. `decision: wallet_terms_approval`, `value: true`

Neither is an activation: recording them charges no customer and opens no enrollment.
Activation is a separate, owner-authorized step (see the activation sequence in
`prepareAutoFundV2PricingActivation`).

---

## 6. Confirmation request — ready to send to counsel

The record above stays incomplete until the version-match is confirmed in writing. This is
the exact confirmation needed; it asks nothing new, only whether the approval already given
covers the final amounts.

> We need written confirmation that your review and approval of the Arriv Auto-Fund program
> covers the **final** documents below, and specifically the recurring amounts stated in
> them, which changed after the drafts you first reviewed:
>
> 1. **Membership Agreement — version `autofund_membership_v2`**: monthly wallet funding of
>    $150 / $250 / $350 / $500 / $1,000, monthly membership fee of
>    $5.99 / $10 / $25 / $27 / $30, and total recurring monthly charges of
>    $155.99 / $260 / $375 / $527 / $1,030.
> 2. **Wallet Agreement — version `autofund_wallet_v1`**: unchanged since review (funding
>    lots valid 12 months, expiry enforced, no cash-out).
> 3. **Membership-fee refund policy — version `autofund_fee_policy_v2`**: re-issued in
>    amount-neutral terms; refundability itself unchanged.
>
> Please confirm (a) that the version identifiers above are the versions you reviewed and
> approved, (b) that the amounts above are approved, and (c) the date of approval and the
> firm or individual providing it, for the record.
>
> For reference, the earlier drafts stated fees of $0 / $0 / $25 / $25 / $25, with total
> recurring charges of $150 / $250 / $375 / $525 / $1,025. If your approval was given
> against those figures, please confirm the revised figures above separately.

**Until that confirmation exists:** the launch interlock continues to report
`LEGAL_TERMS_NOT_APPROVED` and `WALLET_TERMS_NOT_APPROVED`, enrollment stays closed, and no
customer can be enrolled. No fee can be charged: fee billing is off, and the interlock
refuses every tier — the final schedule has no fee-free tier — while it is off.