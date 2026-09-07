// Frontend mirror of editing configuration constants.
// Authoritative source: base44/shared/packageEditingConfig.ts

export const EDITING_TASK_TYPES = [
  "photo_editing",
  "mls_walkthrough_edit",
  "cinematic_video_edit",
  "vertical_reel_edit",
  "drone_post",
  "twilight_edit",
  "ai_staging_edit",
  "3d_post_processing",
];

export const EDITING_TASK_LABELS = {
  photo_editing: "Photo Editing",
  mls_walkthrough_edit: "MLS Walkthrough Edit",
  cinematic_video_edit: "Cinematic Video Edit",
  vertical_reel_edit: "Vertical Reel Edit",
  drone_post: "Drone Post-Processing",
  twilight_edit: "Twilight Edit",
  ai_staging_edit: "AI Staging Edit (Digital)",
  "3d_post_processing": "3D Post-Processing",
};

export const EDITOR_CAPABILITIES = [
  "photo_editing",
  "mls_walkthrough_editing",
  "cinematic_video_editing",
  "vertical_reels",
  "drone_post",
  "twilight_editing",
  "ai_staging_editing",
  "3d_post_processing",
];

export const EDITOR_CAPABILITY_LABELS = {
  photo_editing: "Photo Editing",
  mls_walkthrough_editing: "MLS Walkthrough Editing",
  cinematic_video_editing: "Cinematic Video Editing",
  vertical_reels: "Vertical Reels",
  drone_post: "Drone Post-Processing",
  twilight_editing: "Twilight Editing",
  ai_staging_editing: "AI Staging Editing",
  "3d_post_processing": "3D Post-Processing",
};

export const STATUS_LABELS = {
  waiting_for_upload: "Waiting for Upload",
  ready_for_editing: "Ready for Editing",
  assigned: "Assigned",
  editing: "Editing",
  submitted_for_qc: "Submitted for QC",
  revision_required: "Revision Required",
  approved: "Approved",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Customer-facing status mapping (internal → customer-safe)
export const CUSTOMER_FACING_STATUS = {
  waiting_for_upload: "Capture Complete — Media Processing",
  ready_for_editing: "Media Processing",
  assigned: "Media Processing",
  editing: "Media Processing",
  submitted_for_qc: "Quality Review",
  revision_required: "Media Processing",
  approved: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};