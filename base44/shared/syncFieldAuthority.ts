// Centralized field-authority rules for Arriv One ⇄ Estate Media sync.
// Defines which fields each application may write, and which are never synced.
// Keyed by CANONICAL entity type (see syncEntityAdapters.ts), not app-local names.

export const FIELD_AUTHORITY = {
  SalesTeamMember: {
    arrivOneAuthoritative: [
      "employment_status",
      "employment_classification",
      "compensation_type",
      "commission_plan_id",
      "commission_plan_version",
      "commission_rate",
      "commission_effective_date",
      "manager_id",
      "arriv_employee_id",
      "payroll_employee_id",
      "payroll_sync_status",
      "payroll_last_synced_at",
      "payroll_sync_error",
      "payroll_eligible",
    ],
    bidirectional: [
      "email",
      "full_name",
      "phone_number",
      "profile_picture_url",
      "chat_status",
      "title",
      "preferred_name",
      "personal_email",
      "mobile_phone_number",
    ],
    neverSync: [
      "password_hash",
      "force_password_change",
      "twilio_phone_number",
      "extension",
      "stripe_account_id",
      "stripe_onboarding_status",
      "stripe_payouts_enabled",
      "company_email",
    ],
  },
  Contact: {
    bidirectional: [
      "firstname",
      "lastname",
      "email",
      "phone",
      "company",
      "job_title",
      "lead_status",
      "lifecycle_stage",
      "social_media",
    ],
    arrivOneAuthoritative: [
      "owner_id",
      // ── Canonical Arriv One Customer360 intelligence fields ──
      // Arriv One is the canonical owner of customer intelligence.
      // Estate Media reads these via sync but must never write them.
      // PROFILE intelligence
      "engagement_score",
      "relationship_age_days",
      // RELATIONSHIP intelligence
      "communication_preferences",
      "preferred_contact_method",
      "relationship_health",
      "churn_risk",
      // SALES intelligence
      "next_best_action",
      "next_best_action_timing",
      "upsell_opportunities",
      "recommended_products",
      // AI SALES MEMORY
      "sales_memory",
      // LEARNING / recommendation outcomes
      "recommendation_outcomes",
      "recommendation_conversion_rate",
      "what_worked_previously",
      // Intelligence sync metadata
      "intelligence_synced_at",
      "intelligence_version",
    ],
  },
  Account: {
    bidirectional: [
      "name",
      "type",
      "email",
      "phone",
      "website",
      "address",
      "city",
      "state",
      "zip",
      "industry",
      "description",
      "lifecycle_stage",
      "hubspot_id",
    ],
    arrivOneAuthoritative: [
      "owner_id",
      // ── Canonical Arriv One Customer360 account-level intelligence ──
      "account_engagement_score",
      "account_lifetime_value",
      "account_buying_patterns",
      "account_relationship_health",
      "account_churn_risk",
      "account_next_best_action",
      "account_upsell_opportunities",
      "account_sales_memory",
      "account_intelligence_synced_at",
    ],
  },
  ActivityLog: {
    // Originating application authoritative — append/mirror, never overwrite
    bidirectional: [],
    arrivOneAuthoritative: [],
    neverSync: [],
  },
  Deal: {
    bidirectional: [
      "sales_member_id",
      "status",
      "contract_value",
      "title",
      "closed_at",
      "notes",
      "contact_id",
      "contact_name",
      "contact_email",
    ],
    arrivOneAuthoritative: [
      "amount_collected",
      "commission_plan_id",
      "commission_rate",
    ],
  },
  Meeting: {
    // DEFERRED — Conference entity not yet sync-enabled.
    // When activated: originating-app authoritative (mirror, never overwrite).
    bidirectional: [],
    arrivOneAuthoritative: [],
    neverSync: [
      "google_calendar_event_id",
      "room_name",
      "meeting_link",
      "channel_id",
    ],
  },
  SmsConversation: {
    bidirectional: [],
    arrivOneAuthoritative: [],
  },
  SmsMessage: {
    bidirectional: [],
    arrivOneAuthoritative: [],
    neverSync: ["twilio_sid"],
  },
  Goal: {
    // Canonical "Goal" → Estate Media local "SalesGoal"
    bidirectional: ["target", "target_value", "sales_member_id", "is_active"],
    arrivOneAuthoritative: ["metric", "period", "market"],
  },
  ManagerNote: {
    bidirectional: ["employee_id", "note", "author_id", "author_name", "note_type"],
    arrivOneAuthoritative: [],
  },
  Recognition: {
    // DEFERRED — Recognition is a ManagerNote subtype (is_recognition=true).
    // When activated: originating-app authoritative.
    bidirectional: [],
    arrivOneAuthoritative: [],
  },
  TimeOffRequest: {
    bidirectional: [
      "request_id", "employee_id", "employee_name",
      "leave_type", "start_date", "end_date",
      "is_partial_day", "hours_requested", "employee_note"
    ],
    arrivOneAuthoritative: ["status", "manager_name_actioned", "manager_note", "actioned_at"],
    neverSync: ["payroll_request_id", "payroll_sync_status", "payroll_sync_error"],
  },
  BenefitsLifeEvent: {
    bidirectional: [
      "life_event_id", "employee_id", "employee_name",
      "event_type", "event_date", "affected_benefits", "description"
    ],
    arrivOneAuthoritative: ["status", "payroll_reference"],
    neverSync: ["secure_workflow_url", "payroll_sync_status", "payroll_sync_error"],
  },
};

// Fields that must never be accepted from an inbound sync event, regardless of entity.
export const GLOBAL_NEVER_SYNC = [
  "password", "password_hash", "force_password_change",
  "twilio_phone_number", "extension",
  "stripe_account_id", "stripe_onboarding_status", "stripe_payouts_enabled",
  "company_email",
  "sync_source", "origin_event_id", "immutable_shared_id", "record_version",
];

/**
 * Strip sensitive fields from an inbound payload before writing to local DB.
 * Returns a cleaned payload with only fields the inbound source is allowed to write.
 * entityType is the CANONICAL entity type.
 */
export function applyInboundFieldAuthority(entityType, payload) {
  const rules = FIELD_AUTHORITY[entityType] || {};
  const allowed = new Set([
    ...(rules.bidirectional || []),
    ...(rules.arrivOneAuthoritative || []),
  ]);
  const never = new Set([...(rules.neverSync || []), ...GLOBAL_NEVER_SYNC]);
  const cleaned = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (never.has(key)) continue;
    if (key.startsWith("_")) continue; // skip metadata fields
    if (allowed.size === 0) {
      // Originating-app-authoritative entity: accept all non-sensitive fields
      cleaned[key] = value;
    } else if (allowed.has(key)) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Build an outbound payload with only fields Estate Media is allowed to send.
 * entityType is the CANONICAL entity type.
 */
export function buildOutboundPayload(entityType, recordData) {
  const rules = FIELD_AUTHORITY[entityType] || {};
  const never = new Set([...(rules.neverSync || []), ...GLOBAL_NEVER_SYNC]);
  const arrivOneAuth = new Set(rules.arrivOneAuthoritative || []);
  const payload = {};
  for (const [key, value] of Object.entries(recordData || {})) {
    if (never.has(key)) continue;
    if (arrivOneAuth.has(key)) continue; // Estate Media must not send Arriv One-authoritative fields
    if (key.startsWith("_")) continue;
    // Skip built-in fields
    if (["id", "created_date", "updated_date", "created_by_id"].includes(key)) continue;
    payload[key] = value;
  }
  return payload;
}

/**
 * Check if an inbound event is attempting to write Arriv One-authoritative fields.
 */
export function isArrivOneAuthoritativeField(entityType, fieldName) {
  const rules = FIELD_AUTHORITY[entityType] || {};
  return (rules.arrivOneAuthoritative || []).includes(fieldName);
}