# Training Admin System — Frontend Constants

## `src/lib/salesTrainingData.js`

> Constants used by the admin page and rep portal. For the Training Admin system specifically, you need: `TRAINING_STATUS`, `CALLING_AUTH`, `COMPETENCIES`, `ROLEPLAY_RUBRIC`, `PRACTICUM_RUBRIC`, `CRITICAL_FAILURES`, `CERTIFICATION_REQUIREMENTS`.

```javascript
/**
 * Sales Training & Certification System — Constants, Enums, and Configuration
 * Version 1.2
 */

// ─── Training/Certification Statuses ──────────────────────────────────────
export const TRAINING_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  REMEDIATION_REQUIRED: "REMEDIATION_REQUIRED",
  TRAINING_COMPLETE: "TRAINING_COMPLETE",
  AWAITING_CERTIFICATION: "AWAITING_CERTIFICATION",
  SALES_CERTIFIED: "SALES_CERTIFIED",
  CERTIFICATION_SUSPENDED: "CERTIFICATION_SUSPENDED",
  NOT_CERTIFIED: "NOT_CERTIFIED",
};

// ─── Calling Authorization Levels ──────────────────────────────────────────
export const CALLING_AUTH = {
  CALLING_LOCKED: "CALLING_LOCKED",
  SUPERVISED_CALLING_ONLY: "SUPERVISED_CALLING_ONLY",
  TRAINING_INDEPENDENT_CALLING_AUTHORIZED: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED",
  INDEPENDENT_CALLING_AUTHORIZED: "INDEPENDENT_CALLING_AUTHORIZED",
};

// ─── Competency Tags ──────────────────────────────────────────────────────
export const COMPETENCIES = [
  "VALUE_CONNECTION",
  "PROSPECTING",
  "DISCOVERY",
  "OBJECTIONS",
  "BOUNDARIES",
  "CUSTOMER_EXPERIENCE",
  "CRM",
  "FOLLOW_UP",
  "OPENING",
];

// ─── Roleplay Scorecard ───────────────────────────────────────────────────
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
};

// ─── Independent Practicum Scorecard ──────────────────────────────────────
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
};

// ─── Critical Failures ─────────────────────────────────────────────────────
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
];

// ─── Certification Requirements ───────────────────────────────────────────
export const CERTIFICATION_REQUIREMENTS = {
  module_quiz_min_score: 95,
  critical_questions_required: 100,
  final_exam_min_score: 95,
  final_exam_total_questions: 40,
  final_exam_randomized: 32,
  final_exam_critical: 8,
  roleplay_min_score: 95,
  practicum_min_score: 95,
  min_watch_percentage: 95,
};

// ─── Bonus Milestones ──────────────────────────────────────────────────────
export const BONUS_MILESTONES = [
  { type: "CERTIFICATION_2_WEEK", label: "Successful 2-Week Certification", amount: 50 },
  { type: "DAY_30", label: "30-Day Milestone", amount: 100 },
  { type: "DAY_90", label: "90-Day Milestone", amount: 150 },
  { type: "DAY_180", label: "6-Month Milestone", amount: 200 },
];

// ─── Audit Event Types ────────────────────────────────────────────────────
export const AUDIT_EVENT_TYPES = [
  "VIDEO_STARTED", "VIDEO_COMPLETED", "QUIZ_STARTED", "QUIZ_FAILED", "QUIZ_PASSED",
  "MODULE_UNLOCKED", "ASSIGNMENT_SUBMITTED", "ASSIGNMENT_APPROVED",
  "CALLING_AUTHORIZED_SUPERVISED", "CALLING_AUTHORIZED_TRAINING_INDEPENDENT",
  "FINAL_EXAM_PASSED", "ROLEPLAY_FAILED", "ROLEPLAY_PASSED",
  "PRACTICUM_FAILED", "PRACTICUM_PASSED", "REMEDIATION_ASSIGNED",
  "SALES_CERTIFIED", "CERTIFICATION_SUSPENDED", "CERTIFICATION_RESTORED",
  "DISCOUNT_REQUESTED", "DISCOUNT_APPROVED", "DISCOUNT_DENIED",
  "REFERRAL_CREDIT_EARNED", "REFERRAL_CREDIT_REDEEMED", "REFERRAL_CREDIT_REVERSED",
  "POST_SERVICE_FOLLOWUP_COMPLETED", "CUSTOMER_RECOVERY_CREATED",
  "CUSTOMER_RECOVERY_RESOLVED", "CUSTOMER_RECOVERY_CLOSED_LOOP",
  "BONUS_MILESTONE_EARNED", "BONUS_APPROVED", "BONUS_PAID", "ADMIN_CORRECTION",
];
```

> The full file in the source app also includes KPI formulas, follow-up cadence, cold call framework, work types, training schedule, payroll classification, and other sales-ops constants. Those are not needed for the Training Admin system itself — only the constants above are used by the admin page and portal.