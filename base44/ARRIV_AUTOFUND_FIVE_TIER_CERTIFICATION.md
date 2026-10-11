# Auto-Fund Five-Tier Launch Certification

**Date:** 2026-10-11
**Model version:** `v4_20261009_final_commission_policy`
**Rules version:** `mls_full_redemption_v2_20261011`
**Authorized by:** owner approval, 2026-10-10 (five-tier restructure)
**Performed by:** Base44 (platform agent) on the owner's instruction

---

## 1. VERDICT — NOT A CLEAN PASS

The **functional, configuration and structural** certification passes completely: **66 of 66 checks**.

The **financial** certification does **not** pass. Two tiers fall below the 10% contribution-margin target, and one scenario goes negative. Per the owner's instruction — *"Only report PASS if every tier … passes. If any single item fails, report it explicitly with the exact failing tier and the exact number that failed"* — this is reported as a **failure**, not a PASS.

**Nothing has been launched, and no live pricing has been changed.**

---

## 2. WHAT WAS IMPLEMENTED

### 2.1 Five-tier structure (retired tiers removed)

| Tier | Deposit | Bonus | Booking Value / month | Membership fee | Total recurring charge |
|---|---|---|---|---|---|
| Starter | $150 | 5% ($7.50) | $157.50 | $0 | $150 |
| Growth | $250 | 10% ($25) | $275 | $0 | $250 |
| Professional | $350 | 15% ($52.50) | $402.50 | $25 | $375 |
| Premier | $500 | 20% ($100) | $600 | $25 | $525 |
| VIP | $1,000 | 25% ($250) | $1,250 | $25 | $1,025 |

The $50, $100 and $200 tiers are removed from enrollment. Their keys are **retired, not deleted** from the canonical configuration, so any historical record that references one still resolves.

### 2.2 Existing customers — nothing migrated

Verified before any change: **0 active Auto-Fund subscriptions** exist.

- 117 existing Prepaid wallets — untouched.
- 133 existing payment events — untouched.
- No subscription was rewritten, re-priced, migrated or cancelled.

Because no subscription exists on a retired tier, **no contract-terms preservation records were required and none were created.**

### 2.3 One source of pricing truth

All tier pricing resolves from the canonical configuration through a single `get_tier_catalog` endpoint. Every customer-facing number — deposit, bonus, membership fee, total recurring charge, Booking Value — is returned by the backend. **No tier amount, bonus, fee or total is written into the interface**, so a future tier change cannot leave a stale number on screen.

### 2.4 Enrollment — both paths, one engine

Both channels call the same shared enrollment engine, so price, bonus, fee and disclosure cannot diverge:

- **Self-service** — the customer enrolls themselves. The enrolled identity is the **signed-in user**, never a caller-supplied address, so one customer cannot enroll another. Only the customer can accept the recurring-charge terms.
- **Sales-assisted** — an advisor provisions the membership. An advisor can never accept the recurring terms on the customer's behalf, and a self-service enrollment with no *verified* advisor involvement generates **no commission**.

A third path, **"Speak With a Sales Growth Advisor"**, records a genuine callback request only. It does not enroll, charge, or attribute anything.

### 2.5 Customer dashboard

Customers compare all five tiers, enroll, and manage their own membership — pause, resume, change tier, cancel, and view billing history with **wallet funding and membership fees shown separately**. Ownership is verified server-side on every action, so a customer can never reach another customer's membership.

### 2.6 Marketing copy generated from live configuration

Tier cards, benefits, disclosures and the fee statement are all rendered from the backend catalog, so the displayed marketing can never drift from the configured economics.

---

## 3. CERTIFICATION RESULTS

| # | Suite | Result |
|---|---|---|
| 1 | `certifyAutoFundEnrollment` | **22 / 22 PASS** |
| 2 | `testAutoFundMlsAllowance` | **22 / 22 PASS** |
| 3 | `testBookingCommissionSuppression` | **10 / 10 PASS** |
| 4 | `runCertificationSuite` | **12 / 12 PASS** |
| 5 | `runAutoFundStressTest` | **REVIEW_REQUIRED — 6 failures** |

### 3.1 Requirement-by-requirement

| Requirement | Result | Evidence |
|---|---|---|
| Five-tier structure exact | PASS | Ladder returns $150/$250/$350/$500/$1,000 with 5/10/15/20/25% |
| Retired tiers absent from new enrollment | PASS | `tiers` array contains only the five; no `autofund_50/100/200` reachable |
| Existing customers preserved | PASS | 0 subscriptions; 117 wallets and 133 events untouched |
| No membership fee charged (billing off) | PASS | charged set `[0,0,0,0,0]`; processor returns `fee_disabled`; refused fee wrote nothing to the ledger |
| Fee table exact | PASS | $350/$500/$1,000 = $25; $150/$250 = $0 |
| Total recurring charge exact | PASS | $150 / $250 / $375 / $525 / $1,025 |
| Fee is not spendable, no promo credit, no commission | PASS | Verified on all three counts; tampered $5 fee quote rejected |
| Fee refund policy not silently non-refundable | PASS | Defaults to `undetermined` |
| VIP restriction enforced at transaction | PASS | VIP promo barred from standalone MLS; cash-funded path open |
| No caps / no minimum cash / no mandatory split (non-VIP) | PASS | `coverage=100% dollar_cap=null pct_cap=null min_cash=null mandatory_split=false` |
| Allowance balance-governed, not count-governed | PASS | `count_governed=false`, no monthly count cap at any non-VIP tier |
| No silent zeros — every zero documented | PASS | `$1000:VIP_PROMO_BARRED_FROM_STANDALONE_MLS` |
| Self-service enrollment | PASS | Signed-in identity enforced; terms accepted by customer only |
| Sales-assisted enrollment | PASS | Same engine; no caller-supplied financial value accepted |
| Commission waterfall correct | PASS | Standard marketplace keeps 15%; fully and partially wallet-funded bookings create **zero** booking commission; retry creates no duplicate |
| Recurring-commission suppression on wallet bookings | PASS | `autofund_booking_commission_rate = 0` |
| Specialist payout preserved | PASS | $50 guaranteed payout unchanged |
| Certification isolation | PASS | All fixtures `cert_`-prefixed; fixtures removed; no production balance altered |
| Enrollment gate closed | PASS | `autofund_enrollment_enabled` absent → reads closed; fails closed on null/garbage |
| Refund / reversal math | PASS | Full $50 reversal; partial $25 with $75 remaining; cumulative cap correct |

### 3.2 THE FAILING ITEMS — exact tiers and exact numbers

`runAutoFundStressTest`: 225 combinations, 12 months, target **10%** contribution margin, worst-case editing column.

| Tier | Scenario | Margin | Contribution | After obligations |
|---|---|---|---|---|
| **$500** | `mls_6x` | **4.46%** | $267.40 | $267.40 |
| **$1,000** | `premium_2x_small` | **7.77%** | $1,025.00 | $1,025.00 |
| **$1,000** | `premium_2x_small_with_refund` | **9.50%** | $1,254.50 | $825.00 |
| **$1,000** | `mls_12x` | **−2.36%** | **−$283.60** | **−$607.60** |
| **$1,000** | `mls_20x` | **6.70%** | $1,406.60 | $1,406.60 |
| **$1,000** | `mls_12x_mid` | **7.88%** | $1,182.20 | $1,182.20 |

**Per-tier worst case:**

| Tier | Worst margin | Below-target runs | Negative runs |
|---|---|---|---|
| $150 | 20.60% | 0 | 0 |
| $250 | 12.72% | 0 | 0 |
| $350 | 14.74% | 0 | 0 |
| **$500** | **4.46%** | **1** | 0 |
| **$1,000** | **−2.36%** | **5** | **1** |

**Totals:** 6 below target, 1 negative, 1 negative after funding obligations.

### 3.3 Root cause

Removing the monthly booking-count cap removed the only ceiling on **promotional** redemption into standalone MLS Walkthroughs.

A promotional redemption collects no cash: the value was granted as a bonus, but redeeming it pays out a $50 specialist fee plus editing against the walkthrough price. Promotional MLS redemption is therefore margin-negative, while cash-funded redemption is margin-positive.

At $150 and $250 the promotional pool is small ($90/year and $300/year) and cannot cause material damage — both tiers clear the 10% target. At $500 the pool reaches $1,200/year and leaks enough to reach **4.46%**. At $1,000 the pool reaches $3,000/year and the leak goes **negative**.

### 3.4 Two findings that need the owner's ruling

**(a) A direct conflict between two approved requirements.**
Requirement #7 forbids any cap on promotional MLS redemption for non-VIP tiers. The 10% margin target cannot hold at $500 and $1,000 without a ceiling, a minimum cash contribution, or a higher MLS price. These two approved requirements are mutually exclusive at those tiers. This is an owner decision, and **no cap was reintroduced**, because the model was explicitly not to be tuned to make the test pass.

**(b) The stress-test model may be out of date on two inputs.**
- `other_editing_costs.mls = 20` in the stress test, against the owner-approved canonical assumption of **$25.70**. Real margins at these tiers would be marginally **worse** than reported. Left unaligned so the certification reflects the model as built, not a favourable reinterpretation.
- The VIP `mls_*` scenarios assume promotional value paying for standalone MLS Walkthroughs — a state the VIP restriction now prevents. Those three lines are therefore **conservative upper bounds, not reachable states**, pending confirmation that the simulator models the restriction. The two VIP `premium_*` lines **are** reachable.

### 3.5 A defect found and fixed during certification

Removing the count cap exposed a live defect: after switching to a balance-governed model, an uncapped tier is granted `-1`, and the consumption guard `used >= granted` therefore evaluated `0 >= -1` as true, **blocking every consumption immediately** on precisely the tiers that are meant to have no cap. Fixed so that uncapped tiers record consumption for idempotency and audit without ever blocking, while a capped tier or explicit override still blocks at exhaustion and the VIP $0 grant still blocks promotional use entirely.

This defect was found **because** the end-to-end suite was re-run against the new tiers. It is the clearest evidence for why the certification was worth re-running rather than reusing the earlier result.

---

## 4. PRODUCTION STATE — UNCHANGED

- `autofund_enrollment_enabled` — **absent**. Enrollment reads **closed**.
- Enrollment opens only when **both** the code flag and the setting are on; either alone cannot open it. The gate fails closed on null, empty and malformed values.
- Membership-fee billing — **disabled**; a refused fee writes nothing to the ledger.
- Auto-Fund subscriptions — **0**.
- Prepaid wallets — **117**, unaltered.
- Payment events — **133**, unaltered.
- Live MLS retail price — **$100**, unchanged. The owner-approved $120 V2 configuration remains **inactive**.

**No customer can enroll, no customer can be charged, and no existing balance, subscription or payout has been modified.**

---

## 5. REQUIRED BEFORE LAUNCH

1. **Owner ruling on the $500 and $1,000 margin failures** (§3.4a). Either accept the tier, reinstate a promotional ceiling, or raise the MLS price above $120.
2. **Alignment of the stress-test MLS editing cost** to the approved $25.70 (§3.4b), then re-run.
3. **Confirmation that the simulator models the VIP MLS restriction**, or the three VIP `mls_*` lines reclassified as unreachable.
4. **Owner authorization to open the enrollment gate** — the single remaining switch.

Until items 1–3 are resolved and item 4 is explicitly authorized, **enrollment must remain closed and the Auto-Fund launch must not proceed.**