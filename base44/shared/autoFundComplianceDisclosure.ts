// ============================================================================
// ARRIV AUTO-FUND — COMPLIANCE DISCLOSURE PACKAGE
// ============================================================================
// The SINGLE authoritative source for every pre-authorization disclosure item.
// Both enrollment channels (self-service and sales-assisted) plus the tier
// catalog render from this one function, so a material recurring-billing
// disclosure cannot differ between channels or drift from the configuration.
//
// Policy: every MATERIAL recurring-billing disclosure is stated IN TEXT on the
// authorization screen. The link to the complete versioned terms is provided in
// ADDITION to those statements — never as a substitute for them.
// ============================================================================

import { getAutoFundConfig } from './prepaidEngine.ts';
import { AUTOFUND_MEMBERSHIP_FEE, buildEnrollmentDisclosure } from './autoFundFinalConfig.ts';
import {
  buildFeeRefundDisclosure,
  type FeeRefundPolicy,
} from './autoFundMembershipBilling.ts';
import { buildWalletTermsDisclosure, type WalletTermsDisclosure } from './autoFundWalletTerms.ts';

/** In-app route to the complete, versioned membership terms. */
export const AUTOFUND_TERMS_PATH = '/AutoFundTerms';

const APP_URL = 'https://app.arrivestatemedia.com';
export const AUTOFUND_SUPPORT_EMAIL = 'info@arrivestatemedia.com';
export const AUTOFUND_SUPPORT_URL = `${APP_URL}/AutoFund`;

export interface DisclosureItem {
  key: string;
  label: string;
  value: string;
  /** True for the items a recurring-billing statute treats as material. */
  material: boolean;
}

export interface ComplianceDisclosure {
  tier_amount: number;
  tier_name: string;
  monthly_wallet_funding: number;
  promotional_booking_value: number;
  monthly_membership_fee: number;
  total_monthly_recurring_charge: number;
  billing_frequency: string;
  next_renewal_date: string;
  renewal_date_is_estimate: boolean;
  benefits: string[];
  promotional_credit_restrictions: string;
  promotional_credit_usable_on_standalone_mls: boolean;
  cancellation_procedure: string;
  fee_refund_policy: FeeRefundPolicy;
  fee_refund_policy_statement: string;
  fee_refund_policy_approved: boolean;
  fee_refund_exceptions: string[];
  wallet_terms: WalletTermsDisclosure;
  wallet_terms_status: string;
  terms_version: string;
  terms_path: string;
  terms_url: string;
  support_email: string;
  /** Every item, in display order, for the pre-authorization screen. */
  items: DisclosureItem[];
  /** The subset that must be visible before authorization is possible. */
  material_items: DisclosureItem[];
}

const CANCELLATION_PROCEDURE =
  'You can cancel any time from your account dashboard under Auto-Fund → Cancel. You do not need to call, email or speak to a salesperson — if you enrolled online, you can cancel online. ' +
  'Your wallet deposit and your membership fee are one recurring charge and cannot be cancelled separately, so cancelling stops both. ' +
  'Cancelling stops all future charges, and it does not erase, forfeit or confiscate the Booking Value funded by your own cash deposits. ' +
  'There is no cancellation penalty and no minimum commitment. You will receive a cancellation confirmation.';

const RENEWAL_ESTIMATE_NOTE =
  'Your first charge is scheduled as shown. Each renewal falls on the same day of the month, adjusted where a month is shorter. ' +
  'You will be reminded before a renewal where applicable law requires it.';

/**
 * Build the complete compliance disclosure for a tier.
 *
 * @param tierAmount        canonical tier amount ($150 … $1,000)
 * @param termsVersion      the version label the customer is accepting
 * @param billingDay        day-of-month for the recurring charge
 * @param nextRenewalDate   ISO date of the next charge (optional)
 * @param feePolicy         refundability policy in force ('undetermined' until approved)
 */
export function buildComplianceDisclosure({
  tierAmount,
  termsVersion,
  billingDay,
  nextRenewalDate,
  feePolicy,
}: {
  tierAmount: number;
  termsVersion: string;
  billingDay?: number;
  nextRenewalDate?: string;
  feePolicy?: FeeRefundPolicy;
}): ComplianceDisclosure {
  const config = getAutoFundConfig(tierAmount);
  const fee = AUTOFUND_MEMBERSHIP_FEE[tierAmount] ?? 0;
  const total = tierAmount + fee;
  const isVip = config?.vip === true;
  const base = buildEnrollmentDisclosure(tierAmount, isVip);
  const refund = buildFeeRefundDisclosure(feePolicy);
  const walletTerms = buildWalletTermsDisclosure();

  const promotionalRestrictions = isVip
    ? 'Your promotional Booking Value can be used on eligible photography, video, premium packages and qualifying bundles. It cannot be used toward a standalone MLS Walkthrough. Your cash-funded Booking Value can be used on anything, including a standalone MLS Walkthrough.'
    : 'Your promotional Booking Value can be used on eligible services, including standalone MLS Walkthroughs, subject to your available balance. Promotional credit applies only up to the retail value of eligible services actually in your cart.';

  const benefits = config?.benefits || [];

  const items: DisclosureItem[] = [
    {
      key: 'tier',
      label: 'Your plan',
      value: `${config?.tier_name || `$${tierAmount}`} — $${tierAmount} per month`,
      material: true,
    },
    {
      key: 'wallet_funding',
      label: 'Monthly wallet funding',
      value: `$${tierAmount} is added to your Arriv Wallet each month.`,
      material: true,
    },
    {
      key: 'promotional_bonus',
      label: 'Promotional Booking Value',
      value: config && config.bonus_booking_value > 0
        ? `$${config.bonus_booking_value.toFixed(2)} in promotional Booking Value is granted by Arriv each month at no extra charge.`
        : 'No promotional Booking Value is added on this tier.',
      material: true,
    },
    {
      key: 'membership_fee',
      label: 'Monthly membership fee',
      value: fee > 0
        ? `$${fee} per month, charged for access to the membership benefits during that monthly period. It is not a wallet deposit, does not generate Booking Value, and does not earn promotional credit.`
        : 'No membership fee on this tier.',
      material: true,
    },
    {
      key: 'total_charge',
      label: 'Total recurring monthly charge',
      value: `$${total} per month. ${fee > 0 ? `That is $${tierAmount} of wallet funding plus the $${fee} membership fee.` : 'All of it funds your wallet as Booking Value.'}`,
      material: true,
    },
    {
      key: 'billing_frequency',
      label: 'Billing frequency and renewal date',
      value: `Monthly, recurring, until you cancel. ${nextRenewalDate
        ? `Your next charge is ${nextRenewalDate}${billingDay ? `, and it renews on day ${billingDay} of each month` : ''}.`
        : billingDay
          ? `Your charge falls on day ${billingDay} of each month.`
          : ''} ${RENEWAL_ESTIMATE_NOTE}`.trim(),
      material: true,
    },
    {
      key: 'benefits',
      label: 'Membership benefits you receive',
      value: benefits.length ? benefits.join('; ') + '.' : 'No additional membership benefits are listed for this tier.',
      material: true,
    },
    {
      key: 'promotional_restrictions',
      label: 'Promotional-credit restrictions',
      value: promotionalRestrictions,
      material: true,
    },
    {
      key: 'cancellation',
      label: 'How to cancel',
      value: CANCELLATION_PROCEDURE,
      material: true,
    },
    {
      key: 'fee_refund_policy',
      label: 'Membership-fee refund policy',
      value: refund.statement + (refund.exceptions.length ? ' ' + refund.exceptions.join(' ') : ''),
      material: true,
    },
    {
      key: 'wallet_terms',
      label: 'Your wallet — refunds and unused balances',
      value: walletTerms.verified_statements.join(' '),
      material: true,
    },
    {
      key: 'terms',
      label: 'Complete membership terms',
      value: `Version ${termsVersion}. The full terms are available at ${AUTOFUND_TERMS_PATH}. The statements above are complete on their own and are not replaced by that link.`,
      material: false,
    },
  ];

  return {
    tier_amount: tierAmount,
    tier_name: config?.tier_name || `$${tierAmount}`,
    monthly_wallet_funding: tierAmount,
    promotional_booking_value: config?.bonus_booking_value || 0,
    monthly_membership_fee: fee,
    total_monthly_recurring_charge: total,
    billing_frequency: 'monthly',
    next_renewal_date: nextRenewalDate || '',
    renewal_date_is_estimate: true,
    benefits,
    promotional_credit_restrictions: promotionalRestrictions,
    promotional_credit_usable_on_standalone_mls: base.promotional_credit_usable_on_standalone_mls,
    cancellation_procedure: CANCELLATION_PROCEDURE,
    fee_refund_policy: refund.policy,
    fee_refund_policy_statement: refund.statement,
    fee_refund_policy_approved: refund.is_approved,
    fee_refund_exceptions: refund.exceptions,
    wallet_terms: walletTerms,
    wallet_terms_status: walletTerms.status,
    terms_version: termsVersion,
    terms_path: AUTOFUND_TERMS_PATH,
    terms_url: `${APP_URL}${AUTOFUND_TERMS_PATH}`,
    support_email: AUTOFUND_SUPPORT_EMAIL,
    items,
    material_items: items.filter(i => i.material),
  };
}

/**
 * The exact affirmative-consent text shown beside the authorization control.
 * The control must start UNCHECKED — consent is never pre-filled or inferred.
 */
export function buildAuthorizationConsentText(d: ComplianceDisclosure): string {
  return `I authorize Arriv Estate Media to charge $${d.total_monthly_recurring_charge} to my payment method each month on a recurring basis, beginning with my next charge, until I cancel. ` +
    (d.monthly_membership_fee > 0
      ? `I understand $${d.monthly_wallet_funding} funds my wallet as Booking Value and $${d.monthly_membership_fee} is a membership fee that is not spendable Booking Value and does not earn promotional credit. `
      : `I understand the full charge funds my wallet as Booking Value. `) +
    `I have read the statements above, including how to cancel and the membership-fee refund policy, and I agree to the Auto-Fund Membership Terms (version ${d.terms_version}).`;
}