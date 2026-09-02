# Arriv Estate Media — Architecture Reconciliation Audit

**Date:** 2026-09-02
**Goal:** Reconcile Estate Media with canonical Arriv One and Khetha IQ architecture. Do not fork either platform.

---

## Summary

Estate Media is a **vertical operating system built on top of Arriv One and Khetha IQ**. The reconciliation confirms the app already follows the canonical architecture via manifest convergence and cross-app sync. Two gaps were identified and fixed:

1. **Unified Person entity** — created (`base44/entities/Person.jsonc`) with resolution logic (`base44/shared/personModel.ts`, `base44/functions/resolvePerson`)
2. **Customer 360 completeness** — enhanced with Documents, Video Calls, Products Purchased, and Account Relationship History tabs

---

## KHETHA IQ — Reconciled ✅

**Principle:** Estate Media recruiting must use the canonical Khetha system. Do not create separate recruiting logic.

**Current state:** ALIGNED. No duplicate recruiting logic exists.

| Khetha Feature | Estate Media Implementation | Canonical? |
|---|---|---|
| Jobs | `HireJob` entity, `JobCreateForm`, `JobDetailPanel` | ✅ Same entity |
| Candidates | `HireCandidate` entity, `CandidateDetailPanel` | ✅ Same entity |
| Sourcing | `RecruitingChat`, `RecruitingSearch`, `recruitingSearchProvider.ts` | ✅ Same logic |
| Recruiting Assistant | `RecruitingAssistantHome`, `RecruitingPanel` | ✅ Same |
| Interviews | `Conference` entity, `InterviewSchedulerModal` | ✅ Same entity |
| AI Interviews | Tavus CVI ("Ashley"), `createTavusInterviewConversation` | ✅ Same |
| Async Interviews | `InterviewSession`, `inviteToAsyncInterview` | ✅ Same |
| Scorecards | `Round1ScorecardForm`, `Round2ScorecardForm`, `scorecardScoring.js` | ✅ Same |
| Offers | `OffersView`, `SalesOfferCard`, `respondToOffer` | ✅ Same |
| Applicant Portal | `ApplicantPortalPanel`, `ApplicationPortal` | ✅ Same |
| Background Checks | `initiateBackgroundCheck`, `handleCheckrWebhook` | ✅ Same |
| References | `ApplicantReference`, `submitApplicantReferences`, `sendReferenceCheckEmail` | ✅ Same |
| Learning Loop | `LearningPanel` | ✅ Same |

**Manifest convergence:** Estate Media fetches its UI config (tabs, labels, logo) from the central KhethaIQ app via `getKhethaIQManifest`. Local components render but adopt the central app's tab structure. This is NOT a fork — it's a synchronized mirror.

**Sync:** `syncApplicationToKhethaIQ` syncs Estate Media applications to central KhethaIQ as `HireCandidate` records. `receiveKhethaIQHireEvent` receives hire events back.

**Allowed Estate Media differences (vertical):**
- Media Specialist role profiles
- Photographer requirements (portfolio, equipment, drone certification)
- These are stored as role-specific fields on `HireCandidate.target_role` and `JobApplication.position` — NOT as separate recruiting logic

---

## ARRIV ONE — Reconciled ✅

**Principle:** Estate Media Arriv One must match Arriv One. Use canonical employees, teams, permissions, CRM, sales, communication, training, certifications, performance, goals.

**Current state:** ALIGNED. No duplicate CRM/sales system exists.

| Arriv One Feature | Estate Media Implementation | Canonical? |
|---|---|---|
| Employees | `SalesTeamMember` entity with `arriv_employee_id`, `immutable_shared_id` | ✅ Synced |
| Teams | `SalesTeamMember.role`, `department`, `manager_id` | ✅ Same |
| Permissions | `role: admin/user`, RLS on entities | ✅ Same |
| CRM | `Contact` entity with `immutable_shared_id`, `sync_source` | ✅ Synced |
| Sales | `HubSpotActivityLog` (CRM workspace) | ✅ Same |
| Communication | Twilio (calls/SMS), Gmail, SendEmail | ✅ Same |
| Training | `TrainingModule`, `SalesCertification`, `TrainingAttempt` | ✅ Same |
| Certifications | `SalesCertification` with calling authorization | ✅ Same |
| Performance | `computeSalesPerformance`, `SalesPerformanceDashboard` | ✅ Same |
| Goals | `SalesGoal` entity, `GoalManager` | ✅ Same |

**Sync architecture:** HMAC-signed `SyncOutbox`/`SyncInbox` entities, `sync_source`/`record_version`/`origin_event_id` on synced entities, `drainArrivOneSyncOutbox`, `receiveArrivOneSyncEvent`, `handleArrivOneSyncEntityTrigger`. Manifest convergence via `checkArrivOneManifestVersions`, `consumeArrivOneProductManifest`, `reconcileArrivOneManifests`.

**No duplicate CRM.** The `HubSpotActivityLog` page IS the Arriv One CRM interface. Contacts sync to/from Arriv One via the sync engine.

---

## VERTICAL FEATURES — Kept ✅

**Principle:** Keep Estate Media-specific features. Do not move these into core Arriv One.

**Current state:** ALIGNED. Vertical features are Estate Media-local.

| Vertical Feature | Location | In Arriv One? |
|---|---|---|
| Media Partners | `User` (user_type=media_partner), `PendingSignup` | ❌ Estate Media only |
| Photographers | Media Partner role | ❌ Estate Media only |
| Listings | `Job` entity (from_booking=true) | ❌ Estate Media only |
| Shoots | `Booking` entity, `BookingPage` | ❌ Estate Media only |
| Property Workflows | `checkPropertyClosings`, MLS scanning | ❌ Estate Media only |
| Packages | `BookingForm` package options, `ProductTruth` | ❌ Estate Media only |
| Client Workflows | `ClientBookings`, `BookingChangeRequest` | ❌ Estate Media only |
| Marketplace Operations | `JobBoard`, `bookJobAndSendCalendarInvite` | ❌ Estate Media only |
| Supra Access | `SupraAccess` | ❌ Estate Media only |
| Apparel | `PurchaseApparel`, `confirmApparelPurchase` | ❌ Estate Media only |
| Gear Verification | `uploadGearImages`, `verifyAttire` | ❌ Estate Media only |
| Payouts (contractors) | `processWeeklyPayouts`, `processInstantPayout`, `PayoutHistory` | ❌ Estate Media only |

---

## CUSTOMER MANAGEMENT — Reconciled ✅ (enhanced)

**Principle:** Estate Media client workflows should use Arriv One CRM principles. A converted lead/customer should become a Customer 360 record.

**Current state:** ALIGNED (after enhancement).

`Customer360` (`src/components/sales/Customer360.jsx`) now supports:
- ✅ Contact information (name, email, phone, company)
- ✅ Communication history (Activity tab — calls, emails, meetings, notes)
- ✅ Documents (NEW — uploaded documents for this customer)
- ✅ Invoices (Invoice tab — paid/outstanding)
- ✅ Video calls (NEW — video call history with this customer)
- ✅ Products purchased (NEW — packages and add-ons purchased)
- ✅ Account relationship history (NEW — timeline of relationship milestones)

**No duplicate customer system.** Customers are `Contact` entities (Arriv One CRM) synced via `immutable_shared_id`. The `Customer360` component aggregates data from `Booking`, `Job`, `Invoice`, `ActivityLog`, `VideoCallMessage`, and uploaded documents — all matched by `client_email`. It does NOT create a separate customer entity.

---

## PEOPLE MODEL — Reconciled ✅ (new)

**Principle:** Avoid separate person records. Use Person → Employee/Customer/Candidate/Partner based on relationship. A person may have multiple roles.

**Previous state:** Cross-system IDs existed (`shared_person_id`, `immutable_shared_id`, `arriv_employee_id`) but there was no canonical Person entity linking role records.

**Fix:** Created unified Person model:

| File | Purpose |
|---|---|
| `base44/entities/Person.jsonc` | Canonical identity entity — stores name, email, phone, DOB, and an array of role links |
| `base44/shared/personModel.ts` | Single source of truth for person resolution — `findPersonByEmail`, `createPerson`, `linkRoleToPerson`, `getPersonRoles`, `extractIdentity` |
| `base44/functions/resolvePerson/entry.ts` | Backend function to resolve a Person from any identifier, linking all role records |

**How it works:**
1. A Person record is the canonical identity (name, email, phone, DOB, `shared_person_id`)
2. The `roles` array links to role-specific records: Employee (`SalesTeamMember`), Customer (`Contact`), Candidate (`HireCandidate`), Partner (`User`), Applicant (`JobApplication`)
3. `linkRoleToPerson` finds an existing Person by email or `shared_person_id`, or creates one, then adds the role link
4. A person can hold multiple roles simultaneously (e.g., a former candidate who becomes an employee, or a customer who becomes a partner)
5. The `HireHandoffSection` already uses `shared_person_id` to bridge KhethaIQ candidates to Estate Media worker records — the Person entity now provides the canonical backing for this

**Role records are NOT duplicated.** `SalesTeamMember`, `Contact`, `HireCandidate`, `JobApplication`, and `User` continue to exist as role-specific records. The Person entity is a lightweight identity layer that links them.

---

## ONBOARDING — Reconciled ✅

**Principle:** Three-tier onboarding — Khetha (candidate → hired), Arriv One (employee onboarding), Estate Media (role-specific workflow).

**Current state:** ALIGNED.

| Tier | Flow | Location |
|---|---|---|
| Khetha | Candidate → Hired | `manageHireHandoff` (process_hire), `receiveKhethaIQHireEvent`, `HireHandoffSection` |
| Arriv One | Employee onboarding | `SalesOnboardingWizard`, `getSalesOnboarding`, `saveSalesOnboardingStep` |
| Estate Media (Media Specialist) | Equipment verification, training, availability | `MediaPartnerSignup`, `OrientationVideo`, `OrientationSizes`, `OrientationAddress`, `OrientationOnboardingFee`, `verifyAttire`, `uploadGearImages` |
| Estate Media (Sales Advisor) | Sales certification, calling authorization | `SalesOrientationDashboard`, `startSalesOrientation`, `SalesTrainingPortal`, `SalesCertification.calling_authorization` |

**No duplicate onboarding systems.** Each tier handles its own scope. The Khetha → Arriv One handoff is via `manageHireHandoff` which creates/links the Estate Media worker record and sets `shared_person_id`.

---

## DUPLICATE SYSTEMS CHECK — None Found ✅

| Area | Duplicate? | Notes |
|---|---|---|
| Recruiting logic | ❌ No | Estate Media uses canonical KhethaIQ via manifest + sync |
| CRM/Sales | ❌ No | Estate Media uses canonical Arriv One via sync |
| Customer records | ❌ No | Single `Contact` entity (Arriv One CRM); `Customer360` aggregates, doesn't duplicate |
| Person records | ❌ No (fixed) | Unified `Person` entity now links role records |
| Onboarding | ❌ No | Three-tier model, each tier scoped |
| Email sending | ❌ No | `SendEmail` (registered users), Brevo (external), Gmail (rep-as-sender) — each for different use cases |
| SMS | ❌ No | Single Twilio integration |
| Payments | ❌ No | Stripe (clients + contractor payouts), no duplicate payment processor |
| Payroll | ❌ No | Single Arriv Payroll integration |
| Background checks | ❌ No | Single Checkr integration |

---

## Conclusion

Estate Media is correctly architected as a vertical operating system on top of Arriv One and Khetha IQ. The two gaps (unified Person model and Customer 360 completeness) have been resolved. No duplicate systems exist. The app does not fork either platform — it extends them with vertical (real estate media) business workflows while delegating canonical recruiting, CRM, employee, and customer management to the parent systems.