// Centralized canonical-to-local field adapter registry for inbound sync.
// Translates canonical field names to Estate Media local field names and
// resolves cross-app reference IDs through CrossAppRecordMapping.
//
// This module is the single source of truth for canonical → local field
// mapping on the Estate Media receiving side. Arriv One sends canonical
// field names; Estate Media translates them here before local validation.
//
// See syncEntityAdapters.ts for entity-name mapping.
// See syncFieldAuthority.ts for sensitive-field stripping.

import { findMappingByRemoteId, naturalKeyMatch } from "./syncMapping.ts";

// ─── Field name maps ───
// Canonical field name → local field name (only where they differ).
// Fields not listed here pass through with the same name.

const FIELD_NAME_MAPS = {
  Goal: {
    target: "target_value",
  },
  ManagerNote: {
    employee_id: "sales_member_id",
    note: "content",
  },
};

// ─── Reference fields ───
// Canonical field → { refEntityType, localField }
// These fields contain a remote (Arriv One) record ID that must be resolved
// to a local Estate Media record ID via CrossAppRecordMapping before write.

const REFERENCE_FIELDS = {
  ActivityLog: {
    sales_member_id: { refEntityType: "SalesTeamMember", localField: "sales_member_id" },
  },
  Contact: {
    owner_id: { refEntityType: "SalesTeamMember", localField: "owner_id" },
  },
  Deal: {
    sales_member_id: { refEntityType: "SalesTeamMember", localField: "sales_member_id" },
    contact_id: { refEntityType: "Contact", localField: "contact_id" },
  },
  Goal: {
    sales_member_id: { refEntityType: "SalesTeamMember", localField: "sales_member_id" },
  },
  ManagerNote: {
    employee_id: { refEntityType: "SalesTeamMember", localField: "sales_member_id" },
  },
  TimeOffRequest: {
    employee_id: { refEntityType: "SalesTeamMember", localField: "employee_id" },
  },
  BenefitsLifeEvent: {
    employee_id: { refEntityType: "SalesTeamMember", localField: "employee_id" },
  },
};

// ─── Sync defaults ───
// Default values applied to sync-created local records.
// Ensures mirrored records start in a safe, non-authenticating state.

const SYNC_DEFAULTS = {
  ManagerNote: {
    is_recognition: false,
  },
  SalesTeamMember: {
    is_active: false,
    role: "user",
    employment_status: "pending_offer",
  },
  TimeOffRequest: {
    status: "pending",
  },
  BenefitsLifeEvent: {
    status: "pending",
  },
};

// ─── Entity-specific sensitive fields ───
// Stripped in addition to the global never_sync list in syncFieldAuthority.ts.
// These must never be accepted from an inbound sync event.

const ENTITY_SENSITIVE_FIELDS = {
  SalesTeamMember: [
    "password_hash", "force_password_change",
    "twilio_phone_number", "extension",
    "stripe_account_id", "stripe_onboarding_status", "stripe_payouts_enabled",
    "company_email",
  ],
  TimeOffRequest: [
    "payroll_request_id", "payroll_sync_status", "payroll_sync_error",
  ],
  BenefitsLifeEvent: [
    "secure_workflow_url", "payroll_sync_status", "payroll_sync_error",
    "payroll_reference",
  ],
};

// ─── Translate canonical payload to local payload ───
// Steps:
//   1. Strip entity-specific sensitive fields.
//   2. Resolve reference fields via CrossAppRecordMapping.
//   3. Map canonical field names to local field names.
//   4. Apply sync defaults for missing local fields.
//   5. Resolve denormalized employee_name where applicable.

export async function translateCanonicalToLocal(base44, tenantId, canonicalEntityType, canonicalPayload) {
  const nameMap = FIELD_NAME_MAPS[canonicalEntityType] || {};
  const refFields = REFERENCE_FIELDS[canonicalEntityType] || {};
  const defaults = SYNC_DEFAULTS[canonicalEntityType] || {};
  const sensitive = new Set(ENTITY_SENSITIVE_FIELDS[canonicalEntityType] || []);

  const localPayload = {};

  for (const [canonKey, value] of Object.entries(canonicalPayload || {})) {
    // Skip entity-specific sensitive fields
    if (sensitive.has(canonKey)) continue;

    // Resolve reference fields via CrossAppRecordMapping
    if (refFields[canonKey]) {
      const { refEntityType, localField } = refFields[canonKey];
      let resolvedId = await resolveReference(base44, tenantId, refEntityType, value);
      // Fallback: resolve SalesTeamMember by denormalized email when no mapping exists.
      // Without this, the raw Arriv One UUID would be written as sales_member_id and
      // per-rep RLS (data.sales_member_id === {{user.data.sales_member_id}}) would hide
      // the record from every rep.
      if (!resolvedId && refEntityType === "SalesTeamMember") {
        const emailKey = { sales_member_id: "sales_member_email", owner_id: "owner_email", employee_id: "employee_email" }[canonKey];
        const email = emailKey ? canonicalPayload[emailKey] : null;
        if (email) {
          const member = await naturalKeyMatch(base44, "SalesTeamMember", { email });
          resolvedId = member?.id || null;
        }
      }
      localPayload[localField] = resolvedId || null;
      continue;
    }

    // Map field name if needed, otherwise keep as-is
    const localKey = nameMap[canonKey] || canonKey;
    localPayload[localKey] = value;
  }

  // Apply defaults for missing fields
  for (const [key, value] of Object.entries(defaults)) {
    if (localPayload[key] === undefined) {
      localPayload[key] = value;
    }
  }

  // Derive local login gate (is_active) from canonical employment_status
  // for SalesTeamMember. Arriv One is authoritative for employment_status
  // (member.status_updated), but does not send is_active — it is an
  // Estate Media-local login flag. Mirror the canonical status so an
  // activation in Arriv One unlocks login here, and a termination locks it.
  if (canonicalEntityType === "SalesTeamMember" && localPayload.employment_status) {
    if (["offer_accepted", "active"].includes(localPayload.employment_status)) {
      localPayload.is_active = true;
    } else if (localPayload.employment_status === "terminated") {
      localPayload.is_active = false;
    }
    // "pending_offer" / "on_leave" — leave is_active unchanged
  }

  // Resolve denormalized employee_name for workforce entities
  await resolveEmployeeName(base44, canonicalEntityType, localPayload);

  return localPayload;
}

async function resolveReference(base44, tenantId, refEntityType, remoteId) {
  if (!remoteId) return null;
  const mapping = await findMappingByRemoteId(base44, tenantId, refEntityType, remoteId);
  return mapping?.local_record_id || null;
}

async function resolveEmployeeName(base44, canonicalEntityType, localPayload) {
  const needsName = ["TimeOffRequest", "BenefitsLifeEvent"].includes(canonicalEntityType);
  if (!needsName) return;
  if (localPayload.employee_name) return; // already provided by source
  const memberId = localPayload.employee_id;
  if (!memberId) return;
  try {
    const member = await base44.asServiceRole.entities.SalesTeamMember.get(memberId);
    if (member?.full_name) localPayload.employee_name = member.full_name;
  } catch (_e) {
    // denormalized field is optional — ignore lookup failure
  }
}

// ─── Adapter registry documentation ───
// Exported for documentation / validation tools.

export const FIELD_ADAPTER_REGISTRY = {
  Deal: {
    fieldMap: {},
    references: REFERENCE_FIELDS.Deal,
    defaults: {},
  },
  SalesTeamMember: {
    fieldMap: {},
    references: {},
    defaults: SYNC_DEFAULTS.SalesTeamMember,
    sensitive: ENTITY_SENSITIVE_FIELDS.SalesTeamMember,
  },
  Goal: {
    fieldMap: FIELD_NAME_MAPS.Goal,
    references: REFERENCE_FIELDS.Goal,
    defaults: {},
  },
  ManagerNote: {
    fieldMap: FIELD_NAME_MAPS.ManagerNote,
    references: REFERENCE_FIELDS.ManagerNote,
    defaults: SYNC_DEFAULTS.ManagerNote,
  },
  TimeOffRequest: {
    fieldMap: {},
    references: REFERENCE_FIELDS.TimeOffRequest,
    defaults: SYNC_DEFAULTS.TimeOffRequest,
    sensitive: ENTITY_SENSITIVE_FIELDS.TimeOffRequest,
  },
  BenefitsLifeEvent: {
    fieldMap: {},
    references: REFERENCE_FIELDS.BenefitsLifeEvent,
    defaults: SYNC_DEFAULTS.BenefitsLifeEvent,
    sensitive: ENTITY_SENSITIVE_FIELDS.BenefitsLifeEvent,
  },
};