// ============================================================================
// ARRIV AUTO-FUND — VIP SUPPORT PROPOSAL (PREPARED, NOT AN ENTITLEMENT)
// ============================================================================
// Owner direction 2026-10-11: prepare disclosure of UP TO 12 qualifying support
// sessions per membership year, subject to final owner approval of the session
// definitions, the costs, and the terms.
//
// Until that approval exists this is a PROPOSAL. It must never be presented to a
// customer as an existing entitlement, and no customer-facing surface may state it
// as a contractual right. The text produced here is prepared for review, not for
// publication.
// ============================================================================

export const VIP_SUPPORT_PROPOSAL_VERSION = 'autofund_vip_support_v1';

export const VIP_SUPPORT_PROPOSAL_STATUS = 'PROPOSED_AWAITING_OWNER_APPROVAL' as const;

/** Up to this many qualifying sessions per membership year, if approved. */
export const VIP_SUPPORT_PROPOSED_SESSIONS_PER_YEAR = 12;

/** Incremental cost per session used by the financial model — an ASSUMPTION, not a contracted rate. */
export const VIP_SUPPORT_ASSUMED_COST_PER_SESSION = 25;

/**
 * True only when the owner has approved this benefit as a contractual entitlement.
 * It is not approved, so every consumer must treat the proposal as non-contractual.
 */
export const VIP_SUPPORT_IS_CONTRACTUAL = false;

/** Items that must be settled before this can become a contractual benefit. */
export const VIP_SUPPORT_OPEN_ITEMS: string[] = [
  'Definition of a "qualifying support session": what is included and excluded, duration, and delivery mode.',
  'Confirmed delivery cost per session. The figure used in the model is an assumption, not a contracted rate.',
  'Terms: how sessions accrue, whether unused sessions carry over, whether they survive cancellation, and any fair-use limit.',
  'Whether the benefit is described as "up to 12" with an availability qualifier, or as a firm entitlement.',
  'Which tiers carry the benefit, and whether it is bundled with the $25 membership fee on Professional and Premier.',
];

/** The prepared disclosure text. NOT approved for publication. */
export const VIP_SUPPORT_PREPARED_TEXT =
  'VIP members may request up to 12 qualifying support sessions per membership year, subject to session availability and the support terms. This benefit is subject to final terms.';

export function buildVipSupportProposalDisclosure() {
  return {
    proposal_version: VIP_SUPPORT_PROPOSAL_VERSION,
    status: VIP_SUPPORT_PROPOSAL_STATUS,
    is_contractual_entitlement: VIP_SUPPORT_IS_CONTRACTUAL,
    sessions_per_year: VIP_SUPPORT_PROPOSED_SESSIONS_PER_YEAR,
    cost_per_session_assumption: VIP_SUPPORT_ASSUMED_COST_PER_SESSION,
    annual_cost_assumption: VIP_SUPPORT_PROPOSED_SESSIONS_PER_YEAR * VIP_SUPPORT_ASSUMED_COST_PER_SESSION,
    membership_fee_annual_revenue_at_25: 25 * 12,
    prepared_text: VIP_SUPPORT_PREPARED_TEXT,
    publication_blocked_because:
      'Not yet approved by the owner (session definitions, costs and terms are open). Must not be published as an entitlement.',
    open_items: VIP_SUPPORT_OPEN_ITEMS,
  };
}