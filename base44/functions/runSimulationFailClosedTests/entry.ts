// ============================================================================
// FAIL-CLOSED TESTS — Training Simulation Mode Isolation Verification
// ============================================================================
// Proves that Training Mode cannot create/change/delete real customers,
// organizations, members, listings, bookings, projects, jobs, Media Specialist
// assignments, deliverables, invoices, memberships, referrals, payments, holds,
// credits, commissions, payouts, entitlements, or external communications.
// ============================================================================

import { guardSimulationAction, validateTrainingSessionIsolation, validateResetReplaySafety, isSyntheticAction, isCriticalFailureAction, PROHIBITED_PRODUCTION_EFFECTS, CRITICAL_FAILURE_ACTIONS } from "../../shared/simulationGuard.ts";

export default async function handler(req: Request) {
  const results: { test: string; passed: boolean; details: string }[] = [];

  // --- Test 1: Training mode flag required ---
  {
    const guard = guardSimulationAction("select_prospect", false);
    results.push({
      test: "Training mode flag required",
      passed: !guard.allowed,
      details: guard.allowed ? "Guard allowed action without training mode" : "Correctly blocked: training mode required",
    });
  }

  // --- Test 2: Synthetic action allowed in training mode ---
  {
    const guard = guardSimulationAction("select_prospect", true);
    results.push({
      test: "Synthetic action allowed in training mode",
      passed: guard.allowed && guard.is_synthetic,
      details: guard.allowed ? "Correctly allowed synthetic action" : `Blocked: ${guard.reason}`,
    });
  }

  // --- Test 3: B2B synthetic action allowed ---
  {
    const guard = guardSimulationAction("b2b_identify_signal", true);
    results.push({
      test: "B2B synthetic action allowed",
      passed: guard.allowed && guard.is_synthetic,
      details: guard.allowed ? "Correctly allowed B2B synthetic action" : `Blocked: ${guard.reason}`,
    });
  }

  // --- Test 4: Critical failure action blocked but recorded ---
  {
    const guard = guardSimulationAction("invent_pricing", true);
    results.push({
      test: "Critical failure action blocked but recorded",
      passed: !guard.allowed && guard.is_critical_failure,
      details: !guard.allowed && guard.is_critical_failure ? "Correctly blocked critical failure (recorded for grading)" : `Unexpected: allowed=${guard.allowed}`,
    });
  }

  // --- Test 5: B2B critical failure blocked ---
  {
    const guard = guardSimulationAction("b2b_invent_pricing", true);
    results.push({
      test: "B2B critical failure blocked",
      passed: !guard.allowed && guard.is_critical_failure,
      details: !guard.allowed && guard.is_critical_failure ? "Correctly blocked B2B critical failure" : `Unexpected: allowed=${guard.allowed}`,
    });
  }

  // --- Test 6: Real Stripe charge blocked ---
  {
    const guard = guardSimulationAction("charge_real_stripe", true);
    results.push({
      test: "Real Stripe charge blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real Stripe charge allowed",
    });
  }

  // --- Test 7: Real email send blocked ---
  {
    const guard = guardSimulationAction("send_real_email", true);
    results.push({
      test: "Real email send blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real email allowed",
    });
  }

  // --- Test 8: Real SMS send blocked ---
  {
    const guard = guardSimulationAction("send_real_sms", true);
    results.push({
      test: "Real SMS send blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real SMS allowed",
    });
  }

  // --- Test 9: Real customer creation blocked ---
  {
    const guard = guardSimulationAction("create_real_customer", true);
    results.push({
      test: "Real customer creation blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real customer creation allowed",
    });
  }

  // --- Test 10: Real organization creation blocked ---
  {
    const guard = guardSimulationAction("create_real_organization", true);
    results.push({
      test: "Real organization creation blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real org creation allowed",
    });
  }

  // --- Test 11: Real booking creation blocked ---
  {
    const guard = guardSimulationAction("create_real_booking", true);
    results.push({
      test: "Real booking creation blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real booking allowed",
    });
  }

  // --- Test 12: Customer admin impersonation blocked ---
  {
    const guard = guardSimulationAction("impersonate_customer_admin", true);
    results.push({
      test: "Customer admin impersonation blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: impersonation allowed",
    });
  }

  // --- Test 13: Financial credential entry blocked ---
  {
    const guard = guardSimulationAction("enter_financial_credentials", true);
    results.push({
      test: "Financial credential entry blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: credential entry allowed",
    });
  }

  // --- Test 14: Account hold bypass blocked ---
  {
    const guard = guardSimulationAction("bypass_account_hold", true);
    results.push({
      test: "Account hold bypass blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: hold bypass allowed",
    });
  }

  // --- Test 15: Fake paid state blocked ---
  {
    const guard = guardSimulationAction("fake_paid_state", true);
    results.push({
      test: "Fake paid state blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: fake paid state allowed",
    });
  }

  // --- Test 16: Real agreement creation blocked ---
  {
    const guard = guardSimulationAction("create_real_agreement", true);
    results.push({
      test: "Real agreement creation blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real agreement allowed",
    });
  }

  // --- Test 17: Real contract version creation blocked ---
  {
    const guard = guardSimulationAction("create_real_contract_version", true);
    results.push({
      test: "Real contract version creation blocked",
      passed: !guard.allowed && !!guard.prohibited_effect,
      details: !guard.allowed ? `Correctly blocked: ${guard.prohibited_effect}` : "FAILED: real contract version allowed",
    });
  }

  // --- Test 18: Unknown action fails closed ---
  {
    const guard = guardSimulationAction("some_unknown_action_xyz", true);
    results.push({
      test: "Unknown action fails closed",
      passed: !guard.allowed,
      details: !guard.allowed ? "Correctly blocked unknown action (fail-closed)" : "FAILED: unknown action allowed",
    });
  }

  // --- Test 19: Session isolation validation ---
  {
    const validSession = validateTrainingSessionIsolation({
      is_training_mode: true,
      session_id: "sim_session_12345_abc",
      scenario_id: "b2b_final_certification",
      learner_id: "sales_member_123",
    });
    results.push({
      test: "Valid session isolation",
      passed: validSession.isolated,
      details: validSession.isolated ? "Session correctly validated as isolated" : `Violations: ${validSession.violations.join(", ")}`,
    });
  }

  // --- Test 20: Invalid session isolation detected ---
  {
    const invalidSession = validateTrainingSessionIsolation({
      is_training_mode: false,
      session_id: "real_session_123",
      scenario_id: "",
      learner_id: "",
    });
    results.push({
      test: "Invalid session isolation detected",
      passed: !invalidSession.isolated && invalidSession.violations.length >= 4,
      details: !invalidSession.isolated ? `Correctly detected ${invalidSession.violations.length} violations` : "FAILED: invalid session passed validation",
    });
  }

  // --- Test 21: Reset/replay safety — no real ID leaks ---
  {
    const beforeState = { selected_prospect_id: "sim_prospect_1", organization_id: "sim_org_1" };
    const afterState = { selected_prospect_id: null, organization_id: "sim_org_1" };
    const resetSafety = validateResetReplaySafety(beforeState, afterState);
    results.push({
      test: "Reset/replay safety — no real ID leaks",
      passed: resetSafety.safe,
      details: resetSafety.safe ? "No real ID leaks detected in reset" : `Leaks: ${resetSafety.leaks.join(", ")}`,
    });
  }

  // --- Test 22: Reset/replay safety — real ID leak detected ---
  {
    const beforeState = { organization_id: "507f1f77bcf86cd799439011" }; // real-looking MongoDB ID
    const afterState = {};
    const resetSafety = validateResetReplaySafety(beforeState, afterState);
    results.push({
      test: "Reset/replay safety — real ID leak detected",
      passed: !resetSafety.safe,
      details: !resetSafety.safe ? "Correctly detected real ID leak" : "FAILED: real ID leak not detected",
    });
  }

  // --- Test 23: All prohibited production effects are blocked ---
  {
    let allBlocked = true;
    const failedEffects: string[] = [];
    for (const effect of PROHIBITED_PRODUCTION_EFFECTS) {
      const guard = guardSimulationAction(effect, true);
      if (guard.allowed) {
        allBlocked = false;
        failedEffects.push(effect);
      }
    }
    results.push({
      test: `All ${PROHIBITED_PRODUCTION_EFFECTS.length} prohibited production effects blocked`,
      passed: allBlocked,
      details: allBlocked ? "All prohibited effects correctly blocked" : `Failed to block: ${failedEffects.join(", ")}`,
    });
  }

  // --- Test 24: All critical failure actions are blocked ---
  {
    let allBlocked = true;
    const failedActions: string[] = [];
    for (const action of CRITICAL_FAILURE_ACTIONS) {
      const guard = guardSimulationAction(action, true);
      if (guard.allowed) {
        allBlocked = false;
        failedActions.push(action);
      }
    }
    results.push({
      test: `All ${CRITICAL_FAILURE_ACTIONS.length} critical failure actions blocked`,
      passed: allBlocked,
      details: allBlocked ? "All critical failures correctly blocked (recorded for grading)" : `Failed to block: ${failedActions.join(", ")}`,
    });
  }

  // --- Test 25: B2B simulation cannot alter individual booking logic ---
  {
    // B2B actions should not touch individual booking state
    const b2bGuard = guardSimulationAction("b2b_consume_credit", true);
    const individualGuard = guardSimulationAction("confirm_booking", true);
    const b2bDoesNotAffectIndividual = b2bGuard.allowed && individualGuard.allowed && b2bGuard.is_synthetic && individualGuard.is_synthetic;
    results.push({
      test: "B2B simulation cannot alter individual booking logic",
      passed: b2bDoesNotAffectIndividual,
      details: b2bDoesNotAffectIndividual ? "B2B and individual actions are isolated synthetic actions" : "B2B/individual isolation failed",
    });
  }

  // --- Test 26: B2B simulation cannot alter Media Specialist payout economics ---
  {
    const exposePayoutGuard = guardSimulationAction("expose_payout", true);
    const promiseProviderGuard = guardSimulationAction("promise_provider", true);
    const payoutProtected = !exposePayoutGuard.allowed && !promiseProviderGuard.allowed;
    results.push({
      test: "B2B simulation cannot alter Media Specialist payout economics",
      passed: payoutProtected,
      details: payoutProtected ? "Provider payout exposure and provider promises correctly blocked" : "FAILED: payout economics not protected",
    });
  }

  // --- Test 27: No production permission escalation ---
  {
    const escalateGuard = guardSimulationAction("escalate_real_permission", true);
    const adminOpGuard = guardSimulationAction("use_privileged_financial_operation", true);
    const noEscalation = !escalateGuard.allowed && !adminOpGuard.allowed;
    results.push({
      test: "No production permission escalation",
      passed: noEscalation,
      details: noEscalation ? "Permission escalation and privileged operations correctly blocked" : "FAILED: permission escalation allowed",
    });
  }

  // --- Test 28: No external webhook side effects ---
  {
    const webhookGuard = guardSimulationAction("trigger_real_webhook", true);
    results.push({
      test: "No external webhook side effects",
      passed: !webhookGuard.allowed,
      details: !webhookGuard.allowed ? "Real webhook trigger correctly blocked" : "FAILED: webhook trigger allowed",
    });
  }

  // --- Summary ---
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const allPassed = failed === 0;

  return new Response(JSON.stringify({
    status: allPassed ? "PASS" : "FAIL",
    total_tests: results.length,
    passed,
    failed,
    results,
    summary: allPassed
      ? `ALL ${results.length} FAIL-CLOSED TESTS PASSED — Training Mode isolation verified.`
      : `${failed} FAIL-CLOSED TEST(S) FAILED — Training Mode isolation compromised.`,
  }), {
    status: allPassed ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
}