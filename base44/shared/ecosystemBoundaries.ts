// ecosystemBoundaries.ts
// Canonical ownership boundaries for the Arriv ecosystem.
//
// The Arriv ecosystem has three canonical applications with strict ownership:
//
//   Khetha IQ      → recruiting intelligence only
//   Arriv One      → CRM, Customer360, employees, workforce, billing, customer intelligence
//   Estate Media   → vertical marketplace operations (jobs, bookings, shoots, deliverables, payouts)
//
// These boundaries prevent future development from violating ownership.
// A vertical feature must never replace a core Arriv One feature.
// A core Arriv One feature must never remove a vertical workflow.
//
// All shared identities MUST continue through:
//   - Person entity (shared_person_id)
//   - CrossAppRecordMapping (entity-level record mapping)
//   - immutable_shared_id (per-record cross-app identifier)
//
// This module is imported by sync receivers to validate inbound events.

// ─── Khetha IQ owned entities (recruiting intelligence) ───
// Only Khetha IQ may create or modify these. Arriv One and Estate Media
// may READ synced copies but must not write to them via sync.
export const KHETHA_IQ_OWNED_ENTITIES = [
  "HireCandidate",
  "HireJob",
  "HireInterview",
  "HirePerformance",
  "InterviewSession",
  "InterviewResponse",
  "RecruitingProspect",
  "RecruitingSearch",
  "RecruitingTask",
  "TalentPipeline",
  "RecruitingActivity",
  "RecruitingSettings",
  "AsyncInterviewConversionBatch",
  "TavusInterviewTranscript",
  "VideoRecording",
  "OfferLetter",
];

// ─── Arriv One owned entities (CRM, employees, billing, customer intelligence) ───
// Arriv One is the canonical owner. Estate Media holds synced local copies
// and may create/update via bidirectional sync, but Arriv One owns
// lifecycle stage, ownership changes, and employment status.
export const ARRIV_ONE_OWNED_ENTITIES = [
  "Contact",
  "Account",
  "Deal",
  "ActivityLog",
  "SalesTeamMember",
  "SalesGoal",
  "ManagerNote",
  "TimeOffRequest",
  "BenefitsLifeEvent",
  "Commission",
  "CommissionPlan",
  "CommissionPlanVersion",
  "CommissionAdjustment",
  "CommissionSourceRecord",
  "SalesCompensationEvent",
  "PayrollPeriod",
  "PayrollSubmission",
  "PayrollReconciliation",
  "PayrollEnrollmentSession",
  "PayrollReadinessEvent",
  "EmployeeSyncQueue",
  "Invoice",
  "PaymentStatement",
  "ProductManifest",
];

// ─── Estate Media owned entities (vertical marketplace operations) ───
// Estate Media is the domain authority. These are vertical-specific and
// must not be replaced by core Arriv One or Khetha IQ systems.
export const ESTATE_MEDIA_OWNED_ENTITIES = [
  "Job",
  "Booking",
  "ScheduledBooking",
  "PayoutHistory",
  "MediaSpecialistRating",
  "JobApplication",
  "PendingSignup",
  "ClientSignupInvite",
  "FieldProspect",
  "CustomerRecovery",
  "Referral",
  "ReferralCreditLedger",
  "BonusMilestone",
  "DiscountApproval",
  "WorkSession",
  "ProductTruth",
  "CultureBanner",
  "BookingChangeRequest",
  "ClosingDetection",
];

// ─── Forbidden cross-app operations ───
// Arriv One is FORBIDDEN from creating or modifying recruiting entities.
// These belong to Khetha IQ. Arriv One has no authority over recruiting.
export const ARRIV_ONE_FORBIDDEN_ENTITIES = new Set(KHETHA_IQ_OWNED_ENTITIES);

// Khetha IQ is FORBIDDEN from creating or modifying CRM, billing, employee,
// payroll, or marketplace entities. Khetha owns recruiting intelligence only.
export const KHETHA_FORBIDDEN_ENTITIES = new Set([
  ...ARRIV_ONE_OWNED_ENTITIES,
  ...ESTATE_MEDIA_OWNED_ENTITIES,
]);

// ─── Identity reconciliation channels ───
// All shared identities MUST flow through these channels. Direct entity
// duplication across apps is prohibited.
export const IDENTITY_RECONCILIATION_CHANNELS = [
  "Person",                // Canonical identity entity with shared_person_id
  "shared_person_id",      // Immutable cross-system person identifier
  "CrossAppRecordMapping", // Entity-level record mapping between apps
  "immutable_shared_id",   // Per-record immutable cross-app identifier
];

// ─── Validation functions ───

/**
 * Check if an entity type would be a boundary violation for the given source app.
 * Returns a violation reason string if violated, null if allowed.
 */
export function getBoundaryViolation(sourceApp, entityType) {
  if (!entityType) return null;

  if (sourceApp === "arriv_one" && ARRIV_ONE_FORBIDDEN_ENTITIES.has(entityType)) {
    return {
      violated: true,
      reason: `BOUNDARY VIOLATION: Arriv One cannot create or modify "${entityType}" — this entity is owned by Khetha IQ (recruiting intelligence). Use shared_person_id and CrossAppRecordMapping for identity reconciliation.`,
      code: "arriv_one_boundary_violation",
      owned_by: "khetha_iq",
    };
  }

  if (sourceApp === "khetha_iq" && KHETHA_FORBIDDEN_ENTITIES.has(entityType)) {
    return {
      violated: true,
      reason: `BOUNDARY VIOLATION: Khetha IQ cannot create or modify "${entityType}" — this entity is owned by Arriv One (CRM/billing/employees) or Estate Media (marketplace operations). Use shared_person_id and CrossAppRecordMapping for identity reconciliation.`,
      code: "khetha_boundary_violation",
      owned_by: ARRIV_ONE_OWNED_ENTITIES.includes(entityType) ? "arriv_one" : "estate_media",
    };
  }

  return { violated: false, reason: null, code: null, owned_by: null };
}

/**
 * Check if a Khetha IQ event type is within recruiting boundaries.
 * Khetha may only send recruiting-related events.
 */
export const KHETHA_ALLOWED_EVENT_TYPES = new Set([
  "candidate.hired",
  "candidate.updated",
  "candidate.status_changed",
  "interview.completed",
  "offer.extended",
  "offer.responded",
]);

export function isKhethaEventAllowed(eventType) {
  return KHETHA_ALLOWED_EVENT_TYPES.has(eventType);
}