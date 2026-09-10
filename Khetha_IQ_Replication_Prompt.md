# Khetha IQ — Exact Replication Specification

## Overview
Replicate the Khetha IQ page exactly as described below. This is a recruiting/hiring intelligence dashboard with a left sidebar navigation, a top action bar, and multiple content views. Every detail — colors, icons, spacing, modal structure, button styles — must match precisely.

---

## 1. Color Palette & Typography

| Token | Value | Usage |
|---|---|---|
| CREAM | `#FFFBF5` | Light text on dark cards, button text on gold |
| GOLD | `#B8956A` | Primary accent, active tab bg, button bg, focus borders |
| GOLD_DARK | `#A68559` | Hover state for gold, secondary accent |
| TEXT_DARK | `#1A1A1A` | Primary text on light backgrounds, dark card bg |
| MUTED_DARK | `rgba(26,26,26,0.45)` | Muted text on light backgrounds (sidebar inactive labels) |
| MUTED_DARK_60 | `rgba(26,26,26,0.6)` | Secondary text on light backgrounds |
| MUTED_LIGHT | `rgba(255,251,245,0.5)` | Muted text on dark cards |
| MUTED_LIGHT_40 | `rgba(26,26,26,0.4)` | Placeholder/icon muted |
| SERIF | `fontFamily: "Georgia, 'Times New Roman', serif"` | All headings, job titles, card titles, modal titles |

**Font rule:** All headings (h1, h2, h3, modal titles, card titles) use SERIF. Body text uses the default sans-serif.

---

## 2. Page Layout Structure

```
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
  {/* TOP BAR */}
  <div className="flex items-center justify-between mb-4 gap-3">...</div>

  {/* MAIN BODY: sidebar + content */}
  <div className="flex flex-col md:flex-row gap-6">
    <aside className="md:w-60 shrink-0">...</aside>
    <div className="flex-1 min-w-0">...</div>
  </div>

  {/* MODALS (conditional) */}
</div>
```

---

## 3. Top Action Bar

A horizontal bar at the top of the page. Left side has a Back button (only visible when navigation history exists) and a Global Search input. Right side has three buttons in this exact order (left to right):

### Left side:
- **Back button** — Only renders when `history.length > 0`. Style: `backgroundColor: "#1A1A1A"`, `color: "#FFFBF5"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`. Icon: `ArrowLeft` (lucide-react, `w-4 h-4`). Label: "Back". Variant: outline. `className="gap-1.5 shrink-0"`.
- **Global Search** — A search input component (see Section 4 below).

### Right side (3 buttons, left to right, with `gap-2 flex-wrap`):
1. **"Create Job Page"** — Icon: `Plus` (lucide-react, `w-4 h-4`). Style: `backgroundColor: "#1A1A1A"`, `color: "#FFFBF5"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`. `className="gap-1.5"`. Opens the JobPageBuilder modal.
2. **"Careers Hub"** — Icon: `Globe` (lucide-react, `w-4 h-4`). Variant: outline. Style: `backgroundColor: "#FFFFFF"`, `color: "#1A1A1A"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`. `className="gap-1.5"`. Opens the CareersHubSettings modal.
3. **"Request New Hire"** — Icon: `Sparkles` (lucide-react, `w-4 h-4`). Variant: outline. Style: `backgroundColor: "#FFFFFF"`, `color: "#1A1A1A"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`. `className="gap-1.5"`. Opens the Create Job modal.

---

## 4. Global Search Component

A search input with a dropdown of results. Width: `w-full max-w-md`.

**Input:**
- Icon: `Search` (lucide-react, `w-4 h-4`), positioned absolute left-3, color `rgba(26,26,26,0.4)`.
- Placeholder: "Search employees, candidates..."
- Style: `w-full pl-9 pr-4 py-2 rounded-lg border text-sm focus:outline-none bg-white`, `borderColor: "rgba(184,149,106,0.15)"`.
- Debounced (300ms), triggers when query >= 2 chars.

**Dropdown results** (appears below input when results exist):
- Container: `absolute top-full mt-1 w-full bg-white border rounded-lg shadow-lg max-h-80 overflow-y-auto z-50`, `borderColor: "rgba(184,149,106,0.15)"`.
- **Employees section** — Header: "EMPLOYEES" (`text-xs font-semibold uppercase`, color `rgba(26,26,26,0.4)`). Each result: `User` icon (`w-4 h-4`, color `rgba(26,26,26,0.4)`), name (font-medium, color `#1A1A1A`), title/email (text-xs, muted). Clicking navigates to EmployeeProfile.
- **Khetha IQ Candidates section** — Header: "KHETHA IQ CANDIDATES". Each result: `Briefcase` icon (`w-4 h-4`, color `#B8956A`), name, email. Clicking navigates to `KhethaIQ?view=candidates`.

---

## 5. Sidebar

A white rounded card on the left (`md:w-60`). Container style:

```js
{
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "16px", // rounded-2xl
  padding: "12px", // p-3
}
// Classes: "flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-2 md:pb-0 md:sticky md:top-24 md:h-[calc(100vh-7rem)]"
```

### Logo
At the top of the sidebar, centered. Container: `flex justify-center px-2 py-3 mb-2 shrink-0` with `borderBottom: "1px solid rgba(184,149,106,0.15)"`. Image: `h-24 w-auto object-contain`. Source comes from the manifest (`manifest.logo_url`), falling back to the Arriv logo URL.

### Navigation Items (Canonical Tab Order)

The sidebar has exactly **17 tabs** in this exact order, with these exact labels and icons (all from lucide-react):

| # | Tab ID | Label | Icon |
|---|---|---|---|
| 1 | dashboard | Dashboard | `LayoutDashboard` |
| 2 | ask_khetha | Ask Khetha | `Sparkles` |
| 3 | jobs | Jobs | `Briefcase` |
| 4 | candidates | Candidates | `Users` |
| 5 | talent_search | Talent Search | `Search` |
| 6 | talent_pools | Talent Pools | `Users` |
| 7 | pipeline | Pipeline | `GitBranch` |
| 8 | interviews | Interviews | `Video` |
| 9 | async_interviews | Async Interviews | `CalendarClock` |
| 10 | reminders | Reminders | `Mail` |
| 11 | offers | Offers | `FileText` |
| 12 | tasks | Tasks | `CheckSquare` |
| 13 | applications | Applications | `FileText` |
| 14 | portal | Applicant Portal | `Search` |
| 15 | learning | Learning | `Brain` |
| 16 | posthire | Performance Data | `Activity` |
| 17 | analytics | Analytics | `BarChart3` |

**Note:** Labels can be overridden by a manifest from the central app (if a manifest tab with the same id exists, its label is preferred), but the order, icons, and structure stay canonical.

### Nav Item Button Style

```jsx
<button
  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
  style={{
    backgroundColor: active ? "#B8956A" : "transparent",
    color: active ? "#1A1A1A" : "rgba(26,26,26,0.45)",
  }}
  // Hover (inactive only): backgroundColor -> "rgba(184,149,106,0.1)", color -> "#1A1A1A"
>
  <Icon className="w-4 h-4 shrink-0" />
  {item.label}
</button>
```

- Active tab: gold background (`#B8956A`), dark text (`#1A1A1A`).
- Inactive tab: transparent background, muted text (`rgba(26,26,26,0.45)`), hover shows light gold tint.
- Container: `flex md:flex-col gap-1` (horizontal scroll on mobile, vertical on desktop).

---

## 6. Content Views

When no detail panel (job/candidate/compare) is active, the content area renders the active sidebar view. Each view is a distinct component:

### Dashboard (default view)
Renders `RecruitingAssistantHome` — a recruiting assistant home page with a "Start Search" action that navigates to the Talent Search view.

### Ask Khetha
Renders `AskKhethaChat` — an AI chat interface for recruiting questions.

### Jobs View
**Header:** "Jobs" (text-2xl, font-bold, SERIF, color `#1A1A1A`). Subtitle: "Open Jobs Needing Candidates" (text-sm, color `rgba(26,26,26,0.45)`).

**Sync indicator** (when syncing): A rounded bar with `Loader2` icon (animate-spin, `w-4 h-4`, color `#B8956A`) and text "Syncing applications to Khetha IQ...". Background: `rgba(184,149,106,0.08)`.

**Job cards grid:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`.

#### Job Card (HireJob — existing jobs):
```
Card style (dark):
  backgroundColor: "#1A1A1A"
  border: "1px solid rgba(184,149,106,0.2)"
  borderRadius: "14px"
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)"
  padding: "16px" (p-4)
  cursor: pointer
  hover: translateY(-2px), boxShadow -> "0 8px 32px rgba(184,149,106,0.15)"
```
- **Title row:** Job title (font-semibold, SERIF, color `#FFFBF5`) + status badge (right-aligned).
  - Status badge colors:
    - `draft`: bg `rgba(255,251,245,0.08)`, text `rgba(255,251,245,0.6)`
    - `open`: bg `#B8956A`, text `#1A1A1A`
    - `closed`: bg `rgba(220,38,38,0.2)`, text `#FCA5A5`
    - `filled`: bg `#A68559`, text `#FFFBF5`
  - Badge style: `text-xs px-2 py-0.5 rounded font-medium`.
- **Department:** `text-sm`, color `rgba(255,251,245,0.5)`. Fallback: "No department".
- **Experience requirements:** `text-xs`, color `rgba(255,251,245,0.5)` (if present).
- **Button row** (bottom, `mt-auto pt-3`, `borderTop: "1px solid rgba(184,149,106,0.12)"`):
  - **"View Listing"** — Only if a listing URL exists. Style: `backgroundColor: "rgba(184,149,106,0.15)"`, `color: "#B8956A"`, `border: "1px solid rgba(184,149,106,0.3)"`. `text-xs px-2.5 py-1.5 rounded-lg font-medium`. Opens listing URL in new tab.
  - **"Edit Page"** — Same style as View Listing. Shows `Loader2` spinner (w-3 h-3) when linking is in progress. Opens the EditJobPageModal.
  - **"Duplicate"** — Same style. Icon: `Copy` (lucide-react, `w-3 h-3`). Shows `Loader2` spinner when duplicating. Shows a `window.confirm` dialog before duplicating.

#### Job Card (JobOpening — pages without a matching HireJob):
Same dark card style. Shows title, status badge, department, location/employment_type/work_arrangement metadata row. Button row has "Edit Page" and "Duplicate" (same styles). Clicking the card opens the public page in a new tab.

### Candidates View
**Header:** "Candidates" (text-2xl, font-bold, SERIF, color `#1A1A1A`). Subtitle: "All candidates across your hiring pipeline" (text-sm, color `rgba(26,26,26,0.6)`).

**Search bar:** `Search` icon (absolute left-3, `w-4 h-4`, color `rgba(26,26,26,0.4)`), input with `border: "1px solid rgba(184,149,106,0.15)"`, focus border becomes `#B8956A`. Placeholder: "Search candidates...". Width: `max-w-md`.

**Candidate cards:** `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3`.
- White card: `backgroundColor: "#FFFFFF"`, `border: "1px solid rgba(184,149,106,0.15)"`, `borderRadius: "0.75rem"`, `padding: 16px`.
- Hover: border color → `rgba(184,149,106,0.3)`.
- Name (font-semibold, SERIF, color `#1A1A1A`) + status badge (right, `text-xs px-2 py-0.5 rounded capitalize`, border `1px solid rgba(184,149,106,0.2)`, color `rgba(26,26,26,0.7)`).
- Target role (text-sm, color `rgba(26,26,26,0.6)`, underscores replaced with spaces).
- Email (text-xs, color `rgba(26,26,26,0.4)`, mt-2).

**Empty state:** `Users` icon (`w-10 h-10`, color `rgba(184,149,106,0.3)`) + "No candidates yet." (color `rgba(26,26,26,0.6)`).

**Internal Candidates section:** Below the external candidates. Header: "Internal Candidates" (text-lg, font-semibold, SERIF, color `#1A1A1A`). Shows active SalesTeamMember records in the same white card grid. Each card: name (font-semibold, SERIF), role (text-sm, muted).

### Interviews View
**Header:** "Interviews" (text-2xl, font-bold, SERIF). Subtitle: "All interviews across your hiring pipeline".

**View toggle:** Two buttons in a pill container (`p-1 rounded-lg`, bg `rgba(184,149,106,0.08)`):
- "Active (N)" / "Archived (N)"
- Active button: `backgroundColor: "#FFFFFF"`, `color: "#1A1A1A"`, `boxShadow: "0 1px 2px rgba(0,0,0,0.05)"`.
- Inactive: `color: rgba(26,26,26,0.7)`.

**Interview cards** (white card, `p-4`, `flex flex-col gap-3`):
- Applicant name (font-semibold, SERIF) + date/time (text-sm, muted) + meeting link (if present, `ExternalLink` icon + "Join link", color `#B8956A`, text-xs).
- Badges (right side): "✓ Scorecard" (bg `rgba(184,149,106,0.15)`, color `#B8956A`) or "Needs Review" (border, color muted). Status badge.
- **Action button row** (`flex flex-wrap items-center gap-2`):
  - `ConvertToAiButton` — Convert to AI interview
  - `ConvertToHumanButton` — Convert to human interview
  - **"Recording"** — `Play` icon (`w-3.5 h-3.5`). Style: transparent bg, color `#B8956A`, border `1px solid rgba(184,149,106,0.4)`. Shows `Loader2` when loading.
  - **"Tail Clip"** — `Play` icon. Style: transparent bg, color `rgba(26,26,26,0.7)`, border `1px solid rgba(184,149,106,0.25)`. Title: "AI server-side recording covering the end of the interview".
  - **"Generate Scorecard"** — `FileAudio` icon (`w-3.5 h-3.5`). Style: transparent bg, color `#B8956A`, border `1px solid rgba(184,149,106,0.4)`. Shows `Loader2` when generating.
  - **"Questionnaire"** — `ClipboardList` icon (`w-3.5 h-3.5`). Style: `backgroundColor: "#B8956A"`, `color: "#1A1A1A"`. Opens questionnaire in-page (navigates to job detail with questionnaire tab).
  - **"Reschedule"** — `CalendarClock` icon (`w-3.5 h-3.5`). Style: transparent bg, color `#B8956A`, border `1px solid rgba(184,149,106,0.4)`. Only shows when status is "scheduled". Opens RescheduleInterviewModal.
  - **"Disqualify"** — `UserX` icon (`w-3.5 h-3.5`). Style: transparent bg, color `#DC2626`, border `1px solid rgba(220,38,38,0.3)`. Shows `Loader2` when processing. Shows confirm dialog. Only shows when status is not "cancelled".

**Completed scorecard interviews** (HireInterview records): White card, `p-4`, `flex items-center justify-between`. Name + date on left. Score (`X/100`, text-sm) + status badge on right.

**Empty state:** `Video` icon (`w-10 h-10`, color `rgba(184,149,106,0.3)`) + "No active interviews." or "No archived interviews."

### Async Interviews View
Renders `AsyncInterviewManagerContent` — a self-guided async interview management interface.

### Reminders View
Renders `ReminderQueueView` — a queue of interview reminder emails. **This tab is Estate Media–local** (not in the central Khetha IQ app).

### Offers View
**Header:** "Offers" (text-2xl, font-bold, SERIF). Subtitle: "Candidates with pending offers and offer letter templates".

**Offer cards:** `grid grid-cols-1 md:grid-cols-2 gap-3`. White card, `p-4`, cursor-pointer. Name (font-semibold, SERIF) + "Offer Extended" badge (border, color muted). Target role + email.

**Empty state:** `FileText` icon (`w-10 h-10`, color `rgba(184,149,106,0.3)`) + "No pending offers."

Below the cards: `OfferLettersPanel` component for offer letter template management.

### Tasks View
Renders `RecruitingTasksView` — a recruiting task management interface.

### Talent Search View
Renders `RecruitingChat` — an AI-powered talent search chat interface. Has a "Review Prospects" action that navigates to the Candidates view.

### Talent Pools View
Renders `TalentPipelinesView` — talent pipeline/group management.

### Pipeline View
Renders `PipelineMapView` — a visual pipeline map of candidates through hiring stages.

### Applications View
Renders `ApplicationsPanel` — a job applications management panel. Accepts a `pendingAction` prop (for pre-selecting a status or scheduling an interview when navigated from a candidate decision).

### Applicant Portal View
Renders `ApplicantPortalPanel` wrapped in `max-w-2xl mx-auto` — a public-facing applicant portal preview.

### Learning View
Renders `LearningPanel` — hiring/learning analytics and insights.

### Performance Data View
Renders `PerformanceDataView` — post-hire performance data tracking.

### Analytics View
Renders `AnalyticsPanel` — comprehensive hiring analytics with charts.

---

## 7. Modals

### 7A. Create Job Modal ("Request New Hire")

**Overlay:** `fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4`, `backdropFilter: "blur(6px)"`. Clicking the overlay closes (unless creating).

**Modal card:** Dark card style (same as job cards: bg `#1A1A1A`, border `rgba(184,149,106,0.2)`, borderRadius `14px`). `max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6`.

**Title:** "Create Job Opening" (text-xl, font-bold, SERIF, color `#FFFBF5`).

**Content:** Renders `JobCreateForm` component. While creating: `Loader2` spinner (`w-8 h-8`, color `#B8956A`) + "Creating job..." text (color `rgba(255,251,245,0.5)`).

### 7B. Create Job Page Modal (JobPageBuilder)

**Overlay:** Same blur overlay as above. `max-w-2xl w-full max-h-[90vh] overflow-y-auto`.

**Modal style:** `backgroundColor: "#FFFFFF"`, `borderRadius: "12px"`, `boxShadow: "0 20px 60px rgba(0,0,0,0.15)"`.

**Header:** Gold icon container (`w-8 h-8 rounded-lg`, bg `rgba(184,149,106,0.12)`) with `Globe` icon (`w-4 h-4`, color `#B8956A`). Title: "Create Job Page" (text-lg, font-bold, SERIF, color `#1A1A1A`). Close button: `X` icon (`w-5 h-5`, color `rgba(26,26,26,0.5)`), `p-1.5 rounded-lg hover:bg-black/5`. Border bottom: `1px solid rgba(184,149,106,0.15)`.

**3-step wizard:**

#### Step 1 — Input
- **"Describe what you want"** — Label with `Sparkles` icon (`w-3.5 h-3.5`, color `#B8956A`). Textarea (3 rows, minHeight 80px). Placeholder: "Describe the role and what you want the page to convey. e.g. 'We're hiring a real estate photographer. Emphasize flexibility, creative freedom, and growth opportunities.'". Helper text below: "This description appears on the public career page and gives the AI context for better analysis."
- **"Describe the page design"** — Label with `Palette` icon (`w-3.5 h-3.5`, color `#B8956A`). Textarea (3 rows, minHeight 70px). Placeholder: "Describe the visual design: colors, structure, layout style, tone... e.g. 'Warm, inviting layout with gold accents. Hero section with a large photo. Clean, modern structure with clear section breaks.'". Helper text: "Describe the colors, structure, and layout style you want for the page."
- **"Job Description Source"** — Tab switcher with 3 tabs in a pill container (`p-1 rounded-lg`, bg `rgba(184,149,106,0.06)`):
  - "Text" (`FileText` icon) — Textarea (6 rows), placeholder "Paste the full job description here..."
  - "URL" (`Link` icon) — URL input, placeholder "https://example.com/job-posting"
  - "File" (`Upload` icon) — Dashed border dropzone (`2px dashed rgba(184,149,106,0.3)`, bg `rgba(184,149,106,0.04)`). Shows `Upload` icon + "Upload PDF, DOC, DOCX, or TXT" when empty. Shows `Loader2` when uploading. Shows `FileText` icon + filename + "Click to replace" when uploaded. Accepts `.pdf,.doc,.docx,.txt`.
  - Active tab: bg `rgba(184,149,106,0.15)`, border `1px solid rgba(184,149,106,0.4)`, color `#A68559`. Inactive: transparent, color `rgba(26,26,26,0.5)`.
- **Analyze button** — Full width, `py-3 rounded-lg text-sm font-semibold`. Style: `backgroundColor: "#B8956A"`, `color: "#FFFBF5"`. Icon: `Sparkles` (`w-4 h-4`). Label: "Analyze & Create Job Page" (or `Loader2` + "Analyzing..." when loading). Disabled when no input or analyzing.

#### Step 2 — Review
- Back button: `ArrowLeft` icon + "Back" (color `#B8956A`, text-sm font-medium). Label: "Review extracted details".
- Fields (all with `inputStyle`: border `1px solid rgba(184,149,106,0.2)`, borderRadius `8px`, padding `10px 14px`, fontSize `14px`, color `#1A1A1A`. Focus border → `#B8956A`):
  - Job Title (input)
  - Department + Location (2-col grid)
  - Description (textarea, 4 rows)
  - Employment Type (select: Full Time, Part Time, Contract, Temporary, Internship, Volunteer) + Work Arrangement (select: Onsite, Hybrid, Remote) — 2-col grid
  - Compensation + Work Schedule (2-col grid)
  - Experience Requirements (input)
  - Skills (comma-separated input)
  - Responsibilities (textarea, one per line, 4 rows)
  - Required Qualifications (textarea, one per line, 4 rows)
- **Buttons:** "Back" (flex-1, border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`, transparent bg) + "Create Job Page" (flex-1, bg `#B8956A`, color `#FFFBF5`). Shows `Loader2` + "Creating..." when creating. Disabled when no title or creating.

#### Step 3 — Created
- Success circle: `w-16 h-16 rounded-full`, bg `rgba(184,149,106,0.12)`, `Check` icon (`w-8 h-8`, color `#B8956A`).
- Title: "Job Page Created!" (text-xl, font-bold, SERIF, color `#1A1A1A`).
- Subtitle: "Your job page is now live and ready for candidates." (text-sm, muted).
- URL display bar: bg `rgba(184,149,106,0.06)`, border `1px solid rgba(184,149,106,0.2)`, with a "Copy" button (bg `#B8956A`, color `#FFFBF5`, `Copy`/`Check` icon).
- Buttons: "Close" (border, color `#1A1A1A`) + "Preview Page" (bg `#B8956A`, color `#FFFBF5`, opens URL in new tab).

### 7C. Edit Job Page Modal (EditJobPageModal)

**Overlay:** Same blur overlay. `max-w-2xl w-full max-h-[90vh] overflow-y-auto`.

**Modal style:** Same white modal (`#FFFFFF`, borderRadius `12px`, shadow `0 20px 60px rgba(0,0,0,0.15)`).

**Header (sticky top, bg white, z-10):** `Palette` icon in gold container. Title: "Edit Job Page" (text-lg, font-bold, SERIF). Close `X` button. Border bottom `1px solid rgba(184,149,106,0.15)`.

**Body** (`px-6 py-5 space-y-4`):
- **Page Description** — Textarea (3 rows, minHeight 70px). Helper: "Natural-language description of what the page should convey to candidates."
- **Design Description** — Label with `Palette` icon (`w-3.5 h-3.5`, color `#B8956A`). Textarea (3 rows). Helper: "Describe the visual design of the page — colors, structure, layout style, and tone."
- Divider: `borderTop: "1px solid rgba(184,149,106,0.12)"`, then "Job Details" subheader (text-sm, font-semibold, SERIF, color `#1A1A1A`).
- Job Title (input)
- Department + Location (2-col grid)
- Description (textarea, 4 rows)
- Employment Type + Work Arrangement (2-col selects)
- Compensation + Work Schedule (2-col inputs)
- Experience Requirements + Travel Requirements (2-col inputs)
- Skills (comma-separated)
- Responsibilities (textarea, one per line, 4 rows)
- Required Qualifications (textarea, one per line, 4 rows)
- Preferred Qualifications (textarea, one per line, 3 rows)
- Benefits (textarea, one per line, 3 rows)
- Status (select: Draft, Open, Paused, Closed, Filled) + Public Visibility (select: Visible, Hidden) — 2-col grid

**Footer (sticky bottom, bg white):** Border top `1px solid rgba(184,149,106,0.15)`. Three buttons:
- **"Preview"** — `Eye` icon (`w-4 h-4`). Border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`, transparent bg. Opens public URL in new tab.
- **"Cancel"** — flex-1. Border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`, transparent bg.
- **"Save Changes"** — flex-1. bg `#B8956A`, color `#FFFBF5`. `Save` icon (`w-4 h-4`). Shows `Loader2` + "Saving..." when saving. Disabled when no title or saving.

### 7D. Careers Hub Settings Modal

**Overlay:** Same blur overlay. `max-w-2xl w-full max-h-[90vh] overflow-y-auto`.

**Modal style:** Same white modal.

**Header (sticky top, bg white):** `Globe` icon in gold container. Title: "Careers Hub Settings" (text-lg, font-bold, SERIF). Close `X` button. Border bottom `1px solid rgba(184,149,106,0.15)`.

**Body** (`px-6 py-5 space-y-5`):
- **Enable toggle** — A card (`p-3 rounded-lg`, bg `rgba(184,149,106,0.04)`, border `1px solid rgba(184,149,106,0.15)`). Left: "Enable Public Careers Page" (font-semibold, text-sm, color `#1A1A1A`) + helper text (text-xs, muted). Right: Toggle switch (`w-11 h-6 rounded-full`, bg `#B8956A` when on, `rgba(26,26,26,0.2)` when off. Knob: `w-5 h-5 rounded-full bg-white`, translateX 22px when on, 2px when off).
- **Careers Page URL Slug** — Input. Placeholder "e.g. arriv-estate-media". When enabled + slug present: "Preview live page" link with `ExternalLink` icon (color `#B8956A`, text-xs).
- **Company Description** — Textarea (3 rows). Placeholder "Tell candidates about your company..."
- **Hero Image URL** — Input. Placeholder "https://..."
- **Workplace Culture** — Textarea (3 rows). Placeholder "Describe what it's like to work at your company..."
- **Benefits & Perks** — Input + "Add" button (bg `rgba(184,149,106,0.12)`, color `#A68559`, border `1px solid rgba(184,149,106,0.2)`, `Plus` icon). Enter key adds. Tags display as chips (bg `rgba(184,149,106,0.08)`, color `#1A1A1A`, `Trash2` icon to remove).
- **Office Locations** — Same pattern as Benefits. Placeholder "e.g. Austin, TX".
- **Social Links** — 2-col grid of inputs: LinkedIn, Facebook, X (Twitter), Instagram, Company Website, Contact Email. Each with a small label (12px, color `rgba(26,26,26,0.7)`).

**Footer (sticky bottom, bg white):** Border top. Two buttons:
- **"Cancel"** — Border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`.
- **"Save Settings"** — bg `#B8956A`, color `#FFFBF5`. Shows `Loader2` + "Saving..." or `Check` + "Saved!" (2s) or "Save Settings".

---

## 8. Navigation & History System

The page implements a custom navigation history stack. Key behaviors:

- **`navigateTo(updater)`** — Pushes the current view state (activeView, selectedJob, selectedCandidate, compareMode, compareCandidates, initialTab, preselectedCandidateId, scrollY) onto a history stack, then applies the updater.
- **`goBack()`** — Pops the last state from history and restores all view state + scroll position.
- **Back button** — Only visible when `history.length > 0`.
- **Job detail panel** — Kept mounted (hidden via CSS `display: none`) when navigating to a candidate profile, so the active tab, scroll position, and loaded candidates survive navigating back.
- **URL param** — `?view=<tabId>` sets the initial active view on page load.

---

## 9. Job Card Button Behaviors

### "View Listing"
Opens the public job page URL in a new tab. The URL is determined by:
1. Legacy special page path (e.g. `/MediaSpecialist`, `/SalesGrowthAdvisor`, `/MediaSpecialistAtl`) based on the job's `source_application_position` or title/location containing "atlanta".
2. If a linked JobOpening exists: `/careers/{public_slug or job_id}`.

### "Edit Page"
- If a matching JobOpening exists: backfills `source_url` if missing, then opens the EditJobPageModal with a preview URL.
- If no match: creates a new JobOpening from the HireJob data (using default content for special pages), then opens the EditJobPageModal.

### "Duplicate"
Shows a `window.confirm` dialog: "This will create a copy of '{title}' including its job details and linked job page. The copy will be saved as a draft with '(Copy)' added to the title. Continue?"

Creates a new HireJob with `title: "{original} (Copy)"`, status "draft", all fields copied. Also duplicates the linked JobOpening if one exists.

---

## 10. Icon Reference (lucide-react)

All icons used in the Khetha IQ page, importable from `lucide-react`:

```
LayoutDashboard, Sparkles, Briefcase, Users, Search, GitBranch, Video,
FileText, SquareCheckBig, Brain, BarChart3, Radar, Users2, Target,
TrendingUp, MessageSquare, Award, HelpCircle, Plus, Globe, Mail,
Activity, CheckSquare, CalendarClock, Copy, ArrowLeft, Loader2,
X, Palette, Save, Eye, Check, Upload, Link (as LinkIcon),
ExternalLink, User, UserX, Play, FileAudio, ClipboardList, Trash2
```

---

## 11. Input/Label Styles (shared across modals)

```js
const inputStyle = {
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "8px",
  padding: "10px 14px", // CareersHubSettings uses 9px 12px
  fontSize: "14px",
  color: "#1A1A1A",
  width: "100%",
  outline: "none",
};

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(26,26,26,0.7)",
  marginBottom: "6px", // CareersHubSettings uses 5px
  display: "block",
};

// Focus behavior: border color -> "#B8956A"
// Blur behavior: border color -> "rgba(184,149,106,0.2)"
```

---

## 12. Key Behavioral Notes

1. **Manifest-driven labels** — Tab labels can be overridden by a manifest fetched from the central Khetha IQ app (`getKhethaIQManifest` backend function). If the manifest has a tab with the same id, its label is preferred. The logo URL also comes from the manifest. Tab order, icons, and structure remain canonical (manifest extra tabs are filtered out).

2. **Application sync** — On page load, `syncApplicationsToKhethaIQ()` is called to sync local job applications to the central Khetha IQ system. A "Syncing..." indicator shows while this runs.

3. **Legacy page linking** — Special pages (`/MediaSpecialist`, `/MediaSpecialistAtl`, `/SalesGrowthAdvisor`) are linked to HireJobs via `source_url`. The `handleEditPage` function backfills `source_url` on older JobOpening records that predate the field.

4. **Duplicate confirmation** — Always show a `window.confirm` dialog before duplicating any job or job page.

5. **Decision-to-action mapping** — When a candidate decision is confirmed (advance, hold, another_interview, offer, decline), it maps to an application action:
   - `advance` → set status "interview_invitation"
   - `hold` → set status "under_review"
   - `another_interview` → schedule interview
   - `offer` → set status "offer_extended"
   - `decline` → set status "offer_not_extended"

6. **Questionnaire in-page** — The questionnaire opens via in-page navigation (not a modal). Clicking "Questionnaire" on an interview navigates to the job detail panel with the questionnaire tab pre-selected and the candidate pre-selected.

---

## Summary Checklist

- [ ] 17 sidebar tabs in exact order with exact icons
- [ ] Gold (`#B8956A`) active tab, muted inactive
- [ ] SERIF (Georgia) for all headings
- [ ] Dark cards (`#1A1A1A`) for job cards, white cards for candidates/interviews/offers
- [ ] 3 top bar buttons: Create Job Page (dark), Careers Hub (white), Request New Hire (white)
- [ ] Global Search with employee + candidate dropdown
- [ ] 4 modals: Create Job, Create Job Page (3-step wizard), Edit Job Page, Careers Hub Settings
- [ ] Navigation history with Back button and scroll restoration
- [ ] Job card buttons: View Listing, Edit Page, Duplicate (with confirm)
- [ ] All focus borders → gold, all blur borders → `rgba(184,149,106,0.2)