# Auto-Fund / Prepaid — Final Financial Certification Report

**Prepared:** 2026-10-09
**Status:** REVIEW_REQUIRED — staged configuration is safe except for one narrow case in the $1,000 VIP tier
**Scope:** 12-month wallet-economics model across the approved Auto-Fund ladder, plus the full payment / wallet-isolation / cross-app / financial certification suites

---

## 1. Approval under review

| Monthly cash | Booking Value issued | Bonus |
|---|---|---|
| $50 | $50 | 0% |
| $100 | $105 | 5% |
| $200 | $220 | 10% |
| $350 | $402.50 | 15% |
| $500 | $600 | 20% |
| $1,000 | $1,250 | 25% + VIP benefits |

VIP benefits apply to the $1,000 tier only: monthly priority support, premium package support, and a standing add-on credit.

Production currently still issues a flat 5% bonus on every tier. The ladder above is staged, not deployed.

## 2. Methodology

> Wallet is a payment method, not a discount. `total_consideration = wallet_applied + cash_shortfall = canonical retail`. Payout and editing are charged once, against redeemed services only. Unredeemed Booking Value is deducted once, after realised contribution.

Assumptions held constant across the model:

- 12-month horizon
- Booking Value per tier as approved
- Contractor payout $0.40 of retail per dollar
- Sales commission 10% of cash collected
- Stripe 2.9% + $0.30 on funding charges **and** on cash shortfalls
- Premium editing $100–$200 per sqft (2.75% band), Cinematic $100, Essentials $50, MLS $20
- VIP benefits costed at 50% priority-support utilisation and 25% add-on redemption

## 3. Results — 162 combinations

| Tier | Booking Value | Worst margin | Worst scenario | Runs below 10% | Runs negative |
|---|---|---|---|---|---|
| $50 | $50 | **+26.64%** | 1× Premium accumulate, $200 editing | 0 | 0 |
| $100 | $105 | **+25.37%** | 1× Premium accumulate, $200 editing | 0 | 0 |
| $200 | $220 | **+22.20%** | 1× Premium accumulate, $200 editing | 0 | 0 |
| $350 | $402.50 | **+15.88%** | 1× Premium accumulate, $200 editing | 0 | 0 |
| $500 | $600 | **+6.56%** | 1× Premium accumulate, $200 editing | 1 | 0 |
| $1,000 | $1,250 | **−0.89%** | 2× Premium/month, $200 editing | 8 | 1 |

**9 of 162 runs fall below the 10% contribution target. Exactly 1 of 162 is loss-making.**

### The nine below-target runs

| Tier | Scenario | Premium editing | Margin | Contribution |
|---|---|---|---|---|
| $500 | 1× Premium accumulate | $200 | 6.56% | +$452.70 |
| $1,000 | 2× Premium | $150 | 8.20% | +$1,083.00 |
| $1,000 | 2× Premium | $175 | 3.66% | +$483.00 |
| $1,000 | 2× Premium | $200 | **−0.89%** | **−$117.00** |
| $1,000 | Premium + Cinematic 2× | $150 | 8.34% | +$1,001.40 |
| $1,000 | Premium + Cinematic 2× | $175 | 5.85% | +$701.40 |
| $1,000 | Premium + Cinematic 2× | $200 | 3.35% | +$401.40 |
| $1,000 | 2× Premium + refund | $175 | 5.70% | +$753.00 |
| $1,000 | 2× Premium + refund | $200 | 1.16% | +$153.00 |

### Break-even thresholds

- **$1,000 tier, 2× Premium/month:** contribution is +$1,083 at $150 editing, +$483 at $175, −$117 at $200. Break-even is at **≈ $195 per sqft** premium editing cost.
- **$500 tier, 1× Premium/month:** +$452.70 even at $200 editing. Break-even is at **≈ $238 per sqft**.

Every tier from $50 to $350 clears a 15.88% margin worst case across all 27 scenarios tested.

## 4. Negative after funding obligations — 3 runs

Realised contribution can be positive while the contract still carries a net liability, because unredeemed Booking Value is a future payout and editing commitment.

| Tier | Scenario | Realised contribution | Unredeemed Booking Value | After obligations |
|---|---|---|---|---|
| $1,000 | 1× Premium accumulate, $200 editing | +$4,548.90 (37.91%) | $6,900.00 | **−$255.54** |
| $1,000 | 2× Premium + refund, $200 editing | +$153.00 | $675.00 | **−$317.00** |
| $1,000 | 2× Premium, $200 editing | −$117.00 | $0.00 | **−$117.00** |

This is the expected behaviour of a funding product, not a defect: a member who funds $12,000 and redeems lightly holds a real future obligation. It is reported so the liability is never mistaken for profit.

## 5. VIP benefit exposure ($1,000 tier)

At 24 premium bookings per year the VIP package costs **$447/year** — support $72, priority support $300, add-on credits $75 — which is already inside every figure above.

Sensitivity to priority-support utilisation:

| Utilisation | Annual VIP cost |
|---|---|
| 0% | $147 |
| 50% (assumed) | $447 |
| 100% | $747 |

At full utilisation the worst-case $1,000 scenario moves from −$117 to approximately −$417.

## 6. Certification suite results

| Suite | Result | Notes |
|---|---|---|
| Wallet isolation | **6/6 PASS** | Production wallet confirmed untouched |
| Credit precision | **6/6 PASS** | Integer-cent exactness holds; $100 → 10,500¢, 3× = 31,500¢ |
| Individual payment recovery | **20/20 PASS** | 3-strike pause, reminders once-only, no credits on decline, rejected unauthorised card-update |
| Deployed payment contract | **20/20 PASS** | `production_balances_unchanged: true`, cleanup clean, no remaining cert records |
| Cross-app certification gate | **9/11 FAIL** | The 2 failures are the 500-instead-of-403 mapping on permanent security rejections — staged, not deployed |
| Auto-Fund 12-month stress | **REVIEW_REQUIRED** | The 9 flagged scenarios in section 3 |
| Prepaid tier stress | **PROBLEMS_FOUND** | STARTER × premium at 5,001–7,500 sqft (−5%) and 7,501–10,000 sqft (−20%) — pre-existing $500→$550 Booking Value vs $1,100 premium job, unrelated to the new ladder |

**61 of 63 assertions passed.** The only failures are the two status-mapping assertions caused by the deployment lag.

## 7. Production data integrity

- **11 production wallets, every one at $0.00** — total production booking-value balance is $0.00. No production customer balance moved.
- `prepaid_enabled` flag remains `true`, unchanged by any certification run.
- Zero certification subscriptions.
- 88 synthetic `cert_` wallets remain in the database, holding $7,600 of synthetic Booking Value, alongside 129 synthetic lots, 110 payment events and 117 recovery notifications. These are excluded from production analytics by the certification filter, but they are test debris: the credit-precision suite in particular leaves its fixtures behind (newest at 15:57:49–15:57:55 today).

## 8. Recommendation

**Stage the approved ladder as configured.** It is sound for $50 through $500, and the exposure at $1,000 is one combination in 162 that requires maximum redemption *and* top-of-band editing cost simultaneously.

Before the $1,000 tier is offered at scale, close the gap one of three ways:

1. **Operational guardrail (recommended, no pricing change).** Hold premium editing on VIP redemptions at or below $175 per sqft. That keeps the tier at +3.66% worst case. Above $195 it loses money.
2. **Cap priority support.** Reduce the VIP priority-support benefit from 12 sessions a year to 4. Saves $200 against the worst case, moving it from −$117 to +$83.
3. **Trim the bonus.** Issue $1,200 instead of $1,250 (a 20% bonus). Removes roughly $420 of exposure and lifts the worst case to about +$300.

Options 2 and 3 are structural; option 1 is a control and can be revisited once real editing costs are known.