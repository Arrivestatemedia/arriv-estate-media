// ============================================================================
// EDITING QUEUE ENGINE — Server-authoritative logic for the Arriv in-house
// post-production workflow. Handles task creation, upload-gated release,
// capability-enforced assignment, active-time tracking, QC/revision, delivery,
// audit logging, and SLA calculation.
//
// MEDIA PARTNERS CAPTURE. ARRIV EMPLOYEES EDIT.
// Editing is an Arriv operating expense — it does NOT change Media Partner
// payouts, sales commissions, or customer service prices.
// ============================================================================

import {
  generateEditingTasksForOrder,
  calculateDeliveryDeadline,
  calculateEditingDeadline,
  calculateSlaStatus,
  TASK_TYPE_REQUIRED_CAPABILITY,
  TASK_TYPE_REQUIRED_SOURCE_MEDIA,
  EDITING_TASK_LABELS,
} from "./packageEditingConfig.ts";

const TENANT_ID = "tnt_estate_media";

// ── STORAGE HELPERS ──────────────────────────────────────────────────────────

/** Extract a Google Drive folder ID from a Drive folder URL. */
export function extractDriveFolderId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── AUDIT ──────────────────────────────────────────────────────────────────

export async function writeAudit(
  base44: any,
  editingTaskId: string,
  action: string,
  actor: string,
  actorEmail: string,
  beforeValue?: string,
  afterValue?: string,
  reason?: string
) {
  await base44.asServiceRole.entities.EditingTaskAuditLog.create({
    tenant_id: TENANT_ID,
    editing_task_id: editingTaskId,
    action,
    actor,
    actor_email: actorEmail,
    before_value: beforeValue || null,
    after_value: afterValue || null,
    reason: reason || null,
    timestamp: new Date().toISOString(),
  });
}

// ── TASK CREATION ──────────────────────────────────────────────────────────

/**
 * Create editing tasks for a job based on its package + add-ons.
 * Idempotent: if tasks already exist for this job, returns existing.
 * Tasks start in WAITING_FOR_UPLOAD status.
 */
export async function ensureEditingTasksForJob(
  base44: any,
  job: any,
  actor: string = "system"
): Promise<any[]> {
  // Check for existing tasks
  const existing = await base44.asServiceRole.entities.EditingTask.filter({
    job_id: job.id,
  });

  if (existing && existing.length > 0) {
    return existing;
  }

  const packageId = job.package || "photo_essentials";
  const addOns: string[] = job.add_ons || [];
  const isRush = addOns.includes("rush_delivery");

  const taskSpecs = generateEditingTasksForOrder(packageId, addOns, isRush);

  if (taskSpecs.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const createdTasks: any[] = [];

  // Resolve the existing Google Drive source-media folder from the Job.
  // Reuse the EXISTING folder — never create a duplicate.
  const sourceFolderUrl = job.google_drive_folder_url || null;
  const sourceFolderId = extractDriveFolderId(sourceFolderUrl);

  for (const spec of taskSpecs) {
    const requiredCap = TASK_TYPE_REQUIRED_CAPABILITY[spec.task_type] || "";
    const label = EDITING_TASK_LABELS[spec.task_type] || spec.task_type;
    const taskLabel =
      spec.task_index > 1 ? `${label} #${spec.task_index}` : label;
    const requiredSourceMedia = TASK_TYPE_REQUIRED_SOURCE_MEDIA[spec.task_type] || "all";

    const task = await base44.asServiceRole.entities.EditingTask.create({
      tenant_id: TENANT_ID,
      booking_id: job.booking_id || null,
      job_id: job.id,
      client_name: job.client_name || null,
      client_email: job.client_email || null,
      media_partner_id: job.booked_by ? null : null, // booked_by is email; we don't have ID here
      media_partner_name: job.booked_by_name || job.booked_by || null,
      property_address: job.location || null,
      package_id: packageId,
      task_type: spec.task_type,
      task_label: taskLabel,
      task_index: spec.task_index,
      required_editor_capabilities: requiredCap ? [requiredCap] : [],
      required_source_media: requiredSourceMedia,
      status: "waiting_for_upload",
      priority: isRush ? "rush" : "normal",
      storage_provider: "GOOGLE_DRIVE",
      storage_folder_id: sourceFolderId,
      storage_folder_url: sourceFolderUrl,
      source_media_location: sourceFolderUrl,
      upload_status: "waiting",
      active_editing_minutes: 0,
      revision_count: 0,
      qc_status: "pending",
      sla_status: "on_track",
      editing_standards_version: "AEM_EDIT_STANDARDS_V1",
      created_at: now,
      updated_at: now,
      created_by: actor,
    });

    await writeAudit(base44, task.id, "task_created", actor, actor, null, task.task_type);
    createdTasks.push(task);
  }

  // Update job production_status to reflect that editing tasks now exist
  await updateJobProductionStatus(base44, job.id);

  return createdTasks;
}

// ── UPLOAD-GATED RELEASE ─────────────────────────────────────────────────────

/**
 * Release editing tasks from WAITING_FOR_UPLOAD to READY_FOR_EDITING when
 * their required source-media category is confirmed complete.
 *
 * PER-CATEGORY RELEASE:
 *   - photo tasks release when photo upload is confirmed
 *   - video tasks release when video upload is confirmed
 *   - drone tasks release when drone upload is confirmed
 *   - 'all' tasks release when any upload is confirmed
 *
 * This integrates with the EXISTING Media Partner upload system. The existing
 * system tracks a single footage_uploaded flag per job. When that flag becomes
 * true, all categories are considered available and all tasks release.
 *
 * Future enhancement: per-category source tracking (photo vs video vs drone)
 * will allow partial releases when only some categories are uploaded.
 *
 * IDEMPOTENT: Calling this multiple times for the same job does not duplicate
 * tasks or re-release already-released tasks.
 *
 * STORAGE: Attaches the existing Google Drive folder references to each task.
 * No duplicate folders are created — tasks reference the Job's existing folder.
 */
export async function releaseEditingTasksForJob(
  base44: any,
  jobId: string,
  sourceMediaLocation?: string,
  actor: string = "system",
  completedCategories?: string[]
): Promise<{ released: number; tasks: any[] }> {
  // Safety guard: verify the job actually has footage uploaded before releasing.
  const job = await base44.asServiceRole.entities.Job.get(jobId);
  if (!job) return { released: 0, tasks: [] };
  if (!job.footage_uploaded) {
    return { released: 0, tasks: [] };
  }

  // Resolve the existing Google Drive folder references from the Job
  const folderUrl = sourceMediaLocation || job.google_drive_folder_url || null;
  const folderId = extractDriveFolderId(folderUrl);

  // If no completedCategories specified, treat all as complete (legacy behavior
  // — the existing system has a single footage_uploaded flag, so all categories
  // are available when footage_uploaded is true).
  const availableCategories = completedCategories || ["photo", "video", "drone", "all"];

  const tasks = await base44.asServiceRole.entities.EditingTask.filter({
    job_id: jobId,
  });

  const released: any[] = [];
  const now = new Date().toISOString();

  for (const task of tasks) {
    if (task.status !== "waiting_for_upload") continue;

    // Per-category gate: only release if the task's required source media
    // category is in the availableCategories list
    const requiredCategory = task.required_source_media || "all";
    if (!availableCategories.includes(requiredCategory)) {
      continue;
    }

    const deliveryDeadline = calculateDeliveryDeadline(task.task_type, task.priority === "rush");
    const editingDeadline = calculateEditingDeadline(task.task_type, task.priority === "rush");

    await base44.asServiceRole.entities.EditingTask.update(task.id, {
      status: "ready_for_editing",
      source_media_verified_at: now,
      editing_ready_at: now,
      upload_status: "complete",
      upload_completed_at: now,
      storage_provider: "GOOGLE_DRIVE",
      storage_folder_id: folderId || task.storage_folder_id,
      storage_folder_url: folderUrl || task.storage_folder_url,
      source_media_location: folderUrl || task.source_media_location,
      delivery_deadline: deliveryDeadline.toISOString(),
      editing_deadline: editingDeadline.toISOString(),
      sla_status: calculateSlaStatus(deliveryDeadline),
      updated_at: now,
    });

    await writeAudit(
      base44,
      task.id,
      "status_changed",
      actor,
      actor,
      "waiting_for_upload",
      "ready_for_editing",
      `Source media (${requiredCategory}) upload confirmed`
    );

    released.push(task.id);
  }

  // Update job production_status after releasing tasks
  await updateJobProductionStatus(base44, jobId);

  return { released: released.length, tasks: released };
}

/**
 * Release tasks for a specific source-media category only.
 * Call this when a specific category (photo, video, drone) is confirmed
 * uploaded, without requiring the entire job upload to be complete.
 */
export async function releaseEditingTasksForCategory(
  base44: any,
  jobId: string,
  category: "photo" | "video" | "drone",
  sourceMediaLocation?: string,
  actor: string = "system"
): Promise<{ released: number; tasks: any[] }> {
  return releaseEditingTasksForJob(base44, jobId, sourceMediaLocation, actor, [category, "all"]);
}

// ── JOB PRODUCTION STATUS DERIVATION ─────────────────────────────────────────

/**
 * Derive and update Job.production_status from the states of its child
 * EditingTasks. This is the SERVER-AUTHORITATIVE production status — never
 * set production_status from the frontend.
 *
 * Derivation rules:
 *   - No editing tasks → 'no_editing_required' (or 'awaiting_upload' if footage not uploaded)
 *   - Any task waiting_for_upload and footage not uploaded → 'awaiting_upload'
 *   - Any task waiting_for_upload but footage partially uploaded → 'partial_upload'
 *   - At least one task ready_for_editing, none editing → 'ready_for_editing'
 *   - At least one task editing/assigned → 'editing'
 *   - All tasks submitted_for_qc → 'quality_control'
 *   - Any task revision_required → 'revision'
 *   - All tasks approved (not yet delivered) → 'ready_for_delivery'
 *   - All tasks delivered/cancelled → 'delivered'
 */
export async function updateJobProductionStatus(base44: any, jobId: string): Promise<string> {
  const job = await base44.asServiceRole.entities.Job.get(jobId);
  if (!job) return "awaiting_capture";

  const tasks = await base44.asServiceRole.entities.EditingTask.filter({ job_id: jobId });

  // No editing tasks — job doesn't require post-production
  if (!tasks || tasks.length === 0) {
    if (job.footage_uploaded) {
      await base44.asServiceRole.entities.Job.update(jobId, {
        production_status: "no_editing_required",
        source_upload_status: "complete",
      });
      return "no_editing_required";
    }
    const status = job.footage_uploaded ? "no_editing_required" : "awaiting_upload";
    await base44.asServiceRole.entities.Job.update(jobId, { production_status: status });
    return status;
  }

  const activeTasks = tasks.filter((t: any) => t.status !== "cancelled");

  // If all tasks cancelled, treat as no_editing_required
  if (activeTasks.length === 0) {
    await base44.asServiceRole.entities.Job.update(jobId, { production_status: "no_editing_required" });
    return "no_editing_required";
  }

  const statuses = activeTasks.map((t: any) => t.status);
  const hasWaiting = statuses.includes("waiting_for_upload");
  const hasReady = statuses.includes("ready_for_editing");
  const hasEditing = statuses.includes("editing") || statuses.includes("assigned");
  const hasSubmitted = statuses.includes("submitted_for_qc");
  const hasRevision = statuses.includes("revision_required");
  const hasApproved = statuses.includes("approved");
  const allDelivered = activeTasks.every((t: any) => t.status === "delivered");

  let productionStatus: string;

  if (allDelivered) {
    productionStatus = "delivered";
  } else if (hasRevision) {
    productionStatus = "revision";
  } else if (activeTasks.every((t: any) => t.status === "approved")) {
    productionStatus = "ready_for_delivery";
  } else if (activeTasks.every((t: any) => t.status === "submitted_for_qc")) {
    productionStatus = "quality_control";
  } else if (hasEditing) {
    productionStatus = "editing";
  } else if (hasReady || hasSubmitted || hasApproved) {
    // At least one task is past upload stage, and none are actively editing
    productionStatus = "ready_for_editing";
  } else if (hasWaiting) {
    // All tasks still waiting for upload
    if (job.footage_uploaded) {
      productionStatus = "ready_for_editing";
    } else {
      productionStatus = "awaiting_upload";
    }
  } else {
    productionStatus = "awaiting_upload";
  }

  // Also update source_upload_status
  let sourceUploadStatus = "not_started";
  if (job.footage_uploaded) {
    sourceUploadStatus = "complete";
  } else if (activeTasks.some((t: any) => t.upload_status === "partial")) {
    sourceUploadStatus = "partial";
  }

  await base44.asServiceRole.entities.Job.update(jobId, {
    production_status: productionStatus,
    source_upload_status: sourceUploadStatus,
  });

  return productionStatus;
}

// ── CAPABILITY ENFORCEMENT ──────────────────────────────────────────────────

/**
 * Verify that an editor has the required verified capabilities for a task.
 * Returns true if the editor can be assigned.
 */
export async function editorHasRequiredCapability(
  base44: any,
  editorProfileId: string,
  requiredCapabilities: string[]
): Promise<boolean> {
  if (!requiredCapabilities || requiredCapabilities.length === 0) return true;

  const editor = await base44.asServiceRole.entities.EditorProfile.get(editorProfileId);
  if (!editor) return false;
  if (editor.editor_status !== "active") return false;

  const verified = editor.verified_editor_capabilities || [];
  return requiredCapabilities.every((cap) => verified.includes(cap));
}

// ── ASSIGNMENT ──────────────────────────────────────────────────────────────

/**
 * Assign an editing task to an editor. Enforces capability requirements.
 * Server-authoritative — rejects assignment to unqualified editors.
 */
export async function assignEditingTask(
  base44: any,
  taskId: string,
  editorProfileId: string,
  actor: string,
  actorEmail: string
): Promise<{ success: boolean; error?: string; task?: any }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "ready_for_editing" && task.status !== "revision_required" && task.status !== "assigned") {
    return { success: false, error: `Task is not assignable in status: ${task.status}` };
  }

  const editor = await base44.asServiceRole.entities.EditorProfile.get(editorProfileId);
  if (!editor) return { success: false, error: "Editor profile not found" };
  if (editor.editor_status !== "active") return { success: false, error: "Editor is not active" };

  const required = task.required_editor_capabilities || [];
  const verified = editor.verified_editor_capabilities || [];
  const hasAll = required.every((cap) => verified.includes(cap));
  if (!hasAll) {
    return {
      success: false,
      error: `Editor lacks required capability: ${required.filter((c) => !verified.includes(c)).join(", ")}`,
    };
  }

  const previousEditor = task.editor_id;
  const now = new Date().toISOString();

  const updated = await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "assigned",
    editor_id: editorProfileId,
    editor_name: editor.employee_name,
    assigned_at: now,
    assigned_by: actor,
    updated_at: now,
  });

  await writeAudit(
  base44,
  taskId,
  previousEditor ? "task_reassigned" : "task_assigned",
  actor,
  actorEmail,
  previousEditor || "unassigned",
  editorProfileId
  );

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true, task: updated };
  }

// ── TIME TRACKING ────────────────────────────────────────────────────────────

/**
 * Start or resume editing on a task. Creates an active time session.
 * Prevents overlapping active sessions for the same editor.
 */
export async function startEditing(
  base44: any,
  taskId: string,
  editorProfileId: string,
  actor: string,
  actorEmail: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.editor_id !== editorProfileId) {
    return { success: false, error: "Only the assigned editor can start editing" };
  }

  if (task.status !== "assigned" && task.status !== "revision_required" && task.status !== "editing") {
    return { success: false, error: `Cannot start editing in status: ${task.status}` };
  }

  // Check for existing active session for this editor (prevent overlap)
  const activeSessions = await base44.asServiceRole.entities.EditingTimeSession.filter({
    editor_id: editorProfileId,
    session_status: "active",
  });

  if (activeSessions && activeSessions.length > 0) {
    // Check if the active session is for THIS task — if so, it's a resume, not a new start
    const sameTaskActive = activeSessions.find((s: any) => s.editing_task_id === taskId);
    if (!sameTaskActive) {
      return {
        success: false,
        error: "Editor already has an active editing session on another task. Pause it first.",
      };
    }
    // Already active on this task — just return success
    return { success: true };
  }

  const now = new Date().toISOString();

  // Create new session
  await base44.asServiceRole.entities.EditingTimeSession.create({
    tenant_id: TENANT_ID,
    editing_task_id: taskId,
    editor_id: editorProfileId,
    editor_name: task.editor_name,
    clock_in_at: now,
    session_status: "active",
    created_at: now,
  });

  const wasFirstStart = !task.editing_started_at;
  const updateData: any = {
    status: "editing",
    editing_started_at: task.editing_started_at || now,
    updated_at: now,
  };

  await base44.asServiceRole.entities.EditingTask.update(taskId, updateData);

  await writeAudit(
    base44,
    taskId,
    wasFirstStart ? "editing_started" : "editing_resumed",
    actor,
    actorEmail,
    task.status,
    "editing"
  );

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true };
}

/**
 * Pause editing on a task. Closes the active time session and adds minutes.
 */
export async function pauseEditing(
  base44: any,
  taskId: string,
  editorProfileId: string,
  actor: string,
  actorEmail: string
): Promise<{ success: boolean; error?: string; sessionMinutes?: number }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "editing") {
    return { success: false, error: "Task is not in editing status" };
  }

  const activeSessions = await base44.asServiceRole.entities.EditingTimeSession.filter({
    editing_task_id: taskId,
    editor_id: editorProfileId,
    session_status: "active",
  });

  if (!activeSessions || activeSessions.length === 0) {
    return { success: false, error: "No active session found" };
  }

  const now = new Date();
  let totalSessionMinutes = 0;

  for (const session of activeSessions) {
    const clockIn = new Date(session.clock_in_at);
    const durationMinutes = Math.round((now.getTime() - clockIn.getTime()) / (60 * 1000));

    await base44.asServiceRole.entities.EditingTimeSession.update(session.id, {
      clock_out_at: now.toISOString(),
      duration_minutes: durationMinutes,
      session_status: "paused",
    });

    totalSessionMinutes += durationMinutes;
  }

  const newActiveMinutes = (task.active_editing_minutes || 0) + totalSessionMinutes;
  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "assigned",
    active_editing_minutes: newActiveMinutes,
    updated_at: now.toISOString(),
  });

  await writeAudit(base44, taskId, "editing_paused", actor, actorEmail, "editing", "assigned");

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true, sessionMinutes: totalSessionMinutes };
}

/**
 * Submit editing work for QC. Closes any active session and moves to QC.
 */
export async function submitForQc(
  base44: any,
  taskId: string,
  editorProfileId: string,
  finalMediaLocation: string,
  actor: string,
  actorEmail: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "editing" && task.status !== "revision_required") {
    return { success: false, error: `Cannot submit for QC from status: ${task.status}` };
  }

  const now = new Date();

  // Close any active session
  const activeSessions = await base44.asServiceRole.entities.EditingTimeSession.filter({
    editing_task_id: taskId,
    editor_id: editorProfileId,
    session_status: "active",
  });

  let additionalMinutes = 0;
  for (const session of activeSessions) {
    const clockIn = new Date(session.clock_in_at);
    const durationMinutes = Math.round((now.getTime() - clockIn.getTime()) / (60 * 1000));
    await base44.asServiceRole.entities.EditingTimeSession.update(session.id, {
      clock_out_at: now.toISOString(),
      duration_minutes: durationMinutes,
      session_status: "completed",
    });
    additionalMinutes += durationMinutes;
  }

  const newActiveMinutes = (task.active_editing_minutes || 0) + additionalMinutes;

  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "submitted_for_qc",
    editing_completed_at: now.toISOString(),
    active_editing_minutes: newActiveMinutes,
    final_media_location: finalMediaLocation || task.final_media_location,
    submitted_for_qc_at: now.toISOString(),
    qc_status: "pending",
    updated_at: now.toISOString(),
  });

  await writeAudit(base44, taskId, "submitted_for_qc", actor, actorEmail, task.status, "submitted_for_qc");

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true };
}

// ── QC / REVISION ────────────────────────────────────────────────────────────

/**
 * QC reviewer approves the submitted work.
 */
export async function approveQc(
  base44: any,
  taskId: string,
  reviewerId: string,
  reviewerEmail: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "submitted_for_qc") {
    return { success: false, error: `Cannot approve from status: ${task.status}` };
  }

  const now = new Date().toISOString();

  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "approved",
    qc_status: "approved",
    qc_reviewer_id: reviewerId,
    qc_started_at: task.qc_started_at || task.submitted_for_qc_at,
    qc_completed_at: now,
    qc_notes: notes || null,
    updated_at: now,
  });

  await writeAudit(base44, taskId, "qc_approved", reviewerId, reviewerEmail, "submitted_for_qc", "approved", notes);

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true };
}

/**
 * QC reviewer requests revision. Sends the task back to the editor.
 */
export async function requestRevision(
  base44: any,
  taskId: string,
  reviewerId: string,
  reviewerEmail: string,
  revisionReason: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "submitted_for_qc") {
    return { success: false, error: `Cannot request revision from status: ${task.status}` };
  }

  const now = new Date().toISOString();
  const newRevisionCount = (task.revision_count || 0) + 1;

  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "revision_required",
    qc_status: "revision_required",
    qc_reviewer_id: reviewerId,
    qc_started_at: task.qc_started_at || task.submitted_for_qc_at,
    qc_completed_at: now,
    qc_notes: revisionReason,
    revision_count: newRevisionCount,
    revision_requested_at: now,
    revision_reason: revisionReason,
    updated_at: now,
  });

  await writeAudit(
    base44,
    taskId,
    "revision_requested",
    reviewerId,
    reviewerEmail,
    "submitted_for_qc",
    "revision_required",
    revisionReason
  );

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true };
}

// ── DELIVERY ────────────────────────────────────────────────────────────────

/**
 * Mark an approved task as delivered to the customer.
 * This is the final step in the editing workflow.
 */
export async function deliverTask(
  base44: any,
  taskId: string,
  actor: string,
  actorEmail: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status !== "approved") {
    return { success: false, error: `Cannot deliver from status: ${task.status}` };
  }

  const now = new Date().toISOString();

  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "delivered",
    delivered_at: now,
    updated_at: now,
  });

  await writeAudit(base44, taskId, "delivery_completed", actor, actorEmail, "approved", "delivered");

  // Check if all tasks for this job are now delivered → mark job complete
  await checkJobDeliveryComplete(base44, task.job_id);
  await updateJobProductionStatus(base44, task.job_id);

  return { success: true };
}

/**
 * Check if all editing tasks for a job are delivered, and if so, mark
 * the job as fully delivered to the customer AND set overall Job.status
 * to 'completed' (all customer fulfillment is now complete).
 *
 * This is the ONLY place that sets Job.status = 'completed' for booking jobs
 * that go through post-production. Media Partner payout eligibility is based
 * on media_partner_fulfillment_status, which was set earlier — so payouts
 * are NOT delayed by post-production.
 */
export async function checkJobDeliveryComplete(base44: any, jobId: string): Promise<boolean> {
  const tasks = await base44.asServiceRole.entities.EditingTask.filter({ job_id: jobId });
  if (!tasks || tasks.length === 0) return false;

  const allDelivered = tasks.every((t: any) => t.status === "delivered" || t.status === "cancelled");
  if (!allDelivered) return false;

  const now = new Date().toISOString();

  // All tasks delivered — mark job as fully complete
  await base44.asServiceRole.entities.Job.update(jobId, {
    delivered_to_customer: true,
    delivered_at: now,
    delivery_status: "delivered",
    production_status: "delivered",
    status: "completed",
  });

  return true;
}

// ── CANCEL ──────────────────────────────────────────────────────────────────

export async function cancelEditingTask(
  base44: any,
  taskId: string,
  actor: string,
  actorEmail: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  if (task.status === "delivered") {
    return { success: false, error: "Cannot cancel a delivered task" };
  }

  // Close any active session
  if (task.status === "editing") {
    const activeSessions = await base44.asServiceRole.entities.EditingTimeSession.filter({
      editing_task_id: taskId,
      session_status: "active",
    });
    const now = new Date();
    for (const session of activeSessions) {
      const clockIn = new Date(session.clock_in_at);
      const durationMinutes = Math.round((now.getTime() - clockIn.getTime()) / (60 * 1000));
      await base44.asServiceRole.entities.EditingTimeSession.update(session.id, {
        clock_out_at: now.toISOString(),
        duration_minutes: durationMinutes,
        session_status: "completed",
      });
    }
  }

  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    status: "cancelled",
    notes: reason ? `${task.notes || ""}\n[Cancelled: ${reason}]`.trim() : task.notes,
    updated_at: new Date().toISOString(),
  });

  await writeAudit(base44, taskId, "task_cancelled", actor, actorEmail, task.status, "cancelled", reason);

  await updateJobProductionStatus(base44, task.job_id);

  return { success: true };
}

// ── TIME CORRECTION (ADMIN) ──────────────────────────────────────────────────

export async function correctTimeRecord(
  base44: any,
  taskId: string,
  newActiveMinutes: number,
  actor: string,
  actorEmail: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const task = await base44.asServiceRole.entities.EditingTask.get(taskId);
  if (!task) return { success: false, error: "Task not found" };

  const oldMinutes = task.active_editing_minutes || 0;

  await base44.asServiceRole.entities.EditingTask.update(taskId, {
    active_editing_minutes: newActiveMinutes,
    updated_at: new Date().toISOString(),
  });

  await writeAudit(
    base44,
    taskId,
    "time_record_corrected",
    actor,
    actorEmail,
    String(oldMinutes),
    String(newActiveMinutes),
    reason
  );

  return { success: true };
}

// ── ANALYTICS ────────────────────────────────────────────────────────────────

/**
 * Compute editing analytics for staffing/capacity decisions.
 * Returns metrics based on completed and in-progress tasks.
 */
export async function computeEditingAnalytics(base44: any, daysBack: number = 30): Promise<any> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);
  const sinceIso = sinceDate.toISOString();

  // Fetch all tasks (non-cancelled) for analytics
  const allTasks = await base44.asServiceRole.entities.EditingTask.list("-created_date", 5000);
  const activeTasks = allTasks.filter((t: any) => t.status !== "cancelled");

  // Weekly / monthly buckets
  const now = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const completedThisWeek = activeTasks.filter(
    (t: any) => t.status === "delivered" && t.delivered_at && new Date(t.delivered_at) >= weekAgo
  );
  const completedThisMonth = activeTasks.filter(
    (t: any) => t.status === "delivered" && t.delivered_at && new Date(t.delivered_at) >= monthAgo
  );

  // Editing hours
  const totalMinutesThisWeek = completedThisWeek.reduce((sum: number, t: any) => sum + (t.active_editing_minutes || 0), 0);
  const totalMinutesThisMonth = completedThisMonth.reduce((sum: number, t: any) => sum + (t.active_editing_minutes || 0), 0);

  // By task type
  const byTaskType: Record<string, { count: number; totalMinutes: number }> = {};
  const byPackage: Record<string, { count: number; totalMinutes: number }> = {};
  const byEditor: Record<string, { count: number; totalMinutes: number }> = {};

  for (const t of completedThisMonth) {
    const tt = t.task_type;
    if (!byTaskType[tt]) byTaskType[tt] = { count: 0, totalMinutes: 0 };
    byTaskType[tt].count++;
    byTaskType[tt].totalMinutes += t.active_editing_minutes || 0;

    const pkg = t.package_id || "unknown";
    if (!byPackage[pkg]) byPackage[pkg] = { count: 0, totalMinutes: 0 };
    byPackage[pkg].count++;
    byPackage[pkg].totalMinutes += t.active_editing_minutes || 0;

    if (t.editor_id) {
      if (!byEditor[t.editor_id]) byEditor[t.editor_id] = { count: 0, totalMinutes: 0 };
      byEditor[t.editor_id].count++;
      byEditor[t.editor_id].totalMinutes += t.active_editing_minutes || 0;
    }
  }

  // Averages
  const avgMinutesByTaskType: Record<string, number> = {};
  for (const [tt, data] of Object.entries(byTaskType)) {
    avgMinutesByTaskType[tt] = data.count > 0 ? Math.round(data.totalMinutes / data.count) : 0;
  }

  const avgMinutesByPackage: Record<string, number> = {};
  for (const [pkg, data] of Object.entries(byPackage)) {
    avgMinutesByPackage[pkg] = data.count > 0 ? Math.round(data.totalMinutes / data.count) : 0;
  }

  // Queue backlog
  const readyForEditing = activeTasks.filter((t: any) => t.status === "ready_for_editing");
  const inEditing = activeTasks.filter((t: any) => t.status === "editing" || t.status === "assigned");
  const submittedForQc = activeTasks.filter((t: any) => t.status === "submitted_for_qc");
  const revisionRequired = activeTasks.filter((t: any) => t.status === "revision_required");
  const approved = activeTasks.filter((t: any) => t.status === "approved");

  // Estimated backlog hours (using averages)
  let backlogMinutes = 0;
  for (const t of readyForEditing) {
    const avg = avgMinutesByTaskType[t.task_type] || 0;
    backlogMinutes += avg;
  }
  // Add partial work for in-progress tasks
  for (const t of inEditing) {
    const avg = avgMinutesByTaskType[t.task_type] || 0;
    const remaining = Math.max(avg - (t.active_editing_minutes || 0), 0);
    backlogMinutes += remaining;
  }

  // Revision rate
  const totalSubmitted = activeTasks.filter((t: any) =>
    ["submitted_for_qc", "approved", "delivered", "revision_required"].includes(t.status) ||
    (t.revision_count || 0) > 0
  );
  const tasksWithRevisions = activeTasks.filter((t: any) => (t.revision_count || 0) > 0);
  const revisionRate = totalSubmitted.length > 0
    ? Math.round((tasksWithRevisions.length / totalSubmitted.length) * 100)
    : 0;

  // First-pass QC approval rate
  const qcReviewed = activeTasks.filter((t: any) =>
    ["approved", "delivered"].includes(t.status) || (t.revision_count || 0) > 0
  );
  const firstPassApproved = qcReviewed.filter((t: any) => (t.revision_count || 0) === 0);
  const firstPassRate = qcReviewed.length > 0
    ? Math.round((firstPassApproved.length / qcReviewed.length) * 100)
    : 0;

  // On-time completion
  const delivered = activeTasks.filter((t: any) => t.status === "delivered" && t.delivery_deadline);
  const onTime = delivered.filter((t: any) =>
    new Date(t.delivered_at) <= new Date(t.delivery_deadline)
  );
  const onTimeRate = delivered.length > 0
    ? Math.round((onTime.length / delivered.length) * 100)
    : 0;

  // Oldest unassigned task age
  const readySorted = readyForEditing
    .filter((t: any) => t.source_media_verified_at)
    .sort((a: any, b: any) =>
      new Date(a.source_media_verified_at).getTime() - new Date(b.source_media_verified_at).getTime()
    );
  const oldestUnassigned = readySorted[0];
  const oldestUnassignedAgeHours = oldestUnassigned
    ? Math.round((now.getTime() - new Date(oldestUnassigned.source_media_verified_at).getTime()) / (60 * 60 * 1000))
    : 0;

  // Editor utilization (this week)
  const editors = await base44.asServiceRole.entities.EditorProfile.filter({ editor_status: "active" });
  const editorUtilization = editors.map((e: any) => {
    const editorTasks = completedThisWeek.filter((t: any) => t.editor_id === e.id);
    const minutes = editorTasks.reduce((sum: number, t: any) => sum + (t.active_editing_minutes || 0), 0);
    const maxWeekly = (e.max_weekly_hours || 32) * 60;
    return {
      editor_id: e.id,
      editor_name: e.employee_name,
      weekly_minutes: minutes,
      weekly_hours: Math.round((minutes / 60) * 10) / 10,
      utilization_pct: maxWeekly > 0 ? Math.round((minutes / maxWeekly) * 100) : 0,
      max_weekly_hours: e.max_weekly_hours || 32,
    };
  });

  // Capacity indicators
  const weeklyJobCount = completedThisWeek.length;
  const weeklyEditingHours = Math.round((totalMinutesThisWeek / 60) * 10) / 10;

  let capacityIndicator = "NORMAL";
  if (weeklyJobCount >= 7 && weeklyEditingHours >= 24) capacityIndicator = "FIRST_EDITOR_HIRING_THRESHOLD";
  else if (weeklyJobCount >= 6 || weeklyEditingHours >= 20) capacityIndicator = "RECRUITMENT_CONSIDERATION";
  else if (weeklyJobCount >= 5) capacityIndicator = "WATCH";

  // High utilization warning
  const highUtilizationEditors = editorUtilization.filter((e: any) => e.utilization_pct >= 85);

  return {
    period_days: daysBack,
    completed_jobs_week: weeklyJobCount,
    completed_jobs_month: completedThisMonth.length,
    editing_tasks_week: completedThisWeek.length,
    editing_tasks_month: completedThisMonth.length,
    active_editing_hours_week: weeklyEditingHours,
    active_editing_hours_month: Math.round((totalMinutesThisMonth / 60) * 10) / 10,
    by_task_type: byTaskType,
    by_package: byPackage,
    by_editor: byEditor,
    avg_minutes_by_task_type: avgMinutesByTaskType,
    avg_minutes_by_package: avgMinutesByPackage,
    queue: {
      ready_for_editing: readyForEditing.length,
      in_editing: inEditing.length,
      submitted_for_qc: submittedForQc.length,
      revision_required: revisionRequired.length,
      approved: approved.length,
      backlog_hours: Math.round((backlogMinutes / 60) * 10) / 10,
      oldest_unassigned_age_hours: oldestUnassignedAgeHours,
    },
    quality: {
      revision_rate: revisionRate,
      first_pass_qc_approval_rate: firstPassRate,
      on_time_completion_rate: onTimeRate,
    },
    editor_utilization: editorUtilization,
    capacity: {
      indicator: capacityIndicator,
      weekly_job_count: weeklyJobCount,
      weekly_editing_hours: weeklyEditingHours,
      high_utilization_editors: highUtilizationEditors,
      active_editor_count: editors.length,
    },
  };
}