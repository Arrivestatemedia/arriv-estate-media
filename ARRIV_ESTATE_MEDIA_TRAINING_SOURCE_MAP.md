# Training Source Map

## Overview
This document maps all training sources, materials, and their canonical locations within the Arriv Estate Media sales training system. It serves as the authoritative reference for where each training topic is taught, assessed, and reinforced.

---

## Training Source Categories

### 1. Platform-Hosted Training Modules (`TrainingModule` entity)
**Location:** Admin → Training Admin (`/SalesTrainingAdmin`) → Module Manager
**Consumer:** Sales reps via `/SalesTrainingPortal`

| Module Category | Source | Assessment | Certification |
|---|---|---|---|
| Product Knowledge | `ProductTruth` entity | `TrainingAttempt` scored | `SalesCertification` issued |
| Sales Process | `salesTrainingData.js` | `TrainingAttempt` scored | `SalesCertification` issued |
| Call Scripts | `salesTrainingData.js` | `TrainingAttempt` scored | Role-play verification |
| Objection Handling | `salesTrainingData.js` | `TrainingAttempt` scored | Role-play verification |
| CRM Usage | In-app guided tours | Activity log verification | Admin manual sign-off |
| Brand Standards | `ProductTruth` entity | `TrainingAttempt` scored | `SalesCertification` issued |

### 2. Orientation Pipeline (`SalesOrientation` entity)
**Location:** Admin → Sales Orientation (`/AdminSalesOrientation`)
**Consumer:** New hires via `/SalesOrientationDashboard`

| Stage | Source Material | Verification |
|---|---|---|
| Welcome Video | Admin-uploaded via `setSalesWelcomeVideoUrl` | Video watch confirmed |
| Training Modules | `TrainingModule` entities assigned to orientation | `TrainingCompletion` records |
| Background Check | Checkr integration via `initiateSalesBackgroundCheck` | `BackgroundCheck` status |
| Stripe Onboarding | `createSalesStripeOnboarding` | `stripe_onboarding_status` = complete |
| Direct Deposit | `createDirectDepositSession` | Payroll enrollment confirmed |
| I-9 / W-9 | `OrientationDocument` templates | Admin review (`adminReviewOrientation`) |

### 3. AI Sales Coach (`AiAssistantTab`)
**Location:** Sales Dashboard → AI Assistant tab
**Source:** `InvokeLLM` with Brad Burke's proven call scripts embedded in the system prompt.

| Topic | Source | Context |
|---|---|---|
| Cold Call Scripts | Brad's proven scripts (in prompt) | HubSpot contact lookup |
| Follow-up Strategy | Brad's touchpoint rules | Conversation history |
| Objection Handling | Brad's value props + policies | Screenshot analysis |
| Voicemail Scripts | Brad's voicemail templates | N/A |

### 4. Field Prospecting Training
**Location:** `/FieldProspectingPage`
**Source:** `FieldProspect` entity + `generateEstateMediaProspectBrief` backend function

| Topic | Source | Assessment |
|---|---|---|
| Prospect Research | `ProspectBrief` AI-generated | Rep notes + qualification status |
| Listing Intelligence | Web search via `InvokeLLM` | `professional_video_status` verification |
| Opening Scripts | `ProspectBrief.suggested_opening` | Rep adaptation |
| Discovery Questions | `ProspectBrief.questions_to_ask` | Call outcome logging |

### 5. Culture & Motivation
**Location:** Sales Dashboard → Culture Banner
**Source:** `getDailyCultureBanner` backend function

| Source Type | Material | Refresh |
|---|---|---|
| Bible | Daily verse + reflection | Daily |
| Quran | Daily verse + reflection | Daily |
| Torah / Tanakh | Daily verse + reflection | Daily |
| Buddhist Teachings | Daily teaching | Daily |
| Hindu Texts | Daily verse | Daily |
| Secular | Motivational quote | Daily |

---

## Certification Pathway

```
Orientation → Training Modules → Assessment (TrainingAttempt) → Certification (SalesCertification)
     ↓
Ramp Stage Detection (salesHealthEngine.computeRampStage)
     ↓
training → early_ramp (days 1-14) → ramp (days 15-30) → full_production (day 31+)
```

### Certification Types (`SalesCertification` entity)
- **Product Knowledge Certified** — Required before first live call
- **Call Script Certified** — Required before unsupervised calling
- **Objection Handling Certified** — Required before field prospecting
- **CRM Certified** — Required before contact ownership

---

## Training Data Flow

```
Admin creates TrainingModule (content + quiz)
    ↓
Sales rep assigned via orientation or direct assignment
    ↓
Rep completes module in /SalesTrainingPortal
    ↓
TrainingAttempt scored (passing threshold: 80%)
    ↓
TrainingCompletion recorded
    ↓
SalesCertification issued if applicable
    ↓
Ramp stage + health score updated via salesHealthEngine
```

---

## Canonical File References

| File | Purpose |
|---|---|
| `src/lib/salesTrainingData.js` | Frontend training content constants |
| `base44/shared/salesTrainingShared.ts` | Backend training logic |
| `base44/shared/certificationContract.ts` | Certification issuance rules |
| `base44/shared/orientationEngine.ts` | Orientation pipeline state machine |
| `base44/shared/salesHealthEngine.ts` | Ramp stage + health score computation |
| `base44/shared/salesWorkModeConfig.ts` | Admin-configurable activity targets |
| `src/components/sales/SalesTrainingContent.jsx` | Rep-facing training UI |
| `src/components/admin/TrainingModuleManager.jsx` | Admin training management UI |
| `src/pages/SalesTrainingPortal.jsx` | Rep training portal page |
| `src/pages/SalesTrainingAdmin.jsx` | Admin training management page |
| `src/pages/SalesOrientationDashboard.jsx` | New hire orientation dashboard |
| `src/pages/AdminSalesOrientation.jsx` | Admin orientation management |

---

## Assessment Standards

| Metric | Threshold | Source |
|---|---|---|
| Module Pass Rate | 80% | `TrainingAttempt` |
| Orientation Completion | All stages passed | `SalesOrientation.status` |
| Background Check | Clear | Checkr webhook |
| Stripe Onboarding | Complete | `stripe_onboarding_status` |
| Certification Validity | 12 months | `SalesCertification.expires_at` |

---

*Last updated: September 2026*
*Canonical source of truth for all training material locations and pathways.*