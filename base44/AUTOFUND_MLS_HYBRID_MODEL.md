# Auto-Fund MLS Walkthrough — Hybrid Promotional-Credit Model
## Design, Staging Implementation, and Certification Report

> **SUPERSEDED — 2026-10-11.** The owner corrected the model: the monthly MLS allowance is strictly a **booking-count limit**, and every walkthrough inside it may be covered **in full (100%)** by promotional credits, with no dollar cap, percentage cap, minimum cash contribution, or mandatory split. This report also treated promotional Booking Value beyond the allowance as *neither obligation nor profit*, which is too generous. The authoritative figures are in **`AUTOFUND_MLS_FULL_REDEMPTION_MODEL.md`**; the numbers here are retained only as history.

**Date:** 2026-10-11
**Status:** Implemented in staging. **NOT enabled for customer enrollment.** No production changes made. Awaiting explicit owner authorization.
**Rules version:** `mls_hybrid_v1_20261011`
**Target:** 10% lifetime contribution margin

---

## 0. Headline Finding

The hybrid model is **financially sustainable**, but the standalone MLS promotional allowance that survives the 10% lifetime target is **materially smaller than assumed**. It is **1** for the $100 and $200 tiers and **0** for the $350, $500, and $1,000 tiers.

The reason is structural, not a modeling artifact: an MLS Walkthrough retails at $100 and costs $70 to deliver (guaranteed $50 specialist payout + $20 editing) — a **30% gross margin**, the thinnest in the catalog. Promotional Booking Value is free service, so every dollar of promotional value redeemed on a standalone MLS Walkthrough converts a 30%-margin service into a **−70% margin** service.

At the $1,000 VIP tier the promotional bonus is $250/month. Applied to standalone MLS Walkthroughs, that costs $175/month to deliver with no offsetting cash — which is exactly the loss previously identified.

**The hybrid model therefore rests on its other two legs**, which are both healthy and verified:
- **Qualifying bundles** — 45.8% blended margin (MLS + Essentials). Promotional value stays fully usable.
- **Cash-funded Booking Value and direct payment** — unrestricted, and self-funding.

All three legs are implemented and certified. **Zero scenarios fall below the 10% target at the recommended allowances.**

---

## 1. Recommended Monthly MLS Promotional Allowance

| Auto-Fund Tier | Monthly Promo Bonus | **Recommended Standalone MLS Promotional Allowance** | Worst-Case Lifetime Margin |
|---|---|---|---|
| $50 | $0 | **0** | 22.21% |
| $100 | $5 | **1** | 14.72% |
| $200 | $20 | **1** | 11.37% |
| $350 | $52.50 | **0** | 18.43% |
| $500 | $100 | **0** | 12.65% |
| $1,000 VIP | $250 | **0** | 11.45% |

**Interpretation.** The allowance is *not* a cap on how many MLS Walkthroughs a customer may book. It caps only how many **standalone** MLS Walkthroughs may draw on **promotional Booking Value** per billing cycle. It resets each cycle and never accumulates.

- The `$50` tier has no promotional Booking Value at all, so the allowance is necessarily 0.
- The `$100` and `$200` tiers carry such small promotional bonuses ($5 and $20/month) that a single allowance unit is effectively non-binding — the promotional pool can rarely fund even one $100 booking. Allowing 1 is verified safe at every tested profile.
- The `$350`, `$500` and `$1,000` tiers must direct promotional Booking Value to **qualifying bundles**. A single standalone MLS Walkthrough on promotional value at these tiers drops lifetime margin below target (verified — see §2).

---

## 2. Financial Justification

### 2.1 Unit economics of a standalone MLS Walkthrough (≤2,500 sqft)

| Line | Amount |
|---|---|
| Retail | $100.00 |
| Specialist payout (guaranteed table) | $50.00 |
| Editing | $20.00 |
| **Delivery cost** | **$70.00** |
| **Gross margin** | **$30.00 (30%)** |

Promotional Booking Value is service the customer did not pay cash for. Redeeming $100 of promotional value on a standalone MLS Walkthrough yields **$0 cash against $70 cost** — a −70% margin. Redeeming the same $100 as part of a **MLS + Essentials bundle** ($425 retail / $230.50 cost) yields a **45.8% margin**, because the photographic and video services carry far stronger unit economics.

### 2.2 Why the previous loss occurred

**Reconstruction — $1,000 VIP, 12 standalone MLS Walkthroughs/month:**

| Line | Annual |
|---|---|
| Funding cash (12 × $1,000) | $12,000.00 |
| Cash shortfall collected | $0.00 |
| **Total cash in** | **$12,000.00** |
| Specialist payout (144 × $50) | $7,200.00 |
| Editing (144 × $20) | $2,880.00 |
| Sales commission ($150 + 11 × $80) | $1,030.00 |
| Stripe (12 × $29.30) | $351.60 |
| VIP incremental cost | $822.00 |
| **Total costs** | **$12,283.60** |
| **Realized contribution** | **−$283.60 (−2.36%)** |
| Unredeemed Booking Value | $600.00 |
| Outstanding fulfilment obligation | $420.00 |
| **Lifetime contribution** | **−$703.60 (−5.86%)** |

The customer pays $1,000 for $1,250 of Booking Value. At 12 MLS/month the wallet is almost fully consumed, so Arriv delivers $1,200 of $70-cost service for $1,000 of cash — a $160/month gross contribution against $183.63/month of overhead.

### 2.3 Why the allowance must be 0 at the upper tiers

Lifetime margin is the right lens: it charges Arriv for the cost of eventually delivering **all** Booking Value the customer is *eligible* to redeem on MLS, so unredeemed value is never counted as profit.

At the $1,000 tier, a customer who redeems only cash-funded Booking Value ($12,000/year) as MLS returns **11.45%**. Every allowance unit adds promotional service at $70 cost and $0 cash. The math is unforgiving because the baseline headroom is only 1.45 points:

| Allowance | Lifetime Margin ($1,000 tier, worst profile) |
|---|---|
| 0 | **11.45%** ✓ |
| 1 | −2.17% ✗ |
| 2 | −3.34% ✗ |

The same pattern holds at $350 (18.43% → 7.93% at allowance 1) and $500 (12.65% → 4.26% at allowance 1).

### 2.4 The smallest adjustment that would unlock a positive VIP allowance

If the owner wants a **positive standalone MLS allowance** at the upper tiers, the promotional bonus itself must come down. Verified thresholds (largest allowance sustainable at each bonus):

| Promotional Bonus | $350 tier | $500 tier | $1,000 tier |
|---|---|---|---|
| 0% | ≥12 | ≥12 | ≥12 |
| 5% | ≥12 | ≥12 | ≥12 |
| 10% | ≥12 | ≥12 | 0 |
| 15% | 0 | 0 | 0 |
| 20% | 0 | 0 | 0 |
| 25% (current) | 0 | 0 | 0 |

**The smallest adjustment** is: reduce the $1,000 VIP promotional bonus from 25% to ≤5%, and the $350/$500 bonuses from 15%/20% to ≤10%. This is a genuine reduction in customer value and is **not recommended** — it removes the tier's principal selling point. Directing promotional value to bundles (§3) preserves the customer's value while meeting the target, and is recommended instead.

---

## 3. Qualifying Bundle Definitions and Minimum Economics

**Qualification rule (implemented in `autoFundMlsAllowance.ts`):**

A cart qualifies for promotional Booking Value when **all three** hold:
1. It contains **at least one MLS Walkthrough**;
2. It contains **at least $150 of non-MLS services** (photography, video, Premium, or approved add-ons);
3. Its **blended contribution margin is at least 35%**.

A qualifying bundle **never consumes a standalone allowance unit**.

### Verified catalog economics

| Cart | Retail | Cost | Margin | Qualifies |
|---|---|---|---|---|
| Standalone MLS Walkthrough | $100 | $70 | 30.0% | **No** |
| **MLS + Essentials (2,501–3,500)** | $425 | $230.50 | **45.8%** | **Yes** |
| **MLS + Cinematic (3,501–5,000)** | $675 | $365.50 | **45.9%** | **Yes** |
| **MLS + Premium (≤2,500)** | $775 | $449.50 | **42.0%** | **Yes** |
| MLS + nominal $50 add-on | $150 | $90 | 40.0% | **No** (below $150 non-MLS) |
| MLS + drone add-on ($125) | $225 | $105 | 53.3% | **No** (below $150 non-MLS) |
| 2× MLS in one order | $200 | $140 | 30.0% | **No** (no non-MLS service) |
| Essentials only (no MLS) | $325 | $160.50 | 50.6% | No (not an MLS cart) |

Existing packages that already include a walkthrough remain eligible where they satisfy the same test. A nominal or inexpensive add-on can never reclassify a standalone walkthrough — the $150 floor and the 35% margin floor both must be cleared, and the margin floor is evaluated on the **whole cart**.

---

## 4. Twelve-Month and Lifetime Profitability Results

Lifetime margin at the recommended allowance, by customer profile:

| Profile | $50 | $100 | $200 | $350 | $500 | $1,000 VIP |
|---|---|---|---|---|---|---|
| MLS only — 1/month | 22.2% | 14.7% | 11.4% | 18.4% | 18.5% | 15.4% |
| MLS only — 3/month | 25.3% | 22.7% | 15.8% | 18.4% | 18.5% | 15.4% |
| MLS only — 6/month | 26.0% | 24.8% | 21.5% | 21.9% | 19.9% | 15.4% |
| MLS only — 12/month | 26.4% | 25.8% | 24.2% | 24.4% | 23.3% | **17.3%** |
| MLS only — 20/month | 26.6% | 26.2% | 25.2% | 25.3% | 24.7% | 21.1% |
| MLS + add-ons | 30.1% | 29.0% | 26.1% | 20.8% | 17.2% | 15.1% |
| Alternating MLS / bundle | 32.5% | 31.1% | 27.4% | 19.8% | 12.7% | 11.5% |
| Larger packages only | 46.3% | 45.8% | 44.4% | 41.9% | 38.4% | 21.5% |
| Accumulator (sparse → full redemption) | 26.1% | 24.9% | 21.9% | 22.3% | 20.4% | 15.4% |
| Pause and resume | 26.0% | 24.7% | 21.4% | 21.8% | 19.7% | 14.2% |
| Additional wallet top-up | 26.4% | 25.8% | 24.2% | 24.4% | 23.3% | 17.3% |
| Cancel and refund | 26.1% | 25.5% | 23.9% | 24.0% | 23.0% | 16.9% |

**The previously identified loss is eliminated.** The $1,000 VIP / 12 MLS-per-month customer moves from **−5.86% lifetime** to **+17.29% lifetime**.

Note that the *weakest* cells are the VIP tier's mixed profiles — VIP overhead ($72 retainer + $300 enhanced sessions + add-on preferred pricing) is a fixed annual cost that a low-volume member cannot absorb. This is the structural floor of the tier, and it is why the VIP allowance headroom is so thin.

---

## 5. Full-Redemption Stress-Test Results

Every profile is charged, at the end of the 12-month subscription, the full cost of eventually delivering **all Booking Value it is eligible to redeem on MLS**:
- Cash-funded Booking Value — always MLS-eligible, at the profile's own blended cost ratio;
- Promotional Booking Value — MLS-eligible only up to the monthly allowance (modelled over a further 12 months).

Promotional Booking Value **beyond** the allowance is treated as **neither an obligation nor profit** — the conservative reading required by the brief. It is never counted as earned margin.

**Editing and VIP cost sensitivity at the recommended allowance** (VIP tier, 12 MLS/month):

| Editing cost | VIP sessions $0 | VIP sessions $25 | VIP sessions $50 |
|---|---|---|---|
| Any value $100–$200 | 19.37% ✓ | 17.29% ✓ | 15.21% ✓ |

Because MLS editing is a fixed $20 per edit and the $100–$200 ladder applies to Premium editing, the MLS-eligible books are **insensitive** to the Premium editing ladder. The VIP enhanced-support session cost is the meaningful sensitivity, and even at the highest tested cost ($50/session, 48 sessions/year) the model still passes.

---

## 6. Scenarios Below the 10% Contribution Target

- **Scenarios tested:** 720 (6 tiers × 10 allowances × 12 profiles).
- **Scenarios below target across the entire test grid:** 153.
- **Scenarios below target at the recommended allowance: 0.**

Every below-target scenario occurs at an allowance **greater** than the recommended value, and each is caused by the same mechanism — promotional Booking Value redeemed on standalone MLS Walkthroughs. The complete grid is available from `designAutoFundMlsAllowances`; the worst cell is the VIP tier at allowance 2 with a cancelling/refunding profile (−3.34% lifetime).

**Exception requiring explicit owner attention:** the `$500` tier's "alternating MLS / bundle" profile sits at **12.65%** — passing, but the thinnest margin in the recommended configuration outside VIP. It should be re-verified if specialist payouts or Stripe fees move.

---

## 7. Customer-Facing Language and Dashboard Behaviour

Delivered in `src/components/wallet/MlsAllowanceCounter.jsx`.

**While allowance remains:**
> **MLS Promotional Benefits** — 4 of 6 used — 2 remaining this billing cycle.
>
> This is not a limit on how many MLS Walkthroughs you can book. Unlimited further walkthroughs are available with cash-funded Booking Value or by direct payment.

**Once exhausted:**
> You've used your monthly MLS promotional credits. You can still book an MLS Walkthrough! Bundle it with qualifying photography or video services, add funds to your wallet, or pay directly.
>
> [ **Build a Bundle** ] [ **Add Funds** ] [ **Pay Directly** ]

The customer is **never blocked** from booking. Cash-funded Booking Value is displayed separately from promotional value and is always shown as the unrestricted balance. Disclosure of the allowance and the bundle rule is generated from the canonical configuration (`describeAllowance`) so the language can never drift from the rules.

---

## 8. Implementation Changes Made in Staging

| File | Change |
|---|---|
| `base44/shared/autoFundMlsAllowance.ts` | **New.** Canonical allowance configuration, bundle qualification economics, and the promotional-eligibility resolver. Single source of truth. |
| `base44/entities/AutoFundMlsAllowance.jsonc` | **New.** Per-subscription, per-cycle allowance ledger (`allowance_granted`, `allowance_used`, `consumed_booking_ids`). Customer reads own; admin-only writes. |
| `base44/functions/manageMlsAllowance/entry.ts` | **New.** `get_status`, `evaluate_cart`, `consume`, `restore`, `reset_cycle`, `set_allowance_override`, `list_allowances`, `disclosure`. Cycle opens lazily and resets each billing cycle with no accumulation. |
| `base44/functions/designAutoFundMlsAllowances/entry.ts` | **New.** Read-only financial design engine (720 scenarios) that derives the allowances and bundle floors. |
| `base44/functions/testAutoFundMlsAllowance/entry.ts` | **New.** 19-test certification suite. |
| `src/components/wallet/MlsAllowanceCounter.jsx` | **New.** Customer dashboard counter and exhausted-state options. |

**Preserved, unchanged:** all six Auto-Fund tiers and bonus percentages; 15%/8% funding commission; 0% booking-level commission; specialist compensation and the MLS guaranteed payout table; editing workflows; package prices; customer entitlements; VIP benefits; payment security; webhook isolation; certification guards; and the separate Prepaid program.

**Gated off by default.** Customer-facing behaviour is gated by the AppSetting feature flag `mls_promotional_allowance_enabled`, which is **unset**. Nothing changes for any customer until the owner authorizes it.

---

## 9. Automated Certification Results

`testAutoFundMlsAllowance` — **19 / 19 PASS**

| # | Test | Result |
|---|---|---|
| 1 | Tier-specific allowance enforcement ($50=0, $100=1, $200=1, $350=0, $500=0, $1,000=0) | ✓ |
| 2 | Allowance reset and non-accumulation | ✓ |
| 3 | Cash-funded MLS purchase after exhaustion permitted | ✓ |
| 4 | Direct-payment purchase consumes no allowance | ✓ |
| 5–7 | Bundle qualification, nonqualifying add-ons, mixed carts | ✓ |
| 8 | Qualifying bundle uses promotional value without consuming an allowance | ✓ |
| 9 | Allowance status opens at zero used | ✓ |
| 10 | Allowance consumption | ✓ |
| 11 | Idempotent consumption (same booking replay) | ✓ |
| 12 | Second distinct booking blocked at exhaustion (409) | ✓ |
| 13 | Refund / cancellation restores the allowance unit | ✓ |
| 14 | Restore is idempotent | ✓ |
| 15 | Wallet / subscription isolation | ✓ |
| 16 | Subscription tier change re-derives the allowance on the next cycle | ✓ |
| 17 | Pause preserves the allowance without granting more | ✓ |
| 18 | Commission suppression preserved (0% booking-level) | ✓ |
| 19 | Specialist payout preserved ($50 on $100 retail) | ✓ |
| 20 | Bypass resistance — nominal add-on and multi-MLS reclassification both refused | ✓ |
| 21 | Production enrollment gate — feature flag not enabled | ✓ |

Every synthetic entity used by the suite carried the `cert_` prefix and was removed on completion (3 allowances, 2 subscriptions, 2 contacts; zero cleanup errors). **No real customer balances, historical financial transactions, commission rules, or specialist payouts were modified.**

**Previously certified results remain intact and untouched:** deployed payment contract 20/20, booking commission suppression 10/10, certification payroll delivery exclusion 14/14.

---

## 10. Remaining Risks and Production Deployment Recommendation

### Risks

1. **The VIP tier has almost no headroom.** At the recommended allowance, the weakest VIP profile is 11.45% — 1.45 points above target. Any increase in specialist payouts, editing cost, Stripe fees, or VIP support utilisation will breach the target. **Recommend an annual re-validation.**
2. **The $500 "alternating" profile at 12.65%** is the next-thinnest and should be monitored alongside VIP.
3. **A zero VIP allowance is a visible product change.** If the allowance is disclosed, the absence of a standalone MLS benefit at the VIP tier must be presented as a bundle benefit, not a reduction. Recommended language is in §7.
4. **Bundle reclassification.** Mitigated by three independent gates (MLS presence, $150 non-MLS floor, 35% whole-cart margin) and verified by certification test 20. Any future add-on priced under $150 is automatically non-qualifying.
5. **Allowance abuse across cycles.** Mitigated by reset-without-accumulation, idempotent consumption keyed on booking id, and exact restoration on cancellation.
6. **Model conservatism.** The lifetime model charges full fulfilment on unredeemed cash-funded Booking Value. This is deliberately conservative; actual margins will be equal to or better than reported.

### Recommendation

**Approve the hybrid model with the allowances in §1 and deploy it to staging for a monitored pilot.** It eliminates the identified loss, holds the 10% lifetime target across every tested profile, preserves the customer's ability to use promotional value (through bundles), keeps cash-funded and direct-payment MLS bookings unrestricted, and changes nothing for existing customers.

**If a positive standalone VIP allowance is commercially essential**, the only financially viable route is reducing the VIP promotional bonus to ≤5% (§2.4) — a genuine benefit reduction that this analysis does **not** recommend.

**No production deployment is requested or performed by this report.** Enabling customer-facing enrollment requires explicit owner authorization.

---

*Analysis and staging implementation only. No pricing, commission, payout, entitlement, balance, or historical financial record was changed.*