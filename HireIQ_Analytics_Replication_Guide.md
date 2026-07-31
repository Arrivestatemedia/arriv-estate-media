# HireIQ Analytics — Exact Replication Guide

This guide documents every file created/modified to add the **Analytics** tab to HireIQ. Follow these steps in order to replicate it exactly in another app.

---

## PREREQUISITES

### Entities Required

Your app must already have these entities (they already exist in the source app):

1. **HireJob** — fields used: `id`, `title`, `status` (draft/open/closed/filled), `created_date`, `round1_scorecard`
2. **HireCandidate** — fields used: `id`, `job_id`, `name`, `status` (applied/screening/interviewing/advanced/hold/offer/declined/hired), `decision` (pending/advance/hold/another_interview/offer/decline), `source` (enum: company_career_page, linkedin, indeed, employee_referral, recruiter, other), `resume_analysis`, `evaluation` (object with `estimated_success_score`, `confidence_level`), `round1_scorecard`, `round2_scorecard`, `created_date`, `updated_date`
3. **HireInterview** — fields used: `id`, `candidate_id`, `job_id`, `questions` (array of objects with `question`, `rating`, `competency`/`competencies`)
4. **HirePerformance** — fields used: `id`, `candidate_id`, `job_id`, `performance_rating` (1-5), `retention_months`, `hire_date`
5. **AppSetting** — fields used: `key`, `value` (for the `hireiq_learning_enabled` toggle)

### Packages Required (already installed)

- `recharts` — for charts (BarChart, PieChart)
- `jspdf` — for PDF export
- `lucide-react` — for icons

### Existing Code Dependencies

- `@/api/base44Client` — the pre-initialized Base44 SDK
- `@/lib/hireiq` — must export `generateLearningInsights(performances, hiredCandidates, jobs)` (already exists in the Learning system)

---

## STEP 1: Create the Analytics Engine

**File:** `src/lib/analyticsEngine.js`

This is the core computation module. It loads all hiring data and computes every metric. Copy it **exactly** — do not modify the formulas.

**Full contents:**

```javascript
import { base44 } from "@/api/base44Client";

export const SOURCE_LABELS = {
  company_career_page: "Company Career Page",
  linkedin: "LinkedIn",
  indeed: "Indeed",
  employee_referral: "Employee Referral",
  recruiter: "Recruiter",
  other: "Other",
};

export const SOURCE_VALUES = Object.keys(SOURCE_LABELS);

const daysBetween = (a, b) => {
  if (!a || !b) return null;
  const d = Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
  return d >= 0 ? d : null;
};

export async function loadAnalyticsData() {
  const [jobsRes, candidatesRes, interviewsRes, performancesRes] = await Promise.all([
    base44.entities.HireJob.list("-created_date", 200).catch(() => null),
    base44.entities.HireCandidate.list("-created_date", 500).catch(() => null),
    base44.entities.HireInterview.list("-created_date", 500).catch(() => null),
    base44.entities.HirePerformance.list("-created_date", 200).catch(() => null),
  ]);
  const arr = (r) => Array.isArray(r?.data ?? r) ? (r?.data ?? r) : [];
  return {
    jobs: arr(jobsRes),
    candidates: arr(candidatesRes),
    interviews: arr(interviewsRes),
    performances: arr(performancesRes),
  };
}

export function computeOverview(data) {
  const { jobs, candidates, interviews } = data;
  const openJobs = jobs.filter(j => j.status === "open").length;
  const totalCandidates = candidates.length;
  const inInterview = candidates.filter(c => c.status === "interviewing").length;
  const offersExtended = candidates.filter(c => c.decision === "offer" || c.status === "offer" || c.status === "hired").length;
  const hires = candidates.filter(c => c.status === "hired").length;
  const offerAcceptanceRate = offersExtended > 0 ? Math.round((hires / offersExtended) * 100) : 0;

  const filledJobs = jobs.filter(j => j.status === "filled");
  const ttfDays = filledJobs.map(j => {
    const hired = candidates.find(c => c.job_id === j.id && c.status === "hired");
    return hired ? daysBetween(j.created_date, hired.created_date) : null;
  }).filter(d => d != null);
  const timeToFill = ttfDays.length > 0 ? Math.round(ttfDays.reduce((a, b) => a + b, 0) / ttfDays.length) : 0;

  const candsWithInterview = candidates.filter(c => interviews.some(i => i.candidate_id === c.id));
  const atiDays = candsWithInterview.map(c => {
    const first = interviews.find(i => i.candidate_id === c.id);
    return first ? daysBetween(c.created_date, first.created_date) : null;
  }).filter(d => d != null);
  const appToInterview = atiDays.length > 0 ? Math.round(atiDays.reduce((a, b) => a + b, 0) / atiDays.length) : 0;

  const candsWithOffer = candidates.filter(c => c.decision === "offer" || c.status === "hired");
  const itoDays = candsWithOffer.map(c => {
    const first = interviews.find(i => i.candidate_id === c.id);
    return first ? daysBetween(first.created_date, c.updated_date) : null;
  }).filter(d => d != null);
  const interviewToOffer = itoDays.length > 0 ? Math.round(itoDays.reduce((a, b) => a + b, 0) / itoDays.length) : 0;

  return { openJobs, totalCandidates, inInterview, offersExtended, hires, offerAcceptanceRate, timeToFill, appToInterview, interviewToOffer };
}

export function computeFunnel(data) {
  const { candidates } = data;
  const stages = [
    { name: "Applications Received", count: candidates.length, color: "#B8956A" },
    { name: "Resume Screening", count: candidates.filter(c => c.resume_analysis).length, color: "#C0A578" },
    { name: "Interview Round 1", count: candidates.filter(c => c.round1_scorecard).length, color: "#C9B08A" },
    { name: "Interview Round 2", count: candidates.filter(c => c.round2_scorecard).length, color: "#D2BC9C" },
    { name: "Offers Extended", count: candidates.filter(c => c.decision === "offer" || c.status === "hired").length, color: "#A68559" },
    { name: "Offers Accepted", count: candidates.filter(c => c.status === "hired").length, color: "#8E724B" },
    { name: "Hired", count: candidates.filter(c => c.status === "hired").length, color: "#755E3E" },
  ];
  stages.forEach((s, i) => {
    s.conversion = i === 0 ? 100 : (stages[i - 1].count > 0 ? Math.round((s.count / stages[i - 1].count) * 100) : 0);
    s.overallConversion = stages[0].count > 0 ? Math.round((s.count / stages[0].count) * 100) : 0;
  });
  return stages;
}

export function computePredictionAccuracy(data) {
  const { candidates, performances } = data;
  const hiredWithEval = candidates.filter(c => c.status === "hired" && c.evaluation?.estimated_success_score != null);
  if (hiredWithEval.length < 3) return null;

  const matched = hiredWithEval.map(c => {
    const perf = performances.find(p => p.candidate_id === c.id);
    if (!perf || perf.performance_rating == null) return null;
    const predicted = c.evaluation.estimated_success_score;
    const actual = (perf.performance_rating / 5) * 100;
    return { candidate: c, predicted, actual, deviation: Math.abs(predicted - actual), perf };
  }).filter(Boolean);

  if (matched.length < 3) return null;

  const avgPredicted = Math.round(matched.reduce((s, m) => s + m.predicted, 0) / matched.length);
  const avgActual = Math.round(matched.reduce((s, m) => s + m.actual, 0) / matched.length);
  const avgDeviation = Math.round(matched.reduce((s, m) => s + m.deviation, 0) / matched.length);
  const accuracy = Math.max(0, 100 - avgDeviation);
  const overestimated = matched.filter(m => m.predicted > m.actual + 10).length;
  const underestimated = matched.filter(m => m.actual > m.predicted + 10).length;
  const accurate = matched.filter(m => m.deviation <= 10).length;

  const confidenceLevels = ["Very High", "High", "Medium", "Low"];
  const calibration = confidenceLevels.map(level => {
    const group = matched.filter(m => (m.candidate.evaluation?.confidence_level || "").toLowerCase().includes(level.toLowerCase()));
    if (group.length === 0) return null;
    const ap = Math.round(group.reduce((s, m) => s + m.predicted, 0) / group.length);
    const aa = Math.round(group.reduce((s, m) => s + m.actual, 0) / group.length);
    const ad = Math.round(group.reduce((s, m) => s + m.deviation, 0) / group.length);
    return { level, count: group.length, avgPredicted: ap, avgActual: aa, accuracy: Math.max(0, 100 - ad) };
  }).filter(Boolean);

  return { avgPredicted, avgActual, accuracy, overestimated, underestimated, accurate, total: matched.length, calibration };
}

export function computeQuestionEffectiveness(data) {
  const { candidates, interviews, performances } = data;
  const hiredWithPerf = candidates.filter(c => c.status === "hired" && performances.some(p => p.candidate_id === c.id));
  if (hiredWithPerf.length < 3) return null;

  const qData = {};
  const cData = {};

  const collect = (q, isHigh, isLow) => {
    if (!q.question || (q.rating || 0) <= 0) return;
    const key = q.question;
    if (!qData[key]) qData[key] = { question: key, ratings: [], high: [], low: [], competencies: q.competencies || [q.competency].filter(Boolean) };
    qData[key].ratings.push(q.rating);
    if (isHigh) qData[key].high.push(q.rating);
    if (isLow) qData[key].low.push(q.rating);
    (q.competencies || [q.competency].filter(Boolean)).forEach(comp => {
      if (!comp) return;
      if (!cData[comp]) cData[comp] = { competency: comp, ratings: [], high: [], low: [] };
      cData[comp].ratings.push(q.rating);
      if (isHigh) cData[comp].high.push(q.rating);
      if (isLow) cData[comp].low.push(q.rating);
    });
  };

  hiredWithPerf.forEach(c => {
    const perf = performances.find(p => p.candidate_id === c.id);
    if (!perf) return;
    const isHigh = perf.performance_rating >= 4;
    const isLow = perf.performance_rating <= 2;
    [c.round1_scorecard, c.round2_scorecard].forEach(sc => {
      sc?.sections?.forEach(s => s.questions?.forEach(q => collect(q, isHigh, isLow)));
    });
    interviews.filter(i => i.candidate_id === c.id).forEach(i => (i.questions || []).forEach(q => collect(q, isHigh, isLow)));
  });

  const score = (d) => {
    const avgHigh = d.high.length > 0 ? d.high.reduce((a, b) => a + b, 0) / d.high.length : 0;
    const avgLow = d.low.length > 0 ? d.low.reduce((a, b) => a + b, 0) / d.low.length : 0;
    return { avgRating: d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length, avgHigh, avgLow, effectivenessScore: avgHigh - avgLow, count: d.ratings.length };
  };

  const questions = Object.values(qData).filter(q => q.ratings.length >= 2).map(q => ({ ...q, ...score(q) }));
  const competencies = Object.values(cData).filter(c => c.ratings.length >= 2).map(c => ({ ...c, ...score(c) }));

  return {
    bestQuestions: [...questions].sort((a, b) => b.effectivenessScore - a.effectivenessScore).slice(0, 5),
    worstQuestions: [...questions].sort((a, b) => a.effectivenessScore - b.effectivenessScore).slice(0, 5),
    bestCompetencies: [...competencies].sort((a, b) => b.effectivenessScore - a.effectivenessScore).slice(0, 5),
    worstCompetencies: [...competencies].sort((a, b) => a.effectivenessScore - b.effectivenessScore).slice(0, 5),
    totalQuestions: questions.length,
    totalCompetencies: competencies.length,
  };
}

export function computeSourceEffectiveness(data) {
  const { candidates, performances } = data;
  return SOURCE_VALUES.map(s => {
    const sc = candidates.filter(c => (c.source || "company_career_page") === s);
    const interviews = sc.filter(c => c.status === "interviewing" || c.round1_scorecard || c.round2_scorecard).length;
    const offers = sc.filter(c => c.decision === "offer" || c.status === "hired").length;
    const hires = sc.filter(c => c.status === "hired").length;
    const hiredWithPerf = sc.filter(c => c.status === "hired" && performances.some(p => p.candidate_id === c.id));
    const avgPerf = hiredWithPerf.length > 0 ? (hiredWithPerf.map(c => performances.find(p => p.candidate_id === c.id)?.performance_rating || 0).reduce((a, b) => a + b, 0) / hiredWithPerf.length).toFixed(1) : "—";
    const withEval = sc.filter(c => c.evaluation?.estimated_success_score != null);
    const avgAIScore = withEval.length > 0 ? Math.round(withEval.map(c => c.evaluation.estimated_success_score).reduce((a, b) => a + b, 0) / withEval.length) : "—";
    return { source: s, label: SOURCE_LABELS[s], applications: sc.length, interviews, offers, hires, avgPerf, avgAIScore };
  }).filter(s => s.applications > 0);
}

export function computeRetention(data) {
  const { candidates, performances } = data;
  const hiredWithPerf = candidates.filter(c => c.status === "hired" && performances.some(p => p.candidate_id === c.id));
  if (hiredWithPerf.length < 3) return null;
  const records = hiredWithPerf.map(c => performances.find(p => p.candidate_id === c.id)).filter(p => p && p.retention_months != null);
  if (records.length < 3) return null;
  const total = records.length;
  return {
    retention30: Math.round((records.filter(p => p.retention_months >= 1).length / total) * 100),
    retention90: Math.round((records.filter(p => p.retention_months >= 3).length / total) * 100),
    retention6mo: Math.round((records.filter(p => p.retention_months >= 6).length / total) * 100),
    retention1yr: Math.round((records.filter(p => p.retention_months >= 12).length / total) * 100),
    avgRetention: (records.reduce((s, p) => s + p.retention_months, 0) / total).toFixed(1),
    total,
  };
}

export function buildAIContext(data) {
  const overview = computeOverview(data);
  const funnel = computeFunnel(data);
  const prediction = computePredictionAccuracy(data);
  const source = computeSourceEffectiveness(data);
  const retention = computeRetention(data);
  const question = computeQuestionEffectiveness(data);

  let c = "HIREIQ ANALYTICS DATA SUMMARY:\n\nOVERVIEW:\n";
  c += `- Open Jobs: ${overview.openJobs}\n- Total Candidates: ${overview.totalCandidates}\n- In Interview: ${overview.inInterview}\n`;
  c += `- Offers Extended: ${overview.offersExtended}\n- Hires: ${overview.hires}\n- Offer Acceptance Rate: ${overview.offerAcceptanceRate}%\n`;
  c += `- Avg Time to Fill: ${overview.timeToFill} days\n- Avg Application→Interview: ${overview.appToInterview} days\n- Avg Interview→Offer: ${overview.interviewToOffer} days\n\nFUNNEL:\n`;
  funnel.forEach(s => c += `- ${s.name}: ${s.count} (${s.conversion}% from previous)\n`);
  c += "\n";

  if (prediction) {
    c += `AI PREDICTION ACCURACY:\n- Avg Predicted: ${prediction.avgPredicted}/100\n- Avg Actual: ${prediction.avgActual}/100\n- Accuracy: ${prediction.accuracy}%\n`;
    c += `- Overestimated: ${prediction.overestimated}, Underestimated: ${prediction.underestimated}, Accurate: ${prediction.accurate}\n\n`;
  } else {
    c += "AI PREDICTION ACCURACY: Insufficient data (need 3+ hired candidates with both AI evaluation and performance records).\n\n";
  }

  if (source.length > 0) {
    c += "SOURCE EFFECTIVENESS:\n";
    source.forEach(s => c += `- ${s.label}: ${s.applications} apps, ${s.interviews} interviews, ${s.offers} offers, ${s.hires} hires, avg perf: ${s.avgPerf}, avg AI: ${s.avgAIScore}\n`);
    c += "\n";
  }

  if (retention) {
    c += `RETENTION:\n- 30-Day: ${retention.retention30}%, 90-Day: ${retention.retention90}%, 6-Month: ${retention.retention6mo}%, 1-Year: ${retention.retention1yr}%\n- Avg Retention: ${retention.avgRetention} months\n\n`;
  }

  if (question) {
    c += `QUESTION EFFECTIVENESS:\n- Best predicting questions: ${question.bestQuestions.map(q => q.question.substring(0, 50)).join("; ")}\n`;
    c += `- Worst predicting questions: ${question.worstQuestions.map(q => q.question.substring(0, 50)).join("; ")}\n`;
    c += `- Best predicting competencies: ${question.bestCompetencies.map(c => c.competency).join(", ")}\n\n`;
  }

  return c;
}

export function exportCSV(data) {
  const overview = computeOverview(data);
  const funnel = computeFunnel(data);
  const source = computeSourceEffectiveness(data);
  const retention = computeRetention(data);
  const prediction = computePredictionAccuracy(data);

  let csv = "Section,Metric,Value\n";
  csv += `Overview,Open Jobs,${overview.openJobs}\n`;
  csv += `Overview,Total Candidates,${overview.totalCandidates}\n`;
  csv += `Overview,Candidates in Interview,${overview.inInterview}\n`;
  csv += `Overview,Offers Extended,${overview.offersExtended}\n`;
  csv += `Overview,Hires,${overview.hires}\n`;
  csv += `Overview,Offer Acceptance Rate,${overview.offerAcceptanceRate}%\n`;
  csv += `Overview,Avg Time to Fill (days),${overview.timeToFill}\n`;
  csv += `Overview,Avg Application to Interview (days),${overview.appToInterview}\n`;
  csv += `Overview,Avg Interview to Offer (days),${overview.interviewToOffer}\n`;
  funnel.forEach(s => csv += `Funnel,${s.name},${s.count}\n`);
  if (prediction) {
    csv += `Prediction,Avg Predicted Score,${prediction.avgPredicted}\n`;
    csv += `Prediction,Avg Actual Score,${prediction.avgActual}\n`;
    csv += `Prediction,Accuracy,${prediction.accuracy}%\n`;
    csv += `Prediction,Overestimated,${prediction.overestimated}\n`;
    csv += `Prediction,Underestimated,${prediction.underestimated}\n`;
    csv += `Prediction,Accurate,${prediction.accurate}\n`;
  }
  source.forEach(s => csv += `Source,${s.label} Applications,${s.applications}\n`);
  source.forEach(s => csv += `Source,${s.label} Hires,${s.hires}\n`);
  if (retention) {
    csv += `Retention,30-Day,${retention.retention30}%\n`;
    csv += `Retention,90-Day,${retention.retention90}%\n`;
    csv += `Retention,6-Month,${retention.retention6mo}%\n`;
    csv += `Retention,1-Year,${retention.retention1yr}%\n`;
    csv += `Retention,Average (months),${retention.avgRetention}\n`;
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hireiq-analytics-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## STEP 2: Create Shared Styles

**File:** `src/components/hireiq/analytics/shared.jsx`

This defines the color palette, card style, and reusable UI primitives used by all section components.

**Full contents:**

```jsx
import React from "react";

export const CREAM = "#FFFBF5";
export const GOLD = "#B8956A";
export const GOLD_DARK = "#A68559";
export const TEXT_DARK = "#1A1A1A";
export const MUTED_DARK = "rgba(26,26,26,0.45)";
export const MUTED_LIGHT = "rgba(255,251,245,0.5)";
export const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };
export const MONO = { fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace" };

export const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

export const CHART_COLORS = ["#B8956A", "#A68559", "#C9B08A", "#8E724B", "#755E3E", "#D2BC9C", "#E8DCC6"];

export function SectionWrapper({ title, icon: Icon, children, action }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ ...SERIF, color: TEXT_DARK }}>
          {Icon && <Icon className="w-5 h-5" style={{ color: GOLD }} />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="p-4" style={card}>
      <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: MUTED_LIGHT }}>{label}</p>
      <p className="text-2xl font-bold" style={{ ...SERIF, ...MONO, color: accent || GOLD }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: MUTED_LIGHT }}>{sub}</p>}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="p-8 text-center" style={card}>
      <p className="text-sm" style={{ color: MUTED_LIGHT }}>{message}</p>
    </div>
  );
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.3)", borderRadius: "8px", padding: "8px 12px" }}>
      {label && <p className="text-xs font-bold mb-1" style={{ color: CREAM }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color || GOLD }}>
          {p.name}: {typeof p.value === "number" ? p.value : p.value}
        </p>
      ))}
    </div>
  );
}
```

---

## STEP 3: Create the 8 Section Components

Create each of these files under `src/components/hireiq/analytics/`. Each is a self-contained React component that receives a `data` prop (the object returned by `loadAnalyticsData()`).

### 3a. `OverviewSection.jsx`

Renders 9 KPI cards: Open Jobs, Total Candidates, In Interview, Offers Extended, Hires, Offer Acceptance Rate, Avg Time to Fill, Application→Interview days, Interview→Offer days.

```jsx
import React from "react";
import { BarChart3 } from "lucide-react";
import { SectionWrapper, KpiCard, card, CREAM, GOLD, MUTED_LIGHT, SERIF, MONO } from "./shared";
import { computeOverview } from "@/lib/analyticsEngine";

export default function OverviewSection({ data }) {
  const o = computeOverview(data);
  const kpis = [
    { label: "Open Jobs", value: o.openJobs },
    { label: "Total Candidates", value: o.totalCandidates },
    { label: "In Interview", value: o.inInterview },
    { label: "Offers Extended", value: o.offersExtended },
    { label: "Hires", value: o.hires },
    { label: "Offer Acceptance Rate", value: `${o.offerAcceptanceRate}%`, accent: o.offerAcceptanceRate >= 50 ? GOLD : "#FB923C" },
    { label: "Avg Time to Fill", value: `${o.timeToFill}d`, sub: "days from job posted to hire" },
    { label: "Application → Interview", value: `${o.appToInterview}d`, sub: "avg days" },
    { label: "Interview → Offer", value: `${o.interviewToOffer}d`, sub: "avg days" },
  ];

  return (
    <SectionWrapper title="Hiring Overview" icon={BarChart3}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <KpiCard key={i} label={kpi.label} value={kpi.value} sub={kpi.sub} accent={kpi.accent} />
        ))}
      </div>
    </SectionWrapper>
  );
}
```

### 3b. `FunnelSection.jsx`

Renders a visual funnel with 7 stages and conversion rates between each.

```jsx
import React from "react";
import { Filter } from "lucide-react";
import { SectionWrapper, CREAM, GOLD, MUTED_LIGHT, SERIF, MONO, card } from "./shared";
import { computeFunnel } from "@/lib/analyticsEngine";

export default function FunnelSection({ data }) {
  const stages = computeFunnel(data);
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <SectionWrapper title="Hiring Funnel" icon={Filter}>
      <div className="p-5" style={card}>
        <div className="space-y-1">
          {stages.map((s, i) => {
            const width = maxCount > 0 ? (s.count / maxCount) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: CREAM }}>{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold" style={{ ...MONO, color: GOLD }}>{s.count}</span>
                    {i > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: MUTED_LIGHT }}>
                        {s.conversion}% conv
                      </span>
                    )}
                    <span className="text-xs" style={{ color: MUTED_LIGHT }}>{s.overallConversion}%</span>
                  </div>
                </div>
                <div className="h-8 rounded-lg overflow-hidden" style={{ backgroundColor: "rgba(255,251,245,0.05)" }}>
                  <div className="h-full rounded-lg flex items-center justify-end pr-3 transition-all"
                    style={{ width: `${Math.max(width, 2)}%`, backgroundColor: s.color, minWidth: s.count > 0 ? "40px" : "0" }}>
                    {s.count > 0 && <span className="text-xs font-bold" style={{ color: "#1A1A1A" }}>{s.count}</span>}
                  </div>
                </div>
                {i < stages.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <span className="text-xs" style={{ color: GOLD }}>↓</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-3" style={{ color: MUTED_LIGHT }}>
          Conversion % shows rate from previous stage · Overall % shows rate from initial applications
        </p>
      </div>
    </SectionWrapper>
  );
}
```

### 3c. `PredictionSection.jsx`

Renders AI prediction accuracy with calibration by confidence level. Requires 3+ hired candidates with both AI evaluation scores and performance records.

```jsx
import React from "react";
import { Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { SectionWrapper, KpiCard, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, MONO, CHART_COLORS } from "./shared";
import { computePredictionAccuracy } from "@/lib/analyticsEngine";

export default function PredictionSection({ data }) {
  const p = computePredictionAccuracy(data);

  if (!p) {
    return (
      <SectionWrapper title="AI Prediction Accuracy" icon={Target}>
        <EmptyState message="Not enough data — need at least 3 hired candidates with both AI evaluations and performance records to measure prediction accuracy." />
      </SectionWrapper>
    );
  }

  const summaryKpis = [
    { label: "Avg Predicted Score", value: `${p.avgPredicted}/100` },
    { label: "Avg Actual Performance", value: `${p.avgActual}/100` },
    { label: "Prediction Accuracy", value: `${p.accuracy}%`, accent: p.accuracy >= 75 ? GOLD : "#FB923C" },
    { label: "Overestimated", value: p.overestimated, accent: "#FCA5A5" },
    { label: "Underestimated", value: p.underestimated, accent: "#FCD34D" },
    { label: "Accurate Predictions", value: p.accurate, accent: GOLD },
  ];

  const calData = p.calibration.map(c => ({ level: c.level, accuracy: c.accuracy, count: c.count }));

  return (
    <SectionWrapper title="AI Prediction Accuracy" icon={Target}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {summaryKpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>
      <div className="p-5" style={card}>
        <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Calibration by Confidence Level</h3>
        {calData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={calData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
              <XAxis dataKey="level" tick={{ fill: CREAM, fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fill: MUTED_LIGHT, fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
              <Bar dataKey="accuracy" name="Accuracy %" radius={[6, 6, 0, 0]}>
                {calData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-center py-6" style={{ color: MUTED_LIGHT }}>No confidence level data available</p>
        )}
        {p.calibration.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            {p.calibration.map((c, i) => (
              <div key={i} className="p-2 rounded text-center" style={{ backgroundColor: "rgba(255,251,245,0.05)" }}>
                <p className="text-xs" style={{ color: MUTED_LIGHT }}>{c.level}</p>
                <p className="text-sm font-bold" style={{ color: GOLD }}>{c.accuracy}%</p>
                <p className="text-xs" style={{ color: MUTED_LIGHT }}>n={c.count}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  );
}
```

### 3d. `QuestionSection.jsx`

Renders most/least predictive interview questions and competencies. Requires 3+ hired candidates with interviews and performance records.

```jsx
import React from "react";
import { HelpCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { SectionWrapper, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, MONO, CHART_COLORS } from "./shared";
import { computeQuestionEffectiveness } from "@/lib/analyticsEngine";

export default function QuestionSection({ data }) {
  const q = computeQuestionEffectiveness(data);

  if (!q) {
    return (
      <SectionWrapper title="Question Effectiveness" icon={HelpCircle}>
        <EmptyState message="Not enough data — need at least 3 hired candidates with completed interviews and performance records to analyze question effectiveness." />
      </SectionWrapper>
    );
  }

  const bestQData = q.bestQuestions.map(qq => ({ name: qq.question.length > 30 ? qq.question.substring(0, 30) + "…" : qq.question, score: Number(qq.effectivenessScore.toFixed(2)), full: qq.question }));
  const bestCData = q.bestCompetencies.map(cc => ({ name: cc.competency, score: Number(cc.effectivenessScore.toFixed(2)) }));

  return (
    <SectionWrapper title="Question Effectiveness" icon={HelpCircle}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: GOLD }}>Most Predictive Questions</h3>
          {bestQData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bestQData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
                <XAxis type="number" tick={{ fill: MUTED_LIGHT, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: CREAM, fontSize: 10 }} width={120} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
                <Bar dataKey="score" name="Effectiveness" radius={[0, 4, 4, 0]}>
                  {bestQData.map((_, i) => <Cell key={i} fill={CHART_COLORS[0]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-center py-6" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: GOLD }}>Most Predictive Competencies</h3>
          {bestCData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bestCData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
                <XAxis type="number" tick={{ fill: MUTED_LIGHT, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: CREAM, fontSize: 10 }} width={100} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
                <Bar dataKey="score" name="Effectiveness" radius={[0, 4, 4, 0]}>
                  {bestCData.map((_, i) => <Cell key={i} fill={CHART_COLORS[1]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-center py-6" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-2" style={{ ...SERIF, color: "#FCA5A5" }}>Least Predictive Questions</h3>
          {q.worstQuestions.length > 0 ? (
            <ul className="space-y-1.5">
              {q.worstQuestions.map((qq, i) => (
                <li key={i} className="text-xs flex justify-between items-start gap-2">
                  <span style={{ color: CREAM }}>{qq.question}</span>
                  <span className="font-bold flex-shrink-0" style={{ ...MONO, color: "#FCA5A5" }}>{qq.effectivenessScore.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
        <div className="p-5" style={card}>
          <h3 className="text-sm font-bold mb-2" style={{ ...SERIF, color: "#FCA5A5" }}>Least Predictive Competencies</h3>
          {q.worstCompetencies.length > 0 ? (
            <ul className="space-y-1.5">
              {q.worstCompetencies.map((cc, i) => (
                <li key={i} className="text-xs flex justify-between items-center">
                  <span style={{ color: CREAM }}>{cc.competency}</span>
                  <span className="font-bold" style={{ ...MONO, color: "#FCA5A5" }}>{cc.effectivenessScore.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm" style={{ color: MUTED_LIGHT }}>No data</p>}
        </div>
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED_LIGHT }}>
        Effectiveness score = avg rating among high performers minus avg rating among low performers. Higher = more predictive of success.
      </p>
    </SectionWrapper>
  );
}
```

### 3e. `SourceSection.jsx`

Renders a grouped bar chart and table showing applications, interviews, offers, and hires per sourcing channel.

```jsx
import React from "react";
import { Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { SectionWrapper, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, CHART_COLORS } from "./shared";
import { computeSourceEffectiveness } from "@/lib/analyticsEngine";

export default function SourceSection({ data }) {
  const sources = computeSourceEffectiveness(data);

  if (sources.length === 0) {
    return (
      <SectionWrapper title="Source Effectiveness" icon={Users}>
        <EmptyState message="No source data available yet. Add candidates with a source field to see where your hires come from." />
      </SectionWrapper>
    );
  }

  const chartData = sources.map(s => ({ name: s.label, Applications: s.applications, Interviews: s.interviews, Offers: s.offers, Hires: s.hires }));

  return (
    <SectionWrapper title="Source Effectiveness" icon={Users}>
      <div className="p-5 mb-4" style={card}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 30, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(184,149,106,0.1)" />
            <XAxis dataKey="name" tick={{ fill: CREAM, fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fill: MUTED_LIGHT, fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,149,106,0.05)" }} />
            <Legend wrapperStyle={{ fontSize: 12, color: CREAM }} />
            <Bar dataKey="Applications" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Interviews" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Offers" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Hires" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={card}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(184,149,106,0.15)" }}>
              {["Source", "Applications", "Interviews", "Offers", "Hires", "Avg Performance", "Avg AI Score"].map(h => (
                <th key={h} className="py-3 px-3 text-left text-xs font-semibold uppercase" style={{ color: MUTED_LIGHT }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((s, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(184,149,106,0.06)" }}>
                <td className="py-2.5 px-3 font-medium" style={{ color: CREAM }}>{s.label}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.applications}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.interviews}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.offers}</td>
                <td className="py-2.5 px-3" style={{ color: GOLD, fontWeight: 600 }}>{s.hires}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.avgPerf}</td>
                <td className="py-2.5 px-3" style={{ color: CREAM }}>{s.avgAIScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionWrapper>
  );
}
```

### 3f. `RetentionSection.jsx`

Renders retention KPIs (30/90/180/365-day) and a donut chart. Requires 3+ hired candidates with `retention_months` in performance records.

```jsx
import React from "react";
import { Clock } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { SectionWrapper, KpiCard, EmptyState, ChartTooltip, CREAM, GOLD, MUTED_LIGHT, card, SERIF, MONO, CHART_COLORS } from "./shared";
import { computeRetention } from "@/lib/analyticsEngine";

export default function RetentionSection({ data }) {
  const r = computeRetention(data);

  if (!r) {
    return (
      <SectionWrapper title="Retention" icon={Clock}>
        <EmptyState message="Not enough data — need at least 3 hired candidates with performance records containing retention data to calculate retention metrics." />
      </SectionWrapper>
    );
  }

  const kpis = [
    { label: "30-Day Retention", value: `${r.retention30}%`, accent: r.retention30 >= 80 ? GOLD : "#FB923C" },
    { label: "90-Day Retention", value: `${r.retention90}%`, accent: r.retention90 >= 70 ? GOLD : "#FB923C" },
    { label: "6-Month Retention", value: `${r.retention6mo}%` },
    { label: "1-Year Retention", value: `${r.retention1yr}%` },
    { label: "Average Retention", value: `${r.avgRetention}mo`, sub: `across ${r.total} employees` },
  ];

  const pieData = [
    { name: "Retained 1yr+", value: r.retention1yr },
    { name: "6mo–1yr", value: r.retention6mo - r.retention1yr },
    { name: "3–6mo", value: r.retention90 - r.retention6mo },
    { name: "1–3mo", value: r.retention30 - r.retention90 },
    { name: "<30 days", value: 100 - r.retention30 },
  ].filter(d => d.value > 0);

  return (
    <SectionWrapper title="Retention" icon={Clock}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {kpis.map((k, i) => <KpiCard key={i} {...k} />)}
      </div>
      <div className="p-5" style={card}>
        <h3 className="text-sm font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Retention Distribution</h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
              {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: CREAM }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </SectionWrapper>
  );
}
```

### 3g. `LearningSection.jsx`

Renders the Learning System toggle (stored in `AppSetting` key `hireiq_learning_enabled`) and an AI analysis button that calls `generateLearningInsights` from `@/lib/hireiq`.

```jsx
import React, { useState, useEffect } from "react";
import { Brain, Sparkles, TrendingUp, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Loader2 } from "lucide-react";
import { SectionWrapper, EmptyState, CREAM, GOLD, GOLD_DARK, MUTED_LIGHT, card, SERIF } from "./shared";
import { generateLearningInsights } from "@/lib/hireiq";

function InsightSection({ title, items, icon: Icon, color }) {
  if (!items?.length) return null;
  return (
    <div className="p-4" style={card}>
      <p className="text-sm font-bold mb-2 flex items-center gap-1.5" style={{ ...SERIF, color }}>
        <Icon className="w-4 h-4" /> {title}
      </p>
      <ul className="text-sm space-y-1 ml-5" style={{ color: CREAM }}>
        {items.map((item, i) => <li key={i} className="list-disc">{item}</li>)}
      </ul>
    </div>
  );
}

export default function LearningSection({ data }) {
  const [insights, setInsights] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1)
      .then(res => {
        const s = res?.data ?? res;
        if (Array.isArray(s) && s.length > 0) setEnabled(s[0].value === "true");
      }).catch(() => {});
  }, []);

  const toggleEnabled = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    try {
      const res = await base44.entities.AppSetting.filter({ key: "hireiq_learning_enabled" }, null, 1);
      const existing = res?.data ?? res;
      if (Array.isArray(existing) && existing.length > 0) {
        await base44.entities.AppSetting.update(existing[0].id, { value: String(newVal) });
      } else {
        await base44.entities.AppSetting.create({ key: "hireiq_learning_enabled", value: String(newVal) });
      }
    } catch (_) {}
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const hiredCandidates = data.candidates.filter(c => data.performances.some(p => p.candidate_id === c.id));
      const result = await generateLearningInsights(data.performances, hiredCandidates, data.jobs);
      setInsights(result);
    } catch (_) {}
    setAnalyzing(false);
  };

  const hasEnoughData = data.performances.length >= 3;

  return (
    <SectionWrapper title="Learning Insights" icon={Brain}
      action={
        <div className="flex items-center gap-3">
          <button onClick={toggleEnabled} className="relative w-12 h-6 rounded-full transition-colors"
            style={{ backgroundColor: enabled ? GOLD : "rgba(26,26,26,0.2)" }}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${enabled ? "translate-x-6" : ""}`} />
          </button>
          <span className="text-xs" style={{ color: MUTED_LIGHT }}>{enabled ? "Enabled" : "Disabled"}</span>
        </div>
      }
    >
      {!enabled ? (
        <EmptyState message="Enable the Learning System to track post-hire performance and correlate hiring predictions with actual outcomes." />
      ) : !hasEnoughData ? (
        <EmptyState message={`At least 3 performance records are needed to generate insights. Currently have ${data.performances.length}.`} />
      ) : (
        <>
          <button onClick={handleAnalyze} disabled={analyzing}
            className="mb-4 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            style={{ backgroundColor: GOLD, color: "#1A1A1A", border: "none", fontWeight: 600 }}>
            {analyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing patterns...</> : <><Sparkles className="w-4 h-4" /> Generate Learning Insights</>}
          </button>
          {analyzing && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
              <span className="ml-2 text-sm" style={{ color: MUTED_LIGHT }}>AI is correlating hiring predictions with performance data...</span>
            </div>
          )}
          {insights && !analyzing && (
            <div className="space-y-4">
              {insights.data_sufficiency && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.2)" }}>
                  <p className="text-sm font-semibold" style={{ color: GOLD }}>Data Assessment</p>
                  <p className="text-sm mt-1" style={{ color: CREAM }}>{insights.data_sufficiency}</p>
                </div>
              )}
              {insights.summary && (
                <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(26,26,26,0.05)", border: "1px solid rgba(184,149,106,0.12)" }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: CREAM }}>Summary</p>
                  <p className="text-sm" style={{ color: CREAM }}>{insights.summary}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InsightSection title="Top Success Predictors" items={insights.top_success_predictors} icon={TrendingUp} color={GOLD} />
                <InsightSection title="Top Risk Indicators" items={insights.top_risk_indicators} icon={AlertTriangle} color="#FCA5A5" />
                <InsightSection title="Competency Insights" items={insights.competency_insights} icon={Brain} color={CREAM} />
                <InsightSection title="Resume Patterns" items={insights.resume_patterns} icon={BarChart3} color="rgba(255,251,245,0.6)" />
                <InsightSection title="Interview Patterns" items={insights.interview_patterns} icon={Brain} color={GOLD_DARK} />
                <InsightSection title="Recommendations" items={insights.recommendations} icon={Lightbulb} color={GOLD} />
              </div>
            </div>
          )}
        </>
      )}
    </SectionWrapper>
  );
}
```

### 3h. `AskHireIQSection.jsx`

Renders an AI Q&A panel. Uses `InvokeLLM` with `buildAIContext(data)` as context. Answers use ONLY the hiring data.

```jsx
import React, { useState } from "react";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { SectionWrapper, CREAM, GOLD, MUTED_LIGHT, card, SERIF } from "./shared";
import { buildAIContext } from "@/lib/analyticsEngine";

const SUGGESTED = [
  "Why are offers being declined?",
  "Why are communication scores dropping?",
  "Which interview questions predict our best hires?",
  "What changed this quarter?",
  "Which sourcing channel produces the best performers?",
  "Where are candidates dropping off in our funnel?",
];

export default function AskHireIQSection({ data }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleAsk = async (q) => {
    const query = q || question;
    if (!query.trim()) return;
    setLoading(true);
    setQuestion(query);
    try {
      const context = buildAIContext(data);
      const prompt = `You are HireIQ, an AI hiring analytics assistant. Answer the hiring manager's question using ONLY the data provided below. If the data is insufficient to answer, explicitly state that.

${context}

QUESTION: ${query}

Answer concisely with specific numbers from the data. If the data doesn't cover the question, say "I don't have enough data to answer this question yet."`;

      const res = await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: null });
      const response = typeof res === "string" ? res : res?.response || res?.data || JSON.stringify(res);
      setAnswer(response);
      setHistory(prev => [{ q: query, a: response }, ...prev].slice(0, 5));
    } catch (err) {
      setAnswer("Sorry, I couldn't process that question. Please try again.");
    }
    setLoading(false);
  };

  return (
    <SectionWrapper title="Ask HireIQ" icon={MessageCircle}>
      <div className="p-5" style={card}>
        <p className="text-sm mb-3" style={{ color: MUTED_LIGHT }}>
          Ask questions about your hiring data. HireIQ answers using ONLY your company's hiring data — if there isn't enough data, it will tell you.
        </p>
        <div className="flex gap-2 mb-3">
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAsk()}
            placeholder="Ask a question about your hiring data..."
            className="flex-1 px-4 py-2.5 rounded-lg text-sm"
            style={{ backgroundColor: "#2A2A2A", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }} />
          <button onClick={() => handleAsk()} disabled={loading}
            className="px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2"
            style={{ backgroundColor: GOLD, color: "#1A1A1A", border: "none", fontWeight: 600 }}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTED.map((s, i) => (
            <button key={i} onClick={() => handleAsk(s)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{ backgroundColor: "rgba(184,149,106,0.08)", color: GOLD, border: "1px solid rgba(184,149,106,0.15)" }}>
              {s}
            </button>
          ))}
        </div>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
            <span className="ml-2 text-sm" style={{ color: MUTED_LIGHT }}>Analyzing your hiring data...</span>
          </div>
        )}
        {!loading && answer && (
          <div className="p-4 rounded-lg" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.15)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>HireIQ</p>
            <p className="text-sm whitespace-pre-wrap" style={{ color: CREAM }}>{answer}</p>
          </div>
        )}
        {history.length > 1 && !loading && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold" style={{ color: MUTED_LIGHT }}>Recent Questions</p>
            {history.slice(1).map((h, i) => (
              <button key={i} onClick={() => { setAnswer(h.a); setQuestion(h.q); }}
                className="block w-full text-left text-xs px-3 py-2 rounded transition-colors hover:bg-white/5"
                style={{ color: MUTED_LIGHT }}>
                {h.q}
              </button>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  );
}
```

### 3i. `AnalyticsExport.jsx`

Renders PDF and CSV export buttons. PDF uses `jspdf`, CSV uses `exportCSV` from the engine.

```jsx
import React from "react";
import { Download, FileText } from "lucide-react";
import jsPDF from "jspdf";
import { CREAM, GOLD, MUTED_LIGHT, TEXT_DARK } from "./shared";
import { computeOverview, computeFunnel, computePredictionAccuracy, computeSourceEffectiveness, computeRetention, exportCSV } from "@/lib/analyticsEngine";

export default function AnalyticsExport({ data }) {
  const handleCSV = () => exportCSV(data);

  const handlePDF = () => {
    const overview = computeOverview(data);
    const funnel = computeFunnel(data);
    const prediction = computePredictionAccuracy(data);
    const sources = computeSourceEffectiveness(data);
    const retention = computeRetention(data);

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, pageW, 30, "F");
    doc.setTextColor(184, 149, 106);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("HireIQ Analytics Report", 14, 20);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 251, 245);
    doc.text(new Date().toLocaleDateString(), pageW - 50, 20);
    y = 40;

    const section = (title) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setTextColor(26, 26, 26);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(title, 14, y);
      y += 6;
      doc.setDrawColor(184, 149, 106);
      doc.setLineWidth(0.5);
      doc.line(14, y, pageW - 14, y);
      y += 6;
    };

    const row = (label, value) => {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(label, 18, y);
      doc.setTextColor(26, 26, 26);
      doc.setFont("helvetica", "bold");
      doc.text(String(value), pageW - 40, y);
      y += 5.5;
    };

    section("Hiring Overview");
    row("Open Jobs", overview.openJobs);
    row("Total Candidates", overview.totalCandidates);
    row("In Interview", overview.inInterview);
    row("Offers Extended", overview.offersExtended);
    row("Hires", overview.hires);
    row("Offer Acceptance Rate", `${overview.offerAcceptanceRate}%`);
    row("Avg Time to Fill", `${overview.timeToFill} days`);
    row("Application to Interview", `${overview.appToInterview} days`);
    row("Interview to Offer", `${overview.interviewToOffer} days`);
    y += 4;

    section("Hiring Funnel");
    funnel.forEach(s => row(s.name, `${s.count} (${s.conversion}% conv)`));
    y += 4;

    if (prediction) {
      section("AI Prediction Accuracy");
      row("Avg Predicted Score", `${prediction.avgPredicted}/100`);
      row("Avg Actual Performance", `${prediction.avgActual}/100`);
      row("Prediction Accuracy", `${prediction.accuracy}%`);
      row("Overestimated", prediction.overestimated);
      row("Underestimated", prediction.underestimated);
      row("Accurate Predictions", prediction.accurate);
      y += 4;
    }

    if (sources.length > 0) {
      section("Source Effectiveness");
      sources.forEach(s => row(`${s.label} (Apps/Hires)`, `${s.applications} / ${s.hires}`));
      y += 4;
    }

    if (retention) {
      section("Retention");
      row("30-Day Retention", `${retention.retention30}%`);
      row("90-Day Retention", `${retention.retention90}%`);
      row("6-Month Retention", `${retention.retention6mo}%`);
      row("1-Year Retention", `${retention.retention1yr}%`);
      row("Average Retention", `${retention.avgRetention} months`);
    }

    doc.save(`hireiq-analytics-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="flex gap-2">
      <button onClick={handlePDF}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)" }}>
        <FileText className="w-4 h-4" /> Export PDF
      </button>
      <button onClick={handleCSV}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.3)" }}>
        <Download className="w-4 h-4" /> Export CSV
      </button>
    </div>
  );
}
```

---

## STEP 4: Create the Main Panel

**File:** `src/components/hireiq/analytics/AnalyticsPanel.jsx`

This is the container that loads data and renders all sections in order.

```jsx
import React, { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { loadAnalyticsData } from "@/lib/analyticsEngine";
import { CREAM, GOLD, MUTED_DARK, MUTED_LIGHT, SERIF } from "./shared";
import OverviewSection from "./OverviewSection";
import FunnelSection from "./FunnelSection";
import PredictionSection from "./PredictionSection";
import QuestionSection from "./QuestionSection";
import SourceSection from "./SourceSection";
import RetentionSection from "./RetentionSection";
import LearningSection from "./LearningSection";
import AskHireIQSection from "./AskHireIQSection";
import AnalyticsExport from "./AnalyticsExport";

export default function AnalyticsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData()
      .then(d => setData(d))
      .catch(() => setData({ jobs: [], candidates: [], interviews: [], performances: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        <span className="ml-3 text-sm" style={{ color: MUTED_DARK }}>Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm" style={{ color: MUTED_DARK }}>
          Hiring effectiveness, AI prediction accuracy, and performance insights
        </p>
        <AnalyticsExport data={data} />
      </div>
      <OverviewSection data={data} />
      <FunnelSection data={data} />
      <PredictionSection data={data} />
      <QuestionSection data={data} />
      <SourceSection data={data} />
      <RetentionSection data={data} />
      <LearningSection data={data} />
      <AskHireIQSection data={data} />
    </div>
  );
}
```

---

## STEP 5: Wire the Analytics Tab into HireIQ

**File:** `src/pages/HireIQ.jsx`

Make these 6 surgical edits:

### 5a. Add the BarChart3 icon to the import

**Find:**
```javascript
import { Briefcase, Plus, Loader2, Users, Brain, FileText, Search } from "lucide-react";
```
**Replace with:**
```javascript
import { Briefcase, Plus, Loader2, Users, Brain, FileText, Search, BarChart3 } from "lucide-react";
```

### 5b. Import the AnalyticsPanel

**Find:**
```javascript
import ApplicantPortalPanel from "@/components/hireiq/ApplicantPortalPanel";
```
**Replace with:**
```javascript
import ApplicantPortalPanel from "@/components/hireiq/ApplicantPortalPanel";
import AnalyticsPanel from "@/components/hireiq/analytics/AnalyticsPanel";
```

### 5c. Add the sidebar item

**Find:**
```javascript
    { id: "learning", label: "Learning", icon: Brain },
  ];
```
**Replace with:**
```javascript
    { id: "learning", label: "Learning", icon: Brain },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];
```

### 5d. Add the active state check

**Find:**
```javascript
            const active = topTab === item.id && (item.id === "learning" || item.id === "applications" || item.id === "portal" || view === "dashboard");
```
**Replace with:**
```javascript
            const active = topTab === item.id && (item.id === "learning" || item.id === "applications" || item.id === "portal" || item.id === "analytics" || view === "dashboard");
```

### 5e. Add the page title

**Find:**
```javascript
topTab === "learning" ? "Learning System"
```
**Replace with:**
```javascript
topTab === "analytics" ? "Analytics" : topTab === "learning" ? "Learning System"
```

### 5f. Add the subtitle

**Find:**
```javascript
topTab === "learning" ? "AI-powered analysis of hiring prediction accuracy"
```
**Replace with:**
```javascript
topTab === "analytics" ? "Hiring effectiveness and AI prediction accuracy" : topTab === "learning" ? "AI-powered analysis of hiring prediction accuracy"
```

### 5g. Add the render block

**Find:**
```javascript
          ) : topTab === "learning" ? (
            <LearningPanel />
```
**Replace with:**
```javascript
          ) : topTab === "analytics" ? (
            <AnalyticsPanel />
          ) : topTab === "learning" ? (
            <LearningPanel />
```

---

## STEP 6: Add Source Field to CandidateForm

**File:** `src/components/hireiq/CandidateForm.jsx`

### 6a. Add imports and state

**Find:**
```javascript
import { analyzeResumeText, analyzeResumeFile } from "@/lib/hireiq";

export default function CandidateForm({ jobId, jobData, roleProfile, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumeMode, setResumeMode] = useState("upload");
```
**Replace with:**
```javascript
import { analyzeResumeText, analyzeResumeFile } from "@/lib/hireiq";
import { SOURCE_LABELS, SOURCE_VALUES } from "@/lib/analyticsEngine";

export default function CandidateForm({ jobId, jobData, roleProfile, onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("company_career_page");
  const [resumeMode, setResumeMode] = useState("upload");
```

### 6b. Include source in the create call

**Find:**
```javascript
      const res = await base44.entities.HireCandidate.create({
        job_id: jobId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        resume_url: resumeUrl,
```
**Replace with:**
```javascript
      const res = await base44.entities.HireCandidate.create({
        job_id: jobId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        source,
        resume_url: resumeUrl,
```

### 6c. Add the source dropdown to the form

**Find:**
```javascript
      <div>
        <label className="text-sm font-medium mb-1 block">Phone</label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
      </div>
```
**Replace with:**
```javascript
      <div>
        <label className="text-sm font-medium mb-1 block">Phone</label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Source</label>
        <select value={source} onChange={e => setSource(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm" style={{ borderColor: "rgba(184,149,106,0.3)" }}>
          {SOURCE_VALUES.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
        </select>
      </div>
```

---

## STEP 7: Ensure the `source` field exists on HireCandidate entity

**File:** `base44/entities/HireCandidate.jsonc`

The `source` field must be present in the entity schema. If it's not there, add this to the `properties` object:

```jsonc
    "source": {
      "type": "string",
      "enum": [
        "company_career_page",
        "linkedin",
        "indeed",
        "employee_referral",
        "recruiter",
        "other"
      ],
      "default": "company_career_page",
      "description": "Where the candidate was sourced from"
    },
```

---

## FILE INVENTORY (all files to create/copy)

| # | File | Action |
|---|------|--------|
| 1 | `src/lib/analyticsEngine.js` | **CREATE** — copy from Step 1 |
| 2 | `src/components/hireiq/analytics/shared.jsx` | **CREATE** — copy from Step 2 |
| 3 | `src/components/hireiq/analytics/OverviewSection.jsx` | **CREATE** — copy from Step 3a |
| 4 | `src/components/hireiq/analytics/FunnelSection.jsx` | **CREATE** — copy from Step 3b |
| 5 | `src/components/hireiq/analytics/PredictionSection.jsx` | **CREATE** — copy from Step 3c |
| 6 | `src/components/hireiq/analytics/QuestionSection.jsx` | **CREATE** — copy from Step 3d |
| 7 | `src/components/hireiq/analytics/SourceSection.jsx` | **CREATE** — copy from Step 3e |
| 8 | `src/components/hireiq/analytics/RetentionSection.jsx` | **CREATE** — copy from Step 3f |
| 9 | `src/components/hireiq/analytics/LearningSection.jsx` | **CREATE** — copy from Step 3g |
| 10 | `src/components/hireiq/analytics/AskHireIQSection.jsx` | **CREATE** — copy from Step 3h |
| 11 | `src/components/hireiq/analytics/AnalyticsExport.jsx` | **CREATE** — copy from Step 3i |
| 12 | `src/components/hireiq/analytics/AnalyticsPanel.jsx` | **CREATE** — copy from Step 4 |
| 13 | `src/pages/HireIQ.jsx` | **EDIT** — 7 surgical edits from Step 5 |
| 14 | `src/components/hireiq/CandidateForm.jsx` | **EDIT** — 3 surgical edits from Step 6 |
| 15 | `base44/entities/HireCandidate.jsonc` | **EDIT** — add `source` field if missing (Step 7) |

---

## DESIGN SYSTEM NOTES

- **Colors:** Cream `#FFFBF5`, Gold `#B8956A`, Dark `#1A1A1A` — the "Arriv Brand Elevated" palette
- **Cards:** Solid dark background `#1A1A1A` with gold border `rgba(184,149,106,0.2)` — NOT glassmorphic
- **Typography:** Georgia serif for headings, SF Mono for numbers
- **No green** for score indicators — use amber/gold/orange/red tones only
- **Charts:** Recharts with gold gradient palette (`CHART_COLORS` array)
- **Responsive:** Grid layouts use `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` patterns

---

## DATA FLOW

```
AnalyticsPanel mounts
  → loadAnalyticsData() fetches all 4 entities in parallel
  → passes { jobs, candidates, interviews, performances } to each section
  → each section calls its compute* function from analyticsEngine.js
  → renders KPIs, charts, tables, or EmptyState if insufficient data
  → Ask HireIQ builds a text context from all computed metrics and sends to InvokeLLM
  → Export buttons call compute* functions again and generate PDF/CSV
```

---

## MINIMUM DATA THRESHOLDS

| Section | Minimum Data Required |
|---------|----------------------|
| Overview | Any data (shows 0s if empty) |
| Funnel | Any candidates |
| Prediction Accuracy | 3+ hired candidates with `evaluation.estimated_success_score` AND matching `HirePerformance` records |
| Question Effectiveness | 3+ hired candidates with interviews AND performance records |
| Source Effectiveness | Any candidates with `source` field |
| Retention | 3+ hired candidates with `retention_months` in performance records |
| Learning Insights | 3+ performance records + `hireiq_learning_enabled` AppSetting = "true" |
| Ask HireIQ | Any data (will say "insufficient" if empty) |