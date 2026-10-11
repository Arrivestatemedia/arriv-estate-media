# Arriv Estate Media — Simplified Auto-Fund MLS Policy: PASS / FAIL

**Date:** 2026-10-11
**Model:** `mls_unit_economics_v3_20261011` → phase 6 (`optimizeMlsUnitEconomics`, admin-only, read-only)
**Status:** ANALYSIS ONLY. Enrollment stays disabled. No pricing, compensation, allowance, balance, or production setting changed.

---

## Verdict

| Cost basis | $120 MLS price + simplified policy |
|---|---|
| Baseline (no payroll burden, no QC) | **PASS** |
| **Full realism** (15% payroll burden + $5 QC) | **FAIL — $1,000 VIP tier only**, at 3.30% vs the 10% target |
| Conservative realism (20% burden + $8 QC) | **FAIL — $350 (9.85%), $500 (6.46%), $1,000 VIP (−0.98%)** |

**The simplified policy itself is not the cause.** It is economically identical to the previously recommended capped policy — the margin delta is **0.00 on all six tiers**, and the previously recommended policy fails on exactly the same tiers at the same cost basis. The failure is caused by cost realism applied at a $120 price.

**The $350 and $500 tiers pass at every heavy standalone pattern with no booking cap.** That is the part the owner asked to be stress-tested, and it holds.

---

## The finding that matters

**Removing the standalone booking-count allowance costs nothing.**

| Tier | Previous recommendation | Simplified (no cap) | Delta |
|---|---|---|---|
| $50 | 24.08% | 24.08% | 0.00 |
| $100 | 23.73% | 23.73% | 0.00 |
| $200 | 23.54% | 23.54% | 0.00 |
| $350 | 21.35% | 21.35% | 0.00 |
| $500 | 18.46% | 18.46% | 0.00 |
| $1,000 VIP | 11.87% | 11.87% | 0.00 |

Margins are the worst-case lifetime margin across all 14 customer patterns.

**Why:** the booking-count allowance was never the constraint. The promotional pool is. A $500 tier earns $100 of promotional value a month, which is less than one walkthrough at $120, and VIP earns $250 a month, which is 2.08 walkthroughs. Any allowance at or above the accrual rate is non-binding, so a cap of 1 (or 7) and no cap at all produce identical ledgers.

**The cap's only economic effect** is to route promotional credit toward bundles instead of standalone walkthroughs. A standalone walkthrough costs 65 cents per dollar of price to deliver; the same credit inside a bundle costs 58 cents. That 7-cent difference is the entire value of a booking cap, and it is far below one margin point.

### Consequence for the VIP cap

The VIP 7-per-cycle limit is **non-binding**. Tested at 3, at 7, and with no cap at all, the spread in worst-case margin is **0.00% at $350, $500 and $1,000**. The cap cannot be used as a financial remedy, and it does not protect the VIP tier.

---

## Calibration

The cost-realism parameters were set to zero and re-run first. Every tier reproduced the previous model's published figures exactly ($50 24.08%, $100 23.73%, $200 23.54%, $350 21.35%, $500 18.46%, VIP 11.87% at $120). The new cost parameters therefore change nothing on their own — the differences below are entirely attributable to payroll burden and QC.

---

## Cost realism: what was added, and why it is an assumption

Per wallet-funded MLS Walkthrough at a $120 price:

| Component | Baseline | Full realism (R1) | Conservative (R2) | Basis |
|---|---|---|---|---|
| Specialist payout | $50.00 | $50.00 | $50.00 | **Contractual** — MLS guaranteed payout table |
| Editing (52 min at $23/hr) | $20.00 | $20.00 | $20.00 | **Assumed** — see below |
| Employer payroll burden | $0.00 | $3.00 (15%) | $4.00 (20%) | **Assumed** — not configured |
| Quality control | $0.00 | $5.00 | $8.00 | **Assumed** — not configured |
| **Total** | **$70.00** | **$78.00** | **$82.00** | |
| Cost as share of price | 58.3% | 65.0% | 68.3% | |

Direct-paid walkthroughs additionally carry Stripe ($3.78) and the 15% marketplace commission ($18.00).

**Why the editing figure is an assumption, not a measurement.** `packageEditingConfig.ts` defines editing *task types* and a 6-hour QC *scheduling buffer*, but no editing minutes and no hourly cost per task type. The operator wage ($23.00/hr) comes from the one active `EditorProfile`. **No MLS Walkthrough has ever been created, edited, or paid out in production** — zero editing tasks, zero compensation snapshots, zero jobs. The 52-minute figure has never been observed.

**Burden scope:** editing is performed by Arriv payroll editors, so employer taxes and administration apply. Capture specialists are independent contractors and carry no employer burden, which is why the $50 payout is not loaded.

---

## Results — the owner's specific stress test

Heavy standalone MLS usage at $120 under **full realism**, with **no booking cap** on $50–$500:

| Pattern | $350 | $500 | $1,000 VIP |
|---|---|---|---|
| 6 walkthroughs / month | 16.91% | 11.69% | 4.14% ✗ |
| 12 walkthroughs / month | 16.88% | 14.46% | 7.04% ✗ |
| 20 walkthroughs / month | 16.87% | 15.46% | 11.42% |
| Entire wallet on walkthroughs | 13.68% | 10.46% | 4.14% ✗ |
| 6 / month + $500 cash top-up | 17.10% | 12.38% | 4.93% ✗ |
| Accumulate then 15 / month | 16.08% | 13.13% | 4.14% ✗ |
| 6 / month with 2 refunds | 16.10% | 10.64% | 3.30% ✗ |
| 4 walkthroughs + 1 bundle | 20.36% | 21.68% | 7.79% ✗ |
| Alternating walkthrough / bundle months | 23.49% | 17.01% | 8.82% ✗ |

**$350 and $500 clear the target on every pattern.** Unlimited standalone MLS usage is financially sound at those tiers. **The VIP tier fails on 11 of 14 patterns** — this is not an edge case.

At conservative realism, $350 falls to 9.85% and $500 to 6.46%, failing on the low-utilisation patterns.

---

## The exact reason the VIP tier fails

At a $120 price, a delivered walkthrough costs $78 and leaves **$42**. The VIP tier then gives away **25% of the customer's booking value** — $250 a month, 25 walkthroughs a year — at no charge.

For a VIP member whose wallet is fully used on walkthroughs (100 walkthroughs a year):

| Line | Amount |
|---|---|
| Walkthrough margin: 100 × ($120 − $78) | +$4,200.00 |
| Promotional give-away: 25 free walkthroughs × $78 | −$1,950.00 |
| Funding commission (15% first + 8% recurring) | −$1,030.00 |
| Stripe on funding | −$351.60 |
| VIP support (retainer + 12 sessions) | −$372.00 |
| **Contribution on $12,000 of cash** | **+$496.40 → 4.14%** |

The model returns exactly $496.40 for that pattern. Patterns with refunds or pauses, and the close-out of unredeemed balances, push the worst case down to **3.30% — a shortfall of $803.60** against the 10% target.

**The 25% bonus consumes the entire per-walkthrough margin once commission, processing and support are paid.** At $100 that same tier is 0.58%; at $120 it is 3.30%; it clears 10% only at $131.

---

## Remedies, ranked

| Remedy | Effect | Verdict |
|---|---|---|
| **1. Raise the MLS Walkthrough price to $131** | VIP 3.30% → **10.20%**; all six tiers pass | **Only demonstrable remedy.** +$11 (9.2%) |
| 2. Cut editing + QC to $21.67 or less per walkthrough | All tiers pass at $120 | Requires the edit to drop from 52 to ~38 minutes. **Unproven** — no MLS edit has ever been timed |
| 3. Reinstate a standalone booking cap | Margin delta 0.00 | **Not a remedy** — the cap is non-binding |
| 4. Reduce VIP support cost | 3.30% → 5.80% even if every support session **and** the retainer were eliminated | **Not a remedy** — the gap is $803.60; total support cost is $372 |

### VIP margin by price (full realism)

| Price | $120 | $123 | $126 | $129 | **$131** | $133 | $135 |
|---|---|---|---|---|---|---|---|
| VIP worst-case | 3.30% | 5.31% | 7.21% | 9.03% | **10.20%** | 11.33% | 12.42% |

Each dollar of price is worth about 0.6 margin points at the VIP tier.

---

## Recommended final configuration

**Minimum necessary change: raise the standalone MLS Walkthrough price to $131.** This is the lowest price at which every tier and every customer pattern clears 10% under full cost realism. The simplified policy structure is unchanged — no cap on $50–$500, VIP at 7 per cycle, bonuses untouched at $0 / 5% / 10% / 15% / 20% / 25%.

| Tier | Standalone allowance | Monthly promo | Worst-case lifetime | Worst pattern |
|---|---|---|---|---|
| $50 | none | $0 | 22.90% | 20 / month |
| $100 | none | $5 | 22.55% | refunds |
| $200 | none | $20 | 22.57% | refunds |
| $350 | none | $52.50 | 19.96% | 1 / month |
| $500 | none | $100 | 17.01% | 1 / month |
| $1,000 VIP | 7 per cycle | $250 | 10.20% | refunds |

**$131 leaves only 0.20 points of headroom on the VIP tier.** I recommend publishing **$135** for a $4 difference that lifts VIP to 12.42% and absorbs any small movement in editing cost. **$138** is required if the conservative cost basis (20% burden, $8 QC) is used.

### Requirements met

- $50 specialist payout preserved — unchanged in every scenario.
- All six bonus percentages preserved — $0 / 5% / 10% / 15% / 20% / 25%, never adjusted as a remedy.
- Complete redemption of all cash-funded and promotional Booking Value modelled in every tier and pattern.
- Realistic editing labour, payroll burden, quality control and VIP support costs included.
- Heavy standalone MLS usage stressed at every tier, with no booking cap on $50–$500.
- Minimum 10% lifetime contribution margin held at $131 under full realism.
- Loss-making scenarios identified: **none at full realism** (the VIP failures remain profitable but below target). At the conservative basis, **six VIP combinations are loss-making**, the worst at −0.98%.

---

## Before any enrollment

1. **Measure the real MLS editing time first.** If the true editing + QC cost is **$21.67 or less** (an edit of about 38 minutes at $23/hr, incl. 15% burden and $5 QC), the policy passes at **$120** with no price change at all. Time the first 25 edits with the existing editing time-tracking. This is the single highest-value measurement, because it decides whether the price change is needed.
2. **The $350 and $500 tiers are the safe part of the simplification** — 13.68% and 10.46% worst-case at $120. If a price change is deferred, these are the tiers that hold.
3. **A price change reaches every MLS customer**, not only Auto-Fund members. This is your decision.

---

## What changed in this round

- **Added** the read-only simplified-policy module `simplifiedPolicy.ts` and two optional cost parameters (payroll burden, QC) to the simulator. Both default to zero, so the existing analysis reproduces exactly — verified tier by tier.
- **Not changed:** pricing, specialist compensation, editing budgets, the staged allowance configuration, the enrollment flag (still off), balances, and every historical record.