# Arriv One — Sales Training System Replication Guide

This guide documents every file in the Estate Media sales training system that needs to be replicated in Arriv One so both apps run the identical training/certification program. Arriv One already has a version of the training system — this guide brings it to exact parity.

**Customer 360 is NOT included** — it already exists in Arriv One.

---

## OVERVIEW: What Makes Up the Training System

The sales training system has 5 layers:

1. **Constants & Config** (`salesTrainingData.js` + `salesTrainingShared.ts`) — statuses, rubrics, module definitions, quiz bank, certification requirements
2. **Entities** (5 entities) — TrainingModule, SalesCertification, TrainingAttempt, VideoWatchProgress, AuditEvent
3. **Admin UI** (`SalesTrainingAdmin.jsx` + `TrainingModuleManager.jsx`) — dashboard, module editor, certification roster, role-play/practicum evaluation
4. **Rep Portal** (`SalesTrainingPortal.jsx` + `SalesTrainingContent.jsx` + `TrainingTab.jsx`) — video watching, quizzes, progress tracking
5. **Backend Functions** (4 functions) — saveTrainingModule, recordTrainingModuleScore, getSalesTrainingVideos, setSalesTrainingVideos

---

## PART 1: Constants & Configuration

### File 1: `src/lib/salesTrainingData.js`

This is the frontend constants file. Copy it **exactly** — every enum, rubric, module definition, quiz question, and certification requirement must match.

**Key exports that must match exactly:**

- `TRAINING_STATUS` — 8 statuses: NOT_STARTED, IN_PROGRESS, REMEDIATION_REQUIRED, TRAINING_COMPLETE, AWAITING_CERTIFICATION, SALES_CERTIFIED, CERTIFICATION_SUSPENDED, NOT_CERTIFIED
- `CALLING_AUTH` — 4 levels: CALLING_LOCKED, SUPERVISED_CALLING_ONLY, TRAINING_INDEPENDENT_CALLING_AUTHORIZED, INDEPENDENT_CALLING_AUTHORIZED
- `COMPETENCIES` — 9 tags: VALUE_CONNECTION, PROSPECTING, DISCOVERY, OBJECTIONS, BOUNDARIES, CUSTOMER_EXPERIENCE, CRM, FOLLOW_UP, OPENING
- `TRAINING_MODULES` — 13 modules (mod_01 through mod_13) with order, title, description, competency_tags
- `QUIZ_QUESTION_BANK` — 26 questions (Q1–Q26) with question_id, question text, 4 choices, correct_index, competency, is_critical flag, explanation
- `ROLEPLAY_RUBRIC` — 7 categories totaling 100 points, passing score 95
- `PRACTICUM_RUBRIC` — 6 categories totaling 100 points, passing score 95
- `CRITICAL_FAILURES` — 10 critical failure types
- `CERTIFICATION_REQUIREMENTS` — module_quiz_min_score: 95, critical_questions_required: 100, final_exam_min_score: 95, roleplay_min_score: 95, practicum_min_score: 95, min_watch_percentage: 95
- `BONUS_MILESTONES` — 4 milestones: CERTIFICATION_2_WEEK ($50), DAY_30 ($100), DAY_90 ($150), DAY_180 ($200)
- `TRAINING_SCHEDULE` — 8-day schedule (Week 1 Mon–Thu + Week 2 Mon–Thu) with calling auth levels and video assignments
- `COLD_CALL_FRAMEWORK` — 7 steps: Permission → Specific listing → Genuine observation → Media opportunity → Value → Low-pressure question → Discovery
- `SALES_METHOD` — LISTEN, IDENTIFY, CONNECT, ADVANCE
- `WORK_TYPES` — 9 types: TRAINING, FIELD_PROSPECTING, DIGITAL_PROSPECTING, CALLING, FOLLOW_UP, CRM, POST_SERVICE_FOLLOWUP, MEETING_COACHING, OTHER
- `AUDIT_EVENT_TYPES` — 33 event types for the audit log
- `STANDARD_WORK_WEEK` — Mon–Thu, 8hrs/day, 32hrs normal paid, 40hr overtime threshold
- `KPI_FORMULAS` — 15 KPI formulas
- `DIAGNOSTICS` — 11 diagnostic flags
- `LAUNCH_BENCHMARKS` — researched calls/day, qualified prospects/day, conversation targets

### File 2: `base44/shared/salesTrainingShared.ts`

This is the backend TypeScript mirror of the frontend constants. It must export the **exact same values** as `salesTrainingData.js`. It also includes three evaluation functions:

- `evaluateQuizAttempt(score, allCriticalCorrect, minScore)` — returns `{ passed, reason }`
- `evaluateScoredAssessment(score, criticalFailures, minScore)` — returns `{ passed, reason }` (critical failures override score)
- `checkCertificationEligibility(cert)` — checks all 8 certification requirements, returns `{ eligible, missing }`

---

## PART 2: Entities

### Entity 1: TrainingModule

```
Fields:
- module_id (string, required) — stable identifier e.g. "mod_01_welcome"
- title (string, required)
- description (string)
- order (integer, default 0) — display sequence 1-13
- video_url (string) — training video URL
- video_duration_seconds (number)
- requires_watching (boolean, default true) — must watch video before quiz
- min_watch_percentage (number, default 95) — minimum watch completion
- quiz_questions (array) — [{ question_id, question, choices[], correct_index, explanation, competency, is_critical }]
- critical_question_indices (array of integers) — indices of critical questions
- passing_score (number, default 95) — minimum % to pass quiz
- prerequisites (array of strings) — module_ids that must be completed first
- has_assignment (boolean, default false)
- assignment_description (string)
- competency_tags (array of strings)
- active (boolean, default true) — published vs draft
- version (integer, default 1)
- updated_at (date-time)

RLS: admin-only (read, create, update, delete)
```

### Entity 2: SalesCertification

```
Fields:
- sales_member_id (string, required) — SalesTeamMember ID
- sales_member_email (string)
- sales_member_name (string)
- training_status (enum: NOT_STARTED, IN_PROGRESS, REMEDIATION_REQUIRED, TRAINING_COMPLETE, AWAITING_CERTIFICATION, SALES_CERTIFIED, CERTIFICATION_SUSPENDED, NOT_CERTIFIED; default NOT_STARTED)
- calling_authorization (enum: CALLING_LOCKED, SUPERVISED_CALLING_ONLY, TRAINING_INDEPENDENT_CALLING_AUTHORIZED, INDEPENDENT_CALLING_AUTHORIZED; default CALLING_LOCKED)
- modules_completed (array of strings) — module_ids completed
- modules_passed_count (integer, default 0)
- modules_total (integer, default 13)
- quiz_average_score (number, default 0)
- critical_questions_status (enum: PENDING, ALL_CORRECT, HAS_FAILURES; default PENDING)
- final_exam_score (number)
- final_exam_passed (boolean, default false)
- final_exam_completed_at (date-time)
- roleplay_score (number)
- roleplay_passed (boolean, default false)
- roleplay_completed_at (date-time)
- roleplay_evaluator (string)
- practicum_score (number)
- practicum_passed (boolean, default false)
- practicum_completed_at (date-time)
- practicum_evaluator (string)
- critical_failures (array of strings) — active critical failures
- remediation_modules (array of strings) — module_ids needing remediation
- certified_at (date-time)
- certified_by (string)
- suspended_at (date-time)
- suspended_reason (string)
- restored_at (date-time)
- product_truth_version (string)
- training_started_at (date-time)
- week1_readiness_approved (boolean, default false)
- week1_readiness_approved_at (date-time)
- week1_readiness_approved_by (string)
```

### Entity 3: TrainingAttempt

```
Fields:
- sales_member_id (string, required)
- sales_member_email (string)
- attempt_type (enum: MODULE_QUIZ, FINAL_EXAM, ROLEPLAY, PRACTICUM; required)
- module_id (string) — for module quizzes
- module_version (integer)
- product_truth_version (string)
- score (number, required) — percentage 0-100
- passed (boolean, default false)
- total_questions (integer)
- correct_answers (integer)
- critical_questions_total (integer)
- critical_questions_correct (integer)
- all_critical_correct (boolean, default false)
- question_set_snapshot (array) — snapshot of questions used
- answer_summary (array) — [{ question_id, selected_index, correct, is_critical, competency }]
- critical_failures_detected (array of strings)
- started_at (date-time)
- completed_at (date-time)
- duration_seconds (integer)
- evaluator (string) — manager who evaluated roleplay/practicum
- roleplay_scores (object) — scorecard breakdown
- practicum_scores (object) — scorecard breakdown
```

### Entity 4: VideoWatchProgress

```
Fields:
- sales_member_id (string, required)
- module_id (string, required)
- video_url (string)
- video_duration_seconds (number)
- watched_seconds (number, default 0) — total unique seconds watched
- completion_percentage (number, default 0) — 0-100
- completed (boolean, default false) — true only when >=95% without seeking to end
- last_position_seconds (number, default 0)
- seeking_detected (boolean, default false) — true if user sought to end without watching
- watch_segments (array) — [{ start, end }] actual watched segments
- started_at (date-time)
- completed_at (date-time)
- last_updated_at (date-time)
```

### Entity 5: AuditEvent

```
Fields:
- event_type (string, required) — one of 33 AUDIT_EVENT_TYPES
- sales_member_id (string)
- sales_member_name (string)
- actor_id (string) — who performed the action
- actor_name (string)
- actor_role (enum: REP, MANAGER, ADMIN, SYSTEM)
- entity_type (string)
- entity_id (string)
- details (object) — event-specific details
- timestamp (date-time, required)

RLS: admin-only (read, create, update, delete)
```

---

## PART 3: Admin UI

### File 3: `src/pages/SalesTrainingAdmin.jsx`

Full admin page with 3 tabs:
- **Dashboard** — stat cards (total reps, certified, in progress, remediation, awaiting, calling locked/authorized, roleplay passed) + certification requirements display
- **Modules** — renders TrainingModuleManager
- **Roster** — list of all SalesCertification records with status badges, module progress, quiz average, roleplay/practicum scores. Click "Manage" to open detail view with:
  - Calling Authorization controls (4 buttons to set auth level)
  - Role-Play Evaluation form (7-category rubric, score calculator, critical failures checkboxes, notes)
  - Practicum Evaluation form (6-category rubric, same pattern)
  - Certification Actions (Certify Rep, Suspend, Restore)
  - Active Critical Failures display

Key behaviors:
- Certifying a rep sets `training_status: SALES_CERTIFIED`, `calling_authorization: INDEPENDENT_CALLING_AUTHORIZED`, creates AuditEvent
- Suspending sets `CERTIFICATION_SUSPENDED`, `CALLING_LOCKED`, records reason in AuditEvent
- Setting calling auth creates an AuditEvent (CALLING_AUTHORIZED_SUPERVISED or CALLING_AUTHORIZED_TRAINING_INDEPENDENT)
- Role-play/practicum evaluation creates a TrainingAttempt record AND updates SalesCertification

### File 4: `src/components/admin/TrainingModuleManager.jsx`

Full module management UI:
- List view: ordered modules with reorder buttons (up/down), edit, duplicate, delete
- Module editor: module_id, title, description, order, video URL, video duration, min watch %, requires_watching toggle, passing score, competency tags (multi-select), assignment toggle + description, publish/draft toggle
- Quiz builder: add/remove questions, each with question text, 2-6 answer choices (radio for correct), competency dropdown, is_critical checkbox, explanation text
- Critical question indices auto-calculated from is_critical flags
- Save creates or updates TrainingModule entity

---

## PART 4: Rep Portal

### File 5: `src/pages/SalesTrainingPortal.jsx`

The rep-facing training page. Key behaviors:
- Loads the rep's SalesCertification record
- Shows training status badge, module progress (X/13), quiz average, calling authorization
- Renders module list in order — each module shows video player, watch progress, quiz
- Video player tracks watch segments (seek detection), updates VideoWatchProgress
- Quiz modal: shows questions, records answers, calculates score, checks critical questions
- On quiz submit: creates TrainingAttempt, updates SalesCertification (modules_completed, modules_passed_count, quiz_average_score, critical_questions_status)
- Final exam, role-play, and practicum sections show when prerequisites met
- Certification status panel shows what's remaining

### File 6: `src/components/sales/SalesTrainingContent.jsx`

The content renderer for individual training modules — video player with watch tracking, quiz interface, results display.

### File 7: `src/components/sales/TrainingTab.jsx`

The tab component that embeds into the main sales workspace (HubSpotActivityLog in Arriv One). Wraps SalesTrainingPortal.

---

## PART 5: Backend Functions

### Function 1: `saveTrainingModule`

Creates or updates a TrainingModule. Recalculates critical_question_indices from is_critical flags. Sets updated_at.

### Function 2: `recordTrainingModuleScore`

Called when a rep completes a quiz. Creates a TrainingAttempt record, evaluates pass/fail (score >= 95% AND all critical correct), updates SalesCertification:
- If passed: add module_id to modules_completed, increment modules_passed_count, recalculate quiz_average_score, update critical_questions_status
- If failed: do not add to completed, but still record attempt
- Creates AuditEvent (QUIZ_PASSED or QUIZ_FAILED)

### Function 3: `getSalesTrainingVideos`

Returns the list of training video URLs configured for the app (stored in AppSetting or similar).

### Function 4: `setSalesTrainingVideos`

Sets the training video URLs (admin-only).

---

## PART 6: Navigation Integration

### In Arriv One's Layout / Nav

The "Training" tab already exists in Arriv One's HubSpotActivityLog. Ensure it renders the `TrainingTab` component which wraps `SalesTrainingPortal`.

### In Arriv One's Admin Nav

Add a "Training Admin" nav item pointing to `SalesTrainingAdmin` page (if not already present).

---

## PART 7: Certification Logic (Critical Rules)

These rules MUST match exactly:

1. **Module quiz pass**: score >= 95% AND all critical questions correct
2. **Critical failure override**: any critical failure → remediation required, regardless of score
3. **Certification requires ALL of**:
   - 13/13 modules passed
   - Quiz average >= 95%
   - All critical questions correct (critical_questions_status = ALL_CORRECT)
   - Final exam passed (score >= 95%)
   - Role-play passed (score >= 95/100)
   - Practicum passed (score >= 95/100)
   - No unresolved critical failures
   - No pending remediation modules
4. **Calling authorization progression**: CALLING_LOCKED → SUPERVISED_CALLING_ONLY → TRAINING_INDEPENDENT_CALLING_AUTHORIZED → INDEPENDENT_CALLING_AUTHORIZED
5. **Week 1 readiness**: can be approved by admin (unlocks TRAINING_INDEPENDENT_CALLING_AUTHORIZED)
6. **Bonus milestones**: earned on certification + day 30/90/180, require admin approval, then marked paid

---

## PART 8: Video Watch Tracking

The video player must track:
- **Watch segments**: array of {start, end} representing actually-watched portions
- **Seek detection**: if user jumps to end without watching, seeking_detected = true, completed = false
- **Completion**: completed = true only when completion_percentage >= 95% AND no seeking detected
- **Unique seconds**: total distinct seconds watched (not counting replays)
- Updates VideoWatchProgress on every 5-second interval during playback

---

## FILE INVENTORY

| # | File | Action |
|---|------|--------|
| 1 | `src/lib/salesTrainingData.js` | CREATE or UPDATE to match exactly |
| 2 | `base44/shared/salesTrainingShared.ts` | CREATE or UPDATE to match exactly |
| 3 | `base44/entities/TrainingModule.jsonc` | CREATE or UPDATE — admin-only RLS |
| 4 | `base44/entities/SalesCertification.jsonc` | CREATE or UPDATE |
| 5 | `base44/entities/TrainingAttempt.jsonc` | CREATE or UPDATE |
| 6 | `base44/entities/VideoWatchProgress.jsonc` | CREATE or UPDATE |
| 7 | `base44/entities/AuditEvent.jsonc` | CREATE or UPDATE — admin-only RLS |
| 8 | `src/pages/SalesTrainingAdmin.jsx` | CREATE or UPDATE |
| 9 | `src/components/admin/TrainingModuleManager.jsx` | CREATE or UPDATE |
| 10 | `src/pages/SalesTrainingPortal.jsx` | CREATE or UPDATE |
| 11 | `src/components/sales/SalesTrainingContent.jsx` | CREATE or UPDATE |
| 12 | `src/components/sales/TrainingTab.jsx` | CREATE or UPDATE |
| 13 | `base44/functions/saveTrainingModule/entry.ts` | CREATE or UPDATE |
| 14 | `base44/functions/recordTrainingModuleScore/entry.ts` | CREATE or UPDATE |
| 15 | `base44/functions/getSalesTrainingVideos/entry.ts` | CREATE or UPDATE |
| 16 | `base44/functions/setSalesTrainingVideos/entry.ts` | CREATE or UPDATE |

---

## TESTING CHECKLIST

1. **Module list**: Admin sees 13 modules in order with edit/reorder/duplicate/delete
2. **Module editor**: Can create a module with video URL, quiz questions, competency tags, critical flags
3. **Rep portal**: Rep sees modules in order, video player, watch progress bar
4. **Video watch**: Watching 95%+ marks complete; seeking to end does NOT mark complete
5. **Quiz**: Rep takes quiz, sees pass/fail, critical question failures block passing
6. **Quiz recording**: TrainingAttempt created, SalesCertification updated
7. **Certification roster**: Admin sees all reps with status, module count, quiz avg, scores
8. **Calling auth**: Admin can set 4 levels, AuditEvent created
9. **Role-play eval**: Admin fills 7-category rubric, score calculated, pass/fail determined, TrainingAttempt + SalesCertification updated
10. **Practicum eval**: Same with 6-category rubric
11. **Certify rep**: Sets SALES_CERTIFIED + INDEPENDENT_CALLING_AUTHORIZED, AuditEvent created
12. **Suspend/Restore**: Changes status, records reason, AuditEvent created
13. **Critical failure**: Checking a critical failure in role-play/practicum → remediation required regardless of score
14. **Bonus milestones**: Appear when eligibility met, admin can approve, then mark paid