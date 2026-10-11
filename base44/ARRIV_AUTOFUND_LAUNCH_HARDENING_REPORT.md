# ARRIV AUTO-FUND — LAUNCH HARDENING & OWNER-DECISION REPORT

**Date:** 2026-10-11
**Scope:** owner-approved fee-refund policy adoption, launch-safety emergency stop, VIP support proposal, V2 price-activation readiness.
**No pricing, fee, flag or switch was activated. No customer was enrolled or charged.**

---

## 1. Membership-fee refund policy — ADOPTED; legal clearance asserted, not yet recorded

The owner-approved monthly membership-fee refund policy is now the live policy, encoded
clause by clause in `base44/shared/autoFundFeePolicy.ts` (version `autofund_fee_policy_v2`
— re-issued in amount-neutral terms when the final fee schedule set a different fee on
every tier) and persisted as an audit record. The refundability itself is unchanged.

| Clause | Where it is enforced |
| --- | --- |
| 1. Fee is a separate monthly charge, not a wallet deposit | `autoFundMembershipBilling.ts` records a fee with `booking_value_issued_cents = 0` |
| 2. Properly authorized fees ordinarily nonrefundable once the period begins and benefits are available | The live refund disclosure |
| 3. Refund unauthorized, duplicate, erroneous, or post-cancellation charges | `recordFeeRefund()` + fee-event idempotency on `payment_event_id` |
| 4. Remedy if membership benefits are not made available | Material-failure clause carried in the fee disclosure |
| 5. Cancellation stops future charges without forfeiting cash-funded balances | Cancellation path; never touches wallet balance |
| 6. Applicable law overrides conflicting provisions | Statutory-override clause carried in the fee disclosure |
| 7. Disclose the complete monthly recurring charge before authorization | `buildChargeDisclosure()` / enrollment disclosure |
| 8. Preserve accepted fee, contract version, authorization evidence | `AutoFundConsentRecord` + `AutoFundMembershipNotice` |

**Legal clearance: ASSERTED BY THE OWNER, NOT YET RECORDED.** The owner attests
(2026-10-11) that external counsel has reviewed and approved the Auto-Fund program for
launch. No approving counsel, approval date or approved document versions were supplied,
so nothing in this system records that approval, and `FEE_POLICY_COUNSEL_REVIEW_STATUS`
stays `not_completed`. Separately, the final approved fee schedule
($5.99 / $10 / $25 / $27 / $30, totalling $155.99 / $260 / $375 / $527 / $1,030) differs
materially from the schedule in the drafts first reviewed, and the membership-terms
version advanced to `autofund_membership_v2` for that reason. Both points are recorded in
`ARRIV_AUTOFUND_LEGAL_CLEARANCE_RECORD.md`.

**Effect on launch blockers:** the requirement `FEE_REFUND_POLICY_UNDETERMINED` is
gone from the real configuration. `LEGAL_TERMS_NOT_APPROVED` and
`WALLET_TERMS_NOT_APPROVED` remain until the clearance is recorded through
`manageAutoFundLaunch` with its `counsel_reference` — which is a prerequisite, not an
activation, and charges nobody.

---

## 2. Emergency stop — verified (10/10)

A data-level stop (`AppSetting` key `autofund_emergency_stop`) that the owner can
operate instantly with no deploy.

| Blocker | Verified |
| --- | --- |
| New enrollment, all channels | ✅ refused, `EMERGENCY_STOP_ACTIVE` |
| New wallet-funding issuance | ✅ refused before any identity resolution or value issuance |
| New membership-fee billing | ✅ refused |
| Cancellation, pause/resume, redemption, refunds, dispute handling, support | ✅ deliberately unaffected |
| Default when the setting is absent | ✅ INACTIVE — production behaviour unchanged |
| Certification suites against a stopped system | ✅ bypass, so suites stay exercisable |

**Production state: the stop is absent, i.e. INACTIVE.**

---

## 3. VIP support — FINALIZED BY OWNER DIRECTIVE 2026-10-11

The 12-session proposal is **superseded**. `base44/shared/autoFundVipSupportProposal.ts`
(`autofund_vip_support_v1`) stays in place as the record of what was considered and
rejected. The finalized benefit now lives in `base44/shared/autoFundVipSupport.ts`
(`autofund_vip_support_v2_finalized`):

> VIP members receive priority access to Arriv Assist, including automated assistance
> and escalation to a human support representative when necessary to resolve
> qualifying service-related issues.

No number of human sessions, no hours, no response-time guarantee and no dedicated
agent is promised, and existing support rights are unchanged. Delivery uses queues that
already exist (`support_tier` priority routing plus the existing Arriv Assist escalation
path), so no new headcount, tooling or booking process is introduced. The prohibited
claims are enumerated in the module and asserted against the benefit text.

Prepared text (subject to final terms):

> VIP members may request up to 12 qualifying support sessions per membership year,
> subject to session availability and the support terms. This benefit is subject to final terms.

Open before approval: definition of a "qualifying support session"; confirmed
delivery cost per session (the model assumes $25); accrual, carry-over, survival
after cancellation and fair-use terms; "up to 12" versus a firm entitlement; and
which tiers carry the benefit.

### Is the proposed 12-session benefit financially supportable? — PARTLY

Modelled at $25/session as an operating arm (both cost bases), full 12-session
utilization:

| Tier | Expected cost basis | High cost basis | Verdict |
| --- | --- | --- | --- |
| $150 Starter | +$36.82 | −$0.50 | borderline (break-even at high cost) |
| $250 Growth | +$20.13 | −$83.84 | not supportable at high cost |
| $350 Professional | +$27.00 | −$26.94 | not supportable at high cost |
| $500 Premier | **−$26.03** | −$452.90 | **not supportable** |
| $1,000 VIP | **−$931.04** | −$1,890.70 | **not supportable** |

The $25 fee collects exactly $300/year — the same as the assumed $300/year support
cost — so at the assumed cost basis the fee exactly funds the benefit and leaves no
margin, and on Premier and VIP it deepens an already-negative position (those two
tiers are negative under the existing full contractual support obligation too).

**Recommendation for the owner's decision:** approve the 12-session benefit only with
a settled lower cost per session, a lower session count on Premier/VIP, or a higher
membership fee on those tiers. Approving it as drafted on all tiers is not
financially supportable.

### The FINALIZED benefit, priced — verified 2026-10-11

Contribution per VIP member-year at the **owner-approved V2 MLS price ($120)**, with the
membership fee collected and full eventual redemption of all cash-funded and promotional
Booking Value:

| Basis | Contribution | Escalation events absorbed at $25 |
| --- | --- | --- |
| Planning (expected cost basis) | **+$50.13** | 2 |
| Measured (high cost basis) | **−$14.66** | 0 |

**Exact shortfall: $14.66 per VIP member-year** on the measured cost basis — about
$1.22 per month, and 0.12% of the $12,300 collected per VIP member-year.

**Smallest corrective option:** raise the VIP membership fee from $25 to **$27/month**
(+$24/year). That clears the $14.66 with $9.34 of margin and applies to VIP only.
Equivalent alternatives: reduce the priority-support retainer from $6.00 to $4.78/month
(trims the cost assumption rather than adding revenue), or a further increment on the
MLS base price (shared by every tier, so it is the bluntest of the three).

> **PARTLY ADDRESSED by the final approved configuration (2026-10-11).** The VIP fee is
> **$30/month**, $5/month above the $25 analysed here. Because collected revenue carries
> payment-processing cost, that $60/year adds about **$4.86/year** of contribution, taking
> the measured-basis position from −$14.66 to **−$9.80**. VIP is therefore still short
> **$9.80 per member-year** on the measured cost basis; on the planning basis it is
> positive at **+$54.99**.
>
> **Smallest remaining corrective option:** VIP fee **$30 → $32/month** (+$24/year gross,
> about +$23/year net of processing), which clears the $9.80 with margin, applies to VIP
> only and issues no Booking Value. Alternatives: reduce the priority-support retainer from
> $6.00 to $5.18/month, or a further increment on the MLS base price.

**The price basis matters more than anything else here.** At today's $100 the same
finalized benefit loses $631.04 per VIP member-year on the planning basis and $1,590.70
on the measured basis; at $120 it gains $50.13 and loses only $14.66. Activating the
approved V2 ladder is what makes the finalized benefit viable, and the residual is
$14.66 — not the $931 to $1,891 the rejected 12-session proposal cost.

Under the retained 48-event stress ceiling (not an entitlement): −$49.87 planning at
$120, against −$1,831.04 at $100.

Tier $500 Premier carries the finalized benefit positively on **both** cost bases
(+$72.19 planning, +$34.88 measured) at the approved price.

---

## 4. Price activation readiness (condition D)

- Active pricing record: `AEM_MEDIA_PRICING_V1` → $100 standard MLS (TIER_1).
- Code live version: V1.
- `code_matches_active_record: true`, `v1_fallback_inconsistency_present: false` —
  **today the system is self-consistent at $100.**
- The owner-approved V2 record exists but is inactive. V2 ladder is defined:
  $120 / $145 / $170 / $220 / $295.
- Activating the record alone **would** create the V1 fallback inconsistency, because
  constant-reading surfaces would still resolve V1.

**Atomic activation steps (must land together):**
1. Set the V2 record `is_active = true` and the V1 record `false`.
2. Set `MLS_PRICING_VERSION_LIVE = 'V2'` in `base44/shared/mlsPricing.ts`.
3. Re-run the verification: `code_matches_active_record` must stay true and
   `v1_fallback_inconsistency_present` false.

Re-verify after activation: retail checkout, booking totals and their pricing
snapshots, invoices (pay-up-front, deposit, final closing, B2B), B2B media-credit
costing, Auto-Fund MLS allowance and redemption math.

---

## 5. Certification results

| Suite | Result |
| --- | --- |
| Emergency stop (`testAutoFundEmergencyStop`) | **10/10** |
| Membership compliance (`testAutoFundMembershipCompliance`) | **75/75** (B9 updated to the adopted policy + counsel-not-completed) |
| Launch interlock (`testAutoFundLaunchInterlock`) | **25/25** (K1 updated: fee-policy gate satisfied, legal gates still unmet) |
| Billing end-to-end (`testAutoFundBillingEndToEnd`) | **36/36**, fixtures deleted, no cleanup errors |

---

## 6. Remaining launch gates — all owner-controlled, none activated

Real configuration still refuses enrollment, naming **10 unmet requirements**:

1. `ENROLLMENT_NOT_ENABLED` — the master enrollment switch.
2. `FEE_NOT_ENABLED` (×3 fee tiers) — membership-fee billing switch.
3. `TIER_SCHEDULE_DIVERGED` (×3) — approved schedule (V2 + fee) is not the live one.
4. `VIP_RESTRICTION_INACTIVE` — the VIP promotional restriction is not live at the booking layer.
5. `LEGAL_TERMS_NOT_APPROVED` — counsel.
6. `WALLET_TERMS_NOT_APPROVED` — counsel.

Owner decisions still outstanding: approve or revise the VIP support proposal;
authorize the synchronized V2 activation; authorize the membership-fee switch at
final counsel sign-off; and enable the master enrollment gate.