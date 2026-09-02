# Training Admin System — Shared Backend Constants & Functions

## `base44/shared/salesTrainingShared.ts`

```typescript
/**
 * Sales Training Shared Constants — Backend TypeScript mirror of salesTrainingData.js
 * Used by backend functions for training gating, certification, and audit logging.
 */

export const TRAINING_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  REMEDIATION_REQUIRED: "REMEDIATION_REQUIRED",
  TRAINING_COMPLETE: "TRAINING_COMPLETE",
  AWAITING_CERTIFICATION: "AWAITING_CERTIFICATION",
  SALES_CERTIFIED: "SALES_CERTIFIED",
  CERTIFICATION_SUSPENDED: "CERTIFICATION_SUSPENDED",
  NOT_CERTIFIED: "NOT_CERTIFIED",
} as const;

export const CALLING_AUTH = {
  CALLING_LOCKED: "CALLING_LOCKED",
  SUPERVISED_CALLING_ONLY: "SUPERVISED_CALLING_ONLY",
  TRAINING_INDEPENDENT_CALLING_AUTHORIZED: "TRAINING_INDEPENDENT_CALLING_AUTHORIZED",
  INDEPENDENT_CALLING_AUTHORIZED: "INDEPENDENT_CALLING_AUTHORIZED",
} as const;

export const CERTIFICATION_REQUIREMENTS = {
  module_quiz_min_score: 95,
  critical_questions_required: 100,
  final_exam_min_score: 95,
  final_exam_total_questions: 40,
  roleplay_min_score: 95,
  practicum_min_score: 95,
  min_watch_percentage: 95,
} as const;

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
] as const;

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
} as const;

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
} as const;

export const BONUS_MILESTONES = [
  { type: "CERTIFICATION_2_WEEK", label: "Successful 2-Week Certification", amount: 50 },
  { type: "DAY_30", label: "30-Day Milestone", amount: 100 },
  { type: "DAY_90", label: "90-Day Milestone", amount: 150 },
  { type: "DAY_180", label: "6-Month Milestone", amount: 200 },
] as const;

export const REFERRAL_CREDIT_AMOUNT = 20;
export const OVERTIME_THRESHOLD_HOURS = 40;
export const NORMAL_PAID_WORKWEEK_HOURS = 32;

/**
 * Calculate whether a quiz attempt passes based on score and critical questions.
 */
export function evaluateQuizAttempt(
  score: number,
  allCriticalCorrect: boolean,
  minScore: number = CERTIFICATION_REQUIREMENTS.module_quiz_min_score,
): { passed: boolean; reason: string } {
  if (!allCriticalCorrect) {
    return { passed: false, reason: "Critical question(s) incorrect — all critical questions must be answered correctly." };
  }
  if (score < minScore) {
    return { passed: false, reason: `Score ${score}% below minimum ${minScore}%.` };
  }
  return { passed: true, reason: "Passed." };
}

/**
 * Evaluate roleplay or practicum score with critical failure override.
 */
export function evaluateScoredAssessment(
  score: number,
  criticalFailures: string[],
  minScore: number,
): { passed: boolean; reason: string } {
  if (criticalFailures.length > 0) {
    return { passed: false, reason: `Critical failure(s): ${criticalFailures.join(", ")}. Remediation required.` };
  }
  if (score < minScore) {
    return { passed: false, reason: `Score ${score}/${100} below minimum ${minScore}.` };
  }
  return { passed: true, reason: "Passed." };
}

/**
 * Check all certification requirements and return eligibility.
 */
export function checkCertificationEligibility(cert: {
  modules_passed_count?: number;
  quiz_average_score?: number;
  critical_questions_status?: string;
  final_exam_passed?: boolean;
  final_exam_score?: number;
  roleplay_passed?: boolean;
  roleplay_score?: number;
  practicum_passed?: boolean;
  practicum_score?: number;
  critical_failures?: string[];
  remediation_modules?: string[];
}): { eligible: boolean; missing: string[] } {
  const missing: string[] = [];
  if ((cert.modules_passed_count || 0) < 13) missing.push("All 13 modules passed");
  if ((cert.quiz_average_score || 0) < CERTIFICATION_REQUIREMENTS.module_quiz_min_score) missing.push("Quiz average >= 95%");
  if (cert.critical_questions_status !== "ALL_CORRECT") missing.push("All critical questions correct");
  if (!cert.final_exam_passed) missing.push("Final exam passed");
  if (!cert.roleplay_passed) missing.push("Role-play passed (>= 95/100)");
  if (!cert.practicum_passed) missing.push("Practicum passed (>= 95/100)");
  if ((cert.critical_failures || []).length > 0) missing.push("No unresolved critical failures");
  if ((cert.remediation_modules || []).length > 0) missing.push("No pending remediation modules");
  return { eligible: missing.length === 0, missing };
}
```

---

## `base44/functions/saveTrainingModule/entry.ts`

> Admin-only function to create or update a training module. Auto-increments version on update.

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { writeOrientationAudit } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let actor = 'admin';
    try {
      const u = await base44.auth.me();
      if (!u) return Response.json({ error: 'Not authenticated' }, { status: 401 });
      if (u.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
      actor = u.email;
    } catch (e) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    if (!body.module_id || !body.title) return Response.json({ error: 'module_id and title are required' }, { status: 400 });
    const existing = await base44.asServiceRole.entities.TrainingModule.filter({ module_id: body.module_id });
    const data = {
      module_id: body.module_id,
      title: body.title,
      description: body.description || '',
      order: body.order || 0,
      quiz_questions: Array.isArray(body.quiz_questions) ? body.quiz_questions : [],
      passing_score: body.passing_score != null ? Number(body.passing_score) : 70,
      active: body.active !== false,
      updated_at: new Date().toISOString(),
    };
    let rec;
    if (existing && existing[0]) {
      rec = await base44.asServiceRole.entities.TrainingModule.update(existing[0].id, { ...data, version: (existing[0].version || 1) + 1 });
    } else {
      rec = await base44.asServiceRole.entities.TrainingModule.create({ ...data, version: 1 });
    }
    await writeOrientationAudit(base44, { arriv_employee_id: '*', actor, role: 'admin', action: 'training_module_saved', section: body.module_id });
    return Response.json({ success: true, module_id: body.module_id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
```

> **Dependency:** `writeOrientationAudit` lives in `orientationEngine.ts`. If you don't have that file, remove the audit line or replace it with a direct `AuditEvent.create` call.

---

## `base44/functions/recordTrainingModuleScore/entry.ts`

> Scores a quiz attempt and records it. Uses the orientation engine to recompute readiness.

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recordTrainingScore, getOrientationBundle, getActiveTrainingModules } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!body.sales_member_id || !body.module_id) {
      return Response.json({ error: 'sales_member_id and module_id are required' }, { status: 400 });
    }
    if (!Array.isArray(body.answers)) {
      return Response.json({ error: 'answers (array of selected indices) is required' }, { status: 400 });
    }
    const bundle = await getOrientationBundle(base44, body.sales_member_id);
    const modules = await getActiveTrainingModules(base44);
    const mod = modules.find((m) => m.module_id === body.module_id);
    if (!mod) return Response.json({ error: 'Training module not found' }, { status: 404 });
    const questions = mod.quiz_questions || [];
    let correct = 0;
    const summary = [];
    questions.forEach((q, i) => {
      const sel = body.answers[i];
      const isCorrect = typeof sel === 'number' && sel === q.correct_index;
      if (isCorrect) correct++;
      summary.push({ question_index: i, correct: isCorrect });
    });
    const score = questions.length ? Math.round((correct / questions.length) * 100) : 100;
    const passing = mod.passing_score != null ? mod.passing_score : 70;
    const passed = score >= passing;
    await recordTrainingScore(base44, {
      orientation: bundle.orientation,
      module_id: body.module_id,
      module_version: mod.version || 1,
      score,
      passed,
      answer_summary: { total: questions.length, correct, score, passing },
    });
    return Response.json({ success: true, score, passed, passing });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
```

> **Dependency:** Requires `orientationEngine.ts` with `getOrientationBundle`, `getActiveTrainingModules`, and `recordTrainingScore`. If you don't have the orientation system, simplify this to just create a `TrainingAttempt` record and update `SalesCertification` directly.

---

## `base44/functions/getSalesTrainingVideos/entry.ts`

> Returns optional extra training videos stored in AppSetting.

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let videos = [];
    try {
      const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_training_videos" });
      if (settings?.[0]?.value) {
        videos = JSON.parse(settings[0].value);
      }
    } catch (e) {
      // no settings yet — return empty
    }
    return Response.json({ success: true, videos: Array.isArray(videos) ? videos : [] });
  } catch (error) {
    return Response.json({ success: true, videos: [] });
  }
});
```

> **Dependency:** Requires an `AppSetting` entity with `key` and `value` string fields. If you don't have it, skip this function.

---

## `base44/functions/setSalesTrainingVideos/entry.ts`

> Admin-only function to save the extra training videos list.

```typescript
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin auth: Base44 admin OR sales admin via sales_member_id
    let isAdmin = false;
    let body = null;
    try {
      const user = await base44.auth.me();
      isAdmin = user?.role === 'admin';
    } catch (e) {
      body = await req.clone().json();
      if (body.sales_member_id) {
        const m = await base44.asServiceRole.entities.SalesTeamMember.get(body.sales_member_id);
        isAdmin = m?.role === 'admin';
      }
    }
    if (!isAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 });

    if (!body) body = await req.json();
    const { videos } = body;
    if (!Array.isArray(videos)) return Response.json({ error: 'videos must be an array' }, { status: 400 });

    const clean = videos
      .map((v) => ({ title: String(v?.title || "").slice(0, 200), url: String(v?.url || "").trim().slice(0, 500) }))
      .filter((v) => v.url);

    const value = JSON.stringify(clean);
    const existing = await base44.asServiceRole.entities.AppSetting.filter({ key: "sales_training_videos" });
    if (existing?.[0]) {
      await base44.asServiceRole.entities.AppSetting.update(existing[0].id, { value });
    } else {
      await base44.asServiceRole.entities.AppSetting.create({ key: "sales_training_videos", value });
    }

    return Response.json({ success: true, videos: clean });
  } catch (error) {
    console.error('setSalesTrainingVideos error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
``