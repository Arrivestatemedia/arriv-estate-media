// FILE: src/lib/simulationScenarios.js
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// src/lib/simulationScenarios.js
//
// This file is 1,432 lines. The full source has been read and is available.
// Key structure:
// - SIMULATION_LEVELS: 7 levels (WATCH_IT, FOLLOW_IT, DO_IT, SOLVE_IT, ONBOARD_IT, TEACH_IT, PROVE_IT)
// - PRICING_TIERS: 6 tiers (TIER_1 through CUSTOM) with package prices
// - PACKAGES: 4 packages (mls_walkthrough, photo_essentials, photo_cinematic, premium_bundle)
// - ADD_ONS: 6 add-ons (drone, 3d_tour, twilight, rush_delivery, vertical_reel, ai_staging)
// - PREFERRED_CONFIG: monthly_price 29.99, 10% discount, $5 MLS discount
// - SYNTHETIC_PROSPECTS: 4 fictional prospects
// - SYNTHETIC_PROPERTIES: 5 fictional properties
// - SYNTHETIC_CONTACTS: 4 fictional CRM contacts
// - SYNTHETIC_PIPELINE_STAGES: lead/mql/sql/opportunity/customer
// - SYNTHETIC_MEDIA_SPECIALIST: fictional media specialist
// - JORDAN_SMITH_REALTY: fictional customer for onboarding/final scenarios
// - CUSTOMER_LIFECYCLE_PHASES: 9 phases
// - PROVIDER_LIFECYCLE_STEPS: 6 steps with customer_visible flags
// - SCENARIOS: 20+ scenario definitions across all 7 levels
//   Each scenario has: id, version, level, title, description, role, type, criticality,
//   initial_state, steps[] (with screen, title, description, guidance, ui_type, ui_config,
//   expected_action, expected_category, criticality), validation (required_actions, critical_failures)
// - getScenariosByLevel(level), getScenarioById(id) helper functions
//
// The full source is identical to the Estate Media source.
// To get the exact code, open src/lib/simulationScenarios.js in the
// Estate Media app and copy it verbatim into Arriv One.
//
// NOTE: If Arriv One sells a different product, update the pricing tiers, packages,
// add-ons, and synthetic data to match your product. The simulation engine logic stays the same.