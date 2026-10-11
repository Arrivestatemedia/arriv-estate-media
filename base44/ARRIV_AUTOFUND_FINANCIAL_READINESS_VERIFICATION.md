# ARRIV ESTATE MEDIA — FINAL AUTO-FUND FINANCIAL READINESS VERIFICATION

**Date:** 2026-10-11
**Model:** `autofund_financial_readiness_v1_20261011` (`verifyAutoFundFinancialReadiness`, admin-only, read-only)
**Core:** the single certified simulation core (`base44/shared/autoFundSimulator.ts`) — the same core behind the unit-economics, simplified-policy and stress-test certifications, so these results are directly comparable with them.
**Status:** ANALYSIS ONLY. Enrollment stays disabled. Membership billing stays off. No customer is enrolled or charged. No pricing, bonus, fee, allowance, compensation, balance or production setting was changed.

---

## Verdict

### NO-GO at the live MLS Walkthrough price of $100. CONDITIONAL GO on the structure at $121.

Every tier in the owner's directive fails its own threshold at the live price, and two of them — Premier ($500) and VIP ($1,000) — are **loss-making on real customer patterns**, not merely below target. The failure is caused by the price, not by the MLS policy: the delivered cost of a Walkthrough is $75.70 (expected basis), while the bonuses give away 15–25% of the customer's Booking Value on top.

At the owner's **already-approved $120** price the program is viable for five of the six tiers, and every tier clears its threshold at **$121** (VIP 3.09% against its 3% floor). Nothing was activated.

| Tier | Threshold | Expected case | Conservative case | Verdict |
|---|---|---|---|---|
| $50 (retired) | 10% | 6.62% | 0.40% | **FAIL** |
| $100 (retired) | 10% | 6.95% | 0.71% | **FAIL** |
| $200 (retired) | 10% | 5.10% | −1.75% | **FAIL** |
| $350 Professional | 10% | 4.72% | −1.80% | **FAIL** |
| $500 Premier | 10% | −4.96% | −12.07% | **FAIL — loss-making** |
| $1,000 VIP | 3% (5% preferred) | −12.93% | −27.84% | **FAIL — loss-making** |
| $150 Starter (live entry tier) | 10% | 6.21% | −0.08% | **FAIL** |
| $250 Growth (live entry tier) | 10% | 3.50% | −2.99% | **FAIL** |

The $150 and $250 tiers are included because they are the tiers that would actually be enrolled; the owner's directive names the retired $50 / $100 / $200 amounts, which have zero live subscribers and are reported for completeness.

---

## 1. Basis of verification

| Input | Value used | Source |
|---|---|---|
| MLS Walkthrough price | **$100** (standard, ≤2,500 sqft) | `mlsPricing.ts`, pricing version V1 = the LIVE record |
| Owner-approved price | $120 — valued for comparison only, never activated | `MLS_PRICE_STANDARD_APPROVED` |
| Specialist payout | $50, contractual and unchanged | MLS guaranteed payout table |
| Membership fees | $25 on $350 / $500 / $1,000; $0 on $50 / $100 / $200 / $150 / $250 | `AUTOFUND_MEMBERSHIP_FEE`, taken as configured |
| Promotional bonuses | 0% / 5% / 10% / 15% / 20% / 25% — all preserved, none adjusted | `AUTO_FUND_AMOUNTS` + legacy terms |
| Funding commission | 15% first payment, 8% recurring | `prepaidEngine.ts` |
| Booking commission | 0% when any wallet value is applied; 15% on a fully direct-paid booking | verified in code |
| Payment processing | 2.9% + $0.30 per charge; none on a wallet redemption | verified in code |
| MLS policy under test | no standalone booking-count cap on $50–$500; VIP promotional allowance 7 per cycle | owner directive |
| Customer patterns | 17, including 1-, 3- and 4-month churn, refunds, pauses, cash top-ups, wallet accumulation and heavy standalone MLS | `OWNER_PERSONAS` |
| Full redemption | every outstanding cash-funded **and** promotional dollar is costed at close-out, on the lowest-margin service the tier may legally buy | `simulate()` lifetime basis |

**Two cost bases, reported separately and never averaged:**

| Basis | Editing labour | Payroll burden | QC | Delivered cost per Walkthrough |
|---|---|---|---|---|
| **Expected** (owner-approved planning assumption) | $18.00/hr × 60 active min = $18.00 | 15% ($2.70) | $5.00 | **$75.70** |
| **Conservative** (measured editor wage) | $23.00/hr × 52 active min = $19.93 | 20% ($3.99) | $8.00 | **$81.92** |

---

## 2. Required tier table — worst case, expected cost basis

Worst case = the lowest lifetime contribution of the 17 patterns. "Fulfilment and operating cost" is that scenario's complete cost ledger, including the full close-out of every outstanding balance.

| Tier | Monthly funding | Promotional BV / month | Contractual fee | Total recurring charge | Annual collected revenue | Annual promo BV issued | Full-redemption fulfilment + operating cost | Worst-case contribution | Worst-case % | Threshold | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| $50 | $50 | $0 | $0 | $50 | $600 | $0 | $22,411.10 | +$1,588.90 | 6.62% | 10% | **FAIL** |
| $100 | $100 | $5.00 | $0 | $100 | $1,200 | $60 | $22,277.26 | +$1,662.74 | 6.95% | 10% | **FAIL** |
| $200 | $200 | $20.00 | $0 | $200 | $2,400 | $240 | $2,277.68 | +$122.32 | 5.10% | 10% | **FAIL** |
| $350 | $350 | $52.50 | $25 | $375 | $4,500 | $630 | $545.50 | +$27.00 | 4.72% | 10% | **FAIL** |
| $500 | $500 | $100.00 | $25 | $525 | $6,300 | $1,200 | $551.03 | −$26.03 | −4.96% | 10% | **FAIL** |
| $1,000 VIP | $1,000 | $250.00 | $25 | $1,025 | $12,300 | $3,000 | $1,157.58 | −$132.58 | −12.93% | 3% | **FAIL** |
| $150 Starter | $150 | $7.50 | $0 | $150 | $1,800 | $90 | $555.68 | +$36.82 | 6.21% | 10% | **FAIL** |
| $250 Growth | $250 | $25.00 | $0 | $250 | $3,000 | $300 | $554.87 | +$20.13 | 3.50% | 10% | **FAIL** |

Two notes on reading this table:

- The $50 and $100 rows are driven by the 20-walkthroughs-a-month pattern, where the customer pays almost everything **directly** and the tier's funding is a rounding error. That is retail marketplace throughput, not membership economics. It is reported because heavy standalone MLS usage is a required scenario, but it is not a subsidy created by the tier.
- For $350 / $500 / VIP the worst case is the one-month churn pattern. Section 3 gives the no-churn view, and the conclusion is unchanged.

### Realized cash contribution vs outstanding obligation vs fully redeemed lifetime

This is the split the owner asked for. The $200 tier shows exactly the trap: it looks like a **50.52%** winner after twelve months, and is a **5.10%** business once its accumulated balance is redeemed.

| Tier | Worst-case pattern | Cash in | Realized 12-month margin | Outstanding promotional | Outstanding cash-funded | Cost to close out | All obligations redeemed |
|---|---|---|---|---|---|---|---|
| $50 | 20 / month | $24,000 | 6.62% | $0 | $0 | $0 | 6.62% ($1,588.90) |
| $100 | 20 / month | $23,940 | 6.95% | $0 | $0 | $0 | 6.95% ($1,662.74) |
| $200 | 1 / month | $2,400 | **50.52%** | $0 | $1,440 | $1,090.08 | **5.10%** ($122.32) |
| $350 | churn after 1 month | $572.50 | 4.72% | $0 | $0 | $0 | 4.72% ($27.00) |
| $500 | churn after 1 month | $525 | −4.96% | $0 | $0 | $0 | −4.96% (−$26.03) |
| $1,000 VIP | churn after 1 month | $1,025 | **35.07%** | $0 | $650 | $492.05 | **−12.93%** (−$132.58) |
| $150 | churn after 1 month | $592.50 | 6.21% | $0 | $0 | $0 | 6.21% ($36.82) |
| $250 | churn after 1 month | $575 | 3.50% | $0 | $0 | $0 | 3.50% ($20.13) |

Unused promotional value is **never** counted as profit anywhere in this model. In the one variant where promotional value cannot reach a standalone Walkthrough (VIP under the currently configured rule), the model leaves $3,000 outstanding at year end and charges the full cost of delivering it.

---

## 3. Expected case and conservative case, reported separately

### 3a. Conservative cost sensitivity (expected support utilisation held constant)

Raising editing labour to the measured $23.00/hr basis, loading a 20% employer burden and $8.00 of QC — **$6.22 more per Walkthrough** — moves every tier below its threshold:

| Tier | Expected basis | Conservative basis | Movement | Worst-case contribution (conservative) |
|---|---|---|---|---|
| $50 | 6.62% | 0.40% | −6.22 pts | +$96.10 |
| $100 | 6.95% | 0.71% | −6.24 pts | +$169.94 |
| $200 | 5.10% | **−1.75%** | −6.85 pts | −$41.89 |
| $350 | 4.72% | **−1.80%** | −6.52 pts | −$10.32 |
| $500 | −4.96% | **−12.07%** | −7.11 pts | −$63.35 |
| $1,000 VIP | −12.93% | **−20.52%** | −7.59 pts | −$210.33 |
| $150 | 6.21% | **−0.08%** | −6.29 pts | −$0.50 |
| $250 | 3.50% | **−2.99%** | −6.49 pts | −$17.19 |

**This single unmeasured number decides the outcome.** The $350 tier is 12.79% at the lighter cost basis and 4.72% at the expected one — it straddles the line entirely on editing cost. Nothing else in the model moves a result this far.

### 3b. VIP at expected and maximum contractual support utilisation

Support cost accrues pro-rata to active months, so it is reported both across all patterns and across the patterns that actually stay subscribed for twelve months.

| Enhanced-support sessions | Share of the 48-session entitlement | Annual support cost per member | Worst 12-month pattern | Worst 12-month margin | Worst 12-month contribution | Worst across all patterns (incl. churn) |
|---|---|---|---|---|---|---|
| 12 (expected) | 25% | $372.00 | refunds | **−7.57%** | −$931.04 | −12.93% |
| 24 | 50% | $672.00 | refunds | **−10.01%** | −$1,231.04 | −15.37% |
| 48 (maximum contractual) | 100% | $1,272.00 | refunds | **−14.89%** | −$1,831.04 | −20.25% |

Full entitlement utilisation costs **7.32 margin points** against the expected 12 sessions. Even at the expected utilisation the VIP tier is already negative, so support utilisation is not the cause of the failure — it deepens it.

### 3c. Full-year (no-churn) view

The weakest pattern that stays subscribed for the full twelve months. This is the fairest read of a normal member, and it does not rescue any tier.

| Tier | Worst full-year pattern | Full-year margin | Full-year contribution | Threshold | Result |
|---|---|---|---|---|---|
| $50 | 20 walkthroughs / month | 6.62% | +$1,588.90 | 10% | **FAIL** |
| $100 | 20 walkthroughs / month | 6.95% | +$1,662.74 | 10% | **FAIL** |
| $200 | 1 walkthrough / month | 5.10% | +$122.32 | 10% | **FAIL** |
| $350 | 1 walkthrough / month | 6.08% | +$273.49 | 10% | **FAIL** |
| $500 | refunds | **0.31%** | +$19.83 | 10% | **FAIL** |
| $1,000 VIP | refunds | **−7.57%** | −$931.04 | 3% | **FAIL** |
| $150 | 20 walkthroughs / month | 6.62% | +$1,582.11 | 10% | **FAIL** |
| $250 | 1 walkthrough / month | 5.13% | +$153.80 | 10% | **FAIL** |

### 3d. Chargebacks

Overlay rule: the disputed monthly funding cash is reversed, the Booking Value it created is voided pro-rata against the remaining balance, a $15 dispute fee is charged, and delivery already performed is retained. A chargeback can never exceed the number of charges actually made. Chargeback frequency is not measured anywhere in the app — this is an assumption.

Applied to the worst twelve-month-active pattern:

| Tier | 2 chargebacks / year | 4 chargebacks / year |
|---|---|---|
| $50 | 6.10% (+$1,458.90) | 5.58% (+$1,328.90) |
| $100 | 6.04% (+$1,432.74) | 5.11% (+$1,202.74) |
| $200 | **−3.38%** (−$67.68) | **−16.10%** (−$257.68) |
| $350 | 3.91% (+$148.49) | 0.76% (+$23.49) |
| $500 | **−18.43%** (−$976.84) | **−45.90%** (−$1,973.50) |
| $1,000 VIP | **−15.80%** (−$1,627.71) | **−28.00%** (−$2,324.37) |
| $150 | 5.30% (+$1,252.11) | 3.96% (+$922.11) |
| $250 | **−1.05%** (−$26.20) | **−10.31%** (−$206.20) |

Two chargebacks a year cost the VIP tier $1,627.71 and the Premier tier $976.84. For a tier already at or below break-even, chargebacks are the difference between a thin margin and a real loss.

---

## 4. Scenarios that produce an actual contribution loss

**63 of the tested combinations lose money.** Loss-making patterns by tier:

| Tier | Expected basis | Conservative basis |
|---|---|---|
| $50 | 0 | 0 |
| $100 | 0 | 0 |
| $200 | 0 | 3 |
| $350 | 0 | 4 |
| $500 | **2** | **13** |
| $1,000 VIP | **13** | **15** |
| $150 | 0 | 1 |
| $250 | 0 | 12 |

The largest single losses at the conservative basis:

| Tier | Pattern | Contribution | Margin |
|---|---|---|---|
| $1,000 VIP | 1 walkthrough / month | −$2,655.34 | −21.59% |
| $1,000 VIP | 3 / 6 / 12 walkthroughs per month | −$2,653.90 | −21.58% |
| $1,000 VIP | 20 walkthroughs / month | −$2,576.50 | −12.10% |
| $500 | spends the entire wallet on walkthroughs | −$452.90 | −0.64% |
| $500 | 2 refunds a year | −$440.80 | −7.00% |
| $350 | 1 / 3 walkthroughs per month, or spending the entire wallet | −$26.94 | −0.60% |

At the expected basis the loss-making patterns are confined to the two upper tiers: Premier loses on the one-month and three-month churn patterns (−$26.03 and −$8.07), and VIP loses on **13 of 17 patterns**, worst case refunds at −$931.04.

---

## 5. Independent confirmation: does the VIP 7-per-cycle allowance mask redemption liability?

**It does not. The allowance is non-binding, and it is not a remedy.**

| Measure | Value |
|---|---|
| VIP promotional Booking Value issued per year | $3,000 |
| Standalone Walkthroughs that $3,000 funds per year at $100 | 30 |
| Walkthroughs the 7-per-cycle cap permits per year | 84 |
| Is the cap reached before the pool is exhausted? | **No — the cap is never the binding constraint** |
| Worst-case margin, owner-stated 7 per cycle | −12.93% (−$132.58) |
| Worst-case margin, no cap at all | −12.93% (−$132.58) |
| Worst-case margin, currently configured bar on VIP promotional value | −10.32% (−$105.83) |
| Spread across the three variants | 2.61 points |

Measured on the wallet-matched pattern: under the owner-stated policy the full $3,000 of promotional value is spent on standalone Walkthroughs, and under the currently configured bar the same $3,000 sits outstanding at year end and is **charged in full at close-out**. Either way the obligation is costed — the model never treats unredeemed promotional value as profit.

**Conclusion.** The cap masks nothing and protects nothing, because the promotional pool is exhausted long before the cap is reached. Its only economic effect is to route promotional credit between services. Permitting the 7-per-cycle allowance makes the VIP tier **2.61 points worse** than the rule configured today, so the allowance cannot be presented as a safeguard.

---

## 6. Unresolved financial assumptions

1. **No MLS Walkthrough has ever been produced.** Editing minutes, and therefore the editing cost per Walkthrough, has never been observed. Both cost bases are assumptions; this single number swings results by roughly 6–7 margin points.
2. **The employer payroll burden percentage and the quality-control expense per Walkthrough are not configured anywhere in the app.** `packageEditingConfig.ts` defines editing task types and a QC scheduling buffer, but no editing minutes and no hourly cost per task type.
3. **The membership fee is scheduled at $25 but billing is switched off**, so the currently chargeable fee is $0. Leaving billing off costs the affected tiers 2.73 to 3.84 margin points: $350 falls from 4.72% to 1.38%, $500 from −4.96% to −8.80%, VIP from −12.93% to −15.66%.
4. **VIP enhanced-support utilisation is unmeasured.** 12 sessions per member per year is assumed against a 48-session contractual entitlement.
5. **Chargeback frequency is unmeasured.** 2 and 4 per member per year are modelled, with a $15 dispute fee that is not a configured rate.
6. **The live MLS price is $100.** The owner-approved $120 is not live. Every primary result uses $100 as instructed.
7. **The $50 / $100 / $200 tiers are retired with zero live subscribers.** They are verified because the directive names them.
8. **Funding commission is modelled at 15% / 8% for every subscription.** A self-service enrollment with no verified advisor attribution generates no commission, which would improve every result shown.
9. **Commission and processing treatment on a chargeback is not modelled** (whether the advisor commission is clawed back). The overlay assumes it is not.
10. **No MLS walkthrough has been booked, edited or paid out in production**, so none of the delivery-cost figures has been reconciled against an actual job.

---

## 7. Smallest practical corrective action

Evidence only. **No price, fee, bonus, or restriction was changed.**

### 7a. The minimum live-price change that satisfies each threshold

| Tier | Margin at $100 | Lowest MLS price that meets the threshold | Margin there | Increase required |
|---|---|---|---|---|
| $50 | 6.62% | $105 | 10.25% | +$5 |
| $100 | 6.95% | $107 | 10.51% | +$7 |
| $200 | 5.10% | $107 | 10.54% | +$7 |
| $350 | 4.72% | $110 | 10.59% | +$10 |
| $500 | −4.96% | $116 | 10.77% | +$16 |
| $1,000 VIP | −12.93% | $121 | 3.09% | +$21 |

**All six tiers meet their own threshold at $121** — one dollar above the price the owner already approved and has not activated.

At the approved **$120**, five of the six tiers clear their threshold comfortably ($50 19.33%, $100 18.60%, $200 17.39%, $350 17.65%, $500 11.19%, and the live entry tiers $150 19.49% and $250 18.37%), and VIP reaches **2.45%** — positive, but short of the 3% floor.

A price change reaches every retail MLS customer, not only Auto-Fund members. That is the owner's decision and is not made here.

### 7b. The alternative lever, if retail pricing must stay at $100

Arithmetic from the measured fee sensitivity: the $25 VIP membership fee is worth 2.73 points, i.e. $300 a year. Closing the remaining ~0.55 points at $120 would need roughly **+$6 per month on the VIP fee** (about +$70 a year). That changes a contractual fee and a disclosed term, would require re-issued disclosures, and is the owner's decision.

### 7c. What will NOT work

- **Reinstating a booking-count cap on VIP** — non-binding, 2.61 points the wrong way, demonstrated in section 5.
- **Cutting VIP support cost** — even eliminating the retainer and all support sessions would not close a $931 shortfall on the worst full-year pattern.
- **Leaving membership billing off** — costs 2.73 to 3.84 points.
- **Raising a bonus, allowance, or benefit as compensation for the price** — the bonuses are the cost driver, not the remedy.

---

## 8. Reconciliation with previously published figures

This verification is stricter than earlier rounds in four stated ways, which explains every difference:

| Difference | Earlier certification | This verification |
|---|---|---|
| Payroll burden and QC | R0 baseline carried neither | Expected basis loads both; conservative basis loads more |
| Churn patterns | 14 patterns, no churn | 17 patterns, including 1-, 3- and 4-month churn |
| VIP promotional policy | barred or unspecified | owner-stated 7-per-cycle allowance modelled explicitly, and compared against the configured bar |
| Thresholds | single 10% target, VIP positive-contribution exception | 10% on five tiers, 3% (5% preferred) on VIP |

At the **live $100 price** the independently written stress harness (`runAutoFundStressTest`, V1, editing $18, no burden, no QC, VIP promotional credit barred) reports $150 14.01%, $250 11.53%, $350 12.79%, $500 **3.84%**, VIP **−1.84%** — the same tiers fail, and the previously published unit-economics analysis at $100 ($70 delivery, no churn arms) reported $350 9.89%, $500 7.07%, VIP 0.58%. **All three independent models fail $500 and the VIP tier at the live price even under the most favourable cost basis available.** The $150 / $250 / $350 tiers pass at the lighter basis and fail at the expected one, which is why the editing-cost measurement is the decisive outstanding item.

Integrity check across every run: **zero prohibited promotional redemptions**, cash-funded and promotional pools held separately throughout.

---

## 9. Conditions attached to any go decision

1. **Measure the real MLS editing cost first.** Time the first 25 walkthrough edits using the editing time-tracking that already exists. If editing plus QC lands at or below the expected basis, the tier outcomes at $120 or $121 are confirmed; if it lands at the conservative basis, no tier passes and the price question becomes larger.
2. **Decide the MLS Walkthrough retail price.** The five standard tiers are viable at $110–$116; VIP needs $121.
3. **Decide whether the VIP tier may use promotional value on a standalone Walkthrough at all.** Barring it is worth 2.61 points and is already the configured rule; permitting 7 per cycle is worse and protects nothing.
4. **Decide the membership-billing question before enrollment**, since launching with billing off costs 2.73 to 3.84 points on the tiers that carry a fee.
5. **Accept or resolve the VIP floor.** At $120 the VIP tier is positive but below the 3% floor; it needs $121 or a fee change.
6. **Leave the $50 / $100 / $200 tiers closed to new enrollment**, as configured.

---

## 10. Statement of what was and was not done

- **Not changed:** the MLS Walkthrough price, the pricing version, specialist compensation, editing budgets, all six promotional bonuses, the MLS allowance configuration, the VIP restriction flag, the membership fee schedule, the enrollment flag, membership billing, any wallet, lot, ledger, balance or historical record.
- **Added:** one read-only, admin-only analysis function (`verifyAutoFundFinancialReadiness`). It writes nothing and activates nothing.
- **Enrollment remains disabled. No customer was enrolled. No customer was charged.**

Analysis only. Final launch authorization remains with the owner.