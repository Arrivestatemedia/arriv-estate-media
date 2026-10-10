# Certification Synthetic Data — Cleanup Plan & Reconciliation Report

**Generated:** 2026-10-10
**Status:** READ-ONLY inventory + reversible plan. No production records have been deleted.
**Authorization required before any execution.**

---

## 1. Corrected Certification Results

### Deployed Payment Contract Suite — 20/20 PASS

| Metric | Value |
|--------|-------|
| Run ID | `cert_deployed_1791673884926` |
| Total tests | 20 |
| Passed | 20 |
| Failed | 0 |
| Production balances unchanged | YES |
| Synthetic cleanup verified | YES (0 remaining) |

**Corrected assertion:** The partial-refund test now derives expected Booking Value from `getAutoFundConfig()` (canonical tier config) instead of hardcoded values. A tier configuration change can no longer silently invalidate the assertion.

Key corrected tests:
- `PARTIAL_REFUND`: $500 Starter purchase → 55,000¢ BV. 50% refund ($250) → 27,500¢ wallet reversal. PASS.
- `PARTIAL_REFUND_COMMISSION`: $200 Auto-Fund → 22,000¢ BV (canonical). 50% refund ($100) → 11,000¢ wallet reversal + proportional commission reversal ($16 → $8). PASS. All values derived from `getAutoFundConfig(200)`, not hardcoded.

### Booking Commission Suppression Suite — 10/10 PASS

| Metric | Value |
|--------|-------|
| Total tests | 10 |
| Passed | 10 |
| Failed | 0 |
| Production balances unchanged | YES |
| Synthetic cleanup verified | YES (0 remaining, independently confirmed) |

**Fix applied this session:** The suite's `TEST_RUN_ID` was a module-level constant, which Deno isolates evaluate once and reuse across invocations. Moved to a per-invocation constant with a random suffix so back-to-back runs never collide. Also added a keyed sweep for downstream `Commission` and `CommissionSourceRecord` records (created by the two commission paths) that were previously untracked for cleanup.

---

## 2. Commission-Suppression Validation Approach

**Policy:** Wallet-funded bookings (Auto-Fund or Prepaid redemption) generate ZERO booking-level sales commission. The advisor was already compensated at wallet funding time. Standard marketplace bookings retain the existing 15% commission.

**Two commission paths tested:**

### Path A — `handleBookingSubmission` (booking-time commission)
- `BOOKING_COMMISSION_STANDARD`: Standard booking → `booking_funding_classification = standard_marketplace`, 1 commission record at 15% ($112.50 on $750). PASS.
- `BOOKING_COMMISSION_WALLET_FULL`: Fully wallet-funded → `booking_funding_classification = wallet_funded`, `wallet_applied_cents = 67500`, 0 commission records. PASS.
- `BOOKING_COMMISSION_WALLET_PARTIAL`: Partially wallet-funded ($200 wallet + $475 shortfall) → `wallet_funded`, 0 commission records. PASS.
- `BOOKING_COMMISSION_RETRY`: Duplicate submission → retry booking is new, rep's total commissions = 1 (no duplicate). PASS.

### Path B — `generateCommissionSourceRecord` (invoice-payment-time commission)
- `COMMISSION_SOURCE_STANDARD`: Standard invoice → 1 source record created ($101.25). PASS.
- `COMMISSION_SOURCE_WALLET_FUNDED`: Wallet-funded invoice → skipped, 0 records. Reason: "no commissionable source — no rep attributed, or the invoice belongs to a wallet-funded (Auto-Fund/Prepaid) booking." PASS.
- `COMMISSION_SOURCE_RETRY`: Duplicate source record generation → same record returned, no duplicate. PASS.
- `COMMISSION_SOURCE_REFUND`: Refunded invoice → existing record preserved (status: "invoice not paid"), no new record. PASS.

**Classification mechanism:** `handleBookingSubmission` classifies bookings server-side via `booking_funding_classification`:
- `wallet_applied_cents > 0` → `wallet_funded` → commission suppressed
- `wallet_applied_cents = 0` → `standard_marketplace` → 15% commission applies

This is a reliable server-side classification that cannot be bypassed by client-side input.

---

## 3. Synthetic Data Inventory

### Totals

| Metric | Value |
|--------|-------|
| Total synthetic records | 1,252 |
| Entities with synthetic data | 9 |
| Mixed-identity commissions (defect indicator) | 0 |
| Synthetic compensation delivered to Arriv Payroll (network) | 0 |

### Per-Entity Breakdown

| Entity | Synthetic | Total | Production | Run Groups |
|--------|----------|-------|-----------|-----------|
| PrepaidCompensationEvent | 343 | 343 | 0 | 264 |
| CreditLot | 158 | 158 | 0 | 49 |
| WalletTransaction | 186 | 186 | 0 | 49 |
| AutoFundPaymentEvent | 133 | 133 | 0 | 51 |
| PaymentRecoveryNotification | 117 | 117 | 0 | 12 |
| Invoice | 144 | 326 | 182 | 10 |
| PrepaidWallet | 104 | 117 | 13 | 54 |
| Contact | 40 | 158 | 118 | 39 |
| SalesTeamMember | 27 | 43 | 16 | 27 |
| AutoFundSubscription | 0 | 0 | 0 | 0 |
| Booking | 0 | — | — | — |
| Job | 0 | — | — | — |
| Commission | 0 | — | — | — |
| CommissionSourceRecord | 0 | — | — | — |

### Orphaned Children (expected, not a defect)

Certification suites delete their fixtures at the end of each run, leaving historical child records behind. These orphans are NOT production dependencies:
- `compensation_events_without_cert_transaction`: 92
- `notifications_without_cert_subscription`: 117
- `wallets_without_cert_contact`: 20

### Identification Standard

All synthetic records are identified by:
1. `certification_mode: true` boolean flag (on entities that support it)
2. `cert_` prefix on identifier fields (email, customer_id, source_event_id, etc.)

Both criteria are used in combination for maximum precision.

---

## 4. Payroll Reconciliation — 14 Acknowledged Synthetic Commission Events

### Verdict

**NO SYNTHETIC COMPENSATION REACHED ARRIV PAYROLL.** No network delivery has ever occurred for a `cert_` compensation event.

### Details

| Metric | Value |
|--------|-------|
| Events with `delivered_to_payroll = true` | 14 |
| Total acknowledged amount | $700.00 |
| Events with network delivery attempts | 0 |
| Delivery attempts observed | 0 |

The 14 events were marked `delivered_to_payroll = true` / `delivery_status = ACKNOWLEDGED` by a certification suite that simulated Arriv Pay's acknowledgment response locally. **No HTTP request was ever sent to Arriv Pay's API for these events.** The acknowledgment was a local state transition only.

### Future Delivery Exposure

| Metric | Value |
|--------|-------|
| Events eligible for a batch delivery | 329 |
| `prepaid_enabled` flag | true |
| `auto_fund_enabled` flag | true |

**Guard behavior:** `deliverPrepaidCompensation` filters a batch down to `cert_`-only events when the feature flag is OFF. When the flag is ON, that filter is skipped, so a manually triggered batch delivery would include the synthetic events.

**Reachability:** No workflow and no UI code invokes `deliverPrepaidCompensation` — the batch path is manual/admin-only today.

**Recommended hardening (needs authorization):** Make the `cert_` filter unconditional so synthetic events are never batch-delivered in any flag state. This eliminates the 329-event exposure without depending on flag state.

### Payroll Artifacts (all clean)

| Artifact | cert_referencing | total |
|---------|-----------------|-------|
| Commission (payroll batch source) | 0 | 0 |
| CommissionSourceRecord | 0 | 0 |
| PayrollReconciliation | 0 | 0 |
| PayrollPeriodSnapshot | 0 | 0 |
| PayoutHistory | 0 | 1 |
| ContractorPayoutDocument | 0 | 2 |

No payroll artifacts reference synthetic certification data. The 14 acknowledged events exist only as `PrepaidCompensationEvent` records with local state — they have no corresponding payroll periods, reconciliations, or payout documents.

### Reconciliation Action

No reversal or correction is needed in Arriv Payroll. The 14 events are isolated to Estate Media's database and have never been transmitted. When the synthetic data is cleaned (Plan A below), these 14 records will be deleted alongside the other 1,238, eliminating the exposure entirely.

---

## 5. Cleanup Plan

### Plan A (Recommended): Retain-and-Mark — Fully Reversible, Zero Deletion

**Approach:** Mark all 1,252 synthetic records with `certification_mode = true` (where the entity supports it) and a `cert_retention = "archived"` flag. No records are deleted. Production analytics already exclude `certification_mode = true` records.

**Reversibility:** Full — unsetting the flags restores the records to their prior state.

**Execution:** One run token at a time, using the `run_groups` from the inventory as exact batches (largest first). Each batch is a single transaction-scoped operation.

**Risk:** Zero. No production data is touched. The marks are additive only.

### Plan B (Deferred, needs authorization): Guarded Deletion

**Approach:** After Plan A is applied and verified, delete synthetic records in dependency order (children before parents), one run token at a time.

**Guardrails:**
- Each batch scoped to a single `cert_` run prefix — never a broad match
- Dependency-ordered deletion: compensation events → notifications → transactions → lots → payment events → subscriptions → wallets → invoices → jobs → bookings → contacts → reps
- Pre-deletion snapshot of production counts; post-deletion verification that production counts are unchanged
- Rate-limit-aware: small batches with delays between operations

**Reversibility:** None (deletion is permanent). Mitigated by Plan A's marks being applied first, and by the inventory's run-group batching providing exact rollback targets.

### Batch Order (largest run groups first)

The inventory's `run_groups` field provides the exact batches. The largest groups (by record count) should be processed first to maximize impact per batch:

1. `PrepaidCompensationEvent` run groups (264 groups, 343 records) — largest entity
2. `PrepaidWallet` run groups (54 groups, 104 records)
3. `AutoFundPaymentEvent` run groups (51 groups, 133 records)
4. `CreditLot` + `WalletTransaction` run groups (49 groups each, 158 + 186 records)
5. Remaining entities in descending group count

Each run group is a self-contained batch: all records sharing that `cert_<timestamp>` prefix can be cleaned together because they form a complete certification fixture set.

---

## 6. Certification Suite Hardening (completed this session)

| Suite | Fix | Impact |
|--------|-----|--------|
| `testBookingCommissionSuppression` | Per-invocation `TEST_RUN_ID` (was module-level) | Prevents run-id collision across isolate reuse |
| `testBookingCommissionSuppression` | Keyed sweep for downstream Commission + CommissionSourceRecord | Prevents 4-record residue per run |
| `testDeployedPaymentContract` | Partial-refund assertion uses `getAutoFundConfig()` | Prevents stale hardcoded values from masking tier changes |
| `inventoryCertificationData` | Trimmed run-group sample sizes | Reduces response size from ~79KB to usable |

---

## 7. Next Steps (requires authorization)

1. **Authorize Plan A** (retain-and-mark) — zero risk, fully reversible
2. **Authorize the `cert_` filter hardening** in `deliverPrepaidCompensation` — eliminates the 329-event batch delivery exposure
3. **Authorize Plan B** (guarded deletion) only after Plan A is verified
4. **No payroll reconciliation action needed** — the 14 acknowledged events never reached Arriv Payroll and will be eliminated by the data cleanup