/**
 * Certification rubrics, critical failures, and domain definitions.
 * Frontend mirror of base44/shared/salesTrainingShared.ts rubrics.
 * Used by Manager Review dashboard and practical scoring UI.
 */

export const KNOWLEDGE_BANK_VERSION = "KB-2026.03";

export const CERTIFICATION_REQUIREMENTS = {
  module_quiz_min_score: 95,
  critical_questions_required: 100,
  final_exam_min_score: 95,
  roleplay_min_score: 95,
  system_crm_min_score: 95,
  onboarding_min_score: 95,
  teachback_min_score: 95,
  overall_passing_score: 95,
  modules_total: 26,
  manager_authorization_required: true,
};

export const CRITICAL_FAILURES = [
  { key: "material_arriv_misrepresentation", label: "Material Arriv misrepresentation" },
  { key: "invented_pricing", label: "Invented pricing" },
  { key: "quoting_stale_pricing_as_authoritative", label: "Quoting stale/unsupported pricing as authoritative" },
  { key: "unauthorized_discount", label: "Unauthorized discount" },
  { key: "false_guarantee", label: "False guarantee" },
  { key: "unauthorized_turnaround_guarantee", label: "Unauthorized turnaround guarantee" },
  { key: "invented_service_capability", label: "Invented service capability" },
  { key: "deceptive_sales_behavior", label: "Deceptive sales behavior" },
  { key: "deceptive_outreach", label: "Deceptive outreach" },
  { key: "serious_unprofessional_conduct", label: "Serious unprofessional conduct" },
  { key: "critical_customer_data_crm_violation", label: "Critical customer data / CRM violation" },
  { key: "fundamental_inability_to_explain_estate_media", label: "Fundamental inability to explain Estate Media" },
  { key: "blindly_trusting_ai_without_verification", label: "Blindly trusting AI without verification" },
  { key: "selling_unauthorized_staging", label: "Selling physical staging before separate certification" },
  { key: "exposing_internal_provider_payout", label: "Exposing internal provider payout details" },
  { key: "production_side_effects_from_training_mode", label: "Causing production side effects from Training Mode" },
  { key: "bypassing_required_authorization", label: "Bypassing required authorization" },
  // B2B-specific critical failures (E21-E25)
  { key: "b2b_abandon_individual", label: "B2B: Abandoning individual lead to chase B2B" },
  { key: "b2b_invent_pricing", label: "B2B: Inventing pricing" },
  { key: "b2b_invent_credits", label: "B2B: Inventing credit allocations" },
  { key: "b2b_offer_custom_discount", label: "B2B: Offering unauthorized custom discount" },
  { key: "b2b_add_extra_credits", label: "B2B: Adding extra credits without approval" },
  { key: "b2b_alter_contract_terms", label: "B2B: Altering contract terms without approval" },
  { key: "b2b_impersonate_customer_admin", label: "B2B: Impersonating customer admin" },
  { key: "b2b_enter_financial_credentials", label: "B2B: Entering financial credentials on behalf of customer" },
  { key: "b2b_fake_paid_state", label: "B2B: Faking a paid state" },
  { key: "b2b_bypass_hold", label: "B2B: Bypassing account hold" },
  { key: "b2b_invent_custom_plan", label: "B2B: Inventing a custom plan" },
  { key: "b2b_verbal_terms_change", label: "B2B: Verbally agreeing to different terms without amendment" },
  { key: "b2b_claim_residual", label: "B2B: Claiming continuing residual after departure" },
  { key: "b2b_invent_rate", label: "B2B: Inventing a higher commission rate" },
  { key: "b2b_abandon_prospecting", label: "B2B: Abandoning prospecting for B2B-only week" },
];

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

export const CRM_SYSTEM_RUBRIC = {
  total_points: 100,
  passing_score: 95,
  categories: [
    { key: "crm_navigation", label: "CRM Navigation & Data Entry", points: 20 },
    { key: "pipeline_management", label: "Pipeline / Deal Stage Management", points: 15 },
    { key: "activity_logging", label: "Activity Logging Accuracy", points: 15 },
    { key: "booking_flow_execution", label: "Booking Flow Execution", points: 15 },
    { key: "follow_up_scheduling", label: "Follow-Up Scheduling & Cadence", points: 15 },
    { key: "system_boundaries", label: "System Boundary Awareness (no production side effects from training)", points: 20 },
  ],
};

export const ONBOARDING_RUBRIC = {
  total_points: 100,
  passing_score: 95,
  categories: [
    { key: "welcome_communication", label: "Welcome Communication Quality", points: 15 },
    { key: "account_access_setup", label: "Account Access Setup & Verification", points: 20 },
    { key: "service_orientation", label: "Service Orientation (packages, process, SLA)", points: 20 },
    { key: "first_booking_preparation", label: "First Booking Preparation", points: 20 },
    { key: "billing_membership_setup", label: "Billing / Preferred Membership Setup", points: 15 },
    { key: "support_pathway", label: "Support Pathway Communication", points: 10 },
  ],
};

export const TEACH_BACK_RUBRIC = {
  total_points: 100,
  passing_score: 95,
  categories: [
    { key: "accuracy", label: "Accuracy of Information Delivered", points: 25 },
    { key: "clarity", label: "Clarity & Structure of Explanation", points: 20 },
    { key: "booking_guidance", label: "Booking Process Guidance", points: 15 },
    { key: "deliverables_guidance", label: "Deliverables Location & Access Guidance", points: 15 },
    { key: "billing_guidance", label: "Billing & Membership Guidance", points: 15 },
    { key: "support_guidance", label: "Support & Help-Seeking Guidance", points: 10 },
  ],
};

export const B2B_PRACTICAL_RUBRIC = {
  total_points: 100,
  passing_score: 95,
  categories: [
    { key: "b2b_recognition", label: "B2B Signal Recognition", points: 10 },
    { key: "b2b_discovery", label: "B2B Discovery Completeness (decision maker, admin, users, usage, billing, rollout)", points: 15 },
    { key: "b2b_recommendation", label: "Approved Configuration Recommendation (no invented pricing/credits/terms)", points: 15 },
    { key: "b2b_crm_truth", label: "Complete CRM Truth & Documentation", points: 10 },
    { key: "b2b_organization_setup", label: "Organization Structure & Member Setup (canonical B2B model, no second login universe)", points: 15 },
    { key: "b2b_billing_literacy", label: "Billing/Account-Hold Handling (no fabricated payment state, no billing bypass)", points: 10 },
    { key: "b2b_customer_training", label: "Company Admin Training & Teach-Back", points: 10 },
    { key: "b2b_balanced_performance", label: "Balanced Activity Plan (B2B + normal prospecting maintained)", points: 10 },
    { key: "b2b_boundary_compliance", label: "Boundary Compliance (no critical failures)", points: 5 },
  ],
};

export const ALL_RUBRICS = {
  roleplay: { label: "Role-Play", rubric: ROLEPLAY_RUBRIC },
  system_crm: { label: "CRM / System Practical", rubric: CRM_SYSTEM_RUBRIC },
  onboarding: { label: "Customer Onboarding", rubric: ONBOARDING_RUBRIC },
  teachback: { label: "Teach-Back", rubric: TEACH_BACK_RUBRIC },
  b2b_practical: { label: "B2B Practical (E21-E25)", rubric: B2B_PRACTICAL_RUBRIC },
};

export const CERTIFICATION_DOMAINS = [
  { key: "product_knowledge", label: "Product Knowledge", description: "E0–E3, E5, E20: Product truth, pricing authority, package/tier knowledge, provider boundary awareness, compensation/payroll." },
  { key: "system_operation", label: "System Operation", description: "E4: CRM navigation, pipeline, activity logging, booking flow, editing queue awareness." },
  { key: "sales_execution", label: "Sales Execution", description: "E6–E13: Discovery, cold calling, objections, pricing conversations, boundary classification, follow-up." },
  { key: "customer_onboarding", label: "Customer Onboarding", description: "E14, E16: Welcome, account access, service orientation, first-booking prep, billing/membership." },
  { key: "customer_training", label: "Customer Training", description: "E17: Training the customer to book, find deliverables, understand billing, get help." },
  { key: "b2b_organization_sales", label: "B2B Organization Sales", description: "E21–E25: B2B signal recognition, discovery, recommendation, organization model, billing, account hold, onboarding, adoption, expansion, renewal, commission, balanced performance." },
];

export function getCriticalFailureLabel(key) {
  const cf = CRITICAL_FAILURES.find(c => c.key === key);
  return cf ? cf.label : key;
}