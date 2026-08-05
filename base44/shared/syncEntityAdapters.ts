// Cross-app entity-name adapters and event-type registry.
// The event envelope uses canonical cross-app entity types, NOT app-local names.
// This module is the single source of truth for the canonical vocabulary.
//
// Both Arriv One and Estate Media must import the same canonical names.
// Local adapters translate between canonical and app-local entity names.

export const SIGNATURE_VERSION = "sync_hmac_v1";
export const ENVELOPE_SCHEMA_VERSION = "1.0.0";

// ─── Canonical entity-type vocabulary ───
// Canonical name → { estate_media_local, arriv_one_local, status }
// status: "active" | "deferred" | "reference_only"

export const ENTITY_ADAPTERS = {
  Contact: {
    canonical: "Contact",
    estate_media_local: "Contact",
    arriv_one_local: "Contact",
    status: "active",
  },
  ActivityLog: {
    canonical: "ActivityLog",
    estate_media_local: "ActivityLog",
    arriv_one_local: "ActivityLog",
    status: "active",
  },
  Deal: {
    canonical: "Deal",
    estate_media_local: "Deal",
    arriv_one_local: "Deal",
    status: "active",
  },
  Meeting: {
    canonical: "Meeting",
    estate_media_local: "Conference", // Estate Media stores meetings as Conference records
    arriv_one_local: "Meeting",
    status: "deferred", // Conference lacks sync metadata fields — deferred until schema updated
    deferred_reason: "Conference entity does not yet have record_version/sync_source/immutable_shared_id fields",
  },
  SmsConversation: {
    canonical: "SmsConversation",
    estate_media_local: "SmsConversation",
    arriv_one_local: "SmsConversation",
    status: "active",
  },
  SmsMessage: {
    canonical: "SmsMessage",
    estate_media_local: "SmsMessage",
    arriv_one_local: "SmsMessage",
    status: "active",
  },
  SalesTeamMember: {
    canonical: "SalesTeamMember",
    estate_media_local: "SalesTeamMember",
    arriv_one_local: "SalesTeamMember",
    status: "active",
  },
  Goal: {
    canonical: "Goal",
    estate_media_local: "SalesGoal", // Estate Media uses SalesGoal
    arriv_one_local: "Goal",
    status: "active",
  },
  ManagerNote: {
    canonical: "ManagerNote",
    estate_media_local: "ManagerNote",
    arriv_one_local: "ManagerNote",
    status: "active",
  },
  Recognition: {
    canonical: "Recognition",
    estate_media_local: "ManagerNote", // Recognition is a subtype: ManagerNote with is_recognition=true
    arriv_one_local: "Recognition",
    status: "deferred", // Requires filtered adapter — deferred until standalone Recognition entity or filter contract approved
    deferred_reason: "Recognition is a ManagerNote subtype (is_recognition=true); standalone adapter contract not yet approved",
  },
  TimeOffRequest: {
    canonical: "TimeOffRequest",
    estate_media_local: "TimeOffRequest",
    arriv_one_local: "TimeOffRequest",
    status: "active",
  },
  BenefitsLifeEvent: {
    canonical: "BenefitsLifeEvent",
    estate_media_local: "BenefitsLifeEvent",
    arriv_one_local: "BenefitsLifeEvent",
    status: "active",
  },
};

// Initial shared entity inventory — only "active" entities are in the initial sync set.
// Both apps must agree on this list before test exchange.
export const INITIAL_SHARED_ENTITIES = Object.entries(ENTITY_ADAPTERS)
  .filter(([, v]) => v.status === "active")
  .map(([k]) => k);

// Entities approved for destructive (hard-delete) synchronization.
// Empty by default — no entity is approved for hard-delete via sync.
// Contacts, activities, deals, meetings, SMS, workforce and audit records
// must NOT be silently hard-deleted.
export const DESTRUCTIVE_SYNC_APPROVED_ENTITIES = [];

// ─── Local → canonical resolution ───

export function toCanonicalEntityType(localEntityType) {
  const adapter = Object.values(ENTITY_ADAPTERS).find(
    (a) => a.estate_media_local === localEntityType || a.arriv_one_local === localEntityType
  );
  return adapter?.canonical || localEntityType;
}

export function toEstateMediaLocalEntityType(canonicalEntityType) {
  const adapter = ENTITY_ADAPTERS[canonicalEntityType];
  if (!adapter) return canonicalEntityType;
  if (adapter.status === "deferred") {
    throw new Error(`Entity ${canonicalEntityType} is deferred: ${adapter.deferred_reason}`);
  }
  return adapter.estate_media_local;
}

export function isEntitySyncReady(canonicalEntityType) {
  const adapter = ENTITY_ADAPTERS[canonicalEntityType];
  return adapter?.status === "active";
}

// ─── Event-type registry ───
// Canonical event types and their payload schema version + authority rule.
// authority: "originating" (originating app wins) | "bidirectional" | "arriv_one_authoritative"

export const EVENT_TYPE_REGISTRY = {
  "contact.created": { entity: "Contact", operation: "create", authority: "bidirectional", payload_schema: "1.0.0" },
  "contact.updated": { entity: "Contact", operation: "update", authority: "bidirectional", payload_schema: "1.0.0" },
  "contact.owner_changed": { entity: "Contact", operation: "update", authority: "arriv_one_authoritative", payload_schema: "1.0.0" },
  "activity.created": { entity: "ActivityLog", operation: "create", authority: "originating", payload_schema: "1.0.0" },
  "activity.updated": { entity: "ActivityLog", operation: "update", authority: "originating", payload_schema: "1.0.0" },
  "deal.created": { entity: "Deal", operation: "create", authority: "bidirectional", payload_schema: "1.0.0" },
  "deal.updated": { entity: "Deal", operation: "update", authority: "bidirectional", payload_schema: "1.0.0" },
  "meeting.created": { entity: "Meeting", operation: "create", authority: "originating", payload_schema: "1.0.0", status: "deferred" },
  "meeting.updated": { entity: "Meeting", operation: "update", authority: "originating", payload_schema: "1.0.0", status: "deferred" },
  "meeting.canceled": { entity: "Meeting", operation: "delete", authority: "originating", payload_schema: "1.0.0", status: "deferred", delete_behavior: "archive" },
  "sms.conversation.created": { entity: "SmsConversation", operation: "create", authority: "originating", payload_schema: "1.0.0" },
  "sms.conversation.updated": { entity: "SmsConversation", operation: "update", authority: "originating", payload_schema: "1.0.0" },
  "sms.message.created": { entity: "SmsMessage", operation: "create", authority: "originating", payload_schema: "1.0.0" },
  "sms.message.updated": { entity: "SmsMessage", operation: "update", authority: "originating", payload_schema: "1.0.0" },
  "sms.message.delivery_updated": { entity: "SmsMessage", operation: "update", authority: "originating", payload_schema: "1.0.0" },
  "member.created": { entity: "SalesTeamMember", operation: "create", authority: "bidirectional", payload_schema: "1.0.0" },
  "member.profile_updated": { entity: "SalesTeamMember", operation: "update", authority: "bidirectional", payload_schema: "1.0.0" },
  "member.status_updated": { entity: "SalesTeamMember", operation: "update", authority: "arriv_one_authoritative", payload_schema: "1.0.0" },
  "member.payroll_mapping_updated": { entity: "SalesTeamMember", operation: "update", authority: "arriv_one_authoritative", payload_schema: "1.0.0" },
  "goal.created": { entity: "Goal", operation: "create", authority: "bidirectional", payload_schema: "1.0.0" },
  "goal.updated": { entity: "Goal", operation: "update", authority: "bidirectional", payload_schema: "1.0.0" },
  "manager_note.created": { entity: "ManagerNote", operation: "create", authority: "originating", payload_schema: "1.0.0" },
  "manager_note.updated": { entity: "ManagerNote", operation: "update", authority: "originating", payload_schema: "1.0.0" },
  "recognition.created": { entity: "Recognition", operation: "create", authority: "originating", payload_schema: "1.0.0", status: "deferred" },
  "recognition.updated": { entity: "Recognition", operation: "update", authority: "originating", payload_schema: "1.0.0", status: "deferred" },
  "time_off.request_created": { entity: "TimeOffRequest", operation: "create", authority: "bidirectional", payload_schema: "1.0.0" },
  "time_off.request_updated": { entity: "TimeOffRequest", operation: "update", authority: "bidirectional", payload_schema: "1.0.0" },
  "time_off.status_changed": { entity: "TimeOffRequest", operation: "update", authority: "arriv_one_authoritative", payload_schema: "1.0.0" },
  "benefits.life_event_created": { entity: "BenefitsLifeEvent", operation: "create", authority: "bidirectional", payload_schema: "1.0.0" },
  "benefits.life_event_updated": { entity: "BenefitsLifeEvent", operation: "update", authority: "bidirectional", payload_schema: "1.0.0" },
  "manifest.published": { entity: null, operation: null, authority: "arriv_one_authoritative", payload_schema: "1.0.0", is_manifest: true },
};

// ─── Event-type construction (outbound) ───

export function getEventType(canonicalEntityType, operation, changedFields = []) {
  // Special event types
  if (canonicalEntityType === "Contact" && operation === "update" && changedFields.includes("owner_id")) {
    return "contact.owner_changed";
  }
  if (canonicalEntityType === "SalesTeamMember" && operation === "update") {
    if (changedFields.includes("employment_status") || changedFields.includes("employment_classification")) {
      return "member.status_updated";
    }
    if (changedFields.includes("payroll_employee_id") || changedFields.includes("payroll_sync_status")) {
      return "member.payroll_mapping_updated";
    }
    return "member.profile_updated";
  }
  if (canonicalEntityType === "TimeOffRequest") {
    if (operation === "create") return "time_off.request_created";
    if (operation === "update" && changedFields.includes("status")) return "time_off.status_changed";
    return "time_off.request_updated";
  }
  if (canonicalEntityType === "BenefitsLifeEvent") {
    return operation === "create" ? "benefits.life_event_created" : "benefits.life_event_updated";
  }
  if (canonicalEntityType === "SmsMessage" && operation === "update" && changedFields.includes("twilio_sid")) {
    return "sms.message.delivery_updated";
  }
  if (canonicalEntityType === "Meeting") {
    if (operation === "delete") return "meeting.canceled";
    return operation === "create" ? "meeting.created" : "meeting.updated";
  }
  if (canonicalEntityType === "Recognition") {
    return operation === "create" ? "recognition.created" : "recognition.updated";
  }

  const prefix = canonicalEntityType.toLowerCase();
  const opMap = { create: "created", update: "updated", delete: "deleted" };
  return `${prefix}.${opMap[operation] || operation}`;
}

export function resolveEventType(eventType) {
  return EVENT_TYPE_REGISTRY[eventType] || null;
}