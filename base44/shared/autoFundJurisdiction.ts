// ============================================================================
// ARRIV AUTO-FUND — CUSTOMER BILLING JURISDICTION
// ============================================================================
// Renewal-notice obligations, and some refund and cancellation rights, depend on
// the customer's jurisdictional address rather than the location of the person
// who sold them the membership. This module is the single place where the
// customer's billing jurisdiction is validated, resolved and explained.
//
// DESIGN RULES
//
//   • The jurisdiction comes from a reliable CUSTOMER-PROVIDED billing address,
//     including state. It is never inferred from IP geolocation, a phone number,
//     a salesperson's location, or any other proxy — those are not the customer's
//     legal billing address and would misroute a statutory notice.
//   • Where a payment method also reports a state, it is used to CORROBORATE or
//     to CONFLICT-FLAG the customer's address — never as the sole source.
//   • A missing or invalid jurisdiction BLOCKS new enrollment. It is never
//     silently replaced with a generic default, because a notice sent under the
//     wrong cadence is worse than no notice: it looks like compliance.
//   • Unusual or conflicting cases are FLAGGED FOR REVIEW rather than resolved
//     automatically. Billing state alone does not settle every legal question —
//     residency, the customer's principal address, and state-specific rules can
//     all differ, so those cases are surfaced to a human.
// ============================================================================

/** The 50 US states plus the District of Columbia. */
export const US_STATE_CODES: string[] = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL',
  'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

/**
 * Return a validated 2-letter jurisdiction code, or '' when the value is absent
 * or not a real US state. Full state names are deliberately NOT accepted: a free
 * -text address must be converted to a code by the caller so an ambiguous string
 * can never silently become a jurisdiction.
 */
export function normalizeJurisdictionState(input?: string | null): string {
  const raw = String(input ?? '').trim().toUpperCase();
  if (raw.length !== 2) return '';
  return US_STATE_CODES.includes(raw) ? raw : '';
}

/** True when a value is a real jurisdiction code. */
export function isValidJurisdictionState(input?: string | null): boolean {
  return normalizeJurisdictionState(input) !== '';
}

/**
 * A fallback jurisdiction for subscriptions whose jurisdiction cannot be
 * determined.
 *
 * DELIBERATELY NULL: no conservative fallback has been approved by the owner or
 * counsel. Until one is, a missing or invalid jurisdiction blocks enrollment and
 * suppresses the renewal notice instead of guessing. If counsel later approves a
 * default, set the approved code here — the enrollment engine and the renewal
 * scheduler both read this constant, so the decision is made in exactly one place.
 */
export const APPROVED_JURISDICTION_FALLBACK: string | null = null;

/** Why a subscription's jurisdiction could not be accepted. */
export const JURISDICTION_ERROR = {
  REQUIRED: 'JURISDICTION_REQUIRED',
  INVALID: 'JURISDICTION_INVALID',
} as const;

/** Why a subscription's jurisdiction needs a human look. */
export const JURISDICTION_REVIEW_REASON = {
  CONFLICT_WITH_PAYMENT_METHOD: 'JURISDICTION_CONFLICT_WITH_PAYMENT_METHOD',
  OUTSIDE_US: 'BILLING_ADDRESS_OUTSIDE_US',
  FALLBACK_APPLIED: 'APPROVED_FALLBACK_APPLIED',
} as const;

export type JurisdictionResolutionMethod =
  | 'customer_provided_billing_address'
  | 'customer_provided_confirmed_by_payment_method'
  | 'customer_provided_conflicts_with_payment_method'
  | 'approved_fallback';

export interface BillingAddressInput {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface JurisdictionResolution {
  ok: boolean;
  /** Machine-readable code when ok is false. */
  code?: string;
  /** Customer-facing explanation when ok is false. */
  error?: string;
  /** Validated jurisdiction to persist. Absent when ok is false. */
  state?: string;
  method?: JurisdictionResolutionMethod;
  needs_review: boolean;
  review_reason: string;
  /** The state the payment instrument reported, when one was available. */
  payment_state?: string;
  captured_at?: string;
}

/**
 * Resolve the customer's billing jurisdiction for enrollment.
 *
 * @param billing_address      the customer-provided billing address (required)
 * @param payment_method_state optional state reported by the payment method
 */
export function resolveBillingJurisdiction({
  billing_address,
  payment_method_state,
}: {
  billing_address?: BillingAddressInput | null;
  payment_method_state?: string | null;
}): JurisdictionResolution {
  const rawState = String(billing_address?.state ?? '').trim();

  // ── A customer-provided billing state is required. ────────────────────────
  if (!rawState) {
    return {
      ok: false,
      code: JURISDICTION_ERROR.REQUIRED,
      error:
        'A billing address with a state is required before enrollment. The renewal-notice rules that apply to your membership depend on it, so it cannot be left blank.',
      needs_review: false,
      review_reason: '',
    };
  }

  const state = normalizeJurisdictionState(rawState);
  if (!state) {
    return {
      ok: false,
      code: JURISDICTION_ERROR.INVALID,
      error:
        `"${rawState}" is not a recognised US state. Correct the billing state before enrollment — the applicable renewal-notice rules cannot be determined from it.`,
      needs_review: false,
      review_reason: '',
    };
  }

  // ── Corroborate against the payment method where one is available. ────────
  const paymentState = normalizeJurisdictionState(payment_method_state);
  const country = String(billing_address?.country ?? '').trim().toUpperCase();
  const outsideUs = !!country && country !== 'US' && country !== 'USA';

  let method: JurisdictionResolutionMethod = 'customer_provided_billing_address';
  let needsReview = false;
  let reviewReason = '';

  if (paymentState && paymentState !== state) {
    // The customer's stated billing address governs; the disagreement is the
    // signal, not a reason to prefer the payment instrument silently.
    method = 'customer_provided_conflicts_with_payment_method';
    needsReview = true;
    reviewReason = JURISDICTION_REVIEW_REASON.CONFLICT_WITH_PAYMENT_METHOD;
  } else if (paymentState && paymentState === state) {
    method = 'customer_provided_confirmed_by_payment_method';
  }

  if (outsideUs) {
    // A billing address outside the US is unusual for this program and may
    // change which rules apply, so it is never resolved automatically.
    needsReview = true;
    reviewReason = reviewReason
      ? `${reviewReason},${JURISDICTION_REVIEW_REASON.OUTSIDE_US}`
      : JURISDICTION_REVIEW_REASON.OUTSIDE_US;
  }

  return {
    ok: true,
    state,
    method,
    needs_review: needsReview,
    review_reason: reviewReason,
    payment_state: paymentState || undefined,
    captured_at: new Date().toISOString(),
  };
}

/** Plain-language statement of the requirement, for the interface and disclosure. */
export function describeJurisdictionRequirement(): string {
  return (
    'We need the state on your billing address. The renewal-notice rules and some cancellation rights that apply ' +
    'to your membership depend on your billing jurisdiction, so enrollment cannot complete without it. ' +
    'We do not use your IP address, phone number or the location of any advisor for this.'
  );
}

/**
 * Append a jurisdiction event to the audit trail.
 *
 * The trail is the record of how each jurisdiction decision was made and what
 * changed, so an auditor can reconstruct the basis for a notice. It never
 * rewrites an earlier entry.
 */
export async function recordJurisdictionAudit({
  base44,
  change_type,
  subscription_id,
  customer_id,
  customer_email,
  previous_state,
  new_state,
  resolution_method,
  needs_review,
  review_reason,
  billing_address,
  payment_state,
  actor,
  note,
}: {
  base44: any;
  change_type: 'initial_capture' | 'correction' | 'flagged_conflict' | 'review_cleared';
  subscription_id: string;
  customer_id?: string;
  customer_email: string;
  previous_state?: string;
  new_state?: string;
  resolution_method?: string;
  needs_review?: boolean;
  review_reason?: string;
  billing_address?: BillingAddressInput | null;
  payment_state?: string;
  actor?: string;
  note?: string;
}) {
  const recorded_at = new Date().toISOString();
  return base44.entities.AutoFundJurisdictionAudit.create({
    audit_id: `afjur_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    change_type,
    subscription_id,
    customer_id: customer_id || '',
    customer_email,
    previous_state: normalizeJurisdictionState(previous_state),
    new_state: normalizeJurisdictionState(new_state),
    resolution_method: resolution_method || '',
    needs_review: needs_review === true,
    review_reason: review_reason || '',
    // A minimal, structured snapshot — never free text that could carry more
    // than the jurisdiction decision needs.
    billing_city: billing_address?.city || '',
    billing_postal_code: billing_address?.postal_code || '',
    billing_country: billing_address?.country || '',
    payment_method_state: normalizeJurisdictionState(payment_state),
    actor: actor || '',
    note: note || '',
    recorded_at,
  });
}