// ============================================================================
// SIMULATION GUARD — Side-Effect Interception for Training Mode
// ============================================================================
// FAIL-CLOSED: If isolation cannot be proven, FAIL CLOSED.
// This guard intercepts ALL mutations and external effects before production.
// Training Mode must NEVER grant production permissions or execute live effects.
// ============================================================================

// --- Prohibited Production Effects ---
export const PROHIBITED_PRODUCTION_EFFECTS = [
  "create_real_customer",
  "update_real_customer",
  "delete_real_customer",
  "create_real_organization",
  "update_real_organization",
  "delete_real_organization",
  "create_real_member",
  "update_real_member",
  "delete_real_member",
  "create_real_listing",
  "update_real_listing",
  "create_real_booking",
  "update_real_booking",
  "delete_real_booking",
  "create_real_job",
  "update_real_job",
  "create_real_project",
  "update_real_project",
  "assign_real_media_specialist",
  "accept_real_media_specialist_assignment",
  "publish_real_deliverable",
  "send_real_email",
  "send_real_sms",
  "make_real_call",
  "send_real_invite",
  "charge_real_stripe",
  "refund_real_stripe",
  "create_real_stripe_subscription",
  "cancel_real_stripe_subscription",
  "process_real_payout",
  "collect_real_invoice",
  "change_real_membership",
  "change_real_entitlement",
  "consume_real_company_credit",
  "create_real_account_hold",
  "release_real_account_hold",
  "post_real_sales_commission",
  "post_real_referral",
  "cash_out_real_referral",
  "process_real_provider_payout",
  "trigger_real_webhook",
  "escalate_real_permission",
  "impersonate_customer_admin",
  "enter_financial_credentials",
  "fake_paid_state",
  "bypass_account_hold",
  "use_privileged_financial_operation",
  "create_real_agreement",
  "sign_real_agreement",
  "create_real_contract_version",
  "alter_real_contract_terms",
] as const;

// --- Synthetic-Only Action Prefixes ---
export const SYNTHETIC_ACTION_PREFIXES = [
  "b2b_",
  "e4_",
  "e6_",
  "e8_",
  "e13_",
  "e16_",
  "e17_",
  "e19_",
  "cert_",
  "customer_",
  "provider_",
  "select_",
  "check_",
  "confirm_",
  "start_",
  "submit_",
  "log_",
  "advance_",
  "review_",
  "walk_",
  "explain_",
  "view_",
  "acknowledge_",
  "respond_",
  "request_",
  "send_welcome",
  "offer_preferred",
  "pressure_preferred",
  "promise_refund",
  "promise_provider",
  "expose_payout",
  "promise_turnaround_guarantee",
  "perform_provider_craft",
  "upload_real_file",
  "skip_",
  "create_real_",
  "contact_without_",
  "invent_",
  "promise_",
  "disparage_",
  "charge_real_",
];

// --- Critical Failure Actions (always blocked in simulation) ---
export const CRITICAL_FAILURE_ACTIONS = [
  "skip_video_check",
  "create_real_prospect",
  "contact_without_research",
  "invent_pricing",
  "promise_specific_provider",
  "skip_discovery",
  "promise_custom_price",
  "skip_tier_determination",
  "offer_unauthorized_discount",
  "disparage_competitor",
  "skip_followup",
  "promise_cash_payout",
  "promise_provider_details",
  "skip_onboarding",
  "promise_free_services",
  "expose_provider_payout",
  "expose_internal_pricing",
  "promise_staging",
  "skip_lifecycle_stage",
  "charge_real_stripe",
  "upload_real_file",
  "promise_provider",
  "expose_payout",
  "promise_turnaround_guarantee",
  "perform_provider_craft",
  "cert_custom_discount",
  "cert_expose_payout",
  // B2B critical failures
  "b2b_abandon_individual",
  "b2b_invent_pricing",
  "b2b_invent_credits",
  "b2b_pitch_without_discovery",
  "b2b_skip_decision_map",
  "b2b_offer_custom_discount",
  "b2b_add_extra_credits",
  "b2b_alter_contract_terms",
  "b2b_charge_real_stripe",
  "b2b_create_real_org",
  "b2b_sign_on_behalf",
  "b2b_impersonate_customer_admin",
  "b2b_enter_financial_credentials",
  "b2b_add_unrelated_user",
  "b2b_alter_credit_allocation",
  "b2b_free_booking",
  "b2b_overcharge_credits",
  "b2b_create_second_invoice_engine",
  "b2b_fake_paid_state",
  "b2b_bypass_hold",
  "b2b_free_credits",
  "b2b_alter_contract",
  "b2b_invent_custom_plan",
  "b2b_free_extra_credits",
  "b2b_verbal_terms_change",
  "b2b_claim_residual",
  "b2b_invent_rate",
  "b2b_abandon_prospecting",
  "b2b_cert_custom_discount",
  "b2b_cert_enter_credentials",
  "b2b_cert_bypass_hold",
];

// --- Guard Result ---
export interface GuardResult {
  allowed: boolean;
  reason: string;
  action: string;
  is_synthetic: boolean;
  is_critical_failure: boolean;
  prohibited_effect: string | null;
}

// --- Check if an action is synthetic-only ---
export function isSyntheticAction(action: string): boolean {
  if (!action || typeof action !== "string") return false;

  // Check synthetic prefixes
  for (const prefix of SYNTHETIC_ACTION_PREFIXES) {
    if (action.startsWith(prefix) || action === prefix) return true;
  }

  // Generic simulation actions
  if (action === "advance_step" || action === "reset_scenario") return true;

  return false;
}

// --- Check if an action is a critical failure ---
export function isCriticalFailureAction(action: string): boolean {
  return CRITICAL_FAILURE_ACTIONS.includes(action);
}

// --- Check if an action would cause a prohibited production effect ---
export function getProhibitedEffect(action: string): string | null {
  if (!action || typeof action !== "string") return null;

  // Direct match against prohibited effects
  if (PROHIBITED_PRODUCTION_EFFECTS.includes(action as any)) return action;

  // Pattern matching for real-effect actions
  if (action.includes("real_") && !action.startsWith("b2b_")) return action;
  if (action.includes("charge_") && action.includes("stripe")) return "charge_real_stripe";
  if (action.includes("send_") && (action.includes("email") || action.includes("sms") || action.includes("call")) && !action.startsWith("b2b_")) return action;

  return null;
}

// --- Main Guard Function ---
// FAIL-CLOSED: if we cannot prove the action is safe, block it.
export function guardSimulationAction(action: string, isTrainingMode: boolean): GuardResult {
  // Training mode must be active
  if (!isTrainingMode) {
    return {
      allowed: false,
      reason: "Training mode is not active. All simulation actions require active training mode.",
      action: action || "unknown",
      is_synthetic: false,
      is_critical_failure: false,
      prohibited_effect: null,
    };
  }

  // Check for prohibited production effects FIRST (before critical failures)
  // so that actions like "charge_real_stripe" are caught as prohibited effects
  const prohibitedEffect = getProhibitedEffect(action);
  if (prohibitedEffect) {
    return {
      allowed: false,
      reason: `Prohibited production effect detected: "${prohibitedEffect}". Training mode cannot execute real production effects. FAIL CLOSED.`,
      action,
      is_synthetic: false,
      is_critical_failure: false,
      prohibited_effect: prohibitedEffect,
    };
  }

  // Check for critical failure actions — these are RECORDED but never EXECUTED
  if (isCriticalFailureAction(action)) {
    return {
      allowed: false,
      reason: `Critical failure action "${action}" is recorded for grading but never executed. This action violates training boundaries.`,
      action,
      is_synthetic: false,
      is_critical_failure: true,
      prohibited_effect: null,
    };
  }

  // Check if action is synthetic
  const synthetic = isSyntheticAction(action);
  if (!synthetic) {
    // FAIL CLOSED: unknown action, not proven safe
    return {
      allowed: false,
      reason: `Action "${action}" is not recognized as a synthetic simulation action. FAIL CLOSED — unknown actions are blocked by default.`,
      action,
      is_synthetic: false,
      is_critical_failure: false,
      prohibited_effect: null,
    };
  }

  // Action is synthetic and safe
  return {
    allowed: true,
    reason: "Action is synthetic and safe for training mode.",
    action,
    is_synthetic: true,
    is_critical_failure: false,
    prohibited_effect: null,
  };
}

// --- Validate Training Session Isolation ---
export function validateTrainingSessionIsolation(sessionContext: {
  is_training_mode: boolean;
  session_id: string;
  scenario_id: string;
  learner_id: string;
}): { isolated: boolean; violations: string[] } {
  const violations: string[] = [];

  if (!sessionContext.is_training_mode) {
    violations.push("Training mode flag is not active");
  }
  if (!sessionContext.session_id || !sessionContext.session_id.startsWith("sim_session_")) {
    violations.push("Session ID is not a valid simulation session ID");
  }
  if (!sessionContext.scenario_id) {
    violations.push("No scenario ID bound to session");
  }
  if (!sessionContext.learner_id) {
    violations.push("No learner ID bound to session");
  }

  return {
    isolated: violations.length === 0,
    violations,
  };
}

// --- Check Reset/Replay Safety ---
export function validateResetReplaySafety(beforeState: any, afterState: any): { safe: boolean; leaks: string[] } {
  const leaks: string[] = [];

  // Check that synthetic IDs are still synthetic after reset
  const allValues = JSON.stringify(beforeState) + JSON.stringify(afterState);

  // Detect bare MongoDB ObjectIds (24 hex characters) — these indicate real
  // production IDs leaking into simulation state. Synthetic IDs use sim_ prefix
  // or short alphanumeric strings, NOT 24-char hex ObjectIds.
  const objectIdPattern = /"([0-9a-f]{24})"/g;
  let match;
  while ((match = objectIdPattern.exec(allValues)) !== null) {
    leaks.push(`Potential real MongoDB ObjectId detected: ${match[1]}`);
  }

  // Also check for real entity-prefixed IDs (not sim_ prefixed)
  const realIdPatterns = [
    /[^_]org_[0-9a-f]{24}/,
    /[^_]ctr_[0-9a-f]{24}/,
    /[^_]member_[0-9a-f]{24}/,
  ];

  for (const pattern of realIdPatterns) {
    if (pattern.test(allValues)) {
      leaks.push(`Potential real prefixed ID detected: ${pattern.source}`);
    }
  }

  return {
    safe: leaks.length === 0,
    leaks,
  };
}