/**
 * Canonical E0–E19 TrainingModule definitions — server-side source of truth.
 *
 * Used by backend functions (migration, certification gating, audit) to ensure
 * the active Estate Media curriculum contains exactly 20 canonical modules.
 *
 * Frontend mirror: src/lib/estateMediaWorkbook.js (WORKBOOK_MODULES).
 * These two must be kept in sync when curriculum content changes.
 *
 * Historical preservation: reps who completed mod_01–mod_14 under the old
 * curriculum receive credit toward the corresponding E-module via
 * MODULE_ID_ALIASES (see salesTrainingShared.ts).
 */

export interface CanonicalQuizQuestion {
  question_id: string;
  question: string;
  choices: string[];
  correct_index: number;
  competency: string;
  is_critical: boolean;
  explanation: string;
}

export interface CanonicalModule {
  module_id: string;
  order: number;
  title: string;
  description: string;
  module_type: string;
  certification_phase: string;
  competency_tags: string[];
  prerequisites: string[];
  is_critical_boundary: boolean;
  quiz_questions: CanonicalQuizQuestion[];
}

export const CANONICAL_MODULES: CanonicalModule[] = [
  {
    module_id: "E0", order: 0, title: "Welcome & Certification",
    description: "Understand the role, standards and safety boundaries.",
    module_type: "sales_training", certification_phase: "KNOW_IT",
    competency_tags: ["OPENING", "BOUNDARIES"], prerequisites: [],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E0_Q1", question: "What score is required for critical boundary questions?", choices: ["80%", "90%", "100%", "75%"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Critical boundary questions require 100% — all must be answered correctly." },
      { question_id: "E0_Q2", question: "Can Training Simulation Mode create real production records?", choices: ["Yes, it creates real bookings", "No — Training Mode never creates real clients, bookings, jobs, invoices, payouts, messages or production CRM records", "Only on weekends", "Only with manager approval"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Training Mode never touches production data." },
      { question_id: "E0_Q3", question: "What is the certification progression order?", choices: ["SELL → KNOW → OPERATE → ONBOARD → TEACH → SUPPORT", "KNOW IT → OPERATE IT → SELL IT → ONBOARD IT → TEACH IT → SUPPORT THE RELATIONSHIP", "TEACH → SELL → KNOW → OPERATE", "OPERATE → SELL → TEACH → KNOW"], correct_index: 1, competency: "OPENING", is_critical: false, explanation: "KNOW IT → OPERATE IT → SELL IT → ONBOARD IT → TEACH IT → SUPPORT THE RELATIONSHIP." },
      { question_id: "E0_Q4", question: "What is required before a rep is fully certified?", choices: ["Passing the quiz only", "Human (manager) authorization in addition to passing assessments", "A certain number of calls", "Paying a fee"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Human authorization is required — assessments alone do not certify." },
    ],
  },
  {
    module_id: "E1", order: 1, title: "What Estate Media Sells",
    description: "Understand the service network and customer value.",
    module_type: "sales_training", certification_phase: "KNOW_IT",
    competency_tags: ["VALUE_CONNECTION"], prerequisites: ["E0"],
    is_critical_boundary: true,
    quiz_questions: [
      { question_id: "E1_Q1", question: "What is Arriv Estate Media primarily selling?", choices: ["Only photographs", "Convenience, reliability, professional listing presentation and reduced coordination", "Social-media management", "Realtor leads"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "We sell convenience, reliability, professional listing presentation, and reduced coordination." },
      { question_id: "E1_Q2", question: "What is the primary prospecting gate for a listing?", choices: ["Whether the home is expensive", "Whether the agent is new", "Whether professional video is already present", "Whether the listing has at least 30 photos"], correct_index: 2, competency: "PROSPECTING", is_critical: true, explanation: "Professional video presence is the primary listing gate." },
      { question_id: "E1_Q3", question: "Can a sales rep currently sell physical staging services?", choices: ["Yes, staging is included in all packages", "No — staging is NOT currently authorized for sale. A separate Staging Sales Certification will be required", "Yes, but only to Preferred members", "Yes, with manager approval"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Physical staging is NOT currently sellable. Future awareness only until separate certification." },
      { question_id: "E1_Q4", question: "Why is an existing photographer not an automatic disqualifier?", choices: ["Arriv should criticize the photographer", "Arriv may be a backup or provide another service when needs change", "It guarantees a sale", "It means video is already present"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "Arriv may be backup or provide different services when needs change." },
    ],
  },
  {
    module_id: "E2", order: 2, title: "Products, Services & Pricing",
    description: "Quote only live, persisted pricing.",
    module_type: "sales_training", certification_phase: "KNOW_IT",
    competency_tags: ["VALUE_CONNECTION", "BOUNDARIES"], prerequisites: ["E1"],
    is_critical_boundary: true,
    quiz_questions: [
      { question_id: "E2_Q1", question: "What are the current V1 TIER_1 package prices (properties up to 2,500 sq ft)?", choices: ["$50/$150/$250/$350", "$100/$275/$475/$675 (MLS Walkthrough / Photo Essentials / Photo Cinematic / Premium Bundle)", "$200/$400/$600/$800", "Prices are manually set by the rep"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: true, explanation: "TIER_1 (up to 2,500 sqft): MLS Walkthrough $100, Photo Essentials $275, Photo Cinematic $475, Premium Bundle $675." },
      { question_id: "E2_Q2", question: "How is the authoritative price for a booking determined?", choices: ["The sales rep manually sets the price based on negotiation", "Property address → property sqft → pricing tier → package → authoritative price from the pricing engine", "All properties are the same flat price regardless of size", "The client chooses their own price"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "PROPERTY ADDRESS → PROPERTY/SQFT → PACKAGE → AUTHORITATIVE PRICE." },
      { question_id: "E2_Q3", question: "Can a sales rep override persisted pricing?", choices: ["Yes, to close a deal", "Yes, with manager verbal approval", "No — reps must quote only live, persisted pricing from the pricing engine", "Only for Preferred members"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Reps must quote only live, persisted pricing. They cannot override it." },
      { question_id: "E2_Q4", question: "What happens when a property is 10,000+ sq ft or doesn't fit standard tiers?", choices: ["The rep manually sets a custom price", "The system requires a CUSTOM_QUOTE — the rep should not invent a price", "The property is automatically charged at the highest tier", "The rep offers a discount to close the deal"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Properties 10,000+ sqft require a CUSTOM_QUOTE. Reps must not invent custom prices." },
      { question_id: "E2_Q5", question: "What is the Preferred membership and what discount does it provide?", choices: ["Free membership with 50% off all services", "$29.99/month membership with 10% discount on regular packages and $5 flat discount on MLS Walkthrough", "$100/month with unlimited free services", "Preferred is only for employees"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "Preferred membership is $29.99/month, provides 10% discount on regular packages and $5 flat discount on MLS Walkthrough." },
    ],
  },
  {
    module_id: "E3", order: 3, title: "Who We Sell To",
    description: "Identify real-estate customers and useful prospect context.",
    module_type: "sales_training", certification_phase: "KNOW_IT",
    competency_tags: ["PROSPECTING"], prerequisites: ["E2"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E3_Q1", question: "A Coming Soon listing has no media yet. What should you do?", choices: ["Ignore it until active", "Research the agent/property and treat it as a potentially timely video-first opportunity", "Assume they already hired someone", "Offer a discount immediately"], correct_index: 1, competency: "PROSPECTING", is_critical: false, explanation: "Coming Soon with no media is a timely video-first opportunity." },
      { question_id: "E3_Q2", question: "You see a For Sale sign while intentionally field prospecting. What is the correct workflow?", choices: ["Call the number while driving", "Record public information safely, research property/agent, check professional video, qualify, then contact and log CRM", "Count it as a qualified opportunity immediately", "Photograph the home privately"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Safe capture → research → video check → qualify → contact → CRM." },
      { question_id: "E3_Q3", question: "Which statement about field prospecting is correct?", choices: ["It only happens incidentally in personal time", "It is required intentional work during the week, with safe lead capture and later research", "It replaces CRM", "Every sign is automatically a qualified opportunity"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Field prospecting is intentional required work, not incidental." },
      { question_id: "E3_Q4", question: "What evidence makes a prospect useful?", choices: ["They have a phone number", "Active/recent listings, listing activity, professional video status, and fit with EM services", "They are related to a celebrity", "They have a social media account"], correct_index: 1, competency: "PROSPECTING", is_critical: false, explanation: "Useful prospects have listing activity, professional video status, and fit with EM services." },
    ],
  },
  {
    module_id: "E4", order: 4, title: "Estate Media System Mastery",
    description: "Operate the customer/sales workflow deeply.",
    module_type: "system_mastery", certification_phase: "OPERATE_IT",
    competency_tags: ["CRM", "CUSTOMER_EXPERIENCE"], prerequisites: ["E3"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E4_Q1", question: "When you convert a qualified lead into a customer account, what happens?", choices: ["The customer receives an email with a secure temporary password and login instructions", "You manually create a password and share it over the phone", "The customer is automatically charged", "Nothing happens until the customer calls back"], correct_index: 0, competency: "CRM", is_critical: true, explanation: "Conversion creates a PendingSignup and sends an onboarding email with a secure temporary password." },
      { question_id: "E4_Q2", question: "Where is the customer's temporary password stored after account creation?", choices: ["In the Contact record notes", "In the CRM activity log", "In the AuditEvent details", "Only in the onboarding email sent to the customer — never in any CRM field, note, or audit log"], correct_index: 3, competency: "BOUNDARIES", is_critical: true, explanation: "The plaintext password exists only in the email. The database stores only the hash." },
      { question_id: "E4_Q3", question: "Can one person hold multiple EM roles (e.g., customer and Media Specialist)?", choices: ["No, each person can only have one role", "Yes — one Person may have customer and Media Specialist profiles; role choice can be separate", "Only admins can have multiple roles", "Only with special permission"], correct_index: 1, competency: "CRM", is_critical: false, explanation: "One Person may hold customer and Media Specialist profiles; role choice can be separate." },
      { question_id: "E4_Q4", question: "Do sales reps recruit Media Specialists through AO prospecting?", choices: ["Yes, that's the primary recruiting channel", "No — AO in EM is for customers/prospects and sales reps serving them, not recruiting Media Specialists", "Only senior reps can", "Only during hiring campaigns"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "AO prospecting targets customers/prospects, not Media Specialist recruiting." },
    ],
  },
  {
    module_id: "E5", order: 5, title: "Arriv One for Estate Media Sales",
    description: "Use the sales/CRM layer serving EM customers.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["CRM"], prerequisites: ["E4"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E5_Q1", question: "Who owns Customer360 intelligence?", choices: ["Estate Media", "Arriv One — Customer360 is AO-owned intelligence; EM extends vertical data", "The individual sales rep", "The media partner"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "Customer360 is AO-owned intelligence; EM extends vertical data." },
      { question_id: "E5_Q2", question: "Should AO prospecting in EM target Media Specialists?", choices: ["Yes, always", "No — AO in EM is for customers/prospects and sales reps serving them, not recruiting Media Specialists", "Only during hiring season", "Only if the rep is also a media partner"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "AO prospecting is for customers/prospects, not Media Specialist recruiting." },
      { question_id: "E5_Q3", question: "What should every meaningful interaction have in CRM?", choices: ["Only the phone number", "Result, useful notes, next action and due date, plus relevant prospect/listing data", "A personal opinion about the agent", "Nothing if the call was short"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "Result, notes, next action, due date, and relevant data." },
    ],
  },
  {
    module_id: "E6", order: 6, title: "Estate Media Sales Method",
    description: "Use disciplined research, video check, qualification and follow-up.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["DISCOVERY"], prerequisites: ["E5"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E6_Q1", question: "What is the Arriv Estate Media sales method?", choices: ["Pitch-Close-Discount-Repeat", "DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP", "Call-Talk-Sell-Collect", "Research-Promise-Close"], correct_index: 1, competency: "DISCOVERY", is_critical: true, explanation: "DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP." },
      { question_id: "E6_Q2", question: "What comes before contact in the sales method?", choices: ["Nothing — contact first", "Discover, Research, Professional Video Check, and Qualify", "CRM logging", "Follow-up"], correct_index: 1, competency: "DISCOVERY", is_critical: true, explanation: "Discover → Research → Professional Video Check → Qualify must all happen before Contact." },
      { question_id: "E6_Q3", question: "What is checked before qualification?", choices: ["The prospect's budget", "Professional video presence on the prospect's listings", "The rep's schedule", "The weather"], correct_index: 1, competency: "PROSPECTING", is_critical: false, explanation: "Professional video check happens before qualification." },
    ],
  },
  {
    module_id: "E7", order: 7, title: "Prospect Research: Digital + Field",
    description: "Research professionally across remote and local channels.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["PROSPECTING"], prerequisites: ["E6"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E7_Q1", question: "After generating a Prospect Brief using AI research, what must the rep do before making the call?", choices: ["Call immediately using the AI-generated opening without checking anything", "VERIFY the brief's research against at least one independent source before calling", "Delete the brief and start over from scratch", "Send the brief directly to the prospect"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "The rep must VERIFY research rather than blindly trust AI." },
      { question_id: "E7_Q2", question: "What belongs in CRM for every meaningful interaction?", choices: ["Only the phone number", "Result, useful notes, next action and due date, plus relevant prospect/listing data", "A personal opinion about the agent", "Nothing if the call was short"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "Result, notes, next action, due date, and relevant data." },
      { question_id: "E7_Q3", question: "What is the primary Estate Media prospecting gate checked by the Prospect Brief?", choices: ["Whether the prospect has a large brokerage", "Whether professional video is present on the prospect's listings", "Whether the prospect's listings are expensive", "Whether the prospect uses social media"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Professional video presence is the primary Estate Media prospecting gate." },
    ],
  },
  {
    module_id: "E8", order: 8, title: "Cold Calling",
    description: "Use a clear, honest opener and move quickly to discovery.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["OPENING", "DISCOVERY"], prerequisites: ["E7"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E8_Q1", question: "What makes the cold call opener honest?", choices: ["Claiming to be from the MLS", "Permission-based, identifying yourself and Arriv Estate Media clearly, with no deceptive service-call framing", "Pretending to be a previous customer", "Claiming the listing is about to expire"], correct_index: 1, competency: "OPENING", is_critical: true, explanation: "Permission-based opener with clear identification. No deceptive framing." },
      { question_id: "E8_Q2", question: "A prospect says, 'I'll book today if you give me $25 off.' What may the rep promise?", choices: ["$25 off", "10% off", "Nothing discretionary; say you will verify what can be approved", "A free add-on"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Reps cannot promise discretionary discounts." },
      { question_id: "E8_Q3", question: "What should you say when you are unsure whether Arriv can promise a specific turnaround?", choices: ["'Yes, definitely.'", "'Probably.'", "'Let me verify that for you.'", "'My manager always approves it.'"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Must-verify items: say 'Let me verify that for you.'" },
    ],
  },
  {
    module_id: "E9", order: 9, title: "Discovery",
    description: "Understand listing-media needs before quoting.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["DISCOVERY"], prerequisites: ["E8"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E9_Q1", question: "A prospect already has a photographer. What should the rep do?", choices: ["Tell them to switch", "End the call immediately", "Respect the relationship and explore backup/different-service needs", "Offer a secret discount"], correct_index: 2, competency: "OBJECTIONS", is_critical: false, explanation: "Existing photographer is not an automatic disqualifier — explore backup/different-service needs." },
      { question_id: "E9_Q2", question: "A job requires BOTH photography AND videography. What must be true about the provider?", choices: ["The system will automatically split the job", "The provider accepting the combined job must be qualified and able to perform BOTH services", "Any photographer can accept any video job", "The rep should promise two specialists will be sent"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Combined photo+video jobs require a provider qualified for BOTH." },
      { question_id: "E9_Q3", question: "What should be known before recommending a package?", choices: ["Nothing — just recommend the most expensive package", "Property type, timing, current media process, video use, deliverables and recurring needs", "The prospect's budget only", "The prospect's favorite color scheme"], correct_index: 1, competency: "DISCOVERY", is_critical: false, explanation: "Do not force a package before understanding need." },
    ],
  },
  {
    module_id: "E10", order: 10, title: "Objection Handling",
    description: "Handle price, timing, quality, incumbent provider and process concerns accurately.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["OBJECTIONS", "BOUNDARIES"], prerequisites: ["E9"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E10_Q1", question: "A prospect asks for a 15% discount during a call. What is the correct action?", choices: ["Promise the discount to close the deal, then request approval later", "Say you cannot promise any discount until it is approved, then submit a discount request", "Give them a referral credit instead", "Decline outright and end the conversation"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Reps cannot promise discretionary discounts. Submit a discount request." },
      { question_id: "E10_Q2", question: "Can a rep convert a customer's referral credit balance into a discount on a new order?", choices: ["Yes, referral credits and discounts are interchangeable", "No — referral credits are managed through the Referral Credit Ledger; discounts require separate manager approval", "Yes, with manager verbal approval", "Only if the customer requests it"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Referral credits and discounts are separate systems." },
      { question_id: "E10_Q3", question: "When is manager approval required?", choices: ["Never", "Any discount, turnaround guarantee, or exception to standard process", "Only for refunds", "Only for new customers"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Manager approval is required for discounts, turnaround guarantees, and process exceptions." },
    ],
  },
  {
    module_id: "E11", order: 11, title: "Follow-Up, Post-Service Care & Referrals",
    description: "Stay involved after the shoot without inventing rewards.",
    module_type: "sales_training", certification_phase: "SUPPORT_RELATIONSHIP",
    competency_tags: ["FOLLOW_UP", "CUSTOMER_EXPERIENCE"], prerequisites: ["E10"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E11_Q1", question: "Within what timeframe should the first post-service satisfaction check normally occur?", choices: ["30 days", "Within one business day of completion/delivery", "Only after a complaint", "At the next order"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "Post-service follow-up within 1 business day." },
      { question_id: "E11_Q2", question: "A customer reports a major service problem. What should the sales rep do?", choices: ["Promise a refund", "Blame the photographer", "Listen, acknowledge, document, escalate, and avoid unauthorized promises", "Delete the follow-up"], correct_index: 2, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "LISTEN → ACKNOWLEDGE → DOCUMENT → ESCALATE → CLOSE THE LOOP." },
      { question_id: "E11_Q3", question: "After a customer issue is resolved operationally, what remains required?", choices: ["Nothing", "The rep closes the loop with the customer", "Remove the complaint from CRM", "Offer an unauthorized discount"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "Rep must close the loop with the customer after operational resolution." },
      { question_id: "E11_Q4", question: "Can you promise a specific referral reward amount to a customer?", choices: ["Yes, always promise $20", "No — use current live referral authority; do not teach or promise stale/unverified amounts", "Yes, promise whatever closes the deal", "Only promise cash"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Use current live referral authority. Do not teach or promise stale amounts." },
      { question_id: "E11_Q5", question: "If a Prospect Brief identifies a staging-interest signal, what may the rep do?", choices: ["Quote staging pricing and promise a launch date", "Package staging into the current order", "Document the interest only — physical staging is NOT currently sales authorized", "Promise specific unfinished staging capabilities"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Physical staging is NOT currently sales authorized. Document interest only." },
    ],
  },
  {
    module_id: "E12", order: 12, title: "CRM & Pipeline",
    description: "Keep every prospect/customer next step visible.",
    module_type: "sales_training", certification_phase: "OPERATE_IT",
    competency_tags: ["CRM"], prerequisites: ["E11"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E12_Q1", question: "What makes a next step actionable in CRM?", choices: ["It has a vague description", "It has a clear owner, specific action, and due date", "It has no deadline", "It is marked 'someday'"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "A next step is actionable when it has a clear owner, specific action, and due date." },
      { question_id: "E12_Q2", question: "What is more important — activity volume or CRM accuracy?", choices: ["Activity volume is all that matters", "CRM accuracy matters as much as activity", "CRM is optional", "Neither matters"], correct_index: 1, competency: "CRM", is_critical: false, explanation: "CRM accuracy matters as much as activity." },
    ],
  },
  {
    module_id: "E13", order: 13, title: "Representing Arriv / Sales Boundaries",
    description: "Know what you may promise, quote and operate.",
    module_type: "sales_training", certification_phase: "SELL_IT",
    competency_tags: ["BOUNDARIES"], prerequisites: ["E12"],
    is_critical_boundary: true,
    quiz_questions: [
      { question_id: "E13_Q1", question: "Which is an automatic critical failure?", choices: ["Asking a discovery question", "Inventing a service capability or unauthorized discount", "Scheduling a follow-up", "Researching Zillow"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Inventing capabilities or unauthorized discounts is a critical failure." },
      { question_id: "E13_Q2", question: "Can you quote future staging date or pricing to a customer?", choices: ["Yes, to generate interest", "No — staging is NOT currently authorized for sale. A separate Staging Sales Certification is required", "Only to Preferred members", "Only with manager verbal approval"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "No staging quotes until separate certification." },
      { question_id: "E13_Q3", question: "Should a customer see internal provider payout split details?", choices: ["Yes, for transparency", "No — provider payout details are internal. Do not expose them to customers", "Only if the customer asks", "Only for MLS orders"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Provider payout details are internal." },
      { question_id: "E13_Q4", question: "Can a sales rep alter a Media Specialist's provider payout?", choices: ["Yes, to close deals", "Yes, with manager verbal approval", "No — reps cannot alter provider payouts or apply unauthorized discounts", "Only on MLS orders"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Sales commission and provider payout are separate systems." },
      { question_id: "E13_Q5", question: "Are sales compensation amounts final and fixed?", choices: ["Yes, they never change", "No — sales compensation amounts remain subject to current live authority; do not teach an unconfirmed percentage as final", "Only for the first year", "Only for MLS orders"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Sales compensation amounts remain subject to current live authority." },
    ],
  },
  {
    module_id: "E14", order: 14, title: "Customer Booking & Account Experience",
    description: "Understand the customer's first booking and ongoing account.",
    module_type: "customer_onboarding", certification_phase: "ONBOARD_IT",
    competency_tags: ["CUSTOMER_EXPERIENCE", "CRM"], prerequisites: ["E13"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E14_Q1", question: "Can Training Mode create a real booking?", choices: ["Yes, it creates real bookings", "No — Training Mode never creates real bookings, jobs, or production records", "Only with admin approval", "Only for test customers"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Training Mode never creates real bookings or production records." },
      { question_id: "E14_Q2", question: "What determines provider eligibility for a job?", choices: ["The rep's preference", "The provider's verified capabilities and coverage area", "The client's preference", "The property price"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: false, explanation: "Provider eligibility is determined by verified capabilities and coverage area." },
      { question_id: "E14_Q3", question: "What does the customer see in their account?", choices: ["Only their invoice", "Projects, deliverables, and invoices according to the implemented product", "Nothing — the account is empty", "Only the rep's contact info"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: false, explanation: "Customer sees projects/deliverables/invoices according to implemented product." },
    ],
  },
  {
    module_id: "E15", order: 15, title: "Media Specialist Boundary",
    description: "Understand fulfillment without turning sales reps into providers.",
    module_type: "sales_training", certification_phase: "KNOW_IT",
    competency_tags: ["BOUNDARIES"], prerequisites: ["E14"],
    is_critical_boundary: true,
    quiz_questions: [
      { question_id: "E15_Q1", question: "Does sales recruit Media Specialists through AO prospecting?", choices: ["Yes, that's the primary channel", "No — AO prospecting is for customers/prospects, not recruiting Media Specialists", "Only senior reps", "Only during hiring campaigns"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "AO prospecting targets customers/prospects, not Media Specialist recruiting." },
      { question_id: "E15_Q2", question: "What is considered internal and should not be shared with customers?", choices: ["The customer's project status", "Provider payout details and internal compensation splits", "The package price", "The delivery timeline"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Provider payout details are internal." },
      { question_id: "E15_Q3", question: "Should a sales rep perform Media Specialist production work?", choices: ["Yes, whenever needed", "No — not unless separately authorized", "Only for MLS orders", "Only for friends"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Do not perform Media Specialist production work unless separately authorized." },
    ],
  },
  {
    module_id: "E16", order: 16, title: "Customer Onboarding",
    description: "Turn a sale into a customer ready to book.",
    module_type: "customer_onboarding", certification_phase: "ONBOARD_IT",
    competency_tags: ["CUSTOMER_EXPERIENCE", "CRM"], prerequisites: ["E15"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E16_Q1", question: "A customer says they never received their account activation email. What should you do?", choices: ["Create a new account with a different email", "Tell them their password over the phone", "Use the resend account access email function to send a new temporary password", "Ask them to create their own account from scratch"], correct_index: 2, competency: "CRM", is_critical: true, explanation: "The resend function generates a new password and re-sends the email." },
      { question_id: "E16_Q2", question: "What must a customer know before their first project?", choices: ["Nothing — they'll figure it out", "Account access, service/process orientation, first-booking readiness, billing/membership where applicable, and support", "Only the price", "Only the rep's phone number"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "Onboarding includes account access, service/process orientation, first-booking readiness, billing/membership, and support." },
      { question_id: "E16_Q3", question: "What must you verify before converting a lead to a customer?", choices: ["That the lead has agreed to a specific service package", "That the lead's email address is correct and not already an existing customer account", "That the lead has paid upfront", "That the lead has signed a contract"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "The system checks for duplicate emails before creating the account." },
    ],
  },
  {
    module_id: "E17", order: 17, title: "Customer Training",
    description: "Prove you can teach the customer to use EM.",
    module_type: "customer_training", certification_phase: "TEACH_IT",
    competency_tags: ["CUSTOMER_EXPERIENCE"], prerequisites: ["E16"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E17_Q1", question: "How do you verify a customer understands a task?", choices: ["Ask if they understand and take yes for an answer", "Have the customer perform the task themselves while you observe", "Give them a manual to read", "Assume they understand if they don't ask questions"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: true, explanation: "Check understanding by having the customer perform the task." },
      { question_id: "E17_Q2", question: "What is the correct approach to customer training?", choices: ["Feature dump — show every feature available", "Task-based teaching focused on what the customer needs to do", "Let the customer explore on their own", "Show a PowerPoint presentation"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: false, explanation: "Task-based teaching, not feature dumping." },
    ],
  },
  {
    module_id: "E18", order: 18, title: "Operational Mastery",
    description: "Operate the complete sales/customer workflow without a script.",
    module_type: "operational_mastery", certification_phase: "OPERATE_IT",
    competency_tags: ["CRM", "CUSTOMER_EXPERIENCE", "BOUNDARIES"], prerequisites: ["E17"],
    is_critical_boundary: false,
    quiz_questions: [
      { question_id: "E18_Q1", question: "When should you escalate?", choices: ["Never — handle everything yourself", "When something is outside your authority or boundaries (discounts, turnaround guarantees, production issues, customer complaints)", "Only when the customer asks for a manager", "Only at the end of the day"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Escalate when something is outside your authority or boundaries." },
      { question_id: "E18_Q2", question: "What does operational mastery require?", choices: ["Knowing backend engineering", "Operating the complete customer-facing and sales workflow without a script, knowing escalation boundaries", "Memorizing every feature", "Managing the database"], correct_index: 1, competency: "CRM", is_critical: false, explanation: "Master customer-facing and sales workflows, not backend engineering." },
    ],
  },
  {
    module_id: "E19", order: 19, title: "Final Certification",
    description: "Prove the complete Estate Media job.",
    module_type: "sales_training", certification_phase: "SUPPORT_RELATIONSHIP",
    competency_tags: ["BOUNDARIES", "CUSTOMER_EXPERIENCE"], prerequisites: ["E18"],
    is_critical_boundary: true,
    quiz_questions: [
      { question_id: "E19_Q1", question: "What is the correct purpose of the Independent Sales Practicum?", choices: ["Require a sale that day", "Test whether the rep can independently prospect, research, call, follow up, use CRM and exercise judgment", "Replace the final exam", "Test only call volume"], correct_index: 1, competency: "CUSTOMER_EXPERIENCE", is_critical: false, explanation: "Tests independent sales capability across all dimensions." },
      { question_id: "E19_Q2", question: "If a rep scores 96/100 on role-play but makes a critical false guarantee, what is the result?", choices: ["Pass because score is above 95", "Remediation required / not certified", "Manager decides informally", "Automatic bonus"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Critical failures override score; remediation required." },
      { question_id: "E19_Q3", question: "What is required for final certification?", choices: ["95% overall, 100% critical, 95/100 practicals, and explicit manager authorization", "Just passing the quiz", "A certain number of calls", "Paying a certification fee"], correct_index: 0, competency: "BOUNDARIES", is_critical: true, explanation: "95% overall, 100% critical, 95/100 practicals, manager authorization." },
      { question_id: "E19_Q4", question: "Identify one critical boundary and one escalation path.", choices: ["Boundary: inventing pricing. Escalation: manager for discounts/exceptions", "Boundary: asking discovery questions. Escalation: never", "Boundary: using CRM. Escalation: the customer", "Boundary: researching Zillow. Escalation: the photographer"], correct_index: 0, competency: "BOUNDARIES", is_critical: true, explanation: "Inventing pricing is a critical boundary. Escalate to manager for discounts/exceptions." },
    ],
  },
];

export const CANONICAL_MODULE_IDS = CANONICAL_MODULES.map(m => m.module_id);

export function isCanonicalModuleId(moduleId: string | undefined | null): boolean {
  if (!moduleId) return false;
  return CANONICAL_MODULE_IDS.includes(moduleId);
}