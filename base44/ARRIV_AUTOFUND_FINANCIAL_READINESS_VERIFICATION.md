# ARRIV ESTATE MEDIA — CORRECTED AUTO-FUND FINANCIAL VERIFICATION

**Date:** 2026-10-11
**Model:** `autofund_financial_readiness_v2_20261011` (read-only, admin-only)
**Core:** the single certified simulation core (`base44/shared/autoFundSimulator.ts`)
**Status:** ANALYSIS ONLY. Enrollment stays disabled. No price, tier, benefit, commission or feature flag was changed. No customer was enrolled or charged.

---

## 1. Price verification — production, configuration, simulation

| Where | Value | Detail |
|---|---|---|
| **Production (published)** | **$100** | The active `MediaPricingConfig` record is `AEM_MEDIA_PRICING_V1`, `is_active: true`, effective 2026-09-07. Every booking path reads the active record. |
| **Configuration (approved)** | **$120** | A `AEM_MEDIA_PRICING_V2` record exists, effective 2026-10-10, TIER_1 `mls_walkthrough: 120` — but `is_active: false`. |
| **Simulation** | **$100** | `MLS_PRICING_VERSION_LIVE = 'V1'`, `MLS_PRICE_STANDARD_LIVE = 100`. |

### Discrepancy found

**The owner-approved $120 was never activated.** The $120 record was written on 2026-10-10 (the Base44 prompt the owner recalls), so the change was *prepared* but the activation step was never completed: its `is_active` flag is `false`, both on the record and inside its own stored config. Production therefore still resolves **$100**.

Production and simulation **agree** at $100 — they are not in conflict. The conflict is between the **approval** and the **configuration**: the approved price exists as an inactive record. The $120 calculation below is therefore a *scenario*, not the live position.

---

## 2. Corrected tier set (read from the authoritative configuration)

`AUTO_FUND_AMOUNT_OPTIONS = [150, 250, 350, 500, 1000]`. The $50 / $100 / $200 tiers are **excluded** — retired from new enrollment, no longer part of the program.

| Tier | Monthly funding | Promotional Booking Value / month | Bonus | Booking Value issued / month | Contractual fee | Chargeable today | Total recurring charge |
|---|---|---|---|---|---|---|---|
| $150 Starter | $150 | $7.50 | 5% | $157.50 | $0 | $0 | $150 |
| $250 Growth | $250 | $25.00 | 10% | $275.00 | $0 | $0 | $250 |
| $350 Professional | $350 | $52.50 | 15% | $402.50 | $25 | $0 | $375 |
| $500 Premier | $500 | $100.00 | 20% | $600.00 | $25 | $0 | $525 |
| $1,000 VIP | $1,000 | $250.00 | 25% | $1,250.00 | $25 | $0 | $1,025 |

Membership billing is switched off, so the currently chargeable fee is $0 on every tier. Funding lots carry a 12-month validity.

---

## 3. PASS criterion applied

**PASS = contribution is a positive dollar amount** after media specialist compensation, editing labour with employer payroll burden, QC, payment processing, support, refunds, chargebacks with unrecoverable commissions, and the full eventual redemption of every outstanding cash-funded and promotional balance. Margin percentages are reported but no longer decide PASS/FAIL.

**Commission reversal, verified in code.** Refunds and chargebacks reverse the commission attributable to the reversed revenue, calculated from the **original** compensation event — proportional to the refunded commissionable **cash**, never to promotional Booking Value — capped cumulatively at the original commission, recorded as immutable `COMMISSION_REVERSAL` events and delivered to Arriv Pay. **Estate Media does not debit employees or alter completed payroll**, so a commission already paid out **may not be recovered**. The conservative and maximum-utilisation scenarios therefore carry unrecovered commission as a cost: an unrecovered funding commission is never credited back, and the simulator's refund credit for booking commission is undone.

---

## 4. Results at $100 — the published price

| Tier | Expected | Conservative (2 chargebacks/yr, unrecovered commission) | Maximum benefit utilisation (full VIP support, 4 chargebacks/yr) |
|---|---|---|---|
| $150 Starter | **+$36.82** (6.21%) PASS | −$320.53 FAIL | −$650.53 FAIL |
| $250 Growth | **+$20.13** (3.50%) PASS | −$643.84 FAIL | −$1,173.84 FAIL |
| $350 Professional | **+$27.00** (4.72%) PASS | −$751.94 FAIL | −$1,476.94 FAIL |
| $500 Premier | −$26.03 (−4.96%) FAIL | −$1,482.90 FAIL | −$2,512.90 FAIL |
| $1,000 VIP | −$931.04 (−7.57%) FAIL | −$3,764.10 FAIL | −$6,694.10 FAIL |

At the published price, **three of five tiers are contribution-positive in the expected scenario; none survives the conservative or maximum-utilisation scenario.**

---

## 5. Results at $120 — approved, NOT activated

| Tier | Expected | Conservative (2 chargebacks/yr, unrecovered commission) | Maximum benefit utilisation (full VIP support, 4 chargebacks/yr) |
|---|---|---|---|
| $150 Starter | **+$141.34** (19.84%) PASS | −$60.98 FAIL | −$353.09 FAIL |
| $250 Growth | **+$127.64** (18.37%) PASS | −$224.03 FAIL | −$646.20 FAIL |
| $350 Professional | **+$122.22** (17.65%) PASS | −$426.31 FAIL | −$1,046.91 FAIL |
| $500 Premier | **+$72.19** (11.19%) PASS | −$855.38 FAIL | −$1,815.50 FAIL |
| $1,000 VIP | **+$25.13** (2.45%) PASS | −$1,301.70 FAIL | −$4,231.70 FAIL |

**At the approved price every tier, including VIP, is contribution-positive in the expected scenario after all costs and full redemption.** VIP is positive but thin: $25.13 on $1,025 of revenue. The owner's stated acceptance of a lower VIP margin is satisfied in the expected scenario — but only there.

---

## 6. Which risk moves each tier (measured separately, at $120)

| Tier | Cost basis (expected → conservative) | Chargebacks + unrecovered commission | VIP support utilisation |
|---|---|---|---|
| $150 | −$37.32 | −$165.00 | n/a |
| $250 | −$37.31 | −$265.00 | n/a |
| $350 | −$37.32 | −$436.57 | n/a |
| $500 | −$37.31 | −$815.60 | n/a |
| $1,000 VIP | −$64.79 | −$779.73 | −$75.00 (12 → 48 sessions) |

**Chargebacks are the dominant risk, not the cost basis.** A single year containing two disputed charges with unrecovered commission costs more than the entire expected contribution of every tier. That is what flips all five tiers negative in the conservative scenario. The editing-cost uncertainty is the second risk and is much smaller in the expected-to-conservative band than previously reported ($37–$65 across tiers, because the two bases differ by only $6.22 per walkthrough).

---

## 7. Negative scenarios identified explicitly

Twelve negative tier/scenario combinations at the published price, and all five tiers negative in two of three scenarios at both prices. Worst individual customer patterns at the conservative cost basis:

| Tier | Loss-making patterns (of 17) | Worst patterns |
|---|---|---|
| $150 | 1 | churn after 1 month: −$0.50 |
| $250 | 12 | refunds −$83.84; 1 walkthrough/month −$51.46 |
| $350 | 4 | 1 or 3 walkthroughs/month, or full wallet spend: −$26.94 each |
| $500 | 13 | full wallet spend: −$452.90; refunds −$440.80 |
| $1,000 VIP | 15 | refunds −$1,890.70; 1 walkthrough/month −$1,755.34 |

The pattern that fails most often is heavy standalone MLS redemption — not churn. A member who uses the walkthrough allowance fully is the tier's worst customer at the conservative cost basis.

---

## 8. Remaining financial risks

1. **Chargebacks are unmeasured and are now the single largest exposure.** Two disputed charges a year, with commission already paid out and not recovered, exceeds the expected contribution of every tier. Chargeback frequency must be measured, and the recoverability of an already-paid commission must be confirmed with Arriv Pay before launch.
2. **No MLS Walkthrough has ever been produced.** Editing minutes remain unobserved; the expected basis is an owner-approved planning assumption, not a measurement.
3. **The employer payroll burden and QC cost per walkthrough are not configured anywhere in the app.**
4. **The approved $120 is not live.** Every figure in section 5 describes a configuration change that has not been activated.
5. **Membership billing is off**, so the $25 fee is currently $0. Leaving it off removes the fee revenue the $350 / $500 / VIP tiers were priced around.
6. **VIP is thin.** Positive at $25.13 on $1,025 in the expected scenario, negative in both stress scenarios. Full contractual support utilisation (48 sessions) costs a further $75, and a heavy-usage VIP member is negative before any chargeback.
7. **VIP enhanced-support utilisation is unmeasured** (12 of a 48-session entitlement assumed).
8. **The 7-per-cycle VIP promotional allowance is non-binding** and does not reduce exposure; the promotional pool is exhausted long before the cap is reached.

---

## 9. Statement of what was and was not done

- **Not changed:** the MLS price or pricing version, specialist compensation, editing budgets, any tier, any promotional bonus, any membership fee, any allowance, any commission rate, any feature flag. Enrollment remains disabled; membership billing remains off.
- **Verified by reading:** the active `MediaPricingConfig` record, the inactive V2 record, the tier configuration in `prepaidEngine.ts`, the membership-fee schedule, and the commission reversal logic in `commissionReversalEngine.ts` plus its refund and chargeback call sites.
- **Not written to:** any wallet, lot, ledger, subscription, payment event or historical record.

Analysis only. Final launch authorization remains with the owner.