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
  { module_id: "mod_01", order: 1, title: "Welcome to Arriv Estate Media", description: "Company overview, mission, marketplace/service model, role of sales, role of media specialists, role of customer accounts.", competency_tags: ["OPENING", "VALUE_CONNECTION"] },
  { module_id: "mod_02", order: 2, title: "What We Sell", description: "Current media-service model: photography, videography, approved combined packages. Combined photo+video jobs require a provider qualified for BOTH. Staging awareness (not currently sellable).", competency_tags: ["VALUE_CONNECTION"] },
  { module_id: "mod_03", order: 3, title: "Current Products, Packages & Pricing", description: "Canonical pricing engine: property address → sqft → tier → package → authoritative price. TIER_1 (up to 2,500 sqft): $100/$275/$475/$675. Add-ons, Preferred pricing, 10,000+ sqft custom.", competency_tags: ["VALUE_CONNECTION", "BOUNDARIES"] },
  { module_id: "mod_04", order: 4, title: "Who We Sell To & Customer Value", description: "Real-estate agents, teams, brokers, builders, repeat listing professionals. Customer pain points and value of professional media.", competency_tags: ["PROSPECTING"] },
  { module_id: "mod_05", order: 5, title: "The Arriv Sales Method", description: "DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP.", competency_tags: ["DISCOVERY"] },
  { module_id: "mod_06", order: 6, title: "Prospecting — Digital + Field", description: "MLS/listing research, Zillow, professional-video research, agent/builder research, field prospecting, CRM documentation.", competency_tags: ["PROSPECTING"] },
  { module_id: "mod_07", order: 7, title: "Cold Calling & First Contact", description: "Permission-based opener, specific listing, genuine observation, media opportunity, value, low-pressure question, discovery, next step.", competency_tags: ["OPENING", "DISCOVERY"] },
  { module_id: "mod_08", order: 8, title: "Discovery & Building the Right Order", description: "Property address, sqft, listing timeline, photo/video needs, combined media, customer priorities, package guidance. Reps must NOT invent pricing or promise specific providers.", competency_tags: ["DISCOVERY"] },
  { module_id: "mod_09", order: 9, title: "Objections, Pricing & Discounts", description: "Handle price, existing photographer, no video need, phone quality, timing, loyalty. Manager-approval discount workflow. No discretionary discounts.", competency_tags: ["OBJECTIONS"] },
  { module_id: "mod_10", order: 10, title: "Follow-Up, Preferred & Referrals", description: "Post-service follow-up within 1 business day, 7-14 day relationship follow-up, referral program ($20 standard / $40 Preferred), Preferred membership ($29.99/month, 10% discount).", competency_tags: ["FOLLOW_UP", "CUSTOMER_EXPERIENCE"] },
  { module_id: "mod_11", order: 11, title: "Arriv One CRM & Customer Conversion", description: "Leads, contacts, ownership, calls, notes, follow-up, pipeline, activity logging, customer conversion workflow (lead → qualified → sale → convert to customer → customer account created → customer can book).", competency_tags: ["CRM"] },
  { module_id: "mod_12", order: 12, title: "Representing Arriv / Operational & Financial Boundaries", description: "What sales may and may not promise. No invented pricing, no unauthorized discounts, no provider payout promises, no unsupported turnaround guarantees. Escalation paths.", competency_tags: ["BOUNDARIES"] },
  { module_id: "mod_13", order: 13, title: "Final Certification", description: "Product knowledge assessment (95%), pricing/package scenarios (95%), prospecting scenarios (95%), sales role-play (95%), CRM practicum (95%), actual calling practicum, final certification.", competency_tags: ["BOUNDARIES", "CUSTOMER_EXPERIENCE"] },
  { module_id: "mod_14", order: 14, title: "Estate Media Sales Compensation & Arriv Payroll", description: "Sales commission = 15% of eligible personally-sold collected revenue. Standard Media Specialist payout = 40% of the post-sales-commission remainder (effective 15% Sales / 34% Provider / 51% Arriv). $100 MLS Walkthrough exception = $15 Sales / $50 fixed Provider / $35 Arriv — MLS does NOT use the standard provider percentage. Normal Preferred percentage discount does NOT apply to $100 MLS. Sales commission and provider payout are separate systems. Approved sales compensation flows to Arriv Payroll. Reps cannot alter provider payouts or unauthorized discounts.", competency_tags: ["BOUNDARIES", "VALUE_CONNECTION"] },
];

// ─── Quiz Question Bank (20 questions) ────────────────────────────────────
export const QUIZ_QUESTION_BANK = [
  { question_id: "Q1", question: "What is Arriv Estate Media primarily selling?", choices: ["Only photographs", "Convenience, reliability, professional listing presentation and reduced coordination", "Social-media management", "Realtor leads"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "We sell convenience, reliability, professional listing presentation, and reduced coordination." },
  { question_id: "Q2", question: "What is the primary prospecting gate for a listing?", choices: ["Whether the home is expensive", "Whether the agent is new", "Whether professional video is already present", "Whether the listing has at least 30 photos"], correct_index: 2, competency: "PROSPECTING", is_critical: true, explanation: "Professional video presence is the primary listing gate." },
  { question_id: "Q3", question: "A Coming Soon listing has no media yet. What should you do?", choices: ["Ignore it until active", "Research the agent/property and treat it as a potentially timely video-first opportunity", "Assume they already hired someone", "Offer a discount immediately"], correct_index: 1, competency: "PROSPECTING", is_critical: false, explanation: "Coming Soon with no media is a timely video-first opportunity." },
  { question_id: "Q4", question: "You see a For Sale sign while intentionally field prospecting. What is the correct workflow?", choices: ["Call the number while driving", "Record public information safely, research property/agent, check professional video, qualify, then contact and log CRM", "Count it as a qualified opportunity immediately", "Photograph the home privately"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Safe capture → research → video check → qualify → contact → CRM." },
  { question_id: "Q5", question: "What is the Arriv sales method?", choices: ["Pitch-Close-Discount-Repeat", "Discover → Research → Professional Video Check → Qualify → Contact → CRM → Follow-Up", "Call-Talk-Sell-Collect", "Research-Promise-Close"], correct_index: 1, competency: "DISCOVERY", is_critical: true, explanation: "DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP." },
  { question_id: "Q6", question: "A prospect already has a photographer. What should the rep do?", choices: ["Tell them to switch", "End the call immediately", "Respect the relationship and explore backup/different-service needs", "Offer a secret discount"], correct_index: 2, competency: "OBJECTIONS", is_critical: false, explanation: "Existing photographer is not an automatic disqualifier — explore backup/different-service needs." },
  { question_id: "Q7", question: "A prospect says, 'I'll book today if you give me $25 off.' What may the rep promise?", choices: ["$25 off", "10% off", "Nothing discretionary; say you will verify what can be approved", "A free add-on"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Reps cannot promise discretionary discounts. Say: 'Let me verify what I can get approved for you.'" },
  { question_id: "Q8", question: "What is the established referral reward?", choices: ["$20 cash to the rep", "$20 toward the referring customer's next service for a standard qualifying referral ($40 if the referrer is an active Preferred member), with credits able to accumulate", "Automatic 20% discount", "Free service after one referral"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Standard referral earns $20; Preferred members earn $40. Credits accumulate and can be cashed out at $260+." },
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
  { question_id: "Q21", question: "When you convert a qualified lead into a customer account in Arriv One, what happens?", choices: ["The customer receives an email with a secure temporary password and login instructions", "You manually create a password and share it over the phone", "The customer is automatically charged", "Nothing happens until the customer calls back"], correct_index: 0, competency: "CRM", is_critical: true, explanation: "Conversion creates a PendingSignup and sends a Brevo onboarding email with a secure temporary password." },
  { question_id: "Q22", question: "Where is the customer's temporary password stored after account creation?", choices: ["In the Contact record notes", "In the CRM activity log", "In the AuditEvent details", "Only in the Brevo onboarding email sent to the customer — never in any CRM field, note, or audit log"], correct_index: 3, competency: "BOUNDARIES", is_critical: true, explanation: "The plaintext password exists only in the email. The database stores only the SHA-256 hash." },
  { question_id: "Q23", question: "A customer says they never received their account activation email. What should you do?", choices: ["Create a new account with a different email", "Tell them their password over the phone", "Use the resend account access email function to send a new temporary password", "Ask them to create their own account from scratch"], correct_index: 2, competency: "CRM", is_critical: true, explanation: "The resend function generates a new password, updates the PendingSignup, and re-sends the Brevo email." },
  { question_id: "Q24", question: "A prospect asks for a 15% discount during a call. What is the correct action?", choices: ["Promise the discount to close the deal, then request approval later", "Say you cannot promise any discount until it is approved, then submit a discount request in Arriv One", "Give them a referral credit instead", "Decline outright and end the conversation"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Reps cannot promise discretionary discounts. Submit a discount request and let the customer know it is pending approval." },
  { question_id: "Q25", question: "Can a rep convert a customer's $20 referral credit balance into a discount on a new order?", choices: ["Yes, referral credits and discounts are interchangeable", "No — referral credits are managed through the Referral Credit Ledger and applied to qualifying orders; discounts require separate manager approval", "Yes, with manager verbal approval", "Only if the customer requests it"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Referral credits and discounts are separate systems. Credits accumulate in the ledger; discounts require approval via DiscountApproval." },
  { question_id: "Q26", question: "What must you verify before converting a lead to a customer in Arriv One?", choices: ["That the lead has agreed to a specific service package", "That the lead's email address is correct and not already an existing customer account", "That the lead has paid upfront", "That the lead has signed a contract"], correct_index: 1, competency: "CRM", is_critical: true, explanation: "The system checks for duplicate emails in PendingSignup and User before creating the account." },
  { question_id: "Q27", question: "What are the current TIER_1 package prices (properties up to 2,500 sq ft)?", choices: ["$50/$150/$250/$350", "$100/$275/$475/$675 (MLS Walkthrough / Photo Essentials / Photo Cinematic / Premium Bundle)", "$200/$400/$600/$800", "Prices are manually set by the rep"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: true, explanation: "TIER_1 (up to 2,500 sqft): MLS Walkthrough $100, Photo Essentials $275, Photo Cinematic $475, Premium Bundle $675. Authoritative pricing comes from the pricing engine based on property sqft." },
  { question_id: "Q28", question: "A job requires BOTH photography AND videography. What must be true about the provider?", choices: ["The system will automatically split the job between a photographer and videographer", "The provider accepting the combined job must be qualified and able to perform BOTH services", "Any photographer can accept any video job", "The rep should promise the client that two specialists will be sent"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Combined photo+video jobs require a provider qualified for BOTH. Sales reps must not promise a fulfillment structure the platform does not support." },
  { question_id: "Q29", question: "How is the authoritative price for a booking determined?", choices: ["The sales rep manually sets the price based on negotiation", "Property address → property sqft → pricing tier → package → authoritative price from the pricing engine", "All properties are the same flat price regardless of size", "The client chooses their own price"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "PROPERTY ADDRESS → PROPERTY/SQFT → PACKAGE → AUTHORITATIVE PRICE. Salespeople must NOT manually invent package prices." },
  { question_id: "Q30", question: "What is the Preferred membership and what discount does it provide?", choices: ["Free membership with 50% off all services", "$29.99/month membership with 10% discount on regular packages and $5 flat discount on MLS Walkthrough", "$100/month with unlimited free services", "Preferred is only for employees"], correct_index: 1, competency: "VALUE_CONNECTION", is_critical: false, explanation: "Preferred membership is $29.99/month, provides 10% discount on regular packages and $5 flat discount on MLS Walkthrough. Preferred members also earn $40 referral rewards instead of $20." },
  { question_id: "Q31", question: "Can a sales rep currently sell physical staging services?", choices: ["Yes, staging is included in all packages", "No, staging is NOT currently authorized for sale. A separate Staging Sales Certification will be required before reps can sell staging", "Yes, but only to Preferred members", "Yes, with manager approval"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Physical staging is coming to Arriv Estate Media but is NOT currently sellable. Reps must not quote or promise staging until a separate Staging Sales Certification is created and they are certified." },
  { question_id: "Q32", question: "What happens when a property is 10,000+ sq ft or doesn't fit standard tiers?", choices: ["The rep manually sets a custom price", "The system requires a CUSTOM_QUOTE — the rep should not invent a price", "The property is automatically charged at TIER_5 prices", "The rep offers a discount to close the deal"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Properties 10,000+ sqft or outside standard tiers require a CUSTOM_QUOTE. Reps must not invent custom prices." },
  { question_id: "Q33", question: "What is the standard sales commission rate on an eligible, personally-sold order?", choices: ["10% of gross revenue", "15% of eligible collected service revenue", "20% of gross revenue", "A flat $50 per order"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Sales commission = 15% of eligible personally-sold collected service revenue." },
  { question_id: "Q34", question: "How is the standard Media Specialist (provider) payout calculated on a non-MLS order?", choices: ["40% of gross revenue", "40% of the post-sales-commission remainder (gross minus 15% sales commission)", "A flat $50 per order", "15% of gross revenue"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Standard provider payout = 40% of the REMAINDER after sales commission is removed. On a $100 standard order: $15 sales → $85 remainder → $34 provider → $51 Arriv." },
  { question_id: "Q35", question: "On a standard $275 Photo Essentials order, what are the effective economics?", choices: ["$41.25 Sales / $93.50 Provider / $140.25 Arriv", "$27.50 Sales / $110 Provider / $137.50 Arriv", "$55 Sales / $110 Provider / $110 Arriv", "$41.25 Sales / $110 Provider / $123.75 Arriv"], correct_index: 0, competency: "BOUNDARIES", is_critical: true, explanation: "$275: Sales 15% = $41.25, remainder $233.75, Provider 40% of remainder = $93.50, Arriv = $140.25. Effective: 15% / 34% / 51%." },
  { question_id: "Q36", question: "How is the $100 MLS Walkthrough payout calculated?", choices: ["Standard 40%-of-remainder formula: $15 Sales / $34 Provider / $51 Arriv", "FIXED exception: $15 Sales / $50 fixed Provider / $35 Arriv", "$10 Sales / $50 Provider / $40 Arriv", "$15 Sales / $40 Provider / $45 Arriv"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "The $100 MLS Walkthrough is a SPECIAL payout exception: $15 Sales (standard 15%) / $50 FIXED Provider / $35 Arriv. The standard 40%-of-remainder provider formula does NOT apply to MLS." },
  { question_id: "Q37", question: "Does the normal Preferred 10% percentage discount apply to the $100 MLS Walkthrough?", choices: ["Yes, Preferred members get 10% off MLS", "No — MLS uses a specific $5 flat Preferred discount, not the 10% percentage", "Preferred members get MLS for free", "Preferred members get $50 off MLS"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "The normal Preferred 10% percentage discount does NOT apply to the $100 MLS Walkthrough. MLS uses a specific $5 flat Preferred discount." },
  { question_id: "Q38", question: "Can a sales rep alter a Media Specialist's provider payout or apply an unauthorized discount?", choices: ["Yes, reps can adjust provider payouts to close deals", "Yes, with manager verbal approval", "No — reps cannot alter provider payouts or apply unauthorized discounts. Provider payouts and discounts are separate systems.", "Only on MLS orders"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Sales commission and provider payout are separate systems. Reps cannot alter provider payouts or apply unauthorized discounts." },
  { question_id: "Q39", question: "Where does approved sales compensation flow after Estate Media calculates and attributes it?", choices: ["Directly to the rep's bank account", "To Arriv Payroll, which pays it in the applicable payroll period/payout", "To Stripe, which pays it instantly", "It stays as a credit on the rep's account"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Estate Media calculates → attributes → approves → Arriv Payroll → applicable payroll period/payout. Arriv Payroll does not independently recalculate the commission." },
  { question_id: "Q40", question: "Does a salesperson earn commission on every future order from a customer they originally acquired?", choices: ["Yes, original acquisition means permanent lifetime ownership of all future orders", "No — commission requires eligible collected revenue on orders actually attributable to the salesperson under existing sales attribution rules", "Yes, for the first 5 years", "Only on MLS orders"], correct_index: 1, competency: "BOUNDARIES", is_critical: true, explanation: "Commission requires eligible collected revenue and proper attribution. Original customer acquisition does not create permanent/lifetime sales ownership of every future order." },
  { question_id: "Q41", question: "After generating a Prospect Brief using the Arriv One research capability, what must the rep do before making the call?", choices: ["Call immediately using the AI-generated opening without checking anything", "VERIFY the brief's research (listing intelligence, professional video status, contact info) against at least one independent source before calling", "Delete the brief and start over from scratch", "Send the brief directly to the prospect"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "The rep must VERIFY research rather than blindly trust AI. Blindly trusting AI output without verification is a critical failure in the Prospect Prep Exercise." },
  { question_id: "Q42", question: "If a Prospect Brief identifies a staging-interest signal, what may the rep do?", choices: ["Quote staging pricing and promise a launch date", "Package staging into the current order", "Document the interest only — physical staging is NOT currently sales authorized. A separate Staging Sales Certification will be required", "Promise specific unfinished staging capabilities to close the deal"], correct_index: 2, competency: "BOUNDARIES", is_critical: true, explanation: "Physical staging is NOT currently sales authorized. Reps may document interest but may NOT quote, sell, promise pricing/launch date, package into orders, or promise specific unfinished staging capabilities. A separate Staging Sales Certification is required." },
  { question_id: "Q43", question: "What is the primary Estate Media prospecting gate checked by the Prospect Brief?", choices: ["Whether the prospect has a large brokerage", "Whether professional video is present on the prospect's listings", "Whether the prospect's listings are expensive", "Whether the prospect uses social media"], correct_index: 1, competency: "PROSPECTING", is_critical: true, explanation: "Professional video presence is the primary Estate Media prospecting gate. If evidence is insufficient, the brief uses UNKNOWN rather than guessing." },
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
  "blindly_trusting_ai_without_verification",
  "selling_unauthorized_staging",
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
  "QUALIFIED_OPPORTUNITY", "ACCOUNT", "CUSTOMER_ACCOUNT", "FIRST_ORDER",
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
export const SALES_METHOD = ["DISCOVER", "RESEARCH", "PROFESSIONAL_VIDEO_CHECK", "QUALIFY", "CONTACT", "CRM", "FOLLOW_UP"];

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
  final_exam_total_questions: 43,
  final_exam_randomized: 35,
  final_exam_critical: 8,
  roleplay_min_score: 95,
  practicum_min_score: 95,
  min_watch_percentage: 95,
  prospect_prep_exercise_required: true,
};

// ─── Prospect Preparation Exercise (Practicum Component) ─────────────────
// Reps must learn to VERIFY research rather than blindly trust AI.
export const PROSPECT_PREP_EXERCISE = {
  title: "Prospect Brief Preparation Exercise",
  description: "A practical prospect-preparation exercise using the Arriv One Prospect Brief capability configured for Estate Media. The rep must VERIFY research rather than blindly trust AI.",
  steps: [
    { step: 1, description: "Find or select an appropriate real prospect (agent, team, brokerage, or builder)." },
    { step: 2, description: "Create or review the Prospect Brief using the Prospect Brief / Call Prep tool." },
    { step: 3, description: "Identify a relevant listing from the brief's listing intelligence." },
    { step: 4, description: "Perform the professional-video check and confirm the status (UNKNOWN is acceptable when evidence is insufficient)." },
    { step: 5, description: "Complete the 'Why Them' section with specific, evidence-based reasoning." },
    { step: 6, description: "Identify the likely opportunity (currently sellable services only — NO physical staging)." },
    { step: 7, description: "Select 3-5 discovery questions from the brief that are most relevant to this prospect." },
    { step: 8, description: "Prepare a personalized opening using actual research from the brief." },
    { step: 9, description: "Make or simulate the call according to Estate Media sales training (permission-based opener, specific listing, genuine observation, media opportunity, value, low-pressure question, discovery, next step)." },
    { step: 10, description: "Record the outcome in Arriv One CRM (result, notes, next action, due date, relevant prospect/listing data)." },
    { step: 11, description: "Schedule or create an appropriate follow-up based on the call outcome." },
  ],
  verification_requirement: "The rep must VERIFY the brief's research (listing intelligence, professional video status, contact info) against at least one independent source before making the call. Blindly trusting AI output without verification is a critical failure.",
  staging_boundary: "If the brief identifies a staging-interest signal, the rep must acknowledge the boundary: physical staging is NOT currently sales authorized. The rep may document interest but may NOT quote, sell, promise pricing, promise launch date, package staging into an order, or promise specific unfinished staging capabilities. A separate Staging Sales Certification will be required before authorization.",
  grading: {
    included_in_practicum: true,
    points_within_practicum: 15,
    failure_conditions: [
      "blindly_trusting_ai_without_verification",
      "recommending_physical_staging_as_sellable",
      "fabricating_listing_data_not_in_brief",
      "skipping_professional_video_check",
      "using_generic_opening_not_based_on_research",
    ],
  },
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
export const REFERRAL_CREDIT_AMOUNT_PREFERRED = 40;
export const REFERRAL_CASH_OUT_MINIMUM = 260;
export const REFERRAL_TRANSACTION_TYPES = ["EARN", "REDEEM", "REVERSAL", "ADMIN_CORRECTION"];

// ─── Preferred Membership ──────────────────────────────────────────────────
export const PREFERRED_MEMBERSHIP = {
  monthly_price: 29.99,
  regular_discount_rate: 0.10,
  mls_flat_discount: 5,
  mls_discount_type: "flat",
  plan: "preferred_monthly",
};

// ─── Staging Awareness (NOT currently sellable) ────────────────────────────
export const STAGING_AWARENESS = {
  currently_sellable: false,
  message: "Physical staging is coming to Arriv Estate Media. Staging IQ will support staging operations. Staging is NOT currently authorized for sale. A separate Staging Sales Certification will be required before a rep becomes authorized to sell staging.",
  future_certification: "ARRIV ESTATE MEDIA — STAGING SALES CERTIFICATION",
};

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