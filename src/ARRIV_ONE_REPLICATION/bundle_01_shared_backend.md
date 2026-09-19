// FILE: base44/shared/salesTrainingShared.ts
// Copy this entire file into Arriv One at the same path.

/**
 * Sales Training Shared Constants — Backend TypeScript mirror of salesTrainingData.js
 * Used by backend functions for training gating, certification, and audit logging.
 */

export const TRAINING_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  REMEDIATION_REQUIRED: "REMEDIATION_REQUIRED",
  TRAINING_COMPLETE: "TRAINING_COMPLETE",
  AWAITING_CERTIFICATION: "AWAITING_CERTIFICATION",
  SALES_CERTIFIED: "SALES_CERTIFIED",
  CERTIFICATION_SUSPENDED: "CERTIFICATION_SUSPENDED",
  NOT_CERTIFIED: "NOT_CERTIFIED",
} as const;

export const CALLING_AUTH = {
  CALLING_LOCKED: "CALLING_LOCKED",
  SUPERVISED_CALLING_ONLY: "SUPERVISED_CALLING_ONLY",
  TRAINING_INDEPENDENT_CALLING_AUTHORIZED: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED",
  INDEPENDENT_CALLING_AUTHORIZED: "INDEPENDENT_CALLING_AUTHORIZED",
} as const;

export const CERTIFICATION_REQUIREMENTS = {
  module_quiz_min_score: 95,
  critical_questions_required: 100,
  final_exam_min_score: 95,
  final_exam_total_questions: 50,
  roleplay_min_score: 95,
  system_crm_min_score: 95,
  onboarding_min_score: 95,
  teachback_min_score: 95,
  practicum_min_score: 95,
  min_watch_percentage: 95,
  prospect_prep_exercise_required: true,
  modules_total: 20,
  manager_authorization_required: true,
  overall_passing_score: 95,
} as const;

export const KNOWLEDGE_BANK_VERSION = "KB-2026.03";

export const KNOWLEDGE_BANK_CRITICAL_TOPICS = [
  "pricing_authority",
  "product_truth",
  "provider_boundary",
  "staging_boundary",
  "discount_authority",
  "deceptive_outreach",
  "training_mode_isolation",
  "authorization_requirement",
] as const;

export const MODULE_ID_ALIASES: Record<string, string> = {
  mod_01: "E0", mod_02: "E1", mod_03: "E2", mod_04: "E3",
  mod_05: "E6", mod_06: "E7", mod_07: "E8", mod_08: "E9",
  mod_09: "E10", mod_10: "E11", mod_11: "E5", mod_12: "E13",
  mod_13: "E19", mod_14: "E13",
};

export function resolveModuleId(moduleId: string | undefined | null): string | undefined | null {
  if (!moduleId) return moduleId;
  return MODULE_ID_ALIASES[moduleId] || moduleId;
}

export const PROSPECT_PREP_EXERCISE = {
  title: "Prospect Brief Preparation Exercise",
  description: "A practical prospect-preparation exercise using the Arriv One Prospect Brief capability. The rep must VERIFY research rather than blindly trust AI.",
  steps: [
    { step: 1, description: "Find or select an appropriate real prospect." },
    { step: 2, description: "Create or review the Prospect Brief using the Prospect Brief / Call Prep tool." },
    { step: 3, description: "Identify a relevant listing from the brief's listing intelligence." },
    { step: 4, description: "Perform the professional-video check and confirm the status." },
    { step: 5, description: "Complete the 'Why Them' section with specific, evidence-based reasoning." },
    { step: 6, description: "Identify the likely opportunity (currently sellable services only)." },
    { step: 7, description: "Select 3-5 discovery questions from the brief that are most relevant." },
    { step: 8, description: "Prepare a personalized opening using actual research from the brief." },
    { step: 9, description: "Make or simulate the call according to sales training." },
    { step: 10, description: "Record the outcome in CRM (result, notes, next action, due date)." },
    { step: 11, description: "Schedule or create an appropriate follow-up based on the call outcome." },
  ],
  verification_requirement: "The rep must VERIFY the brief's research against at least one independent source before making the call.",
  staging_boundary: "Physical staging is NOT currently sales authorized. Reps may document interest only.",
} as const;

export const CRITICAL_FAILURES = [
  "material_arriv_misrepresentation",
  "invented_pricing",
  "quoting_stale_pricing_as_authoritative",
  "unauthorized_discount",
  "false_guarantee",
  "unauthorized_turnaround_guarantee",
  "invented_service_capability",
  "deceptive_sales_behavior",
  "deceptive_outreach",
  "serious_unprofessional_conduct",
  "critical_customer_data_crm_violation",
  "fundamental_inability_to_explain_arriv_one",
  "blindly_trusting_ai_without_verification",
  "selling_unauthorized_staging",
  "exposing_internal_provider_payout",
  "production_side_effects_from_training_mode",
  "bypassing_required_authorization",
] as const;

export const CERTIFICATION_DOMAINS = [
  { key: "product_knowledge", label: "Product Knowledge", description: "Product truth, pricing authority, package/tier knowledge, provider boundary awareness.", assessed_by: ["module_quizzes", "critical_questions", "final_exam"] },
  { key: "system_operation", label: "System Operation", description: "CRM navigation, pipeline management, activity logging, booking flow.", assessed_by: ["system_crm_practical", "simulation_events"] },
  { key: "sales_execution", label: "Sales Execution", description: "Discovery, cold calling, objections, pricing conversations, boundary classification, follow-up.", assessed_by: ["roleplay", "simulation_events", "final_exam"] },
  { key: "customer_onboarding", label: "Customer Onboarding", description: "New customer welcome, account access, service orientation, first-booking preparation, billing/membership setup.", assessed_by: ["onboarding_practical", "simulation_events"] },
  { key: "customer_training", label: "Customer Training", description: "Training the customer to book, find deliverables, understand billing, and know where to get help.", assessed_by: ["teachback_practical", "simulation_events"] },
] as const;

export const ROLEPLAY_RUBRIC = {
  total_points: 100, passing_score: 95,
  categories: [
    { key: "opening_professionalism", label: "Opening / Professionalism", points: 10 },
    { key: "discovery", label: "Discovery", points: 20 },
    { key: "listening", label: "Listening", points: 15 },
    { key: "accurate_arriv_explanation", label: "Accurate Arriv Explanation", points: 15 },
    { key: "connect_value", label: "Connect Value", points: 15 },
    { key: "objections", label: "Objections", points: 15 },
    { key: "clear_next_step", label: "Clear Next Step", points: 10 },
  ],
} as const;

export const PRACTICUM_RUBRIC = {
  total_points: 100, passing_score: 95,
  categories: [
    { key: "prospect_quality", label: "Prospect Quality", points: 20 },
    { key: "call_preparation", label: "Call Preparation / Personalization", points: 15 },
    { key: "sales_execution", label: "Sales Execution", points: 20 },
    { key: "follow_up_execution", label: "Follow-Up Execution", points: 15 },
    { key: "crm_accuracy", label: "CRM Accuracy / Completeness", points: 15 },
    { key: "judgment_boundaries", label: "Judgment / Sales Boundaries", points: 15 },
  ],
} as const;

export const CRM_SYSTEM_RUBRIC = {
  total_points: 100, passing_score: 95,
  categories: [
    { key: "crm_navigation", label: "CRM Navigation & Data Entry", points: 20 },
    { key: "pipeline_management", label: "Pipeline / Deal Stage Management", points: 15 },
    { key: "activity_logging", label: "Activity Logging Accuracy", points: 15 },
    { key: "booking_flow_execution", label: "Booking Flow Execution", points: 15 },
    { key: "follow_up_scheduling", label: "Follow-Up Scheduling & Cadence", points: 15 },
    { key: "system_boundaries", label: "System Boundary Awareness (no production side effects from training)", points: 20 },
  ],
} as const;

export const ONBOARDING_RUBRIC = {
  total_points: 100, passing_score: 95,
  categories: [
    { key: "welcome_communication", label: "Welcome Communication Quality", points: 15 },
    { key: "account_access_setup", label: "Account Access Setup & Verification", points: 20 },
    { key: "service_orientation", label: "Service Orientation (packages, process, SLA)", points: 20 },
    { key: "first_booking_preparation", label: "First Booking Preparation", points: 20 },
    { key: "billing_membership_setup", label: "Billing / Preferred Membership Setup", points: 15 },
    { key: "support_pathway", label: "Support Pathway Communication", points: 10 },
  ],
} as const;

export const TEACH_BACK_RUBRIC = {
  total_points: 100, passing_score: 95,
  categories: [
    { key: "accuracy", label: "Accuracy of Information Delivered", points: 25 },
    { key: "clarity", label: "Clarity & Structure of Explanation", points: 20 },
    { key: "booking_guidance", label: "Booking Process Guidance", points: 15 },
    { key: "deliverables_guidance", label: "Deliverables Location & Access Guidance", points: 15 },
    { key: "billing_guidance", label: "Billing & Membership Guidance", points: 15 },
    { key: "support_guidance", label: "Support & Help-Seeking Guidance", points: 10 },
  ],
} as const;

export const BONUS_MILESTONES = [
  { type: "CERTIFICATION_2_WEEK", label: "Successful 2-Week Certification", amount: 50 },
  { type: "DAY_30", label: "30-Day Milestone", amount: 100 },
  { type: "DAY_90", label: "90-Day Milestone", amount: 150 },
  { type: "DAY_180", label: "6-Month Milestone", amount: 200 },
] as const;

export const REFERRAL_CREDIT_AMOUNT = 20;
export const REFERRAL_CREDIT_AMOUNT_PREFERRED = 40;
export const REFERRAL_CASH_OUT_MINIMUM = 260;

export const PREFERRED_MEMBERSHIP = {
  monthly_price: 29.99, regular_discount_rate: 0.10, mls_flat_discount: 5, mls_discount_type: "flat", plan: "preferred_monthly",
} as const;

export const STAGING_AWARENESS = {
  currently_sellable: false,
  message: "Physical staging is NOT currently authorized for sale. A separate Staging Sales Certification will be required.",
  future_certification: "STAGING SALES CERTIFICATION",
} as const;

export const OVERTIME_THRESHOLD_HOURS = 40;
export const NORMAL_PAID_WORKWEEK_HOURS = 32;

export function evaluateQuizAttempt(score: number, allCriticalCorrect: boolean, minScore: number = CERTIFICATION_REQUIREMENTS.module_quiz_min_score): { passed: boolean; reason: string } {
  if (!allCriticalCorrect) return { passed: false, reason: "Critical question(s) incorrect — all critical questions must be answered correctly." };
  if (score < minScore) return { passed: false, reason: `Score ${score}% below minimum ${minScore}%.` };
  return { passed: true, reason: "Passed." };
}

export function evaluateScoredAssessment(score: number, criticalFailures: string[], minScore: number): { passed: boolean; reason: string } {
  if (criticalFailures.length > 0) return { passed: false, reason: `Critical failure(s): ${criticalFailures.join(", ")}. Remediation required.` };
  if (score < minScore) return { passed: false, reason: `Score ${score}/${100} below minimum ${minScore}.` };
  return { passed: true, reason: "Passed." };
}

export function computeAuthorizationReadiness(cert: {
  modules_passed_count?: number; quiz_average_score?: number; critical_questions_status?: string;
  final_exam_passed?: boolean; roleplay_passed?: boolean; system_crm_passed?: boolean; practicum_passed?: boolean;
  onboarding_passed?: boolean; teachback_passed?: boolean; critical_failures?: string[]; remediation_modules?: string[];
}): {
  all_modules_passed: boolean; quiz_average_met: boolean; critical_questions_all_correct: boolean;
  final_exam_passed: boolean; roleplay_passed: boolean; system_crm_passed: boolean; onboarding_passed: boolean;
  teachback_passed: boolean; no_critical_failures: boolean; no_remediation_pending: boolean; ready_for_authorization: boolean;
} {
  const all_modules_passed = (cert.modules_passed_count || 0) >= CERTIFICATION_REQUIREMENTS.modules_total;
  const quiz_average_met = (cert.quiz_average_score || 0) >= CERTIFICATION_REQUIREMENTS.module_quiz_min_score;
  const critical_questions_all_correct = cert.critical_questions_status === "ALL_CORRECT";
  const final_exam_passed = !!cert.final_exam_passed;
  const roleplay_passed = !!cert.roleplay_passed;
  const system_crm_passed = !!(cert.system_crm_passed || cert.practicum_passed);
  const onboarding_passed = !!cert.onboarding_passed;
  const teachback_passed = !!cert.teachback_passed;
  const no_critical_failures = (cert.critical_failures || []).length === 0;
  const no_remediation_pending = (cert.remediation_modules || []).length === 0;
  const ready_for_authorization = all_modules_passed && quiz_average_met && critical_questions_all_correct && final_exam_passed && roleplay_passed && system_crm_passed && onboarding_passed && teachback_passed && no_critical_failures && no_remediation_pending;
  return { all_modules_passed, quiz_average_met, critical_questions_all_correct, final_exam_passed, roleplay_passed, system_crm_passed, onboarding_passed, teachback_passed, no_critical_failures, no_remediation_pending, ready_for_authorization };
}

export function computeDomainStatuses(cert: {
  modules_passed_count?: number; quiz_average_score?: number; critical_questions_status?: string;
  final_exam_passed?: boolean; roleplay_passed?: boolean; system_crm_passed?: boolean; practicum_passed?: boolean;
  onboarding_passed?: boolean; teachback_passed?: boolean; critical_failures?: string[];
}): Record<string, "PENDING" | "PASSED" | "FAILED"> {
  const hasCriticalFailures = (cert.critical_failures || []).length > 0;
  const productKnowledgePassed = (cert.modules_passed_count || 0) >= CERTIFICATION_REQUIREMENTS.modules_total && (cert.quiz_average_score || 0) >= CERTIFICATION_REQUIREMENTS.module_quiz_min_score && cert.critical_questions_status === "ALL_CORRECT" && !!cert.final_exam_passed && !hasCriticalFailures;
  const systemOperationPassed = !!(cert.system_crm_passed || cert.practicum_passed) && !hasCriticalFailures;
  const salesExecutionPassed = !!cert.roleplay_passed && !hasCriticalFailures;
  const customerOnboardingPassed = !!cert.onboarding_passed && !hasCriticalFailures;
  const customerTrainingPassed = !!cert.teachback_passed && !hasCriticalFailures;
  return {
    product_knowledge: productKnowledgePassed ? "PASSED" : hasCriticalFailures ? "FAILED" : "PENDING",
    system_operation: systemOperationPassed ? "PASSED" : hasCriticalFailures ? "FAILED" : "PENDING",
    sales_execution: salesExecutionPassed ? "PASSED" : hasCriticalFailures ? "FAILED" : "PENDING",
    customer_onboarding: customerOnboardingPassed ? "PASSED" : hasCriticalFailures ? "FAILED" : "PENDING",
    customer_training: customerTrainingPassed ? "PASSED" : hasCriticalFailures ? "FAILED" : "PENDING",
  };
}

export function checkCertificationEligibility(cert: {
  modules_passed_count?: number; quiz_average_score?: number; critical_questions_status?: string;
  final_exam_passed?: boolean; roleplay_passed?: boolean; system_crm_passed?: boolean; practicum_passed?: boolean;
  onboarding_passed?: boolean; teachback_passed?: boolean; critical_failures?: string[]; remediation_modules?: string[];
}): { eligible: boolean; missing: string[] } {
  const missing: string[] = [];
  if ((cert.modules_passed_count || 0) < CERTIFICATION_REQUIREMENTS.modules_total) missing.push("All 20 modules passed");
  if ((cert.quiz_average_score || 0) < CERTIFICATION_REQUIREMENTS.module_quiz_min_score) missing.push("Quiz average >= 95%");
  if (cert.critical_questions_status !== "ALL_CORRECT") missing.push("All critical questions correct (100% required)");
  if (!cert.final_exam_passed) missing.push("Final exam passed (>= 95%)");
  if (!cert.roleplay_passed) missing.push("Role-play passed (>= 95/100)");
  if (!(cert.system_crm_passed || cert.practicum_passed)) missing.push("CRM/System practical passed (>= 95/100)");
  if (!cert.onboarding_passed) missing.push("Onboarding practical passed (>= 95/100)");
  if (!cert.teachback_passed) missing.push("Teach-back practical passed (>= 95/100)");
  if ((cert.critical_failures || []).length > 0) missing.push("No unresolved critical failures");
  if ((cert.remediation_modules || []).length > 0) missing.push("No pending remediation modules");
  return { eligible: missing.length === 0, missing };
}