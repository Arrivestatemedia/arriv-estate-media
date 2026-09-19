# Arriv One Training System Replication Guide

## PROMPT TO GIVE TO THE ARRIV ONE BUILDER

> Replicate the Arriv Estate Media training and certification system into Arriv One identically — including the EXACT visual design, colors, fonts, layout, page structure, and component styling. Follow this guide file-by-file. Copy every entity, shared file, backend function, and frontend component with NO changes to logic, schemas, rubrics, UI, or styling — EXCEPT do NOT copy the module content files (canonicalCurriculum.ts, estateMediaWorkbook.js, modulePracticals.js) or the migrateCanonicalCurriculum function, because Arriv One has its own modules. Create the TrainingModule entity with the identical schema but populate it with Arriv One's own modules. Replace the string "Estate Media" with "Arriv One" in description fields only — do NOT change any field names, enum values, rubric categories, passing scores, colors, or logic.

---

## 1. EXACT PAGE LAYOUTS (replicate the structure identically)

Copy the JSX structure, component arrangement, section order, spacing, and layout of each page exactly as it exists in the Estate Media app. The Arriv One builder must read each source file and reproduce the same layout — same sections in the same order with the same component composition.

### Page: SalesTrainingPortal (`src/pages/SalesTrainingPortal.jsx`)
- Full-height page with padding (`p-4 md:p-8`), max-width `5xl` centered container
- Page header: large bold title "Sales Training Portal" + subtitle below
- Single child component: `<SalesTrainingContent />` which renders 3 views toggled by internal state:

  **View 1 — Module List (default):**
  - Section header: Award icon + "Sales Certification" heading
  - **Certification status card** (dark `#1A1A1A` background): left side shows training status badge + calling authorization label with icon; right side shows 3-column metric grid (Modules passed count, Quiz average %, Final exam ✓/—); if critical failures exist, red-tinted alert bar appears below
  - **Module list**: vertical stack of module cards, each card is a horizontal row: left = status icon (checkmark if passed, play if unlocked, lock if locked), center = module ID label (small) + module title (bold) + badges showing watch % and quiz score, right = "Start"/"Review" button. Locked modules are dimmed (opacity-60). Modules unlock sequentially — must pass previous to access next.

  **View 2 — Video Player:**
  - Back button to return to list
  - Video player with watch progress tracking (tracks unique watched segments, requires 95% watch to unlock quiz)
  - "Continue to Quiz" button appears when watch threshold met

  **View 3 — Quiz Interface:**
  - Back button
  - Question display with multiple choice answers
  - Per-question feedback after submission
  - Score calculation with pass/fail result display
  - "Back to Modules" button after completion

### Page: SalesTrainingAdmin (`src/pages/SalesTrainingAdmin.jsx`)
- Full-height page with padding, max-width `6xl` centered
- Header row: title "Training Admin" + subtitle on left, "Refresh" button on right
- **3-tab navigation** (Tabs component): Dashboard | Modules | Roster

  **Tab 1 — Dashboard:**
  - Stats grid (2 cols mobile, 4 cols desktop): 8 stat cards — Total Reps, Certified, In Progress, Remediation, Awaiting Cert, Calling Locked, Calling Authorized, Roleplay Passed
  - Certification Requirements card: 2-column grid listing all min scores (quiz 95%, critical 100%, final 95%, roleplay 95/100, practicum 95/100, video watch 95%)

  **Tab 2 — Modules:**
  - `<TrainingModuleManager />` component (admin module CRUD)

  **Tab 3 — Roster:**
  - Rep roster table: each row shows rep name/email, training status badge, calling authorization badge, modules passed count, quiz average, roleplay/practicum status
  - Click a rep to expand certification detail: 5-domain status grid (Product Knowledge, System Operation, Sales Execution, Customer Onboarding, Customer Training — each PENDING/PASSED/FAILED), readiness checklist (10 items), practical score modals (roleplay, CRM, onboarding, teachback — each with rubric category breakdown), critical failure management, coaching notes section, authorize/hold/suspend/restore action buttons

### Page: TrainingSimulation (`src/pages/TrainingSimulation.jsx`)
- Wrapped in `<SimulationProvider>`
- Max-width `4xl` centered with padding
- Header: GraduationCap icon + "Training Simulation Lab" title + subtitle
- **View toggle buttons** (3 options): "By Level" | "Module Practicals (E4–E19)" | "Manager Review" (admin only)

  **View: By Level:**
  - Horizontal scrollable level selector (7 level buttons: Watch It, Follow It, Do It, Solve It, Onboard It, Teach It, Prove It)
  - Description box below selector showing selected level's description
  - 2-column grid of scenario cards: each card has title + play icon, description, criticality badge (red/amber/gray) + step count

  **View: Module Practicals:**
  - Horizontal scrollable module selector (E4–E19 buttons)
  - Module info card: module ID + title, chapter label, core flow description
  - 2-column grid of practical type cards (Follow Me, Do It Yourself, Customer Scenario, Onboarding, Teach-Back): each has icon + label, description, and if a scenario exists — criticality badge + step count + level; if no scenario — italic "no simulation scenario" text

  **View: Manager Review:**
  - Back button
  - `<ManagerReview />` component: readiness checklist (10 requirements with pass/fail indicators), domain status grid, simulation event log, practical score entry

  **Active Scenario View (when a scenario is running):**
  - `<SimulationBanner />` at top — persistent "TRAINING MODE" banner on every simulated screen
  - Back to Scenarios button
  - `<ScenarioRunner />` — step-by-step scenario execution with progress indicator, synthetic data UI, action buttons, validation feedback (correct/incorrect/warning/critical failure)

### Component: SimulationBanner (`src/components/simulation/SimulationBanner.jsx`)
- Full-width persistent banner at the top of every simulated screen
- Shows "TRAINING MODE" label + current level + scenario title
- Must be visible at ALL times during simulation — never hidden

### Layout Rules
- All pages use the app's existing Layout wrapper (header + nav)
- Cards use solid backgrounds (white or `#1A1A1A`), never semi-transparent
- Score/status indicators never use green — use amber/gold/orange/red tones
- Icons from lucide-react only

---

## 2. ENTITIES TO CREATE (identical schemas)

Create these entities in Arriv One with the EXACT same schemas. Copy these entity files from `base44/entities/`:

- `SalesCertification.jsonc` — 5-domain certification, calling authorization, readiness checklist, manager interventions, coaching notes
- `TrainingCompletion.jsonc` — module completion records
- `TrainingAttempt.jsonc` — quiz attempt records
- `VideoWatchProgress.jsonc` — video watch tracking
- `TrainingScenario.jsonc` — simulation scenario definitions (admin-only)
- `TrainingSimulationEvent.jsonc` — simulation event logs
- `ProductTruth.jsonc` — knowledge bank
- `AuditEvent.jsonc` — audit logging
- `TrainingModule.jsonc` — module schema (identical; populate with Arriv One's own modules)

**RLS:** Sales members read their own certification; admins read/write all. Keep identical.

---

## 3. SHARED BACKEND FILES (copy as-is)

### `base44/shared/salesTrainingShared.ts`
Core certification engine. Copy ENTIRE file as-is:
- `TRAINING_STATUS`, `CALLING_AUTH` enums
- `CERTIFICATION_REQUIREMENTS` (all 95% passing, 20 modules total)
- `KNOWLEDGE_BANK_VERSION` = "KB-2026.03"
- `MODULE_ID_ALIASES`, `resolveModuleId()`
- `PROSPECT_PREP_EXERCISE`, `CRITICAL_FAILURES` (17 items)
- `CERTIFICATION_DOMAINS` (5 domains)
- `ROLEPLAY_RUBRIC`, `CRM_SYSTEM_RUBRIC`, `ONBOARDING_RUBRIC`, `TEACH_BACK_RUBRIC`
- `BONUS_MILESTONES`, `REFERRAL_CREDIT_AMOUNT`, `PREFERRED_MEMBERSHIP`, `STAGING_AWARENESS`
- `evaluateQuizAttempt()`, `evaluateScoredAssessment()`, `computeAuthorizationReadiness()`, `computeDomainStatuses()`, `checkCertificationEligibility()`

**Only change:** Replace "Estate Media" → "Arriv One" in description strings. Do NOT change enums, function signatures, or logic.

### `base44/shared/certificationContract.ts`
Copy as-is. Ecosystem-wide HMAC certification contract (canary allowlist, nonce replay protection).

---

## 4. FRONTEND LIB FILES (copy as-is)

### `src/lib/certificationRubrics.js`
Copy as-is. Frontend rubric mirror: `CERTIFICATION_REQUIREMENTS`, `CRITICAL_FAILURES` (with labels), all 4 rubrics, `ALL_RUBRICS`, `CERTIFICATION_DOMAINS`, `getCriticalFailureLabel()`.

### `src/lib/simulationEngine.js`
Copy as-is. Pure in-memory reducer + validation: `determineTier()`, `calculateSimPricing()`, `sanitizeInput()`, `simulationReducer()` (100+ actions), `validateAction()`, `generateSessionId()`, `generateEventId()`.

### `src/lib/simulationScenarios.js`
Copy as-is. Synthetic data + scenario definitions: `SIMULATION_LEVELS` (7), `PRICING_TIERS`, `PACKAGES`, `ADD_ONS`, `PREFERRED_CONFIG`, `SYNTHETIC_PROSPECTS/PROPERTIES/CONTACTS`, all scenarios. **If Arriv One sells a different product, update pricing/packages/synthetic data to match — engine logic stays the same.**

---

## 5. BACKEND FUNCTION (copy as-is)

### `base44/functions/manageCertificationAuthorization/entry.ts`
Copy ENTIRE file as-is. Admin-only API: `get_status`, `authorize_calling`, `hold_authorization`, `add_coaching_note`, `assign_remediation`, `lock_calling`/`unlock_calling`, `suspend_certification`/`restore_certification`, `record_roleplay_score`, `record_system_crm_score`, `record_onboarding_score`, `record_teachback_score`, `add_critical_failure`/`resolve_critical_failure`.

**Import:** `../../shared/salesTrainingShared.ts` — ensure that file exists in Arriv One.

---

## 6. FRONTEND COMPONENTS (copy as-is — exact JSX, Tailwind classes, styling)

### Simulation Components (`src/components/simulation/`)
Copy ALL files:
- `SimulationContext.jsx` — context provider, session management, event logging
- `SimulationBanner.jsx` — "TRAINING MODE" persistent banner
- `ScenarioRunner.jsx` — scenario execution UI
- `SimUIRenderer.jsx` — maps step types to UI components
- `ManagerReview.jsx` — manager review dashboard
- `ReadinessChecklist.jsx` — authorization readiness display
- `PracticalScoreModal.jsx` — practical scoring modal
- `DomainStatusGrid.jsx` — 5-domain status grid

### Training Components
- `src/components/sales/SalesTrainingContent.jsx` — learner training portal (video + quiz)
- `src/components/admin/TrainingModuleManager.jsx` — admin module management

### Training Pages
- `src/pages/SalesTrainingPortal.jsx` — learner portal page
- `src/pages/SalesTrainingAdmin.jsx` — admin certification dashboard
- `src/pages/TrainingSimulation.jsx` — simulation lab page

---

## 7. DO NOT COPY (Arriv One has its own)

- `base44/shared/canonicalCurriculum.ts` — E0-E19 curriculum (Estate Media specific)
- `src/lib/estateMediaWorkbook.js` — Estate Media workbook content
- `src/lib/modulePracticals.js` — E4-E19 practical exercises
- `base44/functions/migrateCanonicalCurriculum/entry.ts` — migration function
- `base44/functions/recordTrainingModuleScore/entry.ts` — orientation quiz scorer
- `base44/functions/getSalesTrainingVideos/entry.ts` — video URL management
- `base44/functions/setSalesTrainingVideos/entry.ts` — video URL management

---

## 8. ROUTING & NAVIGATION

Add routes to Arriv One's `src/App.jsx`:
```
/SalesTrainingPortal → SalesTrainingPortal
/SalesTrainingAdmin → SalesTrainingAdmin
/TrainingSimulation → TrainingSimulation
```

Add nav items to Arriv One's Layout:
- Learner: "Training" → SalesTrainingPortal, "Simulation Lab" → TrainingSimulation
- Admin: "Training Admin" → SalesTrainingAdmin, "Simulation Lab" → TrainingSimulation

---

## 9. CRITICAL ARCHITECTURAL RULES (must preserve)

1. **Fail-Closed Simulation:** Engine NEVER calls real APIs, NEVER touches production entities, NEVER sends real email/SMS/calls. All state is in-memory.
2. **Manager Authorization Required:** Automated scores do NOT authorize live calling. Only explicit manager action via `manageCertificationAuthorization` upgrades `calling_authorization`.
3. **95% Passing Threshold:** All assessments require 95%. Critical questions require 100%.
4. **5 Certification Domains:** Product Knowledge, System Operation, Sales Execution, Customer Onboarding, Customer Training — all must pass.
5. **Knowledge Bank Versioning:** `KNOWLEDGE_BANK_VERSION` = "KB-2026.03" — bump when questions/rubrics change.
6. **Critical Failures Block Certification:** Any unresolved critical failure blocks certification regardless of scores.
7. **Training Mode Isolation:** Any production side effect from Training Mode is a critical failure.
8. **RLS:** Sales members read own certification only; admins read/write all.
9. **Solid Dark Cards:** Use `#1A1A1A` solid backgrounds, never glassmorphic/semi-transparent.
10. **No Green Scores:** Score indicators use amber/gold/orange/red only.