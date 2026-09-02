# Customer360 & CRM Integration Audit

**Date:** 2026-09-02
**Scope:** Validate Estate Media operates as a vertical on top of Arriv One CRM. No new features built.

---

## 1. Customer Identity Source — PARTIALLY ALIGNED ⚠️

**Canonical identity:** `Contact` entity (Arriv One CRM) with `lifecycle_stage`, `immutable_shared_id`, `sync_source`, `record_version`, `origin_event_id`.

**Actual Customer360 input:** The `contact` prop passed to Customer360 is built by `MyContacts.jsx` from **ActivityLog grouping** (lines 112-142), NOT from the Contact entity. The contact object is:
```
{ key, name, email, company, activities, upcoming, past }
```
This is an activity-derived projection, not a Contact record.

**ContactSearch.jsx** queries HubSpot via `searchHubSpotContacts` backend function (line 244), not the local `Contact` entity directly.

**Gap:** Customer360 reads `contact.lifecycle_stage` (line 136), but the `contact` prop from MyContacts does not include `lifecycle_stage` — that field lives on the `Contact` entity, not on ActivityLog-derived objects. The lifecycle pipeline (lines 300-333) will always fall back to the Estate Media-derived stage because `crmStage` is always null from the ActivityLog path.

---

## 2. Separate Customer Database — NO ✅

No separate customer entity exists. Customer identity is stored in one canonical entity (`Contact`), but identity fields are **denormalized** across operational records:

| Record | Identity Fields | Purpose |
|---|---|---|
| `Contact` | email, firstname, lastname, phone, company | **Canonical** (Arriv One CRM) |
| `ActivityLog` | contact_name, contact_email, company_name | Activity reference |
| `Booking` | client_name, client_email, client_phone | Order reference |
| `Job` | client_name, client_email, client_phone | Shoot reference |
| `Invoice` | client_email (matched) | Billing reference |
| `PendingSignup` | email, full_name, phone_number | Front-end account provisioning |
| `ClientSignupInvite` | client_name, client_email, client_phone | Invite tracking |
| `FieldProspect` | public_agent_name, brokerage | Field prospecting |
| `SecondaryContactInfo` | secondary_names/emails/phones | Additional contact data |

These are denormalized references, not duplicate databases. **No action needed** — denormalization is appropriate for operational records.

---

## 3. Customer360 Data Combination — VERIFIED ✅ (with one gap)

### Arriv One Data (Consumed)
| Data | Source | Status |
|---|---|---|
| Customer identity | `contact` prop (name, email, phone, company) | ⚠️ From ActivityLog, not Contact entity |
| Lifecycle stage | `contact.lifecycle_stage` | ⚠️ Always null from ActivityLog path |
| Communication history | `activities` prop (ActivityLog) | ✅ |
| Sales relationship | `contact.sales_member_id` ownership | ✅ |

### Estate Media Data (Added)
| Data | Tab | Status |
|---|---|---|
| Properties (addresses) | Orders | ✅ |
| Listings (jobs) | Orders, Projects | ✅ |
| Shoots (production status) | Projects | ✅ |
| Packages | Products | ✅ |
| Bookings | Orders | ✅ |
| Deliverables (footage, Drive) | Projects | ✅ |
| Invoices | Invoices | ✅ |
| Media partner relationships | Projects | ✅ |

**Gap:** Customer360 loads Estate Media data by `client_email` matching (correct), but the Arriv One CRM data (lifecycle_stage) is not actually flowing through because the `contact` prop is ActivityLog-derived, not Contact-derived.

---

## 4. Person Role Transitions — VERIFIED ✅

The Person entity supports all five role transitions while preserving one identity:

```
Lead → Customer → Partner → Media Specialist → Employee
```

- `linkRoleToPerson` finds by email or `shared_person_id`, creates if not found, adds role link
- `extractIdentity` normalizes all six role types (employee, customer, candidate, partner, applicant, media_specialist)
- Tested: same email + `media_specialist` + `customer` → one Person, two role entries, no duplicates
- `roles` array preserves all role links with `assumed_at` timestamps

**Gap:** The `resolvePerson` function exists but is not yet called during actual business transitions:
- `convertLeadToCustomer` — does not link the Person's customer role
- `signupMediaPartner` — does not link the Person's media_specialist role
- `manageHireHandoff` — uses `shared_person_id` but does not call `linkRoleToPerson`
- `createSalesTeamMember` — does not link the Person's employee role

The identity layer is ready but the business flows don't call it yet.

---

## 5. Duplicate Customer Concepts — ANALYSIS

| Concept | Where It Lives | Is It a Separate Entity? | Recommendation |
|---|---|---|---|
| **Client** | `Booking.client_*`, `Job.client_*` | No — denormalized fields | Keep as denormalized reference to Contact |
| **Customer** | `Contact.lifecycle_stage = "customer"` | No — CRM lifecycle stage | Keep as Arriv One CRM stage (canonical) |
| **Contact** | `Contact` entity | **Yes — canonical** | Keep as the single customer identity (Arriv One owns) |
| **Buyer** | Not used | N/A | N/A |
| **Realtor** | `Contact` with `company` = brokerage; `FieldProspect.prospect_type = INDIVIDUAL_AGENT` | No — a Contact with a real estate profession | Should be a **relationship role** on Person, not a separate concept |
| **Partner** | `User` with `user_type=media_partner`; `PendingSignup.user_type=media_partner` | No — a User with a role | Should be a **relationship role** on Person (`media_specialist`) |

**Finding:** "Client", "Customer", "Contact", "Realtor", "Partner" are NOT separate entities — they are the same Person in different relationship contexts. The Person entity already supports this via its `roles` array, but the business logic hasn't been updated to link these roles.

**Current duplicate risk:** Low. The only true customer entity is `Contact`. The others are either denormalized fields (client_*) or role-specific records (User/media_partner, FieldProspect). No separate customer database was created.

---

## 6. CustomerProfile Intelligence Layer — RECOMMENDATIONS (Not Built)

For a future CustomerProfile layer, the following architecture is recommended:

### Principle
CustomerProfile should be a **computed view** (backend function), not a new entity. It aggregates from existing canonical sources.

### Data Sources
1. **Contact** (Arriv One CRM) — identity, lifecycle_stage, lead_status, company, job_title
2. **Person** — canonical identity, all roles (employee, customer, candidate, partner, media_specialist)
3. **Booking** — Estate Media orders (packages, add-ons, addresses, pricing)
4. **Job** — Estate Media shoots (media partner, footage, delivery status)
5. **Invoice** — financial history (paid, outstanding, lifetime revenue)
6. **ActivityLog** — communication history (calls, emails, meetings, notes)
7. **VideoCallMessage** — video call history
8. **PendingSignup** — front-end account status
9. **ClientSignupInvite** — invite conversion tracking
10. **FieldProspect** — prospecting origin (if this customer was found in the field)

### Architecture
```
CustomerProfile (backend function)
  → resolvePerson(email) → Person + all roles
  → Contact.filter({ email }) → CRM identity + lifecycle_stage
  → Booking.filter({ client_email }) → orders
  → Job.filter({ client_email }) → shoots
  → Invoice.filter({ client_email }) → financials
  → ActivityLog.filter({ contact_email }) → communications
  → Return aggregated profile (no new entity created)
```

### Key Principles
1. **Don't create a CustomerProfile entity** — it would duplicate Contact
2. **Query Contact directly** — don't derive from ActivityLog grouping
3. **Use resolvePerson** to unify all role records and detect cross-role transitions
4. **Estate Media data layers on top** — bookings, shoots, packages, deliverables are vertical additions
5. **Arriv One CRM is the authority** — lifecycle_stage, lead_status, company are owned by Arriv One and synced via `immutable_shared_id`

### Integration Points
- `MyContacts` should query `Contact` entity (not just ActivityLog grouping) to get `lifecycle_stage`
- `Customer360` should receive a `Contact` record (not an ActivityLog-derived object) as its `contact` prop
- `convertLeadToCustomer` should call `linkRoleToPerson(customer, ROLE_TYPES.CUSTOMER)` to link the Person
- `signupMediaPartner` should call `linkRoleToPerson(user, ROLE_TYPES.MEDIA_SPECIALIST)` to link the Person
- `createSalesTeamMember` should call `linkRoleToPerson(employee, ROLE_TYPES.EMPLOYEE)` to link the Person

---

## Summary

| Check | Status |
|---|---|
| Customer identity from Arriv One Contact/Person | ⚠️ Contact entity exists but Customer360 receives ActivityLog-derived object |
| No separate customer database | ✅ No duplicate customer entity |
| Customer360 combines Arriv One + Estate Media data | ✅ All tabs present (one gap: lifecycle_stage not flowing) |
| Person role transitions preserve one identity | ✅ Entity + resolution logic verified (business flows not yet wired) |
| Duplicate customer concepts identified | ✅ Client/Customer/Contact/Realtor/Partner analyzed — all are roles, not separate entities |
| CustomerProfile recommendations prepared | ✅ Architecture documented (not built) |

**Overall:** Estate Media is correctly architected as a vertical on top of Arriv One CRM. The Person entity provides the canonical identity layer. The one gap is that Customer360's `contact` prop is ActivityLog-derived rather than Contact-entity-derived, which prevents `lifecycle_stage` from flowing through. The CustomerProfile intelligence layer should be a computed backend function that queries Contact directly and uses resolvePerson to unify roles.