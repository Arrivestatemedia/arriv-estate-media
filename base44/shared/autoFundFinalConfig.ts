// ============================================================================
// ARRIV AUTO-FUND — FINAL APPROVED STRUCTURE (STAGING ONLY)
// ============================================================================
// Implements the owner-approved Auto-Fund restructure. EVERY behaviour change is
// gated by a feature flag that is DISABLED. While the flags are off this module
// reports a zero membership fee and no promotional restriction, so the existing
// production financial ecosystem is untouched.
//
// Approved structure:
//
//   Deposit    Membership fee   Promotional bonus   Total Booking Value
//   $50        $0               $0                  $50
//   $100       $0               $5                  $105
//   $200       $0               $20                 $220
//   $350       $25              $52.50              $402.50
//   $500       $25              $100                $600
//   $1,000     $25              $250                $1,250   (VIP)
//
// The membership fee is COLLECTED REVENUE. It is NOT spendable Booking Value, it
// generates NO promotional credit, and it is NEVER a customer wallet liability.
// It is identified separately in billing, reconciliation, refunds and reporting.
//
// MLS policy: no standalone booking-count allowance at any tier. Promotional
// credit may be used on standalone MLS Walkthroughs at $50-$500. On the VIP tier
// promotional credit may NOT pay for a standalone MLS Walkthrough, but VIP
// cash-funded Booking Value remains fully usable there.
// ============================================================================

export const AUTOFUND_FINAL_FLAGS = {
  /** Master switch. While false, Auto-Fund enrollment stays closed. */
  enrollment_enabled: false,
  /** While false, no membership fee is charged, billed, or recorded. */
  membership_fee_enabled: false,
  /** While false, VIP promotional credit may still be used on standalone MLS. */
  vip_mls_promo_restriction_enabled: false,
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

/** Approved monthly membership fee by deposit amount. */
export const AUTOFUND_MEMBERSHIP_FEE: Record<number, number> = {
  50: 0, 100: 0, 200: 0, 350: 25, 500: 25, 1000: 25,
};

/** Monthly membership fee actually chargeable right now (zero while the flag is off). */
export function getMembershipFee(amount: number): number {
  if (!AUTOFUND_FINAL_FLAGS.membership_fee_enabled) return 0;
  return AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
}

/** The full recurring monthly charge the customer sees: wallet deposit plus membership fee. */
export function getTotalMonthlyCharge(amount: number): number {
  return amount + (AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0);
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

/** Plain-language disclosure shown to the customer before enrollment. */
export function buildEnrollmentDisclosure(amount: number, isVipTier: boolean) {
  const fee = AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
  const base = {
    monthly_deposit: amount,
    monthly_membership_fee: fee,
    total_recurring_monthly_charge: amount + fee,
    fee_is_spendable_booking_value: false,
    fee_generates_promotional_credit: false,
    cancel_or_change_anytime: true,
    paid_booking_value_never_expires_while_subscribed: true,
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