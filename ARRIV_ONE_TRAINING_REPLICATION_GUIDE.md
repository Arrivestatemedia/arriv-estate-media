# Arriv One Training System Replication Guide

## PROMPT TO GIVE TO THE ARRIV ONE BUILDER

> Replicate the Arriv Estate Media training and certification system into Arriv One identically. The system has 4 layers: entities, shared backend logic, backend functions, and frontend components. Copy every file listed below with NO changes to logic, schemas, rubrics, or UI — EXCEPT do NOT copy the module content files (canonicalCurriculum.ts, estateMediaWorkbook.js, modulePracticals.js) or the migrateCanonicalCurriculum function, because Arriv One has its own training modules. The TrainingModule entity schema should still be created (identical schema), but Arriv One will populate it with its own module records. Replace the string "Estate Media" with "Arriv One" in description fields where it appears, but do NOT change any field names, enum values, rubric categories, passing scores, or logic.

---

## 1. ENTITIES TO CREATE (identical schemas)

Create these entities in Arriv One with the EXACT same schemas as Arriv Estate Media. The full JSON schemas are in `base44/entities/` in the Estate Media app. Copy these entity files:

### Copy these entity schema files exactly:
- `base44/entities/SalesCertification.jsonc` — 5-domain certification tracking, calling authorization, readiness checklist, manager interventions, coaching notes
- `base44/entities/TrainingCompletion.jsonc` — module completion records
- `base44/entities/TrainingAttempt.jsonc` — quiz attempt records
- `base44/entities/VideoWatchProgress.jsonc` — video watch tracking
- `base44/entities/TrainingScenario.jsonc` — simulation scenario definitions (admin-only)
- `base44/entities/TrainingSimulationEvent.jsonc` — simulation event logs
- `base44/entities/ProductTruth.jsonc` — knowledge bank
- `base44/entities/AuditEvent.jsonc` — audit logging
- `base44/entities/TrainingModule.jsonc` — module schema (identical, but populate with Arriv One's own modules)

**RLS rules:** Keep identical RLS — sales members read their own certification; admins read/write all.

---

## 2. SHARED BACKEND FILES (copy as-is, no changes)

### `base44/shared/salesTrainingShared.ts`
This is the core certification engine. Copy the ENTIRE file as-is. It contains:
- `TRAINING_STATUS` enum
- `CALLING_AUTH` enum
- `CERTIFICATION_REQUIREMENTS` (all 95% passing scores, 20 modules total)
- `KNOWLEDGE_BANK_VERSION` = "KB-2026.03"
- `MODULE_ID_ALIASES` map
- `resolveModuleId()` function
- `PROSPECT_PREP_EXERCISE` config
- `CRITICAL_FAILURES` list (17 items)
- `CERTIFICATION_DOMAINS` (5 domains)
- `ROLEPLAY_RUBRIC`, `CRM_SYSTEM_RUBRIC`, `ONBOARDING_RUBRIC`, `TEACH_BACK_RUBRIC`
- `BONUS_MILESTONES`, `REFERRAL_CREDIT_AMOUNT`, `PREFERRED_MEMBERSHIP`
- `STAGING_AWARENESS` config
- `evaluateQuizAttempt()`, `evaluateScoredAssessment()`, `computeAuthorizationReadiness()`, `computeDomainStatuses()`, `checkCertificationEligibility()`

**Only change needed:** Replace "Estate Media" with "Arriv One" in description strings inside `PROSPECT_PREP_EXERCISE`, `CRITICAL_FAILURES` ("fundamental_inability_to_explain_estate_media" → keep the key, just update the label), and `STAGING_AWARENESS.message`. Do NOT change any enum values, function signatures, or logic.

### `base44/shared/certificationContract.ts`
Copy as-is. This is the ecosystem-wide certification contract (HMAC auth, canary allowlist, nonce replay protection). Already shared across all Arriv apps.

---

## 3. FRONTEND LIB FILES (copy as-is)

### `src/lib/certificationRubrics.js`
Copy as-is. Frontend mirror of rubrics. Contains:
- `KNOWLEDGE_BANK_VERSION`
- `CERTIFICATION_REQUIREMENTS`
- `CRITICAL_FAILURES` (with labels)
- `ROLEPLAY_RUBRIC`, `CRM_SYSTEM_RUBRIC`, `ONBOARDING_RUBRIC`, `TEACH_BACK_RUBRIC`
- `ALL_RUBRICS` map
- `CERTIFICATION_DOMAINS` (5 domains)
- `getCriticalFailureLabel()` helper

### `src/lib/simulationEngine.js`
Copy as-is. Pure in-memory simulation reducer + validation. Contains:
- `determineTier()`, `calculateSimPricing()` — pricing simulation
- `sanitizeInput()` — PII sanitization
- `simulationReducer()` — 100+ action handlers for all scenario types
- `validateAction()` — action validation with critical failure detection
- `generateSessionId()`, `generateEventId()`

### `src/lib/simulationScenarios.js`
Copy as-is. Contains synthetic data and scenario definitions:
- `SIMULATION_LEVELS` (7 levels: WATCH_IT through PROVE_IT)
- `PRICING_TIERS`, `PACKAGES`, `ADD_ONS`, `PREFERRED_CONFIG`
- `SYNTHETIC_PROSPECTS`, `SYNTHETIC_PROPERTIES`, `SYNTHETIC_CONTACTS`
- All scenario definitions (getScenarioById, etc.)

**Note:** If Arriv One sells a different product, update the pricing tiers, packages, and synthetic data to match Arriv One's product. The simulation engine logic stays the same.

---

## 4. BACKEND FUNCTION (copy as-is)

### `base44/functions/manageCertificationAuthorization/entry.ts`
Copy the ENTIRE file as-is. This is the admin-only API for:
- `get_status` — returns certification, readiness, domains, eligibility, simulation events
- `authorize_calling` — manager grants calling authorization
- `hold_authorization` — manager holds authorization
- `add_coaching_note` — manager adds coaching note
- `assign_remediation` — manager assigns remediation modules
- `lock_calling` / `unlock_calling` — calling access control
- `suspend_certification` / `restore_certification`
- `record_roleplay_score`, `record_system_crm_score`, `record_onboarding_score`, `record_teachback_score`
- `add_critical_failure` / `resolve_critical_failure`

**Imports to verify:** It imports from `../../shared/salesTrainingShared.ts` — ensure that file exists in Arriv One.

---

## 5. FRONTEND COMPONENTS (copy as-is)

### Simulation Components (`src/components/simulation/`)
Copy ALL files in this directory:
- `SimulationContext.jsx` — context provider, session management, event logging
- `SimulationBanner.jsx` — "TRAINING MODE" persistent banner
- `ScenarioRunner.jsx` — scenario execution UI
- `SimUIRenderer.jsx` — maps step types to UI components
- `ManagerReview.jsx` — manager review dashboard
- `ReadinessChecklist.jsx` — authorization readiness display
- `PracticalScoreModal.jsx` — practical scoring modal
- `DomainStatusGrid.jsx` — 5-domain status grid

### Training Components (`src/components/sales/` and `src/components/admin/`)
- `src/components/sales/SalesTrainingContent.jsx` — learner-facing training portal (video + quiz)
- `src/components/admin/TrainingModuleManager.jsx` — admin module management

### Training Pages (`src/pages/`)
- `src/pages/SalesTrainingPortal.jsx` — learner portal page
- `src/pages/SalesTrainingAdmin.jsx` — admin certification dashboard
- `src/pages/TrainingSimulation.jsx` — simulation lab page

---

## 6. FILES TO NOT COPY (Arriv One has its own)

- `base44/shared/canonicalCurriculum.ts` — E0-E19 curriculum definitions (Estate Media specific)
- `src/lib/estateMediaWorkbook.js` — Estate Media workbook content
- `src/lib/modulePracticals.js` — E4-E19 practical exercises
- `base44/functions/migrateCanonicalCurriculum/entry.ts` — migration function
- `base44/functions/recordTrainingModuleScore/entry.ts` — orientation quiz scorer (Arriv One may have its own)
- `base44/functions/getSalesTrainingVideos/entry.ts` — video URL management (Arriv One may have its own)
- `base44/functions/setSalesTrainingVideos/entry.ts` — video URL management

---

## 7. ROUTING & NAVIGATION

Add these routes to Arriv One's `src/App.jsx`:
```
/SalesTrainingPortal → SalesTrainingPortal
/SalesTrainingAdmin → SalesTrainingAdmin
/TrainingSimulation → TrainingSimulation
```

Add nav items to Arriv One's Layout:
- Learner: "Training" → SalesTrainingPortal, "Simulation Lab" → TrainingSimulation
- Admin: "Training Admin" → SalesTrainingAdmin, "Simulation Lab" → TrainingSimulation

---

## 8. CRITICAL ARCHITECTURAL RULES (must preserve)

1. **Fail-Closed Simulation:** Simulation engine NEVER calls real APIs, NEVER touches production entities, NEVER sends real email/SMS/calls. All state is in-memory React state.
2. **Manager Authorization Required:** Automated scores (quizzes, simulations, practicals) do NOT authorize live calling. Only explicit manager action via `manageCertificationAuthorization` upgrades `calling_authorization`.
3. **95% Passing Threshold:** All assessments require 95% to pass. Critical questions require 100%.
4. **5 Certification Domains:** Product Knowledge, System Operation, Sales Execution, Customer Onboarding, Customer Training — all must pass.
5. **Knowledge Bank Versioning:** `KNOWLEDGE_BANK_VERSION` = "KB-2026.03" — bump when quiz questions or rubrics change. Historical completions against older versions remain valid.
6. **Critical Failures Block Certification:** Any unresolved critical failure blocks certification, regardless of scores.
7. **Training Mode Isolation:** Any production side effect from Training Mode is a critical failure (`production_side_effects_from_training_mode`).
8. **RLS:** Sales members can only read their own certification. Admins can read/write all.

---

## SUMMARY CHECKLIST

| Layer | Files | Action |
|-------|-------|--------|
| Entities | 9 entity schemas | Create identical schemas in Arriv One |
| Shared Backend | `salesTrainingShared.ts`, `certificationContract.ts` | Copy as-is (replace "Estate Media" in description strings only) |
| Frontend Lib | `certificationRubrics.js`, `simulationEngine.js`, `simulationScenarios.js` | Copy as-is (adjust synthetic data if product differs) |
| Backend Function | `manageCertificationAuthorization/entry.ts` | Copy as-is |
| Frontend Components | 8 simulation components + 2 training components | Copy as-is |
| Frontend Pages | 3 training pages | Copy as-is |
| Module Content | `canonicalCurriculum.ts`, `estateMediaWorkbook.js`, `modulePracticals.js` | DO NOT COPY — Arriv One has its own |
| Migration | `migrateCanonicalCurriculum` | DO NOT COPY |