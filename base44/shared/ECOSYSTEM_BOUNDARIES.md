# Arriv Ecosystem Architecture Boundaries

> **Guardrail document.** This file defines the canonical ownership boundaries
> for the Arriv ecosystem. All future development MUST respect these boundaries.

## The Three Canonical Applications

| Application | Domain | Ownership |
|---|---|---|
| **Khetha IQ** | Recruiting intelligence | Hiring pipeline, candidates, interviews, offers, talent sourcing |
| **Arriv One** | Core CRM & workforce | Contacts, accounts, deals, activities, employees, payroll, billing, customer intelligence |
| **Estate Media** | Vertical marketplace | Jobs, bookings, shoots, deliverables, media specialist marketplace, payouts, ratings |

## Boundary Rules

### 1. Khetha IQ Cannot Create or Modify

- Contact, Account, Deal, Invoice
- SalesTeamMember (employee records)
- PayrollPeriod, PayrollSubmission, PayrollReconciliation (payroll records)
- Commission, CommissionPlan (commission records)
- Job, Booking, MediaSpecialistRating (marketplace records)

**Khetha owns:** HireCandidate, HireJob, InterviewSession, RecruitingProspect, RecruitingSearch, TalentPipeline, OfferLetter, and all recruiting intelligence.

### 2. Arriv One Cannot Create or Modify

- HireCandidate, HireJob, HireInterview
- InterviewSession, InterviewResponse
- RecruitingProspect, RecruitingSearch, RecruitingTask, TalentPipeline
- RecruitingActivity, RecruitingSettings
- AsyncInterviewConversionBatch, TavusInterviewTranscript
- VideoRecording, OfferLetter

**Arriv One owns:** Contact, Account, Deal, ActivityLog, SalesTeamMember, SalesGoal, Commission, PayrollPeriod, Invoice, PaymentStatement, ProductManifest, and all CRM/billing/employee data.

### 3. Estate Media Cannot Create Duplicate

- CRM systems (must use Arriv One's Contact, Account, Deal, ActivityLog via sync)
- Employee systems (must use Arriv One's SalesTeamMember via sync)
- Customer intelligence systems (must consume Arriv One's Customer360 data)
- Recruiting systems (must use Khetha IQ's HireCandidate, HireJob via sync)

**Estate Media owns:** Job, Booking, ScheduledBooking, PayoutHistory, MediaSpecialistRating, JobApplication, FieldProspect, CustomerRecovery, Referral, ProductTruth, and all vertical marketplace operations.

### 4. Identity Reconciliation Channels

All shared identities MUST flow through these channels. Direct entity duplication is prohibited:

| Channel | Purpose |
|---|---|
| `Person` entity | Canonical identity with `shared_person_id` linking all roles |
| `shared_person_id` | Immutable cross-system person identifier |
| `CrossAppRecordMapping` | Entity-level record ID mapping between apps |
| `immutable_shared_id` | Per-record immutable cross-app identifier (on synced records) |

## Enforcement

Boundary validation is enforced at sync entry points:

- **`receiveArrivOneSyncEvent`** — rejects Arriv One events for Khetha-owned entities
- **`receiveKhethaIQHireEvent`** — rejects Khetha events for non-recruiting entities

Validation logic lives in `base44/shared/ecosystemBoundaries.ts`.

## Principles

1. **A vertical feature must never replace a core Arriv One feature.**
2. **A core Arriv One feature must never remove a vertical workflow.**
3. **Khetha IQ is recruiting intelligence only — no CRM, no billing, no payroll.**
4. **Arriv One is CRM/workforce only — no recruiting, no marketplace operations.**
5. **Estate Media is marketplace only — no duplicate CRM, no duplicate recruiting.**
6. **All cross-app identity flows through Person + shared_person_id + CrossAppRecordMapping.**