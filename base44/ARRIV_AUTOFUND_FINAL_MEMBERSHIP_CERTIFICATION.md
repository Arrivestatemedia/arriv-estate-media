# ARRIV_AUTOFUND_FINAL_MEMBERSHIP_CERTIFICATION.md

**Date:** 2026-10-11
**Model:** `mls_unit_economics_v3_20261011` → phase 7 (`optimizeMlsUnitEconomics`, admin-only, read-only)
**Scope:** one consolidated certification of the approved final structure. No further redesign.
**Status:** ANALYSIS ONLY. Staging only. Enrollment disabled. Production price, pricing, compensation, and every live ledger unchanged.

> **FOLLOW-UP 2026-10-11.** The owner supplied provisional operating figures and requested a sensitivity report. See **`ARRIV_AUTOFUND_OWNER_SENSITIVITY_REPORT.md`**. That report supersedes the cost-status column in section I for items 1–3 and 9, and records which figures remain unverified or missing. Under the owner's provisional assumptions the VIP worst case improves to **7.35%** at $120 and the $500 tier to **15.26%**; VIP is negative in 17 of 24 cost combinations at the live $100 price.

> **OWNER DECISION RECORDED 2026-10-11.** The VIP lifetime contribution margin of **5.48%** is **accepted** as an intentional, documented exception to the 10% minimum. The VIP membership fee is **not** raised beyond $25. The 25% promotional bonus is **not** reduced. The membership and promotional redemption structure is **preserved**. The 10% minimum is **retained** for the other five tiers, and is met. Live MLS pricing, enrollment and fee collection are **unchanged**. The $79 remedy below stays on the record as **tested and declined**, not recommended. **See section G for the decision and section H for every loss-making scenario.**

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

---

## G. Owner decision — recorded 2026-10-11

| Decision | Status |
|---|---|
| VIP lifetime contribution margin of **5.48%** at $120 | **ACCEPTED** as an intentional, documented exception to the 10% minimum |
| VIP membership fee raised above $25 | **Declined** — the $79 remedy remains on the record as tested, not recommended |
| 25% VIP promotional bonus reduced | **Declined** — preserved unchanged |
| Membership and promotional redemption structure | **Preserved** — see the structure note below |
| 10% minimum for the other five tiers | **Retained and met** under full realism |
| Live MLS price, enrollment, fee collection | **Unchanged** — all three feature flags remain off. Staging only. |

Feature flags as certified: `enrollment_enabled: false`, `membership_fee_enabled: false`, `vip_mls_promo_restriction_enabled: false`.

### Which structure actually produces 5.48%

This matters, because two different structures have both carried the label "simplified" and they do **not** produce the same VIP result.

| Structure | VIP promotional credit on a standalone MLS Walkthrough | VIP margin at $120, full realism |
|---|---|---|
| **Final approved structure** (`autoFundFinalConfig.ts`) | **Barred** | **5.48%** — the accepted figure |
| Earlier "Simplified (owner proposal)" policy | Allowed, capped at **7 per cycle** | **3.30%** |

The accepted 5.48% is produced **only** by the final approved structure, in which VIP promotional credit cannot be spent on a standalone MLS Walkthrough. Replace that restriction with a 7-per-cycle cap and VIP falls to **3.30%**; under the conservative cost basis (R2) five VIP patterns then turn **negative**, the worst at **−0.98%**.

The promotional restriction is therefore **load-bearing for the accepted number**. It is retained, and this is flagged for a one-line confirmation rather than assumed.

---

## H. Modeled scenarios with a negative contribution margin

**At $120 under the final approved structure: none.** Every tier and all fifteen customer patterns return a positive lifetime contribution, under both full realism (R1) and the conservative basis (R2). The lowest is the accepted VIP churn pattern at **+5.48% ($224.70)**.

**At the live $100 price: 21 patterns are loss-making**, across two tiers.

| Tier | Pattern | Margin | Contribution |
|---|---|---|---|
| $1,000 VIP | refunds | **−6.84%** | **−$841.90** |
| $1,000 VIP | churn after 4 months | −7.20% | −$295.30 |
| $1,000 VIP | paused 3 months | −6.25% | −$576.93 |
| $1,000 VIP | 1, 3 and 6 walkthroughs; wallet-matched; accumulator | −6.06% | −$745.90 each |
| $1,000 VIP | 6 walkthroughs + $500 top-up | −5.40% | −$690.70 |
| $1,000 VIP | 12 walkthroughs | −4.45% | −$654.70 |
| $1,000 VIP | mixed realistic | −2.39% | −$293.72 |
| $1,000 VIP | 20 walkthroughs | −1.19% | −$289.90 |
| $1,000 VIP | alternating | −0.61% | −$75.40 |
| $500 | churn after 4 months | −2.59% | −$54.30 |
| $500 | refunds | −2.39% | −$150.50 |
| $500 | paused 3 months | −1.66% | −$78.43 |
| $500 | 1, 3 and 6 walkthroughs | −1.47% | −$92.90 each |
| $500 | 6 walkthroughs + $500 top-up | −0.55% | −$37.70 |
| $500 | accumulator | −0.02% | −$1.70 |

The $50, $100, $200 and $350 tiers stay positive at $100 but well below target (2.57%–4.64%).

**Every loss-making scenario is a property of the live $100 price alone.** None survives at $120. That is the second, independent reason the MLS price must reach $120 before any activation.

---

## I. Cost integrity — what the 5.48% contains, and what it does not

### Carried in the accepted result

| Cost line | Basis | Status |
|---|---|---|
| MLS specialist payout — $50 flat | MLS guaranteed payout table, ≤2,500 sqft | **Verified** — contractual, code-verified |
| Non-MLS provider payout — 40% of post-sales value | `mediaCompensationEngine`, `STANDARD_40_PERCENT_AFTER_SALES` | **Verified** — code-verified, matches production |
| Funding commission — 15% first payment, 8% recurring and top-ups | `prepaidEngine` | **Verified** — configured |
| Booking commission — 0% wallet-funded, 15% marketplace | Booking classification | **Verified** — code-verified |
| Refunds | 2 refunds per month on the 6-walkthrough pattern; editing and Stripe retained | **Estimated** — a stress pattern, not a measured refund rate |
| Accumulated promotional liability | Full eventual redemption of every outstanding balance at the **lowest-margin permitted** service | **Conservative by construction** |
| Rollover and unused-balance close-out | Every balance eventually redeemed; nothing counted as profit | **Conservative by construction** |
| VIP support | $72 retainer + 12 sessions × $25 = $372/year | **Estimated** |
| Non-VIP priority support | $6/month, same basis as VIP enhanced support | **Estimated** |
| Stripe — 2.9% + $0.30 on every funding charge, top-up and direct payment | Published standard rate, then verified against the connected account | **VERIFIED 2026-10-11** — derived from this account's own settled charges: 2.8997% + $0.301 |
| Editing labour, MLS — $20 | 52 minutes × $23/hr. The $23 rate was **itself an unverified assumption**, not an approved wage. | **UNVERIFIED** — now modelled across $16/$18/$23 per hour and 30/45/60/90 active minutes |
| Employer payroll burden — 15% (R1) / 20% (R2) | Modelled | **Owner-provisional at 15%, UNVERIFIED.** 20% retained as the conservative view |
| Editing quality control — $5 (R1) / $8 (R2) per walkthrough | Modelled | **Owner-provisional at $5, UNVERIFIED.** $8 retained as the conservative view |
| Churn | Funds 4 months, then stops | **Estimated** — a stress pattern, not a measured churn rate |

The three unverified lines have **no observed value anywhere in the system**. `inventoryCertificationData` reports **0 MLS jobs, 0 MLS editing tasks, 0 tracked editing minutes and 0 MLS compensation snapshots**, against one active editor at $23/hr. No MLS Walkthrough has ever been produced.

Wallet-funded walkthrough cost at $120: **$78** under full realism (65% of price), **$82** under the conservative basis (68.33%).

### Not modelled at all

- **Customer acquisition and marketing cost** — the most material omission.
- Chargebacks and disputes beyond the refund allowance.
- Media specialist no-show, standby and backup-dispatch cost.
- Payment-recovery and delinquency handling.
- General overhead and staffing beyond the $6/month benefit line.
- SMS notifications, calendar invites, file storage and support time. The model states its own floor: *"small but unmeasured, so $70 is a floor, not a ceiling."*

### Which missing numbers could change the answer

| Missing figure | Why it is material |
|---|---|
| **Acquisition cost per VIP member** | The accepted VIP margin leaves **$224.70 of lifetime contribution** against $4,100 of cash in. Any unmodelled per-member acquisition, onboarding or servicing cost consumes it. This is the most likely way the accepted 5.48% becomes a loss. |
| **Actual MLS editing minutes and cost** | Every tier moves with it. At $120 a standalone Walkthrough reaches a 10% margin only if editing takes **26 minutes**, against the 52 assumed — the assumption is exactly double the level the margin requires. |
| **True payroll burden and QC cost** | These decide the **$500 tier**. At 15% + $5 it returns 13.09% and passes; at 20% + $8 it returns **9.25% and fails**, with 5 of 15 patterns below target. The $50, $100, $200 and $350 tiers hold either way. |
| **Real refund rate** | The refunds pattern is the worst case at $100, $200 and $500. A rate above the modelled 2-in-6 consumes the entry tiers' margin. |
| **Negotiated Stripe rate** | Small per transaction, but the standard rate is assumed rather than observed. |

### Requested from the owner — one consolidated list

1. Actual or estimated **MLS editing minutes per Walkthrough**, and the editor cost basis (hourly or per file). — **Still unmeasured.** Candidate wages of $16/$18/$23 against 30/45/60/90 active minutes are now modelled.
2. **Employer payroll burden** percentage to apply to editing labour. — **Supplied provisionally at 15%, still unverified.**
3. **Quality-control cost per Walkthrough**, and what it covers. — **Supplied provisionally at $5, still unverified.**
4. Real **refund and cancellation rate** on completed work. — **No data. Modelled as four disclosed intensities.**
5. Real monthly **churn rate** on subscription wallets. — **No data. Stress-tested at 1, 3 and 4 funding cycles.**
6. **VIP support**: cost per session, and expected sessions per VIP member per year. — **Usage unknown. Expected and maximum views both reported.**
7. **Acquisition / marketing cost per new Auto-Fund member**, plus any onboarding cost. — **Not established. Reported as the maximum absorbable cost only.**
8. **Chargeback, no-show and standby-dispatch cost** per job, if tracked. — **No frequency data. Modelled as a flat per-member cost.**
9. Confirmation that the **Stripe rate** in use is 2.9% + $0.30 and not a negotiated rate. — **Verified from the connected account. Assumption confirmed.**
10. Any **general overhead or staffing allocation** to apply per subscriber per month. — **Not allocated. Contribution margin is reported separately from every net view.**

Items 1–3 and 7 are the ones that can move a tier across the 10% line. **Item 7 is the only one that can turn the accepted VIP result negative.**