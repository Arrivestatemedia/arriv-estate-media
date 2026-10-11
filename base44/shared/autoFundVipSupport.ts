// ============================================================================
// ARRIV AUTO-FUND — VIP ENHANCED SUPPORT (FINALIZED)
// ============================================================================
// The owner finalized VIP enhanced support on 2026-10-11 and REPLACED the earlier
// (unapproved) proposal that promised 12 human support sessions a year.
//
// DELIVERABILITY: this benefit adds NO new workflow. It is delivered entirely
// through the existing Arriv Assist apparatus:
//   • routing — the wallet already carries `support_tier`, which is exactly the
//     field Arriv Assist uses to route a customer, and the enrollment engine
//     already writes it (autoFundEnrollment.ts).
//   • escalation — "Priority Arriv Assist routing" and "Priority human-support
//     escalation" are already defined, already-live tier benefits in the prepaid
//     engine, so a human hand-off path exists and is in use.
// VIP therefore requests higher priority in queues that already exist; it does not
// create a parallel support function, headcount or booking process.
//
// COST — NOT DOUBLE-COUNTED: VIP support was already modelled in the certified
// financial engine as a monthly priority-support retainer plus a per-session cost.
// The finalized benefit keeps the SAME retainer (the line that already exists) and
// removes the per-session variable, because no session is promised any more. No
// second support line is added, and no existing support expense is charged twice.
// ============================================================================

/** The owner-finalized benefit wording. This is the ONLY approved VIP support promise. */
export const VIP_ENHANCED_SUPPORT_TEXT =
  'VIP members receive priority access to Arriv Assist, including automated assistance and escalation to a human support representative when necessary to resolve qualifying service-related issues.';

/** Claims that must never be made about VIP support. */
export const VIP_SUPPORT_PROHIBITED_CLAIMS: string[] = [
  'unlimited human support sessions',
  'guaranteed human support hours',
  'a fixed number of complimentary consultations',
  'any number of included human sessions',
  'dedicated account manager or assigned human agent',
  'response-time guarantees or service-level commitments',
];

/** Standard customer-support rights are unchanged by this benefit. */
export const VIP_SUPPORT_STANDARD_RIGHTS_UNCHANGED =
  'This benefit adds priority and escalation on top of the support every Arriv customer already receives. It removes or reduces no existing customer-support right, and it does not create a right to a human rather than automated assistance for a request that does not qualify for escalation.';

/** The existing priority-support retainer basis, per month. Already in the certified model. */
export const VIP_SUPPORT_RETAINER_MONTHLY = 6;

/** Promised human sessions per year under the finalized benefit: NONE. */
export const VIP_SUPPORT_PROMISED_SESSIONS_PER_YEAR = 0;

/**
 * Assumed qualifying escalation handling events per member-year for the financial
 * model. Zero, because nothing is promised: escalations are absorbed inside the
 * retainer. Raise this figure to model a heavier escalation load — each event costs
 * VIP_SUPPORT_ESCALATION_COST_PER_EVENT.
 */
export const VIP_SUPPORT_ESCALATION_EVENTS_ASSUMED_PER_YEAR = 0;

/** Assumed cost of handling one escalation, used for sensitivity only. */
export const VIP_SUPPORT_ESCALATION_COST_PER_EVENT = 25;

/**
 * The former proposed ceiling (48 events/yr), retained ONLY as a conservative
 * high-utilisation stress in the financial model. It is not a promise and must
 * never be disclosed as one.
 */
export const VIP_SUPPORT_STRESS_CEILING_EVENTS = 48;

/** Annual incremental support cost for a given escalation load. */
export function vipSupportAnnualIncrementalCost(eventsPerYear: number = VIP_SUPPORT_ESCALATION_EVENTS_ASSUMED_PER_YEAR): number {
  return (
    VIP_SUPPORT_RETAINER_MONTHLY * 12 +
    Math.max(0, eventsPerYear) * VIP_SUPPORT_ESCALATION_COST_PER_EVENT
  );
}

/**
 * How many escalation events a member's contribution can absorb before the annual
 * support provision exceeds it. Negative contributions absorb none.
 */
export function escalationCapacityForContribution(contributionDollars: number): number {
  if (!(contributionDollars > 0)) return 0;
  return Math.floor(contributionDollars / VIP_SUPPORT_ESCALATION_COST_PER_EVENT);
}

/** How the benefit is delivered, item by item, on the existing apparatus. */
export const VIP_SUPPORT_DELIVERY_MAP = {
  priority_routing: {
    mechanism: 'PrepaidWallet.support_tier, written at Auto-Fund enrollment',
    existing_benefit_equivalent: 'Priority Arriv Assist routing (already a prepaid tier benefit)',
    new_workflow_required: false,
  },
  human_escalation: {
    mechanism: 'Existing Arriv Assist escalation path used by the support workflow',
    existing_benefit_equivalent: 'Priority human-support escalation / higher-priority human escalation (already prepaid tier benefits)',
    new_workflow_required: false,
  },
  automated_assistance: {
    mechanism: 'Existing Arriv Assist automated assistance',
    existing_benefit_equivalent: 'Standard Arriv Assist service',
    new_workflow_required: false,
  },
  delivery_verdict:
    'DELIVERABLE ON EXISTING ARRIV ASSIST WORKFLOWS. Priority and escalation are routing changes within queues that already exist; no new headcount, tooling or booking process is introduced, and no session count is promised.',
} as const;

/** The candidate-facing / counsel-facing disclosure block for VIP enhanced support. */
export function buildVipSupportDisclosure() {
  return {
    benefit_text: VIP_ENHANCED_SUPPORT_TEXT,
    promised_human_sessions_per_year: VIP_SUPPORT_PROMISED_SESSIONS_PER_YEAR,
    standard_support_rights_unchanged: VIP_SUPPORT_STANDARD_RIGHTS_UNCHANGED,
    prohibited_claims: VIP_SUPPORT_PROHIBITED_CLAIMS,
    delivery: VIP_SUPPORT_DELIVERY_MAP,
    cost_basis: {
      priority_support_retainer_per_month: VIP_SUPPORT_RETAINER_MONTHLY,
      annual_incremental_cost_at_zero_escalations: vipSupportAnnualIncrementalCost(0),
      assumed_escalation_events_per_year: VIP_SUPPORT_ESCALATION_EVENTS_ASSUMED_PER_YEAR,
      assumed_cost_per_escalation_event: VIP_SUPPORT_ESCALATION_COST_PER_EVENT,
      former_proposal_ceiling_retained_as_stress_only: VIP_SUPPORT_STRESS_CEILING_EVENTS,
      double_counting_note:
        'The retainer is the existing VIP priority-support line already carried in the certified financial model. The per-session cost is removed because no session is promised. No existing support expense is counted twice.',
    },
    status: 'FINALIZED_BY_OWNER_DIRECTIVE_2026_10_11',
    replaced: 'The earlier proposal promising 12 annual human support sessions has been removed.',
  };
}