# ARRIV AUTO-FUND — FINAL PRODUCTION-READINESS REPORT

**Date:** 2026-10-11
**Trigger:** Owner-authorized controlled payment-processor deployment
**Verdict:** **SOURCE RELEASE COMPLETE AND VERIFIED — DEPLOYMENT NOT YET PROPAGATED. ONE OUTSTANDING BLOCKER.**

> Deployment of corrected code is **not** approval to launch Auto-Fund. Enrollment remains closed and this report does not open it.

---

## 1. OUTSTANDING BLOCKERS (only these)

### BLOCKER 1 — The live app still runs the old processor bundle

**Verified, not inferred.** A deployment-version assertion was added to the deployed suite and executed against the live endpoint:

```
DEPLOYED_PROCESSOR_VERSION: corrected five-tier bundle live via deployed HTTP
  → FAIL
  webhook_version = v2_prepaid_20261009   (expected v3_five_tier_20261011)
  amount = 250, issued_cents = 25000
```

The live function identifies itself as `v2_prepaid_20261009` — the pre-correction bundle. Consequences, all still live in production:

| Effect | Live behaviour | Required behaviour |
|---|---|---|
| $250 Growth tier funding | issues **25,000¢ ($250.00)**, no bonus | 27,500¢ ($275.00) — **$25 short every month, per customer** |
| Tier table | old six-tier table | approved five tiers |

**Why the code fix alone did not clear it:** the corrected source is written and saved, but the deployed artefact has not been rebuilt. This is a publish/propagation step, not a code defect. **Required action: use the Publish button at the top of the app editor.** Until the live bundle reports `v3_five_tier_20261011`, Blocker 1 stands and no $250-tier customer can be funded correctly.

### BLOCKER 2 — Membership-fee refund policy is unresolved (legal)

`fee_refund_policy` correctly defaults to **`undetermined`** — the system does not assume fees are non-refundable. This is the right fail-safe posture, but it means the fee's refundability is **undecided**. It must be set by the owner/legal before any fee is collected. No fee can be charged while this is open, and `membership_fee_enabled` is `false`, so nothing is at risk today.

---

## 2. WHAT WAS VERIFIED THIS ROUND

### 2a. Legacy tier audit — ZERO legacy subscriptions

A live query of every `AutoFundSubscription` record returned **0 records total**. Therefore:

- **Active legacy subscriptions: 0**
- **Paused legacy subscriptions: 0**
- **Cancelled legacy subscriptions: 0**

Cross-checks confirming no hidden legacy exposure:

| Check | Result |
|---|---|
| Real (non-synthetic) customer wallets | **0 of 147** — all 147 are certification fixtures (132 `cert_*`, 15 `isolation_prod_*` / `prod_test_cert_*`), every one at $0.00 balance |
| `$50` payment events | 5 found — all `cert_*` fixtures, `event_type: topup` at 5,000¢ (1:1, no bonus). Not legacy tier funding. |
| `$100` payment events | all `cert_*` fixtures from earlier certification runs |
| `$200` payment events | 0 |

**Conclusion: there are no existing customers on a retired tier and no legacy balances.** Per the owner's instruction, the legacy configuration is preserved **for historical compatibility only, with no migration records created.**

### 2b. Legacy grandfathering terms (owner-confirmed) preserved

Implemented in `prepaidEngine.ts` as `AUTO_FUND_LEGACY_AMOUNTS`, exactly as confirmed:

| Deposit | Bonus | Booking Value | plan_id |
|---|---|---|---|
| $50 | 0% | $50.00 | `autofund_50_legacy` |
| $100 | 5% | $105.00 | `autofund_100_legacy` |
| $200 | 10% | $220.00 | `autofund_200_legacy` |

Design guarantees:

- **Not enrollable.** The legacy tiers are deliberately kept **out of `AUTO_FUND_AMOUNT_OPTIONS`** — the only list iterated by enrollment, tier display, promotional-allowance and financial-model code. A new customer cannot reach them.
- **Still resolvable.** `getAutoFundConfig()` falls back to the legacy map, so an existing legacy subscription's recurring payment would still fund at its contracted terms.
- **Legacy cents-normalisation fixed.** The webhook previously classified a legacy amount only against the five enrollable tiers, so integer-cents input for a retired tier could have been misread as dollars. The normaliser now accepts enrollable **and** retired amounts. This was a latent defect for the legacy path and is closed.
- **No record is created, migrated, rewritten or removed.** Earned Booking Value is untouched.

**Honest scope note:** with zero legacy subscriptions, only the owner-confirmed bonus table could be confirmed. No customer record exists against which to verify any *other* historical benefit or condition. If a legacy entitlement is later discovered outside this system, it must be verified against that contract before being encoded here.

### 2c. Release contents (exact, verified)

```
base44/shared/prepaidEngine.ts                        +95  (legacy tier map + fallback resolver)
base44/shared/autoFundFinalConfig.ts                  +28  (grandfathering terms + audit note)
base44/functions/receiveArrivPayCustomerPayment/entry.ts +14 (legacy normalisation, version marker)
3 files changed, 133 insertions(+), 4 deletions(-)
```

All safety gates re-confirmed in the released source:

| Gate | Verified |
|---|---|
| `enrollment_enabled` | `false` — enrollment stays closed |
| `membership_fee_enabled` | `false` — no fee charged, billed or recorded |
| `vip_mls_promo_restriction_enabled` | `false` (unchanged, independent of this release) |
| Pricing activation | **None.** The release path does not reference `MediaPricingConfig` at all — live retail pricing is untouched |
| Rollback readiness | Release is additive and self-contained in 3 files; reverting the legacy map and the version marker restores prior behaviour with no data migration |

### 2d. Suite status (local, current source)

| Suite | Result |
|---|---|
| `testPaymentContract` | **11 / 11 PASS** |
| `testCreditPrecision` | **6 / 6 PASS** |
| `certifyAutoFundEnrollment` | 22 / 22 PASS |
| `testAutoFundMlsAllowance` | 22 / 22 PASS |
| `testBookingCommissionSuppression` | 10 / 10 PASS |
| `testDeployedPaymentContract` (live endpoint) | **19 / 21** — both failures are Blocker 1 |

The two live failures are the **same single cause**: the old bundle is still serving. They are not independent defects.

---

## 3. POST-DEPLOYMENT VERIFICATION PLAN (runs immediately after Publish)

The deployed suite now performs all of the owner's post-deployment checks in one run. Expected result: **21 / 21**.

| Owner requirement | Check | Status now |
|---|---|---|
| Verify deployed processor version | `DEPLOYED_PROCESSOR_VERSION` | **FAIL** — v2 bundle |
| $250 Growth → $25 bonus → $275 total | `PARTIAL_REFUND_COMMISSION_HTTP` (`issued` = 27,500¢) | **FAIL** — 25,000¢ |
| Other four tiers → exact approved bonuses | STARTER $500 → 55,000¢ **PASS**; legacy $100 → 10,500¢ **PASS**; $250 **FAIL**; $350 / $1,000 not yet asserted against the live endpoint | partial |
| Separate membership-fee accounting | 22/22 enrollment certification | PASS (logic level) |
| Commission calculations + idempotency | `FULL_REFUND`, `DUPLICATE_CHARGEBACK_HTTP`, `REFUND_IDEMPOTENCY`, `PAYMENT_IDEMPOTENCY`, `COMMISSION_REVERSAL_WITH_ATTRIBUTION` | PASS |
| No existing customer funds/records changed | `PRODUCTION_BALANCES_UNCHANGED` + `SYNTHETIC_CLEANUP` | **PASS** — `production_balances_unchanged: true`, cleanup verified clean, zero remaining cert records |

**Gap to close after deployment:** the live suite asserts the exact bonus for $250, $500 and legacy $100, but not for **$350 and $1,000**. Those must be added and passing before launch sign-off — the owner asked for all five tier mappings verified against the live endpoint, and that cannot currently be claimed.

---

## 4. LAUNCH READINESS NOT YET COMPLETED

These were requested for after the controlled deployment. They are **pending** because they depend on it, and are listed so nothing is assumed done:

1. **Five-tier enrollment page** — not verified end-to-end with enrollment open.
2. **Self-service and sales-assisted checkout** — not verified end-to-end (cannot be exercised while enrollment is closed and the processor is stale).
3. **Membership dashboard management** — not verified end-to-end.
4. **Isolated end-to-end payment testing** — blocked on Blocker 1. Logic-level certification passes; live-path end-to-end is not complete.
5. **Membership-fee disclosures** — disclosure content is certified (22/22), but Blocker 2 (refundability) is unresolved.
6. **Unresolved legal review items** — Blocker 2. Also unresolved: the launch terms version and the customer authorization record (`terms_version`, `terms_accepted_by`) must be finalised before any enrollment.

### Launch gate — remains closed, correctly

| Gate | State |
|---|---|
| Auto-Fund enrollment | **CLOSED** — code flag `false`, and the `autofund_enrollment_enabled` switch is absent. Either alone cannot open it. |
| Real customer charging | **DISABLED** |
| V2 MLS pricing | **NOT ACTIVATED** — live retail remains V1 ($100) |
| Existing customer contracts / balances | **UNCHANGED** |

---

## 5. REQUIRED NEXT ACTIONS

1. **Publish the app from the editor** to propagate the corrected processor — Blocker 1.
2. Re-run the live deployed suite; it must report **21 / 21** with `webhook_version = v3_five_tier_20261011`. **Enrollment stays closed until that is seen.**
3. Resolve membership-fee refundability with legal — Blocker 2.
4. Add live assertions for the **$350 and $1,000** tier bonuses.
5. Only then: authorize opening the enrollment gate and re-verify items in §4.

*No pricing, enrollment, fee, contract or balance was activated or changed by this work.*