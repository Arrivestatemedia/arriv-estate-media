// ProductManifest safe local fallbacks.
//
// Each canonical manifest entry type has a known-safe local default that the
// Estate Media runtime falls back to when:
//   - no manifest is stored
//   - no compatible manifest exists
//   - checksum validation fails
//   - the accessor temporarily fails
//
// These fallbacks represent the EXISTING hardcoded behavior prior to Phase 7B.2.
// They are the safety net: canonical configuration is additive, not destructive.
// Fallback usage is always observable via telemetry (fallback_used = true).

export const EM_RUNTIME_VERSION = "7.2.0";

export const MANIFEST_ENTRY_TYPES = [
  "ai_followup_rules",
  "daily_call_queue_config",
  "call_map_schema",
  "metric_definitions",
  "crm_statuses",
  "prospecting_config",
  "communication_rules",
  "label_overrides",
  "nav_config",
  "video_config",
  "voice_config",
  "onboarding_config",
] as const;

export type ManifestEntryType = (typeof MANIFEST_ENTRY_TYPES)[number];

// Safe local defaults per entry type.
// These are the EXISTING known-safe local defaults — NOT canonical AO config.
// When a manifest is missing/incompatible, the runtime uses these.
export const MANIFEST_FALLBACKS: Record<string, any> = {
  label_overrides: {
    labels: {},
    description: "No label overrides — UI uses existing hardcoded labels",
  },
  nav_config: {
    sections: [],
    description: "No nav overrides — Layout uses existing hardcoded nav items",
  },
  crm_statuses: {
    lead_statuses: [
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "OPEN_DEAL",
      "UNQUALIFIED",
      "ATTEMPTED_TO_CONTACT",
      "CONNECTED",
      "BAD_TIMING",
    ],
    lifecycle_stages: [
      "subscriber",
      "lead",
      "mql",
      "sql",
      "opportunity",
      "customer",
    ],
    deal_statuses: ["open", "won", "lost", "paid"],
    description: "Existing hardcoded CRM status definitions",
  },
  communication_rules: {
    rules: {},
    description: "No communication rule overrides — existing sending behavior applies",
  },
  prospecting_config: {
    config: {},
    description: "No prospecting overrides — existing realtor targeting applies",
  },
  daily_call_queue_config: {
    config: {},
    description: "No queue config overrides — existing DailyCallQueue behavior applies",
  },
  ai_followup_rules: {
    rules: {},
    description: "No AI follow-up rule overrides — existing AI behavior applies",
  },
  call_map_schema: {
    schema: {},
    description: "No call-map schema overrides — existing call-map implementation applies",
  },
  metric_definitions: {
    metrics: {},
    description: "No metric definition overrides — existing performance engine applies",
  },
  video_config: {
    config: {},
    description: "No video config overrides — existing video implementation applies",
  },
  voice_config: {
    config: {},
    description: "No voice config overrides — existing voice/Twilio implementation applies",
  },
  onboarding_config: {
    config: {},
    description: "No onboarding config overrides — existing onboarding implementation applies",
  },
};

export function getFallback(entryType: string): any {
  return MANIFEST_FALLBACKS[entryType] || { description: `No fallback defined for ${entryType}` };
}