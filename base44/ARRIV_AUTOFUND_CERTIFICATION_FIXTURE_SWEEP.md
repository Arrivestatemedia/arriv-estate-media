# ARRIV AUTO-FUND — CERTIFICATION FIXTURE SWEEP (2026-10-11)

**Trigger:** the enrollment certification failed two checks — `zero Auto-Fund subscriptions
exist` and `no synthetic subscriptions leaked into production` — while the final fee
schedule was being prepared.
**Action:** every certification fixture, identified by its `cert_` / `cert_fix_` /
`cert_bill_` / `cert_deployed_` identity prefix, was removed from the production entities.
**Result:** **618 fixtures removed; zero remain.** No production value was touched — the
Auto-Fund program has never been activated, so there are no real subscriptions, wallets
or commission events to disturb.

---

## 1. What was removed

| Entity | Removed | Identity pattern |
| --- | --- | --- |
| `PrepaidCompensationEvent` | **522** | `cert_empe_*`, `cert_ptxn_*`, `cert_*_rep@cert.test`, `cert_*_rep@cert.arriv.internal` |
| `AutoFundConsentRecord` | 47 | `cert_*@example.com` |
| `AutoFundSubscription` | 9 | `cert_*@example.com`, `cert_fix_*@cert.test` |
| `AutoFundJurisdictionAudit` | 9 | `cert_*@example.com`, `cert_bill_*@cert.test` |
| `WalletTransaction` | 8 | `cert_fix_*@cert.test` |
| `AutoFundPaymentEvent` | 7 | `cert_fix_*@cert.test` |
| `CreditLot` | 6 | `cert_fix_*@cert.test` |
| `AutoFundMembershipNotice` | 4 | `cert_retry@example.com` |
| `PrepaidWallet` | 2 | `cert_fix_*@cert.test` |
| `AutoFundDisputeCase` | 2 | `cert_fix_*@cert.test` |
| `Contact` | 2 | `cert_fix_*@cert.test` |
| **Total** | **618** | |

`PrepaidCompensationEvent` is now **empty**: every record in it was synthetic, consistent
with Auto-Fund never having launched. All twelve entities verify at **zero**.

---

## 2. Finding requiring owner attention — synthetic commission events reached payroll

Of the 522 compensation events removed, **17 had reached the `ACKNOWLEDGED` delivery state
at Arriv Pay** (7 in the first pass, 10 in the second; the rest were `PENDING`). They
belong to synthetic employees only:

- `cert_fix_1791742740554_rep@cert.test`
- `cert_fix_1791742821033_rep@cert.test`
- `cert_1791400494677_rep@cert.arriv.internal`
- `cert_1791400468557_rep@cert.arriv.internal`

`ACKNOWLEDGED` is a delivery state on our side: Arriv Pay accepted the event, which is not
evidence that money was paid. The identities are unmistakably synthetic and the amounts
are certification amounts, so the expectation is that nothing was paid — but that cannot be
confirmed from Arriv Estate Media, and the records have now been removed from our side.

> **Recommended check:** ask Arriv Pay to confirm that no employee whose ID or email
> contains `cert` received a compensation entry on or before 2026-10-11. If one did, it is a
> synthetic-payment contamination and should be reversed there.

The delivery-state counts were captured before deletion and are preserved here so the
evidence outlives the cleanup.

---

## 3. Why fixtures were left behind — a defect in the cleanup, not just bad luck

Two distinct causes, both worth fixing:

1. **The suites' cleanup covers only part of what they create.** They track and delete
   subscriptions, wallets and contacts, but they leave **consent records, jurisdiction audit
   entries and membership notices** behind — 47 + 9 + 4 of the removals came from those
   three entities. The enrollment certification therefore looks clean while the consent and
   jurisdiction evidence of synthetic enrolments stays in production.
2. **Interrupted runs leave everything.** Several certification runs were interrupted by
   platform rate limiting, and the cleanup requests were throttled along with the rest, so
   the suite aborted mid-run.

**Recommended fix (engineering):** replace the tracked-list cleanup with a prefix-based
sweep — delete everything whose identity matches `cert*` across the Auto-Fund and wallet
entities at the end of each suite. A tracked list can only ever delete what it remembered.

**Operating guidance until then:** re-run this sweep after any certification run that
reports cleanup errors or is interrupted, and before quoting any production count.

---

## 4. A second contamination, also restored

An interrupted run of the emergency-stop suite left the **`autofund_emergency_stop`
switch engaged (`true`)** in production data. That switch is the only writer of that key in
the system, so it was a leftover rather than an owner action. It was removed, restoring the
documented posture (absent = inactive), and the emergency-stop suite was then re-run clean:
**12/12, no cleanup errors, switch left inactive.**

With the switch engaged, ordinary enrolment was refused with the reason `refused` instead
of `enrollment_closed`; that is how it surfaced — the enrolment gate was still closed, but
for the wrong recorded reason.

---

## 5. Verification after the sweep

| Suite | Result |
| --- | --- |
| Enrollment certification (`certifyAutoFundEnrollment`) | **23/23 PASS**, `production_untouched = true`, both former failures resolved |
| Membership compliance (`testAutoFundMembershipCompliance`) | **75/75** |
| Launch interlock (`testAutoFundLaunchInterlock`) | **26/26** (incl. the new `K6b`: no tier is fee-free) |
| Billing end-to-end (`testAutoFundBillingEndToEnd`) | **36/36**, 20 fixtures deleted, no cleanup errors |
| Emergency stop (`testAutoFundEmergencyStop`) | **12/12**, switch left inactive |
| V2 activation prep (`prepareAutoFundV2PricingActivation`) | **14/14**, read-only, `wrote_anything = false` |

Zero certification fixtures remain across all twelve audited entities.