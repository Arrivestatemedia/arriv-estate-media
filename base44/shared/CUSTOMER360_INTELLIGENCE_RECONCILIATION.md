# Customer360 Intelligence Consumption Reconciliation

## Purpose

This document records the reconciliation of Estate Media's Customer360 experience
with the canonical Arriv One Customer360 intelligence layer.

## Architecture

```
Arriv One Customer360 (canonical owner)
    |
    | canonical intelligence (engagement, health, recommendations, memory, learning)
    |
    ↓ via existing sync contract (receiveArrivOneSyncEvent)
    |
Estate Media Contact/Account entities (synced local copies)
    |
    ↓
Estate Media Customer360 Experience (Customer360.jsx)
    |
    +-- Customer Intelligence tab (canonical Arriv One intelligence)
    |     └── CustomerIntelligencePanel.jsx (read-only display)
    |
    +-- Estate Media vertical enrichment (preserved, unchanged)
          ├── Overview (local stats)
          ├── Communications (local ActivityLog)
          ├── Jobs & Orders (local Booking + Job)
          ├── Projects / Shoots (local Job — Estate Media vertical)
          ├── Invoices (local Invoice)
          ├── Products (local packages/add-ons)
          ├── Documents (local JobApplication samples)
          ├── Video Calls (local VideoCallMessage)
          ├── Relationship (local milestones)
          └── Account (local PendingSignup status)
```

## Root Cause of Prior "Missing Intelligence" Finding

The prior Estate Media Customer360 audit examined `Customer360.jsx` and found it
built its customer view entirely from local Estate Media entities (Booking, Job,
Invoice, ActivityLog, PendingSignup, VideoCallMessage, JobApplication). It
concluded that engagement score, health score, communication preferences, next
best action, upsell opportunities, sales memory, recommendation outcomes, etc.
were "missing."

**Root cause**: The Arriv One ⇄ Estate Media sync contract (`syncFieldAuthority.ts`)
only covered basic CRM fields (firstname, lastname, email, phone, company,
job_title, lead_status, lifecycle_stage, social_media, owner_id). The canonical
Arriv One Customer360 intelligence fields existed in Arriv One but were never
added to the sync contract — so Estate Media never received them and could not
display them.

This was an **integration/exposure gap**, not a feature gap. The intelligence
engine exists in Arriv One; it just wasn't being synced to Estate Media.

## Reconciliation Changes

### 1. Entity Schema Extensions

**Contact entity** (`base44/entities/Contact.jsonc`) — added Arriv One-authoritative
intelligence fields:
- Profile: `engagement_score`, `relationship_age_days`
- Relationship: `communication_preferences`, `preferred_contact_method`, `relationship_health`, `churn_risk`
- Sales: `next_best_action`, `next_best_action_timing`, `upsell_opportunities`, `recommended_products`
- AI Memory: `sales_memory` (object: successful_approaches, objections, decision_maker_preferences, relationship_notes, historical_context)
- Learning: `recommendation_outcomes`, `recommendation_conversion_rate`, `what_worked_previously`
- Metadata: `intelligence_synced_at`, `intelligence_version`

**Account entity** (`base44/entities/Account.jsonc`) — added account-level intelligence:
- `account_engagement_score`, `account_lifetime_value`, `account_buying_patterns`
- `account_relationship_health`, `account_churn_risk`
- `account_next_best_action`, `account_upsell_opportunities`
- `account_sales_memory`, `account_intelligence_synced_at`

### 2. Field Authority Update

**`base44/shared/syncFieldAuthority.ts`** — all intelligence fields added to
`arrivOneAuthoritative` arrays for Contact and Account. This means:
- Inbound sync from Arriv One CAN write these fields (Arriv One is authoritative)
- Estate Media outbound sync CANNOT write these fields (buildOutboundPayload strips them)
- Estate Media local code must never write these fields

### 3. UI: Customer Intelligence Panel

**`src/components/sales/CustomerIntelligencePanel.jsx`** — new read-only display
component rendering canonical intelligence in Arriv One's categories:
- Profile Intelligence
- Relationship Intelligence
- Sales Intelligence
- AI Sales Memory
- Recommendation Learning

Shows an empty state when no intelligence has been synced, with the last sync timestamp.

### 4. Customer360 Integration

**`src/components/sales/Customer360.jsx`** — added a new "Customer Intelligence" tab
that renders `CustomerIntelligencePanel` with the synced contact data. All existing
Estate Media vertical tabs are preserved unchanged.

## What Was NOT Created

- No `EstateMediaCustomer360` entity
- No local customer intelligence entities
- No duplicate recommendation engine
- No duplicate AI memory store
- No duplicate health/churn engine
- No duplicate Customer360 computation function

## Authority

- **Arriv One** remains authoritative for all canonical customer intelligence fields.
- **Estate Media** reads these fields via sync and displays them; it never writes them.
- Estate Media may send source events/data back to Arriv One (via the existing
  sync outbox) so Arriv One can refresh Customer360 intelligence.
- The existing sync/outbox/mapping architecture is used — no new integration mechanism.

## Tenant Isolation

- All intelligence fields are on tenant-scoped entities (Contact, Account) with
  existing `tenant_id` RLS.
- Inbound sync validates tenant ID via `validateInboundTenant`.
- HMAC signature verification prevents cross-tenant injection.
- CrossAppRecordMapping links records by canonical tenant ID.
- No weakening of any existing security control.