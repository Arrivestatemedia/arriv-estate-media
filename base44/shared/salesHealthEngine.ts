// ============================================================================
// SALES HEALTH SCORE ENGINE — Deterministic, explainable 100-point score.
//
// CANONICAL IMPLEMENTATION — no duplicate score systems.
// Used by computeSalesPerformance and generateSalesRepDailyReport so every
// screen that shows a Sales Health Score renders the SAME number with the
// SAME breakdown.
//
// 100-POINT MODEL:
//   Prospecting & Activity      20 pts
//   Engagement & Follow-Up      20 pts
//   Pipeline Health             20 pts
//   Sales Results               30 pts
//   Customer Growth & Quality   10 pts
//
// RAMP-AWARE: New reps are scored against ramp-appropriate expectations.
// ============================================================================

export interface HealthComponent {
  key: string;
  label: string;
  score: number;
  max: number;
  detail: string;
  sub_items?: { label: string; value: number; target: number; pct: number }[];
}

export interface HealthScoreResult {
  total: number;
  components: HealthComponent[];
  ramp_stage: string;
  ramp_note: string;
  summary: string;
  coaching_hints: string[];
}

export type WorkMode = "remote" | "hybrid" | "field";

export interface WorkModeTargets {
  remote_calls: number;
  hybrid_calls_min: number;
  hybrid_calls_max: number;
  hybrid_field_stops_min: number;
  hybrid_field_stops_max: number;
  field_stops_min: number;
  field_stops_max: number;
  follow_up_compliance_pct: number;
  appointment_goal: number;
  qualification_goal: number;
  weekly_revenue_goal: number;
}

export const DEFAULT_TARGETS: WorkModeTargets = {
  remote_calls: 100,
  hybrid_calls_min: 40,
  hybrid_calls_max: 60,
  hybrid_field_stops_min: 6,
  hybrid_field_stops_max: 10,
  field_stops_min: 15,
  field_stops_max: 20,
  follow_up_compliance_pct: 80,
  appointment_goal: 5,
  qualification_goal: 5,
  weekly_revenue_goal: 2000,
};

export type RampStage = "training" | "early_ramp" | "ramp" | "full_production";

export function computeRampStage(
  hireDate: string | null | undefined,
  certificationDate: string | null | undefined,
  now: Date = new Date()
): RampStage {
  const rampRef = certificationDate || hireDate;
  if (!rampRef) return "full_production";

  const ref = new Date(rampRef);
  if (isNaN(ref.getTime())) return "full_production";

  const daysSince = Math.floor((now.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince < 0) return "training";
  if (daysSince <= 14) return "early_ramp";
  if (daysSince <= 30) return "ramp";
  return "full_production";
}

export function rampWeightOverrides(stage: RampStage) {
  switch (stage) {
    case "training":
      return { prospecting: 30, engagement: 25, pipeline: 20, sales: 15, growth: 10 };
    case "early_ramp":
      return { prospecting: 25, engagement: 25, pipeline: 20, sales: 20, growth: 10 };
    case "ramp":
      return { prospecting: 22, engagement: 22, pipeline: 22, sales: 24, growth: 10 };
    default:
      return { prospecting: 20, engagement: 20, pipeline: 20, sales: 30, growth: 10 };
  }
}

function safeDiv(num: number, den: number): number {
  if (!den || den === 0 || !isFinite(num) || !isFinite(den)) return 0;
  return num / den;
}

function safePct(num: number, den: number): number {
  return Math.round(safeDiv(num, den) * 100);
}

function clampScore(val: number, max: number): number {
  if (!isFinite(val) || val < 0) return 0;
  return Math.min(val, max);
}

export interface MetricsInput {
  weekly: {
    calls_completed: number;
    emails_sent: number;
    texts_sent: number;
    meaningful_conversations: number;
    appointments_scheduled: number;
    meetings_scheduled: number;
    follow_ups_completed: number;
    new_contacts_claimed: number;
    deals_closed: number;
    deals_won: number;
    deals_lost: number;
    revenue_generated: number;
    commission_earned: number;
    close_rate: number;
    average_deal_size: number;
    pipeline: {
      leads: number;
      conversations: number;
      appointments: number;
      quotes: number;
      clients: number;
      revenue: number;
    };
  };
  field?: {
    field_visits: number;
    field_new_contacts: number;
    field_meaningful_conversations: number;
    field_qualified_prospects: number;
    field_appointments: number;
    field_customers: number;
    field_revenue: number;
  };
  growth?: {
    repeat_orders: number;
    first_orders: number;
    referrals: number;
    customer_success_followups: number;
    cancellations: number;
    refunds: number;
  };
}

export function computeSalesHealthScore(
  metrics: MetricsInput,
  targets: WorkModeTargets,
  rampStage: RampStage = "full_production"
): HealthScoreResult {
  const w = metrics.weekly;
  const f = metrics.field || {
    field_visits: 0, field_new_contacts: 0, field_meaningful_conversations: 0,
    field_qualified_prospects: 0, field_appointments: 0, field_customers: 0, field_revenue: 0,
  };
  const g = metrics.growth || {
    repeat_orders: 0, first_orders: 0, referrals: 0,
    customer_success_followups: 0, cancellations: 0, refunds: 0,
  };

  const weights = rampWeightOverrides(rampStage);

  // 1. PROSPECTING & ACTIVITY
  const weeklyCallTarget = targets.remote_calls * 5;
  const callPct = safePct(w.calls_completed, weeklyCallTarget);
  const fieldVisitTarget = targets.field_stops_max * 5;
  const fieldPct = safePct(f.field_visits, fieldVisitTarget);
  const newContactTarget = 25;
  const contactPct = safePct(w.new_contacts_claimed, newContactTarget);
  const activityBlend = Math.max(
    callPct * 0.5 + contactPct * 0.5,
    f.field_visits > 0 ? fieldPct * 0.6 + contactPct * 0.4 : 0
  );
  const prospectingScore = clampScore(activityBlend, 100);

  // 2. ENGAGEMENT & FOLLOW-UP
  const connectionRate = safePct(w.meaningful_conversations, w.calls_completed);
  const followupTarget = Math.max(w.follow_ups_completed, 1);
  const followupCompliance = Math.min(100, safePct(w.follow_ups_completed, followupTarget));
  const appointmentPct = safePct(w.appointments_scheduled, targets.appointment_goal * 5);
  const engagementBlend = (connectionRate * 0.3 + followupCompliance * 0.3 + appointmentPct * 0.4);
  const engagementScore = clampScore(engagementBlend, 100);

  // 3. PIPELINE HEALTH
  const p = w.pipeline;
  const qualRate = safePct(p.conversations, Math.max(p.conversations, 1));
  const appointmentFromConv = safePct(p.appointments, Math.max(p.conversations, 1));
  const clientFromQual = safePct(p.clients, Math.max(p.conversations, 1));
  const pipelineValue = Math.min(100, safePct(p.revenue, targets.weekly_revenue_goal * 5));
  const pipelineBlend = (qualRate * 0.2 + appointmentFromConv * 0.3 + clientFromQual * 0.3 + pipelineValue * 0.2);
  const pipelineScore = clampScore(pipelineBlend, 100);

  // 4. SALES RESULTS
  const dealsWon = w.deals_won || w.deals_closed || 0;
  const dealTarget = rampStage === "full_production" ? 3 : rampStage === "ramp" ? 2 : 1;
  const dealPct = safePct(dealsWon, dealTarget * 5);
  const revenuePct = safePct(w.revenue_generated, targets.weekly_revenue_goal * 5);
  const closeRateScore = Math.min(100, w.close_rate || 0);
  const salesBlend = (dealPct * 0.35 + revenuePct * 0.45 + closeRateScore * 0.20);
  const salesScore = clampScore(salesBlend, 100);

  // 5. CUSTOMER GROWTH & QUALITY
  const firstOrders = g.first_orders || dealsWon;
  const repeatRate = firstOrders > 0 ? safePct(g.repeat_orders, firstOrders) : 0;
  const referralScore = safePct(g.referrals, 5);
  const successFollowupScore = safePct(g.customer_success_followups, 5);
  const cancellationPenalty = Math.max(0, 100 - (g.cancellations * 20 + g.refunds * 20));
  const growthBlend = (repeatRate * 0.35 + referralScore * 0.25 + successFollowupScore * 0.20 + cancellationPenalty * 0.20);
  const growthScore = clampScore(growthBlend, 100);

  // WEIGHTED TOTAL
  const total = Math.round(
    (prospectingScore * weights.prospecting +
      engagementScore * weights.engagement +
      pipelineScore * weights.pipeline +
      salesScore * weights.sales +
      growthScore * weights.growth) / 100
  );

  // COACHING HINTS
  const hints: string[] = [];
  if (w.calls_completed > weeklyCallTarget * 0.8 && w.meaningful_conversations < w.calls_completed * 0.15) {
    hints.push("High call volume but low connection rate — review prospect selection, timing, and contact-data quality.");
  }
  if (w.meaningful_conversations > 5 && w.appointments_scheduled < w.meaningful_conversations * 0.2) {
    hints.push("Good conversations but low appointment rate — focus on appointment-setting and stronger CTAs.");
  }
  if (w.appointments_scheduled > 2 && w.deals_closed === 0 && rampStage === "full_production") {
    hints.push("Appointments booked but no closed deals — review recommendation, objection-handling, and closing skills.");
  }
  if (f.field_visits > 5 && f.field_qualified_prospects === 0) {
    hints.push("Field visits logged but no qualified prospects — improve field qualification and follow-up.");
  }
  if (dealsWon > 0 && g.repeat_orders === 0 && rampStage === "full_production") {
    hints.push("First orders closed but no repeat business yet — prioritize post-service customer success follow-ups.");
  }
  if (w.calls_completed < weeklyCallTarget * 0.5 && f.field_visits === 0) {
    hints.push("Activity is below the remote baseline and no field work was logged — increase daily outreach volume.");
  }

  // SUMMARY
  const ranked = [
    { label: "Prospecting", val: prospectingScore },
    { label: "Engagement", val: engagementScore },
    { label: "Pipeline", val: pipelineScore },
    { label: "Sales", val: salesScore },
    { label: "Growth", val: growthScore },
  ].sort((a, b) => b.val - a.val);
  const weakest = [...ranked].sort((a, b) => a.val - b.val);

  const rampNote = rampStage === "training"
    ? "In training/pre-certification — scored on activity and fundamentals, not revenue."
    : rampStage === "early_ramp"
    ? "Early ramp (weeks 1–2) — emphasis on activity, prospecting, and follow-up discipline."
    : rampStage === "ramp"
    ? "Ramp phase (weeks 3–4) — increasing emphasis on pipeline creation and first orders."
    : "Full production — standard performance model applies.";

  const summary = `Strongest: ${ranked[0].label} (${Math.round(ranked[0].val)}/100). ` +
    `Needs work: ${weakest[0].label} (${Math.round(weakest[0].val)}/100). ${rampNote}`;

  const components: HealthComponent[] = [
    {
      key: "prospecting",
      label: "Prospecting & Activity",
      score: Math.round(prospectingScore * weights.prospecting / 100),
      max: weights.prospecting,
      detail: `${w.calls_completed} calls, ${f.field_visits} field visits, ${w.new_contacts_claimed} new contacts this week.`,
      sub_items: [
        { label: "Calls", value: w.calls_completed, target: weeklyCallTarget, pct: callPct },
        { label: "Field Visits", value: f.field_visits, target: fieldVisitTarget, pct: fieldPct },
        { label: "New Contacts", value: w.new_contacts_claimed, target: newContactTarget, pct: contactPct },
      ],
    },
    {
      key: "engagement",
      label: "Engagement & Follow-Up",
      score: Math.round(engagementScore * weights.engagement / 100),
      max: weights.engagement,
      detail: `${w.meaningful_conversations} conversations, ${w.follow_ups_completed} follow-ups, ${w.appointments_scheduled} appointments.`,
      sub_items: [
        { label: "Connection Rate", value: w.meaningful_conversations, target: w.calls_completed, pct: connectionRate },
        { label: "Follow-up Compliance", value: w.follow_ups_completed, target: followupTarget, pct: followupCompliance },
        { label: "Appointments", value: w.appointments_scheduled, target: targets.appointment_goal * 5, pct: appointmentPct },
      ],
    },
    {
      key: "pipeline",
      label: "Pipeline Health",
      score: Math.round(pipelineScore * weights.pipeline / 100),
      max: weights.pipeline,
      detail: `${p.conversations} conversations → ${p.appointments} appointments → ${p.clients} clients → $${p.revenue} revenue.`,
      sub_items: [
        { label: "Qualification Rate", value: p.conversations, target: p.conversations, pct: qualRate },
        { label: "Appointment Conversion", value: p.appointments, target: p.conversations, pct: appointmentFromConv },
        { label: "Client Conversion", value: p.clients, target: p.conversations, pct: clientFromQual },
      ],
    },
    {
      key: "sales",
      label: "Sales Results",
      score: Math.round(salesScore * weights.sales / 100),
      max: weights.sales,
      detail: `${dealsWon} deals, $${w.revenue_generated} revenue, ${w.close_rate || 0}% close rate.`,
      sub_items: [
        { label: "Deals Won", value: dealsWon, target: dealTarget * 5, pct: dealPct },
        { label: "Revenue", value: w.revenue_generated, target: targets.weekly_revenue_goal * 5, pct: revenuePct },
        { label: "Close Rate", value: w.close_rate || 0, target: 100, pct: closeRateScore },
      ],
    },
    {
      key: "growth",
      label: "Customer Growth & Quality",
      score: Math.round(growthScore * weights.growth / 100),
      max: weights.growth,
      detail: `${g.repeat_orders} repeat orders, ${g.referrals} referrals, ${g.cancellations} cancellations, ${g.refunds} refunds.`,
      sub_items: [
        { label: "Repeat Rate", value: g.repeat_orders, target: firstOrders, pct: repeatRate },
        { label: "Referrals", value: g.referrals, target: 5, pct: referralScore },
        { label: "Recovery Follow-ups", value: g.customer_success_followups, target: 5, pct: successFollowupScore },
      ],
    },
  ];

  return {
    total: clampScore(total, 100),
    components,
    ramp_stage: rampStage,
    ramp_note: rampNote,
    summary,
    coaching_hints: hints,
  };
}

export function detectWorkMode(callsThisDay: number, fieldVisitsThisDay: number): WorkMode {
  if (fieldVisitsThisDay >= 10 && callsThisDay < 40) return "field";
  if (fieldVisitsThisDay >= 3 && callsThisDay >= 30) return "hybrid";
  return "remote";
}

export function workModeLabel(mode: WorkMode): string {
  switch (mode) {
    case "remote": return "Remote Prospecting";
    case "hybrid": return "Hybrid Sales";
    case "field": return "Field / Outside Sales";
  }
}