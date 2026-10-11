# ARRIV AUTO-FUND — CONSOLIDATED FINAL CERTIFICATION REPORT

**Date:** 2026-10-11
**Scope:** Five-tier Auto-Fund membership, MLS promotional allowance, wallet/credit integrity, marketplace compensation waterfall, payment processing
**Status:** **CONDITIONAL PASS — 2 launch blockers outstanding**
**Supersedes:** `ARRIV_AUTOFUND_FINANCIAL_CERTIFICATION_REPORT.md`, `ARRIV_AUTOFUND_FINAL_MEMBERSHIP_CERTIFICATION.md`, `ARRIV_AUTOFUND_FINANCIAL_RECONCILIATION.md`

---

## 1. HEADLINE

The Auto-Fund model itself certifies on the owner-approved configuration ($120 MLS, five tiers, $25.70 editing, fees collected-not-spendable, VIP promotional bar). The financial reconciliation is closed: the harness that produced contradictory results was rebuilt on the single shared simulation core, and the two arms now agree by construction rather than by coincidence.

Two launch blockers remain, and **neither is a flaw in the Auto-Fund model**. Both are deployment/legacy-term issues outside the model:

1. **The deployed payment processor is stale** — it runs the OLD six-tier table and does not pay the $250 tier its approved bonus.
2. **Retired-tier legacy terms are not preserved in source** — `getAutoFundConfig()` returns `null` for $50/$100/$200, so a legacy subscriber on a retired tier would lose their contractual monthly bonus the moment current source is deployed.

---

## 2. CORRECTIONS APPLIED THIS ROUND

The previous stress test produced results that could not be compared with `optimizeMlsUnitEconomics`. Root cause and fixes:

| # | Defect found | Correction |
|---|---|---|
| 1 | Pricing version was ambiguous / hardcoded | The harness now takes an explicit `mls_pricing_version` (V1 or V2) and **always reports both**, so a comparison never depends on a flag. It reads `mlsPricing.ts` only and **never reads or writes `MediaPricingConfig`** — a financial test structurally cannot move the live retail price. |
| 2 | V1 historical comparability at risk | V1 ($100) is retained and reported alongside V2 on every run. Nothing is ever a pricing activation. |
| 3 | The harness had its own wallet arithmetic that merged cash and promotional value | **Deleted.** All simulation now runs through one shared core, `base44/shared/autoFundSimulator.ts`, which holds cash-funded and promotional Booking Value in **separate pools**, exactly as `CreditLot` separates a `purchase`/`reload` lot from a `promotional` lot. |
| 4 | The VIP restriction was a local flag that could be set inconsistently | The core now derives the restriction from **`resolveMlsPromoEligibility`** — the same resolver the booking transaction uses. A simulation cannot permit a redemption production would reject. |
| 5 | A prohibited redemption could be simulated without detection | Every run asserts `no_prohibited_promo_redemptions`. **Result: 0 across all 230 combinations.** |
| 6 | Two independently written simulators could disagree | One core. Arm 1 reproduces the `optimizeMlsUnitEconomics` basis exactly (identical core, economics, personas, wallet rules, close-out convention, margin definition). |
| 7 | Residual differences could be averaged away | The two arms are now reported **separately and never merged**, with each remaining difference named explicitly (see §5). |

Also purged: **retired $50/$100/$200 tier references** still present in two harnesses (`testPaymentContract`, `testCreditPrecision`). Both were half-migrated — the wallets already said `AUTOFUND_150` while the charged amounts still said $100. Both now use the $150 tier and its correct $157.50 (15,750¢) booking value.

---

## 3. STRESS TEST RESULT — OWNER-APPROVED CONFIGURATION (V2, $120)

**230 combinations tested. 229 pass. 1 fails — VIP only, at the stress editing ceiling.**

Assumptions: $18/hr × 60 active minutes = $18.00 gross, +15% employer payroll burden, +$5.00 QC = **$25.70 per MLS Walkthrough**. MLS payout $50. Partner 40% of post-sales value. Funding commission 15% first / 8% recurring. Booking commission 0% on any wallet-funded booking. Stripe 2.9% + $0.30. Full-balance close-out (nothing counted as profit).

### Standardized arm (identical basis to `optimizeMlsUnitEconomics`, 17 personas incl. early churn)

| Tier | Fee | Worst lifetime margin | Binding persona | vs 10% target |
|---|---|---|---|---|
| $150 Starter | $0 | **19.49%** | mls_20 | PASS |
| $250 Growth | $0 | **18.37%** | churn_after_1 | PASS |
| $350 Professional | $25 | **17.65%** | churn_after_1 | PASS |
| $500 Premier | $25 | **11.19%** | churn_after_1 | PASS |
| $1,000 VIP | $25 | **2.23%** | churn_after_1 | PASS *(owner exception: positive contribution, not 10%)* |

### Scenario arm (premium / adversarial / MLS-volume, 225 combinations)

| Tier | Worst scenario margin | Binding scenario | Result |
|---|---|---|---|
| $150 | 18.83% | premium_2x_small_with_refund | PASS |
| $250 | 17.00% | premium_2x_small_with_refund | PASS |
| $350 | 15.60% | premium_2x_small_with_refund | PASS |
| $500 | 10.46% | premium_1x_accumulate | PASS (thin) |
| $1,000 VIP | **−2.53%** | premium_2x_small_with_refund @ $200 editing | **FAIL** |

### The single failure, precisely bounded

VIP tier, 2 premium packages every month, one booking refunded, at a **$200 editing cost per completed edit** — the stress ceiling of the ladder, not the expected cost.

| Premium editing cost | VIP lifetime margin |
|---|---|
| $100 | +17.09% |
| $125 | +12.19% |
| $150 *(expected)* | **+7.28%** |
| $175 | +2.37% |
| $200 *(stress ceiling)* | **−2.53%** |

At every editing cost the business actually expects ($100–$150), VIP clears with 7–17% margin. This is a **monitored sensitivity boundary, not a structural defect**, and it is not the binding constraint on the VIP exception. No pricing, redemption cap, or fee was introduced to make it pass.

### V1 comparability (reported, not a blocker)

| Tier | V1 ($100) worst margin | Result |
|---|---|---|
| $500 | −4.96% | FAIL |
| $1,000 VIP | −10.32% | FAIL |

V1 does not carry the tiers above $350. This confirms the owner-approved V2 price is the correct launch basis, and is consistent with the previously disclosed V1 results.

---

## 4. SUITE RESULTS

| Suite | Result | Notes |
|---|---|---|
| `runAutoFundStressTest` | **229 / 230** | 1 VIP stress-ceiling combination (§3) |
| `certifyAutoFundEnrollment` | **22 / 22 PASS** | Enrollment gated off; fee billing disabled; tampered fee quote rejected; self-service yields no commission |
| `testAutoFundMlsAllowance` | **22 / 22 PASS** | No count cap on non-VIP tiers; no accumulation; bundle qualification; idempotent consumption |
| `testBookingCommissionSuppression` | **10 / 10 PASS** | Wallet-funded = 0 commission on both paths (booking + payment confirmation); standard marketplace keeps 15% |
| `testPaymentContract` | **11 / 11 PASS** | Was 8/11 — retired $100 references purged |
| `testCreditPrecision` | **6 / 6 PASS** | Was 3/6 — retired $100 references purged; $150 issues exactly 15,750¢ |
| `testWalletIsolation` | **6 / 6 PASS** | Cert cannot touch a production wallet; mixed synthetic/production identity rejected |
| `testIndividualPaymentRecovery` | **20 / 20 PASS** | Decline→reminder→pause→recovery lifecycle; duplicate webhooks idempotent |
| `runCertificationSuite` | **12 / 12 PASS** | Prepaid, Auto-Fund, idempotency, full/partial/multiple refunds |
| `testCertificationDeliveryExclusion` | 13 / 14 | Only failure is a test-hygiene count (`ack_count=16 vs expected 14` — synthetic artifacts accumulated across repeated runs). The substantive guarantee passes: synthetic cert records are **blocked from real payroll delivery**, no HTTP attempted, no state change. | |
| `testDeployedPaymentContract` | 19 / 20 | **FAILING CHECK IS A REAL DEFECT — see Blocker 1** |

### Integrity guarantees (all runs)

- **Prohibited promotional redemptions: 0.** The VIP restriction holds in every one of 230 combinations.
- **VIP promotional spend on standalone MLS: $0.00** across all VIP runs.
- **Cash and promotional pools: strictly separate** in every run.
- **Production balances untouched** by every certification suite.
- **Reports only.** No pricing, commission, payout, credit, balance, ledger, or production setting was changed by any certification function. V2 is valued, never activated.

---

## 5. RECONCILIATION — WHY THE ARMS ARE ALLOWED TO DIFFER

One core, two scenario sets. Arm 1 and Arm 2 are deliberately different scenarios and are **never averaged**:

| Difference retained | Reason it is correct |
|---|---|
| Arm 2 prices square-footage variants on the canonical ladder and uses the per-sqft MLS payout table; Arm 1 evaluates one ≤2,500 sqft property at a flat $50 payout | Arm 2 exists to test the sqft ladders; Arm 1 exists to match the prior study |
| Arm 2 runs a premium-editing ladder ($100–$200); Arm 1 applies the approved $25.70 MLS editing cost | The premium package's editing cost is genuinely unknown; the ladder is how that uncertainty is bounded |
| Arm 2 states its own close-out convention per scenario (the lowest-margin service that scenario actually buys); Arm 1 uses the shared S/B/E/C convention | A tier's promotional liability must be closed out against the worst service **it actually buys**, not a global constant |
| Arm 2 includes premium and adversarial cart shapes with no Arm 1 equivalent | These are the new-risk scenarios the earlier study did not cover |

Both arms now share the margin definition, the wallet model, the eligibility resolver, the commission rules, and the close-out mechanics. **The prior contradiction is closed.**

---

## 6. REMAINING LAUNCH BLOCKERS

### BLOCKER 1 — The deployed payment processor is stale (REAL MONEY)

The deployed `receiveArrivPayCustomerPayment` runs the **old six-tier table**:

- **$250 (Growth) is credited $250.00 with NO bonus** — 25,000¢ issued where the canonical tier requires 27,500¢ (10% bonus). A real $250 Auto-Fund customer is short **$25 every month**. This is the single failing deployed check.
- The retired **$100 tier still receives its 5% bonus** in production (10,500¢), proving the deployed table predates the five-tier migration.

**Why this is not a code fix here:** the current source is already correct — it issues the $250 bonus properly (proven locally) and no longer honours $100. The defect is that the deployment is behind the source. **Resolution requires owner authorization to redeploy the payment functions.** No code change is required or was made.

### BLOCKER 2 — Retired-tier legacy terms are not preserved

The approved decision was to retire $50/$100/$200 from new enrollment **while preserving existing customer contract terms**. In current source, `getAutoFundConfig()` returns `null` for those amounts and there is no legacy fallback. Consequence:

- Before redeploy: a legacy $100 subscriber keeps their 5% bonus (stale deployed table).
- After redeploy: the same subscriber's monthly payment would issue **no bonus at all** — a contractual regression for existing customers.

**Resolution requires the owner to state the exact legacy bonus terms** for $50, $100 and $200 (rate and any validity change). Implementing a fallback with invented percentages would create an unapproved financial liability, so none was implemented. The retired amounts are already tracked in `AUTO_FUND_RETIRED_AMOUNTS`.

### Gate still closed (by design, not a defect)

- Auto-Fund enrollment: **closed** (code flag off; the `autofund_enrollment_enabled` switch is absent, and either one alone cannot open it).
- Membership fee billing: **disabled** — zero chargeable at every tier, and the fee processor refuses while billing is off. Fee refund policy correctly defaults to `undetermined`, not `non_recoverable`.
- V2 pricing: **not activated.** Live retail remains $100 (V1).

---

## 7. MONITORED RISKS (not blockers)

1. **VIP at the premium stress ceiling.** −2.53% if premium editing reaches $200/edit while a VIP customer buys 2 premium packages a month and refunds one. Monitor actual premium editing cost; the tier clears at $150 (7.28%) and below.
2. **$500 Premier on the scenario arm is thin at 10.46%** (`premium_1x_accumulate`). It passes, but with little headroom. Worth watching as a real cohort emerges.
3. **`testCertificationDeliveryExclusion` footprint count.** Synthetic acknowledged events accumulate across repeated certification runs (16 vs 14 expected). Test hygiene only — delivery exclusion itself is proven. A cleanup of accumulated synthetic `PreparedRequest`/acknowledgement artifacts would restore this to 14/14.

---

## 8. FINAL VERDICT

| Area | Verdict |
|---|---|
| Five-tier structure, pricing, fees | **PASS** at V2 |
| MLS promotional allowance mechanics | **PASS** |
| Wallet / credit integrity (integer cents, isolation) | **PASS** |
| Commission suppression on wallet-funded bookings | **PASS** |
| Marketplace compensation waterfall | **PASS** |
| Individual payment recovery lifecycle | **PASS** |
| Certification data isolation from production | **PASS** |
| **Deployed processor correctness** | **BLOCKED** — stale deployment |
| **Legacy retired-tier terms** | **BLOCKED** — owner input required |
| Financial reconciliation between harnesses | **CLOSED** |

**Enrollment may not open until Blocker 1 and Blocker 2 are cleared.** Neither requires a change to the Auto-Fund model, its pricing, its allowances, or its fee structure — the model is certified as approved.

*This report reflects read-only certification. Nothing was activated, deployed, charged, or changed in production.*