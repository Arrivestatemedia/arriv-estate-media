# ARRIV AUTO-FUND — LAUNCH HARDENING & OWNER-DECISION REPORT

**Date:** 2026-10-11
**Scope:** owner-approved fee-refund policy adoption, launch-safety emergency stop, VIP support proposal, V2 price-activation readiness.
**No pricing, fee, flag or switch was activated. No customer was enrolled or charged.**

---

## 1. Membership-fee refund policy — ADOPTED (business policy, not legal approval)

The $25 monthly membership-fee refund policy approved by the owner is now the live
policy, encoded clause by clause in `base44/shared/autoFundFeePolicy.ts` (version
`autofund_fee_policy_v1`) and persisted as an audit record.

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

**Counsel review status: NOT COMPLETED.** Owner adoption is a business decision and
does not record legal approval of the membership terms, the separate wallet terms or
the renewal-notice cadence. The launch interlock still requires those, and the fee
policy gate is the only legal gate that is now satisfied.

**Effect on launch blockers:** the requirement `FEE_REFUND_POLICY_UNDETERMINED` is
gone from the real configuration. `LEGAL_TERMS_NOT_APPROVED` and
`WALLET_TERMS_NOT_APPROVED` remain.

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

## 3. VIP support proposal — prepared, NOT an entitlement

Prepared in `base44/shared/autoFundVipSupportProposal.ts`
(`autofund_vip_support_v1`), status `PROPOSED_AWAITING_OWNER_APPROVAL`,
`is_contractual_entitlement: false`. Publication as an entitlement is blocked.

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