# Arriv Estate Media — Complete Application Feature Map

> **What this app is:** Arriv Estate Media is a multi-sided business operating platform for a real-estate media company. It serves **five distinct user types** — Media Partners (contractors who shoot photos/video), Clients (real estate agents who book shoots), Sales Team members (Sales Growth Advisors who sell media services), Admins (company operators), and a recruiting/hiring pipeline (KhethaIQ). The app is published at `arrivestatemedia.base44.app`.

---

## TABLE OF CONTENTS

1. [Authentication & User Types](#1-authentication--user-types)
2. [App Shell & Navigation (Layout)](#2-app-shell--navigation-layout)
3. [Media Partner (Contractor) Features](#3-media-partner-contractor-features)
4. [Client Features](#4-client-features)
5. [Sales Team (Arriv One) Features](#5-sales-team-arriv-one-features)
6. [Admin Features](#6-admin-features)
7. [KhethaIQ Recruiting System](#7-khethaiq-recruiting-system)
8. [Interview System (Human + AI + Async)](#8-interview-system-human--ai--async)
9. [Payroll, HR & Onboarding](#9-payroll-hr--onboarding)
10. [Training & Certification System](#10-training--certification-system)
11. [Communications (Email, SMS, Push)](#11-communications-email-sms-push)
12. [Cross-App Sync & Migration](#12-cross-app-sync--migration)
13. [Support System](#13-support-system)
14. [Automated Workflows (Scheduled)](#14-automated-workflows-scheduled)
15. [Integrations & Connectors](#15-integrations--connectors)

---

## 1. Authentication & User Types

**Location:** `src/pages/SignIn.jsx`, `src/pages/SalesLogin.jsx`, `src/pages/ClientSignup.jsx`, `src/pages/MediaPartnerSignup.jsx`, `src/lib/AuthContext.jsx`

The app uses a **dual auth system**:
- **Base44 platform auth** — for admins and media partners (email/password via Base44's hosted auth)
- **Custom sales auth** — for Sales Team members (stored in `localStorage` as `sales_member_id`, `sales_member_name`, `sales_member_email`, `sales_member_role`)

**Five user types:**
| Type | `user_type` | Auth method | Landing page |
|---|---|---|---|
| Admin | `role: "admin"` | Base44 auth OR sales session with `role: admin` | AdminHub |
| Sales Team | `user_type: "sales"` | Custom sales login | HubSpotActivityLog |
| Client | `user_type: "client"` | Base44 auth | BookingPage |
| Media Partner | `user_type: "media_partner"` | Base44 auth | JobBoard |
| Public/Anonymous | none | none | JobBoard (public jobs) |

**How it works:** `Layout.jsx` reads from `localStorage`/`sessionStorage` first (sales session), then falls back to `base44.auth.me()`. If a user has both a sales session AND a Base44 admin role, the admin role takes precedence for navigation visibility while the sales session provides data access. A forced password-change gate redirects newly-onboarded sales reps to `SalesChangePassword` if `sales_force_password_change` is set.

---

## 2. App Shell & Navigation (Layout)

**Location:** `src/Layout.jsx`, `src/components/layout/MobileBottomTabs.jsx`, `src/components/layout/PageTransition.jsx`, `src/components/layout/NewJobsBadge.jsx`

**The Layout** wraps every page with:
- **Sticky dark header** (`#1A1A1A` with gold `#B8956A` accents) containing the Arriv logo, role-based nav items, account settings link, user name/role display, and logout button
- **Role-based nav items** — different nav arrays for sales team, admin, client, and media partner (see `navItems` in Layout.jsx)
- **Mobile hamburger menu** — slides down with all nav items on mobile
- **Mobile bottom tabs** — fixed bottom navigation for primary routes (JobBoard, Dashboard, Bookings, Settings, Payouts, Supra) with scroll-position memory per route
- **Page transitions** — framer-motion fade/slide between routes
- **New jobs badge** — red count badge on the Jobs nav item showing how many jobs were created since the media partner last viewed the job board (subscribes to Job entity changes in real-time)
- **Back button** — shown on non-primary routes for non-sales users
- **Theme variables** — CSS custom properties for cream/gold/black palette with light/dark mode support via `prefers-color-scheme`

**Providers wrapped around the app** (`src/App.jsx`):
- `AuthProvider` — manages auth state
- `QueryClientProvider` — TanStack React Query for data fetching/caching
- `BrowserRouter` — routing
- `Toaster` + `SonnerToaster` — toast notifications
- `CallStatusProvider` — tracks live video call status globally
- `SupportProvider` — support chat context

---

## 3. Media Partner (Contractor) Features

Media Partners are the photographers/videographers who shoot real estate properties.

### 3a. Job Board
**Location:** `src/pages/JobBoard.jsx`, `src/components/jobs/JobCard.jsx`, `src/components/jobs/CancelJobDialog.jsx`

- **Browse available gigs** — fetches jobs with `status: open` or `booked` and `from_booking: true`
- **Search & filter** — text search by title/location/description; tab filter for All/Open/Booked
- **Coverage area filtering** — uses Google Maps geocoding to calculate haversine distance from the partner's coverage center to each job location; filters out jobs beyond their `max_travel_distance`; also filters by state
- **Book a job** — confirmation dialog → calls `bookJobAndSendCalendarInvite` backend function (creates Google Calendar invite, notifies admin)
- **Apparel gate** — partners can accept up to 2 jobs without purchasing the $50 shirt & jacket; after that they're blocked and redirected to `PurchaseApparel`
- **Background check gate** — if `background_check_status` is not "clear", shows authorization modal → initiates Checkr background check → blocks booking until clear
- **Cancel a job** — cancel dialog with reason → calls `cancelJobWithNotification` → reassigns to backup contractor if one exists → notifies admin
- **Book as backup** — partners can sign up as backup for a job already booked by someone else
- **Pull-to-refresh** — touch-drag refresh on mobile
- **Real-time updates** — subscribes to Job and Booking entity changes; auto-refreshes the list

### 3b. Media Partner Dashboard
**Location:** `src/pages/MediaPartnerDashboard.jsx`, `src/components/mediapartner/*`

- **Current balance** — sum of completed-but-unpaid jobs this pay period (Friday 4am to Friday 4am); shows pending balance for jobs awaiting client payment clearance (1-2 business days)
- **Booked amount** — total pay from active (booked/in_progress) jobs
- **Active jobs count** and **completed jobs count** (all-time)
- **Coverage area settings** — set coverage area (city/state), max travel distance, and state; geocoded for distance filtering
- **Package info dropdown** — shows the media package details (what's included in shoots)
- **Earnings breakdown** — breakdown of earnings by job with pay rates
- **Payout method (Stripe Connect)** — set up direct deposit via Stripe Connect onboarding; shows payout-enabled status; "Update bank info" button
- **Instant payout** — if Stripe is enabled and balance > 0, can request an instant payout (Stripe instant transfer) instead of waiting for Friday
- **Payout history** — list of all past payouts with dates and amounts
- **Booked jobs list** — active jobs with status, date, location, pay
- **Pull-to-refresh** wrapper

### 3c. Payout Records
**Location:** `src/pages/PayoutRecords.jsx`, `src/components/payoutrecords/*`

- **Payout overview** — total earnings, year-to-date, this year's payouts
- **Weekly statements** — downloadable weekly payment statements (PDF)
- **Monthly statements** — monthly earning summaries
- **Tax documents** — 1099 tax forms (for contractors)
- **Payout history tab** — full transaction history

### 3d. Supra Access
**Location:** `src/pages/SupraAccess.jsx`

- **Supra keybox access** — manages Supra lockbox access credentials for media partners who need to access locked properties via Supra iBox/ActiveKEY
- Shows access code / instructions

### 3e. Background Check
**Location:** `src/pages/BackgroundCheck.jsx`, `src/components/backgroundcheck/BackgroundCheckAuthorizationModal.jsx`, `base44/functions/initiateBackgroundCheck/entry.ts`, `base44/functions/handleCheckrWebhook/entry.ts`

- **Checkr integration** — initiates a background check via Checkr API; creates a candidate + invitation; partner completes the Checkr invitation flow
- **Webhook handler** — receives Checkr webhook results (clear/consider/suspended) → updates `background_check_status` on the user record
- **Authorization modal** — explains the background check requirement and captures consent before initiating

### 3f. Media Partner Signup & Onboarding
**Location:** `src/pages/MediaPartnerSignup.jsx`, `src/pages/OrientationAddress.jsx`, `src/pages/OrientationVideo.jsx`, `src/pages/OrientationSizes.jsx`, `src/pages/OrientationOnboardingFee.jsx`, `src/pages/PurchaseApparel.jsx`

- **Signup flow** — collects name, email, phone, address, coverage area → creates a `PendingSignup` record
- **Onboarding fee** — $50 onboarding fee via Stripe payment intent
- **Orientation video** — watch required orientation video
- **Address verification** — confirm service address
- **Apparel sizing** — select shirt & jacket sizes
- **Apparel purchase** — $50 apparel purchase via Stripe (required after 2 jobs)

### 3g. Gear Checkout
**Location:** `src/components/mediapartner/GearCheckout.jsx`, `base44/functions/uploadGearImages/entry.ts`

- Upload gear images (camera, drone, stabilizer) for verification

---

## 4. Client Features

Clients are real estate agents who book media shoots for their listings.

### 4a. Booking Page
**Location:** `src/pages/BookingPage.jsx`, `src/components/booking/BookingForm.jsx`, `base44/functions/handleBookingSubmission/entry.ts`

- **Book a shoot** — select package (photo, video, drone, twilight, etc.), property address, date, time, add-ons
- **Coverage area validation** — checks if the property is within a serviceable area
- **Pricing** — calculates price based on package + add-ons + property type
- **Payment options** — pay upfront (Stripe) or pay at closing (invoice)
- **Google Calendar invite** — automatically creates a calendar event for the client
- **Confirmation** — creates a `Booking` record and posts a `Job` to the job board for contractors

### 4b. Client Bookings
**Location:** `src/pages/ClientBookings.jsx`

- **My bookings** — list of all past and upcoming bookings with status
- **Booking change requests** — request date/time changes via `BookingChangeRequest` entity
- **View job completion** — see completed media and download deliverables

### 4c. Client Signup
**Location:** `src/pages/ClientSignup.jsx`, `base44/functions/signupClient/entry.ts`

- Client registration with business details

### 4d. Client Terms
**Location:** `src/pages/ClientTermsConditions.jsx`, `base44/functions/generateSignedClientTerms/entry.ts`

- Electronic terms acceptance with typed signature

---

## 5. Sales Team (Arriv One) Features

The Sales Team features are branded as "Arriv One" — a full sales CRM and operations system for Sales Growth Advisors.

### 5a. Sales Login & Password Management
**Location:** `src/pages/SalesLogin.jsx`, `src/pages/SalesChangePassword.jsx`, `src/pages/ForgotPassword.jsx`, `src/pages/ForgotEmail.jsx`, `base44/functions/salesTeamLogin/entry.ts`, `base44/functions/changeSalesRepPassword/entry.ts`

- **Custom login** — email + password (bcrypt hashed, stored on `SalesTeamMember` entity)
- **Forced password change** — new reps must change their temporary password on first login
- **Forgot password / forgot email** — recovery flows via email

### 5b. HubSpot Activity Log (Sales Dashboard)
**Location:** `src/pages/HubSpotActivityLog.jsx`, `src/components/sales/*`

This is the **core sales CRM workspace** — a multi-tab interface:
- **Contacts tab** — search, browse, and manage HubSpot contacts; claim prospects; convert leads to customers; view customer 360
- **Dialer tab** — iPhone-style dialer; makes outbound calls via Twilio; logs call activity; transfers calls (warm transfer, blind transfer, conference transfer)
- **Call queue tab** — daily call queue with prioritized prospects
- **Chat tab** — SMS inbox via Twilio; real-time conversation view; chat channels for team communication
- **Email tab** — Gmail-like inbox; compose emails via Gmail API or SendEmail; Gmail OAuth for sending as the rep
- **Calendar tab** — view upcoming meetings/appointments; schedule follow-ups
- **Prospecting tab** — find realtors from listing platforms; claim prospects; digital prospecting
- **AI Assistant tab** — AI-powered sales assistant for call maps, coaching, and analysis
- **Recordings tab** — call and video recordings
- **Activity archive** — historical activity log

### 5c. Sales Performance Dashboard
**Location:** `src/pages/SalesPerformanceDashboard.jsx`, `base44/functions/computeSalesPerformance/entry.ts`

- **Daily goals** — calls, emails, texts, conversations, appointments, deals, revenue, commission (with progress bars vs targets)
- **KPI dashboard** — weekly/monthly/quarterly/yearly toggle; 13 KPIs including calls, talk time, emails, texts, new contacts, follow-ups, meetings, deals won/lost, revenue, commission, close rate, avg deal size
- **Pipeline funnel** — leads → conversations → appointments → clients → revenue (visual funnel)
- **AI Sales Health Score** — LLM analyzes the rep's metrics and generates a 0-100 health score, summary, strengths, areas for improvement, recommended actions, and growth trends (via `InvokeLLM` with JSON schema)
- **Culture banner** — daily inspirational message (Bible, Quran, Torah, Buddhist, Hindu, or Secular — rep-selectable source); verse reference modal
- **Friday mode** — special Friday view showing whether weekly goals are met; if met, encourages rest; if not, shows what remains

### 5d. Sales Training Portal
**Location:** `src/pages/SalesTrainingPortal.jsx`, `src/components/sales/SalesTrainingContent.jsx`

- See [Section 10: Training & Certification](#10-training--certification-system)

### 5e. Field Prospecting
**Location:** `src/pages/FieldProspectingPage.jsx`, `base44/entities/FieldProspect.jsonc`

- **Log field prospects** — record prospects found in the field (listing signs, open houses, builder developments, etc.)
- **Source type** — listing platform, social media, agent website, local sign, open house, builder/developer, referral, inbound
- **Prospect type** — individual agent, real estate team, brokerage, builder, developer
- **Research status** — not started / in progress / completed
- **Professional video status** — unknown / no professional video / professional video present / coming soon
- **Qualification status** — unqualified / pending / qualified / disqualified
- **Convert to CRM** — turn a field prospect into a Contact record

### 5f. Referral Program
**Location:** `src/pages/ReferralProgramPage.jsx`, `base44/entities/Referral.jsonc`, `base44/entities/ReferralCreditLedger.jsonc`

- **Log referrals** — record a customer referring a new party
- **Qualification tracking** — pending / qualified / disqualified
- **Referral credit** — $20 credit earned per qualifying referral (when the referred party completes their first order)
- **Credit ledger** — running balance of earned/redeemed/reversed credits per customer
- **Redemption** — apply credit toward a deal

### 5g. Customer Success
**Location:** `src/pages/CustomerSuccessPage.jsx`, `base44/entities/CustomerRecovery.jsonc`

- **Customer recovery** — track and resolve customer issues (minor/major/critical severity)
- **Close-the-loop** — assigned rep must follow up and close the loop on any customer issue
- **Outcome tracking** — exceeded expectations / met expectations / minor issue / major issue / no response
- **Status workflow** — open → in progress → resolved → closed

### 5h. Discount Approval Workflow
**Location:** `src/pages/DiscountApprovalPage.jsx`, `src/components/sales/DiscountRequestModal.jsx`, `base44/entities/DiscountApproval.jsonc`

- **Rep requests discount** — percentage, flat amount, or free add-on; provides reason
- **Admin approval queue** — admins see pending requests; approve/deny with conditions
- **Expiration** — approvals expire if not used within a timeframe
- **Audit trail** — DISCOUNT_REQUESTED, DISCOUNT_APPROVED, DISCOUNT_DENIED events

### 5i. Employee Profile
**Location:** `src/pages/EmployeeProfile.jsx`, `src/components/sales/EditMyProfileModal.jsx`, `src/components/sales/ProfilePictureUpload.jsx`

- **View/edit profile** — personal info, profile picture, contact details
- **Employment details** — title, department, manager, hire date, classification (W2/contractor)

### 5j. Time Off
**Location:** `src/pages/TimeOff.jsx`, `src/components/timeoff/*`, `base44/functions/manageTimeOff/entry.ts`

- **Request time off** — submit PTO/sick/unpaid requests with dates and reason
- **Balance cards** — available PTO, sick, used, remaining
- **Manager approval** — managers see pending requests and approve/deny
- **Calendar view** — see team time-off on a calendar
- **Absence impact** — shows how time off affects payroll/performance
- **Return-from-PTO banner** — reminds returning employees

### 5k. Benefits
**Location:** `src/pages/Benefits.jsx`, `src/components/benefits/*`, `base44/functions/manageBenefits/entry.ts`

- **Benefits overview** — current enrollment, total compensation
- **Open enrollment** — enrollment periods
- **Life events** — qualifying life events (marriage, birth, etc.)
- **Reimbursements** — expense reimbursement requests
- **Benefits AI assistant** — AI-powered benefits question answering

---

## 6. Admin Features

### 6a. Admin Hub
**Location:** `src/pages/AdminHub.jsx`, `src/components/admin/AdminDashboardGrid.jsx`

- **Two tabs:** Admin Dashboard (grid of admin tools) and My Dashboard (the rep's own HubSpot Activity Log)
- **Profile picture upload** and edit profile
- **Permission banner** — prompts to enable sound notifications
- **Incoming video call handling** — listens for `PendingNotification` events for incoming video calls; accept/decline; video call panel
- **Admin chat bubble** — floating chat for admin-to-admin/team communication
- **Call status sync** — syncs chat status with Google Calendar every 3 minutes

### 6b. Admin Dashboard Grid
**Location:** `src/components/admin/AdminDashboardGrid.jsx`

- Grid of cards linking to all admin tools (commissions, payroll, background checks, sales team, etc.)

### 6c. Sales Team Management
**Location:** `src/pages/AdminSalesSignup.jsx`, `base44/functions/createSalesTeamMember/entry.ts`

- **Add sales team members** — create new rep accounts with name, email, role, territory
- **Manage reps** — view all team members, edit, deactivate
- **Role assignment** — admin or user role

### 6d. Sales Rep Activity
**Location:** `src/pages/AdminSalesRepActivity.jsx`

- **Monitor rep activity** — view individual rep call/email/text/meeting activity
- **Activity log** — detailed log of all rep actions

### 6e. Background Checks (Admin)
**Location:** `src/pages/AdminBackgroundChecks.jsx`

- **View all background checks** — status of each rep/partner's Checkr background check
- **Initiate manual checks** — for reps without Checkr

### 6f. Commissions
**Location:** `src/pages/AdminCommissions.jsx`, `base44/entities/Commission.jsonc`, `base44/entities/CommissionPlan.jsonc`, `base44/entities/CommissionPlanVersion.jsonc`

- **Commission plans** — define commission structures (base + tiered + bonuses)
- **Commission approvals** — review and approve commission events
- **Commission adjustments** — manual corrections
- **Sync to payroll** — approved commissions are sent to Arriv Payroll
- **Source records** — `CommissionSourceRecord` tracks the originating deal/invoice

### 6g. Payroll Dashboard
**Location:** `src/pages/AdminPayrollDashboard.jsx`, `src/components/payroll/*`

- **Payroll integration** — compensation approved in Arriv One is synchronized with Arriv Payroll (external payroll system)
- **Status groups** — approved-but-unsent, failed sync, accepted by payroll, scheduled, recently paid
- **Payroll periods** — manage pay periods; lock periods when finalized
- **Reconciliation queue** — resolve discrepancies between Arriv One and Arriv Payroll
- **Payroll submissions** — batch submission of compensation to payroll

### 6h. Payroll Settings
**Location:** `src/pages/AdminPayrollSettings.jsx`, `base44/functions/managePayrollSettings/entry.ts`

- **Arriv Payroll API config** — endpoint, company ID, API secret
- **Webhook secret** — for receiving payroll status webhooks
- **Benefits portal URL**

### 6i. Sales Orientation (Admin)
**Location:** `src/pages/AdminSalesOrientation.jsx`, `src/pages/SalesOrientationDashboard.jsx`, `base44/shared/orientationEngine.ts`

- **New employee orientation** — multi-section onboarding workflow:
  - Welcome acknowledgment
  - Personal & employment info
  - Background check (Checkr)
  - I-9 employment eligibility (employee + employer sections)
  - Payroll & tax setup (federal + state)
  - Direct deposit (Stripe)
  - Employment documents (electronic signing)
  - Training completion
  - Final review & payroll-ready approval
- **Readiness calculation** — computes % complete and next action
- **Deadline reminders** — sends overdue/due-soon reminders to employees and admin
- **Payroll hold** — admin can place a hold on an employee's payroll
- **I-9 employer review** — admin reviews I-9 documents and Section 2
- **Document templates** — manage employment agreement, handbook, confidentiality, commission plan acknowledgments

### 6j. Training Admin
**Location:** `src/pages/SalesTrainingAdmin.jsx`, `src/components/admin/TrainingModuleManager.jsx`

- See [Section 10: Training & Certification](#10-training--certification-system)

### 6k. Email Templates
**Location:** `src/pages/EmailPreview.jsx`, `src/components/email/EmailTemplateEditor.jsx`, `src/components/email/EmailTemplateList.jsx`, `src/lib/emailCatalog.js`, `src/lib/emailDefaults.js`

- **Template manager** — list all email templates by category (Interview, Application, Booking, Onboarding, Payroll, Sales, System)
- **WYSIWYG editor** — visual HTML editor with live preview; formatting toolbar; link insertion
- **Code/source mode** — toggle to raw HTML editing
- **Template variables** — `{{firstName}}`, `{{deadline}}`, etc.
- **Reset to default** — each template has a default that can be restored
- **Save** — persists to `EmailTemplate` entity

### 6l. Owner Dashboard
**Location:** `src/pages/OwnerDashboard.jsx`, `base44/functions/getOwnerDashboard/entry.ts`

- **Company-wide KPIs** — total revenue, new contacts, deals won, close rate, avg deal size, pipeline value
- **Revenue by market** — breakdown by geographic market
- **Daily team activity** — calls, emails, texts, meetings across the whole team
- **Team performance rankings** — sortable table of all reps by revenue, calls, conversations, close rate, meetings, new clients, follow-ups
- **Goal manager** — set daily/weekly/monthly goals per rep or company-wide
- **Culture manager** — manage the daily culture/inspirational banners

### 6m. Admin Manifest Convergence
**Location:** `src/pages/AdminManifestConvergence.jsx`, `base44/functions/getManifestConvergenceStatus/entry.ts`

- **Cross-app manifest sync** — monitors whether Estate Media's UI manifest (tabs, labels, logo) is in sync with the central KhethaIQ app
- **Version checking** — compares manifest versions across apps
- **Convergence status** — shows whether layouts have converged

### 6n. Estate Media Authority Console
**Location:** `src/pages/EstateMediaAuthorityConsole.jsx`, `base44/functions/getEstateMediaAuthorityConsole/entry.ts`

- **Cross-app authority dashboard** — oversees the Estate Media ↔ Arriv One sync relationship
- **Pre-migration inventory** — what data exists before a migration
- **Dry run** — simulate a migration without executing
- **Migration gate** — enable/disable migrations

### 6o. Admin Platform Access
**Location:** `src/pages/AdminPlatformAccess.jsx`

- **Platform access management** — manage which apps/systems the admin can access

### 6p. Admin Sync Status
**Location:** `src/pages/AdminSyncStatus.jsx`

- **Sync monitoring** — view the status of cross-app sync (outbox, inbox, reconciliation)

### 6q. Admin Invite
**Location:** `src/pages/AdminInvite.jsx`, `base44/functions/inviteUserHelper/entry.ts`

- **Invite users** — send invitations to join the app as admin or user

### 6r. Admin Bookings & Scheduled Bookings
**Location:** `src/pages/AdminBookings.jsx`, `src/pages/AdminScheduledBookings.jsx`, `src/pages/AdminPaymentStatements.jsx`

- **Manage all bookings** — view, edit, approve, deny, cancel bookings
- **Scheduled bookings** — bookings scheduled for future processing
- **Payment statements** — upload and manage payment statements for contractors

### 6s. Admin Chat
**Location:** `src/components/admin/AdminChatBubble.jsx`, `src/components/admin/AdminChatWindow.jsx`

- **Admin-to-admin chat** — floating chat bubble for admin communication

---

## 7. KhethaIQ Recruiting System

KhethaIQ is a full recruiting/hiring platform embedded as a tab in the admin nav. It manages the entire hiring pipeline from job posting to offer.

**Location:** `src/pages/KhethaIQ.jsx` (main shell), `src/components/hireiq/*`, `src/components/recruiting/*`, `src/components/khethaiq/*`

### 7a. Dashboard / Recruiting Assistant Home
**Location:** `src/components/recruiting/RecruitingAssistantHome.jsx`

- **AI recruiting assistant** — home screen with quick actions to start a talent search, view pipeline, manage tasks

### 7b. Ask Khetha (AI Chat)
**Location:** `src/components/khethaiq/AskKhethaChat.jsx`, `src/components/hireiq/AskKhethaPanel.jsx`, `base44/functions/manageAskKhetha/entry.ts`

- **AI recruiting chat** — conversational interface to ask questions about candidates, jobs, pipeline, analytics
- **Conversation history** — `AskKhethaConversation` entity stores chat history

### 7c. Jobs
**Location:** `src/components/hireiq/JobDetailPanel.jsx`, `src/components/hireiq/JobCreateForm.jsx`

- **Create job openings** — title, department, description, role profile, requirements
- **Job statuses** — draft → open → closed/filled
- **Role profile approval** — AI-generated role profiles that admins approve
- **Job detail panel** — view candidates, applications, interviews, scorecards for a job
- **Delete job** — removes job and its candidates

### 7d. Candidates
**Location:** `src/components/hireiq/CandidateDetailPanel.jsx`, `src/components/hireiq/CandidateForm.jsx`, `src/components/khethaiq/KhethaIQViews.jsx`

- **Candidate profiles** — resume, contact info, evaluation, scorecards, interview notes, decision
- **Candidate statuses** — applied → screening → interviewing → advanced → hold → offer → declined/hired
- **AI resume analysis** — `resume_analysis` field stores AI-generated analysis
- **AI candidate evaluation** — `evaluation` field stores AI evaluation
- **Decision tracking** — pending / advance / hold / another interview / offer / decline
- **Round 1 & Round 2 scorecards** — stored on the candidate record
- **Handoff to Estate Media** — when hired, the candidate is handed off to the Estate Media system (creates a `MediaSpecialist` user or `SalesTeamMember`)

### 7e. Talent Search
**Location:** `src/components/recruiting/RecruitingChat.jsx`, `base44/shared/recruitingSearchProvider.ts`

- **AI-powered talent search** — conversational search for candidates; AI suggests search criteria and finds matching prospects
- **Search persistence** — `RecruitingSearch` entity stores saved searches
- **Prospect review** — review and qualify search results

### 7f. Talent Pools / Pipelines
**Location:** `src/components/recruiting/TalentPipelinesView.jsx`, `src/components/recruiting/PipelineMapView.jsx`, `base44/entities/TalentPipeline.jsonc`

- **Talent pipelines** — curated lists of prospects grouped by role/source
- **Pipeline map** — visual map of where prospects are in the pipeline

### 7g. Interviews
**Location:** `src/components/khethaiq/KhethaIQViews.jsx` (InterviewsView), `src/components/admin/InterviewSchedulerModal.jsx`

- **Schedule interviews** — human (Twilio Video) or AI (Tavus) or Async (48-hour self-guided)
- **Interview conferences** — `Conference` entity tracks scheduled interviews with participants, status, recordings
- See [Section 8: Interview System](#8-interview-system-human--ai--async) for full detail

### 7h. Async Interviews
**Location:** `src/components/interviews/AsyncInterviewManagerContent.jsx`, `src/pages/AsyncInterviewManager.jsx`

- **Async interview manager** — monitors all 48-hour async interview sessions
- **Session analytics** — invited, opened, started, completed, expired counts
- **Candidate detail** — view responses, video playback, transcripts, scorecard
- **Tavus recording playback** — S3 recording URLs resolved for Conversational AI recordings
- See [Section 8](#8-interview-system-human--ai--async) for full detail

### 7i. Offers
**Location:** `src/components/khethaiq/KhethaIQViews.jsx` (OffersView), `src/components/portal/SalesOfferCard.jsx`

- **Offer management** — track offers extended to candidates
- **Offer acceptance/decline** — candidates can respond via a portal link
- **Offer emails** — `sendSalesOfferExtendedEmail`, `sendSalesOfferNotExtendedEmail`

### 7j. Applications
**Location:** `src/components/hireiq/ApplicationsPanel.jsx`, `src/components/admin/AdminApplicationRow.jsx`, `src/components/admin/AdminSalesApplicationRow.jsx`

- **Job applications** — `JobApplication` entity stores all applicant data (name, contact, EEOC, portfolio, video samples, references)
- **Application statuses** — received → reviewing → accepted_pending → accepted → accepted_waitlist → denied (media specialist); received → under_review → interview_invitation → final_review → offer_extended → hired → offer_not_extended (sales)
- **Application portal** — applicants can check their status and view admin-posted updates
- **Sync to KhethaIQ** — applications are synced to `HireCandidate` records
- **Import applications** — bulk import from a file

### 7k. Applicant Portal
**Location:** `src/components/hireiq/ApplicantPortalPanel.jsx`, `src/pages/ApplicationPortal.jsx`, `src/pages/ApplicationPreview.jsx`

- **Public applicant portal** — applicants look up their application by email/phone
- **Status updates** — admin-posted updates visible to the applicant
- **Document requests** — admin can request additional documents
- **View count tracking** — tracks how many times an applicant viewed their portal

### 7l. Learning
**Location:** `src/components/hireiq/LearningPanel.jsx`

- **Learning resources** — training materials for recruiters/hiring managers

### 7m. Analytics
**Location:** `src/components/hireiq/analytics/AnalyticsPanel.jsx`, `src/components/hireiq/analytics/*`

- **Overview** — total jobs, candidates, applications, hires, time-to-hire
- **Funnel** — application → screening → interview → offer → hire funnel
- **Source analysis** — where candidates come from
- **Retention** — hire retention over time
- **Predictions** — AI-powered hiring predictions
- **Questions section** — interview question analytics
- **Learning section** — learning effectiveness
- **Export** — export analytics data

### 7n. Tasks
**Location:** `src/components/recruiting/RecruitingTasksView.jsx`, `base44/entities/RecruitingTask.jsonc`

- **Recruiting tasks** — actionable tasks for recruiters (follow up with candidate, schedule interview, etc.)
- **Task reminders** — daily and 5-minute reminder emails for upcoming tasks

### 7o. Reminders
**Location:** `src/components/khethaiq/ReminderQueueView.jsx`

- **Interview reminder queue** — manage 30-minute pre-interview reminders; suppress reminders for converted interviews

### 7p. Global Search
**Location:** `src/components/khethaiq/GlobalSearch.jsx`

- **Search across everything** — jobs, candidates, applications, contacts

### 7q. Recruiting Settings
**Location:** `src/components/recruiting/RecruitingSettingsView.jsx`, `base44/entities/RecruitingSettings.jsonc`

- **Recruiting configuration** — settings for the recruiting workflow

### 7r. Recruiting Activity & Prospects
**Location:** `base44/entities/RecruitingActivity.jsonc`, `base44/entities/RecruitingProspect.jsonc`

- **Recruiting activity log** — tracks all recruiting actions
- **Recruiting prospects** — prospects sourced for recruiting

---

## 8. Interview System (Human + AI + Async)

The interview system is one of the most complex parts of the app, supporting three interview formats that converge into a unified scoring pipeline.

### 8a. Human Interviews (Twilio Video)
**Location:** `src/pages/Conference.jsx`, `src/components/chat/ConferenceScheduler.jsx`, `base44/functions/scheduleConference/entry.ts`, `base44/functions/ensureTwilioRecordingRoom/entry.ts`, `base44/functions/generateTwilioVideoToken/entry.ts`

- **Twilio Video rooms** — real-time video interviews between a human interviewer and candidate
- **Room creation** — creates a Twilio Video room with server-side recording enabled
- **Token generation** — generates access tokens for participants
- **30-minute reminder** — sends a reminder email 30 minutes before the interview
- **Recording** — Twilio composition (server-side mixed recording) as backup; local MediaRecorder upload as primary
- **Scorecard** — interviewer fills out a Round 1 general competency scorecard after the interview

### 8b. AI Interviews (Tavus / "Ashley")
**Location:** `src/components/interviews/TavusInterviewPanel.jsx`, `base44/functions/createTavusInterviewConversation/entry.ts`, `base44/functions/tavusInterviewCallback/entry.ts`, `base44/functions/endTavusInterview/entry.ts`, `base44/shared/tavusInterview.ts`

- **Tavus CVI** — Conversational Video Interface powered by Tavus; an AI interviewer named "Ashley" conducts the interview
- **Conversation creation** — creates a Tavus conversation with a persona (Ashley PAL context)
- **Candidate-triggered** — the candidate starts the AI interview themselves via a link
- **Recording** — Tavus server-side recording saved to S3; retrieved via `getTavusRecordingUrl`
- **Transcript** — Tavus transcript retrieved and parsed into the questionnaire/scorecard
- **Callback handling** — `tavusInterviewCallback` receives Tavus webhooks (recording ready, conversation ended)
- **Scorecard auto-population** — the transcript is parsed to auto-fill the Round 1 scorecard; flagged for human review if incomplete
- **Convert human → AI** — `convertConferenceToAi` converts a scheduled human interview to AI mode
- **Convert AI → human** — `convertConferenceToHuman` converts back

### 8c. Async Interviews (48-hour self-guided)
**Location:** `src/pages/AsyncInterview.jsx`, `src/pages/AsyncInterviewManager.jsx`, `src/components/interviews/AsyncInterviewManagerContent.jsx`, `src/components/interviews/SelfGuidedInterviewRecorder.jsx`, `src/components/interviews/ScheduledInterviewMigration.jsx`, `base44/functions/inviteToAsyncInterview/entry.ts`, `base44/functions/selectInterviewFormat/entry.ts`, `base44/functions/saveSelfGuidedResponse/entry.ts`, `base44/functions/completeSelfGuidedInterview/entry.ts`, `base44/functions/getInterviewSession/entry.ts`

- **48-hour deadline** — candidates have 48 hours from invitation to complete the interview
- **Format selection** — candidate chooses between Conversational AI (Ashley) or Self-Guided Video
- **Self-Guided Video** — candidate records video responses to 8 canonical questions (Q1-Q8); one intentional re-record allowed per question; technical retries don't count against re-records
- **Resume support** — self-guided remembers which question the candidate is on (`current_question_index`)
- **Session states** — INVITED → OPENED → FORMAT_SELECTED → STARTED → IN_PROGRESS → COMPLETED → EXPIRED → TECHNICAL_ISSUE → REOPENED
- **Reminders** — 24-hour reminder, 4-hour reminder, and "started but incomplete" reminder
- **Expiration** — sessions auto-expire after 48 hours
- **Admin extension** — admins can extend the deadline
- **Conversion from scheduled** — scheduled human interviews can be converted to async via `convertScheduledInterviewToAsync` (preserves the original scheduled time for audit, sets a new 48-hour deadline)
- **Conversion batch** — `AsyncInterviewConversionBatch` entity supports idempotent bulk migration of legacy scheduled interviews to async format
- **Interview scheduler modal** — lets admins choose Async vs Human when scheduling; Async triggers the invitation email immediately

### 8d. Interview Scorecards
**Location:** `src/components/hireiq/Round1ScorecardForm.jsx`, `src/components/hireiq/Round2ScorecardForm.jsx`, `src/components/hireiq/ScorecardEditor.jsx`, `src/components/hireiq/OcrScorecardUpload.jsx`, `src/lib/round1Questions.js`, `src/lib/scorecardScoring.js`

- **Round 1** — general competency scorecard (8 canonical questions Q1-Q8)
- **Round 2** — role-specific scorecard (media specialist or sales growth advisor)
- **OCR upload** — upload a photo of a paper scorecard and OCR-extract the scores
- **Scoring** — `scorecardScoring.js` computes scores from scorecard data
- **Auto-scorecard** — `parseRecordingToScorecard` uses AI to parse interview recordings into scorecard data

### 8e. Interview Recordings
**Location:** `src/pages/Recordings.jsx`, `src/components/hireiq/CandidateRecordings.jsx`, `src/components/sales/RecordingsPanel.jsx`, `base44/functions/saveInterviewRecording/entry.ts`, `base44/functions/stitchInterviewRecording/entry.ts`, `base44/functions/getTavusRecordingUrl/entry.ts`, `base44/functions/getTwilioRecordingUrl/entry.ts`, `base44/entities/VideoRecording.jsonc`, `base44/entities/TavusInterviewTranscript.jsonc`

- **Centralized recording management** — all interview recordings (human + AI) in one place
- **Local browser recording** — MediaRecorder captures the interview locally, uploaded in chunks
- **Twilio composition** — server-side mixed recording as backup for human interviews
- **Tavus S3 recording** — server-side recording for AI interviews, played back via signed S3 URL
- **Recording recovery** — `src/lib/recordingRecovery.js` handles fragmented recordings
- **Transcript storage** — `TavusInterviewTranscript` entity stores Tavus transcripts
- **AI-mode filtering** — AI-mode recordings are filtered out of the main Recordings page to avoid clutter

### 8f. Interview Reminders & Migration
**Location:** `base44/functions/prepareInterviewReminder/entry.ts`, `base44/functions/sendInterviewReminder/entry.ts`, `base44/functions/backfillInterviewReminders/entry.ts`, `base44/functions/disqualifyMissedInterview/entry.ts`, `base44/functions/listEligibleScheduledInterviews/entry.ts`, `base44/functions/authorizeAsyncConversionBatch/entry.ts`, `base44/functions/executeAsyncConversionBatch/entry.ts`, `base44/shared/asyncInterviewMigration.ts`, `base44/workflows/September 1 Async Interview Conversion.jsonc`

- **30-min reminder** — for human interviews
- **24h / 4h reminders** — for async interviews
- **Started-incomplete reminder** — for async interviews that were started but not completed
- **Missed interview disqualification** — auto-disqualifies candidates who miss their interview
- **Scheduled → Async migration** — bulk converts legacy scheduled first-round interviews to the async format; idempotent; protects second-round human interviews; scheduled for September 1 7:30 AM ET
- **Conversion email** — "Update to Your Interview" email sent to candidates when their interview is converted to async

---

## 9. Payroll, HR & Onboarding

### 9a. Sales Orientation (New Employee Onboarding)
**Location:** `src/pages/SalesOrientationDashboard.jsx`, `src/components/portal/SalesOnboardingWizard.jsx`, `src/components/portal/onboarding/*`, `base44/shared/orientationEngine.ts`, `base44/functions/startSalesOrientation/entry.ts`, `base44/functions/checkOrientationStatus/entry.ts`, `base44/functions/completeOrientationSection/entry.ts`, `base44/functions/adminReviewOrientation/entry.ts`, `base44/functions/markOrientationComplete/entry.ts`

- **Onboarding wizard** — multi-step:
  1. Welcome video
  2. Personal & employment info
  3. ICA (Independent Contractor Agreement) signing
  4. W-9 tax form
  5. Stripe Connect setup (direct deposit)
  6. Training
- **Orientation dashboard** — shows readiness %, completed/missing sections, next action
- **Admin review** — admins review I-9, approve/reject, apply/release holds, mark final approval
- **Deadline reminders** — overdue and due-soon reminders

### 9b. Payroll Integration
**Location:** `base44/functions/syncEmployee/entry.ts`, `base44/functions/processEmployeeSyncQueue/entry.ts`, `base44/functions/sendApprovedCompensationToPayroll/entry.ts`, `base44/functions/sendPayrollSubmission/entry.ts`, `base44/functions/processPayrollSubmissions/entry.ts`, `base44/functions/receivePayrollStatus/entry.ts`, `base44/functions/receivePayrollReadiness/entry.ts`, `base44/functions/receivePayrollReconciliation/entry.ts`, `base44/functions/receivePayrollOwnerNotification/entry.ts`, `base44/functions/receivePayrollContractorDocument/entry.ts`, `base44/functions/lockPayrollPeriod/entry.ts`, `base44/functions/reviewPayrollReconciliation/entry.ts`, `base44/functions/provisionPayrollCompany/entry.ts`, `base44/functions/createPayrollEnrollmentSession/entry.ts`, `base44/functions/createDirectDepositSession/entry.ts`, `base44/shared/payrollEmployeeSync.ts`, `base44/shared/payrollReconciliationEngine.ts`, `base44/shared/payrollPeriodEngine.ts`, `base44/shared/payrollAudit.ts`, `base44/shared/payrollReplay.ts`, `base44/shared/payrollSigning.ts`, `base44/shared/payrollSettings.ts`

- **Arriv Payroll** — external payroll system; this app syncs employee data and compensation to it
- **Employee sync** — creates/updates employee records in Arriv Payroll via signed API calls (HMAC)
- **Compensation sync** — approved commissions are sent to payroll as compensation events
- **Payroll periods** — manage pay periods; lock when finalized
- **Reconciliation** — resolve discrepancies between Arriv One and Arriv Payroll
- **Webhooks** — receive payroll status, readiness, reconciliation, owner notifications, and contractor documents
- **Enrollment sessions** — create enrollment sessions for tax setup and direct deposit
- **Replay protection** — timestamp freshness and replay protection for payroll webhooks
- **Audit** — `payrollAudit.ts` logs all payroll actions

### 9c. Payroll Entities
**Location:** `base44/entities/PayrollPeriod.jsonc`, `base44/entities/PayrollPeriodSnapshot.jsonc`, `base44/entities/PayrollSubmission.jsonc`, `base44/entities/PayrollReconciliation.jsonc`, `base44/entities/PayrollEnrollmentSession.jsonc`, `base44/entities/PayrollReadinessEvent.jsonc`, `base44/entities/EmployeeSyncQueue.jsonc`, `base44/entities/SalesCompensationEvent.jsonc`, `base44/entities/CommissionAdjustment.jsonc`, `base44/entities/CommissionSourceRecord.jsonc`, `base44/entities/ProcessedRequest.jsonc`, `base44/entities/IntegrationAuditLog.jsonc`

- Full payroll data model tracking periods, submissions, reconciliations, enrollment sessions, readiness events, sync queue, compensation events, adjustments, source records, and audit logs

### 9d. Contractor Payouts
**Location:** `base44/functions/processWeeklyPayouts/entry.ts`, `base44/functions/processInstantPayouts/entry.ts`, `base44/functions/confirmPaymentAndMarkComplete/entry.ts`, `base44/functions/uploadPaymentStatement/entry.ts`, `base44/entities/PayoutHistory.jsonc`, `base44/entities/PaymentStatement.jsonc`, `base44/entities/ContractorPayoutDocument.jsonc`, `base44/entities/MediaSpecialistEarningSync.jsonc`, `base44/shared/contractorPayoutShared.ts`

- **Weekly payouts** — every Friday at 4am, completed jobs are paid out to media partners via Stripe
- **Instant payouts** — on-demand instant payout via Stripe instant transfer
- **Payment statements** — upload and manage payment statements
- **Earnings sync** — sync media specialist earnings

---

## 10. Training & Certification System

**Location:** `src/pages/SalesTrainingAdmin.jsx`, `src/pages/SalesTrainingPortal.jsx`, `src/components/admin/TrainingModuleManager.jsx`, `src/components/sales/SalesTrainingContent.jsx`, `src/lib/salesTrainingData.js`, `base44/shared/salesTrainingShared.ts`, `base44/functions/saveTrainingModule/entry.ts`, `base44/functions/recordTrainingModuleScore/entry.ts`, `base44/functions/getSalesTrainingVideos/entry.ts`, `base44/functions/setSalesTrainingVideos/entry.ts`, `base44/entities/TrainingModule.jsonc`, `base44/entities/SalesCertification.jsonc`, `base44/entities/TrainingAttempt.jsonc`, `base44/entities/VideoWatchProgress.jsonc`, `base44/entities/AuditEvent.jsonc`

### 10a. Admin Side (Training Admin)
- **Dashboard tab** — stats: total reps, certified, in progress, remediation, awaiting cert, calling locked/authorized, roleplay passed; certification requirements display
- **Modules tab** — full CRUD for training modules:
  - Create, edit, reorder, duplicate, delete modules
  - Visual quiz builder with multiple-choice questions, critical question flags, competency tags
  - Video URL + duration + min watch % configuration
  - Assignment support
  - Publish/draft toggle
- **Roster tab** — list of all reps with certification status, calling authorization, module progress, quiz average, roleplay/practicum scores:
  - **Calling authorization controls** — set CALLING_LOCKED / SUPERVISED_CALLING_ONLY / TRAINING_INDEPENDENT_CALLING_AUTHORIZED / INDEPENDENT_CALLING_AUTHORIZED
  - **Role-play evaluation** — score against a 7-category rubric (opening, discovery, listening, Arriv explanation, value connection, objections, next step); 95/100 to pass; critical failures override
  - **Practicum evaluation** — score against a 6-category rubric (prospect quality, call prep, sales execution, follow-up, CRM accuracy, judgment); 95/100 to pass
  - **Certify / Suspend / Restore** — grant or revoke certification
  - **Critical failures display** — shows active critical failures (misrepresentation, invented pricing, unauthorized discount, false guarantee, etc.)

### 10b. Rep Side (Training Portal)
- **Certification status card** — training status badge, calling authorization, modules passed, quiz average, final exam status, critical failures
- **Module list** — sequential unlocking (module N+1 locked until N's video watched ≥95% AND quiz passed); shows watch % and quiz score badges
- **Video player** — seek-detection (tracks watched segments; seeking to end doesn't count); 95% unique watch required; progress bar
- **Quiz interface** — multiple choice; 95% to pass; all critical questions must be correct; immediate result with score and critical breakdown
- **Auto-certification update** — passing a quiz updates the `SalesCertification` record (modules_completed, quiz_average_score, critical_questions_status, training_status)

### 10c. Certification Requirements
- 95% module quiz score
- 100% critical questions correct
- 95% final exam score
- 95/100 role-play score
- 95/100 practicum score
- 95% video watch completion
- No unresolved critical failures
- No pending remediation modules

---

## 11. Communications (Email, SMS, Push)

### 11a. Email System
**Location:** `src/lib/emailCatalog.js`, `src/lib/emailDefaults.js`, `base44/entities/EmailTemplate.jsonc`, `base44/entities/QueuedApplicationEmail.jsonc`, `base44/functions/manageEmailTemplates/entry.ts`, `base44/functions/getEmailTemplateDefaults/entry.ts`, `base44/functions/processQueuedApplicationEmails/entry.ts`, `base44/shared/businessEmailQueue.ts`

- **Email template manager** — admin-editable templates with WYSIWYG editor (see Section 6k)
- **Template categories** — Interview, Application, Booking, Onboarding, Payroll, Sales, System
- **Default templates** — `emailDefaults.js` contains inlined default HTML for every email
- **Queued emails** — `QueuedApplicationEmail` entity queues emails for batch sending (swept at 8am ET)
- **Brevo integration** — `brevoClient.ts` sends external emails via Brevo API (for non-registered recipients)
- **SendEmail** — Base44 built-in for registered users
- **Gmail integration** — reps can send emails as themselves via Gmail OAuth

### 11b. Email Templates (by function)
**Location:** `base44/functions/sendApplicationWelcomeEmail/entry.ts`, `sendApplicationAcceptedEmail`, `sendApplicationClosedEmail`, `sendApplicationWaitlistEmail`, `sendApplicationInvitationComing`, `sendSalesInterviewInvitation`, `sendSalesInterview2Invitation`, `sendSalesInterviewScheduledEmail`, `sendInterviewApologyEmail`, `sendInterviewReminder`, `sendSalesOfferExtendedEmail`, `sendSalesOfferNotExtendedEmail`, `sendReferenceCheckEmail`, `sendSignupEmail`, `sendAdminEmail`, `sendBookingStatusEmail`, `sendClosingInvoiceEmail`, `sendInvoiceEmailViaGmail`, `sendEmailViaGmail`, `sendOnboardingReceiptNotifications`, `sendOrientationDeadlineReminders`, `sendDailySummaryEmails`, `sendUpcomingTaskEmail`, `sendTaskFiveMinuteReminder`, `sendForgotPasswordEmail`, `sendDeletionEmail`, `sendRefundReceipt`, `sendReceiptToClient`, `sendBookingNotifications`, `sendFootageUploadReminders`, `sendJobReminders`, `sendInvoiceReminders`, `sendAdminOnboardingNotification`, `sendSupraAccessNotification`, `inviteToAsyncInterview`

### 11c. SMS System
**Location:** `base44/functions/sendSms/entry.ts`, `base44/functions/sendSignupSMS/entry.ts`, `base44/functions/sendReminderSMS/entry.ts`, `base44/functions/twilioSmsWebhook/entry.ts`, `base44/entities/SmsConversation.jsonc`, `base44/entities/SmsMessage.jsonc`, `src/components/sales/SmsInbox.jsx`

- **Twilio SMS** — send and receive SMS via Twilio
- **SMS inbox** — rep-facing SMS conversation interface
- **SMS consent** — `src/pages/SmsConsent.jsx` for TCPA compliance
- **Signup SMS** — welcome SMS on signup
- **Reminder SMS** — job reminders via SMS
- **Webhook** — receives incoming SMS via Twilio webhook

### 11d. Push Notifications
**Location:** `base44/functions/sendPushNotification/entry.ts`, `base44/entities/PushSubscription.jsonc`

- **Mobile push** — native push notifications to iOS/Android app users (requires native mobile build)

### 11e. Scheduled Emails
**Location:** `base44/entities/ScheduledEmail.jsonc`, `base44/functions/sendScheduledEmails/entry.ts`, `base44/entities/ScheduledMediaMessage.jsonc`

- **Scheduled emails** — emails scheduled for future delivery
- **Scheduled media messages** — media messages scheduled for future sending

---

## 12. Cross-App Sync & Migration

The app is part of an ecosystem with "Arriv One" (the central sales CRM) and "KhethaIQ" (the central recruiting app). This Estate Media app syncs data with those central apps.

### 12a. Sync Architecture
**Location:** `base44/shared/syncEnvelope.ts`, `base44/shared/syncHmacAuth.ts`, `base44/shared/syncEntityAdapters.ts`, `base44/shared/syncFieldAdapters.ts`, `base44/shared/syncOutboxWriter.ts`, `base44/shared/syncMapping.ts`, `base44/shared/syncTenantConfig.ts`, `base44/shared/syncFieldAuthority.ts`, `base44/shared/syncTestArtifactFilter.ts`, `base44/entities/SyncOutbox.jsonc`, `base44/entities/SyncInbox.jsonc`, `base44/entities/SyncConflict.jsonc`, `base44/entities/SyncReconciliation.jsonc`, `base44/entities/CrossAppRecordMapping.jsonc`, `base44/entities/ArrivOneTenantConfig.jsonc`

- **HMAC-signed sync** — all cross-app events are signed with HMAC for verification
- **Outbox** — `SyncOutbox` entity queues events to send to Arriv One
- **Inbox** — `SyncInbox` entity receives events from Arriv One
- **Entity adapters** — `syncEntityAdapters.ts` maps entities between apps
- **Field adapters** — `syncFieldAdapters.ts` maps individual fields
- **Field authority** — `syncFieldAuthority.ts` determines which app owns which fields
- **Conflict resolution** — `SyncConflict` entity tracks sync conflicts
- **Reconciliation** — `SyncReconciliation` entity tracks reconciliation runs
- **Record mapping** — `CrossAppRecordMapping` maps record IDs between apps
- **Tenant config** — `ArrivOneTenantConfig` stores per-tenant sync configuration

### 12b. Sync Functions
**Location:** `base44/functions/receiveArrivOneSyncEvent/entry.ts`, `deliverArrivOneSyncEvent`, `drainArrivOneSyncOutbox`, `handleArrivOneSyncEntityTrigger`, `validateArrivOneSyncConfig`, `runEstateMediaSyncReconciliation`, `getEstateMediaSyncStatus`, `getEstateMediaSyncReconciliation`, `getEstateMediaCrossAppReconciliation`, `getEstateMediaPreMigrationInventory`, `getEstateMediaMigrationDryRun`, `executeEstateMediaMigrationBatch`, `manageEstateMediaMigrationGate`, `manageReconciliationRetention`, `manageSyncAdminAction`

### 12c. Manifest Convergence
**Location:** `base44/shared/manifestRuntime.ts`, `base44/shared/manifestFallbacks.ts`, `base44/shared/manifestPullClient.ts`, `base44/shared/manifestPushHandler.ts`, `base44/functions/getActiveManifest/entry.ts`, `getKhethaIQManifest`, `checkArrivOneManifestVersions`, `consumeArrivOneProductManifest`, `reconcileArrivOneManifests`, `syncArrivOneProductManifestsNow`, `syncKhethaIQLayout`, `testManifestPushCanary`, `createArrivOneTestEvent`, `base44/entities/ProductManifestLocal.jsonc`, `base44/entities/MigrationInitializationAudit.jsonc`

- **Manifest-driven UI** — Estate Media fetches its UI config (tabs, labels, logo) from the central KhethaIQ app via `getKhethaIQManifest`; renders local components but adopts the central app's tab structure
- **Manifest convergence** — ensures both apps show the same navigation structure
- **Product manifest** — `ProductManifestLocal` stores the local copy of product manifests (services, packages, pricing, territories, policies)
- **Version checking** — compares manifest versions across apps

### 12d. KhethaIQ Integration
**Location:** `base44/functions/syncApplicationToKhethaIQ/entry.ts`, `receiveKhethaIQHireEvent`, `generateKhethaIQSSOToken`, `migrateKhethaIQData`, `proxyEmbed`, `base44/shared/khethaIQEmbed.ts`, `src/components/khethaiq/KhethaIQEmbed.jsx`, `src/components/khethaiq/KhethaIQFallback.jsx`

- **Application sync** — Estate Media job applications are synced to KhethaIQ as `HireCandidate` records
- **Hire event** — receives hire events from KhethaIQ (when a candidate is hired in KhethaIQ, Estate Media creates the employee record)
- **SSO token** — generates a single sign-on token for cross-app navigation
- **Layout sync** — syncs the KhethaIQ layout (tabs, labels) to Estate Media

---

## 13. Support System

**Location:** `src/components/support/SupportProvider.jsx`, `src/components/support/SupportBubble.jsx`, `src/components/support/SupportPanel.jsx`, `src/components/support/AgentAvatar.jsx`, `base44/entities/SupportConversation.jsonc`, `base44/functions/manageSupportConversation/entry.ts`, `base44/shared/supportCapabilityRegistry.ts`, `base44/shared/arrivAssistClient.ts`

- **Support chat bubble** — floating button on every page; opens a support panel
- **Support panel** — chat interface for user support
- **Support conversations** — `SupportConversation` entity stores conversation history
- **Arriv Assist** — AI-powered support agent (`arrivAssistClient.ts` connects to an external Arriv Assist endpoint)
- **Capability registry** — `supportCapabilityRegistry.ts` defines what the support agent can do

---

## 14. Automated Workflows (Scheduled)

**Location:** `base44/workflows/*.jsonc` — 40+ scheduled workflows

### Key workflows:
| Workflow | Schedule | What it does |
|---|---|---|
| Process Weekly Stripe Payouts | Friday 4:45am ET | Pays out completed jobs to media partners |
| Reset Weekly Earnings | Friday 4am | Resets weekly earning counters |
| Generate Weekly Payment Statements | Weekly | Creates payment statement PDFs |
| Weekly Payment Statements | Weekly | Sends payment statements |
| Job Reminders (9am, 24h, 90min, 1h) | Various | Sends job reminders to contractors |
| Job Shoot Reminders | Various | Pre-shoot reminders |
| Footage Upload Reminder (24h, hourly, 5min, 7min) | Various | Reminds contractors to upload footage |
| Auto-Complete Jobs with Footage | 30min | Auto-completes jobs once footage is uploaded |
| Process Scheduled Bookings | Scheduled | Processes bookings scheduled for future |
| Notify Contractors of New Jobs | On new job | Notifies contractors when new jobs are posted |
| Check Property Closings (AI Scan) | Morning/Afternoon/Daily | Scans MLS for property closings to trigger pay-at-closing invoices |
| Scan MLS for Property Closings | Morning/Afternoon | MLS closing detection |
| Daily Morning/Evening Activity Summary | Daily | Sends activity summary emails |
| Daily Task Reminder Emails | Daily | Sends task reminders |
| 5-Minute Task Reminder Email | 5 min | Urgent task reminders |
| Daily Upcoming Task Reminders | Daily | Upcoming task reminders |
| Sales Orientation Deadline Reminders | Scheduled | Orientation overdue/due-soon reminders |
| Auto-Start Sales Orientation on Hire | On hire | Starts orientation when a rep is hired |
| Auto-Schedule Follow-up from Activity | On activity | Schedules follow-ups from logged activity |
| Process Commission Eligibility | Scheduled | Evaluates commission eligibility |
| Process Payroll Submissions | Scheduled | Sends compensation to payroll |
| Process Employee Payroll Sync Queue | Scheduled | Syncs employees to Arriv Payroll |
| Auto-Sync Employee to Arriv Payroll | On hire | Auto-syncs new hires |
| Sync All Sales Team Calendar Status | Scheduled | Syncs calendar status |
| Sync Admin Calendar Status | Scheduled | Admin calendar sync |
| Check Unanswered Chats | Scheduled | Alerts on unanswered chats |
| Arriv One Sync Outbox Drain | Hourly | Drains the sync outbox |
| Arriv One Sync Hourly Reconciliation | Hourly | Reconciles sync state |
| Arriv One Manifest Version Check | Scheduled | Checks manifest versions |
| KhethaIQ Layout Sync (7am, 2pm, 9:30pm) | 3x daily | Syncs layout from KhethaIQ |
| Sync New Applicant to KhethaIQ | On new applicant | Syncs applications |
| Sync Trigger (Contact, Deal, ActivityLog, SalesGoal, SalesTeamMember, SmsConversation, SmsMessage, TimeOffRequest, BenefitsLifeEvent, ManagerNote) | On entity change | Triggers sync on entity changes |
| Send Scheduled Emails | Scheduled | Sends scheduled emails |
| Send queued application emails (8am ET) | 8am ET | Sends queued application emails |
| Sweep queued application emails (safety) | Safety sweep | Sweeps any missed queued emails |
| Check and Send Invoice Reminders | Scheduled | Invoice reminder emails |
| September 1 Async Interview Conversion | Sep 1 7:30am ET | One-time bulk conversion of scheduled interviews to async |
| Async Interview Reminder Scheduler | Scheduled | 24h/4h/started-incomplete reminders |
| Interview Reminder Scheduler | Scheduled | 30-min reminders for human interviews |
| Continuous Recruiting Cycle | Continuous | AI recruiting cycle |

---

## 15. Integrations & Connectors

### 15a. Authorized OAuth Connectors
- **HubSpot** — CRM sync (contacts, companies, deals, owners, line items, products, lists, schemas, tickets)
- **Google Drive** — file storage (job folders, invoices, onboarding receipts)
- **Gmail** — send emails as reps, read replies, get attachments
- **Google Calendar** — create calendar events for bookings, interviews, follow-ups

### 15b. External API Integrations (via secrets)
| Service | Secret(s) | Purpose |
|---|---|---|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_CALLING_PHONE_NUMBER`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_TWIML_APP_SID` | Voice calls, SMS, video |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` | Payments, payouts, Connect |
| Checkr | (via `initiateBackgroundCheck`) | Background checks |
| Tavus | `TAVUS_API_KEY` | AI video interviews |
| Brevo | `BREVO_API_KEY` | External email |
| AWS S3 | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_ROLE_ARN`, `AWS_S3_REGION`, `AWS_S3_BUCKET` | Tavus recording storage |
| Google Maps | `VITE_GOOGLE_MAPS_API_KEY`, `GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_CLIENT_ID` | Geocoding, maps |
| Zamzar | `ZAMZAR_API_KEY` | Video conversion (legacy) |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Slack connector |
| Arriv Payroll | `ARRIV_PAYROLL_API_ENDPOINT`, `ARRIV_PAYROLL_API_SECRET`, `ARRIV_PAYROLL_COMPANY_ID`, `ARRIV_PAYROLL_WEBHOOK_SECRET`, `ARRIV_PAYROLL_ENDPOINT`, `ARRIV_PAYROLL_BENEFITS_PORTAL_URL` | Payroll sync |
| Arriv One | `ARRIV_ONE_SERVICE_TOKEN`, `ARRIV_ONE_APP_ID`, `ESTATE_MEDIA_ARRIV_ONE_SYNC_OUTBOUND_SECRET`, `ESTATE_MEDIA_ARRIV_ONE_SYNC_INBOUND_SECRET` | Cross-app sync |
| KhethaIQ | `KHETHAIQ_IMPORT_ENDPOINT`, `KHETHAIQ_API_KEY`, `KHETHAIQ_APP_URL` | Recruiting sync |
| Arriv Assist | `ARRIV_ASSIST_ENDPOINT`, `ARRIV_ASSIST_AUTH_SECRET` | Support AI |
| Base44 | `BASE44_SERVICE_TOKEN`, `BASE44_APP_DOMAIN` | Platform |
| Admin | `ADMIN_EMAIL`, `ADMIN_PHONE`, `BRADLEY_PHONE`, `OWNER_PHONE_NUMBER` | Admin contact |

### 15c. Built-in Base44 Integrations Used
- **InvokeLLM** — AI for sales health scores, resume analysis, candidate evaluation, recruiting chat, scorecard parsing, culture banners
- **SendEmail** — email to registered users
- **SendPushNotification** — mobile push
- **UploadFile** / **UploadPrivateFile** — file storage
- **GenerateImage** — AI image generation
- **GenerateSpeech** — TTS
- **GenerateVideo** — AI video generation
- **TranscribeAudio** — Whisper transcription
- **ExtractDataFromUploadedFile** — OCR/data extraction
- **CreateFileSignedUrl** — signed URLs for private files

---

## SUMMARY

Arriv Estate Media is a **comprehensive real-estate media business platform** combining:
- A **contractor marketplace** (job board, booking, payouts, background checks)
- A **client booking system** (shoot scheduling, payment, calendar invites)
- A **full sales CRM** (Arriv One — contacts, dialer, chat, email, prospecting, performance, training)
- A **recruiting/hiring platform** (KhethaIQ — jobs, candidates, interviews, offers, analytics)
- A **multi-format interview system** (human video, AI conversational, async self-guided)
- A **payroll/HR system** (orientation, I-9, tax, direct deposit, commission sync)
- A **training & certification system** (modules, quizzes, role-play, practicum, calling authorization)
- A **cross-app sync engine** (Estate Media ↔ Arriv One ↔ KhethaIQ)
- **40+ automated workflows** running on schedules
- **Email/SMS/push communications** with editable templates
- An **AI support agent** (Arriv Assist)

All wrapped in a branded (Cream/Gold/Black) responsive layout with role-based navigation, mobile bottom tabs, and real-time data subscriptions.