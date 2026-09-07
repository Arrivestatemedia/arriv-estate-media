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
  final_exam_total_questions: 40,
  roleplay_min_score: 95,
  practicum_min_score: 95,
  min_watch_percentage: 95,
} as const;

export const CRITICAL_FAILURES = [
  "material_arriv_misrepresentation",
  "invented_pricing",
  "unauthorized_discount",
  "false_guarantee",
  "unauthorized_turnaround_guarantee",
  "invented_service_capability",
  "deceptive_sales_behavior",
  "serious_unprofessional_conduct",
  "critical_customer_data_crm_violation",
  "fundamental_inability_to_explain_estate_media",
] as const;

export const ROLEPLAY_RUBRIC = {
  total_points: 100,
  passing_score: 95,
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
  total_points: 100,
  passing_score: 95,
  categories: [
    { key: "prospect_quality", label: "Prospect Quality", points: 20 },
    { key: "call_preparation", label: "Call Preparation / Personalization", points: 15 },
    { key: "sales_execution", label: "Sales Execution", points: 20 },
    { key: "follow_up_execution", label: "Follow-Up Execution", points: 15 },
    { key: "crm_accuracy", label: "CRM Accuracy / Completeness", points: 15 },
    { key: "judgment_boundaries", label: "Judgment / Sales Boundaries", points: 15 },
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
  monthly_price: 29.99,
  regular_discount_rate: 0.10,
  mls_flat_discount: 5,
  mls_discount_type: "flat",
  plan: "preferred_monthly",
} as const;

export const STAGING_AWARENESS = {
  currently_sellable: false,
  message: "Physical staging is coming to Arriv Estate Media. Staging IQ will support staging operations. Staging is NOT currently authorized for sale. A separate Staging Sales Certification will be required.",
  future_certification: "ARRIV ESTATE MEDIA — STAGING SALES CERTIFICATION",
} as const;

export const OVERTIME_THRESHOLD_HOURS = 40;
export const NORMAL_PAID_WORKWEEK_HOURS = 32;

/**
 * Calculate whether a quiz attempt passes based on score and critical questions.
 */
export function evaluateQuizAttempt(
  score: number,
  allCriticalCorrect: boolean,
  minScore: number = CERTIFICATION_REQUIREMENTS.module_quiz_min_score,
): { passed: boolean; reason: string } {
  if (!allCriticalCorrect) {
    return { passed: false, reason: "Critical question(s) incorrect — all critical questions must be answered correctly." };
  }
  if (score < minScore) {
    return { passed: false, reason: `Score ${score}% below minimum ${minScore}%.` };
  }
  return { passed: true, reason: "Passed." };
}

/**
 * Evaluate roleplay or practicum score with critical failure override.
 */
export function evaluateScoredAssessment(
  score: number,
  criticalFailures: string[],
  minScore: number,
): { passed: boolean; reason: string } {
  if (criticalFailures.length > 0) {
    return { passed: false, reason: `Critical failure(s): ${criticalFailures.join(", ")}. Remediation required.` };
  }
  if (score < minScore) {
    return { passed: false, reason: `Score ${score}/${100} below minimum ${minScore}.` };
  }
  return { passed: true, reason: "Passed." };
}

/**
 * Check all certification requirements and return eligibility.
 */
export function checkCertificationEligibility(cert: {
  modules_passed_count?: number;
  quiz_average_score?: number;
  critical_questions_status?: string;
  final_exam_passed?: boolean;
  final_exam_score?: number;
  roleplay_passed?: boolean;
  roleplay_score?: number;
  practicum_passed?: boolean;
  practicum_score?: number;
  critical_failures?: string[];
  remediation_modules?: string[];
}): { eligible: boolean; missing: string[] } {
  const missing: string[] = [];
  if ((cert.modules_passed_count || 0) < 13) missing.push("All 13 modules passed");
  if ((cert.quiz_average_score || 0) < CERTIFICATION_REQUIREMENTS.module_quiz_min_score) missing.push("Quiz average >= 95%");
  if (cert.critical_questions_status !== "ALL_CORRECT") missing.push("All critical questions correct");
  if (!cert.final_exam_passed) missing.push("Final exam passed");
  if (!cert.roleplay_passed) missing.push("Role-play passed (>= 95/100)");
  if (!cert.practicum_passed) missing.push("Practicum passed (>= 95/100)");
  if ((cert.critical_failures || []).length > 0) missing.push("No unresolved critical failures");
  if ((cert.remediation_modules || []).length > 0) missing.push("No pending remediation modules");
  return { eligible: missing.length === 0, missing };
}