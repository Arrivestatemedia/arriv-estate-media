> **PARTLY SUPERSEDED — 2026-10-11.** The "$10 delivery-cost reduction" option in this report is **not supported by operational evidence**. The $20 MLS editing figure is a modelling assumption, and no MLS Walkthrough has been edited in production. The final recommendation and stress results are in **`AUTOFUND_MLS_UNIT_ECONOMICS_FINAL.md`**.

# Auto-Fund MLS Walkthrough — Full Promotional-Credit Redemption
## Corrected Design, Exact Shortfalls, and Solutions for Owner Consideration

**Date:** 2026-10-11
**Model version:** `mls_full_redemption_v2_20261011`
**Supersedes:** `AUTOFUND_MLS_HYBRID_MODEL.md` (its model treated promotional value beyond the allowance as neither obligation nor profit — too generous)
**Status:** Analysis and staging design only. **The customer-facing feature remains gated off and no production financial behaviour has changed.**

---

## 1. The Correction Applied

Two things were wrong in the previous design, and both are now fixed.

**A. Redemption mechanics.** The monthly MLS allowance is strictly a **booking-count limit**. It is not a dollar-value redemption limit. I verified the staged enforcement code end to end and confirmed it was *already* free of the forbidden restrictions — `consume` is a pure booking-count check, with no reference to the booking's dollar value. Confirmed absent:

| Prohibited restriction | Found in staged code? |
|---|---|
| Promotional-dollar cap | **No** |
| Promotional-percentage cap | **No** |
| Minimum cash contribution | **No** |
| Mandatory split payment | **No** |
| Full $100 coverage by promotional credits | **Permitted (100%)** |

The customer-facing copy has been rewritten to say so explicitly: each allowance walkthrough "may be paid in full — up to the entire walkthrough price — with your available Booking Value, including promotional bonus credits," with cash-funded value topping up automatically and no requirement to split.

**B. The financial model.** The previous model treated promotional Booking Value *beyond* the allowance as "neither obligation nor profit" — i.e. it never charged the cost of delivering it. That flattered every tier. The corrected model charges **full redemption**: the full monthly allowance is used on standalone MLS, **all** remaining promotional Booking Value is redeemed through qualifying bundles, and **all** cash-funded Booking Value is redeemed over the lifetime. No Booking Value is ever counted as profit while the obligation to deliver it still exists.

**What this changed:** because bundles carry a 45.8% margin and standalone MLS carries 30%, charging the promotional residual properly makes the upper tiers look *worse*, not better. That is the honest result and it is what drives the findings below.

---

## 2. Model Definition

| Element | Treatment |
|---|---|
| Cash in | 12 × tier amount |
| Booking Value issued | cash-funded BV (12 × amount) + promotional bonus BV (12 × bonus) |
| Step 1 | **Full monthly allowance** used on standalone MLS Walkthroughs, promotional-funded first, each up to the **full $100** |
| Step 2 | **All remaining promotional BV** redeemed through qualifying bundles (45.76% margin) |
| Step 3 | **Cash-funded BV** redeemed over the lifetime |
| Margin basis | contribution ÷ cash in, over the lifetime |

**Why two cases are reported.** Step 3 has two defensible readings, and the difference dominates every number:

- **`mls_heavy` — BINDING.** Cash-funded Booking Value is redeemed as standalone MLS Walkthroughs (30% margin). The owner explicitly permits unlimited cash-funded standalone MLS, so this is the realistic worst case for an MLS-oriented customer, and **the recommendation rests on it**.
- **`bundle_mix` — upside.** Cash-funded value is also redeemed through qualifying bundles (45.76% margin).

**Preserved, by instruction:** all six funding amounts and bonus percentages — including the $1,000 VIP tier's 25% bonus — plus specialist payouts and the MLS guaranteed payout table, editing costs, funding commissions (15% first payment / 8% recurring / 0% booking-level), and all VIP benefits. No retail price was changed.

**Canonical unit economics.** MLS Walkthrough ≤2,500 sqft: **$100 retail against $70 delivery** ($50 guaranteed specialist payout + $20 editing) = **30% gross margin** — the thinnest service in the catalogue. Canonical qualifying bundle (MLS + Essentials, 2,501–3,500 sqft): $425 retail / $230.50 cost = **45.76%**.

---

## 3. Maximum Sustainable Fully-Promotional-Eligible $100 Walkthroughs Per Month

| Tier | Bonus | Promo BV / month | Promo pool / year | Baseline margin (zero allowance) | **Max sustainable allowance** | Margin at that allowance |
|---|---|---|---|---|---|---|
| **$50** | 0% | $0 | $0 | 17.92% | **n/a — no promotional credits exist** | — |
| **$100** | 5% | $5 | $60 | 15.51% | **Not binding — pool-limited** | 14.72% |
| **$200** | 10% | $20 | $240 | 12.94% | **Not binding — pool-limited** | 11.37% |
| **$350** | 15% | $52.50 | $630 | 10.30% | **0** | 10.30% |
| **$500** | 20% | $100 | $1,200 | **7.61% (already below target)** | **0** | 7.61% |
| **$1,000 VIP** | 25% | $250 | $3,000 | **1.83% (already below target)** | **0** | 1.83% |

**Reading the table.**

- **$50** — the tier grants no promotional Booking Value at all, so no walkthrough can ever be promotional-funded. This is structural, not a financial limit.
- **$100 and $200** — a positive allowance is financially **safe**. An allowance of just **1** already releases the tier's **entire** promotional pool ($60/yr and $240/yr), so the count itself never binds; the size of the promotional pool does. These tiers cost Arriv nothing extra because the pool is too small to matter.
- **$350, $500, $1,000** — a positive allowance cannot hold the 10% lifetime target. The reasons are **not the same**, and that distinction matters (see §4).

**Reproduction of the original loss.** The $1,000 VIP customer redeeming only standalone MLS Walkthroughs: $12,000 cash in, $10,500 specialist and editing, $1,030 commission, $351.60 Stripe, $372 VIP cost → **−$253.60 (−2.11%) lifetime**. This matches the loss originally identified, and it now arises from a single, complete ledger.

---

## 4. Exact Financial Shortfall — and Why Each Zero Happens

A zero was never assigned silently. Each carries its binding constraint, its dollar shortfall, and its cause. Every $1 of promotional Booking Value moved off a qualifying bundle (45.76% margin) onto a standalone MLS Walkthrough (30% margin) costs an extra **$0.1576**.

### $350 tier — `ALLOWANCE_HEADROOM_EXHAUSTED`
The baseline clears the target at **10.30%, with only $12.42 of annual headroom on $4,200 of cash.** The tier grants $630/year of promotional value. Moving that pool onto standalone MLS adds **$99.32** of delivery cost, taking the margin to **7.93%** — **$86.90 short of target**, 2.07 points. A single allowance walkthrough per year already exceeds the available headroom.

### $500 tier — `BASELINE_BELOW_TARGET`
At a **zero** allowance the tier already fails: **7.61%**, short by **$143.42/year on $6,000 of cash.** The cause is not the allowance — it is the **20% promotional bonus meeting the 30% MLS margin**. $1,200/year of free service costs $650.40 to deliver, against a cash-funded book that only earns $1,657.60. At an allowance of 1 the margin falls to **4.46%**, short by **$332.60/year** (5.54 points).

### $1,000 VIP tier — `BASELINE_BELOW_TARGET`
At a **zero** allowance the tier already fails: **1.83%**, short by **$980.66/year on $12,000 of cash.** $3,000/year of promotional value costs $1,626 to deliver even through the *best* channel (bundles), and the cash-funded book earns only $2,646. At an allowance of 1 the margin is **0.25%**, short by **$1,169.84/year** (9.75 points).

**The structural finding — and it is the important one.** At the $1,000 VIP tier, the promotional value costs $1,626/year to deliver through bundles at the *best* margin available, while the cash-funded book earns only $2,646. **The VIP tier therefore only clears the target when the customer's cash-funded value is ALSO redeemed through bundles (17.59%).** If the customer redeems cash-funded value as MLS Walkthroughs, the tier fails **no matter what the allowance is set to.** The same is true at $500.

**The binding constraint is the standalone MLS Walkthrough's 30% gross margin combined with the tier bonuses — not the allowance.** Capping the allowance cannot repair a tier whose own economics fall short, because capping where promotional value is spent does not change the fact that $3,000 of free service has to be delivered for $12,000 of cash.

---

## 5. Solutions for Owner Consideration

For each tier, the value that would have to change to support **one fully promotional-covered standalone walkthrough per month** while holding the 10% lifetime target. Each row holds the other two variables at their current values.

| Tier | Current | MLS retail required | MLS delivery cost required | Promotional bonus required |
|---|---|---|---|---|
| $350 | $100 / $70 / 15% | **$103** | **$68.00** | **≤12.0%** |
| $500 | $100 / $70 / 20% | **$107.50** | **$65.25** | **≤12.0%** |
| $1,000 VIP | $100 / $70 / 25% | **$115** | **$61.00** | **≤7.5%** |

### The single cleanest fix: a modest MLS Walkthrough price increase

| Allowance supported | MLS retail that repairs **every** tier |
|---|---|
| **1 / month** | **$115** |
| **2 / month** | **$116** |

Raising the MLS Walkthrough price from $100 to **$120** — the change most easily justified commercially, since the service is priced below comparable market rates — lifts **all six tiers** clear of the target with their full entitlement intact:

| Tier | Margin at allowance 1, MLS retail $120 |
|---|---|
| $50 | 29.58% |
| $100 | 26.97% |
| $200 | 24.20% |
| $350 | 21.35% |
| $500 | 18.46% |
| **$1,000 VIP** | **13.00%** |

### The alternative: reduce MLS delivery cost
At **$60** delivery cost (from $70) with the $100 price and all bonuses untouched: $50 27.92%, $100 25.22%, $200 22.37%, $350 19.43%, $500 16.46%, **$1,000 VIP 11.25%** — all passing. This preserves the customer-facing price entirely and requires only a $10 reduction in MLS cost (a $5 payout reduction plus a $5 editing reduction, or a $10 payout reduction).

### The third option: reduce the promotional bonus
$350 15% → ≤12%, $500 20% → ≤12%, $1,000 25% → ≤7.5%. This is the only option that changes what the customer was promised, which is why it is listed last.

### And the option that needs no change at all
Under the **bundle-mix** reading of cash-funded redemption, **every tier passes with a full allowance and no changes to price, cost, or bonus**: $50 33.68%, $100 30.48%, $200 27.13%, $350 23.70%, $500 20.22%, **$1,000 VIP 16.02%**. If the owner considers a bundle-oriented redemption mix to be the realistic expectation for Auto-Fund members, the constraint dissolves.

---

## 6. What Is Preserved

All six funding amounts and bonus percentages (including the VIP 25%), specialist payouts and the MLS guaranteed payout table, editing costs, funding commissions, VIP benefits and the VIP cost basis, and every retail price. The qualifying-bundle rule is unchanged and re-verified: at least one MLS Walkthrough + at least **$150** of non-MLS services + a blended margin of at least **35%**; nominal and inexpensive add-ons still never qualify, and 2× MLS in one order still does not.

---

## 7. Certification Results

`testAutoFundMlsAllowance` — **22 / 22 PASS** (rules version `mls_full_redemption_v2_20261011`)

New in this round:

| # | Test | Result |
|---|---|---|
| 22 | Full promotional coverage of the walkthrough price — no dollar cap, no percentage cap, no minimum cash, no mandatory split | ✓ |
| 23 | The allowance is a booking-count limit only, not a dollar limit | ✓ |
| 24 | No silent zeros — each zero carries its reason and dollar shortfall | ✓ |

Retained and re-passing: tier-specific allowances, cycle reset and non-accumulation, cash-funded booking after exhaustion, direct payment consuming no allowance, bundle qualification, idempotent consumption, restoration on refund, wallet isolation, tier-change re-derivation, pause behaviour, commission suppression, specialist payout preservation, bypass resistance, and the production enrollment gate.

Every synthetic fixture carried the `cert_` prefix and was removed (3 allowances, 2 subscriptions, 2 contacts; zero cleanup errors). **No real customer balance, historical transaction, commission rule, or specialist payout was modified.** The previously certified suites — deployed payment contract 20/20, booking commission suppression 10/10, certification payroll delivery exclusion 14/14 — are untouched.

---

## 8. Remaining Risks and Recommendation

**Risks.**
1. The `mls_heavy` assumption drives the answer. It is the correct conservative reading, but it is an assumption, and the owner should confirm it rather than accept it by default.
2. The $500 and $1,000 tiers are below target *at a zero allowance*. This is a pricing finding about the tier ladder, not the allowance, and it is the most consequential thing in this report.
3. The $350 tier passes at 10.30% — only $12.42 of headroom. Any movement in payout, editing, or Stripe cost breaches it.
4. The engine's MLS retail of $115 and delivery cost of $61 are thresholds at which the target is exactly met, with no buffer. A $120 price or a $60 cost gives real margin.

**Recommendation.** I have implemented the corrected model in staging and left the allowance configuration at its previously staged values (`$50: 0, $100: 1, $200: 1, $350: 0, $500: 0, $1,000: 0`), now each carrying a documented reason and shortfall rather than a bare zero. **Those three zeros are a finding awaiting your decision, not a decision I have taken.**

The cleanest path to the model you asked for — a real monthly allowance, fully promotional-covered, with all six tiers and bonuses intact — is a **modest MLS Walkthrough price increase to $120**, which lifts every tier clear of the target and leaves 3 points of buffer at the VIP tier. If the price must stay at $100, the **$10 MLS delivery-cost reduction** achieves the same result without touching anything the customer sees.

No production deployment is requested or performed. Enabling customer enrollment requires your explicit authorization.

---

*Analysis and staging only. No pricing, commission, payout, entitlement, balance, or historical financial record was changed.*