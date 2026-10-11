# ARRIV AUTO-FUND MEMBERSHIP TERMS — V1

**Document:** `ARRIV_AUTOFUND_MEMBERSHIP_TERMS_V1.md`
**Status:** **DRAFT — PREPARED FOR LEGAL REVIEW. NOT EFFECTIVE. NOT SERVED TO ANY CUSTOMER.**
**Date prepared:** 2026-10-11
**Prepared under:** Owner directive on a legally conservative Auto-Fund membership policy, following review of 15 U.S.C. § 8403 (ROSCA), Georgia O.C.G.A. § 10-1-439.9 and related provisions, and Maryland Commercial Law § 14-1329.

---

## 0. AUTHORITY, LIMITS, AND CURRENT STATE

**This is not a legal opinion.** It is an implementation-aligned policy draft prepared for counsel. Nothing in this document, and no automated check in this system, constitutes legal advice or a legal conclusion about compliance. Statutory applicability must be determined by counsel.

**Nothing here is active.** As prepared:

| Control | Value | Meaning |
|---|---|---|
| `AUTOFUND_FINAL_FLAGS.enrollment_enabled` | **`false`** | No customer can enrol |
| `AUTOFUND_FINAL_FLAGS.membership_fee_enabled` | **`false`** | No fee is charged, billed or recorded |
| AppSetting `autofund_enrollment_enabled` | **absent** | Owner's launch gate remains closed |
| `fee_refund_policy` default | **`undetermined`** | Refundability deliberately unresolved pending legal approval |

Enrollment requires **both** the code flag and the AppSetting switch. Neither is on. **No membership fee has been collected, and none can be collected while these remain as they are.**

**Unchanged by this preparation:** the five approved tiers, their bonuses, the membership-fee amounts, MLS pricing, commission structure, and promotional-credit redemption restrictions. Live retail pricing remains V1. The certified five-tier payment processor remains verified deployed (`v3_five_tier_20261011`, 26/26 deployed checks passing).

---

## 1. THE PROGRAM

Auto-Fund is a single recurring monthly charge. It has **two components where a fee applies**, and they are billed together, not separately:

| Tier | Monthly wallet deposit | Promotional bonus | **Monthly membership fee** | **Total recurring charge** |
|---|---|---|---|---|
| Starter | $150 | $7.50 | $0 | **$150** |
| Growth | $250 | $25.00 | $0 | **$250** |
| Professional | $350 | $52.50 | $25 | **$375** |
| Premier | $500 | $100.00 | $25 | **$525** |
| VIP | $1,000 | $250.00 | $25 | **$1,025** |

**Nature of each component — the distinction that governs these terms:**

1. **The monthly wallet deposit** funds the customer's Arriv Wallet as Booking Value. This is a customer cash-funded balance.
2. **The promotional bonus** is additional promotional Booking Value granted with the deposit. It carries the restrictions set out in §3.4.
3. **The membership fee** ($25, Professional/Premier/VIP only) is **collected revenue**. It is charged for access to the disclosed membership benefits during the applicable monthly service period. It is **not** a wallet deposit. It does **not** generate Booking Value, promotional credit, or sales commission. It is never a customer wallet liability and is identified separately in billing, reconciliation and reporting.

Because the deposit and the fee are **one recurring charge**, cancelling Auto-Fund stops both. They cannot be cancelled separately — and the customer is told so plainly.

---

## 2. CUSTOMER-FACING MEMBERSHIP TERMS (V1 DRAFT)

> **Drafting note for counsel:** wording below is deliberately non-absolute on refundability, as directed. Version label to be assigned at approval and stored as `terms_version`.

### 2.1 What you are enrolling in

Auto-Fund is a recurring monthly arrangement. Each month you are charged the **total recurring monthly charge** for your tier, shown on your enrollment screen and in your confirmation. That single charge is made up of your wallet deposit and, on the Professional, Premier and VIP tiers, a separate membership fee.

### 2.2 Your wallet deposit

Your deposit funds your Arriv Wallet as Booking Value and can be used toward services. Your cash-funded Booking Value does not expire while your Auto-Fund membership remains active.

### 2.3 Your membership fee (Professional, Premier and VIP tiers)

Your membership fee is $25 per month. It is charged for access to the membership benefits listed in your disclosure during that monthly period. Your membership fee:

- is **not** added to your wallet and is **not** spendable;
- does **not** earn promotional Booking Value;
- is **not** refundable as wallet value, because it is not wallet value; and
- is billed as part of your single recurring charge, but is itemised separately on your receipt.

### 2.4 Promotional Booking Value and its restrictions

Your promotional bonus Booking Value is granted by Arriv at no additional cash cost to you. It is usable on eligible services and, subject to the restrictions below, on standalone MLS Walkthroughs. On the **VIP** tier, promotional Booking Value cannot be used toward a standalone MLS Walkthrough; your **cash-funded** Booking Value can be used on anything, including a standalone MLS Walkthrough. Promotional credit may be applied only up to the retail value of eligible non-MLS services actually present in your cart. Your exact restriction is stated on your enrollment disclosure.

### 2.5 Changing your plan

You may change your Auto-Fund tier from your dashboard. A change applies to future billing periods and does not retroactively alter Booking Value already issued to you.

### 2.6 Cancelling

You may cancel at any time, online, from your dashboard. See §4.

### 2.7 Membership fee refunds

See §5.

### 2.8 Your wallet balance if you cancel

Cancelling your membership **does not** erase your cash-funded Booking Value. See §5.3.

### 2.9 Governing terms

These terms are versioned. The version you accepted is recorded with your enrollment. If Arriv changes these terms in a way that materially affects you, Arriv will notify you and, where required, obtain your renewed consent before the change applies to your billing.

---

## 3. EXACT CHECKOUT DISCLOSURE TEXT

> **This is the required pre-authorization disclosure.** Every item below must be visible **before** the customer can authorize payment, on the same screen as the authorization control. Required by owner directive §5.

### 3.1 Canonical disclosure block (verbatim display copy)

```
ARRIV AUTO-FUND MEMBERSHIP — RECURRING PAYMENT AUTHORIZATION

Your plan:            {TIER_NAME} — ${DEPOSIT} per month
Billing frequency:    Monthly, recurring, until you cancel
First charge:         {FIRST_CHARGE_DATE}
Renews each month on: day {BILLING_DAY} of the month

  Monthly wallet deposit ..................... ${DEPOSIT}
  Promotional bonus Booking Value ............ ${BONUS}   (granted by Arriv, not charged)
  Monthly membership fee ..................... ${FEE}
  ─────────────────────────────────────────────────────
  TOTAL RECURRING MONTHLY CHARGE ............. ${TOTAL}

MEMBERSHIP BENEFITS YOU RECEIVE
{BENEFITS_LIST}

PROMOTIONAL-CREDIT RESTRICTIONS
{PROMO_RESTRICTION_TEXT}

CANCELLATION
You can cancel any time from your dashboard — Auto-Fund → Cancel. You do not
need to call or speak to a salesperson. Cancelling stops all future monthly
charges; your deposit and your membership fee are one recurring charge and
cannot be cancelled separately. Cancelling does not erase your cash-funded
Booking Value.

MEMBERSHIP-FEE REFUND POLICY
{REFUND_POLICY_TEXT}

YOUR WALLET — REFUNDS AND UNUSED BALANCES
{WALLET_TERMS_TEXT}

ARRIVAL OF YOUR AUTHORIZATION
By checking the box below and completing enrollment, you authorize Arriv Estate
Media to charge ${TOTAL} to your payment method each month on a recurring basis,
beginning {FIRST_CHARGE_DATE}, until you cancel.

[ ]  I have read and agree to the Auto-Fund Membership Terms (version
     {TERMS_VERSION}) and I authorize the recurring monthly charge of
     ${TOTAL} described above.

          [ Authorize and enroll ]
```

### 3.2 The authorization control — binding requirements

- The consent checkbox **must be unchecked by default.** A pre-checked box, or authorization inferred from continued use, is not acceptable.
- Authorization is only valid when the customer personally checks it. See §7.
- The customer must be able to **retain** the disclosure and a copy of the accepted terms (enrollment acknowledgment is emailed and remains available in the dashboard).

### 3.3 Instantiated per-tier disclosures (exact values)

| Tier | Deposit line | Promo bonus line | Fee line | Total line |
|---|---|---|---|---|
| Starter | `$150` | `$7.50` | `$0` | **`$150`** |
| Growth | `$250` | `$25.00` | `$0` | **`$250`** |
| Professional | `$350` | `$52.50` | `$25` | **`$375`** |
| Premier | `$500` | `$100.00` | `$25` | **`$525`** |
| VIP | `$1,000` | `$250.00` | `$25` | **`$1,025`** |

The membership-fee statement, verbatim as generated today:

- **Fee tiers:** "Your total recurring charge is `${TOTAL}` per month: `${DEPOSIT}` funds your wallet as Booking Value and `$25` is your membership fee. The membership fee is not spendable and does not earn promotional credit."
- **No-fee tiers:** "Your total recurring charge is `${DEPOSIT}` per month, all of which funds your wallet as Booking Value."

---

## 4. CANCELLATION LANGUAGE

### 4.1 Customer-facing text

> **Cancelling Auto-Fund**
>
> You can cancel at any time from your account dashboard, under **Auto-Fund → Cancel**. You do not need to contact a salesperson, call us, or send an email to cancel — if you enrolled online, you can cancel online.
>
> When you cancel:
>
> - All **future** monthly charges stop, in accordance with the cancellation terms disclosed to you at enrollment. Because your deposit and your membership fee are a single recurring charge, cancelling stops both.
> - **Already-issued Booking Value stays in your wallet.** Cancelling does not erase, forfeit, or confiscate the Booking Value funded by your own cash deposits. You may continue to use your remaining balance.
> - Unless the law requires otherwise, membership benefits already paid for remain available to you through the end of the membership period you have already paid for.
> - We will send you a **cancellation confirmation** and keep a record of your cancellation.
>
> There are **no cancellation penalties** and **no minimum commitments**. You are not required to buy a minimum number of months.

### 4.2 Required system behaviour (policy requirements on implementation)

| Requirement | State |
|---|---|
| A clear, accessible online cancellation control, not requiring a salesperson | **Present** — customer dashboard "Cancel" action |
| Cancellation stops future recurring charges | **Present** |
| Wallet preserved on cancellation | **Present** — cancel action explicitly preserves wallet value and transaction history |
| No cancellation penalty or minimum commitment | **Present** — no penalty logic exists |
| Cancellation confirmation sent to the customer | **Gap** — see §9 |
| Auditable cancellation record preserved | **Partial** — `cancelled_at`, `cancel_reason` and status are stored on the subscription; a dedicated immutable cancellation event log is a gap |

---

## 5. REFUND LANGUAGE

### 5.1 Membership fee

> **Membership fee refunds**
>
> A correctly charged membership fee is **generally not refundable once the membership period has begun** and the membership benefits for that period have been made available to you.
>
> However:
>
> - If you are charged a membership fee for a **future** membership period that has **not yet begun**, and you cancel **before that period starts**, we will refund that fee.
> - We will refund any **duplicate, erroneous, or unauthorized** membership charge.
> - If Arriv **materially fails to provide** the membership benefits described in these terms, you are entitled to an appropriate **refund, adjustment, or other remedy**.
> - Nothing in this section limits any refund or cancellation right you have under **applicable federal or state law.** Where such law gives you a greater right than these terms, that right applies.

> **Drafting constraint honoured:** the fee is never described as "absolutely" or "unconditionally" nonrefundable. The words "not refundable" appear only as part of the qualified "generally not refundable once the membership period has begun" construction, with the carve-outs above.

### 5.2 What is never done

- **No forfeiture or automatic confiscation of cash-funded wallet balances.** Cancelling, lapsing, or failing to use a membership never causes Arriv to take a customer's cash-funded Booking Value.
- Arriv does **not** assume unused customer deposits are nonrefundable or may expire. That question is expressly reserved for legal review (§10).

### 5.3 Wallet balances on cancellation

> **Your wallet when you cancel**
>
> Cancelling your membership does not erase your cash-funded Booking Value. Your balance remains in your wallet and remains usable.
>
> Your wallet contains two kinds of Booking Value: Booking Value funded by **your cash deposits**, and **promotional** Booking Value granted by Arriv. Promotional Booking Value remains subject to its restrictions. Cash-funded Booking Value is not forfeited by cancelling.
>
> The terms on refunds of unused cash-funded balances, and any expiry, are governed by Arriv's separately approved prepaid-service terms. [PLACEHOLDER — pending legal review, see §10.]

---

## 6. VERSIONED CONSENT REQUIREMENTS

Consent for recurring billing must be **express, affirmative, personal to the customer, and versioned**.

| Requirement | Implementation |
|---|---|
| Terms carry an explicit version label | `terms_version` written on the subscription at enrollment |
| Version label reflects the approved terms | **Action required:** `CURRENT_TERMS_VERSION` must be set to the approved V1 label before enrollment opens |
| Timestamp of acceptance | `terms_accepted_at` |
| Identity of the accepting customer | `terms_accepted_by` — recorded as the customer's own email |
| Enrollment blocked without acceptance | **Present** — enrollment is rejected when affirmative acceptance is absent |
| Affirmative acceptance captured from the customer, not a salesperson | **Present** — see §7 |
| Consent record retained, and retrievable for audit | Stored on the subscription and surfaced in the admin subscription view |
| Renewed consent on material change | **Gap** — no re-consent flow exists for a version change. Required before any material change is applied to billing. |

**Consent must never be inferred** from continued use, from a pre-checked box, or from a salesperson's statement. The `terms_accepted_by` value is the audit answer to "who accepted this?" and must always resolve to the customer.

---

## 7. SALES-ASSISTED ENROLLMENT

Sales Growth Advisors may explain benefits and help a customer enrol. The following are mandatory and are already enforced by the enrollment engine:

1. **The customer must personally review and accept the recurring payment terms.** Acceptance is rejected unless affirmative acceptance is present and attributable to the customer.
2. **A salesperson may never accept on the customer's behalf.** The customer's own acceptance is the authorization; a salesperson cannot supply it.
3. **A salesperson may never override approved financial amounts.** Tier amounts, bonuses and fees come from the approved configuration; advisors cannot re-price.
4. **The same disclosure and billing system is used for self-service and sales-assisted enrollment**, so pricing and benefit parity is structural rather than a matter of advisor discipline.
5. **Advisor attribution is recorded separately from consent** and never substitutes for it. Attribution affects compensation eligibility only; it is not a form of authorization.

---

## 8. REQUIRED BILLING NOTIFICATIONS

Required notification events. Cadence and channel must be confirmed by counsel against each applicable statute (§10).

| # | Notification | Trigger | State |
|---|---|---|---|
| 1 | **Enrollment acknowledgment** — retainable copy of terms, tier, amounts, total recurring charge, terms version, and the consent record | On enrollment | **Gap** — must be added |
| 2 | **Pre-renewal reminder** — stating the amount and date of the upcoming charge, and how to cancel | Before each renewal, at the cadence counsel specifies | **Gap** — must be added |
| 3 | **Charge receipt** — itemising deposit vs membership fee separately | On each successful charge | **Partial** — fee/deposit separation exists in the ledger; customer-facing receipt is a gap |
| 4 | **Cancellation confirmation** — confirming the effective date and that no further charges will be made | On cancellation | **Gap** — must be added |
| 5 | **Change-of-terms notice** — with renewed consent where material | On any material change | **Gap** — depends on the re-consent flow in §6 |
| 6 | **Price-change notice** — before any change to the recurring amount applies | Before the change takes effect | **Gap** — must be added |
| 7 | **Renewal-terms notice** — if counsel determines a periodic renewal-terms disclosure is required | At the statutory interval | **To be specified by counsel** |
| 8 | **Failed-payment and recovery notices** — with a self-service route to update the payment method | On failure, and on the recovery schedule | **Present** — recovery notification system exists and is separate from this work |
| 9 | **State-specific reminders and cancellation protections** — if counsel identifies a state requiring a specific notice | Per state | **To be specified by counsel** |

**Free-trial and promotional-period reminders are not applicable** — Auto-Fund has no free trial and no discounted introductory period.

---

## 9. IMPLEMENTATION STATUS AGAINST THIS POLICY

Summary of what exists and what must be built before enrollment can lawfully open. **None of these gaps are activated by preparing this document.**

### Already in place

- Five-tier configuration at the approved amounts, bonuses and fees.
- Membership fee modelled as collected revenue — structurally excluded from Booking Value, promotional credit and commission.
- Deposit and fee separated in the ledger and in payment events.
- Enrollment gated by two independent controls, both closed.
- Express affirmative acceptance required; enrollment refused without it.
- `terms_version`, `terms_accepted_at` and `terms_accepted_by` recorded.
- Salesperson acceptance prevented; advisor attribution separated from consent.
- Online self-service cancellation preserving wallet balances; no penalty, no minimum term.
- Refundability unresolved at `undetermined`, correctly refusing to assume non-refundability.
- Payment-recovery notification system.

### Required before enrollment opens

1. **Complete the pre-authorization disclosure screen** to show all eleven required items from §3, including billing frequency and renewal date, benefits, promotional restrictions, cancellation procedure, **membership-fee refund policy**, and **separate wallet refund / unused-balance terms** — the last two are currently absent from the disclosure payload.
2. **Set `CURRENT_TERMS_VERSION`** to the approved V1 label.
3. **Build the enrollment acknowledgment** (notification 1) and **pre-renewal reminder** (notification 2).
4. **Build the cancellation confirmation** (notification 4).
5. **Build the change-of-terms re-consent flow** (notification 5 and §6).
6. **Correct absolute fee language before it can ever be shown.** The existing wording for one non-refundability setting reads "The membership fee is not refundable." That phrasing is absolute and conflicts with the directive that fees must never be described as absolutely or unconditionally nonrefundable. It is **unreachable today** (the policy is `undetermined` and the fee flag is off) but must be rewritten before any such setting can be selected. Suggested replacement, for counsel to approve:
   > "A correctly charged membership fee is generally not refundable once the membership period has begun and the membership benefits for that period have been made available. This does not limit any refund right you have under applicable law. If you are charged for a membership period that has not begun and you cancel before it starts, that fee will be refunded."
7. **Confirm the wallet refund and unused-balance terms** (§5.3 placeholder) from the separately approved prepaid-service terms.
8. **Set `fee_refund_policy`** to the value counsel/owner approves, and set the matching disclosure text.

---

## 10. OUTSTANDING LEGAL QUESTIONS — NOT RESOLVABLE THROUGH IMPLEMENTATION

These require a legal determination. Each is listed with what the system can and cannot answer.

1. **Final membership-fee refundability.** Which of `undetermined` / `non_refundable` / `refundable_full` / `refundable_prorated` is lawful for each tier, and the exact approved wording. The system can implement any; it cannot choose.
2. **Whether consumer statutes reach business customers.** Arriv serves both individuals and commercial organisations. Whether, and how far, 15 U.S.C. § 8403, O.C.G.A. § 10-1-439.9 and Md. Code Com. Law § 14-1329 reach Auto-Fund enrolments held by **business** entities is a legal question. Related implementation question: **AutoFundSubscription currently carries no reliable consumer-vs-business marker**, so if the answer is "different rules apply," the system cannot yet segment enrolments. A determination is needed on whether such a field must be added.
3. **Required reminder cadence and format.** The exact number of days before renewal, the channel (email, SMS, in-app), and whether a reminder is required for **each** renewal or only certain ones, under each applicable statute.
4. **Renewal-terms notice obligations.** Whether a periodic renewal-terms disclosure is required, at what interval, and in what form.
5. **Cancellation-medium requirement.** Whether any applicable statute requires cancellation to be available by the same medium used to enrol, and whether the dashboard control satisfies it where enrolment was sales-assisted.
6. **Prepaid-balance treatment.** Whether unused cash-funded Booking Value must be refundable on demand; whether it may expire; and — critically — **whether dormant balances fall under unclaimed-property / escheat obligations**, and at what dormancy period. This is the largest unresolved financial exposure and is not answerable by code.
7. **Promotional Booking Value expiry and forfeiture.** Whether promotional Booking Value may expire or be forfeited, and what disclosure is required if it may.
8. **Itemisation on statements.** Whether the $25 fee must be separately itemised on the customer's card statement or receipt, beyond the separate ledger treatment already implemented.
9. **Whether the membership benefits constitute a "membership"** triggering specific state disclosure or cancellation rights beyond those in §3–§5.
10. **Remedy standard for material failure to provide benefits.** Whether an "appropriate refund, adjustment, or other remedy" needs a defined schedule or cap.
11. **VIP MLS promotional restriction.** Whether restricting promotional credit for the VIP tier must be disclosed as a limitation on the value received, and in what terms.
12. **VIP add-on preferred pricing.** Whether the 10% capped VIP add-on discount requires price-comparison or "was/now" disclosures.
13. **Consent-record retention period** and the required retention of the disclosure as shown at the time of consent.
14. **Separate terms documents.** Whether consumer and business enrolments require separate terms documents.
15. **Order of precedence** between these membership terms and any B2B master agreement, where a commercial customer also holds an Auto-Fund membership.

---

## 11. ACTIVATION GATE

Enrollment and membership-fee collection **remain closed** and must stay closed until **all** of the following are true:

1. Legal review under §10 is complete and counsel has approved the final terms, disclosure text and refund policy.
2. The owner has given **final authorization** of the terms and the refund policy following legal review.
3. The §9 implementation gaps are closed and verified.
4. `fee_refund_policy` is set to the approved value, and `CURRENT_TERMS_VERSION` to the approved label.
5. Only then: `AUTOFUND_FINAL_FLAGS.enrollment_enabled`, the AppSetting `autofund_enrollment_enabled`, and `membership_fee_enabled` are set — as a discrete, separately authorized step.

**This document does none of that.** It prepares the policy for review and changes no gate, no price, no fee and no customer record.