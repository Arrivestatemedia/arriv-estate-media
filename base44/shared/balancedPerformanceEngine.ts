// ============================================================================
// BALANCED SALES PERFORMANCE ENGINE — Sales Motion Mix + B2B Funnel + Anti-Gaming
// ============================================================================
// Extends the existing salesHealthEngine.ts with B2B-aware balanced performance
// metrics. Does NOT replace the 100-point health score — adds a parallel
// "Sales Motion Mix" and B2B funnel layer for coaching and trend visibility.
// ============================================================================

// --- Sales Motion Categories ---
export const SALES_MOTIONS = [
  { key: "individual_prospecting", label: "Individual / SMB Prospecting", color: "#3B82F6" },
  { key: "b2b_development", label: "B2B Development", color: "#B8956A" },
  { key: "pipeline_advancement", label: "Pipeline Advancement", color: "#8B5CF6" },
  { key: "customer_onboarding", label: "Customer Onboarding / Expansion", color: "#EC4899" },
] as const;

// --- B2B Funnel Stages ---
export const B2B_FUNNEL_STAGES = [
  { key: "identified", label: "Identified", description: "B2B signal recognized" },
  { key: "qualified", label: "Qualified", description: "Decision-maker confirmed, need verified" },
  { key: "dm_engaged", label: "Decision-Maker Engaged", description: "Conversation with economic/technical buyer" },
  { key: "discovery_demo", label: "Discovery / Demo", description: "Formal discovery or demo meeting held" },
  { key: "proposal_decision", label: "Proposal / Decision", description: "Proposal sent, decision pending" },
  { key: "converted", label: "Converted", description: "Contract signed, organization created" },
  { key: "onboarded", label: "Onboarded", description: "Admin assigned, members added, trained" },
  { key: "adopted", label: "Adopted", description: "Credits being utilized, adoption verified" },
  { key: "expanded_renewed", label: "Expanded / Renewed", description: "Expansion or renewal completed" },
] as const;

// --- Initial Operating Benchmarks ---
export const OPERATING_BENCHMARKS = {
  outbound_attempts_per_full_day: 100,
  outbound_attempts_per_full_week: 400,
  meaningful_conversation_rate_pct: 15,
  new_qualified_opportunities_per_week: { min: 8, max: 12 },
  b2b_qualified_opportunities_per_week: { min: 2, max: 4 },
  b2b_dm_conversations_per_week: { min: 4, max: 8 },
  b2b_discovery_demo_meetings_per_week: { min: 1, max: 3 },
  due_followup_completion_pct: 95,
  crm_completeness_pct: 95,
  b2b_onboarding_on_time_pct: 95,
} as const;

// --- Coaching Health Model Weights ---
export const COACHING_HEALTH_WEIGHTS = {
  qualified_pipeline_creation: 25,
  meaningful_conversations_discovery: 20,
  pipeline_advancement: 20,
  crm_discipline: 15,
  customer_onboarding_adoption: 10,
  activity_prospecting_consistency: 10,
} as const;

// --- Anti-Gaming Flag Definitions ---
export const ANTI_GAMING_FLAGS = [
  {
    key: "high_outbound_weak_followup",
    label: "High outbound with weak follow-up",
    description: "2+ weeks of high outbound attempts with weak follow-up completion or qualified opportunity creation",
    severity: "warning",
    window_weeks: 2,
  },
  {
    key: "b2b_dominates_pipeline_decline",
    label: "B2B dominates while pipeline declines",
    description: "2+ weeks of B2B time dominating while new-pipeline creation materially falls",
    severity: "warning",
    window_weeks: 2,
  },
  {
    key: "territory_no_b2b_discovery",
    label: "Territory has B2B opportunities but no discovery",
    description: "Territory/account base presents organization opportunities but rep records no B2B discovery for 3 weeks",
    severity: "warning",
    window_weeks: 3,
  },
  {
    key: "due_followup_below_threshold",
    label: "Due follow-up below 95%",
    description: "Due follow-up completion rate below 95% threshold",
    severity: "warning",
    threshold: 95,
  },
  {
    key: "crm_completeness_below_threshold",
    label: "CRM completeness below 95%",
    description: "CRM completeness/accuracy below 95% threshold",
    severity: "warning",
    threshold: 95,
  },
  {
    key: "b2b_meetings_no_dm_evidence",
    label: "B2B meetings without decision-maker evidence",
    description: "B2B meetings logged without decision-maker or next-step evidence",
    severity: "warning",
  },
  {
    key: "b2b_onboarding_late",
    label: "B2B onboarding below 95% on time",
    description: "B2B onboarding tasks below 95% on-time completion",
    severity: "warning",
    threshold: 95,
  },
  {
    key: "onboarding_mislabeled_prospecting",
    label: "Onboarding/admin mislabeled as prospecting",
    description: "Onboarding or admin activity mislabeled as prospecting to inflate outbound counts",
    severity: "critical",
  },
  {
    key: "unqualified_company_mentions",
    label: "Unqualified company mentions as B2B opportunities",
    description: "Unqualified company-name mentions mislabeled as B2B opportunities",
    severity: "critical",
  },
] as const;

// --- Types ---
export interface WeeklyMotionData {
  week_start: string;
  individual_outbound_attempts: number;
  b2b_outbound_attempts: number;
  individual_qualified_opportunities: number;
  b2b_qualified_opportunities: number;
  b2b_dm_conversations: number;
  b2b_discovery_demos: number;
  pipeline_advancements: number;
  customer_onboardings: number;
  customer_expansions: number;
  due_followups_total: number;
  due_followups_completed: number;
  crm_completeness_pct: number;
  b2b_onboarding_tasks_total: number;
  b2b_onboarding_tasks_on_time: number;
  full_prospecting_days: number;
  qualified_demos: number;
  field_appointments: number;
  customer_training_sessions: number;
  pto_hours: number;
  company_event_hours: number;
  approved_obligation_hours: number;
}

export interface B2BFunnelCounts {
  identified: number;
  qualified: number;
  dm_engaged: number;
  discovery_demo: number;
  proposal_decision: number;
  converted: number;
  onboarded: number;
  adopted: number;
  expanded_renewed: number;
}

// --- Prospecting Opportunity Time Calculation ---
export function calculateProspectingOpportunityTime(week: WeeklyMotionData): {
  raw_hours: number;
  reduction_hours: number;
  available_hours: number;
  available_pct: number;
  reductions: { label: string; hours: number }[];
} {
  const rawHours = 40; // standard work week
  const reductions: { label: string; hours: number }[] = [];

  if (week.qualified_demos > 0) reductions.push({ label: "Qualified demos", hours: week.qualified_demos * 1.5 });
  if (week.field_appointments > 0) reductions.push({ label: "Field appointments", hours: week.field_appointments * 3 });
  if (week.customer_onboardings > 0) reductions.push({ label: "Customer onboarding", hours: week.customer_onboardings * 2 });
  if (week.customer_training_sessions > 0) reductions.push({ label: "Customer training", hours: week.customer_training_sessions * 1.5 });
  if (week.pto_hours > 0) reductions.push({ label: "PTO", hours: week.pto_hours });
  if (week.company_event_hours > 0) reductions.push({ label: "Company events", hours: week.company_event_hours });
  if (week.approved_obligation_hours > 0) reductions.push({ label: "Approved obligations", hours: week.approved_obligation_hours });

  const reductionHours = reductions.reduce((sum, r) => sum + r.hours, 0);
  const availableHours = Math.max(0, rawHours - reductionHours);
  const availablePct = Math.round((availableHours / rawHours) * 100);

  return { raw_hours: rawHours, reduction_hours: reductionHours, available_hours: availableHours, available_pct: availablePct, reductions };
}

// --- Sales Motion Mix Computation ---
export function computeSalesMotionMix(week: WeeklyMotionData): {
  motions: { key: string; label: string; value: number; pct: number; color: string }[];
  total_activity: number;
  balance_score: number;
} {
  const individual = week.individual_outbound_attempts + week.individual_qualified_opportunities * 10;
  const b2b = week.b2b_outbound_attempts + week.b2b_qualified_opportunities * 15 + week.b2b_dm_conversations * 10 + week.b2b_discovery_demos * 20;
  const pipeline = week.pipeline_advancements * 15;
  const onboarding = (week.customer_onboardings + week.customer_expansions) * 20;

  const total = individual + b2b + pipeline + onboarding;
  if (total === 0) {
    return {
      motions: SALES_MOTIONS.map(m => ({ key: m.key, label: m.label, value: 0, pct: 0, color: m.color })),
      total_activity: 0,
      balance_score: 0,
    };
  }

  const motions = [
    { key: "individual_prospecting", label: "Individual / SMB Prospecting", value: individual, pct: Math.round((individual / total) * 100), color: "#3B8266" },
    { key: "b2b_development", label: "B2B Development", value: b2b, pct: Math.round((b2b / total) * 100), color: "#B8956A" },
    { key: "pipeline_advancement", label: "Pipeline Advancement", value: pipeline, pct: Math.round((pipeline / total) * 100), color: "#8B5CF6" },
    { key: "customer_onboarding", label: "Customer Onboarding / Expansion", value: onboarding, pct: Math.round((onboarding / total) * 100), color: "#EC4899" },
  ];

  // Balance score: how evenly distributed across motions (0 = all one motion, 100 = perfectly balanced)
  const idealPct = 25;
  const variance = motions.reduce((sum, m) => sum + Math.pow(m.pct - idealPct, 2), 0) / motions.length;
  const balanceScore = Math.max(0, Math.round(100 - Math.sqrt(variance) * 2));

  return { motions, total_activity: total, balance_score: balanceScore };
}

// --- B2B Funnel Computation ---
export function computeB2BFunnel(funnelCounts: B2BFunnelCounts): {
  stages: { key: string; label: string; count: number; conversion_pct: number }[];
  overall_conversion: number;
} {
  const stages = B2B_FUNNEL_STAGES.map((stage, i) => {
    const count = funnelCounts[stage.key] || 0;
    const prevCount = i === 0 ? count : (funnelCounts[B2B_FUNNEL_STAGES[i - 1].key] || 0);
    const conversionPct = prevCount > 0 ? Math.round((count / prevCount) * 100) : 0;
    return { key: stage.key, label: stage.label, count, conversion_pct: conversionPct };
  });

  const overallConversion = funnelCounts.identified > 0
    ? Math.round((funnelCounts.converted / funnelCounts.identified) * 100)
    : 0;

  return { stages, overall_conversion: overallConversion };
}

// --- Anti-Gaming Flag Detection ---
export function detectAntiGamingFlags(weeks: WeeklyMotionData[]): {
  key: string;
  label: string;
  description: string;
  severity: "warning" | "critical";
  triggered: boolean;
  evidence: string;
}[] {
  const flags: {
    key: string;
    label: string;
    description: string;
    severity: "warning" | "critical";
    triggered: boolean;
    evidence: string;
  }[] = [];

  if (weeks.length === 0) return flags;

  const recentWeeks = weeks.slice(-4);
  const last2 = recentWeeks.slice(-2);
  const last3 = recentWeeks.slice(-3);

  // 1. High outbound with weak follow-up (2+ weeks)
  const highOutboundWeakFollowup = last2.length >= 2 && last2.every(w =>
    (w.individual_outbound_attempts + w.b2b_outbound_attempts) > 80 &&
    w.due_followups_total > 0 &&
    (w.due_followups_completed / w.due_followups_total) < 0.90
  );
  flags.push({
    key: "high_outbound_weak_followup",
    label: "High outbound with weak follow-up",
    description: "2+ weeks of high outbound with weak follow-up completion",
    severity: "warning",
    triggered: highOutboundWeakFollowup,
    evidence: highOutboundWeakFollowup
      ? `${last2.map(w => `${w.due_followups_completed}/${w.due_followups_total} follow-ups`).join(", ")}`
      : "",
  });

  // 2. B2B dominates while pipeline declines (2+ weeks)
  const b2bDominatesPipelineDecline = last2.length >= 2 && last2.every(w => {
    const totalActivity = w.individual_outbound_attempts + w.b2b_outbound_attempts;
    return totalActivity > 0 && (w.b2b_outbound_attempts / totalActivity) > 0.6 && w.individual_qualified_opportunities < 3;
  });
  flags.push({
    key: "b2b_dominates_pipeline_decline",
    label: "B2B dominates while pipeline declines",
    description: "2+ weeks of B2B dominating while new individual pipeline creation falls",
    severity: "warning",
    triggered: b2bDominatesPipelineDecline,
    evidence: b2bDominatesPipelineDecline
      ? `${last2.map(w => `${w.b2b_outbound_attempts} B2B / ${w.individual_qualified_opportunities} ind. qual.`).join(", ")}`
      : "",
  });

  // 3. Territory has B2B opportunities but no discovery (3 weeks)
  const noB2BDiscovery = last3.length >= 3 && last3.every(w => w.b2b_discovery_demos === 0 && w.b2b_dm_conversations === 0);
  flags.push({
    key: "territory_no_b2b_discovery",
    label: "No B2B discovery for 3 weeks",
    description: "Territory may have B2B opportunities but no B2B discovery recorded for 3 weeks",
    severity: "warning",
    triggered: noB2BDiscovery,
    evidence: noB2BDiscovery ? "0 B2B discovery demos or DM conversations in last 3 weeks" : "",
  });

  // 4. Due follow-up below 95%
  const latestWeek = recentWeeks[recentWeeks.length - 1];
  if (latestWeek && latestWeek.due_followups_total > 0) {
    const followupPct = (latestWeek.due_followups_completed / latestWeek.due_followups_total) * 100;
    flags.push({
      key: "due_followup_below_threshold",
      label: "Due follow-up below 95%",
      description: `Due follow-up completion: ${Math.round(followupPct)}% (threshold: 95%)`,
      severity: "warning",
      triggered: followupPct < 95,
      evidence: `${latestWeek.due_followups_completed}/${latestWeek.due_followups_total} = ${Math.round(followupPct)}%`,
    });
  }

  // 5. CRM completeness below 95%
  if (latestWeek && latestWeek.crm_completeness_pct < 95) {
    flags.push({
      key: "crm_completeness_below_threshold",
      label: "CRM completeness below 95%",
      description: `CRM completeness: ${latestWeek.crm_completeness_pct}% (threshold: 95%)`,
      severity: "warning",
      triggered: true,
      evidence: `${latestWeek.crm_completeness_pct}%`,
    });
  }

  // 6. B2B onboarding below 95% on time
  if (latestWeek && latestWeek.b2b_onboarding_tasks_total > 0) {
    const onTimePct = (latestWeek.b2b_onboarding_tasks_on_time / latestWeek.b2b_onboarding_tasks_total) * 100;
    flags.push({
      key: "b2b_onboarding_late",
      label: "B2B onboarding below 95% on time",
      description: `B2B onboarding on-time: ${Math.round(onTimePct)}% (threshold: 95%)`,
      severity: "warning",
      triggered: onTimePct < 95,
      evidence: `${latestWeek.b2b_onboarding_tasks_on_time}/${latestWeek.b2b_onboarding_tasks_total} = ${Math.round(onTimePct)}%`,
    });
  }

  return flags;
}

// --- Coaching Health Score ---
export function computeCoachingHealthScore(week: WeeklyMotionData, weeks: WeeklyMotionData[]): {
  total: number;
  components: { key: string; label: string; score: number; max: number; detail: string }[];
  summary: string;
} {
  const w = week;

  // 1. Qualified pipeline creation (25 pts)
  const totalQualified = w.individual_qualified_opportunities + w.b2b_qualified_opportunities;
  const qualTarget = OPERATING_BENCHMARKS.new_qualified_opportunities_per_week.min;
  const qualPct = Math.min(100, (totalQualified / qualTarget) * 100);
  const qualScore = Math.round((qualPct / 100) * COACHING_HEALTH_WEIGHTS.qualified_pipeline_creation);

  // 2. Meaningful conversations / discovery (20 pts)
  const meaningfulConvTarget = Math.max(1, w.individual_outbound_attempts * (OPERATING_BENCHMARKS.meaningful_conversation_rate_pct / 100));
  const meaningfulConvPct = Math.min(100, (w.b2b_dm_conversations + Math.round(meaningfulConvTarget)) / Math.max(1, meaningfulConvTarget) * 100);
  const convScore = Math.round((meaningfulConvPct / 100) * COACHING_HEALTH_WEIGHTS.meaningful_conversations_discovery);

  // 3. Pipeline advancement (20 pts)
  const advancementTarget = 5;
  const advancementPct = Math.min(100, (w.pipeline_advancements / advancementTarget) * 100);
  const advancementScore = Math.round((advancementPct / 100) * COACHING_HEALTH_WEIGHTS.pipeline_advancement);

  // 4. CRM discipline (15 pts)
  const followupPct = w.due_followups_total > 0 ? (w.due_followups_completed / w.due_followups_total) * 100 : 100;
  const crmPct = (followupPct + w.crm_completeness_pct) / 2;
  const crmScore = Math.round((crmPct / 100) * COACHING_HEALTH_WEIGHTS.crm_discipline);

  // 5. Customer onboarding / adoption (10 pts)
  const onboardingTarget = 3;
  const onboardingPct = Math.min(100, ((w.customer_onboardings + w.customer_expansions) / onboardingTarget) * 100);
  const onboardingScore = Math.round((onboardingPct / 100) * COACHING_HEALTH_WEIGHTS.customer_onboarding_adoption);

  // 6. Activity / prospecting consistency (10 pts)
  const prospectingTarget = OPERATING_BENCHMARKS.outbound_attempts_per_full_week * (w.full_prospecting_days / 5);
  const prospectingPct = Math.min(100, ((w.individual_outbound_attempts + w.b2b_outbound_attempts) / Math.max(1, prospectingTarget)) * 100);
  const activityScore = Math.round((prospectingPct / 100) * COACHING_HEALTH_WEIGHTS.activity_prospecting_consistency);

  const total = qualScore + convScore + advancementScore + crmScore + onboardingScore + activityScore;

  const components = [
    { key: "qualified_pipeline", label: "Qualified Pipeline Creation", score: qualScore, max: COACHING_HEALTH_WEIGHTS.qualified_pipeline_creation, detail: `${totalQualified} qualified opportunities (${w.individual_qualified_opportunities} ind + ${w.b2b_qualified_opportunities} B2B)` },
    { key: "conversations", label: "Meaningful Conversations / Discovery", score: convScore, max: COACHING_HEALTH_WEIGHTS.meaningful_conversations_discovery, detail: `${w.b2b_dm_conversations} B2B DM conversations` },
    { key: "advancement", label: "Pipeline Advancement", score: advancementScore, max: COACHING_HEALTH_WEIGHTS.pipeline_advancement, detail: `${w.pipeline_advancements} advancements` },
    { key: "crm", label: "CRM Discipline", score: crmScore, max: COACHING_HEALTH_WEIGHTS.crm_discipline, detail: `${Math.round(followupPct)}% follow-up, ${w.crm_completeness_pct}% CRM completeness` },
    { key: "onboarding", label: "Customer Onboarding / Adoption", score: onboardingScore, max: COACHING_HEALTH_WEIGHTS.customer_onboarding_adoption, detail: `${w.customer_onboardings} onboardings, ${w.customer_expansions} expansions` },
    { key: "activity", label: "Activity / Prospecting Consistency", score: activityScore, max: COACHING_HEALTH_WEIGHTS.activity_prospecting_consistency, detail: `${w.individual_outbound_attempts + w.b2b_outbound_attempts} attempts, ${w.full_prospecting_days} full prospecting days` },
  ];

  const summary = `Coaching Health: ${total}/100. Strongest: ${components.sort((a, b) => b.score - a.score)[0].label}. Needs work: ${components.sort((a, b) => a.score - b.score)[0].label}.`;

  return { total: Math.min(100, total), components, summary };
}

// --- Balanced Performance Dashboard Data ---
export function computeBalancedPerformanceDashboard(weeks: WeeklyMotionData[], funnelCounts: B2BFunnelCounts): {
  motion_mix_4wk: { motions: { key: string; label: string; value: number; pct: number; color: string }[]; total_activity: number; balance_score: number };
  motion_mix_latest: { motions: { key: string; label: string; value: number; pct: number; color: string }[]; total_activity: number; balance_score: number };
  b2b_funnel: { stages: { key: string; label: string; count: number; conversion_pct: number }[]; overall_conversion: number };
  anti_gaming_flags: { key: string; label: string; description: string; severity: string; triggered: boolean; evidence: string }[];
  coaching_health: { total: number; components: { key: string; label: string; score: number; max: number; detail: string }[]; summary: string };
  prospecting_opportunity: { raw_hours: number; reduction_hours: number; available_hours: number; available_pct: number; reductions: { label: string; hours: number }[] };
  raw_outbound_4wk: number;
  attempts_relative_to_available: number;
  latest_week: WeeklyMotionData | null;
} {
  if (weeks.length === 0) {
    return {
      motion_mix_4wk: { motions: [], total_activity: 0, balance_score: 0 },
      motion_mix_latest: { motions: [], total_activity: 0, balance_score: 0 },
      b2b_funnel: { stages: [], overall_conversion: 0 },
      anti_gaming_flags: [],
      coaching_health: { total: 0, components: [], summary: "No data" },
      prospecting_opportunity: { raw_hours: 40, reduction_hours: 0, available_hours: 40, available_pct: 100, reductions: [] },
      raw_outbound_4wk: 0,
      attempts_relative_to_available: 0,
      latest_week: null,
    };
  }

  const last4 = weeks.slice(-4);
  const latest = weeks[weeks.length - 1];

  // Aggregate 4-week motion mix
  const aggregated4wk: WeeklyMotionData = {
    week_start: "4wk_rollup",
    individual_outbound_attempts: last4.reduce((s, w) => s + w.individual_outbound_attempts, 0),
    b2b_outbound_attempts: last4.reduce((s, w) => s + w.b2b_outbound_attempts, 0),
    individual_qualified_opportunities: last4.reduce((s, w) => s + w.individual_qualified_opportunities, 0),
    b2b_qualified_opportunities: last4.reduce((s, w) => s + w.b2b_qualified_opportunities, 0),
    b2b_dm_conversations: last4.reduce((s, w) => s + w.b2b_dm_conversations, 0),
    b2b_discovery_demos: last4.reduce((s, w) => s + w.b2b_discovery_demos, 0),
    pipeline_advancements: last4.reduce((s, w) => s + w.pipeline_advancements, 0),
    customer_onboardings: last4.reduce((s, w) => s + w.customer_onboardings, 0),
    customer_expansions: last4.reduce((s, w) => s + w.customer_expansions, 0),
    due_followups_total: last4.reduce((s, w) => s + w.due_followups_total, 0),
    due_followups_completed: last4.reduce((s, w) => s + w.due_followups_completed, 0),
    crm_completeness_pct: Math.round(last4.reduce((s, w) => s + w.crm_completeness_pct, 0) / last4.length),
    b2b_onboarding_tasks_total: last4.reduce((s, w) => s + w.b2b_onboarding_tasks_total, 0),
    b2b_onboarding_tasks_on_time: last4.reduce((s, w) => s + w.b2b_onboarding_tasks_on_time, 0),
    full_prospecting_days: last4.reduce((s, w) => s + w.full_prospecting_days, 0),
    qualified_demos: last4.reduce((s, w) => s + w.qualified_demos, 0),
    field_appointments: last4.reduce((s, w) => s + w.field_appointments, 0),
    customer_training_sessions: last4.reduce((s, w) => s + w.customer_training_sessions, 0),
    pto_hours: last4.reduce((s, w) => s + w.pto_hours, 0),
    company_event_hours: last4.reduce((s, w) => s + w.company_event_hours, 0),
    approved_obligation_hours: last4.reduce((s, w) => s + w.approved_obligation_hours, 0),
  };

  const motionMix4wk = computeSalesMotionMix(aggregated4wk);
  const motionMixLatest = computeSalesMotionMix(latest);
  const b2bFunnel = computeB2BFunnel(funnelCounts);
  const antiGamingFlags = detectAntiGamingFlags(weeks);
  const coachingHealth = computeCoachingHealthScore(latest, weeks);
  const prospectingOpp = calculateProspectingOpportunityTime(latest);

  const rawOutbound4wk = aggregated4wk.individual_outbound_attempts + aggregated4wk.b2b_outbound_attempts;
  const attemptsRelativeToAvailable = prospectingOpp.available_hours > 0
    ? Math.round(rawOutbound4wk / (prospectingOpp.available_hours * 4 / 40 * OPERATING_BENCHMARKS.outbound_attempts_per_full_week))
    : 0;

  return {
    motion_mix_4wk: motionMix4wk,
    motion_mix_latest: motionMixLatest,
    b2b_funnel: b2bFunnel,
    anti_gaming_flags: antiGamingFlags,
    coaching_health: coachingHealth,
    prospecting_opportunity: prospectingOpp,
    raw_outbound_4wk: rawOutbound4wk,
    attempts_relative_to_available: attemptsRelativeToAvailable,
    latest_week: latest,
  };
}