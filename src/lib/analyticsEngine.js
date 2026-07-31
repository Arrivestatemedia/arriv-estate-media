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