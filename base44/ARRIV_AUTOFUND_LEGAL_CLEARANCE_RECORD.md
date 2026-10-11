# ARRIV AUTO-FUND — RECORDED LEGAL CLEARANCE

**Program:** Arriv Estate Media Auto-Fund membership (five tiers), MLS Walkthrough V2 pricing.
**Record prepared:** 2026-10-11 · Arriv Estate Media
**Record status:** 🟢 **COMPLETE — COUNSEL SUPPLIED AND RECORDED 2026-10-11**

> This is the recorded clearance for the Auto-Fund launch. It records **only** what the
> owner has actually supplied. Nothing here was inferred, and no approval was recorded on
> counsel's behalf before the owner supplied the approving counsel and date.

---

## 1. What is recorded

| Field | Value |
| --- | --- |
| Counsel review and approval | **APPROVED** — counsel has reviewed and approved the Auto-Fund program for launch |
| **Approving counsel** | **Tommy Garrison** |
| **Firm** | **Macklemore & Garrison** |
| **Approval date** | **2026-10-11** |
| Source of the record | Owner directive, 2026-10-11 (final authorization), supplying counsel, firm and date |
| Approved document versions | **Membership Terms v2** (`autofund_membership_v2`), **Wallet Agreement v1** (`autofund_wallet_v1`) |
| Approved amounts | The final fee schedule **$5.99 / $10 / $25 / $27 / $30** and the final recurring charges **$155.99 / $260 / $375 / $527 / $1,030** |
| Also covered by the approval | The applicable membership disclosures and the membership-fee refund policy (`autofund_fee_policy_v2`) |
| Recorded in the system as a launch approval | **YES** — both decisions recorded through `manageAutoFundLaunch`, action `record_legal_decision`, each carrying the counsel reference above |
| Effect on enrollment | **ENROLLMENT OPENED** — see §5 |

The recording mechanism requires a `counsel_reference` and refuses any decision without
one. The reference recorded against both decisions is:

> Tommy Garrison, Macklemore & Garrison — approving counsel; approval date 2026-10-11.
> Approved: Membership Terms v2 (autofund_membership_v2), Wallet Agreement v1
> (autofund_wallet_v1), the final membership fees and recurring charges
> ($5.99/$10/$25/$27/$30; totals $155.99/$260/$375/$527/$1,030), the applicable membership
> disclosures and the fee refund policy (autofund_fee_policy_v2). Owner instruction,
> 2026-10-11: final authorization to open Auto-Fund enrollment.

---

## 2. Final approved commercial configuration (owner-supplied)

| Tier | Wallet funding | Membership fee | Total recurring monthly charge | Promotional bonus |
| --- | --- | --- | --- | --- |
| Starter | $150 | $5.99 | **$155.99** | 5% |
| Growth | $250 | $10 | **$260** | 10% |
| Professional | $350 | $25 | **$375** | 15% |
| Premier | $500 | $27 | **$527** | 20% |
| VIP | $1,000 | $30 | **$1,030** | 25% |

**MLS Walkthrough V2 pricing:** $120 / $145 / $170 / $220 / $295 — **live**.

**VIP enhanced support:** priority Arriv Assist access with human escalation for qualifying
service issues, without guaranteed session counts. Unchanged, and not part of the fee
change.

---

## 3. Material change the approval covers — closed

The fee schedule changed after the documents were first prepared for review:

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
state the v2 amounts.

**Closed 2026-10-11:** the owner supplied the approving counsel (Tommy Garrison, Macklemore
& Garrison) and the approval date (2026-10-11), scoped to the final v2 amounts, Membership
Terms v2 and Wallet Agreement v1. Both decisions are now recorded against those exact
versions, so the approval recorded in the system is the approval the owner supplied, against
the documents it names.

---

## 4. Document versions, and their clearance state

| Document | Version | Content changed by the fee revision? | Clearance state |
| --- | --- | --- | --- |
| Membership Agreement (final) | `autofund_membership_v2` | **Yes** — fee table and every tier's total charge | **APPROVED AND RECORDED** (Macklemore & Garrison, 2026-10-11) |
| Membership terms in product (`autoFundMembershipTerms.js`) | `autofund_membership_v2` | **Yes** — section 3 states the per-tier fee | Same as above (single source of version label) |
| Fee refund policy | `autofund_fee_policy_v2` | Wording only — amount reference removed; refundability unchanged | Covered by the recorded approval; policy in force is `non_refundable` |
| Wallet Agreement (final) | `autofund_wallet_v1` | **No** | **APPROVED AND RECORDED** (wallet-scoped, 2026-10-11) |
| Counsel review package | — | Yes — restated against v2 | Supplied to counsel |

---

## 5. What the system does with this

- **Recorded prerequisites.** The launch interlock reads both approvals from data. With
  them recorded — and with fee billing, the VIP restriction and MLS V2 pricing live — the
  interlock reports **zero unmet requirements**.
- **Enrollment opened 2026-10-11** on the owner's final authorization, on both channels:
  public self-service (`autofund_self_service_enabled = true`) and sales-assisted. The
  named-cohort requirement was **removed** (`autofund_cohort_required = false`), so
  enrollment is open to any eligible customer who voluntarily selects a membership.
- **Safeguards retained.** Eligibility, identity, consent, payment authorization, the
  launch interlock and the emergency stop all remain in force on every enrollment. No
  existing customer is enrolled or billed automatically, and no recurring charge can be
  raised without the customer's own affirmative authorization of the amount and terms.
- The recording mechanism (`manageAutoFundLaunch`, action `record_legal_decision`)
  **refuses any decision without a `counsel_reference`**, by design: an approval with no
  recorded basis is not an approval.

---

## 6. Separate track (unchanged by this record)

The outbound Arriv Pay employee-sync HTTP 525 failure is unremediated. Commission payout
delivery to Arriv Pay must **not** be reported as functioning until that issue is resolved.
It does not affect Auto-Fund enrollment or billing, which is driven by inbound Arriv Pay
payment events.