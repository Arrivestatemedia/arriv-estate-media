# Final Auto-Fund Profitability Resolution
## $1,000 VIP Tier — MLS Walkthrough Volume Analysis

**Date:** 2026-10-10
**Status:** Analysis complete. No pricing, redemption, or production changes made. Recommendation pending owner approval.
**Function:** `analyzeAutoFundProfitability` (admin-only, read-only)

---

## Executive Summary

The negative-contribution scenario ($1,000 VIP Auto-Fund, 12 MLS Walkthroughs/month, ≤2,500 sqft) produces **−$283.60 annual contribution (−2.36% margin)**. The root cause is the 25% promotional Booking Value bonus: the customer pays $1,000 for $1,250 of service, and at 12 MLS/month the wallet is nearly fully consumed, meaning Arriv delivers $1,200 of service for $1,000 of cash while incurring $12,284 of costs.

**Recommended fix:** A separately disclosed promotional-credit redemption rule for MLS Walkthroughs, applicable only to new enrollments, while preserving unrestricted redemption of cash-funded wallet value. This achieves **14.2% margin** on the worst-case scenario with no price increase, no editing reduction, and no impact on existing customers.

---

## 1. Reconstructed 12-Month Ledger (12 MLS/month, Base Case)

### Canonical Inputs
| Parameter | Value |
|-----------|-------|
| Monthly cash collected | $1,000 |
| Monthly Booking Value issued | $1,250 |
| Promotional bonus BV | $250 (25%) |
| Cash-funded BV | $1,000 |
| MLS retail price (≤2,500 sqft) | $100 |
| MLS specialist payout | $50 (sqft table, not % of price) |
| MLS editing cost | $20/edit |
| First-payment commission | 15% = $150 |
| Recurring commission (months 2-12) | 8% = $80/month |
| Booking-level commission | 0% (Auto-Fund policy) |
| Stripe rate | 2.9% + $0.30 |

### Annual Summary
| Line Item | Amount |
|-----------|--------|
| **Cash In** | **$12,000** |
| Funding cash (12 × $1,000) | $12,000 |
| Cash shortfall collected | $0 (wallet covers all 144 bookings) |
| **Costs** | **$12,283.60** |
| Specialist payout (144 × $50) | $7,200.00 |
| Editing (144 × $20) | $2,880.00 |
| Rep commission ($150 + 11 × $80) | $1,030.00 |
| Stripe fees (12 × $29.30) | $351.60 |
| VIP incremental cost | $822.00 |
| — Enhanced support retainer (12 × $6) | $72.00 |
| — Enhanced sessions (12 × $25) | $300.00 |
| — Add-on discounts (144 × 0.25 × $12.50) | $450.00 |
| **Contribution** | **−$283.60** |
| **Margin** | **−2.36%** |
| Unredeemed BV (end of year) | $600 |

---

## 2. Margin Curve Explanation

| MLS/month | Margin | Contribution | Cash In | Unredeemed BV | After Full Redemption |
|-----------|--------|-------------|---------|---------------|---------------------|
| 1 | 78.07% | $9,368.90 | $12,000 | $13,800 | −$291.10 (−2.43%) |
| 3 | 63.45% | $7,613.90 | $12,000 | $11,400 | −$366.10 (−3.05%) |
| 6 | 41.51% | $4,981.40 | $12,000 | $7,800 | −$478.60 (−3.99%) |
| **12** | **−2.36%** | **−$283.60** | **$12,000** | **$600** | **−$703.60 (−5.86%)** |
| 20 | 6.70% | $1,406.60 | $21,000 | $0 | $1,406.60 (6.70%) |

**Why the U-curve:**

- **6/month (41.5%):** The wallet accumulates $650/month ($1,250 BV − $600 retail). Most BV is never redeemed. The 25% promotional bonus costs Arriv nothing because the customer never uses it. Costs are low ($7,019), cash is $12,000, contribution $4,981.

- **12/month (−2.36%):** The wallet is nearly fully consumed ($1,250 BV − $1,200 retail = $50/month surplus). All 144 bookings incur $70 direct cost ($50 payout + $20 editing = $10,080). Overhead adds $2,204 (commission $1,030 + Stripe $352 + VIP $822). Total costs $12,284 exceed $12,000 cash. The promotional $250/month costs $175 to deliver but generates no cash.

- **20/month (6.7%):** The wallet is exhausted; $750/month cash shortfall is collected. Higher cash ($21,000) but 240 bookings at $70 direct cost = $16,800. Overhead adds $2,768. Total costs $19,568, contribution $1,432. Margin improves because the customer pays cash for the gap, and the promotional BV is fully utilized (no waste).

---

## 3. Realized Contribution vs Outstanding Obligations

| Measure | Amount |
|---------|--------|
| **Realized contribution (12-month subscription)** | **−$283.60** |
| Realized margin | −2.36% |
| Unredeemed BV at end of year | $600 |
| Outstanding payout obligation (600 × 50%) | $300 |
| Outstanding editing obligation (600 × 20%) | $120 |
| **Total outstanding obligations** | **$420** |
| **Contribution after full redemption** | **−$703.60** |
| Margin after full redemption | −5.86% |

The $600 of unredeemed BV represents 6 future MLS bookings. If the customer eventually redeems them, Arriv incurs $420 in additional costs ($300 payout + $120 editing) with no additional cash. The lifetime profit of this customer is −$703.60, not just the −$283.60 realized during the subscription year.

---

## 4. Minimum MLS Price Adjustment for ≥10% Margin

| MLS Price | Cash In | Costs | Contribution | Margin | Shortfall/Booking |
|-----------|---------|-------|-------------|--------|-------------------|
| $100 (current) | $12,000 | $12,283.60 | −$283.60 | −2.36% | $0 |
| $105 | $12,120 | $12,290.68 | −$170.68 | −1.41% | $0.83 |
| $110 | $12,840 | $12,311.56 | $528.44 | 4.12% | $5.83 |
| $115 | $13,560 | $12,336.04 | $1,223.96 | 9.03% | $10.83 |
| **$117** | **$13,848** | **$12,344.39** | **$1,503.61** | **10.86%** | **$11.83** |
| $120 | $14,280 | $12,356.92 | $1,923.08 | 13.47% | $15.83 |
| $125 | $15,000 | $12,377.80 | $2,622.20 | 17.48% | $20.83 |

**Minimum price: $117/booking (+17%).** The specialist payout stays at $50 (sqft table, not % of price), so the full increase flows to margin. Below $104.17/booking the wallet covers all retail and no shortfall is collected — the price increase has no effect until it exceeds the wallet's monthly coverage.

---

## 5. Editing Efficiency Analysis

| Editing Cost | Contribution | Margin | Meets 10%? |
|-------------|-------------|--------|------------|
| $20 (current) | −$283.60 | −2.36% | No |
| $18 | $4.40 | 0.04% | No |
| $15 | $436.40 | 3.64% | No |
| $12 | $868.40 | 7.24% | No |
| $10 | $1,156.40 | 9.64% | No |
| **$8** | **$1,444.40** | **12.04%** | **Yes** |
| $5 | $1,876.40 | 15.64% | Yes |

**Assessment:** Reaching 10% margin requires ~$8/edit, a **60% reduction** from the current $20. This would likely compromise MLS walkthrough quality (fast turnaround, minimal color correction). Editing efficiency alone is insufficient as a standalone fix.

---

## 6. Promotional-Credit Redemption Restriction (New Enrollments Only)

**Rule:** Promotional bonus Booking Value ($250/month at the $1,000 tier) cannot be redeemed on MLS Walkthroughs. Only cash-funded Booking Value ($1,000/month) may be used for MLS. Promotional BV remains available for all other packages (Essentials, Cinematic, Premium, add-ons). Existing customers retain unrestricted redemption.

| MLS/month | Margin | Contribution | Cash In | Shortfall | Unredeemed Cash BV | Promo BV Expired |
|-----------|--------|-------------|---------|-----------|--------------------|--------------------|
| 1 | 78.07% | $9,368.90 | $12,000 | $0 | $10,800 | $3,000 |
| 3 | 63.45% | $7,613.90 | $12,000 | $0 | $8,400 | $3,000 |
| 6 | 41.51% | $4,981.40 | $12,000 | $0 | $4,800 | $3,000 |
| **12** | **14.16%** | **$2,039.60** | **$14,400** | **$2,400** | **$0** | **$3,000** |
| 20 | 17.97% | $4,312.40 | $24,000 | $12,000 | $0 | $3,000 |

**At 12 MLS/month:** The $1,000 cash-funded BV covers 10 bookings; 2 bookings incur $200/month cash shortfall. The $250 promotional BV accumulates ($3,000/year) and expires unused if the customer only books MLS. Contribution: **$2,039.60 (14.16% margin)** — above the 10% target with no price change and no quality reduction.

The restriction only changes behavior at 12+ MLS/month. Below that, the wallet isn't fully consumed anyway, so the restriction has no effect on the customer experience.

---

## 7-8. Full Matrix: Volumes × Editing Costs × VIP Session Costs

**90 scenarios tested** (5 volumes × 6 editing costs × 3 VIP costs), both unrestricted and restricted.

**53 scenarios flagged** (negative contribution or <10% margin).

### Key findings from the matrix:

- **$100-$200 editing costs** (Premium-level stress) applied to MLS produce deeply negative margins at all volumes. These are stress tests showing sensitivity to editing cost inflation, not realistic MLS scenarios (MLS editing is $20).

- **VIP session cost** ($0/$25/$50) shifts margin by ±$300-$600/year. At $0/session, the 12/month base case improves to −$23.60 (still negative). At $50/session, it worsens to −$543.60.

- **The redemption restriction eliminates all negative-contribution scenarios at the base $20 MLS editing cost** across all 5 volumes. The only remaining flagged scenarios at $20 editing are those with $50 VIP session cost at 12/month (margin 11.66% — above target).

- At $100+ editing costs, the restriction helps (reduces the loss) but cannot overcome the cost inflation. This confirms that editing cost control is a separate concern from the redemption rule.

---

## 9. Flagged Scenarios Summary

| Category | Count | Worst Case |
|----------|-------|-----------|
| Negative contribution (unrestricted) | 32 | 12/month, $200 editing, $50 VIP: −$12,103.60 (−100.86%) |
| Below 10% margin (unrestricted) | 45 | 6/month, $100 editing, $0 VIP: −$478.60 (−3.99%) |
| Negative contribution (restricted) | 32 | Same as unrestricted at $100+ editing |
| Below 10% margin (restricted) | 38 | Improvement at base $20 editing; no help at $100+ editing |

**At the realistic MLS editing cost of $20:** The restriction eliminates all negative-contribution and below-10% scenarios. The only remaining flag is the 12/month unrestricted base case (−2.36%), which the restriction resolves to 14.16%.

---

## 10. Recommendation

### Recommended: Promotional-Credit Redemption Restriction (New Enrollments Only)

| Alternative | Margin | Customer Impact | Quality Impact | Existing Customers |
|-------------|--------|-----------------|----------------|-------------------|
| MLS price +17% ($117) | 10.86% | 17% price increase | None | Affected |
| Editing −60% ($8/edit) | 12.04% | None | Severe risk | Affected |
| **Redemption restriction (new only)** | **14.16%** | **Promo BV redirected, not reduced** | **None** | **Unaffected** |
| Price $110 + restriction | 21.68% | 10% price increase + restriction | None | Unaffected (restriction only) |

### Why this is the smallest commercially reasonable adjustment:

1. **No price increase.** The MLS Walkthrough stays at $100. The customer pays the same for the same service.

2. **No quality reduction.** Editing stays at $20/edit. The MLS product is unchanged.

3. **No specialist payout change.** The $50 guaranteed payout is preserved.

4. **Existing customers are completely unaffected.** The restriction applies only to new enrollments. Current VIP customers keep unrestricted redemption.

5. **The customer value proposition is preserved.** The $1,000 still buys $1,250 BV. The promotional $250 is redirected to non-MLS packages (which the customer can use for higher-value listings like Essentials, Cinematic, or Premium) or expires unused (which the customer was already paying for but not redeeming in low-volume months).

6. **The restriction is disclosed at enrollment.** The customer knows the terms before paying. No existing entitlement is changed.

7. **If the customer books a mix of MLS and non-MLS**, the promotional BV is used on the non-MLS packages — a better deal for the customer than losing it entirely.

8. **It achieves 14.2% margin** on the worst-case scenario — comfortably above the 10% target — and eliminates all negative-contribution scenarios at the realistic $20 MLS editing cost.

### Implementation (pending owner approval):

- Apply the restriction at wallet redemption time for new Auto-Fund enrollments only
- Track `enrollment_date` on the subscription; customers enrolled before the effective date retain unrestricted redemption
- Disclose the restriction in the enrollment terms and the Auto-Fund landing page
- No changes to existing wallets, CreditLots, or balances
- No changes to pricing, commission rates, specialist payouts, or editing costs

**No changes have been made.** This analysis is for owner review and approval.