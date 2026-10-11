# ARRIV_AUTOFUND_FINAL_MEMBERSHIP_CERTIFICATION.md

**Date:** 2026-10-11
**Model:** `mls_unit_economics_v3_20261011` → phase 7 (`optimizeMlsUnitEconomics`, admin-only, read-only)
**Scope:** one consolidated certification of the approved final structure. No further redesign.
**Status:** ANALYSIS ONLY. Staging only. Enrollment disabled. Production price, pricing, compensation, and every live ledger unchanged.

---

## F. FINAL VERDICT — read this first

| MLS price tested | Result | Failing tiers |
|---|---|---|
| **$100** (currently live) | **FAIL** | **All six tiers** |
| **$120** (proposed) | **FAIL** | **$1,000 VIP only** — five tiers pass |

**The live $100 price cannot support the approved program.** At $100 every tier falls short of the 10% target, and $500 and VIP are loss-making outright (−2.59% and −7.20%). The $120 price is therefore required, not optional.

**At $120 only the VIP tier fails, at 5.48% against the 10% target. The exact shortfall is $185.30 per VIP member-year** on the worst pattern.

**The single smallest financially sufficient adjustment: raise the VIP membership fee from $25 to $79 per month** (+$54/month, +$648/year per VIP member). Nothing else changes — no deposit amount, no bonus percentage, no specialist payout, no public service price other than the $100 → $120 MLS change that is already required.

> **Note on the $79 figure.** This is not an additional second fee stacked on the VIP tier. It is the single membership fee the owner approved, raised. The prohibited construct — a separate $79 VIP fee on top of the $25 — is not proposed anywhere.

### Levers tested and rejected

| Lever | Result |
|---|---|
| Raise the MLS price above $120 | **Proven ineffective.** At every price from $130 to $250 the VIP tier sits at 8.20% and never improves, because the binding VIP customer buys no MLS walkthroughs at all. |
| Reduce editing + quality-control cost | Insufficient. Trimming $7 per walkthrough recovers $168 against a $185.30 shortfall. |
| Reduce the VIP promotional bonus | **Prohibited** by the approved structure and not modelled. |

---

## A. Final configuration

### Tiers

| Deposit | Membership fee | Promotional bonus | Total Booking Value | Recurring monthly charge | Promo usable on standalone MLS |
|---|---|---|---|---|---|
| $50 | $0 | $0 (0%) | $50 | $50 | Yes |
| $100 | $0 | $5 (5%) | $105 | $100 | Yes |
| $200 | $0 | $20 (10%) | $220 | $200 | Yes |
| $350 | $25 | $52.50 (15%) | $402.50 | $375 | Yes |
| $500 | $25 | $100 (20%) | $600 | $525 | Yes |
| $1,000 VIP | $25 | $250 (25%) | $1,250 | $1,025 | **No** |

### Redemption rules

- **No standalone MLS booking-count allowance at any tier.** Customers buy as many walkthroughs as they wish with cash-funded Booking Value, cash top-ups, or direct payment.
- **$50–$500:** promotional credit is usable on eligible services including standalone MLS Walkthroughs, subject to the available balance, with no dollar cap and no required cash split.
- **$1,000 VIP:** promotional credit is usable on eligible photography, video, premium packages, and qualifying genuine bundles. It may **not** pay for a standalone MLS Walkthrough. VIP **cash-funded** credit remains fully usable there.
- **Qualifying-bundle guard:** promotional credit is applied only up to the retail value of the eligible non-MLS services actually present in the cart. A token add-on therefore unlocks only its own retail value and cannot be used to bypass the restriction.
- Promotional credit rolls over and is never confiscated, expired, or reduced.
- The membership fee is collected revenue: not spendable, not promotional, never a wallet liability, and separately identifiable in billing, reconciliation, refunds, and reporting.
- Preserved unchanged: all six deposits, all six bonuses, the $50 MLS specialist payout, existing provider compensation rules, 15% first-funding and 8% recurring commissions, zero booking commission on wallet redemptions, commission reversal protections, and all ledger, audit, and replay protection.

---

## B. Financial results

Full realism basis: 15% employer payroll burden, $5 QC per walkthrough, and provider payouts on the authoritative **ordered waterfall** — the sales person is paid out of the package **first**, and the partner then takes **40% of what remains**, exactly as `mediaCompensationEngine` computes it (`post_sales_value = CSV − sales_commission`, `payout = post_sales_value × 0.40`). A wallet-funded booking carries zero booking commission, so its post-sales value is the full package and the partner receives **40% of the package**. A standard marketplace booking pays the 15% commission first, so the partner receives **34% of retail**. Plus Stripe 2.9% + $0.30, churn, refunds, rollover, and full eventual redemption of every balance. Fifteen customer patterns per tier. Promotional credit is always closed out at the **lowest-margin service the customer is permitted to buy**.

### MLS Walkthrough waterfall (the one package with its own economics)

The MLS Walkthrough does **not** follow the 40%-after-sales rule. The specialist is paid a **flat $50** from the guaranteed payout table (`MLS_GUARANTEED_PAYOUT`, ≤2,500 sqft), whatever the price and however the booking is paid for. The 40%-of-remainder rule applies only to non-MLS packages. In a bundle, the MLS portion pays the flat $50 and the non-MLS portion pays 40% of its own value.

| Per walkthrough, $100 price | Standard booking | Auto-Fund wallet booking |
|---|---|---|
| Media Specialist (flat) | $50.00 | $50.00 |
| Sales Growth Advisor (booking commission) | $15.00 | $0.00 — paid at funding instead (15% first, 8% recurring) |
| Editing (estimated) | $20.00 | $20.00 |
| **Arriv remaining, before overhead** | **$15.00** | **$30.00** |
| Less payroll burden on editing (15%) | −$3.00 | −$3.00 |
| Less quality control | −$5.00 | −$5.00 |
| **Arriv remaining, full realism** | **$7.00** | **$22.00** |

At **$120** the specialist payout and editing stay the same, so the full extra $20 goes to Arriv: **$42.00** per Auto-Fund walkthrough under full realism.

That per-walkthrough figure is **not** the program's profit. Each walkthrough paid from the wallet has to cover its share of the promotional bonus (delivered with no cash behind it), the funding commission, Stripe on the funding charge, VIP support, and churn. Those program-level costs are why the tier results below differ from the per-walkthrough line.

### At the proposed $120 price — full realism

| Tier | Fee | Worst pattern | Worst lifetime margin | Cash in | Shortfall vs 10% | Verdict |
|---|---|---|---|---|---|---|
| $50 | $0 | 20 walkthroughs / month | **17.41%** | $28,800 | — | PASS |
| $100 | $0 | refunds | **16.82%** | $8,340 | — | PASS |
| $200 | $0 | refunds | **16.48%** | $8,160 | — | PASS |
| $350 | $25 | 20 walkthroughs / month | **17.45%** | $28,470 | — | PASS |
| $500 | $25 | refunds | **13.09%** | $7,500 | — | PASS |
| $1,000 VIP | $25 | churn after 4 months | **5.48%** | $4,100 | **$185.30** | **FAIL** |

Service cost ratios at $120: standalone MLS 65%, MLS+essentials bundle 62%, essentials 61%, cinematic video 64%.

### At the live $100 price — full realism

| Tier | Fee | Worst pattern | Worst lifetime margin | Verdict |
|---|---|---|---|---|
| $50 | $0 | 20 walkthroughs / month | 4.32% | FAIL |
| $100 | $0 | 20 walkthroughs / month | 4.64% | FAIL |
| $200 | $0 | 1 walkthrough / month | 2.57% | FAIL |
| $350 | $25 | 1 walkthrough / month | 3.61% | FAIL |
| $500 | $25 | churn after 4 months | **−2.59%** | FAIL |
| $1,000 VIP | $25 | churn after 4 months | **−7.20%** | FAIL |

At $100 a standalone walkthrough costs $78 against a $100 price — a 78% cost ratio, against a non-MLS menu of 61–65%. The program cannot be made to work at that price at any allowance or fee setting.

### Conservative basis at $120 (20% burden, $8 QC)

$50 14.08% · $100 13.37% · $200 12.95% · $350 13.98% — all **PASS**. $500 **9.25% FAIL**. VIP **1.98% FAIL**.

---

## C. Membership economics

The $25 fee, after the incremental costs of collecting it and delivering what it pays for:

| Tier | Fee/month | Less payment processing | Less incremental benefit cost | **Net contribution** | Net/year |
|---|---|---|---|---|---|
| $350 | $25.00 | −$1.03 | −$6.00 | **$17.97** | **$215.64** |
| $500 | $25.00 | −$1.03 | −$6.00 | **$17.97** | **$215.64** |
| $1,000 VIP | $25.00 | −$1.03 | −$0.00 | **$23.97** | **$287.64** |

- **Processing** is the Stripe charge on a separately identified fee line: 2.9% + $0.30 = $1.025 per month, $12.30 per year.
- **Incremental benefit cost** for $350 and $500 is priority Arriv Assist support and priority booking handling at $6 per month — the same basis the model already uses for VIP enhanced support.
- **VIP** carries no additional benefit cost line because VIP support ($72 retainer + $300 of sessions = $372 per year) is already costed inside the VIP tier ledger. The **$287.64** of net fee revenue funds **77%** of that program.
- The fee is modelled as collected revenue, never as a reduction in wallet liability, and never as spendable Booking Value.

---

## D. VIP certification — does restricting promotional credit solve the gap?

| Measure | At $100 | At $120 |
|---|---|---|
| Prior structure (no restriction, no fee) | −13.28% | 2.97% |
| Membership fee only, no restriction | −10.62% | 5.24% |
| **Final structure (restriction + fee)** | **−7.20%** | **5.48%** |
| **Value of the promotional restriction alone** | **+3.42 points** | **+0.24 points** |
| Total improvement vs the prior structure | +6.08 points | +2.51 points |

**No — the restriction does not solve the VIP gap.** It is worth only **+0.24 percentage points at the $120 price**.

**Why.** The restriction moves VIP promotional credit from a standalone MLS Walkthrough (65% cost ratio at $120) to the eligible menu — essentials 61%, cinematic video 64%. That saves roughly one cent per dollar of promotional credit. At $100 the restriction is worth far more (+3.42 points) because a standalone walkthrough then costs 78%, which is worse than every eligible service. So the restriction matters most at the price the program cannot use, and barely at the price it can.

**The VIP tier fails structurally, not on an edge case.** At $120, **13 of the 15 customer patterns fail**, ranging from 5.48% (churn) to 9.32% (bundle-heavy). Even the most favourable pattern modelled is below target. The cause is the 25% bonus itself: $3,000 a year granted per VIP member, delivered at roughly 64% of its face value, against a cash-funded side that yields about 35% — while the tier also carries 8% recurring commission, Stripe, VIP support, and, for any member who does not redeem their full balance within the year, a close-out on the remainder.

**Rejected alternative: raising the MLS price.** At every price from $130 to $250 the VIP tier remains frozen at **8.20%**, because the binding VIP customer (`larger_packages`: one Essentials plus one Cinematic per month) buys **no MLS walkthroughs at all**. No MLS price can fix a tier whose failing customer never buys an MLS walkthrough.

---

## E. Implementation results

All changes are staging-only. **Every feature flag is disabled**, so production behaviour is unchanged and no fee is charged.

### Created

| Artifact | Purpose |
|---|---|
| `base44/shared/autoFundFinalConfig.ts` | The approved structure: three disabled flags (`enrollment_enabled`, `membership_fee_enabled`, `vip_mls_promo_restriction_enabled`), the fee schedule, the membership-fee accessor that returns **zero while the flag is off**, total recurring charge, the VIP MLS restriction test, the eligible-service list, the **qualifying-bundle guard** (`vipPromoCreditCap`), and the pre-enrollment disclosure builder. |
| `base44/functions/optimizeMlsUnitEconomics/finalCertification.ts` | The consolidated certification: both prices × two realism bases × six tiers × fifteen patterns, membership economics, the VIP restriction test, and the remedy search. |

### Changed

| Artifact | Change |
|---|---|
| `base44/functions/optimizeMlsUnitEconomics/simulator.ts` | Added membership-fee revenue and processing, membership benefit cost, the VIP promotional restriction with its eligible-portion cap, a promotional close-out ratio override, and a churn pattern. **Corrected the payout waterfall:** the partner rate is now the authoritative **0.40 of post-sales value**, applied *after* sales compensation, so the 34% paid on a commissioned booking is **derived** from the ordering rather than hardcoded, and a wallet-funded booking correctly pays 40% of the package. |
| `base44/functions/optimizeMlsUnitEconomics/entry.ts` | Wired the certification in as phase 7. |

### Tests

| Test | Result |
|---|---|
| `testAutoFundMlsAllowance` (22-part certification) | **22/22 PASS**, no cleanup errors |
| Payout waterfall against `mediaCompensationEngine` | **Exact match** — `post_sales_value = CSV − sales_commission`, then `payout = post_sales_value × 0.40`. Sales compensation first, 40% of the remainder second. |
| Backward compatibility of the simulator | **Verified** — all new parameters default to prior behaviour; the live analysis endpoints reproduce their earlier figures exactly |
| Certification coverage | 6 tiers × 15 patterns × 2 prices × 2 realism bases, plus 4 remedy searches |

### Unresolved issues

1. **MLS editing time has never been measured.** No MLS Walkthrough has ever been created, edited, or paid out in production — zero editing tasks, zero compensation snapshots, zero jobs. The $20 editing figure is still an assumption, and it is the largest single unknown. At the assumed $28 of editing plus QC per walkthrough the conclusions above hold; if the true figure is materially lower, the VIP shortfall narrows.
2. **Premium bundle editing time is not configured** anywhere in the app. It is excluded from the eligible-service close-out ratio, which uses the cinematic video ratio as the conservative bound.
3. **Enrollment remains disabled** and no membership fee is charged, pending explicit owner authorization.

---

## Remedy detail

Searched at each price: the smallest single adjustment that brings **every** tier to the target.

| Adjustment | At $100 | At $120 |
|---|---|---|
| VIP membership fee only | No fee works | **$79/month** (+$54) |
| All three fee-bearing tiers raised | No fee works | $79/month (+$54) |
| MLS price | No price up to $250 works | No price up to $250 works |

At $100 no fee adjustment can succeed, because the failing tiers include the three entry tiers, which carry no fee at all. The price must move to $120 first.

**Assumption sensitivity:** if the churn pattern is excluded, the required VIP fee is **$73/month** (+$48) rather than $79. Churn is included because the approved instruction requires it, and because a VIP member who funds four months and then redeems their entire balance — including the 25% bonus granted each month with no vesting — is a real exposure the program carries.

---

## Requirements met

- One consolidated certification, realistic operating costs, both approved prices.
- Membership fee modelled as collected revenue, separately identified, with its processing and benefit costs shown explicitly.
- No standalone MLS booking-count allowance at any tier.
- VIP promotional credit barred from standalone MLS; VIP cash-funded credit fully usable there; qualifying bundles validated by service composition and contribution margin.
- All six deposits, all six bonuses, the $50 MLS payout, provider compensation rules, and every commission rule preserved unchanged.
- Churn, refunds, chargebacks, rollover, unused balances, and full eventual redemption all modelled.
- The lowest-margin permitted service used for every promotional close-out.
- Production unchanged, enrollment disabled, no fee collected.