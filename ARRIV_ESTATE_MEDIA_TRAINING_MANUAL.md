# Arriv Estate Media — Complete System Training Manual

> **Purpose:** This document is the authoritative training reference for every piece of the Arriv Estate Media platform. It covers system architecture, user roles, every feature area, and step-by-step provisioning workflows for new real estate agents, builders, clients, sales reps, and media partners.
>
> **Audience:** Administrators, operations staff, sales managers, and anyone responsible for onboarding or training new users.
>
> **Last Updated:** September 2026

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles & Access Levels](#2-user-roles--access-levels)
3. [Provisioning Guide — New Users](#3-provisioning-guide--new-users)
   - 3.1 [New Real Estate Agent / Builder (Client)](#31-new-real-estate-agent--builder-client)
   - 3.2 [New Sales Growth Advisor (Sales Rep)](#32-new-sales-growth-advisor-sales-rep)
   - 3.3 [New Media Specialist (Media Partner / Contractor)](#33-new-media-specialist-media-partner--contractor)
   - 3.4 [New Admin / Platform User](#34-new-admin--platform-user)
4. [Feature Area Deep-Dives](#4-feature-area-deep-dives)
   - 4.1 [Admin Hub](#41-admin-hub)
   - 4.2 [Sales Dashboard & CRM](#42-sales-dashboard--crm)
   - 4.3 [Booking System](#43-booking-system)
   - 4.4 [Job Board & Media Partner Dashboard](#44-job-board--media-partner-dashboard)
   - 4.5 [Post-Production Editing Queue](#45-post-production-editing-queue)
   - 4.6 [Editor Workspace](#46-editor-workspace)
   - 4.7 [Commissions & Payroll](#47-commissions--payroll)
   - 4.8 [Chat & Communication (Connect)](#48-chat--communication-connect)
   - 4.9 [Email Hub](#49-email-hub)
   - 4.10 [Recruiting & Careers Hub](#410-recruiting--careers-hub)
   - 4.11 [Sales Training & Orientation](#411-sales-training--orientation)
   - 4.12 [Pricing & Compensation Engine](#412-pricing--compensation-engine)
   - 4.13 [Referral Program](#413-referral-program)
   - 4.14 [Benefits & Time Off](#414-benefits--time-off)
   - 4.15 [Field Prospecting](#415-field-prospecting)
   - 4.16 [Customer Success](#416-customer-success)
   - 4.17 [Discount Approvals](#417-discount-approvals)
   - 4.18 [Background Checks](#418-background-checks)
   - 4.19 [Arriv One Sync & Cross-App Integration](#419-arriv-one-sync--cross-app-integration)
   - 4.20 [KhethaIQ by Arriv (Recruiting/Hiring)](#420-khethaiq-by-arriv-recruitinghiring)
5. [Automated Workflows & Scheduled Tasks](#5-automated-workflows--scheduled-tasks)
6. [Integrations & Connectors](#6-integrations--connectors)
7. [Security & Access Control](#7-security--access-control)
8. [Troubleshooting & Known Issues](#8-troubleshooting--known-issues)
9. [Glossary](#9-glossary)

---

## 1. System Overview

Arriv Estate Media is an internal operations platform for Arriv's real estate media business. It manages the full lifecycle of real estate media services — from client booking and sales, through on-site photo/video capture by media partners, to post-production editing and final delivery.

### What the System Does

| Capability | Description |
|---|---|
| **Client Booking** | Real estate agents and builders book photo/video shoots for their properties |
| **Sales CRM** | Sales reps manage contacts, deals, activities, and pipeline |
| **Job Management** | Bookings become jobs that media partners claim and fulfill |
| **Media Partner Portal** | Contractors view available jobs, book them, upload footage, and track payouts |
| **Post-Production Editing** | Editing queue with task assignment, QC review, and delivery workflow |
| **Commissions & Payroll** | Commission plans, payroll sync, and payout processing |
| **Internal Communication** | Real-time chat with cross-app messaging to Arriv One |
| **Email Hub** | Send/receive emails with per-rep email connections (Gmail, Microsoft, SMTP) |
| **Recruiting & Careers** | Public job postings, applications, interviews, and hiring pipeline |
| **Training & Orientation** | Sales training modules, onboarding workflows, and orientation tracking |
| **Referral Program** | Referral tracking, credit ledger, and cash-out requests |
| **Benefits & Time Off** | Employee benefits management and PTO requests |
| **Arriv One Sync** | Bidirectional data synchronization with the Arriv One CRM platform |

### Architecture

- **Frontend:** React + Tailwind CSS + Vite (single-page application)
- **Backend:** Base44 platform (entities, backend functions, workflows, connectors)
- **Database:** Base44 entity store (JSON-schema-based records with Row-Level Security)
- **Authentication:** Custom sales login + Base44 platform auth (admin users)
- **Hosting:** Published at `app.arrivestatemedia.com` (custom domain) / `arrivestatemedia.base44.app`
- **Mobile:** Responsive web app; also publishes to iOS/Android from the same codebase

### Multi-Tenancy

The system uses a `tenant_id` field (default: `tnt_estate_media`) on most entities for multi-tenant isolation. This allows the platform to eventually host multiple Arriv business units while keeping their data separate.

---

## 2. User Roles & Access Levels

The system has **four primary user types**, each with distinct access and capabilities.

### 2.1 Admin (Platform Administrator)

**Who they are:** Arriv owners and operations managers who manage the entire platform.

**How they log in:** Base44 platform authentication (email/password) or custom admin login. Their role is set to `admin` on the User entity.

**What they can access:**
- Admin Hub (central dashboard)
- Sales team management (create/edit/deactivate reps)
- Commissions management (plans, approvals, payroll sync)
- Payroll dashboard and settings
- Editing queue (full management)
- Email settings and templates
- Background checks management
- Discount approvals
- Sales orientation management
- Owner dashboard
- KhethaIQ by Arriv (recruiting/hiring system)
- All data across all sales reps and media partners
- Arriv One sync configuration and reconciliation
- System settings and integrations

**Key navigation items:** Admin Hub, My Performance, Training Admin, Discount Approvals, Sales Team, Sales Rep Activity, Background Checks, Commissions, Sales Orientation, Payroll Dashboard, Payroll Settings, Email Settings, Owner Dashboard, KhethaIQ by Arriv, Editing Queue, Email Templates, My Recordings, My Profile, Time Off, My Benefits.

### 2.2 Sales Team Member (Sales Growth Advisor)

**Who they are:** Sales reps who sell media services to real estate agents and builders.

**How they log in:** Custom sales login (`/SalesLogin`) using email and password. Their session is stored in localStorage.

**What they can access:**
- Sales dashboard (activity log, daily call queue)
- My Performance dashboard
- CRM (contacts, deals, activities)
- Chat (internal + cross-app with Arriv One)
- Email Hub (per-rep email sending)
- Field Prospecting
- Referral Program
- Customer Success
- Training portal
- My Recordings (call recordings)
- My Profile, Time Off, My Benefits
- Editor Workspace (if they also have an editor profile — "dual role")

**Key navigation items:** My Dashboard, My Performance, Editor Workspace (if dual-role), Training, Field Prospecting, Referrals, Customer Success, My Recordings, My Profile, Time Off, My Benefits.

**Dual-Role Admins:** Sales team members who are also platform admins see a mode selector (Sales / Editing). They can switch between the sales interface and the editing workspace.

### 2.3 Media Partner (Media Specialist / Contractor)

**Who they are:** Independent contractors who capture photos and videos at property sites.

**How they log in:** Custom signup/login flow. Their `user_type` is set to `media_partner`.

**What they can access:**
- Available Jobs (job board with new-job badge)
- Media Partner Dashboard (booked jobs, status updates, earnings)
- Payout Records (payment history, statements, tax documents)
- Supra Access (lockbox access settings)
- Account Settings

**Key navigation items:** Available Jobs, My Dashboard, Payout Records, Supra Access.

### 2.4 Client (Real Estate Agent / Builder)

**Who they are:** Real estate professionals who order media services for their properties.

**How they log in:** Custom signup/login flow. Their `user_type` is set to `client`.

**What they can access:**
- Book a Shoot (booking form)
- My Bookings (booking history and status)
- Account Settings

**Key navigation items:** Book a Shoot, My Bookings.

### Access Control (RLS)

Most entities use Row-Level Security (RLS) to enforce data isolation:
- **Admin-only entities** (Jobs, Bookings, EditingTasks, Invoices, etc.): Only admins can read/create/update/delete.
- **Sales-rep-scoped entities** (Contacts, Deals, Activities, Prospects): Reps can only see their own records; admins see all.
- **Tenant-scoped entities** (QueueInsight, etc.): Filtered by `tenant_id` matching the user's tenant.

---

## 3. Provisioning Guide — New Users

This section provides step-by-step instructions for provisioning each user type.

### 3.1 New Real Estate Agent / Builder (Client)

Real estate agents and builders are the **clients** who order media services. There are two provisioning paths:

#### Path A: Self-Signup (Client initiates)

1. **Client visits the booking page** at `app.arrivestatemedia.com` and clicks "Sign Up"
2. **Client selects "Client Signup"** and fills out:
   - Full name
   - Email address
   - Phone number
   - Password
3. **System creates the account** with `user_type = 'client'`
4. **Client receives a welcome email** (via Brevo) confirming their account
5. **Client can now log in** and book shoots

#### Path B: Admin-Created (Admin initiates)

1. **Admin navigates to Admin Hub** → Sales Team or uses the invite system
2. **Admin uses `base44.users.inviteUser(email, "user")`** to send a platform invitation
3. **Alternatively, admin can create a ClientSignupInvite** record which generates a signup link
4. **Client receives an email** with a signup link
5. **Client completes signup** and their `user_type` is set to `client`

#### After Provisioning — What the Client Can Do

- **Book a Shoot:** Select a package (MLS Walkthrough, Photo Essentials, Photo Cinematic, Premium Bundle), add add-ons, enter property address, select preferred date/time
- **View My Bookings:** See all past and upcoming bookings with status (pending, confirmed, approved, completed, cancelled)
- **Account Settings:** Update profile, contact info, and preferences

#### Client Booking Flow (Detailed)

1. Client selects a package and add-ons
2. Client enters property address (auto-validated via Google Maps)
3. System looks up property square footage (for pricing tier determination)
4. System calculates pricing via the Pricing Engine:
   - Base package price
   - Add-on prices
   - Square-footage tier adjustments
   - Preferred membership discounts (if applicable)
   - New-customer MLS bonus eligibility ($40 credit for first-time customers)
5. Client submits booking (status: `pending`)
6. Admin reviews and approves/denies the booking
7. On approval, a Job is created and posted to the Job Board
8. Media partner claims the job
9. Client receives notifications at each stage (confirmed, media partner assigned, on the way, on site, completed, media delivered)

#### Important Notes for Provisioning Clients

- **Preferred Membership:** If the client is a Preferred member, they get discounted pricing. Check `PreferredMembership` entity and link it to the client's contact record.
- **Pay-at-Closing Option:** Clients can request to pay at closing instead of upfront. This creates a different invoice type (`final_closing`) and requires the closing date and final sale price.
- **New Customer Bonus:** First-time customers are eligible for a $40 MLS sales bonus credited to the referring sales rep.

---

### 3.2 New Sales Growth Advisor (Sales Rep)

Sales reps are the lifeblood of the business — they sell media services to real estate agents and builders.

#### Provisioning Steps

1. **Admin navigates to Admin Hub** → "Sales Team" (AdminSalesSignup page)
2. **Admin clicks "Add Sales Team Member"** and fills out:
   - Full name
   - Email address (this becomes their login)
   - Phone number
   - Role (admin or user)
   - Title/position
   - Compensation type (commission_only, base_plus_commission, salary)
   - Commission plan (if commission-based)
   - Twilio phone number (for calling/texting)
   - Extension (100-999, for internal transfers)
3. **System creates the SalesTeamMember record** with:
   - A hashed password (PBKDF2 format)
   - `force_password_change = true` (they must change it on first login)
   - `is_active = true`
   - Default chat status: `online`
   - Employment classification: `w2_employee` (default)
   - Employment status: `pending_offer` (default)
4. **Admin sends the new rep their login credentials** via a secure channel
5. **Rep navigates to `/SalesLogin`** and logs in with email + temporary password
6. **System forces password change** on first login (redirects to SalesChangePassword)
7. **Rep completes sales orientation** (see Section 4.11)

#### Post-Provisioning Setup

After the rep's account is created, the following must be configured:

**A. Email Connection (for Email Hub)**
- Admin navigates to Admin Email Settings → rep's profile
- Configure one of:
  - **Gmail OAuth:** Generate auth URL → rep authorizes → system stores tokens
  - **Microsoft OAuth:** Generate auth URL → rep authorizes → system stores tokens
  - **SMTP:** Enter SMTP host, port, username, password (encrypted)
- This allows the rep to send emails from the Email Hub using their own email address

**B. Commission Plan Assignment**
- Admin navigates to Admin Commissions
- Assign a CommissionPlan to the rep (specifies commission rate, structure)
- The rep's `commission_plan_id` and `commission_rate` are set
- Commission rate is snapshotted at assignment time for consistency

**C. Stripe Connect (for payouts)**
- Admin initiates Stripe Connect onboarding for the rep
- Rep completes Stripe onboarding (identity verification, bank account)
- `stripe_account_id`, `stripe_onboarding_status`, `stripe_payouts_enabled` are tracked

**D. Payroll Enrollment (if W2 employee)**
- Admin initiates payroll enrollment session
- Rep completes payroll onboarding (direct deposit, tax forms, I-9)
- Employee sync queue pushes the rep to Arriv Payroll

**E. Background Check**
- Admin initiates background check (via Checkr integration)
- Rep receives email to complete background check authorization
- Status tracked on the rep's profile

**F. Twilio Phone Number Assignment**
- Admin assigns a Twilio phone number to the rep for outbound calls/texts
- The rep's `twilio_phone_number` field is set
- This number is used for all outbound calls and SMS through the platform

**G. Sales Orientation**
- Rep is auto-enrolled in sales orientation on hire (workflow trigger)
- Rep completes orientation steps: welcome video, personal info, W-9/ICA, training, Stripe setup
- Admin tracks orientation progress in Admin Sales Orientation

#### Sales Rep Daily Workflow

1. **Log in** at `/SalesLogin`
2. **Check dashboard** (HubSpotActivityLog) for daily call queue and tasks
3. **Make calls** using the built-in Twilio dialer
4. **Log activities** (calls, emails, meetings, notes) against contacts
5. **Manage pipeline** — move deals through stages
6. **Send emails** via Email Hub using their connected email
7. **Chat** with team and cross-app with Arriv One
8. **Field prospect** new real estate agents in their territory
9. **Track referrals** and customer success metrics

---

### 3.3 New Media Specialist (Media Partner / Contractor)

Media partners are independent contractors who capture photos and videos at property sites.

#### Provisioning Steps

1. **Media partner applies** via the public careers page (`/careers`) or the Media Specialist job page (`/MediaSpecialist`)
2. **Applicant fills out the application:**
   - Personal info (name, email, phone, address, DOB)
   - Professional info (LinkedIn, portfolio, last related job, why they're a good fit)
   - EEOC information (voluntary, never synced externally)
   - Electronic signature
   - Video and photo sample links (Google Drive URLs)
   - Resume/documents
3. **Application is submitted** (status: `received`) and stored in `JobApplication` entity
4. **Admin reviews application** in the Admin Hub → Applications panel
5. **Admin advances the application** through stages:
   - `received` → `reviewing` → `accepted_pending` → `accepted`
   - Or: `received` → `reviewing` → `denied`
6. **On acceptance**, the applicant receives an acceptance email
7. **Admin creates a SalesTeamMember record** for the new media partner with:
   - `employment_classification = 'contractor'`
   - Role: `user`
   - Their contact info from the application
8. **Media partner completes onboarding:**
   - Signs Independent Contractor Agreement (ICA)
   - Completes W-9
   - Sets up Stripe Connect for payouts
   - Pays onboarding fee (if applicable)
   - Completes orientation video
   - Submits gear information and apparel sizes
   - Completes background check
9. **Admin verifies attire** and gear checkout
10. **Media partner is activated** and can now see the Job Board

#### Post-Provisioning Setup

**A. Capabilities Declaration & Verification**
- Media partner declares their capabilities (photo, video, drone, twilight, etc.)
- Admin verifies capabilities → `verified_capabilities` array is populated
- Only verified capabilities determine job eligibility on the Job Board

**B. Coverage Area**
- Media partner sets their coverage area (cities/states they serve)
- Stored in `CoverageArea` entity, linked to the rep
- Used for job matching by location

**C. Payout Settings**
- Media partner configures Stripe Connect for instant payouts
- `stripe_account_id` and `stripe_payouts_enabled` tracked
- Payout method: instant payout (via Stripe) or weekly statement

**D. Supra Access (Lockbox)**
- Media partner configures Supra access for property entry
- Used when properties have Supra lockboxes

#### Media Partner Daily Workflow

1. **Log in** at the app homepage
2. **Check Available Jobs** — job board shows open jobs matching their capabilities and coverage area
3. **Book a job** — click "Book" on a job card to claim it
4. **On shoot day:**
   - Update status to "On the Way" (client gets notified)
   - Update status to "On Site" (client gets notified)
   - Capture photos/videos
   - Update status to "Job Completed"
5. **Upload footage** to the Google Drive folder linked to the job
   - System sends upload reminders if footage isn't uploaded
   - Auto-completes the job when footage is confirmed
6. **Track earnings** in the Media Partner Dashboard
7. **Request instant payouts** or wait for weekly statements
8. **View payout records** — payment history, monthly/weekly statements, tax documents

#### Job Lifecycle (Media Partner Perspective)

```
Booking (pending) → Approved → Job Created (open) → Media Partner Books (booked)
→ On the Way → On Site → Job Completed → Footage Uploaded → Editing Tasks Generated
→ Editing Complete → Media Delivered to Client → Payout Processed
```

#### Payout Eligibility

A media partner's payout is eligible when:
- `media_partner_fulfillment_status = 'completed'` (capture + upload done)
- The job's `capture_fulfillment_completed_at` timestamp is set
- Client payment has cleared (`client_payment_clears_at` has passed)

Payouts are processed:
- **Weekly:** Every Friday at 4:45 AM ET (automated workflow)
- **Instant:** On-demand via Stripe (fees apply)

---

### 3.4 New Admin / Platform User

Admins are platform-level users managed through Base44's built-in User entity.

#### Provisioning Steps

1. **Existing admin navigates to App Users** in the Base44 dashboard (or uses `base44.users.inviteUser`)
2. **Admin invites the new user** with:
   - Email address
   - Role: `admin` or `user`
3. **New user receives a platform invitation email**
4. **New user clicks the invitation link** and sets up their password
5. **New user is created on the User entity** with the specified role
6. **If role = admin:** Full admin access to all features
7. **If role = user:** Limited access (typically not used directly — sales reps use the custom login instead)

#### Important Notes

- **User records cannot be created directly** — users join via invitations only
- **Admin role takes precedence:** If someone has both a sales session and a platform admin role, they see the full admin navigation
- **Only admins can invite other admins**

---

## 4. Feature Area Deep-Dives

### 4.1 Admin Hub

The Admin Hub is the central dashboard for platform administrators.

**What it shows:**
- Overview metrics (jobs, bookings, revenue, pipeline)
- Quick links to all admin functions
- Recent activity feed
- Pending approvals (bookings, discounts, background checks)
- System health indicators

**Key actions:**
- Approve/deny pending bookings
- View and manage all jobs
- Access all admin sub-pages (commissions, payroll, editing, etc.)
- Monitor Arriv One sync status

**Important:** Admins are always routed to the Admin Hub on login, never to the sales page.

---

### 4.2 Sales Dashboard & CRM

The sales dashboard (HubSpotActivityLog page) is the primary workspace for sales reps.

**Components:**

**A. Daily Call Queue**
- AI-prioritized list of contacts to call
- Based on engagement signals, last contact date, and AI recommendations
- Reps log outcomes (no answer, interested, warm waiting, etc.)
- AI learns from outcomes to improve future recommendations (QueueInsight entity)

**B. Contacts (CRM)**
- Full contact management (create, edit, search, filter)
- Contact fields: name, email, phone, company, job title, lifecycle stage, lead status
- Customer 360 intelligence (from Arriv One sync): engagement score, relationship health, churn risk, next best action, recommended products, sales memory
- Contact ownership: each contact belongs to a specific sales rep
- Account-level grouping: contacts can be grouped under Accounts (companies/brokerages)

**C. Deals (Pipeline)**
- Deal stages: open → won / lost / paid
- Track contract value, amount collected
- Service address (used for market extraction)
- Deal notes and history
- Commission generation: when a deal is won/paid, commission records are auto-generated

**D. Activities**
- Log calls, emails, meetings, tasks, notes
- Activities are linked to contacts
- Call map auto-generated for call activities (map to the contact's address)
- Activities sync to HubSpot (if integration is configured)
- Missed call tracking with acknowledgment badges

**E. AI Assistant (Ask Khetha)**
- AI-powered sales assistant
- Can answer questions about contacts, deals, and best practices
- Uses product truth data for accurate responses

---

### 4.3 Booking System

The booking system allows clients to order media services for their properties.

**Booking Flow:**

1. **Client selects a package:**
   - **MLS Walkthrough:** Basic video walkthrough for MLS listings
   - **Photo Essentials:** Standard photography package
   - **Photo Cinematic:** Premium photography with cinematic editing
   - **Premium Bundle:** Full photo + video + drone package

2. **Client adds add-ons:**
   - Rush delivery (expedited turnaround)
   - Drone footage
   - Twilight photography
   - Vertical reels (social media format)
   - AI virtual staging
   - 3D post-processing
   - Additional photos/videos

3. **Client enters property details:**
   - Street address, city, state
   - Preferred date and time
   - Notes/requirements
   - Pay-at-closing option (if applicable)

4. **Pricing Engine calculates total:**
   - Base package price (from MediaPricingConfig)
   - Add-on prices
   - Square-footage tier adjustment (from PropertyLookup)
   - Preferred membership discount (if applicable)
   - New-customer bonus ($40 credit for first MLS order)
   - A PricingSnapshot record is created with the authoritative calculation

5. **Booking is submitted** (status: `pending`)

6. **Admin reviews:**
   - Admin sees the booking in the Admin Hub
   - Admin can approve, deny, or request changes
   - On approval, a Job is created and posted to the Job Board
   - An invoice is generated (pay-up-front or deposit)

**Booking Status Flow:**
```
pending → confirmed → approved → completed
                ↘ denied
                ↘ cancelled
```

**Change Requests:**
- Clients can request changes to confirmed bookings (date, time, address)
- Change requests are stored in BookingChangeRequest entity
- Admin approves/denies change requests

---

### 4.4 Job Board & Media Partner Dashboard

**Job Board:**
- Shows all open jobs available for booking
- Jobs are filtered by media partner's verified capabilities and coverage area
- New jobs trigger a badge notification on the navigation
- Media partners can see: title, type (photo/video/both), location, date, pay rate, duration
- Clicking "Book" claims the job (status changes to `booked`)

**Media Partner Dashboard:**
- Shows booked jobs with status tracking
- Status updates: Awaiting Arrival → On the Way → On Site → Job Completed
- Each status change notifies the client
- Earnings breakdown: current week, pending, available for payout
- Footage upload confirmation
- Google Drive folder link for each job

**Job Status Flow:**
```
open → booked → in_progress → completed
                                    ↘ cancelled
                                    ↘ archived
```

**Capture Status:**
```
pending → on_site → captured
```

**Source Upload Status:**
```
not_started → partial → complete
```

When upload is complete, editing tasks are automatically generated (see Section 4.5).

---

### 4.5 Post-Production Editing Queue

The editing queue manages all post-production work after media partners upload footage.

**How Editing Tasks Are Generated:**

1. When a media partner confirms footage upload on a job...
2. The `releaseEditingTasksForJob` backend function runs
3. It reads the job's package and add-ons
4. It generates EditingTask records based on the package configuration:
   - `photo_editing` — for photo packages
   - `mls_walkthrough_edit` — for MLS walkthrough
   - `cinematic_video_edit` — for video/cinematic packages
   - `vertical_reel_edit` — for social media reels (one per reel add-on)
   - `drone_post` — for drone footage
   - `twilight_edit` — for twilight photography
   - `ai_staging_edit` — for AI virtual staging
   - `3d_post_processing` — for 3D tours
5. Each task inherits: job_id, client info, media partner info, property address, storage folder
6. Tasks start in `waiting_for_upload` status, then move to `ready_for_editing` when source media is verified

**Editing Task Status Flow:**
```
waiting_for_upload → ready_for_editing → assigned → editing → submitted_for_qc
                                                        ↕ revision_required
                                                   approved → delivered
                                                        ↘ cancelled
```

**Editing Queue Page (Admin):**
- View all editing tasks across all editors
- Filter by status, priority, SLA status
- Analytics dashboard (turnaround times, editor workload, queue health)
- Editor management (create/edit EditorProfiles)
- Upload exception tracking (tasks waiting too long for source media)
- Assign tasks to editors manually or let editors self-claim

**SLA Tracking:**
- Each task has a `delivery_deadline` (customer-facing) and `editing_deadline` (internal)
- SLA status: on_track → due_soon → at_risk → overdue
- Deadlines calculated from source-ready time + package SLA

**Quality Control (QC):**
- Editor submits task for QC (status: `submitted_for_qc`)
- QC reviewer reviews the work
- QC outcome: approved → delivered, or revision_required → back to editing
- Revision notes are tracked, revision count incremented

**Read-Only Access:**
- Sales reps without an EditorProfile can view the queue but cannot take actions
- Actions (assign, QC, cancel) are hidden for non-editors

---

### 4.6 Editor Workspace

The editor workspace is where editors do their actual editing work.

**Who can access:** Sales team members who have an EditorProfile (dual-role) or dedicated editors.

**Workspace sections:**

**A. Editor Profile**
- Shows editor's verified capabilities, hourly wage, max weekly hours
- Status: active/inactive

**B. Weekly Workload**
- Shows assigned tasks, active editing sessions, weekly hour tracking
- Helps editors manage their time

**C. Assigned Tasks**
- Tasks currently assigned to the editor
- Each task card shows: client, property, task type, priority, SLA deadline, source footage link
- Actions: Start editing, Pause, Upload final edit, Submit for QC

**D. Available Work**
- Tasks in `ready_for_editing` status that match the editor's capabilities
- Editors can self-claim available tasks

**E. Completed Tasks**
- History of tasks the editor has completed
- Shows QC outcomes and delivery status

**Editing Time Tracking:**
- `EditingTimeSession` records track active editing time
- Editor clocks in when starting, clocks out when pausing
- `active_editing_minutes` accumulates total editing time per task
- Used for labor cost analytics

**Final Edit Upload:**
- Editor uploads the finished edit to the job's Google Drive "Final Edits" folder
- `uploadFinalEdit` backend function handles the upload
- Task status moves to `submitted_for_qc` after upload

---

### 4.7 Commissions & Payroll

The commissions and payroll system manages how sales reps and media partners are compensated.

**Commission Plans:**
- Defined in `CommissionPlan` entity with versioned `CommissionPlanVersion` records
- Plan types: commission_only, base_plus_commission, salary
- Plans specify: commission rate, bonus structures, spiffs, overrides, draws
- Plans are versioned — changes create a new version, not overwrite

**Commission Generation:**
- When a deal is won or paid, `generateCommissionSourceRecord` creates a source record
- `processCommissionEligibility` evaluates the source record against the rep's plan
- Generates `Commission` records with: employee, type, gross amount, earned date
- Approval flow: pending → manager_reviewed → owner_approved
- Only owner-approved commissions are sent to payroll

**Payroll Sync:**
- `sendApprovedCompensationToPayroll` pushes approved commissions to Arriv Payroll
- Payroll status lifecycle: not_sent → sending → sent → accepted → scheduled → processed → paid
- `PayrollPeriod` and `PayrollPeriodSnapshot` track pay periods
- `PayrollReconciliation` handles discrepancies
- Employee sync: `syncEmployee` pushes SalesTeamMember data to Arriv Payroll

**Media Partner Payouts:**
- `ProviderCompensationSnapshot` records the immutable guaranteed payout per job
- `processWeeklyPayouts` runs every Friday at 4:45 AM ET
- `processInstantPayout` handles on-demand Stripe payouts
- `PayoutHistory` records all payouts
- `PaymentStatement` generates downloadable statements

**Payroll Dashboard (Admin):**
- View all payroll periods and their status
- Reconciliation queue for discrepancies
- Employee sync queue
- Payroll settings (API endpoint, company ID, secrets)

**Important:** Arriv One never computes withholding, employer taxes, or net pay — only gross compensation. All tax calculations are done by Arriv Payroll.

---

### 4.8 Chat & Communication (Connect)

The chat system (branded as "Arriv One | Connect") provides real-time internal communication and cross-app messaging.

**Chat Features:**
- **Channels:** Team-wide channels for group communication
- **Direct Messages (DMs):** One-on-one conversations between team members
- **Cross-App DMs:** Direct messages between Arriv Estate Media users and Arriv One users
- **Threads:** Reply to specific messages in a thread
- **Reactions:** Emoji reactions on messages
- **File Sharing:** Upload and share files
- **Message Deletion:** Delete your own messages
- **Call Transfers:** Transfer calls to other team members
- **Video Calls:** Initiate video calls (same-app and cross-tenant)
- **Conference Scheduling:** Schedule video conferences with multiple participants

**Chat Status:**
- Each rep has a chat status: online, available, busy, in_meeting, away, lunch, break, offline
- Status can auto-sync with Google Calendar (meetings set status to "in_meeting")

**Cross-App Messaging:**
- Messages between Arriv Estate Media and Arriv One are synced via backend functions
- `sendCrossAppChatMessage` sends outbound messages
- `receiveArrivOneChatMessage` receives inbound messages
- `loadCrossAppMessages` polls for new cross-app messages (every 3 seconds)
- `getCrossAppMessageNotifications` checks for unread cross-app messages

**Video Calls:**
- Same-app: `initiateVideoCall` creates a Twilio video room and token
- Cross-tenant: `initiateCrossTenantVideoCall` creates cross-app video rooms
- Video call invitations are sent as chat messages with a join link
- Format: "{Caller Name} would like to have a video conference with you, click here to join: Connect conference room {link}"
- Incoming video calls show a banner notification (top-right, only for real-time inbound messages)

**Floating Chat Bubble:**
- Draggable chat bubble in the bottom-right corner
- Shows unread message count badge
- Opens the full chat panel
- Cross-app video call invitations trigger a banner notification
- Regular messages only increment the badge (no top-right toast)
- Badge clears permanently when chat is opened (marks messages as read in DB)

**Admin Chat Bubble:**
- Similar to the floating chat bubble but for admin users
- Shows unread DirectMessage count
- Opens the same ChatTab interface
- Badge clears permanently when opened (marks messages as read in DB)

---

### 4.9 Email Hub

The Email Hub allows sales reps to send and receive emails from within the platform.

**Email Sending:**
- Each rep can connect their own email account:
  - **Gmail OAuth:** Rep authorizes via Google OAuth → system stores access/refresh tokens
  - **Microsoft OAuth:** Rep authorizes via Microsoft Graph → system stores tokens
  - **SMTP:** Admin configures SMTP settings (routed through Brevo relay)
- Emails are sent via the rep's connected email address
- `sendEmailViaGmail` or `sendInvoiceEmailViaGmail` for Gmail-connected reps
- `sendHubEmail` for SMTP/Brevo relay
- All sent emails are logged in `MessageLog` entity

**Email Receiving:**
- Inbound email forwarding via `smtpInboundWebhook` backend function
- Tenant configures inbound forwarding in their email provider
- `TenantEmailConfig` entity stores inbound settings and webhook token
- Received emails stored in `InboundEmail` entity
- Reps can view inbound emails in the Email Hub inbox

**Email Templates:**
- `EmailTemplate` entity stores reusable email templates
- Admin can create/edit templates in Email Templates page
- Templates support variables (contact name, deal info, etc.)
- Default templates provided via `getEmailTemplateDefaults`

**Sending From Banner:**
- A read-only banner shows which email address the rep is sending from
- Uses a Mail icon for clear sender identification

**Outbox vs. Inbox:**
- Outbox: Filters for messages initiated via the system platform (source = 'email_hub')
- Inbox: Shows all received mail (inclusive of all sources)

---

### 4.10 Recruiting & Careers Hub

The recruiting system manages the full hiring pipeline for media specialists and sales growth advisors.

**Public Careers Hub:**
- Available at `/careers` or `/careers/company/:companySlug`
- Shows all open job postings
- Each job has a custom-designed public page (AI-generated design spec)
- Job pages show: description, responsibilities, qualifications, benefits, compensation
- Applicants can apply directly from the public page

**Job Openings (JobOpening entity):**
- Admin creates job openings with: title, department, description, responsibilities, qualifications, compensation, location, employment type, work arrangement
- Each job gets a `public_slug` for clean URLs
- Admin can specify a `design_description` which the AI converts to a `design_spec` (colors, layout, fonts, etc.)
- Jobs can be: draft, open, paused, closed, filled

**Application Flow:**
1. Applicant views job page at `/careers/:jobId`
2. Applicant clicks "Apply" → redirected to application form at `/careers/:jobId/apply`
3. Applicant fills out: personal info, professional info, EEOC (voluntary), signature, samples, documents
4. Application submitted → `JobApplication` record created (status: `received`)
5. Source attribution tracked: UTM params, referrer URL, landing page, first touch, application source
6. Admin reviews in Admin Hub → Applications panel
7. Status progression: received → reviewing → accepted_pending → accepted → hired
   - Or: reviewing → interview_invitation → final_review → offer_extended → hired
   - Or: reviewing → denied / offer_not_extended

**Interview System:**
- **Async Interviews:** AI-powered video interviews using Tavus
  - `createTavusInterviewConversation` creates an interview session
  - Applicant records responses to preset questions
  - `saveSelfGuidedResponse` saves each response
  - `completeSelfGuidedInterview` finalizes the interview
  - Transcripts stored in `TavusInterviewTranscript`
  - Recordings stored and can be downloaded
- **Scheduled Interviews:** Human or AI interviews scheduled by admin
  - `scheduleConference` creates a conference
  - Interview reminders sent automatically (workflow)
  - `InterviewSession` and `InterviewResponse` track the interview

**Application Portal:**
- Applicants can check their status at `/ApplicationPortal`
- They enter their email to look up their application
- They can see: current status, admin updates, document requests, offer letters
- `portal_viewed_at` and `portal_view_count` tracked

**Recruiting Tools (Admin):**
- Recruiting Assistant: AI-powered prospect search and pipeline management
- Talent Pipelines: Track prospects through the recruiting funnel
- Recruiting Tasks: Task management for recruiting activities
- Pipeline Map: Visual map of recruiting prospects
- Recruiting Analytics: Funnel, source, prediction, retention analytics

**Offer Letters:**
- `OfferLetter` entity stores offer details
- `respondToOffer` allows applicants to accept/decline
- Offer emails sent via `sendSalesOfferExtendedEmail` / `sendSalesOfferNotExtendedEmail`

---

### 4.11 Sales Training & Orientation

The training system ensures sales reps are properly trained and oriented before selling.

**Sales Training Portal:**
- Reps access training modules at `/SalesTrainingPortal`
- `TrainingModule` entity stores module content (video, text, quiz)
- Reps watch training videos and take quizzes
- `TrainingAttempt` tracks quiz scores
- `TrainingCompletion` tracks module completion
- `SalesCertification` tracks certifications earned
- `VideoWatchProgress` tracks video viewing progress

**Sales Training Admin:**
- Admin manages training modules at `/SalesTrainingAdmin`
- Create, edit, publish, archive training modules
- Set training video URLs (`setSalesTrainingVideos`)
- Set welcome video URL (`setSalesWelcomeVideoUrl`)
- View completion rates and scores
- Training module manager for organizing content

**Sales Orientation:**
- New reps are auto-enrolled in orientation on hire (workflow trigger)
- Orientation steps:
  1. **Welcome Video** — Watch the welcome video
  2. **Personal Info** — Complete personal information
  3. **W-9** — Submit W-9 tax form
  4. **ICA** — Sign Independent Contractor Agreement
  5. **Training** — Complete required training modules
  6. **Stripe** — Set up Stripe Connect for payouts
  7. **Background Check** — Complete background check authorization
  8. **Direct Deposit** — Set up direct deposit (if W2)
  9. **Payroll Enrollment** — Complete payroll onboarding
- `checkOrientationStatus` checks what steps are complete
- `completeOrientationSection` marks a step complete
- `markOrientationComplete` finalizes orientation
- Admin tracks progress in `/AdminSalesOrientation`
- Orientation deadline reminders sent automatically (workflow)

**Orientation Documents:**
- `OrientationDocument` stores signed/completed documents
- `OrientationDocumentTemplate` stores document templates
- `publishOrientationDocument` publishes a document for reps to sign
- `recordOrientationDocument` records a rep's signed document

**Onboarding Wizard:**
- `SalesOnboardingWizard` component guides reps through onboarding
- `saveSalesOnboardingStep` saves progress on each step
- `getSalesOnboarding` retrieves onboarding state

---

### 4.12 Pricing & Compensation Engine

The pricing engine calculates the cost of media services based on property characteristics and package selection.

**Pricing Components:**

**A. Media Pricing Config (`MediaPricingConfig`)**
- Stores base prices for each package and add-on
- Configured per tenant
- Can be updated by admin

**B. Property Square Footage Lookup**
- `lookupPropertySqft` backend function queries a property data provider
- Returns square footage for the property address
- Square footage determines the pricing tier:
  - Small (under 2,000 sqft)
  - Medium (2,000–3,500 sqft)
  - Large (3,500–5,000 sqft)
  - Estate (5,000+ sqft)
- Each tier has a price multiplier or flat adjustment

**C. Pricing Snapshot (`PricingSnapshot`)**
- Created for each booking/job
- Stores the authoritative pricing calculation
- Immutable once created — serves as the source of truth
- Includes: base price, add-on prices, tier adjustment, discounts, final total

**D. Preferred Membership Discount**
- `PreferredMembership` entity tracks members with preferred status
- Members get discounted pricing
- `checkPreferredMembership` verifies membership status
- `createPreferredMembership` creates a new membership

**E. New Customer MLS Bonus**
- First-time customers get a $40 MLS sales bonus
- `checkNewCustomerMlsBonus` checks eligibility
- Bonus is credited to the referring sales rep
- Tracked on the Contact entity: `new_customer_bonus_eligible`, `new_customer_bonus_consumed`

**F. Compensation Engine (`MediaCompensationConfig`)**
- Stores compensation rates for media partners
- `calculateMediaCompensation` calculates the media partner's payout
- `ProviderCompensationSnapshot` stores the immutable guaranteed payout
- Payout = base rate + add-on rates + adjustments

**Pricing Calculation Flow:**
1. `calculateFullMediaPricing` or `calculateMediaPricing` is called
2. Looks up package base price from MediaPricingConfig
3. Looks up property sqft from PropertyLookup (or uses provided value)
4. Determines pricing tier from sqft
5. Applies tier adjustment to base price
6. Adds add-on prices
7. Applies Preferred membership discount (if applicable)
8. Applies new-customer bonus (if applicable)
9. Creates a PricingSnapshot with the final calculation
10. Returns the total price and breakdown

---

### 4.13 Referral Program

The referral program allows sales reps and clients to earn rewards for referring new business.

**Referral Flow:**
1. A referrer (sales rep or client) refers a new client
2. `Referral` entity records: referrer, referee, status, qualifying details
3. `qualifyReferral` checks if the referral meets qualification criteria
4. On qualification, a credit is added to the `ReferralCreditLedger`
5. Referrer can request a cash-out via `requestReferralCashOut`
6. `ReferralCashOutRequest` tracks the cash-out request
7. Admin approves/denies cash-out requests

**Referral Rewards (`referralRewards.ts`):**
- Defines reward amounts and structures
- Can be configured per tenant

**Referral Program Page (`/ReferralProgramPage`):**
- Reps can view their referral history
- See pending, qualified, and paid referrals
- Request cash-outs
- Track total referral earnings

---

### 4.14 Benefits & Time Off

The benefits and time-off system manages employee benefits and PTO.

**Time Off:**
- Reps request time off at `/TimeOff`
- `TimeOffRequest` entity: start date, end date, type (PTO, sick, personal, etc.), notes
- `manageTimeOff` handles create/approve/deny
- Manager review: managers can approve/deny requests
- `TimeOffBalanceCards` shows PTO balance, used, remaining
- `TimeOffCalendar` shows upcoming time off
- `AbsenceImpactPanel` shows impact of absence on pipeline/activities
- `ReturnFromPtoBanner` reminds reps returning from PTO

**Benefits:**
- Reps view benefits at `/Benefits`
- `BenefitsOverview` shows total compensation, benefits summary
- `TotalCompensationPanel` breaks down total comp (salary + commission + benefits)
- `OpenEnrollmentPanel` for open enrollment periods
- `LifeEventPanel` for reporting life events (marriage, birth, etc.) — `BenefitsLifeEvent`
- `ReimbursementPanel` for expense reimbursements
- `BenefitsAiAssistant` for benefits questions
- `BenefitsNotificationBanner` for important benefits notices
- `manageBenefits` handles benefit changes

**Manager Notes:**
- `ManagerNote` entity allows managers to leave notes on reps
- Used for performance tracking and coaching

**Sales Goals:**
- `SalesGoal` entity tracks rep goals (monthly, quarterly, annual)
- `manageGoals` handles goal CRUD
- Goals shown on performance dashboard

---

### 4.15 Field Prospecting

Field prospecting allows sales reps to find and research new real estate agent prospects.

**Field Prospecting Page (`/FieldProspectingPage`):**
- Reps can search for real estate agents in a geographic area
- `findProspectingRealtors` backend function searches for realtors
- `findRealtorListings` finds active listings for a realtor
- `claimProspectingContact` lets a rep claim a prospect
- `FieldProspect` entity stores prospect data

**Prospect Brief (`ProspectBrief` entity):**
- AI-generated research brief for each prospect
- `generateEstateMediaProspectBrief` generates the brief
- Contains: prospect info, why them, listing intelligence, media audit, professional video status, potential opportunity, suggested opening, questions to ask, likely objections
- Rep can add their own notes (`rep_notes`)
- Staging interest signal detection (physical staging is NOT currently sellable)

**Prospecting Workflow:**
1. Rep searches for realtors in a target area
2. System returns matching realtors with listing activity
3. Rep selects a prospect to research
4. AI generates a ProspectBrief with research and recommendations
5. Rep reviews the brief and adds their own notes
6. Rep claims the prospect (prevents other reps from contacting)
7. Rep contacts the prospect using the suggested opening
8. Rep logs the activity and updates the prospect status

---

### 4.16 Customer Success

The Customer Success page helps reps manage existing client relationships.

**Customer Success Page (`/CustomerSuccessPage`):**
- Shows reps their client portfolio
- Health scores for each client relationship
- Churn risk indicators
- Next best actions for each client
- Recommended products/upsells
- Communication history

**Customer 360 Intelligence (from Arriv One):**
- `engagement_score` (0-100)
- `relationship_age_days`
- `communication_preferences`
- `preferred_contact_method`
- `relationship_health` (healthy, at_risk, critical, churned)
- `churn_risk` (0-100)
- `next_best_action` and `next_best_action_timing`
- `upsell_opportunities`
- `recommended_products`
- `sales_memory` (successful approaches, objections, decision maker preferences)
- `recommendation_outcomes` and `recommendation_conversion_rate`
- `what_worked_previously`

**Customer Recovery:**
- `CustomerRecovery` entity tracks at-risk customers
- Reps can log recovery actions
- `ClosingDetection` entity tracks property closings (for pay-at-closing follow-up)

---

### 4.17 Discount Approvals

The discount approval system manages price discounts that require manager/owner approval.

**Discount Approval Flow:**
1. Sales rep requests a discount on a booking/deal
2. `DiscountRequestModal` lets the rep specify the discount amount and reason
3. `DiscountApproval` entity records the request
4. Manager reviews and approves/denies
5. On approval, the discount is applied to the booking
6. `approved_discount_amount` is set on the Booking
7. `commissionable_service_value` is recalculated (commission is based on the post-discount amount)

**Discount Approval Page (`/DiscountApprovalPage`):**
- Admin views all pending discount requests
- Can approve or deny each request
- Shows: rep, client, original price, requested discount, reason

**Types of Discounts:**
- **Preferred Discount:** Automatic discount for Preferred members
- **Approved True Discount:** Manually approved discount (requires approval)
- **Referral Tender:** Referral reward applied as a discount

---

### 4.18 Background Checks

The background check system ensures media partners and sales reps are properly vetted.

**Background Check Flow:**
1. Admin initiates background check via `initiateBackgroundCheck` or `initiateSalesBackgroundCheck`
2. Checkr integration sends an invitation to the candidate
3. Candidate completes the background check authorization
4. `BackgroundCheckAuthorizationModal` handles the authorization
5. Checkr processes the check
6. `handleCheckrWebhook` receives webhook updates from Checkr
7. `updateBackgroundCheckStatus` updates the status
8. Admin monitors status in `/AdminBackgroundChecks`

**Background Check States:**
- pending → in_progress → clear / consider / suspended

**Important:** Background checks must be clear before a media partner can be activated on the Job Board.

---

### 4.19 Arriv One Sync & Cross-App Integration

Arriv One is the central CRM platform. Arriv Estate Media synchronizes data bidirectionally with Arriv One.

**Sync Architecture:**
- **Outbound:** Estate Media → Arriv One via `deliverArrivOneSyncEvent`
- **Inbound:** Arriv One → Estate Media via `receiveArrivOneSyncEvent` webhook
- **HMAC Authentication:** `sync_hmac_v1` signature version for security
- **Idempotency:** `origin_event_id` prevents duplicate processing
- **Loop Prevention:** `origin_application` field prevents sync loops

**Sync Configuration (`ArrivOneTenantConfig`):**
- `arriv_one_tenant_id` — Canonical tenant ID
- `arriv_one_sync_enabled` — Master toggle
- `arriv_one_sync_mode` — disabled, test, migration, connected, paused, error
- `shared_entity_types` — Entity types approved for sync
- `arriv_one_sync_endpoint` — Arriv One receive endpoint URL
- `arriv_one_manifest_endpoint` — Manifest version check URL

**Synced Entities:**
- SalesTeamMember (employee data)
- Contact (customer data)
- Deal (sales pipeline)
- ActivityLog (activity history)
- SmsConversation / SmsMessage (SMS history)
- TimeOffRequest, BenefitsLifeEvent, ManagerNote, SalesGoal

**Sync Modes:**
- **disabled:** No sync
- **test:** Test mode — events sent but not committed
- **migration:** Historical data migration (requires explicit authorization)
- **connected:** Full production sync
- **paused:** Temporarily paused
- **error:** Sync error state

**Sync Status Pages:**
- `/AdminSyncStatus` — Current sync status
- `/AdminManifestConvergence` — Manifest version convergence
- `/EstateMediaAuthorityConsole` — Authority console for sync management
- `/AdminPlatformAccess` — Platform access management

**Sync Reconciliation:**
- `SyncReconciliation` entity tracks sync discrepancies
- `runEstateMediaSyncReconciliation` runs reconciliation checks
- `getEstateMediaSyncReconciliation` views reconciliation results
- Retention: 90 days (configurable via `reconciliation_retention_days`)

**Sync Outbox/Inbox:**
- `SyncOutbox` stores outbound events waiting to be sent
- `SyncInbox` stores inbound events waiting to be processed
- `drainArrivOneSyncOutbox` sends queued outbound events
- `CrossAppRecordMapping` maps records between apps

**Manifest System:**
- Product manifests define the canonical data model
- `getActiveManifest` retrieves the active manifest
- `consumeArrivOneProductManifest` applies manifest updates
- `checkArrivOneManifestVersions` checks for version mismatches
- `reconcileArrivOneManifests` reconciles manifest differences
- `getManifestConvergenceStatus` shows convergence status

**Historical Migration:**
- `manageEstateMediaMigrationGate` controls the migration gate
- `executeEstateMediaMigrationBatch` runs a migration batch
- `getEstateMediaPreMigrationInventory` shows pre-migration inventory
- `getEstateMediaMigrationDryRun` runs a dry-run
- Migration requires: `migration_authorized = true` AND `sync_mode = 'migration'`

---

### 4.20 KhethaIQ by Arriv (Recruiting/Hiring)

KhethaIQ is the recruiting and hiring intelligence system, embedded within Estate Media.

**KhethaIQ Page (`/KhethaIQ`):**
- Full recruiting dashboard with multiple views
- Job management, candidate pipeline, analytics, learning, comparisons

**Key Components:**
- **Dashboard View:** Overview metrics and pipeline funnel
- **Job Detail Panel:** Manage job openings and applications
- **Candidate Detail Panel:** View candidate profiles, recordings, scorecards
- **Applications Panel:** Review and process applications
- **Analytics Panel:** Funnel, source, prediction, retention, learning, question analytics
- **Ask Khetha:** AI-powered recruiting assistant
- **Reminder Queue:** Follow-up reminders for candidates
- **Global Search:** Search across all recruiting data

**Job Management:**
- `HireJob` entity stores internal job postings (separate from public JobOpening)
- `HireCandidate` stores candidates in the hiring pipeline
- `HireInterview` stores interview records
- `HirePerformance` tracks post-hire performance

**Candidate Flow:**
1. Application received (from public careers page or direct)
2. `syncApplicationToKhethaIQ` syncs to KhethaIQ
3. Candidate enters the pipeline: new → screening → interview → offer → hired
4. `manageHireHandoff` handles the handoff from recruiting to onboarding
5. `receiveKhethaIQHireEvent` receives hire events from KhethaIQ

**Scorecards:**
- Round 1 and Round 2 scorecards
- `Round1ScorecardForm` and `Round2ScorecardForm`
- `ScorecardEditor` for editing scorecards
- `scorecardScoring` handles scoring logic
- `parseRecordingToScorecard` auto-generates scorecard from interview recording

**Interview Recordings:**
- `VideoRecording` entity stores interview recordings
- `saveInterviewRecording` saves recordings
- `stitchInterviewRecording` stitches fragmented recordings
- `getTavusRecordingUrl` retrieves Tavus recording URLs
- `getTwilioRecordingUrl` retrieves Twilio recording URLs
- `CandidateRecordings` component displays recordings

---

## 5. Automated Workflows & Scheduled Tasks

The system has numerous automated workflows that run on schedules or triggers.

### Scheduled Workflows

| Workflow | Schedule | Description |
|---|---|---|
| Job Shoot Reminders | 9am, 24h, 90min, 1h before | Sends reminders to media partners before shoots |
| Job Shoot Reminders - Backup | Every 7 minutes | Backup reminder check |
| Daily Task Reminder Emails | Daily | Sends task reminders to reps |
| 5-Minute Task Reminder Email | Every 5 min | Urgent task reminders |
| Daily Upcoming Task Reminders | Daily | Upcoming task reminders |
| Daily Upcoming Task Email Reminder | Daily | Email version of task reminders |
| Send Footage Upload Reminders | Scheduled | Reminds media partners to upload footage |
| Footage Reminder Check | Every 5 min | Checks for overdue footage uploads |
| Footage Upload Reminder - 24h | Hourly | 24-hour footage reminder |
| Footage Reminder Check (7min) | Every 7 min | Backup footage reminder |
| Auto-Complete Jobs with Footage | Every 30 min | Auto-completes jobs with confirmed footage |
| Process Scheduled Bookings | Scheduled | Processes pending scheduled bookings |
| Check and Send Invoice Reminders | Scheduled | Sends invoice payment reminders |
| Send Scheduled Emails | Scheduled | Sends scheduled email campaigns |
| Send queued application emails | 8am ET daily | Sends queued application emails |
| Sweep queued application emails | Safety sweep | Safety net for missed emails |
| Process Commission Eligibility | Scheduled | Evaluates commission eligibility |
| Process Payroll Submissions | Scheduled | Submits payroll to Arriv Payroll |
| Process Employee Payroll Sync Queue | Scheduled | Syncs employees to payroll |
| Auto-Sync Employee to Arriv Payroll | Scheduled | Auto-syncs new employees |
| Generate Weekly Payment Statements | Weekly | Generates payment statements |
| Weekly Payment Statements | Weekly | Alternative statement generation |
| Process Weekly Stripe Payouts | Friday 4:45am ET | Processes weekly Stripe payouts |
| Reset Weekly Earnings | Friday 4am | Resets weekly earnings counters |
| Daily Morning Activity Summary | Daily morning | Sends morning activity summary |
| Daily Evening Activity Summary | Daily evening | Sends evening activity summary |
| Daily Property Closing Detection | Daily | Detects property closings |
| Scan MLS for Property Closings - Morning | Morning | MLS closing scan |
| Scan MLS for Property Closings - Afternoon | Afternoon | MLS closing scan |
| Check Property Closings (AI Scan) | Scheduled | AI-powered closing detection |
| Check Unanswered Chats | Scheduled | Alerts on unanswered chats |
| Sales Orientation Deadline Reminders | Scheduled | Reminds reps of orientation deadlines |
| KhethaIQ Layout Sync | 7am, 2pm, 9:30pm | Syncs layout with KhethaIQ |
| Arriv One Sync Outbox Drain | Scheduled | Drains sync outbox |
| Arriv One Sync Hourly Reconciliation | Hourly | Reconciles sync state |
| Arriv One Manifest Version Check | Scheduled | Checks manifest versions |
| Continuous Recruiting Cycle | Continuous | Runs recruiting cycle |
| Sync All Sales Team Calendar Status | Scheduled | Syncs calendar status |
| Sync Admin Calendar Status | Scheduled | Syncs admin calendar |
| Auto-Start Sales Orientation on Hire | On hire | Auto-enrolls new hires |
| Auto-Schedule Follow-up from Activity | On activity | Schedules follow-ups |
| Async Interview Reminder Scheduler | Scheduled | Sends interview reminders |
| September 1 Async Interview Conversion | One-time | Converts scheduled to async interviews |

### Entity-Triggered Workflows

| Workflow | Trigger | Description |
|---|---|---|
| Sync Trigger — ActivityLog | ActivityLog create/update | Syncs to Arriv One |
| Sync Trigger — Contact | Contact create/update | Syncs to Arriv One |
| Sync Trigger — Deal | Deal create/update | Syncs to Arriv One |
| Sync Trigger — SalesTeamMember | SalesTeamMember create/update | Syncs to Arriv One |
| Sync Trigger — SmsConversation | SmsConversation create/update | Syncs to Arriv One |
| Sync Trigger — SmsMessage | SmsMessage create/update | Syncs to Arriv One |
| Sync Trigger — TimeOffRequest | TimeOffRequest create/update | Syncs to Arriv One |
| Sync Trigger — BenefitsLifeEvent | BenefitsLifeEvent create/update | Syncs to Arriv One |
| Sync Trigger — ManagerNote | ManagerNote create/update | Syncs to Arriv One |
| Sync Trigger — SalesGoal | SalesGoal create/update | Syncs to Arriv One |
| Sync New Applicant to KhethaIQ | JobApplication create | Syncs to KhethaIQ |
| Notify Contractors of New Jobs | Job create | Notifies media partners |
| Handle SalesTeamMember Change | SalesTeamMember change | Handles cross-app sync |

---

## 6. Integrations & Connectors

### Authorized Connectors

| Connector | Integration Type | Scopes | Purpose |
|---|---|---|---|
| **HubSpot** | hubspot | contacts, companies, deals, owners, line items, products, lists, schemas, tickets | CRM sync (legacy + ongoing) |
| **Google Drive** | googledrive | drive.file, email | Source media storage, final edit storage, invoice storage |
| **Gmail** | gmail | gmail.send, gmail.readonly, email | Per-rep email sending and reading |
| **Google Calendar** | googlecalendar | calendar, calendar.events, email | Calendar sync for chat status, scheduling |

### External Service Integrations (via Secrets)

| Service | Secret(s) | Purpose |
|---|---|---|
| **Twilio** | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID | Voice calls, SMS, video calls |
| **Stripe** | STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, VITE_STRIPE_PUBLISHABLE_KEY | Payment processing, payouts |
| **Brevo** | BREVO_API_KEY, BREVO_WEBHOOK_SECRET | Email sending (system + relay) |
| **Checkr** | (via handleCheckrWebhook) | Background checks |
| **Tavus** | TAVUS_API_KEY | AI-powered video interviews |
| **Zamzar** | ZAMZAR_API_KEY | File format conversion |
| **AWS S3** | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_ROLE_ARN, AWS_S3_REGION, AWS_S3_BUCKET | File storage |
| **Arriv One** | ARRIV_ONE_SERVICE_TOKEN, ARRIV_ONE_APP_ID, ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET, ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET, ARRIV_ONE_CHAT_SECRET, ARRIV_ONE_CHAT_WEBHOOK_URL, ARRIV_ONE_VIDEO_SERVICE_URL | Cross-app sync, chat, video calls |
| **Arriv Payroll** | ARRIV_PAYROLL_API_ENDPOINT, ARRIV_PAYROLL_API_SECRET, ARRIV_PAYROLL_COMPANY_ID, ARRIV_PAYROLL_WEBHOOK_SECRET, ARRIV_PAYROLL_HANDOFF_SECRET, ESTATE_MEDIA_PAYROLL_SYNC_SECRET, ARRIV_PAYROLL_BENEFITS_PORTAL_URL | Payroll processing |
| **KhethaIQ** | KHETHAIQ_APP_URL, KHETHAIQ_API_KEY, KHETHAIQ_IMPORT_ENDPOINT | Recruiting/hiring integration |
| **Arriv Assist** | ARRIV_ASSIST_ENDPOINT, ARRIV_ASSIST_AUTH_SECRET | AI assistant |
| **Google OAuth** | VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Google sign-in and API access |
| **Microsoft OAuth** | MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET | Microsoft email integration |
| **Slack** | SLACK_CLIENT_ID, SLACK_CLIENT_SECRET | Slack integration |
| **Base44** | BASE44_SERVICE_TOKEN, BASE44_APP_DOMAIN | Platform authentication |
| **Admin/Owner** | ADMIN_EMAIL, ADMIN_PHONE, BRADLEY_PHONE, OWNER_PHONE_NUMBER | Admin contact info |

### Webhook Endpoints

All webhooks are served at `https://arrivestatemedia.base44.app/functions/<functionName>`:

| Webhook | Function | Purpose |
|---|---|---|
| Stripe | handleStripeWebhook | Payment events |
| Checkr | handleCheckrWebhook | Background check updates |
| Twilio SMS | twilioSmsWebhook | Inbound SMS |
| Twilio Voice | twilioVoiceHandler | Inbound calls |
| Twilio Recording | twilioRecordingCallback | Call recordings |
| Twilio Transfer Status | transferStatusCallback | Call transfer status |
| Twilio Missed Call | handleMissedCall | Missed call handling |
| Brevo | brevoWebhook | Email events |
| SMTP Inbound | smtpInboundWebhook | Inbound email |
| Arriv One Sync | receiveArrivOneSyncEvent | Cross-app sync events |
| Arriv One Chat | receiveArrivOneChatMessage | Cross-app chat messages |
| Arriv One Video Call | receiveArrivOneVideoCall | Cross-app video call invitations |
| Arriv Payroll Status | receivePayrollStatus | Payroll status updates |
| Arriv Payroll Reconciliation | receivePayrollReconciliation | Payroll reconciliation |
| Arriv Payroll Readiness | receivePayrollReadiness | Payroll readiness |
| Arriv Payroll Owner Notification | receivePayrollOwnerNotification | Payroll owner notifications |
| Arriv Payroll Contractor Doc | receivePayrollContractorDocument | Contractor documents |
| KhethaIQ Hire Event | receiveKhethaIQHireEvent | Hire events from KhethaIQ |

---

## 7. Security & Access Control

### Authentication

- **Admin users:** Base44 platform authentication (email/password, Google, Microsoft, etc.)
- **Sales reps:** Custom authentication via `/SalesLogin` (PBKDF2 password hashing)
- **Media partners & clients:** Custom signup/login flows
- **Password security:** PBKDF2 with salt (legacy SHA-256 migrated on next login)
- **Force password change:** New reps must change password on first login

### Row-Level Security (RLS)

| Entity Category | Read | Create | Update | Delete |
|---|---|---|---|---|
| Admin-only (Jobs, Bookings, Invoices, EditingTasks, etc.) | Admin only | Admin only | Admin only | Admin only |
| Sales-rep-scoped (Contacts, Deals, Activities) | Own records + Admin | Own + Admin | Own + Admin | Admin only |
| Tenant-scoped (QueueInsight) | Same tenant | Same tenant | Same tenant | Same tenant |
| Public-create (JobApplication, InboundEmail, SecurityAuditLog) | Admin only | Anyone | Admin only | Admin only |

### Security Audit

- `SecurityAuditLog` entity tracks all security-relevant events:
  - Login success/failure
  - Password reset/change
  - Account creation/deactivation
  - Role/permission changes
  - Admin actions
  - Sensitive exports
  - Data deletions
  - Webhook verification failures
  - Rate limit triggers
  - Suspicious requests
  - Security config changes
  - MFA challenge/failure
- IP addresses are hashed (SHA-256), never stored raw
- Secrets, passwords, tokens, OTPs are NEVER logged
- User agents truncated to 200 chars

### Rate Limiting

- `rateLimiter.ts` shared module provides rate limiting
- Applied to webhook endpoints and authentication

### HMAC Signature Verification

- All incoming webhooks are verified via HMAC signatures
- `syncHmacAuth.ts` for Arriv One sync
- `twilioWebhookValidation.ts` for Twilio webhooks (HMAC-SHA1 Base64)
- Brevo webhook uses `BREVO_WEBHOOK_SECRET`

---

## 8. Troubleshooting & Known Issues

### Common Issues & Solutions

| Issue | Cause | Solution |
|---|---|---|
| Sales rep can't log in | Password mismatch between sales auth and platform | Use best-effort login; data fetched server-side |
| Admin redirected to sales page | Sales session overrides admin role | Platform admin role takes precedence; clear sales session if needed |
| Chat badge reappears after refresh | Messages not marked as read in DB | Fixed: badge now clears permanently on open |
| Video call notification on page load | Polling triggers banner on initialization | Fixed: banner only triggers for real-time inbound messages |
| Top-right toast for regular messages | ChatWindow fired toast for all messages | Fixed: toast only for cross-app video call invitations |
| Cross-app messages not propagating | ChatMessage not in shared_entity_types | Use polling-based approach (loadCrossAppMessages) |
| Interview recording fragmentation | Intermittent recording issues | stitchInterviewRecording auto-stitches fragments |
| Email sending limit reached | Daily Brevo limit | Use per-rep email connections to distribute sending |
| App publishing failure | Config migration issues | Check base44/config.jsonc |
| FloatingChatBubble drag unresponsive | Pointer event handling | Fixed: uses pointer capture for reliable dragging |

### Debugging Tools

- `/AdminSyncStatus` — Check Arriv One sync status
- `/AdminManifestConvergence` — Check manifest convergence
- `/EstateMediaAuthorityConsole` — Authority console for sync
- `getEstateMediaSyncStatus` — Backend function for sync status
- `debugSignIn` — Backend function for login debugging
- `debugUserLookup` — Backend function for user lookup debugging
- `debugHash` — Backend function for password hash debugging
- `securityRegressionTest` — Backend function for security testing
- `runOrientationTests` — Backend function for orientation testing

### Support

For platform issues, contact Arriv support. For app-specific issues, check the Logs page in the Base44 dashboard.

---

## 9. Glossary

| Term | Definition |
|---|---|
| **Arriv One** | Central CRM platform that Estate Media syncs with |
| **Arriv Payroll** | Payroll processing system |
| **KhethaIQ** | Recruiting/hiring intelligence system embedded in Estate Media |
| **Media Partner** | Independent contractor who captures photos/videos at properties |
| **Sales Growth Advisor** | Sales rep who sells media services to real estate agents/builders |
| **Client** | Real estate agent or builder who orders media services |
| **Connect** | The chat/communication system (branded as "Arriv One | Connect") |
| **Editing Queue** | Post-production task management system |
| **Editor Workspace** | Individual editor's work interface |
| **QC** | Quality Control review of edited media |
| **SLA** | Service Level Agreement — deadline for editing/delivery |
| **PricingSnapshot** | Immutable record of the authoritative pricing for a booking/job |
| **ProviderCompensationSnapshot** | Immutable record of the guaranteed payout for a media partner |
| **Preferred Membership** | Discounted pricing tier for preferred clients |
| **Pay-at-Closing** | Payment option where client pays when the property closes |
| **New Customer MLS Bonus** | $40 credit for first-time MLS customers, credited to the referring rep |
| **Supra** | Lockbox system for property access |
| **Tavus** | AI-powered video interview platform |
| **Checkr** | Background check provider |
| **Brevo** | Email sending provider (system + relay) |
| **Zamzar** | File format conversion service |
| **RLS** | Row-Level Security — data access control per entity |
| **Tenant** | Isolated business unit (default: tnt_estate_media) |
| **Manifest** | Canonical data model definition for cross-app sync |
| **Sync Mode** | State of Arriv One synchronization (disabled, test, migration, connected, paused, error) |
| **Dual-Role Admin** | Sales team member who is also a platform admin (can switch between Sales and Editing modes) |
| **EditorProfile** | Profile that enables a sales rep to work as an editor |
| **ProspectBrief** | AI-generated research brief for a sales prospect |
| **Customer 360** | Arriv One-authoritative customer intelligence (engagement, health, churn risk, recommendations) |
| **QueueInsight** | AI recommendation tracking for sales call timing |
| **Cross-App DM** | Direct message between Arriv Estate Media and Arriv One users |
| **Idempotency Key** | Unique key preventing duplicate processing of sync events |
| **Origin Event ID** | Identifier for loop prevention in cross-app sync |
| **Immutable Shared ID** | Permanent cross-app identifier for a record |

---

*This training manual is a living document. As the platform evolves, update this document to reflect new features, workflows, and provisioning steps.*