# AI Intelligence Ecosystem Audit

**Audit Date:** 2026-09-03
**Scope:** Arriv Estate Media, Khetha IQ, Arriv One
**Objective:** Verify clear ownership, no cross-domain data leakage, no duplication, no conflicting recommendations.

---

## 1. AI System Registry

### Khetha IQ AI (Owner: Khetha IQ by Arriv)

| # | AI System | Implementation | Model | Data Source | Decisions It Makes | Requires Human Approval |
|---|---|---|---|---|---|---|
| K1 | **Candidate Matching** | `hireiqAutoEvaluation.ts` → `autoEvaluateCandidate()` | Default (automatic) | HireCandidate.resume_text, HireJob (description, role_success_profile) | Generates resume_match, skills_match, experience_match, competency_match scores (0-100) | Scores are advisory only. Human recruiter reviews and decides. |
| K2 | **Recruiting Strategy** | `manageRecruiting` + `recruitingSearchProvider.ts` → `runTalentResearch()` | `gemini_3_flash` (web search) | Public web profiles (LinkedIn, company sites, directories), HireJob (title, skills, qualifications), RecruitingSettings | Finds real prospects, generates search queries, filters by seniority/location | AI generates prospect list. Human approves/dismisses each prospect. Outreach message is drafted, not sent. |
| K3 | **Hiring Prediction** | `hireiqAutoEvaluation.ts` → `autoEvaluateCandidate()` (evaluation step) | Default (automatic) | Resume analysis output, job description, role profile | Generates estimated_success_score (0-100), proceed_recommendation ("Advance" / "Borderline - Manager Review" / "Do Not Advance") | **Explicitly advisory.** Prompt states: "designed to SUPPORT human decision-making, not replace it." Final hiring decision always human. |
| K4 | **Interview Intelligence** | `parseRecordingToScorecard` + `tavusInterview.ts` → `parseTranscriptToScorecard()` / `parsePlainTextToScorecard()` | Default (automatic) | Tavus conversation transcripts (AI interviews), Whisper transcriptions (human interviews), Conference records, HireCandidate | Parses transcript into Round 1 scorecard with per-question scores, total_score, confidence rating | If `review_required=true` (transcript too short/incomplete), scorecard is NOT auto-saved — flagged for human review. Admin must trigger parsing. |
| K5 | **Hiring Learning (Ask Khetha)** | `manageAskKhetha` | Default (automatic) | Conversation history (AskKhethaConversation), user message | Generates conversational responses about recruiting strategy, job posting, candidate evaluation | Purely advisory chat. Suggests actions as text; user executes manually. No autonomous actions. |

### Arriv One AI (Owner: Arriv One CRM/Operations)

| # | AI System | Implementation | Model | Data Source | Decisions It Makes | Requires Human Approval |
|---|---|---|---|---|---|---|
| A1 | **Customer Intelligence** | `regenerateCallMap` | `gemini_3_flash` (web search + vision) | HubSpot contact data, ActivityLog history, SmsMessage history, SalesRepStyleProfile (learned preferences), web research on contact/company, attached images | Generates comprehensive call map (opening, objection handlers, voicemail, follow-up text) tailored to specific contact | Call map is a prep tool. Rep executes the call manually. No autonomous dialing. |
| A2 | **Sales Recommendations** | `scheduleFollowUpFromActivity` | Default (automatic) | ActivityLog (contact history, notes), activity type | Determines follow-up date (7-180 days out), urgency level (high/medium/low/skip), generates call map for follow-up | Auto-creates follow-up task in ActivityLog. Rep sees and executes. If urgency="skip", no task created. |
| A3 | **Employee Performance Insights** | `performanceEngine.ts` → `computeRepMetrics()`, `computeTenantRollup()`, `computePipeline()`, `computeLifetimeStats()` | Deterministic (no LLM) | ActivityLog, Deal, Commission, Contact, SmsConversation, SmsMessage (all tenant-scoped) | Computes calls, emails, meetings, revenue, close rate, pipeline funnel, call streaks, market revenue | Pure metrics computation. No decisions. Dashboards display data for human review. |
| A4 | **Workforce Intelligence (Style Learning)** | `analyzeCallMapEdit` | `gpt_5_mini` | Original vs. edited call map (rep's manual edits) | Extracts style/tone/structure preferences from edits, appends to SalesRepStyleProfile | Learns passively from rep edits. No autonomous action. Learned preferences feed into A1 (regenerateCallMap). |

### Estate Media AI (Owner: Arriv Estate Media Vertical)

| # | AI System | Implementation | Model | Data Source | Decisions It Makes | Requires Human Approval |
|---|---|---|---|---|---|---|
| E1 | **Property Closing Detection** | `checkPropertyClosings` | Default (automatic, web search) | Job (pay-at-closing jobs), Booking, ClosingDetection records, public real estate sites (Zillow, Realtor.com, MLS) | Determines if property has sold (has_sold, closing_date, final_sale_price, confidence) | AI detects closings. Does NOT auto-generate invoices. Sends notification (email + SMS) to admin. Admin generates final invoice manually. |
| E2 | **Realtor Listing Discovery** | `findRealtorListings` | `gemini_3_flash` (web search) | Public real estate listing sites, realtor name, brokerage, location | Finds active listings for a specific realtor (address, status, price) | Results displayed to rep. Rep decides whether to pursue. No autonomous outreach. |
| E3 | **Realtor Prospecting Discovery** | `findProspectingRealtors` | `gemini_3_flash` (web search) | Public real estate platforms, social media, brokerage websites, location | Finds realtors matching prospecting criteria (name, brokerage, listing stage) | Results displayed to rep. Rep converts to Contact manually. |
| E4 | **Culture Banner Generation** | `getDailyCultureBanner` | Default (automatic) | AppSetting (source preference: bible/quran/torah/buddhist/hindu/secular), CultureBanner records | Generates daily motivational message + verse reference + verse text | Auto-generates and saves banner. Admin can switch to manual mode. AI banners auto-expire after 7 days. |

---

## 2. Cross-Domain Data Access Verification

### ✅ No AI model accesses another domain's private data incorrectly

| AI System | Khetha IQ Data | Arriv One CRM Data | Estate Media Vertical Data |
|---|---|---|---|
| **K1 Candidate Matching** | ✅ Reads: HireCandidate, HireJob | ❌ No access | ❌ No access |
| **K2 Recruiting Strategy** | ✅ Reads: RecruitingProspect, RecruitingSearch, TalentPipeline, HireJob, HireCandidate | ❌ No access | ❌ No access |
| **K3 Hiring Prediction** | ✅ Reads: HireCandidate, HireJob | ❌ No access | ❌ No access |
| **K4 Interview Intelligence** | ✅ Reads: Conference, TavusInterviewTranscript, HireCandidate | ❌ No access | ❌ No access |
| **K5 Ask Khetha** | ✅ Reads: AskKhethaConversation | ❌ No access | ❌ No access |
| **A1 Customer Intelligence** | ❌ No access | ✅ Reads: ActivityLog, SmsMessage, HubSpot Contact, SalesRepStyleProfile | ❌ No access |
| **A2 Sales Recommendations** | ❌ No access | ✅ Reads: ActivityLog | ❌ No access |
| **A3 Performance Insights** | ❌ No access | ✅ Reads: ActivityLog, Deal, Commission, Contact, SmsConversation, SmsMessage | ❌ No access |
| **A4 Style Learning** | ❌ No access | ✅ Reads/Writes: SalesRepStyleProfile | ❌ No access |
| **E1 Closing Detection** | ❌ No access | ❌ No access | ✅ Reads: Job, Booking, ClosingDetection |
| **E2 Listing Discovery** | ❌ No access | ❌ No access (reads SalesTeamMember for auth only) | ✅ Reads: public web data |
| **E3 Realtor Discovery** | ❌ No access | ❌ No access (reads SalesTeamMember for auth only) | ✅ Reads: public web data |
| **E4 Culture Banner** | ❌ No access | ❌ No access | ✅ Reads: AppSetting, CultureBanner |

**Result:** All AI systems stay within their domain boundaries. No cross-domain private data access detected.

---

## 3. Duplication Check

### ✅ No AI system duplicates another

| Potential Overlap | System A | System B | Verdict |
|---|---|---|---|
| Call map generation | A1 `regenerateCallMap` (on-demand, just-in-time) | A2 `scheduleFollowUpFromActivity` (automatic, post-activity) | **Not duplicated.** Different triggers: A1 = rep requests prep before a call; A2 = system auto-schedules after logging activity. Both can generate call maps, but serve different workflow stages. A1 is richer (web research, HubSpot, images, style profiles); A2 is lighter (history-based). |
| Candidate scoring | K1 `autoEvaluateCandidate` (resume-based, pre-interview) | K4 `parseRecordingToScorecard` (transcript-based, post-interview) | **Not duplicated.** Different pipeline stages: K1 scores resumes before interviews; K4 scores interview transcripts after interviews. Different data inputs, different scorecard types. |
| Prospect discovery | K2 `runTalentResearch` (recruiting prospects for hiring) | E2/E3 `findRealtorListings`/`findProspectingRealtors` (sales prospects for CRM) | **Not duplicated.** Different goals: K2 finds candidates for hiring; E2/E3 find realtors for sales. Different target personas, different entity outputs (RecruitingProspect vs. FieldProspect/Contact). |
| Style learning | A4 `analyzeCallMapEdit` (learns from rep edits) | A1 `regenerateCallMap` (applies learned styles) | **Not duplicated.** A4 is the learner; A1 is the consumer. A4 writes to SalesRepStyleProfile; A1 reads from it. Complementary, not overlapping. |

---

## 4. Conflicting Recommendations Check

### ✅ No AI system creates conflicting recommendations

| Potential Conflict | Systems | Verdict |
|---|---|---|
| Two call maps for same contact | A1 (on-demand) vs A2 (auto-scheduled) | **No conflict.** A2 creates a task with a call map. If rep regenerates via A1 before the call, the new map is richer and replaces the task's map. Sequential, not parallel. |
| Hire decision conflicts | K3 (proceed_recommendation from resume) vs K4 (scorecard from interview) | **No conflict.** K3 runs pre-interview ("Advance to interview?"). K4 runs post-interview ("How did they do?"). Different stages, different questions. Human makes final call at each stage. |
| Follow-up scheduling conflicts | A2 (auto-schedules follow-up) vs manual rep scheduling | **No conflict.** A2 retires existing AI-scheduled tasks before creating a new one. If rep manually schedules, they can override. A2 skips tasks tagged `[AI Scheduled]` or `[Queue Call]`. |

---

## 5. Human Approval Requirements Summary

| AI System | Autonomous Actions | Human Approval Required For |
|---|---|---|
| K1 Candidate Matching | None (generates scores only) | Reviewing scores, deciding to interview |
| K2 Recruiting Strategy | None (generates prospect list) | Approving prospects, editing outreach, sending outreach |
| K3 Hiring Prediction | None (generates recommendation) | Final hire/no-hire decision |
| K4 Interview Intelligence | Auto-saves scorecard IF `review_required=false` | Reviewing scorecards, especially when `review_required=true` |
| K5 Ask Khetha | None (conversational only) | Executing any suggested actions |
| A1 Customer Intelligence | None (generates call map) | Making the actual call |
| A2 Sales Recommendations | **Auto-creates follow-up task** in ActivityLog | Completing the follow-up task (rep decides) |
| A3 Performance Insights | None (deterministic metrics) | Interpreting metrics, coaching decisions |
| A4 Style Learning | **Auto-writes** to SalesRepStyleProfile | None (passive learning from rep's own edits) |
| E1 Closing Detection | **Auto-creates** ClosingDetection record, sends email + SMS notifications | Generating final invoice (admin manual) |
| E2 Listing Discovery | None (returns results) | Pursuing listings (rep decides) |
| E3 Realtor Discovery | None (returns results) | Converting to Contact (rep decides) |
| E4 Culture Banner | **Auto-generates and saves** daily banner | Switching to manual mode, editing banners |

---

## 6. Findings & Recommendations

### ✅ Clear Ownership
Every AI system has a clear owner domain. No AI system spans multiple domains. The `ecosystemBoundaries.ts` enforcement layer prevents cross-domain entity access at the sync layer, and each AI function only queries entities within its own domain.

### ✅ No Cross-Domain Data Leakage
All AI systems use `base44.asServiceRole` for database access (bypassing RLS for automation), but each function only queries entities appropriate to its domain. No Khetha IQ AI function reads CRM data; no Arriv One AI function reads hiring data; no Estate Media AI function reads recruiting or CRM data.

### ✅ No Duplication
Overlapping capabilities (call map generation, candidate scoring, prospect discovery) serve different workflow stages or target different personas. Each has a distinct trigger, data source, and output entity.

### ✅ No Conflicting Recommendations
Where two AI systems touch the same workflow (e.g., A1 and A2 both generate call maps), they operate sequentially with explicit retirement logic. Where two systems score the same candidate (K3 and K4), they operate at different pipeline stages with human decision points between them.

### ⚠️ Minor Observation: A2 Autonomous Task Creation
`scheduleFollowUpFromActivity` (A2) is the only AI system that autonomously creates records (follow-up tasks in ActivityLog) without explicit human action. This is by design (automated follow-up scheduling), but reps should be aware that AI-scheduled tasks appear in their queue with `[AI Scheduled]` prefix. This is transparent and overridable.

### ⚠️ Minor Observation: E1 Autonomous Notifications
`checkPropertyClosings` (E1) autonomously sends email + SMS notifications to the admin when a closing is detected. This is by design (timely closing detection), but the AI does NOT autonomously generate invoices — that remains a manual admin action.