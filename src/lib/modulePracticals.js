/**
 * Module Practicals — E4–E19 practical exercise definitions
 *
 * Maps each E4–E19 training module to its practical exercises using the exact
 * manual chapters. Each module has five practical types:
 *
 * - Follow Me (FOLLOW_IT): guided walkthrough of the workflow
 * - Do It Yourself (DO_IT): practice with minimal guidance
 * - Customer Scenario: customer-facing simulation (discovery → pricing → booking →
 *   project → deliverables → billing → support → follow-up)
 * - Onboarding Practical: onboarding exercise
 * - Teach-Back: explain the process back to demonstrate mastery
 *
 * Core sales flow: DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY →
 *                 CONTACT → CRM → FOLLOW-UP
 *
 * Provider-boundary: shows how provider qualification, job board, accepted
 * assignment, deliverable and payout-status concepts affect the customer
 * experience — without training the rep to perform provider craft or exposing
 * internal payout splits.
 *
 * Onboarding final: "Jordan Smith Realty just became an Estate Media customer."
 * Customer-training final: simulated Jordan books a first listing-media project.
 */

export const PRACTICAL_TYPES = [
  { id: "follow_me", label: "Follow Me", icon: "Eye", description: "Guided walkthrough of the workflow." },
  { id: "do_it_yourself", label: "Do It Yourself", icon: "Hand", description: "Practice with minimal guidance." },
  { id: "customer_scenario", label: "Customer Scenario", icon: "Users", description: "Customer-facing simulation with live-equivalent pricing." },
  { id: "onboarding_practical", label: "Onboarding", icon: "UserPlus", description: "Guide a customer through onboarding." },
  { id: "teach_back", label: "Teach-Back", icon: "GraduationCap", description: "Explain the process back to demonstrate mastery." },
];

export const MODULE_PRACTICALS = {
  E4: {
    module_id: "E4",
    title: "Estate Media System Mastery",
    chapter: "Manual §4.1–4.6: Admin Hub, Sales Dashboard, Booking System, Job Board, Editing Queue, Editor Workspace",
    core_flow: "Navigate the complete customer/sales workflow: packages, bookings, projects, deliverables, invoices, and account views.",
    follow_me: { scenario_id: "e4_system_mastery", label: "Follow Me: Customer Lifecycle Navigation", description: "Follow guided prompts through the complete customer lifecycle: account creation, package navigation, booking, project tracking, deliverables, and invoices." },
    do_it_yourself: { scenario_id: "customer_account", label: "Do It Yourself: Customer Account & Deliverables", description: "Navigate the customer account view, access deliverables, and review membership benefits without guidance." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Full Lifecycle", description: "Guide a fictional customer through discovery, live-equivalent pricing, booking, project status, deliverables, billing, support, and follow-up." },
    onboarding_practical: { description: "Set up a fictional customer for their first project — confirm account access, service/process orientation, and first-booking readiness." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Customer Account Flow", description: "Teach a new customer how to use their EM account: projects, deliverables, and invoices." },
  },
  E5: {
    module_id: "E5",
    title: "Arriv One for Estate Media Sales",
    chapter: "Manual §4.2, §4.19: Sales Dashboard & CRM, Arriv One Sync",
    core_flow: "Use the CRM layer serving EM customers. Customer360 is AO-owned; EM extends vertical data.",
    follow_me: { scenario_id: "crm_pipeline", label: "Follow Me: CRM Pipeline Navigation", description: "Follow guided prompts to navigate the Arriv One CRM pipeline and move a contact through stages." },
    do_it_yourself: { scenario_id: "e6_sales_method_branching", label: "Do It Yourself: Prospect → Customer CRM", description: "Run the EM prospect→customer CRM scenario: research, log activity, advance pipeline, and log follow-up." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: CRM-Driven Lifecycle", description: "Use CRM history to prepare onboarding and guide the customer through the full lifecycle." },
    onboarding_practical: { description: "Use CRM history to prepare onboarding notes for a fictional customer." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Internal Handoff", description: "Teach the internal handoff from prospect to customer using CRM records." },
  },
  E6: {
    module_id: "E6",
    title: "Estate Media Sales Method",
    chapter: "Manual §4.2, §4.15: Sales Dashboard, Field Prospecting",
    core_flow: "DISCOVER → RESEARCH → PROFESSIONAL VIDEO CHECK → QUALIFY → CONTACT → CRM → FOLLOW-UP",
    follow_me: { scenario_id: "prospect_research", label: "Follow Me: Sales Method Walkthrough", description: "Observe the full sales method: discover, research, professional video check, qualify, contact, CRM, follow-up." },
    do_it_yourself: { scenario_id: "e6_sales_method_branching", label: "Do It Yourself: Branching Outreach", description: "Execute the sales method with branching choices at each stage. No faking relationships or misrepresenting purpose." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Method-Driven Discovery", description: "Apply the sales method to guide a customer through discovery, pricing, and booking." },
    onboarding_practical: { description: "Translate discovery findings into a first-service recommendation for onboarding." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Sales Method", description: "Teach the sales method to a simulated peer, explaining each stage in order." },
  },
  E7: {
    module_id: "E7",
    title: "Prospect Research: Digital + Field",
    chapter: "Manual §4.15: Field Prospecting, Prospect Brief",
    core_flow: "Research property/business context before outreach. Field prospecting is required, intentional work.",
    follow_me: { scenario_id: "prospect_research", label: "Follow Me: Prospect Research & Video Gate", description: "Observe how to research a prospect and perform the professional video check before contact." },
    do_it_yourself: { scenario_id: "e6_sales_method_branching", label: "Do It Yourself: Remote + Field Research", description: "Complete a remote + field research scenario: search, research, video check, qualify, and document findings." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Research-Driven Discovery", description: "Use research findings to guide the customer through discovery and pricing." },
    onboarding_practical: { description: "Record onboarding-relevant findings from prospect research." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Documentation Standard", description: "Teach the CRM documentation standard: result, notes, next action, due date, and relevant data." },
  },
  E8: {
    module_id: "E8",
    title: "Cold Calling",
    chapter: "Manual §4.2: Sales Dashboard, Daily Call Queue",
    core_flow: "Permission-based opener. No deceptive service-call framing. Professional video can lead the conversation.",
    follow_me: { scenario_id: "prospect_research", label: "Follow Me: Call Preparation", description: "Observe how to prepare for a cold call: research, video check, and opener practice." },
    do_it_yourself: { scenario_id: "e8_cold_calling_branching", label: "Do It Yourself: Five-Call Branching", description: "Practice five cold calls with branching prospect responses. Use a permission-based opener and move quickly to discovery." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Call-Driven Discovery", description: "Use cold calling to initiate the customer discovery and booking flow." },
    onboarding_practical: { description: "Capture needs from cold-call discovery for onboarding preparation." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Call Flow", description: "Teach the cold call flow: opener, discovery, and honest next-step setting." },
  },
  E9: {
    module_id: "E9",
    title: "Discovery",
    chapter: "Manual §4.3: Booking System, Package Selection",
    core_flow: "Ask about property type, timing, current media process, video use, deliverables, and recurring needs. Do not force a package before understanding need.",
    follow_me: { scenario_id: "discovery", label: "Follow Me: Discovery & Building the Right Order", description: "Observe how to conduct discovery with a synthetic prospect and build the right media order." },
    do_it_yourself: { scenario_id: "pricing_package", label: "Do It Yourself: Pricing & Package Selection", description: "Practice selecting the right package and calculating price based on property sqft using live-equivalent pricing." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Discovery to Booking", description: "Guide a fictional customer through discovery, live-equivalent pricing, and booking." },
    onboarding_practical: { description: "Turn discovery findings into a first-booking plan for onboarding." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Discovery Questions", description: "Teach the customer what information helps booking: property type, timing, media process, video use, deliverables." },
  },
  E10: {
    module_id: "E10",
    title: "Objection Handling",
    chapter: "Manual §4.3, §4.17: Booking System, Discount Approvals",
    core_flow: "No unsupported guarantees. Use service/process truth and manager-approved exceptions only.",
    follow_me: { scenario_id: "first_booking", label: "Follow Me: First Booking with Objection", description: "Observe how to handle a price objection during the first booking and guide the customer to the right package." },
    do_it_yourself: { scenario_id: "e8_cold_calling_branching", label: "Do It Yourself: Objection Gauntlet", description: "Handle price, timing, quality, incumbent provider, and process concerns. No unauthorized discounts." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Objection to Booking", description: "Handle customer objections during the discovery and booking flow." },
    onboarding_practical: { description: "Convert a customer concern into onboarding control: set correct expectations." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Expectation Setting", description: "Teach the customer what to expect: process, pricing, and support." },
  },
  E11: {
    module_id: "E11",
    title: "Follow-Up, Post-Service Care & Referrals",
    chapter: "Manual §4.16: Customer Success, §4.13: Referral Program",
    core_flow: "Satisfaction check within 1 business day, follow-up 7–14 days later. Use current live referral authority.",
    follow_me: { scenario_id: "post_service_followup", label: "Follow Me: Post-Service Follow-Up", description: "Observe how to handle post-service follow-up and ask for a referral after a completed job." },
    do_it_yourself: { scenario_id: "post_service_followup", label: "Do It Yourself: Post-Service with Issue + Referral", description: "Handle a post-service scenario with a service issue and a referral opportunity. Listen → Acknowledge → Document → Escalate → Close the loop." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Satisfaction Check & Follow-Up", description: "Complete the post-service satisfaction check and follow-up phases of the customer lifecycle." },
    onboarding_practical: { description: "Explain the ongoing relationship: support, rebook, and follow-up cadence." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Where to Get Help/Rebook", description: "Teach the customer where to request help and how to rebook." },
  },
  E12: {
    module_id: "E12",
    title: "CRM & Pipeline",
    chapter: "Manual §4.2: Sales Dashboard & CRM",
    core_flow: "CRM accuracy matters as much as activity. Use actual stages and required fields.",
    follow_me: { scenario_id: "crm_pipeline", label: "Follow Me: Pipeline Navigation", description: "Follow guided prompts to navigate the CRM pipeline and move a contact through stages." },
    do_it_yourself: { scenario_id: "crm_pipeline", label: "Do It Yourself: Repair Messy Pipeline", description: "Repair a messy pipeline: fix stale stages, add missing next steps, and ensure every contact has an actionable next step." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Pipeline-Driven Lifecycle", description: "Use CRM pipeline to track the customer through the full lifecycle." },
    onboarding_practical: { description: "Prepare a clean CRM handoff for onboarding: owner, next step, due date." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: CRM Record Standard", description: "Teach the internal CRM record standard: clear owner, specific action, due date." },
  },
  E13: {
    module_id: "E13",
    title: "Representing Arriv / Sales Boundaries",
    chapter: "Manual §4.12, §4.7: Pricing Engine, Commissions & Payroll",
    core_flow: "No staging sale before separate certification. Do not expose internal provider payout details. Do not perform Media Specialist production work unless separately authorized.",
    follow_me: { scenario_id: "e13_boundary_classification", label: "Follow Me: Boundary Classification", description: "Observe how to classify safe and unsafe promises: staging, pricing, discounts, provider details, turnaround." },
    do_it_yourself: { scenario_id: "e13_boundary_classification", label: "Do It Yourself: Classify Safe/Unsafe Promises", description: "Classify promises as safe or unsafe. Inventing pricing, unauthorized discounts, provider payout exposure, and staging promises are critical failures." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Boundary-Safe Booking", description: "Guide the customer through booking while maintaining all sales boundaries." },
    onboarding_practical: { description: "Set correct customer expectations: what we can and cannot promise." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Escalation Path", description: "Teach the escalation path: manager for discounts, turnaround guarantees, and process exceptions." },
  },
  E14: {
    module_id: "E14",
    title: "Customer Booking & Account Experience",
    chapter: "Manual §4.3: Booking System, §4.4: Job Board",
    core_flow: "Booking uses live address/property pricing and supported package rules. Combined photo+video jobs may require one provider qualified for both.",
    follow_me: { scenario_id: "first_booking", label: "Follow Me: First Booking with Package/Address Branch", description: "Observe how to guide a customer through the first booking with package and address branching." },
    do_it_yourself: { scenario_id: "pricing_package", label: "Do It Yourself: Package & Pricing Selection", description: "Practice selecting the right package and calculating price based on property sqft." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Booking to Project", description: "Guide a fictional customer through booking, project status, and deliverables." },
    onboarding_practical: { description: "Guide a fictional customer through their first booking: package, address, date, and pricing." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Account/Project/Deliverable Flow", description: "Teach the customer the account, project, and deliverable flow." },
  },
  E15: {
    module_id: "E15",
    title: "Media Specialist Boundary",
    chapter: "Manual §4.4: Job Board & Media Partner Dashboard, §4.7: Payouts",
    core_flow: "Understand fulfillment enough to explain customer experience. Provider payout details are internal. Do not perform Media Specialist production work unless separately authorized.",
    follow_me: { scenario_id: "media_specialist_boundary", label: "Follow Me: Provider Lifecycle Trace", description: "Observe how to trace a fake job through the provider lifecycle: job board, accepted assignment, deliverable, payout-status." },
    do_it_yourself: { scenario_id: "provider_boundary_customer_impact", label: "Do It Yourself: Provider Boundary & Customer Impact", description: "Show how provider qualification, job board, accepted assignment, deliverable, and payout-status affect the customer experience — without exposing internal payout splits." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Fulfillment Visibility", description: "Explain to the customer what happens after booking: provider assignment, capture, delivery — without internal details." },
    onboarding_practical: { description: "Explain fulfillment to the customer: what to expect, timelines, and notifications." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Fulfillment Without Internal Details", description: "Teach what the customer can expect without exposing internal compensation or provider craft." },
  },
  E16: {
    module_id: "E16",
    title: "Customer Onboarding",
    chapter: "Manual §3.1: New Client Provisioning, §4.3: Booking System",
    core_flow: "Onboarding includes account access, service/process orientation, first-booking readiness, billing/membership where applicable, and support. Use real current system behavior.",
    follow_me: { scenario_id: "customer_onboarding", label: "Follow Me: Customer Onboarding", description: "Observe how to guide a new customer through onboarding after their first booking." },
    do_it_yourself: { scenario_id: "e16_jordan_onboarding", label: "Do It Yourself: Onboard Jordan Smith Realty", description: "Jordan Smith Realty just became an Estate Media customer. Onboard Jordan: account access, service orientation, first-booking prep, billing/membership, and support." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Onboarding to First Booking", description: "Guide a fictional customer through onboarding and their first booking." },
    onboarding_practical: { description: "Onboard Jordan Smith Realty: send welcome, confirm account, offer Preferred, and prepare first booking.", scenario_id: "e16_jordan_onboarding" },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: First-Use Path", description: "Teach the customer the whole first-use path: account, booking, project, deliverables, billing, and support." },
  },
  E17: {
    module_id: "E17",
    title: "Customer Training",
    chapter: "Manual §3.1: Client Booking Flow, §4.3: Booking System",
    core_flow: "Task-based teaching, not feature dumping. Check understanding and let the customer perform the task.",
    follow_me: { scenario_id: "customer_teachback", label: "Follow Me: Teach-Back Demonstration", description: "Observe how to teach a customer: what we sell, how pricing works, and the Media Specialist role." },
    do_it_yourself: { scenario_id: "e17_jordan_customer_training", label: "Do It Yourself: Train Jordan to Book", description: "Train simulated Jordan to successfully book a first listing-media project, find project/deliverables, understand billing/membership, and know where to get help." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Jordan Books a Project", description: "Simulated Jordan books a first listing-media project based on your instruction." },
    onboarding_practical: { description: "Use the fictional Jordan Smith Realty account for customer training." },
    teach_back: { scenario_id: "e17_jordan_customer_training", label: "Teach-Back: Jordan Customer Training", description: "Teach Jordan booking, project status, deliverables, billing/membership, and where to get help." },
  },
  E18: {
    module_id: "E18",
    title: "Operational Mastery",
    chapter: "Manual §4.1–4.20: Complete System Operation",
    core_flow: "Master customer-facing and sales workflows, not backend engineering. Know escalation boundaries.",
    follow_me: { scenario_id: "project_lifecycle", label: "Follow Me: Project Lifecycle Management", description: "Observe how to manage a simulated project from booking through delivery." },
    do_it_yourself: { scenario_id: "project_lifecycle", label: "Do It Yourself: Timed Multi-Step Scenario", description: "Complete a timed multi-step scenario with alternate valid paths. Demonstrate operational mastery without a script." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Full Operational Flow", description: "Operate the complete customer-facing workflow: discovery, pricing, booking, project, deliverables, billing, support, follow-up." },
    onboarding_practical: { description: "Prepare a customer for their first project: account, booking, process, and support." },
    teach_back: { scenario_id: "customer_teachback", label: "Teach-Back: Every Major Step", description: "Explain every major step of the customer lifecycle." },
  },
  E19: {
    module_id: "E19",
    title: "Final Certification",
    chapter: "Manual §1–§9: Complete System",
    core_flow: "Product knowledge, system operation, sales execution, onboarding, and customer training all required.",
    follow_me: { scenario_id: "final_certification", label: "Follow Me: Certification Scenario", description: "Observe the full certification scenario: research, pricing, and boundary certification." },
    do_it_yourself: { scenario_id: "e19_jordan_final_certification", label: "Do It Yourself: Jordan Smith Realty Final", description: "Jordan Smith Realty became an EM customer. Onboard Jordan, prepare first booking, explain process/support. Then train Jordan to book, find deliverables, understand billing, and know where to get help." },
    customer_scenario: { scenario_id: "customer_full_lifecycle", label: "Customer Scenario: Complete Lifecycle", description: "Guide a fictional customer through the complete lifecycle from discovery to follow-up." },
    onboarding_practical: { description: "Complete onboarding for Jordan Smith Realty.", scenario_id: "e16_jordan_onboarding" },
    teach_back: { scenario_id: "e17_jordan_customer_training", label: "Teach-Back: Train Jordan", description: "Train Jordan to book, find deliverables, understand billing, and know where to get help." },
  },
};

export function getPracticalsByModule(moduleId) {
  return MODULE_PRACTICALS[moduleId] || null;
}

export function getModulesWithPracticals() {
  return Object.keys(MODULE_PRACTICALS).sort((a, b) => {
    const na = parseInt(a.replace("E", ""));
    const nb = parseInt(b.replace("E", ""));
    return na - nb;
  });
}

export function getPracticalScenarioIds() {
  const ids = new Set();
  for (const mod of Object.values(MODULE_PRACTICALS)) {
    for (const type of PRACTICAL_TYPES) {
      if (mod[type.id]?.scenario_id) ids.add(mod[type.id].scenario_id);
    }
  }
  return Array.from(ids);
}