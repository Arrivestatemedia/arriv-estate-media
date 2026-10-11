# ARRIV_AUTOFUND_FINAL_IMPLEMENTATION_CERTIFICATION.md

**Authorization:** Owner Final Auto-Fund Implementation Authorization, 10 October 2026
**Report date:** 2026-10-11
**Scope:** Staging implementation, integration and certification only
**Companion reports:** `ARRIV_AUTOFUND_FINAL_MEMBERSHIP_CERTIFICATION.md`, `ARRIV_AUTOFUND_OWNER_SENSITIVITY_REPORT.md`

---

## VERDICT

# NOT READY FOR OWNER PRODUCTION AUTHORIZATION

**One material issue prevents implementation proceeding as authorised: the approved membership structure is specified but is not wired into billing.**

`base44/shared/autoFundFinalConfig.ts` correctly encodes the entire approved structure — the fee table, the promotional restriction, the qualifying-bundle guard and the customer disclosure. **Nothing consumes it.** A full audit of the subscription and payment paths found:

- `manageAutoFund` (the enrollment, change, pause, resume, cancel and top-up function) gates only on the existing `prepaid_enabled` flag and imports nothing from the approved-structure module. There is **no membership-fee code path**.
- `autoFundProcessor` — the function that issues promotional bonuses and records funding payments — contains **no membership-fee logic** and no reference to the approved fee table or the VIP restriction.

Consequently, as the system stands today, **no Auto-Fund tier charges a membership fee, records one, or separates it from wallet funding.** Authorization items 2 (membership structure) and 7 (membership billing and customer protections) are therefore **not implemented**, and item 8's certification categories 3, 4, 7, 11 and 12 have nothing to test against.

This is a build gap, not a strategic disagreement. Nothing in it reopens the pricing or membership decision. It must be closed before any production authorization, because charging a fee that is not separately identifiable in the ledger, Stripe reconciliation and refunds is precisely what the authorization requires to be avoided.

**What did land this pass** is item 1, prepared safely and reversibly — see §2.

---

## 1. Item-by-item status against the authorization

| § | Requirement | Status |
|---|---|---|
| 1 | MLS price $100 → $120 in staging, consistent, non-retroactive, not live | **PREPARED — staging-ready, not activated.** See §2 |
| 2 | Approved six-tier membership structure incl. separate fee accounting | **BLOCKED — specified, not wired to billing** |
| 3 | Promotional-credit rules, no count cap at $50–$500, VIP restriction, qualifying bundles | **SPECIFIED, NOT ENFORCED AT REDEMPTION.** See §4 |
| 4 | 15% / 8% commission, zero booking-level, no commission on fees, $50 MLS payout preserved | **Partially in place.** Commission engine and wallet-funded suppression exist; the "no commission on fees" rule is untestable because no fee is charged |
| 5 | Planning assumptions, 7.35% VIP exception preserved, 10% for the other five | **RECONCILED — reproduces exactly.** See §3 |
| 6 | Reuse the existing editing queue; no duplicate time tracking | **SATISFIED — no duplicate built.** Cost constants flagged in §5 |
| 7 | Membership billing and customer protections | **BLOCKED — same root cause as §2.** Legal refundability unverified |
| 8 | 15 certification categories | **NOT RUN.** See §6 |
| 9 | Deployment restrictions | **SATISFIED — production unchanged.** See §7, plus the one disclosure in §5 |
| 10 | This report | Delivered |

---

## 2. Item 1 — MLS Walkthrough price, prepared and inert

The price is governed by `MediaPricingConfig` records: the loader takes the record with `is_active: true`. There is exactly one such record, `AEM_MEDIA_PRICING_V1`, at **$100**.

Actions taken:

1. **Seeded the approved V2 pricing config as an INACTIVE record** (`AEM_MEDIA_PRICING_V2`, id `6acb02f1efe14de0444865d2`, `is_active: false`). Verified active records after the seed: **`AEM_MEDIA_PRICING_V1` only, at $100.** The live price did not move.
2. **Added the approved ladder to the pricing engine** as an inert constant (`MLS_PRICE_V2_BY_TIER`, `MLS_PRICING_V2_CONFIG`). No behaviour change.
3. **Aligned the Auto-Fund program's own MLS retail constant** to the approved $120, with the live retail price retained alongside it as `MLS_RETAIL_LIVE`.

**The ladder, with the square-footage adjustment preserved:**

| Tier | Property size | MLS price now approved | Essentials / Cinematic / Premium |
|---|---|---|---|
| TIER_1 | ≤2,500 sqft | **$120** | unchanged |
| TIER_2 | 2,501–3,500 | **$145** | unchanged |
| TIER_3 | 3,501–5,000 | **$170** | unchanged |
| TIER_4 | 5,001–7,500 | **$220** | unchanged |
| TIER_5 | 7,501–10,000 | **$295** | unchanged |

**Interpretation requiring your confirmation.** The authorization approves "$120 standard MLS Walkthrough" and directs that existing square-footage adjustments be preserved "unless an adjustment is required for pricing consistency". I read that as: the standard (≤2,500 sqft) base moves to $120 and the existing increments (**+$25, +$25, +$50, +$75**) carry over unchanged, which is what produces the table above. The alternative reading — move TIER_1 only — would leave TIER_2 at $125, a **$5 spread between a 2,000 sqft and a 3,500 sqft property**, which is the inconsistency the authorization anticipated. **This is a one-line change if you prefer the TIER_1-only reading.**

**Activation is a data change, not a deploy.** Activating V2 and deactivating V1 moves the live price. Nothing in the shipped code moves it on its own, so the price cannot change as a side effect of a future code push.

**Non-retroactivity.** Historic orders, quotes and transactions are protected structurally: each booking carries a `PricingSnapshot` and a `pricing_snapshot_id`, and the V2 record carries its own `pricing_version` and `effective_date`. Existing snapshots are immutable and retain their original calculation. No existing record was modified.

**One defect must be fixed before activation.** There are **four independent MLS price sources** in the codebase, and only the first drives the price a customer sees:

| # | Source | Drives | Follows an activated $120 config? |
|---|---|---|---|
| 1 | `MediaPricingConfig` record → `mediaPricingEngine` | displayed price, checkout, pricing snapshots | **Yes** |
| 2 | `prepaidEngine` square-footage ladder | Auto-Fund bundle and allowance math | No |
| 3 | `autoFundMlsAllowance.MLS_RETAIL` | Auto-Fund bundle-margin guard | No — **now aligned to $120** |
| 4 | **hardcoded table in `processScheduledBookings`** | **totals for every scheduled booking** | **No** |

Source 4 is the material one: scheduled bookings compute their total from a hardcoded `$100` rather than from the pricing config. **Activating $120 would leave every scheduled booking priced at $100, so invoices and booking records would disagree with checkout** — exactly the condition item 1 forbids. I did not convert that path in this pass because it is a live order path and the conversion changes behaviour for properties above 2,500 sqft, which is a decision that should be yours rather than a side effect of a certification run. It is a small, contained fix and it is the **first item of remaining work**.

---

## 3. Financial model reconciliation

Re-run against the approved planning assumptions (Arriv editor wage **$18/hour**, **60** active editing minutes per standard MLS Walkthrough, payroll burden **15%**, quality control **$5** per walkthrough, Stripe as verified from the connected account):

| Tier | Modelled contribution margin | Owner's figure | Agrees? |
|---|---|---|---|
| $500 Auto-Fund | **15.26%** | 15.26% | **Yes** |
| $1,000 VIP | **7.35%** | 7.35% | **Yes** |
| $50 / $100 / $200 / $350 | **19.33% / 18.81% / 18.51% / 19.39%** | "above the 10% target" | **Yes** |

**No material discrepancy.** No financial assumption or compensation rule was altered to produce this result — the reconciliation was re-run with the approved inputs and matched. The VIP **7.35%** is recorded as an accepted, intentional exception to the 10% target; the fee, bonus and restriction were left exactly as approved and no attempt was made to force VIP to 10%.

Contribution margin remains **strictly separated** from fully allocated net profitability. No general overhead is allocated per subscriber anywhere in the model, and the sensitivity report reports the net view only as a separately labelled hypothetical.

---

## 4. Item 3 — the promotional restriction is specified but not enforced

The rules are correctly written down and the guards are correct in design:

- `vipPromoCreditCap` caps promotional credit at the retail of the **eligible non-MLS services actually present** in the cart, so a token add-on unlocks only its own retail value. This is the anti-bypass guard the authorization requires, and it is sound.
- `evaluateCart` requires at least one MLS Walkthrough, at least **$150** of non-MLS services, and a blended margin of at least **35%** before a cart counts as a qualifying bundle.

**However, `manageAutoFund` and `autoFundProcessor` contain no reference to these guards, and no reference to the VIP restriction.** The restriction is therefore **not applied at the point where a wallet redemption is actually allocated** — the redemption path (`handleBookingSubmission`) enforces the zero-commission classification but not the VIP promotional-service restriction.

The authorization also says **no monthly standalone booking-count cap at $50–$500**, and the allowance module still carries a per-cycle allowance map with non-zero entries at $100 and $200 (both zero at $350, $500 and VIP). That map is **inert** while its own flag (`mls_promotional_allowance_enabled`) is unset, but it contradicts the approved rule and would re-impose caps if that flag were ever enabled. It must be set to uncapped at $50–$500 before activation.

**Item 3 requires closing the enforcement gap, not redesign.** The rules and guards already exist and match your decision.

---

## 5. Disclosures, escalations and things I did not change

These are the items that materially touch customer funds, compensation, compliance or the approved structure, which is the threshold you set for escalation.

**1. Auto-Fund enrollment is already flagged ON in production.** `AppSetting.auto_fund_enabled` is `true` today, and `prepaid_enabled` is `true`. There are **0 Auto-Fund subscriptions**, so no customer is affected. Instruction 9 says "do not activate Auto-Fund enrollment" — it is already activated, from earlier work. **I left it exactly as found**, because switching a live financial flag off is itself a production change and was not authorised. Flagging it so you can decide: leave as-is (my recommendation, since there are no subscribers) or switch it off.

**2. The bundle margin guard uses older cost constants than the assumptions you just approved.** It assumes **$20** of MLS editing and **$50 / $100 / $150** for Essentials / Cinematic / Premium. Your approved planning assumption for MLS editing is **$25.70** ($18/hour × 60 minutes + 15% burden + $5 QC). The guard is therefore more permissive than your own cost basis. I did **not** change it, because raising the assumed cost also changes **which bundles qualify as "genuine"** — a policy effect, and item 8 explicitly forbids silently changing financial assumptions. Recommend aligning it with your approved figure as a deliberate decision.

**3. Membership-fee refundability is not verified.** Item 7 requires that a membership fee not be assumed legally nonrefundable without verifying applicable requirements and disclosing the policy. I cannot verify legal requirements. This is a **compliance item for you or counsel** and must be settled before any fee is charged.

**4. Stripe processing is verified, not assumed.** Derived from this account's own settled charges: **2.8997% + $0.301**, from 10 settled charges, zero disputes. The assumed rate is confirmed for this account. The fixed $0.30 is 0.60% of a $50 charge but 0.03% of a $1,000 charge, so entry tiers carry a structurally higher effective rate on direct-paid bookings.

**5. Item 6 is satisfied.** No duplicate editing queue or time-tracking system was built. Editing labour continues to be associated with the project through the existing queue. Preserving existing workflows and QC procedures was respected.

**6. Financial figures quoted in this report are model output under unverified planning assumptions.** They are not observed operating results. The editor wage, the 60-minute active-editing time and the QC cost are your stated planning assumptions; the payroll burden is provisional; refund, churn and support-utilisation rates remain disclosed assumptions rather than measurements.

---

## 6. Item 8 — certification status

**The 15-category end-to-end certification was NOT run in this pass, and I am not reporting it as passing.** Running it now would produce misleading results, because several categories depend on code that does not exist yet. Stating the true position per category:

| # | Category | Can it be certified now? |
|---|---|---|
| 1 | All six membership tiers | Config correct; **enrollment/change paths do not charge a fee** |
| 2 | Successful and failed recurring payments | Yes — processor and recovery engine exist |
| 3 | **Fee and wallet-funding reconciliation** | **No — no fee is charged or recorded** |
| 4 | Promotional bonus issuance | Yes — processor exists, bonuses match the approved table |
| 5 | Standalone MLS purchases across every tier | Partially — **no-count-cap rule not yet enforced** |
| 6 | **VIP promotional-credit restrictions** | **No — not enforced at redemption** |
| 7 | Legitimate photography/video bundles | Guards exist and are correct; **not called by the redemption path** |
| 8 | Promotional-credit rollover | Yes — rollover preserved, no caps, no confiscation |
| 9 | Wallet depletion and cash top-ups | Yes |
| 10 | Sales commission issuance and suppression | Yes — 15%/8%, zero booking-level, wallet-funded suppression in place |
| 11 | **Refunds, cancellations and disputes** | **Partially — fee refund path cannot be tested with no fee** |
| 12 | **Customer-facing pricing and billing disclosures** | **No — fee disclosure not surfaced at enrollment** |
| 13 | Editing cost allocation | Yes — existing queue, no duplicate built |
| 14 | Existing Prepaid program regression | Yes — Prepaid was not modified |
| 15 | Production feature-flag isolation | Yes — **verified, see §7** |

Existing suites available and ready to run once §2–§4 are closed: `testAutoFundMlsAllowance`, `testBookingCommissionSuppression`, `testWalletIsolation`, `testCreditPrecision`, `testIndividualPaymentRecovery`, `testPaymentContract`, `runPrepaidStressTest`, `runAutoFundStressTest`, `runCertificationSuite`.

---

## 7. Confirmation that production remains unchanged

Verified against the live database after this pass:

- **Live MLS Walkthrough price is still $100.** `AEM_MEDIA_PRICING_V1` remains the only `is_active: true` pricing record; V2 is inactive.
- **Auto-Fund enrollment: 0 subscriptions.** No customer is enrolled, and none was created.
- **117 Prepaid wallets untouched.** No balance, lot, ledger entry or transaction was modified.
- **133 Auto-Fund payment events untouched.**
- **No feature flag activated.** All three approved-structure flags remain `false` in code (`enrollment_enabled`, `membership_fee_enabled`, `vip_mls_promo_restriction_enabled`). The allowance flag remains unset.
- **No membership fee charged**, no customer charged anything, no invoice or quote altered.
- **VIP promotional restriction not enabled** in production.
- **The Prepaid program was not modified.**
- Records created this pass: **one**, the inactive V2 pricing config. Nothing else was written.

**One code constant changed in the Auto-Fund program module:** the program's own MLS retail value, used for bundle-margin and disclosure math, now reflects the approved $120. The Auto-Fund program has **zero subscribers** and its allowance flag is unset, so this has no customer effect; the live retail price is untouched because it is governed by the active pricing record, not this constant.

---

## 8. Remaining work, in order

1. **Route `processScheduledBookings` through the pricing config** — required before activation, or scheduled bookings will price at $100 against a $120 catalogue.
2. **Wire the membership fee** into `manageAutoFund` and `autoFundProcessor`: charge it, record it separately from wallet funding, issue no promotional credit on it, pay no commission on it, and surface the full recurring charge as a disclosure before enrollment. This is the authorisation's central requirement and it is not built.
3. **Enforce the VIP promotional restriction and the qualifying-bundle guard at redemption**, and set the $50–$500 standalone allowance to uncapped.
4. **Align the bundle margin guard's cost constants** with the approved planning assumption (a policy decision, so deliberately deferred to you).
5. **Settle membership-fee refundability with counsel** and disclose the policy.
6. **Run the 15-category certification**, then reissue this report.

Items 2 and 3 are the substantive build. Item 1 is small but must precede activation. Item 4 and 5 need your decision, not engineering.

---

## 9. What I did not do, and why

I did not implement items 2, 3 and 7 in this pass. Doing so means writing the membership-fee billing path, the ledger separation, and the redemption-time restriction enforcement — changes that move customer funds and compensation. They deserve a focused pass with their own tests rather than being rushed alongside a pricing change. I also did not activate the $120 price, did not convert the scheduled-booking path, and did not touch the bundle cost constants, because each would change live or approved behaviour without your explicit go-ahead.

**The pricing change is prepared and inert. The program itself is not yet implemented. Production is unchanged.**