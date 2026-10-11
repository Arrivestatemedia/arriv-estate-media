# ARRIV_AUTOFUND_OWNER_SENSITIVITY_REPORT.md

**Date:** 2026-10-11
**Model:** `mls_unit_economics_v3_20261011` → owner sensitivity module (`optimizeMlsUnitEconomics?scope=owner_sensitivity`, admin-only, read-only)
**Companion:** `ARRIV_AUTOFUND_FINAL_MEMBERSHIP_CERTIFICATION.md` — the certification this report answers
**Status:** ANALYSIS ONLY. Staging only. Enrollment disabled, membership fee disabled, VIP promotional restriction disabled. No production price, compensation, allowance, balance or ledger changed.

---

## 0. The one-paragraph answer

On your provisional figures — **$18/hour, 60 active editing minutes, 15% payroll burden, $5 QC** — the approved structure holds at **$120**: the $500 tier returns **15.26%** and VIP returns **7.35%**, both positive, every customer pattern included. The other five tiers clear the 10% requirement comfortably (**18.51%–19.39%**). At the **live $100 price it does not hold**: VIP is negative in **17 of 24** cost combinations, the four entry tiers sit at **5.10%–6.95%**, and **$500 is exactly on its break-even line at 60 minutes** — one minute longer takes it negative.

Two findings matter more than the rest:

1. **Your 60-minute estimate is the whole question.** Active editing minutes is the largest lever on **both** tiers: 30 minutes → 90 minutes moves VIP by **16.83 points** and $500 by **19.26 points**. VIP stays positive up to **86 minutes** at $120 but only up to **45 minutes** at $100.
2. **VIP has a ceiling that no MLS cost can move.** A VIP member who buys larger packages and **no MLS Walkthrough at all** returns exactly **8.20%** at both $100 and $120, because the MLS price does not touch that purchase. Cutting MLS editing cost to zero cannot lift VIP past 8.20%. VIP's 10% target is therefore not reachable through any editing, QC, wage or MLS-price decision — only through the non-MLS package economics or the support cost.

---

## 1. What you supplied, and how it is labelled

| # | Your instruction | How it is modelled | Status |
|---|---|---|---|
| 1 | Editing at $23/hr recorded in the system; actual hands-on minutes unmeasured; founder 3–4 hours elapsed is not employee production time | $23 treated as **one candidate among three**, not as the truth. Minutes tested at 30/45/60/90 | **UNVERIFIED** — no observed value |
| 2 | Payroll burden: use 15% provisionally | 15% applied to editing labour | **PROVISIONAL, UNVERIFIED** |
| 3 | QC: use $5 per walkthrough provisionally | $5 applied per Walkthrough, including the MLS component of a bundle. $8 also run as a conservative view | **PROVISIONAL, UNVERIFIED** |
| 4 | Refunds/cancellations: insufficient data | Four disclosed refund intensities: 2, 4, 6 and 12 refunds a year | **DISCLOSED ASSUMPTION** |
| 5 | Churn: insufficient data; stress early cancellation after 1, 3, 4 cycles with full wallet redemption | Churn cycles 1, 3 and 4 added; every remaining balance redeemed in full at the lowest-margin permitted service | **DISCLOSED ASSUMPTION** |
| 6 | VIP support: model expected utilisation and the maximum entitlement | Expected 12 sessions/year at $25, plus a full ceiling search | **DISCLOSED ASSUMPTION** |
| 7 | Acquisition/onboarding: not established; show the maximum VIP can absorb | Reported as a **maximum absorbable cost**, never as an estimate | **NOT ESTABLISHED** |
| 8 | Chargebacks/no-shows: insufficient data | Modelled as a flat per-member cost, because no frequency data exists to model events | **DISCLOSED ASSUMPTION** |
| 9 | Stripe: verify actual fees from the connected account | **Verified against the live account** — see §2 | **VERIFIED** |
| 10 | Overhead: not allocated per subscriber; report contribution separately from net | Contribution is reported alone in every table; the net view is a separate, labelled hypothetical | **NOT ALLOCATED** |

**No figure supplied by you has been recorded as an observed operating result, and no wage is recorded as approved.** All wages tested, including $16 and $18, are candidates subject to experience, wage requirements and production quality.

**A lower wage is never credited with faster editing or equivalent quality.** Every wage scenario holds active minutes and QC constant and varies the wage alone. The combination that actually threatens the model is a *lower wage with slower editing* — $16/hour at 90 minutes still returns only **8.67%** on $500 and **1.74%** on VIP, because the two multiply.

---

## 2. Payment processing — item 9 is now VERIFIED, not assumed

Read directly from this app's connected Stripe account (`acct_1SqGCWDogWjaZtGy`, US, USD) via `verifyStripeProcessingFees`:

| Figure | Value |
|---|---|
| Settled charges examined | 10 ($838.00 gross, $27.31 in fees) |
| **Rate derived from this account** | **2.8997%** |
| **Fixed fee derived from this account** | **$0.301** |
| Blended effective rate on the sample | 3.2589% |
| Disputes on record | 0 |

**The assumed 2.9% + $0.30 is confirmed on this account.** The model no longer rests on a published list rate here.

One caution the sample makes visible: the blended 3.2589% is higher than 2.9% because the fixed $0.30 lands hard on small charges — the $1.00 settled charge carried a 33% effective rate. Across the Auto-Fund ladder that fixed fee is **0.60% of a $50 charge** but only **0.03% of a $1,000 charge**, so the entry tiers carry a structurally higher true processing rate on any direct-paid booking than the VIP tier does.

---

## 3. The editing labour grid — wage × active minutes × QC

Worst lifetime margin per tier, across all fifteen patterns including a member who churns after 4 cycles. **The `$500` and `VIP` figures are the tier's worst case, not its typical case.**

### $120 — QC $5

| Active minutes | $500 @ $16 | $500 @ $18 | $500 @ $23 | VIP @ $16 | VIP @ $18 | VIP @ $23 |
|---|---|---|---|---|---|---|
| 30 | 19.72% | 19.72% | 19.72% | 8.20% | 8.20% | 8.20% |
| 45 | 19.72% | 19.72% | 16.06% | 8.20% | 8.20% | 8.05% |
| **60** | **17.40%** | **15.26%** | **9.78%** | **8.20%** | **7.35%** | **2.68%** |
| 90 | 8.67% | 5.36% | **−2.92%** | 1.74% | **−1.06%** | **−8.08%** |

### $120 — QC $8

| Active minutes | $500 @ $16 | $500 @ $18 | $500 @ $23 | VIP @ $16 | VIP @ $18 | VIP @ $23 |
|---|---|---|---|---|---|---|
| 30 | 19.72% | 19.72% | 19.42% | 8.20% | 8.20% | 8.20% |
| 45 | 18.89% | 17.28% | 13.24% | 8.20% | 8.20% | 5.61% |
| 60 | 14.61% | 12.42% | 6.90% | 6.78% | 4.91% | 0.24% |
| 90 | 5.79% | 2.48% | **−5.80%** | **−0.70%** | **−3.50%** | **−10.52%** |

**The $120 rows you should read as your planning point** are the bold 60-minute row. At 60 minutes, VIP is **positive at every wage tested** and $500 is **positive at every wage tested and above 10% at $16 and $18**.

The 8.20% entries are the VIP floor described in §11 — they are not a QC effect.

### $100 — the same grid, and it fails

At $100 the grid is negative in **17 of 24** combinations for VIP and **11 of 24** for $500. Representative failures:

| Combination | $500 | VIP |
|---|---|---|
| $18/hr, 60 min, QC $5 *(your planning point)* | 0.04% | **−4.96%** |
| $18/hr, 60 min, QC $8 | −0.71% | **−6.79%** |
| $18/hr, 90 min, QC $5 | −6.06% | **−8.08%** |
| $23/hr, 90 min, QC $8 | −10.52% | **−15.64%** |
| $16/hr, 30 min, QC $5 *(cheapest)* | 21.89% | 1.14% |

**$500 sits exactly on its break-even line at your provisional point.** Its worst pattern returns **$0.90** on $2,100 of cash — 0.04%.

### The other five tiers

| Basis at $120 | $50 | $100 | $200 | $350 | 10% met? |
|---|---|---|---|---|---|
| $16/hr, 30 min, QC $5 | 27.71% | 26.67% | 24.04% | 26.59% | Yes |
| **$18/hr, 60 min, QC $5** | **19.33%** | **18.81%** | **18.51%** | **19.39%** | **Yes** |
| $18/hr, 60 min, QC $8 | 16.83% | 16.22% | 15.86% | 16.86% | Yes |
| $23/hr, 90 min, QC $8 | 1.01% | −0.17% | −1.17% | −0.04% | **No** |

At your provisional assumptions the 10% requirement for the other five tiers is **met with 8.5–9.4 points of headroom**. It is not met in the extreme 90-minute, $23/hr, $8 QC world — where three of the four entry tiers go negative. The pressure is therefore not VIP-specific; it is a property of the editing-cost estimate.

---

## 4. Early churn — fund 1, 3 or 4 cycles, then redeem everything

| Basis | Tier | 1 cycle | 3 cycles | 4 cycles |
|---|---|---|---|---|
| **$120, $18/hr 60 min QC $5** | $500 | 11.19% | 14.81% | 15.26% |
| **$120, $18/hr 60 min QC $5** | VIP | **2.23%** | 6.78% | 7.35% |
| $120, $16/hr 30 min QC $5 | VIP | 11.58% | 16.13% | 16.70% |
| $120, $23/hr 90 min QC $8 | $500 | −9.25% | −5.64% | −5.18% |
| $120, $23/hr 90 min QC $8 | VIP | **−15.64%** | −11.09% | −10.52% |
| $100, $18/hr 60 min QC $5 | $500 | −4.96% | −0.51% | 0.04% |
| $100, $18/hr 60 min QC $5 | VIP | **−10.08%** | −5.53% | −4.96% |

**Churning after one cycle is always the worst case**, and it is worst at the cheapest price — because the customer collects the deposit, the full promotional bonus and the membership fee offset in a single month, then redeems the entire balance at the lowest-margin permitted service.

At your provisional assumption VIP survives a one-cycle churner at $120 (**+2.23%, $22.84 of contribution on $1,025 of cash**). It does not survive one at $100 (**−10.08%**), and it does not survive one under the conservative cost basis at any price.

---

## 5. VIP support — expected utilisation and the maximum the tier can carry

| Sessions per year | Annual support cost | $120, $18/60min | $120, $16/30min |
|---|---|---|---|
| 0 | $72 | 9.79% | 10.64% |
| 6 | $222 | 8.57% | 9.42% |
| **12 (modelled expectation)** | **$372** | **7.35%** | **8.20%** |
| 24 | $672 | 4.91% | 5.77% |
| 36 | $972 | 2.47% | 3.33% |
| 48 | $1,272 | 0.03% | 0.89% |

**Maximum the tier can absorb at $120:** **48 sessions per year** before lifetime contribution turns negative. **Sessions that still hold a 10% margin: 3** at the $16/30-minute basis, and **none** at the $18/60-minute basis.

At **$100** there is no headroom at all: VIP is **−2.52% even at zero support sessions**. No support-utilisation control can rescue VIP at the live price.

The published VIP terms set **no session entitlement**, so this ceiling is the tier's financial limit, not a promised allowance. Expected utilisation remains unknown.

---

## 6. The direct answer on acquisition and onboarding

**The maximum acquisition and onboarding cost a VIP member can absorb before lifetime contribution turns negative, at $120 on your provisional assumptions:**

| Assumption about the member | Maximum cost before VIP goes negative |
|---|---|
| Member retained (no churn) — tightest non-churn pattern | **$765.57** |
| Member churns after 4 funding cycles | **$301.37** |
| Member churns after 3 funding cycles | **$208.53** |
| **Member churns after 1 funding cycle** | **$22.84** |
| **At the live $100 price** | **Already negative (−$558.01). No budget exists at all.** |

**Plan against $22.84, not $765.57.** The binding case is the one-cycle churner, and it is the number that should govern whether a paid acquisition channel is viable for the VIP tier.

For the **$500 tier at $120**, the same figures are **$929.75** before negative (retained member) and **$72.19** for a one-cycle churner.

To hold a **10% margin** the budget is negative for VIP at both prices (−$156.93 at $120) and **$349.25** for the $500 tier. Acquiring VIP members profitably therefore depends entirely on retention, not on the acquisition channel.

---

## 7. Flat per-member costs — chargebacks, no-shows, standby dispatch

No chargeback, no-show or standby frequency is measured, so these are modelled as a flat cost per member, applied to the worst pattern at $120 on your provisional assumptions.

| Flat cost per member | $500 tier (contribution $393.78 on $2,580) | VIP tier (contribution $301.37 on $4,100) |
|---|---|---|
| $0 | 15.26% | 7.35% |
| $50 | 13.32% | 6.13% |
| $100 | 11.39% | 4.91% |
| $200 | 7.51% | 2.47% |
| $300 | 3.63% | **0.03%** |
| $400 | **−0.24%** | **−2.41%** |

Both tiers absorb roughly $300 of unmodelled operating cost per member. VIP's break-even is at **$301**, the $500 tier's at about **$394**.

Real dispute data does exist and is measurable: **zero disputes** on the account's settled charge history.

---

## 8. Contribution margin kept strictly separate from net profitability

Every margin in this report is a **contribution margin**. **No general overhead has been allocated per subscriber anywhere in the model**, so nothing here is a net profit figure.

The table below is arithmetic on a *hypothetical* allocation, shown only so the two are never confused. It uses the worst pattern (a 4-month churner), which means a retained 12-month member would absorb three times as many months of the same monthly rate.

| Allocated overhead per subscriber per month | $500 @ $120 | VIP @ $120 | $500 @ $100 | VIP @ $100 |
|---|---|---|---|---|
| $0 (contribution) | 15.26% | 7.35% | 0.04% | −4.96% |
| $2 | 14.95% | 7.16% | −0.34% | −5.15% |
| $5 | 14.49% | 6.86% | −0.91% | −5.45% |
| $10 | 13.71% | 6.37% | −1.86% | −5.93% |
| $20 | 12.16% | 5.40% | −3.77% | −6.91% |
| $30 | 10.61% | 4.42% | −5.67% | −7.89% |

VIP never reaches 10% on the $120 column at any allocation. The $500 tier holds 10% up to about $30/subscriber/month at $120 — and has no room at all at $100.

---

## 9. Refund and cancellation intensity

A refund returns Booking Value to its pool and reverses the payout, but **retains the editing and processing cost**, so a refund is a direct loss on that booking.

| Refund intensity | $500 @ $120 | VIP @ $120 |
|---|---|---|
| 2 a year (earlier disclosed basis) | 15.30% | 7.89% |
| 4 a year | 14.37% | 7.26% |
| 6 a year | 13.38% | 6.59% |
| 12 a year (one a month) | 9.96% | 4.31% |

A refund rate at the extreme end costs VIP **3.58 points** and $500 **5.34 points**. No rate is measured.

---

## 10. Precise thresholds — where $500 and VIP turn unprofitable

All thresholds below assume **15% payroll burden and $5 QC** unless the row says otherwise. Prices are the MLS Walkthrough price.

### Maximum active editing minutes per Walkthrough

| Threshold | $500 @ $120 | VIP @ $120 | $500 @ $100 | VIP @ $100 |
|---|---|---|---|---|
| Positive contribution @ $16/hr | 119 | 96 | 67 | 50 |
| Positive contribution @ $18/hr | **106** | **86** | **60** | **45** |
| Positive contribution @ $23/hr | 83 | 67 | 47 | 35 |
| Positive contribution @ $18/hr, **no QC** | 120 | 100 | 74 | 59 |
| Positive contribution @ $18/hr, **no payroll burden** | 122 | 102 | 69 | 54 |
| **10% margin** @ $16/hr | 85 | none | 39 | none |
| **10% margin** @ $18/hr | **76** | **none** | **34** | **none** |
| **10% margin** @ $23/hr | 59 | none | 27 | none |
| **10% margin** @ $18/hr, no QC | 90 | none | 49 | none |
| **10% margin** @ $18/hr, **no payroll burden** | 87 | 61 | 39 | 20 |

**Read the $18/hr column.** At your provisional rate, VIP turns negative at **87 minutes** and $500 at **107 minutes** at $120. At $100 the limits are **45** and **60** minutes — both below the 60 minutes you provisionally assumed, which is exactly why the live price fails.

**VIP cannot reach a 10% margin at $120 through editing at any wage**, and only reaches it if the payroll burden is removed entirely (61 minutes at $18/hr). At $100 it can only reach 10% with no payroll burden at all, and then only up to 20 minutes.

### Maximum QC cost per Walkthrough (at $18/hr and 60 minutes)

| Threshold | $500 @ $120 | VIP @ $120 | $500 @ $100 | VIP @ $100 |
|---|---|---|---|---|
| Positive contribution | $20.50 | **$14.00** | $5.00 | none |
| 10% margin | $10.50 | none | none | none |

At $100, $500 breaks even at exactly the $5.00 QC you provisionally assumed, and VIP breaks even at no QC cost whatsoever.

### Maximum VIP support sessions per year (at $25 each)

| Threshold | VIP @ $120 | VIP @ $100 |
|---|---|---|
| Positive contribution | 48 | none |
| 10% margin | none | none |

### Minimum MLS price at $18/hr and 60 minutes

| Threshold | $500 | VIP |
|---|---|---|
| Positive lifetime contribution | already positive at $100 | **$108** |
| 10% lifetime margin | **$112** | none, up to $300 |

**Recorded as an informational threshold only.** No price change is recommended here, and the earlier tested $79 VIP fee remedy stays on the record as tested and declined.

### Churn cycle threshold

| Tier | First cycle count that goes negative at $120 (provisional basis) | At $100 (provisional basis) |
|---|---|---|
| $500 | none, 1–4 cycles positive | 1 cycle (−4.96%), 3 cycles (−0.51%) |
| VIP | none, 1–4 cycles positive (thinnest: 2.23% at 1 cycle) | 1, 3 and 4 cycles all negative |

---

## 11. The VIP ceiling no MLS decision can move

| Pattern | Buys MLS Walkthroughs? | $100 | $120 |
|---|---|---|---|
| `larger_packages` — 1 Essentials + 1 Cinematic a month | **No** | **8.20%** | **8.20%** |

This pattern is identical at both prices because the MLS price does not affect an Essentials or Cinematic purchase. It is the VIP tier's binding constraint whenever MLS editing is cheap enough that every MLS pattern clears it — which is why the editing grid shows 8.20% repeating, and why reducing MLS editing cost recovers nothing beyond that point.

**Consequence for the 10% target.** VIP's 10% requirement is unreachable through any MLS editing, QC, wage, support-utilisation or MLS-price decision. The only levers that reach 8.20% are the non-MLS package economics (provider payout rate and the Essentials/Cinematic editing constants, currently **$50 and $100 per job — themselves unverified assumptions that were not part of the wage question**) or the VIP support cost.

**Your acceptance of a 5.48% VIP contribution margin is satisfied and improved under your provisional figures** — the VIP worst case is now **7.35%**, not 5.48%, because $25.70 of editing per walkthrough is cheaper than the $28.00 the earlier certification used at full realism. This report does not revisit that decision or propose a fee.

---

## 12. The three operating measurements that would most materially affect profitability

Measured like-for-like: both ends of each lever run on the **same** customer pattern (a member who churns after 4 cycles), so the swing is the lever's effect and not a change of worst pattern.

| Rank | Measurement | Range tested | VIP swing | $500 swing |
|---|---|---|---|---|
| **1** | **Active editing minutes per Walkthrough** | 30 → 90 min at $18/hr | **16.83 points** (15.77% → −1.06%) | **19.26 points** (24.89% → 5.63%) |
| **2** | **QC cost per Walkthrough** | $0 → $20 at $18/hr, 60 min | **16.26 points** (11.42% → −4.84%) | **18.60 points** (19.91% → 1.31%) |
| **3** | **VIP support sessions per member per year** | 12 → 48 sessions | **7.32 points** (7.35% → 0.03%) | not applicable |

Close behind, and worth knowing: editing wage ($16→$23) **6.54** VIP / **7.49** $500; payroll burden (0%→30%) **5.86** VIP / **5.02** $500; early churn **5.12** VIP / **4.07** $500; refund intensity **3.58** VIP / **5.34** $500.

**On the $500 tier the order is minutes (19.26), QC (18.60), then wage (7.49)** — support cost does not apply.

### Per-unit sensitivities, for planning

| Measurement | Each additional unit costs |
|---|---|
| 1 active editing minute (at $18/hr) | **0.28 points** of VIP margin, **0.32 points** of $500 margin |
| $1 of QC per Walkthrough | **0.81 points** of VIP margin, **0.93 points** of $500 margin |
| $1/hour of editing wage (at 60 min) | **0.93 points** of VIP margin, **1.07 points** of $500 margin |
| Each percentage point of payroll burden (at $18/hr, 60 min) | **0.20 points** of VIP margin, **0.17 points** of $500 margin |
| Each VIP support session per year | **0.20 points** of VIP margin |

**Therefore the three things to measure first, in this order:**
1. **Actual active editing minutes per MLS Walkthrough.** It is the largest lever on both tiers, it is currently unmeasured, and the difference between 60 and 90 minutes moves VIP by 8.4 points and $500 by 9.9 points. A 60-minute assumption has 26 minutes of headroom on VIP at $120 — and no headroom at all at $100, where the limit is 45.
2. **Actual QC cost per Walkthrough.** Second largest on both tiers, and the one that scales with booking volume rather than with the deposit size, so it penalises the wallet-heavy patterns hardest. VIP turns negative at $14.00 of QC at $120 and at $0.00 at $100.
3. **Actual VIP support sessions per member per year.** The only VIP-specific lever, with a hard ceiling of 48 sessions at $120 and **zero sessions of tolerance at $100**.

---

## 13. What is still missing

Not modelled anywhere, and therefore not reflected in any figure above:

- **Actual customer acquisition and onboarding cost** — reported only as a maximum absorbable amount (§6).
- **Actual active editing minutes per Walkthrough** — the largest single unknown.
- **Actual QC cost and what it covers.**
- **A real refund and cancellation rate.**
- **A real subscription churn rate.**
- **VIP support utilisation** and the cost per session.
- **Chargeback, no-show and standby-dispatch frequency.**
- **General overhead and staffing allocation per subscriber** — deliberately excluded so contribution and net profit are never conflated.
- Non-MLS editing constants of **$50 per Essentials job and $100 per Cinematic job**, which drive the 8.20% VIP ceiling and were not part of the wage question.
- Whether in-house editors at $16–$18/hour produce **equivalent quality at equal speed**. Deliberately not assumed.
- SMS, calendar invites, file storage and support time. The model states its own floor: *"small but unmeasured, so $70 is a floor, not a ceiling."*

---

## 14. Status of the approved structure

- **Structure preserved.** All six deposits, all six promotional bonuses, the $50 MLS payout, the $25 VIP membership fee and the promotional restriction are held exactly as approved. Nothing here redesigns a tier.
- **VIP promotional credit on a standalone MLS Walkthrough: still barred.** A 7-per-cycle cap instead would give VIP 3.30%, not the accepted figure.
- **Standalone MLS allowance: none at any tier** — unlimited using the customer's own funds.
- **No fee is proposed.** The $79 remedy stays on the record as tested and declined. The evidence in §11 shows a fee is not what limits VIP either.
- **No production change.** Enrollment disabled, membership fee disabled, VIP promotional restriction disabled. No price, compensation, allowance, balance or ledger was modified.
- **Stripe fee assumption is now evidence-based** for this account, though a wider settled-charge window needs the dashboard.

**Model versions added:** `ownerSensitivity.ts` (analysis module), `verifyStripeProcessingFees` (read-only fee verification), early-churn cycles 1 and 3, and a refund-intensity parameter on the simulator. All analysis-only and read-only.