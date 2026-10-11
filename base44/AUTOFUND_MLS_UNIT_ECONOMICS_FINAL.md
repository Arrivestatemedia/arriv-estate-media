# Auto-Fund MLS Walkthrough — Final Unit Economics and Allowance Optimization

**Date:** 2026-10-11
**Model:** `mls_unit_economics_v3_20261011` (`optimizeMlsUnitEconomics`, admin-only, read-only)
**Supersedes:** the cost-reduction and recommendation sections of `AUTOFUND_MLS_FULL_REDEMPTION_MODEL.md`
**Status:** ANALYSIS ONLY. No pricing, compensation, allowance configuration, enrollment flag, balance, or production setting was changed.

---

## Summary

1. **The 17.29% VIP figure was never real.** It left $3,000 of promotional Booking Value a year uncosted. Costed correctly, the same customer earns **2.93%**.
2. **A genuine $10 delivery-cost reduction cannot be shown.** The $50 specialist payout is contractual, and the $20 editing figure is a modelling assumption. **No MLS Walkthrough has ever been booked, edited or paid out in production.** Option B is unproven.
3. **The $100 price cannot hold the $350, $500 or $1,000 tiers, even at a zero allowance.** This holds while all six bonuses are preserved.
4. **$118 is the lowest price** at which every tier supports a meaningful, fully promotional-covered allowance. **I recommend $120:** for $2 more, the VIP tier's headroom roughly triples.
5. **Recommended allowances at $120:** $50: none (the tier earns no promotional credits) · $100: 1 · $200: 1 · $350: 1 · $500: 1 · $1,000 VIP: 3.
6. **The VIP tier depends on two numbers nobody has measured yet:**
   - MLS editing must cost **$21.50 or less** per walkthrough.
   - VIP enhanced-support use must stay at or below **21 sessions per member per year**.

---

## Phase 1 — Reconciliation: 17.29% → 1.83%

Scenario: $1,000 VIP tier, standalone MLS Walkthroughs only, zero standalone allowance.

### Complete annual ledger

| Line | Hybrid (as reported) | Corrected v2 | Final model, same customer as v2 | Final model, hybrid's own customer |
|---|---|---|---|---|
| Customer pattern | 12 walkthroughs/mo | spends wallet exactly | spends wallet exactly | 12 walkthroughs/mo |
| Funding cash | $12,000.00 | $12,000.00 | $12,000.00 | $12,000.00 |
| Direct-paid walkthroughs | $2,400.00 (24) | $0 | $0 | $2,400.00 (24) |
| **Cash in** | **$14,400.00** | **$12,000.00** | **$12,000.00** | **$14,400.00** |
| Walkthroughs delivered | 144 | 120 | 120 | 144 |
| Specialist payout ($50) | $7,200.00 | $6,000.00 | $6,000.00 | $7,200.00 |
| Editing ($20) | $2,880.00 | $2,400.00 | $2,400.00 | $2,880.00 |
| Funding commission (15% / 8%) | $1,030.00 | $1,030.00 | $1,030.00 | $1,030.00 |
| 15% commission on fully direct-paid bookings | **$0 (omitted)** | $0 | $0 | $360.00 |
| Stripe | $428.40 | $351.60 | $351.60 | $428.40 |
| VIP cost (retainer + 12 sessions) | $372.00 | $372.00 | $372.00 | $372.00 |
| **12-month contribution** | **$2,489.60** | **$1,846.40** | **$1,846.40** | **$2,129.60** |
| Promotional Booking Value outstanding | $3,000.00 | $3,000.00 | $3,000.00 | $3,000.00 |
| Cost to deliver it | **$0 (not charged)** | $1,627.06 | $1,708.00 | $1,708.00 |
| **Lifetime contribution** | **$2,489.60** | **$219.34** | **$138.40** | **$421.60** |
| **Lifetime margin** | **17.29%** | **1.83%** | **1.15%** | **2.93%** |

### Bridge

| Step | Change | Result |
|---|---|---|
| Hybrid as reported | | $2,489.60 (17.29% of $14,400) |
| 1. Charge the $3,000 of promotional value the hybrid never costed | −$1,627.06 | |
| 2. Customer pattern: remove the 24 direct-paid walkthroughs | −$643.20 | |
| **Corrected v2** | | **$219.34 (1.83% of $12,000) — $980.66 short of 10%** |
| 3. Price the bundle on one ≤2,500 sqft property ($375 / $213.50, 43.07%) instead of mixing size tiers | −$80.94 | **$138.40 (1.15%)** |

### What changed, and which changes were corrections

- **Step 1 is the error that matters.** At a zero allowance the hybrid customer could not spend promotional value on standalone MLS, so the hybrid model treated the $3,000 as "neither obligation nor profit". But the customer can always spend it on bundles and packages, so it is a real obligation. This one item explains $1,627.06 of the gap.
- **Step 2 is a change of customer, not an error.** Direct-paid walkthroughs are real revenue at a 30% margin, and they lift the reported margin. The final model tests both customers.
- **The hybrid also left out $360** of 15% marketplace commission. A booking paid entirely by card applies no wallet value, so it is a standard marketplace booking.
- **The margin base changed** from $14,400 to $12,000 only because the customer pattern changed.
- **Step 3 is a final-model refinement.** One property has one size, so both services in a bundle are now priced on the same tier. This is more conservative.

---

## Phase 2 — The $70 Delivery Cost

### Per-walkthrough breakdown (≤2,500 sqft)

| Component | Wallet-funded | Fully direct-paid | Source | Evidence |
|---|---|---|---|---|
| Specialist payout | $50.00 | $50.00 | MLS guaranteed payout table, TIER_1, `AEM_MEDIA_PROVIDER_COMP_V1` | Contractual, verified in code |
| Editing | $20.00 | $20.00 | Constant used in the stress-test models only. **Not a configured or paid rate** | **Unverified** |
| Payment processing | $0.00 | $3.20 | Wallet redemptions carry no fee; Stripe is paid when the wallet is funded | Verified in code |
| Booking-level sales commission | $0.00 | $15.00 | Suppressed when any wallet value is applied; 15% otherwise | Verified in code |
| **Total** | **$70.00** | **$88.20** | | |

Not included in the $70: SMS notifications, calendar invites, file storage and support time. They are small but unmeasured, so **$70 is a floor, not a ceiling.**

### Operational evidence

| Measure | Production value |
|---|---|
| MLS Walkthrough jobs ever created | **0** |
| MLS editing tasks ever created | **0** |
| MLS editing tasks with tracked minutes | **0** |
| MLS compensation snapshots | **0** |
| Active editors | 1, at $23.00/hour |
| Editor time implied by $20 | 52 minutes |
| Editor time needed for $10 | 26 minutes |

### Can $10 per walkthrough be saved without cutting pay, deliverables or quality?

**This cannot be demonstrated.**

- **Specialist payout ($50)** is the guaranteed contractual rate. Reducing it would cut specialist pay, which the brief rules out.
- **Editing ($20)** is the only possible lever. Saving $10 would require a complete walkthrough video edit in about 26 minutes. No MLS edit has ever been performed, so there is no evidence for 26 minutes, or for the 52 minutes the current figure assumes.
- The risk runs both ways: **$20 could be too low.** The time-tracking needed to settle this (editing sessions and active editing minutes) already exists in the app. It has just never been used on an MLS job.

**Option B is modelled below but is not a basis for any decision.**

---

## Phase 3 — Maximum Sustainable Monthly Standalone Allowance

Assumptions:
- Promotional value covers **100%** of each eligible walkthrough. There are no dollar caps and no required cash contribution.
- All outstanding Booking Value is eventually redeemed.
- A tier's allowance counts only if **every allowance from 0 up to it** holds a 10% lifetime margin for **all 14 customer patterns**.

| Tier | Promo / month | **A** — $100 / $70 | **B** — $100 / $60 (unproven) | **C** — $120 / $70 |
|---|---|---|---|---|
| $50 | $0 | n/a — no promotional credits | n/a | n/a |
| $100 | $5 | **20** (all tested) | 20 | 20 |
| $200 | $20 | **20** | 20 | 20 |
| $350 | $52.50 | **None — fails at 0** (9.89%, **$4.58** short) | 20 | 20 |
| $500 | $100 | **None — fails at 0** (7.07%, **$175.80** short) | 20 | 20 |
| $1,000 VIP | $250 | **None — fails at 0** (0.58%, **$1,130.17** short) | 20 | 20 |

**How to read "20":** every allowance tested up to 20 holds the target. Above the steady-state level the count stops mattering, because the promotional balance runs out before the allowance does. For example, the $100 tier earns only $5 a month.

**Under A, the three upper tiers fail with no allowance at all.** Their bonuses are delivered as services that cost more than the cash-funded work earns. No allowance setting can fix that.

---

## Phase 4 — Stress Testing

**Grid:** allowances 0–20 × 14 customer patterns × 6 tiers = **1,764 configurations per alternative (5,292 in total)**. A price search was also run at every price from $100 to $140, at editing costs of $20, $25 and $30.

### The 14 customer patterns

- 1, 3, 6, 12 and 20 standalone walkthroughs a month (the higher volumes include direct payment beyond the wallet)
- Spends the entire wallet on walkthroughs every month
- 4 walkthroughs plus 1 bundle a month
- Alternating walkthrough months and bundle months
- Bundle-heavy
- Larger packages only
- A $500 cash-funded top-up
- Wallet accumulation (light use for six months, then 15 a month)
- Two refunds a year
- A three-month pause

Every pattern includes the VIP retainer, 12 enhanced-support sessions a year at $25, and the VIP add-on discounts.

### Configurations below 10%

| Alternative | Below 10%, lifetime | Below 10%, 12-month |
|---|---|---|
| A — $100 / $70 | **524** | **219** |
| B — $100 / $60 | 0 | 0 |
| C — $120 / $70 | 0 | 0 |

### Every failing group under A

| Tier | Pattern | Lifetime fails at allowances | Worst lifetime | 12-month fails at |
|---|---|---|---|---|
| $350 | 1 / month | 0–20 | 7.93% ($333.10) | — |
| $350 | 3 / month | 0–20 | 7.93% ($333.10) | — |
| $350 | spends wallet | 0–20 | 7.93% ($333.10) | 1–20 |
| $500 | 1 / month | 0–20 | 4.46% ($267.40) | — |
| $500 | 3 / month | 0–20 | 4.46% ($267.40) | — |
| $500 | 6 / month | 0–20 | 4.46% ($267.40) | 1–20 |
| $500 | 12 / month | 0–20 | 8.46% ($1,117.00) | 1–20 |
| $500 | 20 / month | 1–20 | 9.87% ($2,249.80) | 1–20 |
| $500 | spends wallet | 0–20 | 4.46% ($267.40) | 1–20 |
| $500 | cash top-up | 0–20 | 5.58% ($362.60) | — |
| $500 | accumulator | 0–20 | 6.55% ($550.60) | 1–20 |
| $500 | refunds | 0–20 | 3.77% ($226.26) | 1–20 |
| $500 | pause / resume | 0–20 | 4.26% ($191.80) | 1–20 |
| $1,000 | 1 / month | 0–20 | −0.15% (−$18.40) | — |
| $1,000 | 3 / month | 0–20 | −2.11% (−$253.60) | — |
| $1,000 | 6 / month | 0–20 | −2.11% (−$253.60) | — |
| $1,000 | 12 / month | 0–20 | −2.11% (−$253.60) | 1–20 |
| $1,000 | 20 / month | 0–20 | 4.27% ($896.60) | 2–20 |
| $1,000 | spends wallet | 0–20 | −2.11% (−$253.60) | 1–20 |
| $1,000 | **4 walkthroughs + 1 bundle** | 0–20 | **5.48%** ($657.29) | — |
| $1,000 | **alternating** | 0–20 | **7.37%** ($884.90) | — |
| $1,000 | cash top-up | 0–20 | −1.27% (−$158.40) | — |
| $1,000 | accumulator | 0–20 | −2.11% (−$253.60) | — |
| $1,000 | refunds | 0–20 | −2.83% (−$339.31) | — |
| $1,000 | pause / resume | 0–20 | −2.31% (−$207.70) | — |

Under A, **even realistic mixed customers fail at the VIP tier**. Only the bundle-heavy and larger-package patterns pass.

**The 12-month view flatters customers who use little of their wallet** (up to 78% margins), because they have paid but not yet redeemed. The lifetime view corrects for this, and lifetime is the test used throughout.

---

## Phase 5 — Recommendation

### Minimum price (all six bonuses preserved, payout unchanged)

| Editing cost per walkthrough | Every tier passes at zero allowance | Every tier supports a meaningful allowance |
|---|---|---|
| $20 (current assumption) | $115 | **$118** |
| $25 | $123 | $126 |
| $30 | $132 | $135 |

A "meaningful" allowance lets a customer put every promotional dollar their tier earns onto standalone walkthroughs each month. At $116 the VIP tier holds only 1 such walkthrough a month, and at $117 only 2. From $118 every tier holds its full meaningful allowance.

### Recommended configuration: $120 walkthrough, $70 delivery, all bonuses unchanged

| Tier | **Allowance / month** | Promo-funded walkthroughs / yr | Worst-case lifetime | Walkthrough-only customer | Mixed customer |
|---|---|---|---|---|---|
| $50 | **0** (no promotional credits) | 0 | **$6,933.70 · 24.08%** | $177.50 · 29.58% | $2,841.40 · 27.06% |
| $100 | **1** | 0.5 | **$1,978.98 · 23.73%** | $323.60 · 26.97% | $2,731.64 · 26.17% |
| $200 | **1** | 2 | **$1,920.80 · 23.54%** | $580.80 · 24.20% | $2,673.46 · 26.06% |
| $350 | **1** | 5.25 | **$896.60 · 21.35%** | $896.60 · 21.35% | $2,579.47 · 26.13% |
| $500 | **1** | 10 | **$1,107.40 · 18.46%** | $1,107.40 · 18.46% | $2,586.10 · 27.81% |
| $1,000 VIP | **3** | 25 | **$1,424.97 · 11.87%** | $1,496.40 · 12.47% | $1,748.90 · 14.57% |

Dollar figures are lifetime contribution per customer-year at the recommended allowance. "Worst-case" is the weakest of the 14 patterns.

**Why these allowance numbers.** Each is the smallest count that lets a steady-state customer put **every** promotional dollar onto standalone walkthroughs, with each walkthrough fully covered by promotional credits. Every tier would also hold the target at **any** allowance up to 20, so you can publish higher numbers without margin risk. They would add nothing a customer could actually use, though, because the promotional balance runs out first.

### Why $120 rather than the $118 minimum

| | $118 | $120 |
|---|---|---|
| VIP worst-case margin | 10.63% ($1,275.46) | 11.87% ($1,424.97) |
| VIP headroom above 10% | **$75 / year** | **$225 / year** |
| Highest editing cost that still holds | $20.50 | $21.50 |
| Most VIP support sessions per year that still hold | 15 | 21 |

At $118, VIP headroom is $75 a year, and almost any cost movement would break it. For $2 more, $120 triples that headroom and is a cleaner price point.

### How the five criteria are met

1. **Bonus ladder preserved:** 0 / 5 / 10 / 15 / 20 / 25%, unchanged.
2. **Meaningful allowances maximised:** every tier with promotional credits gets an allowance large enough to use all of them, fully covered.
3. **Smallest price increase:** +$20, the commercially sensible point just above the $118 minimum. At $100 the upper three tiers cannot be made sustainable.
4. **Specialist pay and quality preserved:** the $50 payout, the editing budget and the deliverables are unchanged.
5. **At least 10% lifetime margin:** 0 of 1,764 stressed configurations fall below 10%.

---

## Conditions Before Any Enrollment (recommended; nothing has been done)

1. **Measure MLS editing cost first.** The VIP tier fails even at zero allowance if editing costs **$25** (8.46%), and it needs a **$126** price at $25 or **$135** at $30. Time the first 25 MLS edits using the existing editing time-tracking. Confirm the average comes in at **$21.50 or less** (about 56 minutes at $23/hour, before any employer payroll costs).
2. **Watch VIP enhanced-support use.** The tier holds up to **21 sessions per member per year** (44% of the 48-session entitlement). If members used the full entitlement, the VIP tier would fall to 5.56% under every option.
3. **The price change reaches beyond Auto-Fund.** A $120 MLS Walkthrough applies to every customer, not only Auto-Fund members. This is your decision.

---

## Changes Made in This Round

- **Added** the read-only analysis function `optimizeMlsUnitEconomics` and its simulator.
- **Corrected one certification statement.** It claimed all allowance-exhausted purchases carry 0% booking commission. In fact, a booking paid entirely by card is a standard marketplace booking and carries 15%. Behaviour is unchanged. The certification suite passes 22/22.
- **Not changed:** pricing, specialist compensation, editing budgets, the staged allowance configuration, the enrollment flag (still off), balances, and every historical record.