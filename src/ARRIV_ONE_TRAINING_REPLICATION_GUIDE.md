# Arriv One Training System Replication Guide

## PROMPT TO GIVE TO THE ARRIV ONE BUILDER

> Replicate the Arriv Estate Media training and certification system into Arriv One identically — including the EXACT visual design, colors, fonts, layout, page structure, and component styling. Follow this guide file-by-file. Copy every entity, shared file, backend function, and frontend component with NO changes to logic, schemas, rubrics, UI, or styling — EXCEPT do NOT copy the module content files (canonicalCurriculum.ts, estateMediaWorkbook.js, modulePracticals.js) or the migrateCanonicalCurriculum function, because Arriv One has its own modules. Create the TrainingModule entity with the identical schema but populate it with Arriv One's own modules. Replace the string "Estate Media" with "Arriv One" in description fields only — do NOT change any field names, enum values, rubric categories, passing scores, colors, or logic.

---

## 1. EXACT VISUAL DESIGN (replicate identically — same look, same pages)

The training system's look must be IDENTICAL in Arriv One — same colors, fonts, layout, spacing, component styling, and page structure down to the pixel.

### Design Tokens
- Page background: Cream `#FFFBF5` (light mode), `#0A0A0A` (dark mode)
- Card backgrounds: `#FFFFFF` (light), `#1A1A1A` (dark) — SOLID, never glassmorphic/semi-transparent
- Accent / primary active: Gold `#B8956A`
- Accent hover: `#A68559` (light), `#C9A87B` (dark)
- Text: `#1A1A1A` (light), `#FFFBF5` (dark)
- Border: `rgba(184, 149, 106, 0.2)` (light), `rgba(184, 149, 106, 0.3)` (dark)
- Headings: Serif font (Georgia / serif stack)
- Body: Sans font (Inter)
- Border radius: `0.5rem` default, `rounded-2xl` for cards

### Layout & Structure
- Header: Sticky, `#1A1A1A` background, gold border-bottom, Arriv logo left, nav center, user info right
- Nav items: Gold `#B8956A` active with `#1A1A1A` text; inactive `#FFFBF5/70` with hover `bg-[#FFFBF5]/10`
- Cards: `rounded-2xl border border-[#B8956A]/30 bg-white`, hover lifts border to full gold + `bg-[#B8956A]/5`
- Buttons: Gold `#B8956A` primary with `#1A1A1A` text; ghost variant for secondary
- Badges: `bg-[#B8956A]/15 text-[#B8956A]`
- TRAINING MODE banner: Persistent, full-width, amber/gold tone, on every simulated screen
- Score indicators: NEVER green — amber/gold/orange/red only

### Pages (exact layout — copy JSX structure, Tailwind classes, and spacing)
1. **SalesTrainingPortal** — Learner portal: certification status card at top (status + calling authorization + metrics + critical failures), module list with progress bars and unlock gating, video player with watch tracking, quiz interface with per-question feedback
2. **SalesTrainingAdmin** — Admin dashboard: stats row (counts), rep roster table with progress/scores/statuses, expandable certification detail with 5-domain grid, practical score modals (roleplay, CRM, onboarding, teachback), critical failure management, coaching notes
3. **TrainingSimulation** — Simulation lab: level selector (7 levels), scenario runner with step progress bar, TRAINING MODE banner, synthetic data UI, manager review panel with readiness checklist

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