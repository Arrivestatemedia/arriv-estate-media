# AUDIT: Sales Performance Dashboard Features (Recently Added)

**Scope:** Only the recently added Sales Performance Dashboard, Owner Dashboard, Goals, Manager Notes, AI Motivational Banners, and Recordings display features in Arriv Estate Media.

**Not in scope:** The underlying CRM, calling system, video recording capture, commission engine, or any other pre-existing functionality that merely supplies data to these dashboards.

---

## 1. SALES REP PERFORMANCE DASHBOARD

### Page
`src/pages/SalesPerformanceDashboard.jsx` — route `/SalesPerformanceDashboard`

### What Was Added (New)
This is a **new page** created specifically for the performance dashboard feature. It did not exist before this work.

### Access / Permissions
- **Who sees it:** Authenticated sales reps (any active `SalesTeamMember`).
- **Auth check:** Reads `sales_member_id` from localStorage. If absent, redirects to `/SalesLogin`.
- **No admin-only gate:** Any logged-in sales rep (including admin-role reps) sees their own dashboard.
- **No tenant filtering:** Single-company — no `tenant_id` check.

### Data Loading
On mount, two parallel backend function calls:
1. `base44.functions.invoke('computeSalesPerformance', { sales_member_id: repId })` — returns `{ reps: [...], company: {...}, goals: [...] }`
2. `base44.functions.invoke('getDailyCultureBanner', { source: repSource })` — returns `{ mode, source, banners: [...] }`

### Metrics Displayed

#### A. Daily Goals Section (8 MetricCards)
| Metric | Key | Source | Format |
|---|---|---|---|
| Calls | `calls` | `rep.metrics.daily.calls_completed` | Integer |
| Emails | `emails` | `rep.metrics.daily.emails_sent` | Integer |
| Texts | `texts` | `rep.metrics.daily.texts_sent` | Integer (always 0 in current impl) |
| Conversations | `meaningful_conversations` | `rep.metrics.daily.meaningful_conversations` | Integer |
| Appointments | `appointments` | `rep.metrics.daily.appointments_scheduled` | Integer |
| Deals Closed | `deals_closed` | `rep.metrics.daily.deals_closed` | Integer |
| Revenue | `revenue` | `rep.metrics.daily.revenue_generated` | `$X,XXX` |
| Commission | `commission` | `rep.metrics.daily.commission_earned` | `$X,XXX` |

Each card shows:
- Current value (large)
- Target value (if a daily goal exists for that metric): `/ target`
- Progress bar: `Math.min(100, (value / target) * 100)%`
- "✓ Goal met" if ≥100%, else "X% of goal"

#### B. KPI Dashboard Section (13 KPIs, period-switchable)
| KPI | Key | Source Field | Format |
|---|---|---|---|
| Calls | `calls_completed` | `metrics[period].calls_completed` | Integer |
| Talk Time | `talk_time_minutes` | `metrics[period].talk_time_minutes` | `Xm` |
| Emails | `emails_sent` | `metrics[period].emails_sent` | Integer |
| Texts | `texts_sent` | `metrics[period].texts_sent` | Integer (always 0) |
| New Contacts | `new_contacts_claimed` | `metrics[period].new_contacts_claimed` | Integer |
| Follow-ups | `follow_ups_completed` | `metrics[period].follow_ups_completed` | Integer |
| Meetings | `meetings_scheduled` | `metrics[period].meetings_scheduled` | Integer |
| Deals Won | `deals_won` | `metrics[period].deals_won` | Integer |
| Deals Lost | `deals_lost` | `metrics[period].deals_lost` | Integer (always 0) |
| Revenue | `revenue_generated` | `metrics[period].revenue_generated` | `$X,XXX` |
| Commission | `commission_earned` | `metrics[period].commission_earned` | `$X,XXX` |
| Close Rate | `close_rate` | `metrics[period].close_rate` | `X%` (always 0) |
| Avg Deal Size | `average_deal_size` | `metrics[period].average_deal_size` | `$X,XXX` |

#### C. Pipeline Funnel (Weekly)
`PipelineFunnel` component with `data = rep.metrics.weekly.pipeline`:
- Leads → Conversations → Appointments → Quotes → Clients → Revenue
- Horizontal bar chart, each stage scaled to max non-money value
- Revenue shown as full-width green bar

#### D. Sales Health Score (AI-Generated)
`HealthScoreGauge` component — circular SVG gauge:
- Score 0-100 (color: ≥80 green, ≥60 amber, ≥40 orange, <40 red)
- AI summary text below gauge
- Generated client-side via `base44.integrations.Core.InvokeLLM`

#### E. AI Coaching Insights (4 Cards)
Generated client-side via `InvokeLLM` with a detailed prompt containing:
- Daily/weekly/monthly metrics
- Call streak
- Pipeline funnel data

Returns JSON:
- `health_score` (0-100)
- `summary` (one sentence)
- `strengths` (array of 2-3)
- `areas_for_improvement` (array of 2-3)
- `recommended_actions` (array of 2-3)
- `growth_trends` (array of 1-2)

Displayed as 4 cards: Strengths (green), Areas for Improvement (amber), Recommended Actions (gold), Growth Trends (blue).

### Date-Range Behavior
- **Daily Goals**: Always today (midnight to now)
- **KPI Dashboard**: User-selectable period toggle: `weekly | monthly | quarterly | yearly`
- **Pipeline Funnel**: Always weekly
- **AI Coaching**: Uses all periods (daily, weekly, monthly) in the prompt

Period ranges computed in `computeSalesPerformance` backend function:
- Daily: today 00:00 → now
- Weekly: Monday 00:00 → now (ISO week starting Monday)
- Monthly: 1st of month 00:00 → now
- Quarterly: Quarter start 00:00 → now
- Yearly: Jan 1 00:00 → now
- Lifetime: epoch → now

### Filters
- **KPI period toggle** (weekly/monthly/quarterly/yearly) — the only filter
- No date picker, no custom range, no market/rep filter on this page

### Goals
- Daily goals displayed in the Daily Goals section (MetricCards with progress bars)
- Weekly goals used in Friday Mode calculation
- Goals come from `computeSalesPerformance` response (`goals` array, filtered to active goals matching the rep or team-wide)

### Goal Progress
- `MetricCard` computes: `pct = Math.min(100, Math.round((value / target) * 100))`
- Progress bar fills to `pct`%
- "✓ Goal met" when `pct >= 100`

### Performance Trends
- **AI Growth Trends**: Generated by InvokeLLM comparing daily vs weekly vs monthly
- No historical chart/graph of trends over time (no sparklines, no week-over-week comparison charts)

### Recordings Shown to Reps
- **Not shown on this page.** Recordings have their own separate page (`/Recordings`).
- The performance dashboard does not embed or reference recordings.

### Ranking/Comparison Features
- **Not on the rep dashboard.** Rankings are on the Owner Dashboard only.
- The rep sees only their own metrics.

### AI-Generated Insights
- **Health Score**: 0-100 integer, generated client-side via InvokeLLM
- **Coaching**: strengths, areas for improvement, recommended actions, growth trends
- **Prompt**: Hardcoded in `SalesPerformanceDashboard.jsx` (lines 99-117)
- **Model**: Default (automatic) — no `model` parameter specified
- **Failure**: On error, `healthScore = { health_score: 0, summary: 'Unable to generate score.' }`

### Friday Mode (Special Feature)
- Only visible on Fridays (`new Date().getDay() === 5`)
- Checks if all weekly goals are met: `goals.filter(g => g.period === 'weekly').every(g => actual >= g.target_value)`
- If met: Green banner "You've earned your Friday."
- If not met: Gold banner "Friday Push — you're almost there!" with per-goal remaining breakdown

### Culture Banner (on this page)
- Displayed at top of dashboard
- Rotates through available banners: `banners[new Date().getDate() % banners.length]`
- Verse reference is clickable → opens verse modal with full verse text
- If AI mode is on, rep can select wisdom source via dropdown (Bible/Quran/Torah/Buddhist/Hindu/Secular)
- Selection persisted to `localStorage.setItem('culture_banner_source', v)`

---

## 2. OWNER / ADMIN PERFORMANCE DASHBOARD

### Page
`src/pages/OwnerDashboard.jsx` — route `/OwnerDashboard`

### What Was Added (New)
This is a **new page** created for this feature.

### Access / Permissions
- **Who sees it:** Admins only.
- **Auth check:** `getOwnerDashboard` backend function calls `resolveAdminTenant` which checks:
  1. If `sales_member_id` provided, looks up SalesTeamMember and checks `role === "admin"`
  2. Falls back to `base44.auth.me()` and checks `role === "admin"` or `role === "tenant_admin"`
- Returns 403 "Admin access required" if not authorized.
- **Note:** The backend already has tenant-aware logic (`tenant_id`, `tenant_admin` role) — this appears to be partially adapted for multi-tenant already.

### Data Loading
Single call: `base44.functions.invoke('getOwnerDashboard', { sales_member_id })`

Returns:
```json
{
  totals: { totalRevenue, totalLeads, totalClients, avgCloseRate, avgRevenuePerClient, pipelineValue },
  revenueByMarket: [{ market, revenue }],
  teamActivity: { calls, emails, texts, appointments },
  rankings: [{ id, name, title, calls, conversations, closeRate, revenue, meetings, newClients, followups, texts, emails, dailyCalls }],
  memberCount: number
}
```

### Company-Wide Metrics (6 KpiCards)
| KPI | Source | Calculation |
|---|---|---|
| Revenue | `data.totals.totalRevenue` | Sum of `amount_collected` or `contract_value` on won/paid deals |
| New Contacts | `data.totals.totalLeads` | `data.contacts.length` |
| Deals Won | `data.totals.totalClients` | Count of won/paid deals |
| Close Rate | `data.totals.avgCloseRate` | Average of daily close rates across active members |
| Avg Deal Size | `data.totals.avgRevenuePerClient` | `totalRevenue / totalClients` |
| Pipeline Value | `data.totals.pipelineValue` | Sum of `contract_value` on open deals |

### Revenue by Market
- List of markets with revenue
- Market extracted from deal `service_address` or `company` via `extractMarket()` in `performanceEngine.ts`
- State-to-market mapping: GA→Atlanta, MD→Maryland, TX→Texas, FL→Florida
- Falls back to "Other" or "Unknown"

### Daily Team Activity (4 KpiCards)
| KPI | Source |
|---|---|
| Calls | `teamActivity.calls` (sum of daily calls across all reps) |
| Emails | `teamActivity.emails` |
| Texts | `teamActivity.texts` |
| Meetings | `teamActivity.appointments` |

### Team Performance Rankings (Table)
Sortable table of all active sales reps. Sort options:
- Highest Revenue, Most Calls, Most Conversations, Highest Close Rate, Most Meetings, Most New Clients, Best Follow-up Rate

Columns: #, Rep (link to EmployeeProfile), Calls, Convos, Close %, Revenue, Meetings, New Clients, Follow-ups

**Ranking data source:** `weeklyRollup` per member (weekly period metrics).

### Individual Rep Performance
- Click rep name → links to `/EmployeeProfile?sales_member_id=${r.id}`
- No inline drill-down on the Owner Dashboard itself

### Goals (on Owner Dashboard)
- `GoalManager` component embedded at bottom
- Admin can create/list/delete goals
- See Section 3 for details

### Culture Messages (on Owner Dashboard)
- `CultureManager` component embedded at bottom
- Admin can manage culture banners, toggle AI mode, set default source
- See Section 5 for details

### Filters
- **Sort by** dropdown on rankings table (7 sort options)
- No date range filter — all metrics use fixed daily/weekly periods from the backend

### Date Ranges
- **Totals (revenue, leads, clients):** Lifetime (all won deals, all contacts)
- **Close rate, avg deal size:** Derived from lifetime totals
- **Team Activity:** Daily (today)
- **Rankings:** Weekly (current week, Monday→now)
- **Pipeline Value:** All open deals (no date filter)
- No user-selectable date range

### Drill-Down Behavior
- Rep name in rankings table → `/EmployeeProfile?sales_member_id=X` (full profile page)
- No other drill-down

### Manager Visibility
- Admin sees all active reps' metrics in the rankings table
- No manager-vs-rep distinction (all admins see everything)

### Recordings
- **Not shown on the Owner Dashboard.**
- No recording embedding or linking from this page.

---

## 3. GOALS

### Data Model
**Entity:** `SalesGoal` (newly created for this feature)

| Field | Type | Description |
|---|---|---|
| `metric` | enum | `calls`, `emails`, `texts`, `meaningful_conversations`, `appointments`, `deals_closed`, `revenue`, `commission`, `new_contacts`, `follow_ups`, `meetings`, `talk_time` |
| `period` | enum | `daily`, `weekly`, `monthly`, `quarterly`, `yearly` |
| `target_value` | number | Target value for the goal |
| `sales_member_id` | string | Rep this goal applies to (null/empty = team-wide goal) |
| `market` | string | Market this goal applies to (e.g. Atlanta, Maryland). null = all markets |
| `is_active` | boolean | Default true |
| `created_by` | string | Creator ID |

**Required:** `metric`, `period`, `target_value`

**Relationships:** `sales_member_id` → SalesTeamMember (optional; null means team-wide)

**RLS:** None specified (default — any authenticated user can read/create/delete)

**Single-company assumption:** Yes — no `tenant_id`

### Goal Types
- **By metric:** 12 metric types (calls, emails, texts, meaningful_conversations, appointments, deals_closed, revenue, commission, new_contacts, follow_ups, meetings, talk_time)
- **By scope:** Individual rep (`sales_member_id` set) or team-wide (`sales_member_id` null/empty)
- **By market:** Optional market filter (`market` field)

### Goal Periods
5 periods: daily, weekly, monthly, quarterly, yearly

### Target Values
- Single numeric `target_value` per goal
- No min/max, no stretch goals, no tiered targets

### How Goals Are Assigned
- Admin creates goals via `GoalManager` component on Owner Dashboard
- `manageGoals` backend function with `action: "create"`
- `assignee_id` field: if provided, sets `sales_member_id` (individual goal); if empty/null, creates team-wide goal
- No bulk assignment, no template-based assignment

### How Progress Is Calculated
- **On SalesPerformanceDashboard:** `MetricCard` computes `pct = Math.min(100, (value / target) * 100)` where `value` comes from `rep.metrics[period][metric]`
- **On EmployeeProfile:** Same formula: `pct = g.target_value > 0 ? Math.min(100, Math.round((actual / g.target_value) * 100)) : 0`
- **On Friday Mode:** `weeklyGoalsMet = goals.filter(g => g.period === 'weekly').every(g => actual >= g.target_value)`
- Progress is computed client-side in real-time from the metrics returned by `computeSalesPerformance`

### Who Creates/Edits Goals
- **Creates:** Admin (via `GoalManager` on Owner Dashboard)
- **Deletes:** Admin (trash icon in `GoalManager`)
- **Edits:** No edit functionality — only create and delete (must delete and recreate to change)
- **No backend auth check:** `manageGoals` function does NOT verify admin role — any authenticated user can create/delete goals (security gap)

### Rep Visibility
- Reps see daily goals on their `SalesPerformanceDashboard` (MetricCards with progress)
- Reps see their individual goals on `EmployeeProfile` (Current Goals card with progress bars)
- Reps see weekly goal progress in Friday Mode
- Reps **cannot** create, edit, or delete goals

### Admin/Manager Visibility
- Admin sees all goals in `GoalManager` list on Owner Dashboard
- Each goal shows: metric label, period, target, assignee name (if individual)
- Admin can delete any goal

### Completion Behavior
- No "completed" status or flag on the goal itself
- Completion is purely visual: progress bar reaches 100%, "✓ Goal met" text
- No notification when a goal is met
- No archival of completed goals
- Goals persist indefinitely until deleted

---

## 4. MANAGER NOTES

### Data Model
**Entity:** `ManagerNote` (newly created for this feature)

| Field | Type | Description |
|---|---|---|
| `sales_member_id` | string | The rep this note is about |
| `author_id` | string | ID of the manager/admin who wrote the note |
| `author_name` | string | Name of the manager who wrote the note |
| `note_type` | enum | `coaching`, `recognition`, `review`, `general` (default: `general`) |
| `content` | string | The note content |
| `is_recognition` | boolean | Default false — whether this note is a recognition/award |
| `award_title` | string | Title of the award if this is a recognition |

**Required:** `sales_member_id`, `content`

**Built-in fields:** `id`, `created_date`, `updated_date`, `created_by_id`

**Relationships:** `sales_member_id` → SalesTeamMember; `author_id` → SalesTeamMember (manager)

**RLS:** None specified (default — any authenticated user can read/create)

**Single-company assumption:** Yes — no `tenant_id`

### Who Can Create Notes
- **UI gate:** Only admins see the "Add Note" button on `EmployeeProfile` (`isAdmin` checked via `localStorage.getItem('sales_member_role') === 'admin'`)
- **Backend:** `ManagerNote.create()` is called directly from the frontend — no backend function, no server-side auth check (security gap)
- Any authenticated user with the right localStorage flag could technically create notes

### Which Rep the Note Belongs To
- `sales_member_id` field — set to the rep being viewed on `EmployeeProfile`
- One rep per note

### Whether Reps Can See the Notes
- **Yes, partially.** The `EmployeeProfile` page shows:
  - **Recognition & Awards card:** Notes where `is_recognition === true` or `note_type === 'recognition'`
  - **Manager Notes card:** Notes where `note_type === 'coaching'` or `note_type === 'review'`
- **General notes** (`note_type === 'general'` and not recognition) are **not displayed** in either card — they're fetched but filtered out
- The rep viewing their own profile can see coaching/review notes and recognitions
- There is no separate "private" note type that reps can't see

### Editing/Deleting
- **No edit functionality** — notes cannot be edited after creation
- **No delete functionality** — no delete button on the UI
- Notes are immutable once created

### Timestamps
- `created_date` (built-in) — displayed as `new Date(n.created_date).toLocaleDateString()`
- No `updated_date` display

### Permissions
- **Create:** UI-limited to admin role (localStorage check); backend has no auth check
- **Read:** Any authenticated user viewing an EmployeeProfile can see the notes for that rep
- **No RLS** on the entity

### Where Notes Appear in the UI
- **EmployeeProfile page** (`/EmployeeProfile`):
  - "Recognition & Awards" card — shows recognition-type notes with award title, content, author
  - "Manager Notes" card — shows coaching and review notes with content, author, date
- Notes are fetched via `base44.entities.ManagerNote.filter({ sales_member_id: repId }, '-created_date', 50)`
- Not shown on SalesPerformanceDashboard or OwnerDashboard

---

## 5. AI MOTIVATIONAL BANNERS

### Where It Appears
- **SalesPerformanceDashboard** — top of the page, full-width banner with gold border
- Shows: Sparkles icon, message text, verse reference (clickable to open verse modal)
- Verse modal: full-screen overlay with verse reference and verse text

### When It Is Generated
Two modes controlled by `AppSetting` key `culture_banner_mode`:
- **`manual` (default):** Admin-created messages only. No AI generation.
- **`ai`:** AI generates one banner per day per wisdom source.

**On-demand generation:** When a rep loads the dashboard in AI mode and no banner exists for today's date (America/New_York) + selected source, `getDailyCultureBanner` generates one on the fly.

**Manual generation:** Admin can click "Generate Now" in `CultureManager` to generate immediately via `manageCultureMessages` (action: `generateNow`).

**No scheduled automation:** There is NO scheduled automation that generates banners daily. Generation happens on-demand when a rep loads the dashboard (lazy generation). The `CultureManager` UI says "A new message is also auto-generated daily at midnight" but this is aspirational — no automation exists for this.

### What Data/Context Is Provided to AI
The prompt is hardcoded in both `getDailyCultureBanner` and `manageCultureMessages`:

**Context:** "a real estate media sales team" — hardcoded, Estate Media-specific.

**Per-source prompts** (all return JSON: `message`, `verse_reference`, `verse_text`):
- **bible:** "tied to a Bible verse... relevant to sales professionals who build relationships and serve clients"
- **quran:** "tied to a Quran verse"
- **torah:** "tied to a Torah/Tanakh verse"
- **buddhist:** "tied to a Buddhist teaching"
- **hindu:** "tied to a Hindu text"
- **secular:** "No religious content — pull from philosophers, authors, or leaders instead"

**No rep-specific data is provided.** The prompt does not include the rep's name, metrics, or any personal context. It's a generic motivational quote generator.

### How Often It Changes
- **Manual mode:** Static — admin-created messages rotate by day of month: `banners[new Date().getDate() % banners.length]`
- **AI mode:** One banner per day per source. Changes daily (America/New_York date). Same banner shown all day for a given source.
- **No mid-day rotation** in AI mode — one banner per source per day.

### Whether Content Is Stored
- **Yes.** All banners (manual and AI) are stored in the `CultureBanner` entity.
- AI banners have `auto_generated: true` and `generated_date` set to today's date (America/New_York).
- **Cleanup:** AI banners older than 7 days are deleted in `getDailyCultureBanner` (compares `generated_date` to 7-days-ago date string).
- Manual banners are not auto-deleted.

### User Preference Storage
- **Per-rep source preference:** Stored in `localStorage` key `culture_banner_source` (set by rep on SalesPerformanceDashboard)
- **Global default source:** Stored in `AppSetting` key `culture_banner_source` (set by admin in CultureManager)
- **AI mode toggle:** Stored in `AppSetting` key `culture_banner_mode` (value: "ai" or "manual")
- **Resolution order:** Rep's localStorage source → global AppSetting source → default "bible"

### Supported Wisdom-Source Preferences
6 options (enum on `CultureBanner.source` and in dropdowns):
1. **Bible** (`bible`)
2. **Quran** (`quran`)
3. **Torah / Tanakh** (`torah`)
4. **Buddhist Teachings** (`buddhist`)
5. **Hindu Texts** (`hindu`)
6. **Secular / No Religious Source** (`secular`)

### Default Behavior
- **Mode:** `manual` (if no `culture_banner_mode` AppSetting exists)
- **Source:** `bible` (if no `culture_banner_source` AppSetting or localStorage exists)
- **Banner display:** If no banners exist, no banner is shown (no error, no fallback)

### Ability to Disable/Change Preference
- **Admin:** Can toggle AI mode on/off via `CultureManager` Switch. Can set default source via dropdown. Can delete individual banners.
- **Rep:** Can change their own source preference via dropdown on SalesPerformanceDashboard (only visible when AI mode is on). Selection persists to localStorage.
- **No "off" option:** Reps cannot disable the banner entirely — only change the source. If no banners exist, the banner section simply doesn't render.

### Backend Functions/API Calls Involved

| Function | Purpose |
|---|---|
| `getDailyCultureBanner` | Fetches today's banner for a source. Generates one if AI mode and none exists for today. Cleans up old AI banners. |
| `manageCultureMessages` (action: `list`) | Lists all banners for admin management |
| `manageCultureMessages` (action: `create`) | Admin creates a manual banner |
| `manageCultureMessages` (action: `update`) | Toggle banner active/inactive |
| `manageCultureMessages` (action: `delete`) | Delete a banner |
| `manageCultureMessages` (action: `getAiSetting`) | Read `culture_banner_mode` AppSetting |
| `manageCultureMessages` (action: `setAiSetting`) | Set `culture_banner_mode` to "ai" or "manual" |
| `manageCultureMessages` (action: `getCultureSource`) | Read `culture_banner_source` AppSetting |
| `manageCultureMessages` (action: `setCultureSource`) | Set default `culture_banner_source` |
| `manageCultureMessages` (action: `generateNow`) | Manually trigger AI generation for the current default source |

**AI call:** `base44.integrations.Core.InvokeLLM` with `response_json_schema` for `{ message, verse_reference, verse_text }`. Default model (automatic). No `add_context_from_internet`.

### Failure/Fallback Behavior
- **AI generation fails:** `getDailyCultureBanner` returns `{ error: error.message }` with status 500. Frontend catches and shows no banner (no fallback message).
- **No banners in manual mode:** `getDailyCultureBanner` returns `{ banners: [] }`. Frontend shows no banner section.
- **InvokeLLM returns invalid JSON:** `data.message || 'Keep building relationships. Results will follow.'` — hardcoded fallback message.
- **No verse text:** Verse modal shows "Verse text not available."
- **No retry logic** — single attempt, fail silently

---

## 6. RECORDINGS

### What Changed for the Performance Dashboard
- **New page:** `src/pages/Recordings.jsx` — route `/Recordings`
- This page was added to give sales reps a dedicated recordings gallery, linked from the main navigation sidebar.

### Which Recordings Appear
- All `VideoRecording` records where `recorded_by_id` matches the logged-in rep's `sales_member_id`
- Sorted by `-created_date` (newest first), limited to 100

### How They Are Associated with a Rep
- `VideoRecording.recorded_by_id` field = `SalesTeamMember.id`
- Set at recording time by the video call system (not part of this audit)

### How They Are Retrieved
```js
base44.entities.VideoRecording.filter({ recorded_by_id: userId }, '-created_date', 100)
```
- Direct entity SDK call from the frontend (no backend function)

### Playback Permissions
- **Rep access:** Rep sees only their own recordings (filtered by `recorded_by_id`)
- **Manager/admin access:** No manager access to rep recordings from this page. The Owner Dashboard and EmployeeProfile do not display recordings.
- **No RLS** on `VideoRecording` entity — any authenticated user could technically query any recording by ID, but the filter by `recorded_by_id` limits the list view.

### Rep Access
- Rep sees: video player (`<video src={rec.file_url} controls>`), participant name, date, duration, file size, download button, delete button
- Download: direct `<a href={rec.file_url} download>` link
- Delete: `base44.entities.VideoRecording.delete(id)` — removes from state

### Manager/Admin Access
- **None from the performance dashboard.** Recordings are not embedded in OwnerDashboard or EmployeeProfile.
- No coaching connection — recordings are standalone, not linked to activities or performance metrics.

### Performance/Coaching Connection
- **None.** Recordings are not linked to activities, deals, or performance scores.
- No AI analysis of recordings
- No "review this call" feature
- No recording-to-coaching-note pipeline

---

## 7. DATA MODELS

### Newly Created Entities

#### SalesGoal (NEW)
- **Purpose:** Store performance goals for reps and teams
- **Fields:** `metric` (enum, 12 values), `period` (enum, 5 values), `target_value` (number), `sales_member_id` (string, nullable), `market` (string, nullable), `is_active` (boolean), `created_by` (string)
- **Required:** `metric`, `period`, `target_value`
- **Relationships:** `sales_member_id` → SalesTeamMember (optional)
- **RLS:** None (default open access)
- **Single-company assumption:** Yes — no `tenant_id`

#### ManagerNote (NEW)
- **Purpose:** Store manager/admin notes about reps
- **Fields:** `sales_member_id` (string), `author_id` (string), `author_name` (string), `note_type` (enum: coaching/recognition/review/general), `content` (string), `is_recognition` (boolean), `award_title` (string)
- **Required:** `sales_member_id`, `content`
- **Relationships:** `sales_member_id` → SalesTeamMember; `author_id` → SalesTeamMember
- **RLS:** None (default open access)
- **Single-company assumption:** Yes — no `tenant_id`

#### CultureBanner (NEW)
- **Purpose:** Store motivational banners (manual and AI-generated)
- **Fields:** `message` (string), `verse_reference` (string), `verse_text` (string), `source` (enum: bible/quran/torah/buddhist/hindu/secular), `auto_generated` (boolean), `generated_date` (date), `is_active` (boolean), `display_order` (integer), `created_by` (string)
- **Required:** `message`
- **Relationships:** None
- **RLS:** None (default open access)
- **Single-company assumption:** Yes — no `tenant_id`

### Modified Entities

#### AppSetting (MODIFIED — new keys added)
- **Purpose:** Store global settings for culture banner mode and source
- **New keys used by this feature:**
  - `culture_banner_mode` — value: "ai" or "manual"
  - `culture_banner_source` — value: bible/quran/torah/buddhist/hindu/secular
- **No schema change** — the entity already had `key` and `value` string fields
- **Single-company assumption:** Yes — no `tenant_id` (settings are global)

### Entities NOT Modified (Supply Data Only)
The following entities supply data to the dashboard but were NOT created or modified for this feature:
- `ActivityLog` — supplies call/email/meeting/task data
- `CommissionSourceRecord` — supplies commission/revenue data (used by `computeSalesPerformance`)
- `Commission` — supplies commission data (used by `getOwnerDashboard` via `performanceEngine.ts`)
- `Contact` — supplies lead/new contact data
- `Deal` — supplies deal/revenue/pipeline data
- `SmsMessage` / `SmsConversation` — supplies text count data
- `SalesTeamMember` — supplies rep identity, role, market, hire date
- `VideoRecording` — supplies recordings (pre-existing entity, not modified)

---

## 8. BACKEND FUNCTIONS / AUTOMATIONS

### Newly Created Backend Functions

#### `computeSalesPerformance` (NEW)
- **Purpose:** Compute per-rep and company-wide performance metrics across all time periods
- **Input:** `{ sales_member_id }` (optional; if omitted, computes for all active reps)
- **Output:** `{ reps: [{ rep_id, rep_name, rep_email, role, title, market, hire_date, employment_status, profile_picture_url, metrics: { daily, weekly, monthly, quarterly, yearly, lifetime } }], company: { ...same periods }, goals: [...] }`
- **Data sources:** `ActivityLog`, `CommissionSourceRecord`, `Contact`, `SalesGoal`, `SalesTeamMember`
- **Key logic:**
  - `getPeriodRanges()` — computes date ranges for daily/weekly/monthly/quarterly/yearly/lifetime
  - `computeMetrics()` — filters activities/commissions/contacts by date range, calculates all metrics
  - `call_streak` — consecutive days with ≥1 call ending today
  - `meaningful_conversations` — calls with `duration_minutes > 0` OR notes matching `/connected|answered|spoke|conversation|interested|warm|booked|scheduled/i`
  - `pipeline` — leads (unique contacts), conversations, appointments, quotes (always 0), clients (deals), revenue
- **No auth check** — any caller can invoke for any rep
- **Single-company:** Yes — no `tenant_id` filtering

#### `getOwnerDashboard` (NEW)
- **Purpose:** Company-wide performance rollup for admin/owner
- **Input:** `{ sales_member_id }`
- **Auth:** `resolveAdminTenant()` — checks admin/tenant_admin role
- **Output:** `{ totals, revenueByMarket, teamActivity, rankings, memberCount }`
- **Data sources:** Uses `performanceEngine.ts` shared module (`loadTenantData`, `computeTenantRollup`, `computeRevenueByMarket`)
- **Key logic:**
  - `loadTenantData()` — loads activities, deals, commissions, contacts, SMS by `tenant_id`
  - `computeTenantRollup()` — aggregates per-rep metrics for a date range
  - `computeRevenueByMarket()` — groups won deals by extracted market
  - Rankings use weekly rollup data
- **Partially tenant-aware:** Already filters by `tenant_id` (passes empty string `""` in single-company Estate Media)

#### `manageGoals` (NEW)
- **Purpose:** CRUD for SalesGoal entity
- **Actions:** `list`, `create`, `delete`
- **Auth:** None — no admin check (security gap)
- **Output (list):** `{ goals: [{ id, metric, period, target, assignee_name }] }`
- **Single-company:** Yes — no `tenant_id`

#### `manageCultureMessages` (NEW)
- **Purpose:** CRUD for CultureBanner + AI settings management
- **Actions:** `list`, `create`, `update`, `delete`, `getAiSetting`, `setAiSetting`, `getCultureSource`, `setCultureSource`, `generateNow`
- **Auth:** None — no admin check (security gap)
- **AI generation:** Uses `InvokeLLM` with source-specific prompts
- **Single-company:** Yes — settings are global AppSetting keys

#### `getDailyCultureBanner` (NEW)
- **Purpose:** Fetch today's banner for a source; generate if needed (AI mode)
- **Input:** `{ source }` (optional; falls back to global setting)
- **Output:** `{ mode, source, banners: [...] }`
- **Key logic:**
  - Reads `culture_banner_mode` and `culture_banner_source` from AppSetting
  - Manual mode: returns all active non-AI banners
  - AI mode: looks for today's AI banner for the source (America/New_York date); if found, returns it; if not, generates via InvokeLLM, saves, returns
  - Cleans up AI banners older than 7 days
- **Auth:** None
- **Single-company:** Yes

### Shared Module

#### `performanceEngine.ts` (NEW)
- **Purpose:** Shared performance computation logic used by `getOwnerDashboard` (and potentially other functions)
- **Exports:**
  - `periodBounds(period, ref)` — compute start/end for a period
  - `loadTenantData(base44, tenantId)` — load all CRM data filtered by tenant
  - `computeRepMetrics(data, salesMemberId, start, end)` — aggregate metrics for one rep
  - `computeTenantRollup(data, members, start, end)` — aggregate for all reps
  - `computePipeline(data, salesMemberId)` — pipeline funnel data
  - `computeLifetimeStats(data, salesMemberId)` — lifetime totals
  - `computeCallStreak(data, salesMemberId, dailyCallGoal)` — consecutive call days
  - `computeRevenueByMarket(data)` — revenue grouped by market
  - `extractMarket(address)` — derive market from address string
- **Tenant-aware:** All `loadTenantData` queries filter by `tenant_id`
- **Note:** `computeSalesPerformance` does NOT use this shared module — it has its own inline `computeMetrics` function. This is an inconsistency: two different performance computation implementations exist.

### Automations
- **None created for this feature.**
- No scheduled job generates daily culture banners (despite UI text saying "auto-generated daily at midnight")
- No scheduled job computes or caches performance metrics
- All computation is on-demand (real-time when the page loads)

---

## 9. UI COMPONENTS

### New Pages
| Page | Route | Purpose |
|---|---|---|
| `SalesPerformanceDashboard` | `/SalesPerformanceDashboard` | Rep's own performance dashboard |
| `OwnerDashboard` | `/OwnerDashboard` | Admin company-wide dashboard |
| `Recordings` | `/Recordings` | Rep's video call recordings gallery |
| `EmployeeProfile` | `/EmployeeProfile` | Individual rep profile with goals, notes, recognitions, training (modified to include manager notes and AI insights) |

### New Components (in `src/components/performance/`)

| Component | File | Purpose |
|---|---|---|
| `MetricCard` | `MetricCard.jsx` | Daily goal card with value, target, progress bar |
| `KpiCard` | `KpiCard.jsx` | Owner dashboard KPI card with icon and formatted value |
| `PipelineFunnel` | `PipelineFunnel.jsx` | Horizontal bar funnel: Leads→Conversations→Appointments→Quotes→Clients→Revenue |
| `HealthScoreGauge` | `HealthScoreGauge.jsx` | Circular SVG gauge for AI health score (0-100) |
| `GoalManager` | `GoalManager.jsx` | Admin goal CRUD interface (create/delete goals) |
| `CultureManager` | `CultureManager.jsx` | Admin culture banner management + AI settings |
| `metrics.js` | `metrics.js` | Shared metric labels, icons, and format functions |

### New Modals
| Modal | Location | Purpose |
|---|---|---|
| Verse Modal | `SalesPerformanceDashboard.jsx` (inline) | Display full verse text when clicking verse reference |
| Add Note Modal | `EmployeeProfile.jsx` (Dialog) | Admin adds manager note with type, content, recognition flag, award title |

### New Cards
| Card | Page | Purpose |
|---|---|---|
| Daily Goals | SalesPerformanceDashboard | 8 MetricCards with progress |
| KPI Dashboard | SalesPerformanceDashboard | 13 KPI cards with period toggle |
| Pipeline Health | SalesPerformanceDashboard | PipelineFunnel component |
| Sales Health Score | SalesPerformanceDashboard | HealthScoreGauge with AI summary |
| AI Coaching (4 cards) | SalesPerformanceDashboard | Strengths, Areas for Improvement, Recommended Actions, Growth Trends |
| Friday Mode | SalesPerformanceDashboard | Conditional Friday motivational/celebration banner |
| Culture Banner | SalesPerformanceDashboard | Motivational banner with verse |
| Company KPIs | OwnerDashboard | 6 KpiCards |
| Revenue by Market | OwnerDashboard | Market revenue breakdown list |
| Daily Team Activity | OwnerDashboard | 4 KpiCards (calls, emails, texts, meetings) |
| Team Performance Rankings | OwnerDashboard | Sortable rep ranking table |
| Lifetime Performance | EmployeeProfile | 8 lifetime stats with icons |
| Current Goals | EmployeeProfile | Individual goals with progress bars |
| Recognition & Awards | EmployeeProfile | Recognition-type manager notes |
| Manager Notes | EmployeeProfile | Coaching/review-type manager notes |
| Training Completed | EmployeeProfile | Training completion records |

### New Charts
| Chart | Type | Data |
|---|---|---|
| PipelineFunnel | Horizontal bars | Weekly pipeline stages |
| HealthScoreGauge | Circular SVG gauge | AI health score 0-100 |

No other chart types (no line charts, no bar charts over time, no pie charts).

### New Forms
| Form | Location | Fields |
|---|---|---|
| Goal Create Form | GoalManager | metric, period, target, assignee_id |
| Note Create Form | EmployeeProfile | note_type, award_title (if recognition), content |
| Culture Message Create | CultureManager | message, verse_reference, verse_text |

### New Tables
| Table | Location | Columns |
|---|---|---|
| Team Performance Rankings | OwnerDashboard | #, Rep, Calls, Convos, Close %, Revenue, Meetings, New Clients, Follow-ups |

### New Filters
| Filter | Location | Options |
|---|---|---|
| KPI Period Toggle | SalesPerformanceDashboard | weekly, monthly, quarterly, yearly |
| Sort Rankings By | OwnerDashboard | revenue, calls, conversations, closeRate, meetings, newClients, followups |
| Wisdom Source | SalesPerformanceDashboard | bible, quran, torah, buddhist, hindu, secular |

### New Banners
| Banner | Location | Purpose |
|---|---|---|
| Culture Banner | SalesPerformanceDashboard | Daily motivational message with verse |
| Friday Mode Banner | SalesPerformanceDashboard | Friday goal completion status |

### Recording Components
| Component | Location | Purpose |
|---|---|---|
| Recordings page | `Recordings.jsx` | Grid of recording cards with video player, download, delete |
| RecordingsPanel | `RecordingsPanel.jsx` | Pre-existing slide-in panel for in-call recordings (NOT new, NOT part of performance dashboard) |

---

## 10. MULTI-TENANT CHANGES NEEDED FOR ARRIV ONE

### Entities Requiring `tenant_id`

| Entity | Current | Required |
|---|---|---|
| `SalesGoal` | No `tenant_id` | Add `tenant_id`; filter all queries by tenant |
| `ManagerNote` | No `tenant_id` | Add `tenant_id`; filter all queries by tenant |
| `CultureBanner` | No `tenant_id` | Add `tenant_id`; filter all queries by tenant |
| `AppSetting` | No `tenant_id` | Prefix keys with tenant or add `tenant_id` field |

### Queries Requiring Tenant Filtering

| Function | Current Query | Required Change |
|---|---|---|
| `computeSalesPerformance` | `SalesTeamMember.list()` / `.filter({ id })` — no tenant filter | Filter by `tenant_id` |
| `computeSalesPerformance` | `ActivityLog.list('-activity_date', 500)` — no tenant filter | Filter by `tenant_id` |
| `computeSalesPerformance` | `CommissionSourceRecord.list('-created_date', 200)` — no tenant filter | Filter by `tenant_id` |
| `computeSalesPerformance` | `Contact.list('-created_date', 500)` — no tenant filter | Filter by `tenant_id` |
| `computeSalesPerformance` | `SalesGoal.list()` — no tenant filter | Filter by `tenant_id` |
| `manageGoals` (list) | `SalesGoal.list("-created_date", 200)` — no tenant filter | Filter by `tenant_id` |
| `manageGoals` (create) | No tenant context | Set `tenant_id` on create |
| `manageCultureMessages` (list) | `CultureBanner.list("-display_order", 200)` — no tenant filter | Filter by `tenant_id` |
| `manageCultureMessages` (create) | No tenant context | Set `tenant_id` on create |
| `getDailyCultureBanner` | `CultureBanner.filter({ is_active: true })` — no tenant filter | Filter by `tenant_id` |
| `getDailyCultureBanner` | `AppSetting.list()` — no tenant filter | Filter by `tenant_id` or prefix keys |
| `EmployeeProfile` | `ManagerNote.filter({ sales_member_id })` — no tenant filter | Add `tenant_id` to filter |
| `EmployeeProfile` | `SalesGoal.filter({ sales_member_id })` — no tenant filter | Add `tenant_id` to filter |
| `Recordings` | `VideoRecording.filter({ recorded_by_id })` — no tenant filter | Add `tenant_id` to filter |

### RLS Requirements

| Entity | Required RLS |
|---|---|
| `SalesGoal` | Read: all tenant users; Create/Update/Delete: tenant admin only |
| `ManagerNote` | Read: rep can see own notes; Create: tenant admin/manager only; Update/Delete: author or tenant admin |
| `CultureBanner` | Read: all tenant users; Create/Update/Delete: tenant admin only |
| `AppSetting` | Read: all tenant users (for banner settings); Write: tenant admin only |
| `VideoRecording` | Read: rep can see own recordings; tenant admin can see all tenant recordings |

### Tenant-Specific Goals
- Goals must be scoped to a tenant (`tenant_id` on `SalesGoal`)
- Team-wide goals (`sales_member_id` null) apply within a tenant only
- Market-specific goals (`market` field) should be tenant-scoped (Estate Media markets like "Atlanta" may not apply to other tenants)

### Tenant-Specific AI Preferences
- `culture_banner_mode` and `culture_banner_source` must be per-tenant (not global AppSetting)
- Per-rep source preference (localStorage) is already per-user but should be validated against tenant's available sources
- AI prompts should be tenant-customizable (not hardcoded "real estate media sales team")

### Tenant-Specific Manager/Rep Relationships
- `ManagerNote.author_id` and `sales_member_id` must be within the same tenant
- Manager role must be tenant-scoped (tenant_admin or manager role within tenant)
- `EmployeeProfile` must only show reps within the same tenant

### Tenant-Specific Performance Calculations
- `computeSalesPerformance` must filter all data sources by `tenant_id`
- `getOwnerDashboard` already uses `performanceEngine.ts` which is tenant-aware — but `resolveAdminTenant` must enforce tenant boundary
- Market extraction (`extractMarket`) uses Estate Media-specific state mapping (GA→Atlanta, MD→Maryland) — must be tenant-configurable
- Revenue by market should use tenant-specific market definitions

---

## 11. ESTATE MEDIA-SPECIFIC ITEMS

### Items Tied to Arriv Estate Media (Should NOT Auto-Copy to Arriv One)

| Item | Location | Why It's Estate Media-Specific |
|---|---|---|
| "Arriv Estate Media" in AI prompts | `getDailyCultureBanner`, `manageCultureMessages` | Hardcoded company name in all source prompts |
| "real estate media sales team" in AI prompts | Same | Industry-specific prompt context |
| Market extraction mapping (GA→Atlanta, MD→Maryland, TX→Texas, FL→Florida) | `performanceEngine.ts` `extractMarket()` | Estate Media's specific market territories |
| "Sales Growth Advisor" default title | `EmployeeProfile.jsx` | Estate Media-specific role title |
| Friday Mode concept | `SalesPerformanceDashboard.jsx` | Estate Media-specific cultural feature (Friday off if goals met) |
| "Arriv One" branding in dashboard header | `SalesPerformanceDashboard.jsx` | Hardcoded brand text (ironically already says "Arriv One" — likely a copy-paste from the Arriv One project) |
| Gold/Cream color scheme (#B8956A, #FFFBF5, #1A1A1A) | All performance pages | Estate Media brand colors |
| Blue accent (#2563EB, #3B82F6) on Owner Dashboard | `OwnerDashboard.jsx`, `KpiCard.jsx` | Different color scheme from rep dashboard — appears to be from Arriv One's design |
| "Brad Burke" / "careers@arrivestatemedia.com" | Not in performance dashboard but in related email templates | Estate Media-specific (not directly in dashboard) |
| Bible verse examples in prompts ("Acts 28:19", "Philippians 4:13") | `getDailyCultureBanner` | Christian-specific examples in default prompt |
| `$500 training bonus` | Not in performance dashboard | Estate Media-specific (in ICA, not dashboard) |

### Color Scheme Inconsistency
- **SalesPerformanceDashboard:** Uses Estate Media gold/cream (#B8956A, #FFFBF5, #1A1A1A)
- **OwnerDashboard:** Uses blue (#2563EB) — appears to already be adapted from Arriv One's design
- **KpiCard:** Uses blue (#2563EB)
- **GoalManager / CultureManager:** Use blue (#2563EB)
- This suggests the Owner Dashboard components were already partially adapted from Arriv One, while the rep dashboard retains Estate Media colors

---

## 12. INSTRUCTIONS FOR ARRIV ONE

### INSTRUCTIONS FOR ARRIV ONE — SALES PERFORMANCE DASHBOARD UPDATE

#### New Features to Add

1. **Sales Rep Performance Dashboard Page**
   - Create `/SalesPerformanceDashboard` page
   - Daily Goals section: 8 MetricCards with progress bars (calls, emails, texts, conversations, appointments, deals_closed, revenue, commission)
   - KPI Dashboard: 13 KPIs with period toggle (weekly/monthly/quarterly/yearly)
   - Pipeline Funnel: weekly pipeline stages (leads→conversations→appointments→quotes→clients→revenue)
   - AI Health Score: client-side InvokeLLM generating 0-100 score + summary
   - AI Coaching: 4 cards (strengths, areas for improvement, recommended actions, growth trends)
   - Friday Mode: conditional banner checking weekly goal completion
   - Culture Banner: motivational banner with verse (see below)
   - Use Arriv One's existing color scheme, NOT Estate Media gold/cream

2. **Owner Dashboard Page**
   - Create `/OwnerDashboard` page (if not already present)
   - 6 company KPI cards (revenue, new contacts, deals won, close rate, avg deal size, pipeline value)
   - Revenue by Market breakdown
   - Daily Team Activity (calls, emails, texts, meetings)
   - Team Performance Rankings table (sortable by 7 metrics)
   - Embed GoalManager and CultureManager components

3. **Recordings Page**
   - Create `/Recordings` page
   - Grid of recording cards filtered by `recorded_by_id` = current rep
   - Video player, download, delete
   - Connect to Arriv One's existing VideoRecording entity

4. **EmployeeProfile Page Enhancements**
   - Add Manager Notes section (coaching/review notes)
   - Add Recognition & Awards section (recognition-type notes)
   - Add Current Goals section with progress bars
   - Add AI Growth Insights (strengths, growth opportunities, career summary)
   - Add Lifetime Performance stats
   - Add Training Completed section

5. **GoalManager Component**
   - Admin CRUD for goals (create, list, delete)
   - Fields: metric (12 options), period (5 options), target, assignee
   - Embed in Owner Dashboard

6. **CultureManager Component**
   - Admin CRUD for culture banners
   - AI mode toggle (Switch)
   - Default wisdom source dropdown (6 options)
   - "Generate Now" button for manual AI generation
   - Embed in Owner Dashboard

7. **Performance Shared Module**
   - Create `base44/shared/performanceEngine.ts` with tenant-aware functions:
     - `periodBounds`, `loadTenantData`, `computeRepMetrics`, `computeTenantRollup`, `computePipeline`, `computeLifetimeStats`, `computeCallStreak`, `computeRevenueByMarket`
   - All functions must filter by `tenant_id`

8. **Backend Functions**
   - `computeSalesPerformance` — must accept `tenant_id` and filter all queries
   - `getOwnerDashboard` — already partially tenant-aware; ensure `resolveAdminTenant` enforces tenant boundary
   - `manageGoals` — must set/filter `tenant_id`; add admin auth check
   - `manageCultureMessages` — must set/filter `tenant_id`; add admin auth check
   - `getDailyCultureBanner` — must filter by `tenant_id`; use tenant-specific AppSetting keys

#### Existing Arriv One Systems to Reuse

| System | What to Reuse |
|---|---|
| `ActivityLog` entity | Supply call/email/meeting/task data — already has `tenant_id` |
| `Deal` entity | Supply deal/revenue/pipeline data — already has `tenant_id` |
| `Commission` entity | Supply commission data — already has `tenant_id` |
| `Contact` entity | Supply lead/new contact data — already has `tenant_id` |
| `SmsMessage` / `SmsConversation` | Supply text count — already has `tenant_id` |
| `SalesTeamMember` entity | Supply rep identity — already has `tenant_id` |
| `VideoRecording` entity | Supply recordings — add `tenant_id` if not present |
| `TrainingCompletion` entity | Supply training data for EmployeeProfile |
| `AppSetting` entity | Store banner settings — add `tenant_id` or prefix keys |
| `InvokeLLM` integration | Generate AI health scores, coaching, and culture banners |
| Auth system | Use existing tenant_admin role for admin checks |

#### Features Requiring Tenant Adaptation

1. **All entities** (`SalesGoal`, `ManagerNote`, `CultureBanner`): Add `tenant_id` field and RLS
2. **All backend functions**: Filter queries by `tenant_id`; set `tenant_id` on creates
3. **AppSetting**: Use tenant-prefixed keys (e.g., `tenant_{id}_culture_banner_mode`) or add `tenant_id` field
4. **Market extraction**: Replace Estate Media's GA→Atlanta mapping with tenant-configurable market definitions
5. **AI prompts**: Replace "real estate media sales team" with tenant's industry/company name (tenant-configurable setting)
6. **Manager notes**: Ensure `author_id` and `sales_member_id` are in the same tenant
7. **Goal assignment**: Ensure `sales_member_id` on goals is in the same tenant
8. **Admin auth**: Add server-side admin/tenant_admin checks to `manageGoals` and `manageCultureMessages` (currently missing)
9. **Friday Mode**: Make the "Friday off" concept tenant-configurable (not all tenants may want this)
10. **Color scheme**: Use Arriv One's design system, not Estate Media gold/cream
11. **Wisdom sources**: Make available sources tenant-configurable (some tenants may want to restrict to secular only)

#### Estate Media-Specific Pieces NOT to Copy

1. "Arriv Estate Media" / "real estate media sales team" in AI prompts
2. Market mapping (GA→Atlanta, MD→Maryland, TX→Texas, FL→Florida)
3. "Sales Growth Advisor" as default title
4. Friday Mode concept (unless tenant opts in)
5. Gold/Cream/Black color scheme (#B8956A, #FFFBF5, #1A1A1A)
6. Bible-specific verse examples in default prompts
7. "Arriv One" text in dashboard header (already present in Estate Media code — likely a copy-paste artifact)
8. The inconsistency between `computeSalesPerformance` (inline metrics, no tenant) and `performanceEngine.ts` (shared, tenant-aware) — use only the shared module in Arriv One

#### Dependencies

| Dependency | Purpose |
|---|---|
| `InvokeLLM` integration | AI health score, coaching, culture banner generation |
| `ActivityLog` entity | Call/email/meeting/task data |
| `Deal` entity | Deal/revenue/pipeline data |
| `Commission` / `CommissionSourceRecord` | Commission data |
| `Contact` entity | Lead/contact data |
| `SmsMessage` / `SmsConversation` | Text count |
| `SalesTeamMember` entity | Rep identity and role |
| `VideoRecording` entity | Recordings |
| `TrainingCompletion` entity | Training history |
| `AppSetting` entity | Culture banner settings |
| `Progress` UI component | Goal progress bars |
| `Select` UI component | Period toggle, source dropdown |
| `Dialog` UI component | Note modal, verse modal |
| `Switch` UI component | AI mode toggle |
| `lucide-react` icons | Metric icons |
| `recharts` (available but not used) | Could be used for trend charts |

#### Testing Requirements

1. **Rep dashboard loads** for an active rep with no data — all metrics show 0, no errors
2. **Rep dashboard loads** for an active rep with data — all metrics display correctly
3. **KPI period toggle** switches between weekly/monthly/quarterly/yearly and updates all 13 KPIs
4. **Daily goals** show progress bars when goals exist; show raw values when no goals
5. **Pipeline funnel** renders all 6 stages with correct proportions
6. **AI health score** generates a 0-100 number and summary without error
7. **AI coaching** generates 4 cards with arrays of insights
8. **Friday Mode** appears only on Fridays; shows correct goal completion status
9. **Culture banner** displays when banners exist; hidden when none
10. **Verse modal** opens on click and shows verse text
11. **Wisdom source dropdown** appears only in AI mode; persists selection to localStorage
12. **Owner dashboard** loads for admin; returns 403 for non-admin
13. **Rankings table** sorts by all 7 options correctly
14. **Revenue by Market** groups deals correctly
15. **GoalManager** creates, lists, and deletes goals
16. **CultureManager** creates manual banners, toggles AI mode, generates AI banner on demand
17. **EmployeeProfile** shows goals, notes, recognitions, training, AI insights
18. **Manager note** created by admin appears in correct section (coaching/review vs recognition)
19. **Recordings page** shows only the current rep's recordings
20. **Recording download** works
21. **Recording delete** removes from list and database
22. **Multi-tenant isolation**: Tenant A admin cannot see Tenant B's goals, notes, banners, or performance data
23. **Multi-tenant goals**: Team-wide goal in Tenant A does not appear for Tenant B reps
24. **Multi-tenant banners**: AI banner generated for Tenant A does not appear for Tenant B
25. **AI failure**: Health score shows 0 with "Unable to generate score" on InvokeLLM error
26. **AI failure**: Culture banner generation failure does not crash the dashboard
27. **No data**: All pages handle empty data gracefully with empty states

---

**END OF AUDIT**

This document covers only the recently added Sales Performance Dashboard features. No files were modified, deleted, or created. The underlying CRM, calling system, commission engine, and video recording capture are out of scope and were not audited.