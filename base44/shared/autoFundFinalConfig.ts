// ============================================================================
// ARRIV AUTO-FUND — FINAL APPROVED STRUCTURE (STAGING ONLY)
// ============================================================================
// Implements the owner-approved Auto-Fund restructure. EVERY behaviour change is
// gated by a feature flag. On 2026-10-11, under explicit owner authorization,
// membership-fee billing, the VIP promotional-credit MLS restriction and MLS V2
// pricing were enabled, and Auto-Fund ENROLLMENT was opened on the owner's final
// authorization with counsel recorded (Macklemore & Garrison) and the named-cohort
// requirement removed. Enrollment nonetheless charges nobody: each customer must
// personally authorize the recurring amount and its terms first, and no existing
// customer is enrolled or billed automatically.
//
// Approved structure:
//
//   Tier          Deposit      Fee      Promo bonus   Total Booking Value   Total charge
//   Starter        $150        $5.99     $7.50        $157.50               $155.99
//   Growth         $250        $10       $25          $275                  $260
//   Professional   $350        $25       $52.50       $402.50               $375
//   Premier        $500        $27       $100         $600                  $527
//   VIP            $1,000      $30       $250         $1,250                $1,030
//
// FINAL APPROVED COMMERCIAL CONFIGURATION (owner, 2026-10-11). The fee amounts were
// revised from the earlier draft schedule ($0 / $0 / $25 / $25 / $25), so every tier's
// total recurring charge changed and the membership-terms version advanced to
// autofund_membership_v2. The material change and the recorded clearance are set out
// in ARRIV_AUTOFUND_LEGAL_CLEARANCE_RECORD.md.
//
// FIVE TIERS. The former $50 / $100 / $200 entry options are RETIRED from new
// enrollment and are replaced by the $150 Starter and $250 Growth tiers.
//
// The membership fee is COLLECTED REVENUE. It is NOT spendable Booking Value, it
// generates NO promotional credit, and it is NEVER a customer wallet liability.
// It is identified separately in billing, reconciliation, refunds and reporting.
//
// MLS policy: no standalone booking-count allowance at any tier. Promotional
// credit may be used on standalone MLS Walkthroughs at Starter-Premier. On the VIP tier
// promotional credit may NOT pay for a standalone MLS Walkthrough, but VIP
// cash-funded Booking Value remains fully usable there.
// ============================================================================

/**
 * ACTIVATION RECORD — 2026-10-11, explicit owner authorization (FINAL).
 *
 * ENABLED: membership-fee billing at the final approved schedule
 *          ($5.99 / $10 / $25 / $27 / $30; totals $155.99 / $260 / $375 / $527 / $1,030),
 *          the VIP promotional-credit standalone-MLS restriction, MLS Walkthrough V2
 *          pricing ($120 / $145 / $170 / $220 / $295) and Auto-Fund ENROLLMENT on both
 *          the public self-service and sales-assisted channels.
 * RECORDED: the owner supplied the approving counsel — Tommy Garrison of Macklemore &
 *          Garrison, approving on 2026-10-11 Membership Terms v2, Wallet Agreement v1,
 *          the final fees and recurring charges, and the disclosures and refund policy.
 *          Both legal decisions were recorded through manageAutoFundLaunch with that
 *          counsel reference, against those exact versions.
 * REMOVED: the named-cohort requirement (autofund_cohort_required = 'false'). Enrollment
 *          is open to any ELIGIBLE customer who voluntarily selects a membership;
 *          eligibility, identity, consent, payment authorization and the launch
 *          interlock are all still enforced on every enrollment.
 * PRESERVED: the emergency stop, refunds, dispute handling, wallet accounting and
 *          commission protections. No existing customer is enrolled or billed
 *          automatically, and no fee can be raised without the customer's own
 *          affirmative authorization of the recurring charge.
 *
 * The fee switch ships with the fee schedule: the interlock refuses any fee-bearing
 * tier while billing is off, and with the final schedule every tier bears a fee, so
 * enrollment is refused entirely while that switch is off.
 */
export const AUTOFUND_FINAL_FLAGS = {
  /**
   * Master switch. OPENED 2026-10-11 under the owner's FINAL enrollment
   * authorization, with the legal record completed (approving counsel
   * Macklemore & Garrison). It opens nothing on its own: the owner switch
   * (autofund_enrollment_enabled = 'true') must also be on, and while either is
   * off no new enrollment is accepted. Every customer is still required to
   * authorize the recurring charge personally before any charge is raised.
   */
  enrollment_enabled: true,
  /** While false, no membership fee is charged, billed, or recorded. */
  membership_fee_enabled: true,
  /** While false, VIP promotional credit may still be used on standalone MLS. */
  vip_mls_promo_restriction_enabled: true,
} as const;

/**
 * AppSetting key that must ALSO be explicitly 'true' before any customer can be
 * enrolled. Absent or false means enrollment is closed. This is the owner's
 * launch gate and is independent of the pre-existing prepaid/Auto-Fund
 * enablement flag, so enrollment cannot reopen by accident.
 */
export const AUTOFUND_ENROLLMENT_FLAG_KEY = 'autofund_enrollment_enabled';

/** Enrollment is open only when BOTH the code flag and the AppSetting switch are on. */
export function isEnrollmentOpen(appSettingValue: string | null | undefined): boolean {
  return AUTOFUND_FINAL_FLAGS.enrollment_enabled && appSettingValue === 'true';
}

/**
 * Approved monthly membership fee by deposit amount.
 *
 * FINAL APPROVED COMMERCIAL CONFIGURATION (owner, 2026-10-11). These amounts differ
 * MATERIALLY from the earlier draft schedule ($0 / $0 / $25 / $25 / $25) that was
 * prepared for legal review, which is why the membership-terms version advanced to
 * `autofund_membership_v2`. The interlock still refuses launch while the fee switch is
 * off, so no customer can be charged any of these amounts before activation.
 */
export const AUTOFUND_MEMBERSHIP_FEE: Record<number, number> = {
  150: 5.99, 250: 10, 350: 25, 500: 27, 1000: 30,
};

// ┌────────────────────────────────────────────────────────────────────────────
// LEGACY TIER GRANDFATHERING (owner-confirmed 2026-10-11)
// ─────────────────────────────────────────────────────────────────────────────
// The retired tiers and their exact contractual terms:
//   $50  deposit, 0% bonus, $50.00 Booking Value
//   $100 deposit, 5% bonus, $105.00 Booking Value
//   $200 deposit, 10% bonus, $220.00 Booking Value
//
// These are NEVER offered to a new customer and are absent from the enrollable
// tier list. They exist only so an existing legacy subscription or contractual
// entitlement continues to fund at its contracted terms. The operative resolver
// is getAutoFundConfig in prepaidEngine.ts.
//
// A live audit on 2026-10-11 found ZERO AutoFundSubscription records (zero
// active, zero paused legacy subscribers) and zero real customer wallets, so the
// terms are preserved for historical compatibility WITHOUT creating migration
// records. No customer is silently migrated and no earned Booking Value is
// removed.
// ─────────────────────────────────────────────────────────────────────────────
export const AUTOFUND_LEGACY_TIER_TERMS: Record<number, { bonus_pct: number; booking_value: number }> = {
  50: { bonus_pct: 0, booking_value: 50 },
  100: { bonus_pct: 5, booking_value: 105 },
  200: { bonus_pct: 10, booking_value: 220 },
};

/** Retired tiers. Preserved for grandfathering; never enrollable. */
export const AUTOFUND_LEGACY_TIER_AMOUNTS = [50, 100, 200];

/**
 * Monthly membership fee actually chargeable right now (zero while the flag is off).
 *
 * `feeEnabled` defaults to the LIVE feature flag, so every ordinary caller gets the
 * genuinely chargeable fee. The launch interlock and the certification suite pass an
 * explicit value so the fee that WOULD apply in a declared configuration can be
 * resolved and verified WITHOUT activating billing for anyone.
 */
export function getMembershipFee(
  amount: number,
  feeEnabled: boolean = AUTOFUND_FINAL_FLAGS.membership_fee_enabled,
): number {
  if (!feeEnabled) return 0;
  return AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
}

/**
 * The fee the APPROVED SCHEDULE specifies, regardless of whether billing is live.
 * This is a configuration fact, never a customer-facing statement: it must never be
 * shown as the amount a customer will be charged. Customer-facing amounts always
 * resolve through getMembershipFee, so the disclosure can never overstate the charge.
 */
export function scheduledFeeForTier(amount: number): number {
  return AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
}

/**
 * The full recurring monthly charge the customer authorizes: wallet deposit plus
 * membership fee.
 *
 * Resolved through getMembershipFee so the charge always equals the fee that is
 * actually billed and recorded. Reading the fee table directly here (as this
 * function previously did) produced an internally contradictory record while the
 * fee switch was off: a $375 charge carrying a $0 membership fee, which would
 * have commingled an unnamed $25 into wallet funding — the exact failure the
 * separate fee component exists to prevent.
 */
export function getTotalMonthlyCharge(amount: number, feeEnabled?: boolean): number {
  return amount + getMembershipFee(amount, feeEnabled);
}

/** True when this tier is currently barred from using promotional credit on a standalone MLS Walkthrough. */
export function isVipMlsPromoRestricted(tier: number, isVip: boolean): boolean {
  return isVip && AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled;
}

/** Service families promotional credit may be applied to on a restricted (VIP) tier. */
export const VIP_PROMO_ELIGIBLE_SERVICES = [
  'photo_essentials',
  'photo_cinematic',
  'premium_bundle',
] as const;

/**
 * The qualifying-bundle guard.
 *
 * Promotional credit may be applied only up to the retail value of the eligible
 * non-MLS services ACTUALLY PRESENT in the cart. A token add-on therefore unlocks
 * only its own retail value, so it cannot be used to bypass the standalone MLS
 * restriction. A cart with no eligible service returns a cap of zero.
 *
 * @returns the promotional-credit cap in cents.
 */
export function vipPromoCreditCap(
  parts: { package_id: string; retail_cents: number; is_mls_walkthrough: boolean }[],
): number {
  const eligible = parts.filter(p => !p.is_mls_walkthrough && p.retail_cents > 0);
  if (!eligible.length) return 0;
  return eligible.reduce((sum, p) => sum + p.retail_cents, 0);
}

/**
 * Plain-language disclosure shown to the customer before enrollment.
 *
 * The fee and the total come from getMembershipFee, NOT from the approved schedule
 * table. While billing is switched off that means $0 and a total equal to the deposit
 * — the amount actually charged. Reading the schedule table here stated a fee the
 * customer would never be billed, which is precisely the disclosure/charge divergence
 * the launch interlock now refuses to let reach a customer.
 */
export function buildEnrollmentDisclosure(amount: number, isVipTier: boolean, feeEnabled?: boolean) {
  const fee = getMembershipFee(amount, feeEnabled);
  const base = {
    monthly_deposit: amount,
    monthly_membership_fee: fee,
    total_recurring_monthly_charge: amount + fee,
    fee_is_spendable_booking_value: false,
    fee_generates_promotional_credit: false,
    cancel_or_change_anytime: true,
    // CORRECTED: this field previously asserted `paid_booking_value_never_expires_while_subscribed: true`.
    // That was FALSE. autoFundProcessor issues EVERY funding lot with a 12-month
    // validity (addMonths(new Date(), 12)) and the daily "Prepaid Lot Expiration"
    // workflow retires a lot once that period ends, reducing the wallet balance.
    // A false non-expiry promise was being shown to customers. The verified
    // behaviour is stated instead, and the lawfulness of expiring customer-funded
    // value is logged as an unresolved legal question in autoFundWalletTerms.ts.
    cash_funded_value_forfeited_on_cancellation: false,
    funding_lot_validity_months: 12,
    wallet_cash_out_available: false,
  };
  return {
    ...base,
    promotional_credit_usable_on_standalone_mls_walkthrough: !isVipTier,
    note: isVipTier
      ? 'Your promotional Booking Value can be used on eligible photography, video, premium packages and qualifying bundles. It cannot be used on a standalone MLS Walkthrough. Your cash-funded Booking Value can be used on anything, including standalone MLS Walkthroughs.'
      : 'Your promotional Booking Value can be used on eligible services, including standalone MLS Walkthroughs, subject to your available balance.',
    membership_fee_statement: fee > 0
      ? `Your total recurring charge is $${amount + fee} per month: $${amount} funds your wallet as Booking Value and $${fee} is your membership fee. The membership fee is not spendable and does not earn promotional credit.`
      : `Your total recurring charge is $${amount} per month, all of which funds your wallet as Booking Value.`,
  };
}