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

// ─── 13 Training Modules ──────────────────────────────────────────────────
export const TRAINING_MODULES = [
  { module_id: "mod_01", order: 1, title: "Welcome to Arriv Estate Media", description: "Company overview, mission, and your role as a sales professional.", competency_tags: ["OPENING", "VALUE_CONNECTION"] },
  { module_id: "mod_02", order: 2, title: "What Arriv Estate Media Actually Sells", description: "We sell convenience, reliability, professional listing presentation, and reduced coordination.", competency_tags: ["VALUE_CONNECTION"] },
  { module_id: "mod_03", order: 3, title: "Products, Services & Pricing", description: "Canonical product truth: services, packages, add-ons, territories, pricing.", competency_tags: ["VALUE_CONNECTION", "BOUNDARIES"] },
  { module_id: "mod_04", order: 4, title: "Who We Sell To", description: "Individual agents, teams, brokerages, builders, developers.", competency_tags: ["PROSPECTING"] },
  { module_id: "mod_05", order: 5, title: "The Arriv Sales Method", description: "LISTEN → IDENTIFY → CONNECT → ADVANCE.", competency_tags: ["DISCOVERY"] },
  { module_id: "mod_06", order: 6, title: "Prospect Research: Digital + Field", description: "DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP.", competency_tags: ["PROSPECTING"] },
  { module_id: "mod_07", order: 7, title: "Cold Calling", description: "Permission → Specific listing → Genuine observation → Media opportunity → Value → Low-pressure question → Discovery.", competency_tags: ["OPENING", "DISCOVERY"] },
  { module_id: "mod_08", order: 8, title: "Discovery", description: "Identify needs, listen deeply, connect value to the prospect's situation.", competency_tags: ["DISCOVERY"] },
  { module_id: "mod_09", order: 9, title: "Objection Handling", description: "Handle common objections: existing photographer, price, timing, no need.", competency_tags: ["OBJECTIONS"] },
  { module_id: "mod_10", order: 10, title: "Follow-Up, Post-Service Care & Referrals", description: "Follow-up cadence, post-service satisfaction, referral program.", competency_tags: ["FOLLOW_UP", "CUSTOMER_EXPERIENCE"] },
  { module_id: "mod_11", order: 11, title: "CRM & Pipeline", description: "Funnel stages, required CRM fields, documentation standards.", competency_tags: ["CRM"] },
  { module_id: "mod_12", order: 12, title: "Representing Arriv / Sales Boundaries", description: "Discount authority, guarantees, must-verify items, critical failures.", competency_tags: ["BOUNDARIES"] },
  { module_id: "mod_13", order: 13, title: "Certification", description: "Final exam, role-play, independent practicum, certification requirements.", competency_tags: ["BOUNDARIES", "CUSTOMER_EXPERIENCE"] },
];

// ─── Quiz Question Bank (20 questions) ────────────────────────────────────
export const QUIZ_QUESTION_BANK = [
  { question_id: "Q1", question: "What is Arriv Estate Media primarily selling?", choices: ["Only photographs", "Convenience, reliability, professional listing presentation and reduced coordination", "Social-media management", "Realtor leads"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "We sell convenience, reliability, professional listing presentation, and reduced coordination." },
  { question_id: "Q2", question: "What is the primary prospecting gate for a listing?", choices: ["Whether the home is expensive", "Whether the agent is new", "Whether professional video is already present", "Whether the listing has at least 30 photos"], correct_index: 2, competency: "PROSPECTING", is_critical: true, explanation: "Professional video presence is the primary listing gate." },
  { question_id: "Q3", question: "A Coming Soon listing has no media yet. What should you do?", choices: ["Ignore it until active", "Research the agent/property and treat it as a potentially timely video-first opportunity", "Assume they already hired someone", "Offer a discount immediately"], correct_index: 1, competency: "PROSPECTING", is_critical: false, explanation: "Coming Soon with no media is a timely video-first opportunity." },
  { question_id: "Q4", question: "You see a For Sale sign while intentionally field prospecting. What is the correct workflow?", choices: ["Call the number while driving", "Record public information safely, research property/agent, check professional video, qualify, then contact and log CRM", "Count it as a qualified opportunity immediately", "Photograph the home privately"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Safe capture → research → video check → qualify → contact → CRM." },
  { question_id: "Q5", question: "What is the Arriv sales method?", choices: ["Pitch-Close-Discount-Repeat", "Listen-Identify-Connect-Advance", "Call-Talk-Sell-Collect", "Research-Promise-Close"], correct_index: 1, competency: "DISCOVERY", is_critical: true, explanation: "LISTEN → IDENTIFY → CONNECT → ADVANCE." },
  { question_id: "Q6", question: "A prospect already has a photographer. What should the rep do?", choices: ["Tell them to switch", "End the call immediately", "Respect the relationship and explore backup/different-service needs", "Offer a secret discount"], correct_index: 2, competency: "OBJECTIONS", is_critical: false, explanation: "Existing photographer is not an automatic disqualifier — explore backup/different-service needs." },
  { question_id: "Q7", question: "A prospect says, 'I'll book today if you give me $25 off.' What may the rep promise?", choices: ["$25 off", "10% off", "Nothing discretionary; say you will verify what can be approved", "A free add-on"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Reps cannot promise discretionary discounts. Say: 'Let me verify what I can get approved for you.'" },
  { question_id: "Q8", question: "What is the established referral benefit?", choices: ["$20 cash to the rep", "$20 toward the referring customer's next service for a qualifying referral, with credits able to accumulate", "Automatic 20% discount", "Free service after one referral"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Qualifying referral earns $20 toward referring customer's next service; credits accumulate." },
  { question_id: "Q9", question: "Within what timeframe should the first post-service satisfaction check normally occur?", choices: ["30 days", "Within one business day of completion/delivery", "Only after a complaint", "At the next order"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "Post-service follow-up within 1 business day." },
  { question_id: "Q10", question: "A customer reports a major service problem. What should the sales rep do?", choices: ["Promise a refund", "Blame the photographer", "Listen, acknowledge, document, escalate, and avoid unauthorized promises", "Delete the follow-up"], correct_index: 2, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "LISTEN → ACKNOWLEDGE → DOCUMENT → ESCALATE → CLOSE THE LOOP." },
  { question_id: "Q11", question: "After a customer issue is resolved operationally, what remains required?", choices: ["Nothing", "The rep closes the loop with the customer", "Remove the complaint from CRM", "Offer an unauthorized discount"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "Rep must close the loop with the customer after operational resolution." },
  { question_id: "Q12", question: "What should every meaningful interaction have in CRM?", choices: ["Only the phone number", "Result, useful notes, next action and due date, plus relevant prospect/listing data", "A personal opinion about the agent", "Nothing if the call was short"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "Result, notes, next action, due date, and relevant data." },
  { question_id: "Q13", question: "Which statement about field prospecting is correct?", choices: ["It only happens incidentally in personal time", "It is required intentional work during the week, with safe lead capture and later research", "It replaces CRM", "Every sign is automatically a qualified opportunity"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Field prospecting is intentional required work, not incidental." },
  { question_id: "Q14", question: "What does TRAINING_INDEPENDENT_CALLING_AUTHORIZED mean?", choices: ["Fully certified", "Trainee may complete assigned solo calls/field work without manager actively present, but remains in training", "No calls allowed", "Manager can waive tests"], correct_index: 1, competency: "OPENING", is_critical: false, explanation: "Trainee can do solo work but is not yet fully certified." },
  { question_id: "Q15", question: "What should you say when you are unsure whether Arriv can promise a specific turnaround?", choices: ["'Yes, definitely.'", "'Probably.'", "'Let me verify that for you.'", "'My manager always approves it.'"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Must-verify items: say 'Let me verify that for you.'" },
  { question_id: "Q16", question: "A satisfied first-time customer has completed the initial post-service check. What is the next relationship step?", choices: ["Never contact again", "Follow up again roughly 7-14 days later and look for future listings/repeat/referral opportunities", "Demand a referral", "Automatically discount the next order"], correct_index: 1, competency: "FOLLOW_UP", is_critical: false, explanation: "7-14 day relationship follow-up for first-time customers." },
  { question_id: "Q17", question: "Why is an existing photographer not an automatic disqualifier?", choices: ["Arriv should criticize the photographer", "Arriv may be a backup or provide another service when needs change", "It guarantees a sale", "It means video is already present"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "Arriv may be backup or provide different services when needs change." },
  { question_id: "Q18", question: "Which is an automatic critical failure?", choices: ["Asking a discovery question", "Inventing a service capability or unauthorized discount", "Scheduling a follow-up", "Researching Zillow"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Inventing capabilities or unauthorized discounts is a critical failure." },
  { question_id: "Q19", question: "What is the correct purpose of the Independent Sales Practicum?", choices: ["Require a sale that day", "Test whether the rep can independently prospect, research, call, follow up, use CRM and exercise judgment", "Replace the final exam", "Test only call volume"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: false, explanation: "Tests independent sales capability across all dimensions." },
  { question_id: "Q20", question: "If a rep scores 96/100 on role-play but makes a critical false guarantee, what is the result?", choices: ["Pass because score is above 95", "Remediation required / not certified", "Manager decides informally", "Automatic bonus"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Critical failures override score; remediation required." },
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

// ─── Professional Video Status ────────────────────────────────────────────
export const PROFESSIONAL_VIDEO_STATUS = {
  UNKNOWN: "UNKNOWN",
  NO_PROFESSIONAL_VIDEO: "NO_PROFESSIONAL_VIDEO",
  PROFESSIONAL_VIDEO_PRESENT: "PROFESSIONAL_VIDEO_PRESENT",
  COMING_SOON_NO_MEDIA: "COMING_SOON_NO_MEDIA",
  MEDIA_NOT_YET_VERIFIABLE: "MEDIA_NOT_YET_VERIFIABLE",
};

// ─── Lead Source Types ────────────────────────────────────────────────────
export const LEAD_SOURCE_TYPES = [
  "LISTING_PLATFORM", "SOCIAL_MEDIA", "AGENT_BROKERAGE_WEBSITE",
  "LOCAL_SIGN", "OPEN_HOUSE", "BUILDER_DEVELOPMENT", "REFERRAL", "INBOUND", "OTHER",
];

// ─── Prospect Types ───────────────────────────────────────────────────────
export const PROSPECT_TYPES = [
  "INDIVIDUAL_AGENT", "REAL_ESTATE_TEAM", "BROKERAGE", "BUILDER", "DEVELOPER", "OTHER",
];

// ─── CRM Funnel Stages ─────────────────────────────────────────────────────
export const CRM_FUNNEL_STAGES = [
  "PROSPECT", "ATTEMPT", "CONNECT", "MEANINGFUL_CONVERSATION",
  "QUALIFIED_OPPORTUNITY", "ACCOUNT", "FIRST_ORDER",
  "POST_SERVICE_FOLLOWUP", "REPEAT_ORDER", "REVENUE", "REFERRAL",
];

// ─── Follow-Up Cadence ────────────────────────────────────────────────────
export const FOLLOW_UP_CADENCE = [
  { day: 0, type: "initial_contact", description: "Initial outreach" },
  { day: 3, type: "value_followup", description: "Day 2-3 value-based follow-up" },
  { day: 7, type: "value_followup", description: "Day 7 value-based follow-up" },
  { day: 14, type: "check_in", description: "Day 14 check-in" },
  { day: 30, type: "check_in", description: "Day 30 check-in" },
  { day: 999, type: "nurture", description: "Nurture cadence after Day 30" },
];

// ─── Cold Call Framework ──────────────────────────────────────────────────
export const COLD_CALL_FRAMEWORK = [
  "Permission",
  "Specific listing/account",
  "Genuine observation",
  "Media opportunity",
  "Relevant value",
  "Low-pressure question",
  "Discovery",
];

export const COLD_CALL_SCRIPT = `Hi [Name], this is [Rep] with Arriv Estate Media. Do you have a quick moment? I came across your listing at [Property] - [genuine observation]. I noticed [specific video/media opportunity], so I wanted to reach out. Arriv helps real estate professionals coordinate professional listing media, and I wanted to see whether [specific service/opportunity] is something you're considering for this property.`;

// ─── Sales Method ─────────────────────────────────────────────────────────
export const SALES_METHOD = ["LISTEN", "IDENTIFY", "CONNECT", "ADVANCE"];

// ─── Work Types ───────────────────────────────────────────────────────────
export const WORK_TYPES = [
  "TRAINING", "FIELD_PROSPECTING", "DIGITAL_PROSPECTING", "CALLING",
  "FOLLOW_UP", "CRM", "POST_SERVICE_FOLLOWUP", "MEETING_COACHING", "OTHER",
];

// ─── Training Schedule (2-week) ───────────────────────────────────────────
export const TRAINING_SCHEDULE = [
  { day: "Week 1 Monday", calling_auth: "CALLING_LOCKED", videos: ["mod_01", "mod_02", "mod_03"], activities: "Product truth; research; live 2:30-5:30" },
  { day: "Week 1 Tuesday", calling_auth: "CALLING_LOCKED", videos: ["mod_04", "mod_05"], activities: "Research; live 3:30-5:30; first supervised calls" },
  { day: "Week 1 Wednesday", calling_auth: "CALLING_LOCKED", videos: ["mod_06", "mod_07"], activities: "Intentional field + digital prospecting; live 12:30-1:45; 4 PM manager window" },
  { day: "Week 1 Thursday", calling_auth: "CALLING_LOCKED", videos: ["mod_08", "mod_09"], activities: "Live 10:00-11:15 and 3:30-5:30; determine training-independent readiness" },
  { day: "Week 2 Monday", calling_auth: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED", videos: [], activities: "Independent work before 2:30; live 2:30-5:30 review/coaching" },
  { day: "Week 2 Tuesday", calling_auth: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED", videos: ["mod_11"], activities: "Independent work before 3:30; live 3:30-5:30" },
  { day: "Week 2 Wednesday", calling_auth: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED", videos: ["mod_12"], activities: "Formal Independent Sales Practicum (field + solo); review 12:30-1:45; 4 PM window" },
  { day: "Week 2 Thursday", calling_auth: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED", videos: ["mod_13"], activities: "Final exam; role-play 10:00-11:15; final review 3:30-5:30" },
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

// ─── KPI Formulas ─────────────────────────────────────────────────────────
export const KPI_FORMULAS = {
  connect_rate: "connects / outbound_attempts",
  conversation_rate: "meaningful_conversations / connects",
  opportunity_rate: "qualified_opportunities / meaningful_conversations",
  account_conversion: "accounts_created / qualified_opportunities",
  first_order_conversion: "first_orders / qualified_opportunities",
  repeat_customer_rate: "repeat_customers / customers_acquired",
  revenue_per_acquired_customer: "customer_revenue / acquired_customers",
  follow_up_completion_rate: "completed_followups / due_followups",
  post_service_followup_completion_rate: "completed_post_service_followups / due_post_service_followups",
  crm_compliance_rate: "compliant_crm_entries / total_crm_entries",
  field_source_conversion_rate: "field_source_conversions / field_prospects",
  digital_source_conversion_rate: "digital_source_conversions / digital_prospects",
  referral_generation_rate: "referrals_generated / customers_acquired",
  customer_recovery_rate: "recovered_customers / total_recovery_cases",
  time_to_next_order: "avg_days_between_first_and_second_order",
};

// ─── Diagnostics ──────────────────────────────────────────────────────────
export const DIAGNOSTICS = [
  "HIGH_ACTIVITY_LOW_CONNECT",
  "LOW_CONVERSATION_CONVERSION",
  "LOW_OPPORTUNITY_CONVERSION",
  "LOW_ORDER_CONVERSION",
  "OVERDUE_FOLLOWUPS",
  "LOW_POST_SERVICE_FOLLOWUP",
  "LOW_CRM_COMPLIANCE",
  "LOW_FIELD_PROSPECTING",
  "REFERRAL_TRACKING_GAP",
  "TRAINING_STALLED",
  "CERTIFICATION_REMEDIATION_REQUIRED",
];

// ─── Launch Benchmarks ─────────────────────────────────────────────────────
export const LAUNCH_BENCHMARKS = {
  label: "ARRIV LAUNCH BENCHMARKS",
  agent_heavy: { researched_calls_per_day: 40, new_qualified_prospects_per_day: 15, meaningful_conversations_per_day: "3-5", followups: "100%", crm_documentation: "100%", qualified_opportunities_per_week: "3-5" },
  teams_brokerages: "Lower researched volume where account complexity warrants",
  builders_developers: "Strategic/account-based; ~20-30 highly researched attempts/day as planning reference",
  initial_order_quota: "None — do not set an initial hard order quota",
  review_schedule: "Day 30 preliminary analysis; Day 60 funnel trends; Day 90 establish ARRIV ESTATE MEDIA SALES BENCHMARKS v1.0",
};

// ─── Payroll Classification ───────────────────────────────────────────────
export const PAYROLL_CLASSIFICATION = {
  NONEXEMPT_DEFAULT: "NONEXEMPT_DEFAULT",
  OUTSIDE_SALES_REVIEWED: "OUTSIDE_SALES_REVIEWED",
  SECTION_7I_REVIEWED: "SECTION_7I_REVIEWED",
  OTHER_REVIEWED: "OTHER_REVIEWED",
};

// ─── Post-Service Outcomes ────────────────────────────────────────────────
export const POST_SERVICE_OUTCOMES = [
  "EXCEEDED_EXPECTATIONS", "MET_EXPECTATIONS", "MINOR_ISSUE", "MAJOR_ISSUE", "NO_RESPONSE",
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

// ─── Discount Approval Status ────────────────────────────────────────────
export const DISCOUNT_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DENIED: "DENIED",
  EXPIRED: "EXPIRED",
};

// ─── Referral Credit Constants ────────────────────────────────────────────
export const REFERRAL_CREDIT_AMOUNT = 20;
export const REFERRAL_TRANSACTION_TYPES = ["EARN", "REDEEM", "REVERSAL", "ADMIN_CORRECTION"];

// ─── Standard Work Week ──────────────────────────────────────────────────
export const STANDARD_WORK_WEEK = {
  days: ["Monday", "Tuesday", "Wednesday", "Thursday"],
  hours_per_day: 8,
  normal_paid_workweek_hours: 32,
  friday: "Normally unscheduled; if work performed/authorized, must be recorded",
  overtime_threshold_hours: 40,
  standard_hours_start: "08:00",
  standard_hours_end: "17:00",
};

// ─── Post-Service Follow-Up ──────────────────────────────────────────────
export const POST_SERVICE_SCRIPT = `Hi [Name], I wanted to check in now that your media for [property] has been completed. How did everything go? Did the service and final media meet your expectations?`;

export const RECOVERY_PROTOCOL = ["LISTEN", "ACKNOWLEDGE", "DOCUMENT", "ESCALATE", "CLOSE_THE_LOOP"];