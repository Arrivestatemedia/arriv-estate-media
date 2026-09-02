# Training Admin System — Entities

## `base44/entities/TrainingModule.jsonc`

```jsonc
{
  "name": "TrainingModule",
  "type": "object",
  "properties": {
    "module_id": { "type": "string", "description": "Stable module identifier (e.g. 'mod_01_welcome')" },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "order": { "type": "integer", "default": 0, "description": "Display/sequence order" },
    "video_url": { "type": "string", "description": "URL of the training video for this module" },
    "video_duration_seconds": { "type": "number", "description": "Duration of the training video" },
    "requires_watching": { "type": "boolean", "default": true, "description": "Whether video watch completion is required before quiz" },
    "min_watch_percentage": { "type": "number", "default": 95, "description": "Minimum watch completion percentage required" },
    "quiz_questions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "question_id": { "type": "string" },
          "question": { "type": "string" },
          "choices": { "type": "array", "items": { "type": "string" } },
          "correct_index": { "type": "integer" },
          "explanation": { "type": "string" },
          "competency": { "type": "string", "description": "Competency tag" },
          "is_critical": { "type": "boolean", "default": false }
        }
      },
      "description": "Per-module quiz questions with competency and critical flags"
    },
    "critical_question_indices": {
      "type": "array",
      "items": { "type": "integer" },
      "description": "Indices of critical questions that must be answered correctly"
    },
    "passing_score": { "type": "number", "default": 95, "description": "Minimum percentage to pass" },
    "prerequisites": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Module IDs that must be completed before this module"
    },
    "has_assignment": { "type": "boolean", "default": false, "description": "Whether this module has a required assignment" },
    "assignment_description": { "type": "string", "description": "Description of the required assignment" },
    "competency_tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Competencies covered by this module"
    },
    "active": { "type": "boolean", "default": true },
    "version": { "type": "integer", "default": 1 },
    "updated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["module_id", "title"],
  "rls": {
    "read": { "user_condition": { "role": "admin" } },
    "create": { "user_condition": { "role": "admin" } },
    "update": { "user_condition": { "role": "admin" } },
    "delete": { "user_condition": { "role": "admin" } }
  }
}
```

> **RLS note:** The `rls` block above restricts TrainingModule to admins only. The rep-facing portal (`SalesTrainingContent.jsx`) reads modules directly via `base44.entities.TrainingModule.list()`. To allow reps to read, either remove the `rls` block (default = any authenticated user can read) or change `read` to allow all authenticated users. Keep `create`/`update`/`delete` admin-only.

---

## `base44/entities/SalesCertification.jsonc`

```jsonc
{
  "name": "SalesCertification",
  "type": "object",
  "properties": {
    "sales_member_id": { "type": "string", "description": "SalesTeamMember ID" },
    "sales_member_email": { "type": "string" },
    "sales_member_name": { "type": "string" },
    "training_status": {
      "type": "string",
      "enum": ["NOT_STARTED","IN_PROGRESS","REMEDIATION_REQUIRED","TRAINING_COMPLETE","AWAITING_CERTIFICATION","SALES_CERTIFIED","CERTIFICATION_SUSPENDED","NOT_CERTIFIED"],
      "default": "NOT_STARTED",
      "description": "Current training/certification status"
    },
    "calling_authorization": {
      "type": "string",
      "enum": ["CALLING_LOCKED","SUPERVISED_CALLING_ONLY","TRAINING_INDEPENDENT_CALLING_AUTHORIZED","INDEPENDENT_CALLING_AUTHORIZED"],
      "default": "CALLING_LOCKED",
      "description": "Calling authorization level"
    },
    "modules_completed": { "type": "array", "items": { "type": "string" }, "description": "Module IDs completed (watch + quiz passed)" },
    "modules_passed_count": { "type": "integer", "default": 0 },
    "modules_total": { "type": "integer", "default": 13 },
    "quiz_average_score": { "type": "number", "default": 0 },
    "critical_questions_status": {
      "type": "string",
      "enum": ["PENDING","ALL_CORRECT","HAS_FAILURES"],
      "default": "PENDING"
    },
    "final_exam_score": { "type": "number" },
    "final_exam_passed": { "type": "boolean", "default": false },
    "final_exam_completed_at": { "type": "string", "format": "date-time" },
    "roleplay_score": { "type": "number" },
    "roleplay_passed": { "type": "boolean", "default": false },
    "roleplay_completed_at": { "type": "string", "format": "date-time" },
    "roleplay_evaluator": { "type": "string" },
    "practicum_score": { "type": "number" },
    "practicum_passed": { "type": "boolean", "default": false },
    "practicum_completed_at": { "type": "string", "format": "date-time" },
    "practicum_evaluator": { "type": "string" },
    "critical_failures": { "type": "array", "items": { "type": "string" }, "description": "List of active critical failures" },
    "remediation_modules": { "type": "array", "items": { "type": "string" }, "description": "Module IDs requiring remediation" },
    "certified_at": { "type": "string", "format": "date-time" },
    "certified_by": { "type": "string" },
    "suspended_at": { "type": "string", "format": "date-time" },
    "suspended_reason": { "type": "string" },
    "restored_at": { "type": "string", "format": "date-time" },
    "product_truth_version": { "type": "string" },
    "training_started_at": { "type": "string", "format": "date-time" },
    "week1_readiness_approved": { "type": "boolean", "default": false },
    "week1_readiness_approved_at": { "type": "string", "format": "date-time" },
    "week1_readiness_approved_by": { "type": "string" }
  },
  "required": ["sales_member_id"]
}
```

---

## `base44/entities/TrainingAttempt.jsonc`

```jsonc
{
  "name": "TrainingAttempt",
  "type": "object",
  "properties": {
    "sales_member_id": { "type": "string", "description": "SalesTeamMember ID" },
    "sales_member_email": { "type": "string" },
    "attempt_type": {
      "type": "string",
      "enum": ["MODULE_QUIZ","FINAL_EXAM","ROLEPLAY","PRACTICUM"],
      "description": "Type of assessment attempt"
    },
    "module_id": { "type": "string", "description": "Module ID for module quizzes" },
    "module_version": { "type": "integer" },
    "product_truth_version": { "type": "string", "description": "Product Truth version used for this attempt" },
    "score": { "type": "number", "description": "Percentage 0-100" },
    "passed": { "type": "boolean", "default": false },
    "total_questions": { "type": "integer" },
    "correct_answers": { "type": "integer" },
    "critical_questions_total": { "type": "integer" },
    "critical_questions_correct": { "type": "integer" },
    "all_critical_correct": { "type": "boolean", "default": false },
    "question_set_snapshot": { "type": "array", "items": { "type": "object" }, "description": "Snapshot of questions used in this attempt" },
    "answer_summary": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "question_id": { "type": "string" },
          "selected_index": { "type": "integer" },
          "correct": { "type": "boolean" },
          "is_critical": { "type": "boolean" },
          "competency": { "type": "string" }
        }
      },
      "description": "Per-question answer summary"
    },
    "critical_failures_detected": { "type": "array", "items": { "type": "string" } },
    "started_at": { "type": "string", "format": "date-time" },
    "completed_at": { "type": "string", "format": "date-time" },
    "duration_seconds": { "type": "integer" },
    "evaluator": { "type": "string", "description": "Manager who evaluated roleplay/practicum" },
    "roleplay_scores": { "type": "object", "description": "Roleplay scorecard breakdown" },
    "practicum_scores": { "type": "object", "description": "Practicum scorecard breakdown" }
  },
  "required": ["sales_member_id", "attempt_type", "score"]
}
```

---

## `base44/entities/VideoWatchProgress.jsonc`

```jsonc
{
  "name": "VideoWatchProgress",
  "type": "object",
  "properties": {
    "sales_member_id": { "type": "string", "description": "SalesTeamMember ID" },
    "module_id": { "type": "string", "description": "TrainingModule module_id" },
    "video_url": { "type": "string" },
    "video_duration_seconds": { "type": "number" },
    "watched_seconds": { "type": "number", "default": 0, "description": "Total unique seconds watched" },
    "completion_percentage": { "type": "number", "default": 0, "description": "Percentage of unique content watched (0-100)" },
    "completed": { "type": "boolean", "default": false, "description": "True only when >=95% watch completion achieved without seeking to end" },
    "last_position_seconds": { "type": "number", "default": 0 },
    "seeking_detected": { "type": "boolean", "default": false, "description": "True if user sought to end without watching" },
    "watch_segments": {
      "type": "array",
      "items": { "type": "object", "properties": { "start": { "type": "number" }, "end": { "type": "number" } } },
      "description": "Actual watched segments for seek detection"
    },
    "started_at": { "type": "string", "format": "date-time" },
    "completed_at": { "type": "string", "format": "date-time" },
    "last_updated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["sales_member_id", "module_id"]
}
```

---

## `base44/entities/AuditEvent.jsonc`

```jsonc
{
  "name": "AuditEvent",
  "type": "object",
  "properties": {
    "event_type": {
      "type": "string",
      "description": "Audit event type (VIDEO_STARTED, VIDEO_COMPLETED, QUIZ_STARTED, QUIZ_FAILED, QUIZ_PASSED, MODULE_UNLOCKED, ASSIGNMENT_SUBMITTED, ASSIGNMENT_APPROVED, CALLING_AUTHORIZED_SUPERVISED, CALLING_AUTHORIZED_TRAINING_INDEPENDENT, FINAL_EXAM_PASSED, ROLEPLAY_FAILED, ROLEPLAY_PASSED, PRACTICUM_FAILED, PRACTICUM_PASSED, REMEDIATION_ASSIGNED, SALES_CERTIFIED, CERTIFICATION_SUSPENDED, CERTIFICATION_RESTORED, DISCOUNT_REQUESTED, DISCOUNT_APPROVED, DISCOUNT_DENIED, REFERRAL_CREDIT_EARNED, REFERRAL_CREDIT_REDEEMED, REFERRAL_CREDIT_REVERSED, POST_SERVICE_FOLLOWUP_COMPLETED, CUSTOMER_RECOVERY_CREATED, CUSTOMER_RECOVERY_RESOLVED, CUSTOMER_RECOVERY_CLOSED_LOOP, BONUS_MILESTONE_EARNED, BONUS_APPROVED, BONUS_PAID, ADMIN_CORRECTION)"
    },
    "sales_member_id": { "type": "string" },
    "sales_member_name": { "type": "string" },
    "actor_id": { "type": "string", "description": "Who performed the action" },
    "actor_name": { "type": "string" },
    "actor_role": { "type": "string", "enum": ["REP","MANAGER","ADMIN","SYSTEM"] },
    "entity_type": { "type": "string", "description": "Type of entity affected" },
    "entity_id": { "type": "string", "description": "ID of entity affected" },
    "details": { "type": "object", "description": "Additional event-specific details" },
    "timestamp": { "type": "string", "format": "date-time" }
  },
  "required": ["event_type", "timestamp"],
  "rls": {
    "read": { "user_condition": { "role": "admin" } },
    "create": { "user_condition": { "role": "admin" } },
    "update": { "user_condition": { "role": "admin" } },
    "delete": { "user_condition": { "role": "admin" } }
  }
}
```

> **AuditEvent RLS note:** The `create` rule above is admin-only, but reps create audit events (QUIZ_PASSED, QUIZ_FAILED) from the portal. To allow this, either remove the `rls` block (default = any authenticated user can create) or change `create` to allow all authenticated users. Keep `read`/`update`/`delete` admin-only.