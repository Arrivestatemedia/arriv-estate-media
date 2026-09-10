# Khetha IQ — Recent Changes: Job Page Management System

Copy and paste the block below into the Khetha IQ builder chat. It covers only the recent additions to the Khetha IQ page — the job page creation/editing/duplication system and careers hub settings. The interview system changes are already documented separately.

---

## COPY EVERYTHING BELOW THIS LINE

I need you to replicate the following recent changes to our Khetha IQ page. These are job page management features that were finalized in our Estate Media app. Each section describes the exact UI, behavior, icons, colors, and placement.

### Overview

There are **6 changes** total:

1. **Top bar: "Create Job Page" and "Careers Hub" buttons** — two new buttons added to the Khetha IQ top action bar
2. **Create Job Page modal (3-step AI wizard)** — a multi-step modal that analyzes a job description (text/URL/file) with AI, extracts structured fields, and creates a public job page
3. **Edit Job Page modal** — edit an existing job page's content, design descriptions, and visibility settings with a live preview link
4. **Careers Hub Settings modal** — configure the public careers hub (enable toggle, URL slug, company description, hero image, culture, benefits, locations, social links)
5. **Job card action buttons: "View Listing", "Edit Page", "Duplicate"** — three buttons on each job card in the Jobs view
6. **Duplicate job functionality** — duplicate a HireJob + its linked JobOpening, or duplicate a standalone JobOpening, with "(Copy)" suffix and confirmation dialog

---

### Color Palette (used across all changes)

| Token | Value |
|---|---|
| CREAM | `#FFFBF5` |
| GOLD | `#B8956A` |
| GOLD_DARK | `#A68559` |
| TEXT_DARK | `#1A1A1A` |
| MUTED | `rgba(26,26,26,0.5)` |
| SERIF | `fontFamily: "Georgia, 'Times New Roman', serif"` |

**Rule:** All headings, modal titles, and card titles use SERIF. All modal inputs use the shared input/label styles below.

```js
const inputStyle = {
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "14px",
  color: "#1A1A1A",
  width: "100%",
  outline: "none",
};
// Focus: borderColor -> "#B8956A"
// Blur: borderColor -> "rgba(184,149,106,0.2)"

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(26,26,26,0.7)",
  marginBottom: "6px",
  display: "block",
};

const modalStyle = {
  backgroundColor: "#FFFFFF",
  borderRadius: "12px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};
```

---

### Change 1: Top Bar Buttons

**Location:** Top action bar of the Khetha IQ page, right side. The existing "Request New Hire" button stays; two new buttons are added to its LEFT.

**Exact order (left to right):** "Create Job Page" → "Careers Hub" → "Request New Hire"

**Container:** `<div className="flex items-center gap-2 flex-wrap">`

#### "Create Job Page" button
- Icon: `Plus` (lucide-react, `w-4 h-4`)
- Label: "Create Job Page"
- Style: `backgroundColor: "#1A1A1A"`, `color: "#FFFBF5"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`
- `className="gap-1.5"`
- Action: Opens the JobPageBuilder modal (Change 2)

#### "Careers Hub" button
- Icon: `Globe` (lucide-react, `w-4 h-4`)
- Label: "Careers Hub"
- Variant: outline
- Style: `backgroundColor: "#FFFFFF"`, `color: "#1A1A1A"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`
- `className="gap-1.5"`
- Action: Opens the CareersHubSettings modal (Change 4)

#### "Request New Hire" button (existing — unchanged)
- Icon: `Sparkles` (lucide-react, `w-4 h-4`)
- Label: "Request New Hire"
- Variant: outline
- Style: `backgroundColor: "#FFFFFF"`, `color: "#1A1A1A"`, `border: "1px solid rgba(184,149,106,0.3)"`, `fontWeight: 600`
- `className="gap-1.5"`
- Action: Opens the existing Create Job modal

---

### Change 2: Create Job Page Modal (JobPageBuilder)

**Trigger:** "Create Job Page" button in the top bar.

**Overlay:** `fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4`, `backdropFilter: "blur(6px)"`. Clicking the overlay closes the modal (unless analyzing or creating is in progress).

**Modal:** `max-w-2xl w-full max-h-[90vh] overflow-y-auto`, white modal style (bg `#FFFFFF`, borderRadius `12px`, shadow `0 20px 60px rgba(0,0,0,0.15)`).

**Header:**
- Left: Gold icon container (`w-8 h-8 rounded-lg`, bg `rgba(184,149,106,0.12)`) with `Globe` icon (`w-4 h-4`, color `#B8956A`). Title: "Create Job Page" (text-lg, font-bold, SERIF, color `#1A1A1A`).
- Right: Close button — `X` icon (`w-5 h-5`, color `rgba(26,26,26,0.5)`), `p-1.5 rounded-lg hover:bg-black/5`.
- Border bottom: `1px solid rgba(184,149,106,0.15)`, padding `px-6 py-4`.

**3-step wizard:**

#### Step 1 — Input (`px-6 py-5 space-y-5`)

**Field 1: "Describe what you want"**
- Label with `Sparkles` icon (`w-3.5 h-3.5`, color `#B8956A`) + text "Describe what you want"
- Textarea (3 rows, minHeight 80px, resize vertical)
- Placeholder: "Describe the role and what you want the page to convey. e.g. 'We're hiring a real estate photographer. Emphasize flexibility, creative freedom, and growth opportunities.'"
- Helper text below (text-xs, color `rgba(26,26,26,0.5)`): "This description appears on the public career page and gives the AI context for better analysis."

**Field 2: "Describe the page design"**
- Label with `Palette` icon (`w-3.5 h-3.5`, color `#B8956A`) + text "Describe the page design"
- Textarea (3 rows, minHeight 70px, resize vertical)
- Placeholder: "Describe the visual design: colors, structure, layout style, tone... e.g. 'Warm, inviting layout with gold accents. Hero section with a large photo. Clean, modern structure with clear section breaks.'"
- Helper text: "Describe the colors, structure, and layout style you want for the page."

**Field 3: "Job Description Source"**
- Label: "Job Description Source"
- Tab switcher in a pill container (`flex gap-1 p-1 rounded-lg`, bg `rgba(184,149,106,0.06)`):
  - **"Text"** tab — `FileText` icon (`w-4 h-4`). Active: bg `rgba(184,149,106,0.15)`, border `1px solid rgba(184,149,106,0.4)`, color `#A68559`. Inactive: transparent, border `1px solid transparent`, color `rgba(26,26,26,0.5)`.
  - **"URL"** tab — `Link` icon (`w-4 h-4`). Same active/inactive styles.
  - **"File"** tab — `Upload` icon (`w-4 h-4`). Same active/inactive styles.
  - Each tab: `flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium`

- **Text tab content:** Textarea (6 rows, resize vertical), placeholder "Paste the full job description here..."
- **URL tab content:** URL input, placeholder "https://example.com/job-posting"
- **File tab content:** Dashed border dropzone label (`flex flex-col items-center justify-center gap-2 p-8 rounded-lg cursor-pointer`, border `2px dashed rgba(184,149,106,0.3)`, bg `rgba(184,149,106,0.04)`):
  - Empty: `Upload` icon (`w-6 h-6`, color `#B8956A`) + "Upload PDF, DOC, DOCX, or TXT" (text-sm, muted)
  - Uploading: `Loader2` (`w-6 h-6 animate-spin`, color `#B8956A`) + "Uploading..." (text-sm, muted)
  - Uploaded: `FileText` icon (`w-6 h-6`, color `#B8956A`) + filename (text-sm font-medium, color `#1A1A1A`) + "Click to replace" (text-xs, muted)
  - Hidden file input: `accept=".pdf,.doc,.docx,.txt"`

**Analyze button:**
- Full width, `flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold`
- Style: `backgroundColor: analyzing ? "rgba(184,149,106,0.5)" : "#B8956A"`, `color: "#FFFBF5"`
- Disabled when: no input (no pageDescription, sourceText, sourceUrl, or fileUrl) or analyzing
- Default: `Sparkles` icon (`w-4 h-4`) + "Analyze & Create Job Page"
- Loading: `Loader2` (`w-4 h-4 animate-spin`) + "Analyzing..."
- Action: Calls `createJobPage` backend function with `action: "analyze"`, passing pageDescription, designDescription, sourceType, sourceText, sourceUrl, fileUrl. On success, populates fields from `data.extracted` and advances to step 2.

#### Step 2 — Review (`px-6 py-5 space-y-4`)

**Top row:** Back button (`ArrowLeft` icon `w-4 h-4` + "Back", color `#B8956A`, text-sm font-medium, hover opacity-70) + "Review extracted details" label (text-sm font-medium, muted). Border bottom `1px solid rgba(184,149,106,0.15)`, `pb-3`.

**Fields (all use inputStyle, focus → gold border):**
1. Job Title — input
2. Department + Location — 2-col grid (`grid grid-cols-2 gap-3`). Location placeholder: "City, State or Remote"
3. Description — textarea (4 rows, resize vertical)
4. Employment Type + Work Arrangement — 2-col grid. Employment Type select: Full Time, Part Time, Contract, Temporary, Internship, Volunteer. Work Arrangement select: Onsite, Hybrid, Remote.
5. Compensation + Work Schedule — 2-col grid, inputs
6. Experience Requirements — input
7. Skills — comma-separated input (value = array joined by ", ", onChange splits by "," and trims)
8. Responsibilities — textarea (4 rows, one per line, value = array joined by "\n", onChange splits by "\n")
9. Required Qualifications — textarea (4 rows, one per line)

**Buttons (`flex gap-3 pt-2`):**
- "Back" — `flex-1 py-3 rounded-lg text-sm font-semibold`, border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`, transparent bg. Returns to step 1.
- "Create Job Page" — `flex-1 py-3 rounded-lg text-sm font-semibold`, bg `#B8956A`, color `#FFFBF5`. Disabled when no title or creating. Creating: `Loader2` (`w-4 h-4 animate-spin`) + "Creating...". Action: Calls `createJobPage` with `action: "create"` and all fields. On success, advances to step 3.

#### Step 3 — Created (`px-6 py-10 text-center`)

- Success circle: `w-16 h-16 rounded-full mx-auto mb-4`, bg `rgba(184,149,106,0.12)`, `Check` icon (`w-8 h-8`, color `#B8956A`)
- Title: "Job Page Created!" (text-xl, font-bold, SERIF, color `#1A1A1A`)
- Subtitle: "Your job page is now live and ready for candidates." (text-sm, muted)
- URL bar: `flex items-center gap-2 p-3 rounded-lg mb-5`, bg `rgba(184,149,106,0.06)`, border `1px solid rgba(184,149,106,0.2)`. Read-only input (flex-1) + "Copy" button (bg `#B8956A`, color `#FFFBF5`, `Copy`/`Check` icon `w-3.5 h-3.5`, label "Copy"/"Copied" with 2s reset).
- Buttons (`flex gap-3`):
  - "Close" — `flex-1 py-2.5 rounded-lg text-sm font-semibold`, border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`. Closes modal.
  - "Preview Page" — `flex-1 py-2.5 rounded-lg text-sm font-semibold`, bg `#B8956A`, color `#FFFBF5`. Opens created URL in new tab.

---

### Change 3: Edit Job Page Modal (EditJobPageModal)

**Trigger:** "Edit Page" button on a job card (Change 5), or from a JobOpening card.

**Overlay:** Same blur overlay as Change 2. `max-w-2xl w-full max-h-[90vh] overflow-y-auto`.

**Modal:** Same white modal style.

**Header (sticky top, bg white, z-10):**
- `Palette` icon in gold container (`w-8 h-8 rounded-lg`, bg `rgba(184,149,106,0.12)`, icon `w-4 h-4` color `#B8956A`)
- Title: "Edit Job Page" (text-lg, font-bold, SERIF, color `#1A1A1A`)
- Close: `X` icon (`w-5 h-5`, muted), `p-1.5 rounded-lg hover:bg-black/5`
- Border bottom: `1px solid rgba(184,149,106,0.15)`, padding `px-6 py-4`

**Body (`px-6 py-5 space-y-4`):**

1. **Page Description** — Textarea (3 rows, minHeight 70px). Placeholder: "Describe what you want the page to convey...". Helper: "Natural-language description of what the page should convey to candidates."
2. **Design Description** — Label with `Palette` icon (`w-3.5 h-3.5`, color `#B8956A`). Textarea (3 rows, minHeight 70px). Placeholder: "Describe the desired design: colors, structure, layout style, tone... e.g. 'Use a warm, inviting layout with gold accents. Hero section with a large photo. Clean, modern structure with clear section breaks.'". Helper: "Describe the visual design of the page — colors, structure, layout style, and tone."
3. **Divider** — `borderTop: "1px solid rgba(184,149,106,0.12)"`, paddingTop 16px. Subheader: "Job Details" (text-sm, font-semibold, SERIF, color `#1A1A1A`, mb-3).
4. Job Title — input
5. Department + Location — 2-col grid. Location placeholder: "City, State or Remote"
6. Description — textarea (4 rows)
7. Employment Type + Work Arrangement — 2-col selects (same options as Change 2)
8. Compensation + Work Schedule — 2-col inputs
9. Experience Requirements + Travel Requirements — 2-col inputs
10. Skills — comma-separated input
11. Responsibilities — textarea (4 rows, one per line)
12. Required Qualifications — textarea (4 rows, one per line)
13. Preferred Qualifications — textarea (3 rows, one per line)
14. Benefits — textarea (3 rows, one per line)
15. Status + Public Visibility — 2-col grid. Status select: Draft, Open, Paused, Closed, Filled. Public Visibility select: Visible, Hidden (boolean mapped to "true"/"false").

**Footer (sticky bottom, bg white):**
- Border top: `1px solid rgba(184,149,106,0.15)`, padding `px-6 py-4`, `flex items-center gap-3`
- **"Preview"** button — `Eye` icon (`w-4 h-4`). Border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`, transparent bg, `px-4 py-2.5 rounded-lg text-sm font-semibold`. Opens the public URL in a new tab.
- **"Cancel"** button — `flex-1 py-2.5 rounded-lg text-sm font-semibold`. Border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`, transparent bg. Closes modal.
- **"Save Changes"** button — `flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold`. bg `#B8956A`, color `#FFFBF5`. Disabled when no title or saving. Saving: `Loader2` (`w-4 h-4 animate-spin`) + "Saving...". Default: `Save` icon (`w-4 h-4`) + "Save Changes". Action: Calls `createJobPage` with `action: "update"`, passing `job_opening_id` and all fields. On success, calls `onSaved` callback.

**Props:** `{ jobOpening, previewUrl, onClose, onSaved }`. The `previewUrl` determines what the Preview button opens. The `onSaved` callback receives the updated job opening object.

---

### Change 4: Careers Hub Settings Modal

**Trigger:** "Careers Hub" button in the top bar.

**Overlay:** Same blur overlay. `max-w-2xl w-full max-h-[90vh] overflow-y-auto`.

**Modal:** Same white modal style.

**Loading state:** While loading settings, show just a `Loader2` spinner (`w-8 h-8 animate-spin`, color `#B8956A`) centered in the modal box.

**Header (sticky top, bg white, z-10):**
- `Globe` icon in gold container (same style as other modals)
- Title: "Careers Hub Settings" (text-lg, font-bold, SERIF, color `#1A1A1A`)
- Close: `X` icon, same style
- Border bottom: `1px solid rgba(184,149,106,0.15)`, padding `px-6 py-4`

**Body (`px-6 py-5 space-y-5`):**

1. **Enable toggle** — Card container (`flex items-center justify-between p-3 rounded-lg`, bg `rgba(184,149,106,0.04)`, border `1px solid rgba(184,149,106,0.15)`):
   - Left: "Enable Public Careers Page" (font-semibold, text-sm, color `#1A1A1A`) + "When enabled, your careers hub is live and accessible to the public." (text-xs, muted, mt-0.5)
   - Right: Toggle switch (`relative w-11 h-6 rounded-full transition-colors`, bg `#B8956A` when on, `rgba(26,26,26,0.2)` when off). Knob: `absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform`, translateX 22px when on, 2px when off.

2. **Careers Page URL Slug** — Input, placeholder "e.g. arriv-estate-media". When enabled + slug present: "Preview live page" link below (`ExternalLink` icon `w-3 h-3` + text, color `#B8956A`, text-xs, hover underline). URL format: `{origin}/careers/company/{slug}`.

3. **Company Description** — Textarea (3 rows). Placeholder: "Tell candidates about your company..."

4. **Hero Image URL** — Input. Placeholder: "https://..."

5. **Workplace Culture** — Textarea (3 rows). Placeholder: "Describe what it's like to work at your company..."

6. **Benefits & Perks** — Input + "Add" button side by side (`flex gap-2`). Add button: `Plus` icon (`w-4 h-4`), bg `rgba(184,149,106,0.12)`, color `#A68559`, border `1px solid rgba(184,149,106,0.2)`, `px-3 rounded-lg text-sm font-medium whitespace-nowrap`. Enter key adds. Below: chips (`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm`, bg `rgba(184,149,106,0.08)`, color `#1A1A1A`) with `Trash2` icon (`w-3 h-3`, muted) to remove.

7. **Office Locations** — Same pattern as Benefits. Placeholder: "e.g. Austin, TX".

8. **Social Links** — 2-col grid (`grid grid-cols-2 gap-3`) of labeled inputs:
   - LinkedIn (placeholder "https://linkedin.com/...")
   - Facebook (placeholder "https://facebook.com/...")
   - X (Twitter) (placeholder "https://x.com/...")
   - Instagram (placeholder "https://instagram.com/...")
   - Company Website (placeholder "https://...")
   - Contact Email (placeholder "careers@yourcompany.com")
   - Each label: 12px, font-weight 600, color `rgba(26,26,26,0.7)`, mb 4px.

**Footer (sticky bottom, bg white):**
- Border top: `1px solid rgba(184,149,106,0.15)`, padding `px-6 py-4`, `flex items-center justify-end gap-3`
- **"Cancel"** — `px-5 py-2.5 rounded-lg text-sm font-semibold`, border `1px solid rgba(184,149,106,0.3)`, color `#1A1A1A`. Closes modal.
- **"Save Settings"** — `flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold`, bg `#B8956A`, color `#FFFBF5`. Disabled when saving. States: `Loader2` + "Saving..." / `Check` + "Saved!" (2s reset) / "Save Settings". Action: Calls `manageCareersHubSettings` backend function with `action: "save"` and the settings object.

**Data loading:** On mount, calls `manageCareersHubSettings` with `action: "get"` to load existing settings. Default settings object includes: `career_page_enabled: false`, `career_company_slug: ""`, `career_company_description: ""`, `career_hero_image: ""`, `career_culture_text: ""`, `career_benefits: []`, `career_locations: []`, `career_social_links: { linkedin, facebook, x, instagram, website }`, `career_contact_email: ""`, `company_name: "Arriv Estate Media"`, `logo_url: ""`, `primary_color: "#B8956A"`.

---

### Change 5: Job Card Action Buttons

**Location:** Jobs view, on each job card. The bottom row of each card has action buttons.

#### HireJob cards (existing jobs)

Each job card has a button row at the bottom (`flex items-center gap-2 mt-auto pt-3`, borderTop `1px solid rgba(184,149,106,0.12)`):

**"View Listing" button** (only if a listing URL exists):
- Style: `backgroundColor: "rgba(184,149,106,0.15)"`, `color: "#B8956A"`, `border: "1px solid rgba(184,149,106,0.3)"`, `text-xs px-2.5 py-1.5 rounded-lg font-medium`
- Action: Opens the listing URL in a new tab (`window.open(listingUrl, "_blank")`)
- `e.stopPropagation()` to prevent triggering the card click

**"Edit Page" button:**
- Same style as View Listing
- Shows `Loader2` spinner (`w-3 h-3 animate-spin`) when `linkingJob?.id === job.id`
- Action: Calls `handleEditPage(job)` — see Change 6 for the logic

**"Duplicate" button:**
- Same style, with `Copy` icon (`w-3 h-3`)
- Shows `Loader2` spinner when `duplicating?.id === job.id`
- Action: Calls `handleDuplicateJob(job)` — see Change 6

#### JobOpening cards (pages without a matching HireJob)

Same dark card style. Button row has "Edit Page" and "Duplicate" (no "View Listing" — clicking the card itself opens the public page).

**"Edit Page"** — Sets `editingPreviewUrl` to the JobOpening's source_url path or `/careers/{public_slug or job_id}`, then opens the EditJobPageModal.

**"Duplicate"** — Calls `handleDuplicateJobOpening(job)` — see Change 6.

---

### Change 6: Duplicate Job Functionality

#### handleDuplicateJob (HireJob + linked JobOpening)

**Confirmation dialog:** `window.confirm("This will create a copy of \"{title}\" including its job details and linked job page. The copy will be saved as a draft with \"(Copy)\" added to the title. Continue?")`

**Steps:**
1. Create a new HireJob with:
   - `title: "{original title} (Copy)"`
   - All fields copied: department, description, responsibilities, required_qualifications, preferred_qualifications, skills, experience_requirements, performance_expectations, compensation, work_schedule, source_type, source_url, source_application_position, role_success_profile, scorecard_template, round1_scorecard
   - `role_profile_approved: false`
   - `status: "draft"`
   - `created_by_name`: from localStorage
2. If a linked JobOpening exists (matched by title), duplicate it by calling `createJobPage` with `action: "create"` and:
   - `title: "{original title} (Copy)"`
   - All fields from the linked opening: department, description (from `description_text`), responsibilities, required_qualifications, preferred_qualifications, skills, experience_requirements, compensation, work_schedule, employment_type, work_arrangement, location, benefits, page_description, design_description
   - `source_type: "text"`, `source_url: ""` (cleared so the copy gets its own slug)
3. Add the new job to the jobs list and reload.

#### handleDuplicateJobOpening (standalone JobOpening)

**Confirmation dialog:** `window.confirm("This will create a copy of the \"{title}\" job page with all its content. The copy will have \"(Copy)\" added to the title. Continue?")`

**Steps:**
1. Call `createJobPage` with `action: "create"` and:
   - `title: "{original title} (Copy)"`
   - All fields from the original opening (same as above)
   - `source_type: "text"`, `source_url: ""`
2. Add the new opening to the list.

#### handleEditPage (link HireJob to JobOpening)

**Logic:**
1. Compute the legacy special page path for the job:
   - If `source_url` exists, use its pathname
   - Else if `source_application_position === "sales_growth_advisor"`: `/SalesGrowthAdvisor`
   - Else if title or location contains "atlanta": `/MediaSpecialistAtl`
   - Else if `source_application_position === "media_specialist"`: `/MediaSpecialist`
   - Else: null
2. Find a matching JobOpening:
   - If legacy path exists: match by `source_url` pathname
   - Else: match by title
3. If a match is found:
   - Backfill `source_url` if the match is missing it (call `createJobPage` with `action: "update"` to set `source_url` to the legacy path)
   - Set `editingPreviewUrl` to the legacy path or `/careers/{public_slug or job_id}`
   - Open the EditJobPageModal with the matched JobOpening
4. If no match:
   - Create a new JobOpening from the HireJob data, pre-populated with default content for special pages (Sales Growth Advisor, Media Specialist, Media Specialist Atlanta) if applicable
   - Call `createJobPage` with `action: "create"` and all fields
   - On success, open the EditJobPageModal with the new JobOpening

---

### Backend Functions Used

All three modals call the same `createJobPage` backend function with different `action` values:

| Action | Used by | Purpose |
|---|---|---|
| `"analyze"` | JobPageBuilder step 1 | AI-analyze a job description source (text/URL/file) and return extracted fields |
| `"create"` | JobPageBuilder step 2, handleEditPage, handleDuplicateJob, handleDuplicateJobOpening | Create a new JobOpening record |
| `"update"` | EditJobPageModal, handleEditPage backfill | Update an existing JobOpening by `job_opening_id` |

The `manageCareersHubSettings` backend function handles the careers hub settings:
| Action | Purpose |
|---|---|
| `"get"` | Load existing CareersHubSetting record |
| `"save"` | Save the settings object |

---

### Summary Checklist

- [ ] Two new top bar buttons: "Create Job Page" (dark bg) and "Careers Hub" (white bg), placed left of "Request New Hire"
- [ ] Create Job Page modal: 3-step wizard (describe + source → review extracted fields → success with copyable URL)
- [ ] Edit Job Page modal: page_description, design_description, all job fields, status/visibility, sticky header + footer with Preview/Cancel/Save
- [ ] Careers Hub Settings modal: enable toggle, URL slug, company description, hero image, culture, benefits chips, location chips, social links grid
- [ ] Job card buttons: "View Listing" (if URL exists), "Edit Page", "Duplicate" — all gold-tinted, text-xs, rounded-lg
- [ ] Duplicate: confirmation dialog, "(Copy)" suffix, status "draft", linked JobOpening also duplicated
- [ ] Edit Page: links HireJob to JobOpening via source_url, backfills missing source_url, opens EditJobPageModal
- [ ] All modals: white bg, blur overlay, gold accents, SERIF headings, shared input/label styles