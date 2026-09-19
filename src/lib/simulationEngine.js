// ============================================================================
// SIMULATION ENGINE — Reducer + Validation for Training Simulation Mode
// ============================================================================
// This module is pure: it takes simulation state + action + input and returns
// new simulation state + validation result. It NEVER calls real APIs, NEVER
// touches production entities, and NEVER sends real email/SMS/calls.
// All state is in-memory React state managed by SimulationContext.
// ============================================================================

import { PRICING_TIERS, PACKAGES, ADD_ONS, PREFERRED_CONFIG, getScenarioById } from "./simulationScenarios";

// --- Pricing (mirrors mediaPricingEngine.ts calculateMediaPricing) ---
export function determineTier(sqft) {
  if (!sqft || sqft <= 0) return "UNKNOWN";
  for (const t of PRICING_TIERS) {
    if (sqft >= t.min && sqft <= t.max) return t.tier;
  }
  return "CUSTOM";
}

export function calculateSimPricing(sqft, packageId, addOnIds = [], preferredActive = false) {
  const tier = determineTier(sqft);
  if (tier === "CUSTOM" || tier === "UNKNOWN") {
    return { status: tier === "CUSTOM" ? "CUSTOM_QUOTE_REQUIRED" : "INVALID_INPUT", tier, packagePrice: 0, addOnsSubtotal: 0, preferredDiscount: 0, total: 0, selectedAddOns: [] };
  }
  const tierConfig = PRICING_TIERS.find(t => t.tier === tier);
  const packagePrice = tierConfig.prices[packageId] || 0;
  const selectedAddOns = (addOnIds || []).map(id => ADD_ONS.find(a => a.id === id)).filter(Boolean);
  const addOnsSubtotal = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
  let preferredDiscount = 0;
  if (preferredActive) {
    preferredDiscount = packageId === "mls_walkthrough" ? PREFERRED_CONFIG.mls_flat_discount : packagePrice * PREFERRED_CONFIG.regular_discount_rate;
  }
  const total = (packagePrice - preferredDiscount) + addOnsSubtotal;
  return { status: "OK", tier, packagePrice, addOnsSubtotal, preferredDiscount, total, selectedAddOns };
}

// --- Sanitize input (never log full PII or secrets) ---
export function sanitizeInput(input) {
  if (!input || typeof input !== "object") return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    // Skip keys that might contain sensitive data
    if (/password|token|secret|card|ssn|bank/i.test(key)) continue;
    // Truncate long string values
    if (typeof value === "string" && value.length > 500) {
      sanitized[key] = value.substring(0, 500) + "...[truncated]";
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      // Shallow sanitize nested objects
      sanitized[key] = sanitizeInput(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// --- Reducer ---
export function simulationReducer(state, action, input, scenario) {
  if (!scenario) return state;
  const newState = { ...state };

  switch (action) {
    // Generic step advancement
    case "advance_step":
      newState.step_index = (state.step_index || 0) + 1;
      if (newState.step_index >= scenario.steps.length) {
        newState.completed = true;
      }
      return newState;

    // Reset
    case "reset_scenario":
      return { ...scenario.initial_state };

    // Prospect research
    case "select_prospect":
      newState.selected_prospect_id = input.prospect_id;
      newState.selected_prospect = (state.prospects || []).find(p => p.id === input.prospect_id);
      return newState;
    case "check_professional_video":
      newState.video_check_done = true;
      newState.video_check_result = newState.selected_prospect?.has_professional_video ? "PROFESSIONAL_VIDEO_PRESENT" : "NO_PROFESSIONAL_VIDEO";
      return newState;
    case "confirm_research":
      newState.completed = true;
      return newState;

    // CRM pipeline
    case "select_contact":
      newState.selected_contact_id = input.contact_id;
      newState.selected_contact = (state.contacts || []).find(c => c.id === input.contact_id);
      return newState;
    case "advance_contact":
      newState.moved_contact_id = input.contact_id;
      newState.moved_to_stage = input.to_stage;
      newState.contacts = (state.contacts || []).map(c => c.id === input.contact_id ? { ...c, stage: input.to_stage } : c);
      return newState;
    case "log_activity":
      newState.last_activity = { type: input.activity_type, notes: input.notes };
      return newState;

    // Discovery
    case "start_discovery":
      newState.discovery_started = true;
      return newState;
    case "submit_discovery":
      newState.discovery_data = { ...state.discovery_data, ...input };
      return newState;
    case "confirm_discovery":
      newState.completed = true;
      return newState;

    // Pricing
    case "select_property":
      newState.selected_property_id = input.property_id;
      newState.selected_property = (state.properties || []).find(p => p.id === input.property_id);
      return newState;
    case "select_package":
      newState.selected_package = input.package_id;
      return newState;
    case "confirm_pricing":
      newState.pricing_result = calculateSimPricing(
        newState.selected_property?.sqft,
        newState.selected_package,
        input.add_ons || state.selected_add_ons,
        input.preferred_active ?? state.preferred_active
      );
      newState.selected_add_ons = input.add_ons || state.selected_add_ons;
      newState.preferred_active = input.preferred_active ?? state.preferred_active;
      newState.completed = true;
      return newState;

    // First booking
    case "acknowledge_objection":
      newState.objection_acknowledged = true;
      return newState;
    case "respond_with_value":
      newState.value_response = input.value_response;
      newState.objection_handled = true;
      return newState;
    case "confirm_booking":
      newState.selected_package = input.package_id;
      newState.booking_confirmed = true;
      newState.completed = true;
      return newState;

    // Post-service follow-up
    case "start_followup":
      newState.followup_started = true;
      return newState;
    case "log_followup":
      newState.followup_done = true;
      newState.followup_notes = input.satisfaction_notes;
      return newState;
    case "request_referral":
      newState.referral_requested = true;
      newState.referral_ask = input.referral_ask;
      newState.completed = true;
      return newState;

    // Customer onboarding
    case "send_welcome":
      newState.onboarding_steps = { ...state.onboarding_steps, welcome_sent: true };
      return newState;
    case "confirm_account":
      newState.onboarding_steps = { ...state.onboarding_steps, account_created: true };
      return newState;
    case "offer_preferred":
      newState.onboarding_steps = { ...state.onboarding_steps, preferred_offered: true };
      newState.completed = true;
      return newState;
    case "pressure_preferred":
      newState.pressure_warning = true;
      return newState;

    // Customer account
    case "view_dashboard":
    case "view_deliverables":
    case "view_membership":
      return newState;

    // Billing
    case "acknowledge_billing":
      newState.billing_acknowledged = true;
      return newState;
    case "explain_benefits":
      newState.benefits_explanation = input.benefits_explanation;
      return newState;
    case "confirm_resolution":
      newState.completed = true;
      return newState;
    case "promise_refund":
      newState.refund_warning = true;
      return newState;

    // Teach-back
    case "submit_teachback_1":
    case "submit_teachback_2":
    case "submit_teachback_3":
      newState.teachback_responses = { ...state.teachback_responses, ...input };
      return newState;

    // Media specialist boundary
    case "review_ms_role":
      newState.ms_role_reviewed = true;
      return newState;
    case "walk_lifecycle":
      newState.current_lifecycle_step = (state.current_lifecycle_step || 0) + 1;
      return newState;
    case "explain_fulfillment":
      newState.completed = true;
      return newState;
    case "promise_provider":
    case "expose_payout":
    case "promise_turnaround_guarantee":
      newState.boundary_violation = action;
      return newState;

    // Project lifecycle
    case "review_project":
      newState.project_reviewed = true;
      return newState;
    case "advance_lifecycle":
      newState.current_step = (state.current_step || 0) + 1;
      return newState;
    case "confirm_delivery":
      newState.completed = true;
      return newState;
    case "upload_real_file":
      newState.real_file_violation = true;
      return newState;

    // Final certification
    case "cert_research":
      newState.certification_steps = { ...state.certification_steps, research: true, video_check: true };
      return newState;
    case "cert_pricing":
      newState.certification_steps = { ...state.certification_steps, discovery: true, pricing: true };
      newState.pricing_result = calculateSimPricing(newState.property?.sqft, input.package_id);
      return newState;
    case "cert_confirm_boundaries":
      newState.completed = true;
      newState.certification_steps = { ...state.certification_steps, booking: true, followup: true };
      return newState;
    case "cert_custom_discount":
    case "cert_expose_payout":
      newState.boundary_violation = action;
      return newState;

    // E4 System Mastery
    case "e4_review_account":
    case "e4_review_packages":
    case "e4_review_project":
      return newState;

    // E8 Cold Calling
    case "e8_submit_opener":
      newState.opener_submitted = true;
      return newState;
    case "e8_ask_permission":
    case "e8_explore_backup":
      newState.call_response_handled = true;
      return newState;
    case "e8_start_discovery":
      newState.discovery_started = true;
      newState.completed = true;
      return newState;

    // E13 Boundary Classification
    case "e13_safe_pricing":
    case "e13_safe_provider":
    case "e13_safe_staging_discount":
      newState.boundary_safe = true;
      return newState;

    // E16 Jordan Onboarding
    case "e16_send_welcome":
      newState.onboarding_steps = { ...state.onboarding_steps, welcome_sent: true, account_confirmed: true };
      return newState;
    case "e16_orient_service":
      newState.onboarding_steps = { ...state.onboarding_steps, service_oriented: true };
      return newState;
    case "e16_prepare_booking_support":
      newState.onboarding_steps = { ...state.onboarding_steps, first_booking_prepared: true, billing_explained: true, support_explained: true };
      newState.completed = true;
      return newState;

    // E17 Jordan Customer Training
    case "e17_submit_booking_training":
    case "e17_submit_deliverables_training":
    case "e17_submit_billing_help_training":
      newState.training_steps = { ...state.training_steps, ...input };
      return newState;

    // E19 Jordan Final Certification
    case "e19_onboard_jordan":
      newState.cert_steps = { ...state.cert_steps, onboarded: true };
      return newState;
    case "e19_prepare_booking_train":
      newState.cert_steps = { ...state.cert_steps, first_booking_prepared: true, trained: true };
      newState.pricing_result = calculateSimPricing(newState.property?.sqft, input.package_id);
      return newState;
    case "e19_confirm_boundaries":
      newState.cert_steps = { ...state.cert_steps, boundaries_confirmed: true };
      newState.completed = true;
      return newState;

    // Customer Full Lifecycle
    case "customer_submit_discovery":
      newState.discovery_data = { ...state.discovery_data, ...input };
      return newState;
    case "customer_confirm_pricing":
      newState.selected_package = input.package_id;
      newState.pricing_result = calculateSimPricing(
        newState.property?.sqft,
        input.package_id,
        input.add_ons || state.selected_add_ons,
        input.preferred_active ?? state.preferred_active
      );
      return newState;
    case "customer_complete_lifecycle":
      newState.current_phase = (state.phases || []).length - 1;
      newState.completed = true;
      return newState;

    // Provider Boundary
    case "provider_review_qualification":
    case "provider_review_assignment":
      newState.current_step = (state.current_step || 0) + 1;
      return newState;
    case "provider_safe_boundary":
      newState.completed = true;
      return newState;
    case "perform_provider_craft":
      newState.critical_failure = action;
      return newState;

    // Critical failure actions (state doesn't change, but violation is recorded)
    case "skip_video_check":
    case "create_real_prospect":
    case "contact_without_research":
    case "invent_pricing":
    case "promise_specific_provider":
    case "skip_discovery":
    case "promise_custom_price":
    case "skip_tier_determination":
    case "offer_unauthorized_discount":
    case "disparage_competitor":
    case "skip_followup":
    case "promise_cash_payout":
    case "promise_provider_details":
    case "skip_onboarding":
    case "promise_free_services":
    case "expose_provider_payout":
    case "expose_internal_pricing":
    case "promise_staging":
    case "skip_lifecycle_stage":
    case "charge_real_stripe":
      newState.critical_failure = action;
      return newState;

    default:
      return state;
  }
}

// --- Validation ---
export function validateAction(scenario, stepIndex, action, input, newState) {
  if (!scenario) return { result: "pending", notes: "No scenario", expected_category: "", criticality: "normal" };
  const step = scenario.steps[stepIndex];
  if (!step) return { result: "pending", notes: "No step", expected_category: "", criticality: "normal" };

  const expectedAction = step.expected_action;
  const expectedCategory = step.expected_category;
  const criticality = step.criticality || "normal";

  // Check critical failures
  if (scenario.validation?.critical_failures?.includes(action)) {
    return {
      result: "critical_failure",
      notes: `"${action}" is a critical failure in this scenario. This action is never permitted in simulation or production.`,
      expected_category: expectedCategory,
      criticality: "critical",
    };
  }

  // Check if action matches expected
  if (action === expectedAction) {
    return {
      result: "correct",
      notes: `Correct: ${step.title} completed.`,
      expected_category: expectedCategory,
      criticality,
    };
  }

  // Check boundary violations (wrong choice in a boundary step)
  if (newState.boundary_violation || newState.critical_failure) {
    return {
      result: "critical_failure",
      notes: `Boundary violation: ${newState.boundary_violation || newState.critical_failure}. Review the training boundaries.`,
      expected_category: expectedCategory,
      criticality: "critical",
    };
  }

  // Check for warning-level wrong choices (e.g., pressure_preferred)
  if (newState.pressure_warning || newState.refund_warning || newState.real_file_violation) {
    return {
      result: "warning",
      notes: `Warning: This action is not recommended. Review the training guidance.`,
      expected_category: expectedCategory,
      criticality: "high",
    };
  }

  // Unexpected action
  return {
    result: "incorrect",
    notes: `Expected "${expectedAction}" but received "${action}". Try again.`,
    expected_category: expectedCategory,
    criticality,
  };
}

// --- Session ID generator ---
export function generateSessionId() {
  return `sim_session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function generateEventId(sessionId) {
  return `sim_evt_${sessionId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}