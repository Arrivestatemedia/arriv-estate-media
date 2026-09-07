// ============================================================================
// PACKAGE → EDITING TASK CONFIGURATION
// Authoritative mapping from capture packages/add-ons to editing task types.
// One capture job → one Media Partner. Post-production may generate multiple
// editing tasks distributed among Arriv employee editors.
// ============================================================================

export const EDITING_TASK_TYPES = [
  "photo_editing",
  "mls_walkthrough_edit",
  "cinematic_video_edit",
  "vertical_reel_edit",
  "drone_post",
  "twilight_edit",
  "ai_staging_edit",
  "3d_post_processing",
] as const;

export type EditingTaskType = (typeof EDITING_TASK_TYPES)[number];

/** Human-readable labels for each editing task type. */
export const EDITING_TASK_LABELS: Record<string, string> = {
  photo_editing: "Photo Editing",
  mls_walkthrough_edit: "MLS Walkthrough Edit",
  cinematic_video_edit: "Cinematic Video Edit",
  vertical_reel_edit: "Vertical Reel Edit",
  drone_post: "Drone Post-Processing",
  twilight_edit: "Twilight Edit",
  ai_staging_edit: "AI Staging Edit (Digital)",
  "3d_post_processing": "3D Post-Processing",
};

/** Editor capabilities (distinct from capture capabilities). */
export const EDITOR_CAPABILITIES = [
  "photo_editing",
  "mls_walkthrough_editing",
  "cinematic_video_editing",
  "vertical_reels",
  "drone_post",
  "twilight_editing",
  "ai_staging_editing",
  "3d_post_processing",
] as const;

export const EDITOR_CAPABILITY_LABELS: Record<string, string> = {
  photo_editing: "Photo Editing",
  mls_walkthrough_editing: "MLS Walkthrough Editing",
  cinematic_video_editing: "Cinematic Video Editing",
  vertical_reels: "Vertical Reels",
  drone_post: "Drone Post-Processing",
  twilight_editing: "Twilight Editing",
  ai_staging_editing: "AI Staging Editing",
  "3d_post_processing": "3D Post-Processing",
};

/** Maps each editing task type to the verified editor capability required. */
export const TASK_TYPE_REQUIRED_CAPABILITY: Record<string, string> = {
  photo_editing: "photo_editing",
  mls_walkthrough_edit: "mls_walkthrough_editing",
  cinematic_video_edit: "cinematic_video_editing",
  vertical_reel_edit: "vertical_reels",
  drone_post: "drone_post",
  twilight_edit: "twilight_editing",
  ai_staging_edit: "ai_staging_editing",
  "3d_post_processing": "3d_post_processing",
};

/**
 * Package → editing task types generated.
 * Based on canonical Estate Media package deliverables.
 */
export const PACKAGE_EDITING_TASKS: Record<string, string[]> = {
  mls_walkthrough: ["mls_walkthrough_edit"],
  photo_essentials: ["photo_editing", "vertical_reel_edit"],
  photo_cinematic: ["photo_editing", "cinematic_video_edit", "vertical_reel_edit", "vertical_reel_edit"],
  premium_bundle: ["photo_editing", "cinematic_video_edit", "vertical_reel_edit", "vertical_reel_edit", "3d_post_processing"],
};

/**
 * Add-on → additional editing task types.
 */
export const ADDON_EDITING_TASKS: Record<string, string[]> = {
  drone: ["drone_post"],
  "3d_tour": ["3d_post_processing"],
  twilight: ["twilight_edit"],
  ai_staging: ["ai_staging_edit"],
  vertical_reel: ["vertical_reel_edit"],
  rush_delivery: [],
};

/**
 * Default SLA hours (from source-ready to delivery) per task type.
 * Used to calculate delivery_deadline. Configurable; replace with real
 * historical averages once sufficient production data exists.
 */
export const TASK_TYPE_SLA_HOURS: Record<string, number> = {
  photo_editing: 24,
  mls_walkthrough_edit: 24,
  cinematic_video_edit: 48,
  vertical_reel_edit: 24,
  drone_post: 24,
  twilight_edit: 24,
  ai_staging_edit: 48,
  "3d_post_processing": 48,
};

/** Rush delivery reduces SLA to this many hours (applied per task). */
export const RUSH_SLA_HOURS = 12;

/** QC buffer hours (reserved between editing completion and delivery deadline). */
export const QC_BUFFER_HOURS = 6;

/**
 * Generate the full list of editing task types for a booking's package + add-ons.
 * Returns an array of { task_type, task_index } entries.
 */
export function generateEditingTasksForOrder(
  packageId: string,
  addOnIds: string[] = [],
  isRush: boolean = false
): { task_type: string; task_index: number }[] {
  const pkgTasks = PACKAGE_EDITING_TASKS[packageId] || [];
  const addonTasks = addOnIds.flatMap((id) => ADDON_EDITING_TASKS[id] || []);

  // Merge and count duplicates for indexing
  const allTasks = [...pkgTasks, ...addonTasks];
  const taskCounts: Record<string, number> = {};
  const result: { task_type: string; task_index: number }[] = [];

  for (const taskType of allTasks) {
    taskCounts[taskType] = (taskCounts[taskType] || 0) + 1;
    result.push({ task_type: taskType, task_index: taskCounts[taskType] });
  }

  // Rush doesn't add a task type but affects priority/SLA (handled by caller)
  void isRush;
  return result;
}

/**
 * Calculate the delivery deadline for a task based on its type and rush status.
 * Returns an ISO timestamp.
 */
export function calculateDeliveryDeadline(
  taskType: string,
  isRush: boolean,
  fromTime: Date = new Date()
): Date {
  const baseHours = TASK_TYPE_SLA_HOURS[taskType] ?? 24;
  const slaHours = isRush ? RUSH_SLA_HOURS : baseHours;
  const editingHours = Math.max(slaHours - QC_BUFFER_HOURS, 2);
  void editingHours; // editing_deadline = delivery_deadline - QC_BUFFER_HOURS (computed by caller)
  return new Date(fromTime.getTime() + slaHours * 60 * 60 * 1000);
}

/**
 * Calculate the internal editing deadline (before QC buffer).
 */
export function calculateEditingDeadline(
  taskType: string,
  isRush: boolean,
  fromTime: Date = new Date()
): Date {
  const baseHours = TASK_TYPE_SLA_HOURS[taskType] ?? 24;
  const slaHours = isRush ? RUSH_SLA_HOURS : baseHours;
  const editingHours = Math.max(slaHours - QC_BUFFER_HOURS, 2);
  return new Date(fromTime.getTime() + editingHours * 60 * 60 * 1000);
}

/**
 * Determine SLA status based on deadline and current time.
 */
export function calculateSlaStatus(deadline: string | Date | null): string {
  if (!deadline) return "on_track";
  const dl = new Date(deadline);
  const now = new Date();
  const hoursRemaining = (dl.getTime() - now.getTime()) / (60 * 60 * 1000);

  if (hoursRemaining < 0) return "overdue";
  if (hoursRemaining < 3) return "at_risk";
  if (hoursRemaining < 6) return "due_soon";
  return "on_track";
}