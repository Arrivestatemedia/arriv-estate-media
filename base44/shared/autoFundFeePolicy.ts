// ============================================================================
// ARRIV AUTO-FUND — MEMBERSHIP-FEE REFUND POLICY (OWNER-APPROVED BUSINESS POLICY)
// ============================================================================
// The owner adopted the monthly membership-fee refund policy as Arriv Estate
// Media's official business policy on 2026-10-11, and re-confirmed it against the
// FINAL approved commercial configuration on the same date. The policy is expressed in
// amount-neutral terms: each tier's fee lives in the approved schedule
// (autoFundFinalConfig.ts), so a fee change cannot silently restate this policy.
//
// WHAT THIS IS: a business-policy decision taken by the owner, who is entitled to
// set the company's refund policy. It resolves the "refundability is undetermined"
// launch blocker in the enrollment interlock.
//
// WHAT THIS IS NOT: legal advice. COUNSEL_REVIEW_STATUS below records counsel review
// of this policy and the agreement it sits in, and was changed to 'completed' ONLY
// when the owner supplied the approving counsel and date (Tommy Garrison, Macklemore &
// Garrison, 2026-10-11) and the decision was recorded through manageAutoFundLaunch with
// that counsel reference. That is the sole basis for it, and the value is never set
// without a recorded approval behind it. Jurisdiction-specific renewal requirements
// remain a separate matter that this module does not speak to.
// ============================================================================

/**
 * Immutable version label for the adopted policy.
 *
 * v2: re-issued with the FINAL approved commercial configuration (2026-10-11). The
 * refundability policy itself is UNCHANGED; the single-amount reference was removed,
 * because naming one figure stated the policy for only some tiers once the final
 * schedule set a different fee on every tier.
 */
export const FEE_POLICY_VERSION = 'autofund_fee_policy_v2';

/** Owner adoption state. */
export const FEE_POLICY_STATUS = 'OWNER_APPROVED_ADOPTED' as const;

/** The date the owner adopted the policy (exact persisted timestamp lives in AppSetting). */
export const FEE_POLICY_ADOPTED_ON = '2026-10-11';

export const FEE_POLICY_ADOPTED_BY = 'owner';

/**
 * External counsel review — 'completed' from 2026-10-11, on the owner's supplied record:
 * approving counsel Tommy Garrison of Macklemore & Garrison, approving on 2026-10-11
 * Membership Terms v2 (autofund_membership_v2), Wallet Agreement v1 (autofund_wallet_v1),
 * the final membership fees and recurring charges, the applicable disclosures and this
 * refund policy (autofund_fee_policy_v2). The decision is recorded in the system
 * (manageAutoFundLaunch, action record_legal_decision, with that counsel_reference), and
 * the clearance record is ARRIV_AUTOFUND_LEGAL_CLEARANCE_RECORD.md.
 *
 * This is the single value that claims legal approval, so it stays 'not_completed'
 * unless that kind of record exists — never on an assertion alone.
 */
export const FEE_POLICY_COUNSEL_REVIEW_STATUS = 'completed' as const;

export function feePolicyCounselReviewCompleted(): boolean {
  return FEE_POLICY_COUNSEL_REVIEW_STATUS === 'completed';
}

/**
 * The refundability these clauses encode for the ORDINARY case: a properly
 * authorized fee is ordinarily nonrefundable once the period begins and the
 * benefits for it are available. The exceptions always apply on top of this.
 */
export const ADOPTED_FEE_REFUND_POLICY = 'non_refundable' as const;

/** The adopted policy, clause by clause, as directed by the owner. */
export const FEE_POLICY_CLAUSES: string[] = [
  'The membership fee is a separate monthly charge for access to membership benefits, not a wallet deposit. The amount is the one set for the tier in the approved schedule.',
  'Properly authorized membership fees are ordinarily nonrefundable once the membership period begins and benefits are available.',
  'Refund unauthorized, duplicate, or erroneous fees and fees charged after effective cancellation.',
  'Provide an appropriate refund or remedy if Arriv materially fails to make the contracted membership benefits available.',
  'Cancellation prevents future recurring charges and does not automatically forfeit existing cash-funded wallet balances.',
  'Applicable law overrides conflicting contract provisions.',
  'Disclose the complete monthly recurring charge before payment authorization.',
  "Preserve the customer's accepted fee, contract version, and authorization evidence.",
];

/** Where each clause is enforced or disclosed, so the policy stays auditable. */
export const FEE_POLICY_ENFORCEMENT: Record<string, string> = {
  '1': 'Charge-component separation: autoFundMembershipBilling.ts records a fee with booking_value_issued_cents = 0, so a fee can never become Booking Value.',
  '2': 'This module plus the customer refund disclosure in autoFundMembershipBilling.ts.',
  '3': 'recordFeeRefund(); fee events are additionally idempotent on payment_event_id, so a duplicate delivery cannot double-charge.',
  '4': 'Material-failure remedy clause carried in LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS.',
  '5': 'Cancellation path in manageAutoFund: stops future charges and never touches the wallet balance.',
  '6': 'Statutory-override clause carried in LEGALLY_REQUIRED_FEE_REFUND_EXCEPTIONS.',
  '7': 'buildChargeDisclosure() / buildEnrollmentDisclosure() are shown before payment authorization.',
  '8': 'AutoFundConsentRecord (frozen fee, terms version, authorization evidence) plus AutoFundMembershipNotice.',
};

/** The customer-facing statement of the adopted policy. */
export function buildAdoptedFeePolicyStatement(): string {
  return [
    'Your membership fee is a separate monthly charge for access to membership benefits. It is not a wallet deposit and it is not spendable.',
    'A properly authorized membership fee is ordinarily nonrefundable once the membership period begins and the benefits for that period are available.',
    'Refunds or other appropriate remedies are provided for unauthorized, duplicate or erroneous charges, for charges made after an effective cancellation, for a material failure to provide the contracted membership benefits, and in any circumstance required by applicable law. Applicable law overrides any conflicting provision of these terms.',
  ].join(' ');
}

/** The persisted audit record for the adoption. */
export function feePolicyAuditRecord() {
  return {
    policy_version: FEE_POLICY_VERSION,
    status: FEE_POLICY_STATUS,
    adopted_on: FEE_POLICY_ADOPTED_ON,
    adopted_by: FEE_POLICY_ADOPTED_BY,
    counsel_review_status: FEE_POLICY_COUNSEL_REVIEW_STATUS,
    counsel_review_note:
      'Counsel approval is RECORDED (2026-10-11). Approving counsel: Tommy Garrison, Macklemore & Garrison. Approved: Membership Terms v2 (autofund_membership_v2), Wallet Agreement v1 (autofund_wallet_v1), the final membership fees and recurring charges ($5.99/$10/$25/$27/$30; totals $155.99/$260/$375/$527/$1,030), the applicable membership disclosures and this refund policy (autofund_fee_policy_v2). Recorded through manageAutoFundLaunch, action record_legal_decision, with that counsel reference; the clearance record is ARRIV_AUTOFUND_LEGAL_CLEARANCE_RECORD.md.',
    refund_policy_encoded: ADOPTED_FEE_REFUND_POLICY,
    clauses: FEE_POLICY_CLAUSES,
    enforcement_map: FEE_POLICY_ENFORCEMENT,
  };
}