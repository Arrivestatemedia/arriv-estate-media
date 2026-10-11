# Auto-Fund Financial Certification Reconciliation

**Date:** 2026-10-11
**Trigger:** the five-tier launch certification reported $500 = 4.46% and $1,000 VIP = −2.36%, against previously certified 15.26% and 7.35%.
**Status:** ANALYSIS ONLY. No code, pricing, commission, allowance, enrollment, balance or ledger was changed while producing this reconciliation.

---

## 0. VERDICT

**C — a difference in scenario definitions and assumptions between two different simulators — compounded by B, an invalid cross-harness comparison made by Base44 in the previous report.**

- **Not A.** There is no previously-missed economic problem. The live-$100 failure was already found and disclosed in `ARRIV_AUTOFUND_OWNER_SENSITIVITY_REPORT.md`. VIP at the live $100 price was already negative in **11 of 24** cost combinations, and $500 was already reported as sitting **"exactly on its break-even line"**.
- **Not B as a regression.** Neither simulator regressed. Both reproduce their own earlier outputs exactly.
- **Not D.** No implementation defect. The VIP promotional restriction is enforced at the transaction layer and passes certification 22/22.

**The previously approved and reconciled position is unchanged and is NOT contradicted.** The two figures in the launch report are the **live-$100** result. The 15.26% and 7.35% are the **owner-approved $120** result. They are different price bases, produced by different simulators, and the previous report presented one against the other.

**Your premise is confirmed:** the $500 and $1,000 funding amounts, bonuses, membership fees and approved redemption rules were not changed. Verified below, and the count-cap removal cannot have moved either number.

---

## 1. WHY THE TWO MARGINS CHANGED

Because they were **never the same measurement**. The launch certification used a different simulator from the one that produced 15.26% and 7.35%.

| | Simulator A — produced 15.26% / 7.35% | Simulator B — produced 4.46% / −2.36% |
|---|---|---|
| Function | `optimizeMlsUnitEconomics` (owner-sensitivity + final-certification modules) | `runAutoFundStressTest` |
| **MLS price basis** | **$120 — owner-approved V2** | **$100 — live V1** (`getPriceForSqft`) |
| MLS editing per walkthrough | $18/hr × 60 min × 1.15 burden + $5 QC = **$25.70** | **$20 flat**, no burden, no QC |
| Promotional vs cash Booking Value | **Two separate pools** (`promoPool`, `cashPool`) | **One merged wallet** — not separated |
| Standalone-MLS allowance | Gate exists; run at UNLIMITED, so non-binding | **No concept of an allowance exists** |
| Membership fee | **$25/month collected** for $350+ | **Not modelled at all** |
| VIP promotional restriction | **Modelled ON** (`vip_promo_on_standalone: false`) | **No concept of it exists** |
| Persona set | 15 patterns incl. `churn_after_4`, `refunds`, `accumulator` | 18 patterns, no churn pattern |
| Worst persona at $500 | `churn_after_4` | `mls_6x` |
| Balance close-out | Promotional credit closed at the lowest-margin **permitted** service; cash at the persona's own mix | Unredeemed × 34% payout + unredeemed × editing ratio |

**The single dominant lever is the MLS price basis.** Every other difference either favours simulator B (its editing cost is $5.70/walkthrough cheaper) or is neutral.

### The price mechanism, exactly

At $500/month the customer receives $600 of Booking Value (a $500 deposit plus a $100 promotional bonus).

- **At the live $100:** 6 MLS Walkthroughs cost exactly $600. The wallet covers all six. **Zero shortfall cash is collected.** Total cash for the year: $6,000.
- **At the approved $120:** the same 6 Walkthroughs cost $720. The wallet covers $600 and the customer **pays $120 in cash every month**. Total cash for the year: $7,740.

The $120 price therefore collects **$1,740 more cash a year on the identical pattern**, while the service cost rises only by the Stripe fee on that cash. That single change moves the $500 tier's `mls_6` pattern from **4.46% to 22.34%** on its own.

### What did NOT change

**The removal of the booking-count caps cannot have moved either figure.** Both simulators already ran with no cap:

- Simulator A passes `UNLIMITED` explicitly — `simulate(tier, UNLIMITED, p, e, vip, opts)` (`finalCertification.ts:128`, `ownerSensitivity.ts:158`).
- Simulator B has no allowance concept at all.

Both simulators already stated the standalone-MLS allowance as **"none — unlimited with the customer's own funds"** before the change. The cap removal is therefore financially invisible to both.

---

## 2. VIP PROMOTIONAL BOOKING VALUE ON STANDALONE MLS — VERIFIED BARRED

**Confirmed: VIP promotional Booking Value is never permitted on a standalone MLS Walkthrough.**

| Check | Result |
|---|---|
| Code enforcement present | `autoFundVipEnforcement.ts` + `resolveMlsPromoEligibility` |
| Transaction-layer restriction, no cap path | PASS — `coverage=100% dollar_cap=null pct_cap=null min_cash=null mandatory_split=false` |
| Non-VIP tiers: promotional MLS permitted | PASS — no monthly count cap |
| VIP: promotional barred from standalone MLS, cash-funded path open | PASS |
| VIP: no silent zero — reason documented | PASS — `VIP_PROMO_BARRED_FROM_STANDALONE_MLS` |
| Simulator A models the restriction | Yes — `vip_promo_on_standalone: false` for the VIP tier |
| **Simulator B models the restriction** | **No — the model cannot represent it** |

**The prohibition is correctly implemented and correctly certified.** Simulator B simply has no way to express it: it merges cash-funded and promotional Booking Value into a single untracked balance, so it cannot tell a permitted redemption from a prohibited one.

---

## 3. UNLIMITED STANDALONE BOOKINGS CANNOT CREATE UNLIMITED PROMOTIONAL CREDITS — CONFIRMED

**Confirmed, with one caveat about simulator fidelity.**

Promotional Booking Value is issued **only at funding**, as a fixed percentage of the deposit — `getAutoFundConfig(tier).bonus_booking_value`:

| Tier | Deposit | Bonus % | Promotional Booking Value issued per month |
|---|---|---|---|
| $150 | $150 | 5% | $7.50 |
| $250 | $250 | 10% | $25.00 |
| $350 | $350 | 15% | $52.50 |
| $500 | $500 | 20% | $100.00 |
| $1,000 VIP | $1,000 | 25% | $250.00 |

**Bookings consume promotional credit; they never create it.** No code path issues Booking Value as a function of booking count. The earned-and-outstanding balance is the only source, and it is bounded entirely by how much the customer has funded.

Verified in both simulators: the wallet balance grows only from monthly funding and the one modelled cash top-up. Neither simulatior manufactures credit from bookings, so neither can produce unlimited promotional credit.

**The caveat:** simulator B does not track the promotional balance *separately*, so it cannot demonstrate that promotional value is limited to the outstanding promotional balance — and, as §2 shows, when it spends that balance on a VIP standalone MLS Walkthrough it produces a state the rules forbid. This is a **simulator fidelity gap, not a production defect.** Production tracks promotional and cash-funded credit as separate lots and enforces the restriction at the transaction, which is what the 22/22 transaction-layer certification verifies.

---

## 4. REPRODUCING THE PREVIOUS SCENARIOS

Reproduced by running the harness that produced the approved certification, on your exact previous assumptions — **$18/hour, 60 active minutes, 15% payroll burden, $5 QC** (editing $25.70/walkthrough) — and then re-running the *identical* assumptions at the live $100 price.

| Tier | Assumptions | Worst persona | Worst margin | Contribution | Meets 10%? | Negative patterns |
|---|---|---|---|---|---|---|
| **$500** | **Approved: $120** | `churn_after_4` | **15.26%** | $393.78 | Yes | 0 |
| $500 | Same, live $100 | `churn_after_4` | **0.04%** | $0.90 | No | 0 |
| **$1,000 VIP** | **Approved: $120** | `churn_after_4` | **7.35%** | $301.37 | No (accepted) | 0 |
| $1,000 VIP | Same, live $100 | `churn_after_4` | **−4.96%** | −$203.30 | No | **11** |

**15.26% and 7.35% reproduce exactly.** The approved position is intact.

**And the same model at the live $100 already produces the failure:** $500 at 0.04%, VIP at −4.96% with 11 negative patterns. This was disclosed in the sensitivity report in these words: *"At the live $100 price it does not hold: VIP is negative in 17 of 24 cost combinations, the four entry tiers sit at 5.10%–6.95%, and $500 is exactly on its break-even line at 60 minutes."*

The launch report's **4.46%** and **−2.36%** fall inside that already-disclosed live-$100 band. They are not new information.

For completeness, the other three tiers at the approved $120 are unaffected: **$150 = 19.49%, $250 = 19.01%, $350 = 19.39%.**

---

## 5. LINE-BY-LINE RECONCILIATION

The two flagged scenarios, 12 months. Column B is the simulator that produced the launch report, line-for-line. Column A is the same scenario shape on your approved assumptions.

### 5.1 — $500 tier, `mls_6x`: 6 standalone MLS Walkthroughs per month (72 per year)

| Line | B — live basis ($100, $20 editing, no fee, merged wallet) | A — approved basis ($120, $25.70 editing, $25 fee) |
|---|---|---|
| Customer deposits collected | $6,000.00 | $6,000.00 |
| Membership fees collected | $0.00 | $300.00 |
| Cash shortfall / direct paid | $0.00 | $1,440.00 |
| **Total lifetime cash collected** | **$6,000.00** | **$7,740.00** |
| Promotional credits issued | $1,200.00 | $1,200.00 |
| Promotional credits redeemed | $1,200.00 — on standalone MLS | $1,200.00 — on standalone MLS |
| Outstanding promotional liability | $0.00 | $0.00 |
| Promotional close-out cost | $0.00 | $0.00 |
| Outstanding cash-funded Booking Value | $0.00 | $0.00 |
| Cash-funded close-out cost | $0.00 | $0.00 |
| Specialist payouts | $3,600.00 (72 × $50) | $3,600.00 (72 × $50) |
| Editing labour | $1,440.00 (72 × $20) | $1,850.40 (72 × $25.70) |
| Payroll burden on editing | $0.00 — not modelled | included in $25.70 ($2.70/walkthrough) |
| Quality control | $0.00 — not modelled | included in $25.70 ($5/walkthrough) |
| Sales commission — funding | $515.00 (15% first, 8% × 11) | $515.00 |
| Sales commission — booking | $0.00 | $0.00 |
| Stripe fees | $177.60 (funding only) | $235.26 (funding + fee + shortfall) |
| VIP support expenses | $0.00 — not a VIP tier | $0.00 |
| Refunds and chargebacks | $0.00 | $0.00 |
| **Total lifetime costs** | **$5,732.60** | **$6,200.66** |
| **Final contribution** | **$267.40** | **$1,539.34** |
| **Final contribution %** | **4.46%** | **19.89%** |

### 5.2 — $1,000 VIP tier, `mls_12x`: 12 standalone MLS Walkthroughs per month (144 per year)

| Line | B — live basis, **VIP restriction NOT modelled** | A — approved basis, VIP restriction ON |
|---|---|---|
| Customer deposits collected | $12,000.00 | $12,000.00 |
| Membership fees collected | $0.00 | $300.00 |
| Cash shortfall / direct paid | $0.00 — the wallet covers all 12 | $2,400.00 ($200/month) |
| **Total lifetime cash collected** | **$12,000.00** | **$14,700.00** |
| Promotional credits issued | $3,000.00 ($250 × 12) | $3,000.00 |
| Promotional credits redeemed | **$3,000.00 — on standalone MLS (PROHIBITED)** | **$0.00 — barred from standalone MLS** |
| Outstanding promotional liability | $0.00 | **$3,000.00 — carried forward** |
| Promotional close-out cost | $0.00 | $1,827.27 (closed at the permitted service ratio) |
| Outstanding cash-funded Booking Value | $0.00 | $0.00 |
| Cash-funded close-out cost | $0.00 | $0.00 |
| Specialist payouts | $7,200.00 (144 × $50) | $7,200.00 (144 × $50) |
| Editing labour | $2,880.00 (144 × $20) | $3,700.80 (144 × $25.70) |
| Payroll burden on editing | $0.00 — not modelled | included in $25.70 |
| Quality control | $0.00 — not modelled | included in $25.70 |
| Sales commission — funding | $1,030.00 (15% first, 8% × 11) | $1,030.00 |
| Sales commission — booking | $0.00 | $0.00 |
| Stripe fees | $351.60 (funding only) | $417.42 (funding + fee + shortfall) |
| VIP support expenses | $822.00 ($72 retainer + $300 sessions + $450 add-on discounts) | $822.00 |
| Refunds and chargebacks | $0.00 | $0.00 |
| **Total lifetime costs** | **$12,283.60** | **$14,970.22** |
| Contribution before close-out | −$283.60 | −$270.22 |
| Less promotional close-out | $0.00 | $1,827.27 |
| **Final contribution** | **−$283.60** | **−$2,097.49** |
| **Final contribution %** | **−2.36%** | — |

**Read this table carefully.** Column B's VIP promotional value of $3,000 is spent on standalone MLS Walkthroughs — the exact redemption the approved restriction forbids. Column A spends none of it there, and instead carries $3,000 forward as a promotional liability that must eventually be fulfilled.

**This scenario is therefore negative in both columns, and it is negative for a reason the restriction does not fix:** a VIP member running 12 standalone Walkthroughs a month drains the entire wallet on the thinnest-margin service on the menu, leaving no cash-funded value for anything else. Barring promotional value from standalone MLS protects the margin from getting *worse*; it does not make this pattern profitable.

**Note:** the $1,000 VIP tier's certified worst case at the approved $120 is **7.35% on `churn_after_4`** — not on `mls_12x`. `mls_12x` is an extreme, adversarial pattern that is not part of the previously certified tier result.

---

## 6. EVERY CHANGED INPUT BETWEEN THE TWO CERTIFICATIONS

| # | Dimension | Previous certification | Launch certification | Effect on the result |
|---|---|---|---|---|
| 1 | **MLS price basis** | **$120** (approved V2) | **$100** (live V1) | **Dominant.** $500 `mls_6` 4.46% → 22.34% |
| 2 | Simulator | `optimizeMlsUnitEconomics` | `runAutoFundStressTest` | Not comparable |
| 3 | Promotional vs cash credit | Two separate pools | One merged wallet | Hides the rule being tested |
| 4 | VIP promotional restriction | Modelled ON | **Not modelled** | Produces a prohibited state |
| 5 | Standalone-MLS allowance | Gate present, run UNLIMITED | No concept | None — already unbounded |
| 6 | Membership fee revenue | $25/month for $350+ | **Not modelled** | $300/yr understated at both tiers |
| 7 | MLS editing per walkthrough | $25.70 (wage × minutes × burden + QC) | **$20 flat**, no burden, no QC | Favours the new report by $410/yr at $500 |
| 8 | Editing wage basis | $18/hr candidate, 60 min | Implicit flat constant | Cost basis is inconsistent between runs |
| 9 | Persona set | 15, including churn / refunds / accumulator | 18, **no churn pattern** | Different worst case by construction |
| 10 | Worst persona at $500 | `churn_after_4` | `mls_6x` | Different measurement |
| 11 | Balance close-out | Permitted-service ratio; persona mix | Unredeemed × 34% + editing ratio | Understates the VIP promotional liability |
| 12 | Tier structure | five tiers | five tiers | **No change** |
| 13 | Funding amounts, bonuses, fees | unchanged | unchanged | **No change** |
| 14 | Payout basis (40% post-sales / MLS table) | 34% of retail / $50 | 34% of retail / $50 | **No change** |
| 15 | Booking commission on wallet-funded bookings | 0% | 0% | **No change** |
| 16 | Funding commission | 15% first, 8% recurring | 15% first, 8% recurring | **No change** |
| 17 | Stripe | 2.9% + $0.30 | 2.9% + $0.30 | **No change** |
| 18 | Refund mechanics | BV returned, payout reversed, editing + Stripe retained | same | **No change** |

**Rows 12–18 confirm your premise:** nothing in the approved program structure, funding, bonus, fee, compensation or redemption mechanics changed.

---

## 7. THE VIP `mls_12x` SCENARIO, REPRODUCED

**Result: contribution −$283.60, margin −2.36%.** Reproduced to the cent:

| Month (×12) | Amount |
|---|---|
| Deposits collected | $1,000.00 |
| Wallet credited (`booking_value`, cash + bonus merged) | $1,250.00 |
| 12 × MLS Walkthrough at $100 | $1,200.00 consumed |
| Cash shortfall | $0.00 — the wallet covers all 12 |
| Year: cash collected | $12,000.00 |
| Year: specialist payouts | $7,200.00 |
| Year: editing (144 × $20) | $2,880.00 |
| Year: funding commission (15% first, 8% × 11) | $1,030.00 |
| Year: Stripe | $351.60 |
| Year: VIP support (retainer $72 + 12 sessions × $25 + 144 bookings × 0.25 × $12.50) | $822.00 |
| **Total costs** | **$12,283.60** |
| **Contribution** | **−$283.60** |
| Margin | **−2.36%** |

### How it produces a negative despite the prohibition

**Because the simulator does not implement the prohibition.** It has no promotional pool. It credits `config.booking_value` — cash **plus** the $250 promotional bonus — into one wallet and spends it as though it were all cash.

So $250 a month of promotional Booking Value (25% of the $1,000 deposit) is spent on standalone MLS Walkthroughs. That is exactly the redemption `VIP_PROMO_BARRED_FROM_STANDALONE_MLS` forbids. The $250 was granted free, but the walkthrough it buys costs real money — $50 specialist payout plus $20 editing, 70% of its retail. Redeeming free value into the thinnest-margin service on the menu is what drives the negative.

**The scenario cannot occur under the approved rules.** Under them, that $250/month cannot pay for a standalone Walkthrough at all; it must go to a qualifying bundle or a non-MLS package.

**The restriction is not the cause of the negative — it is the only thing standing between this pattern and a worse one.** §5.2 column A shows that applying the restriction correctly converts the −$283.60 of *realized* loss into a $3,000 carried-forward promotional liability, which is then a separate, disclosed obligation rather than a prohibited redemption.

---

## 8. WHAT THIS MEANS

1. **The approved and reconciled position is unchanged.** $500 = 15.26% and VIP = 7.35% at the owner-approved $120 reproduce exactly. VIP below the 10% target remains the exception you already accepted.
2. **The launch report's two figures are the live-$100 result**, which the sensitivity report had already disclosed. Presenting them as a new regression was an error in the launch report, not a change in the program.
3. **No implementation defect exists.** The VIP restriction is enforced at the transaction layer and passes 22/22.
4. **One genuine finding remains, and it is a harness input problem, not an economic one.** `runAutoFundStressTest` prices MLS at the **live $100** while carrying a model version that assumes the approved structure. It will keep reporting failure at $500 and VIP for as long as V2 remains inactive — because at $100 those two tiers genuinely fail, which is precisely why the owner approved $120. This harness was not aligned when V2 was approved.
5. **A second fidelity gap:** the harness merges cash-funded and promotional Booking Value, so it cannot test — or respect — the promotional restriction it is meant to certify. Its VIP result is therefore not admissible evidence about the approved program.

**Nothing was changed to make any test pass.** The two live-$100 failures are real at the live $100 price, were previously disclosed, and are the documented reason for the $120 approval. The decision on whether to activate V2, and how to align the stress harness's price basis, is yours.

---

## 9. REQUIRED BEFORE ANY FURTHER FINANCIAL CERTIFICATION

1. **Confirm the price basis every financial certification should run on.** Today one harness prices MLS at the live $100 and another at the approved $120, and the two are reported as though they were comparable.
2. **Decide whether `runAutoFundStressTest` should be parameterised** to run both a live-price and an approved-price view, so a launch gate never again compares across two price bases. (No code has been changed.)
3. **Note the promotional/cash separation gap** in `runAutoFundStressTest` before it is relied on for any VIP conclusion.
4. **Production remains untouched:** enrollment closed, membership fee billing disabled, **0 Auto-Fund subscriptions**, 117 wallets and 133 payment events unaltered, live MLS price unchanged at $100, V2 inactive.