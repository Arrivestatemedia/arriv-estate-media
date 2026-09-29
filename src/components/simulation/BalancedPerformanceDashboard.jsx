import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { TrendingUp, AlertTriangle, Activity, Users, Building2, ChevronDown, ChevronUp, Shield } from "lucide-react";

// Balanced Performance Dashboard — shows Sales Motion Mix, B2B Funnel,
// Anti-Gaming Flags, and Coaching Health for balanced individual + B2B performance.
// Extends the existing SalesPerformanceDashboard with B2B-aware metrics.

export default function BalancedPerformanceDashboard({ salesMemberId, isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [expandedSections, setExpandedSections] = useState({ motion_mix: true, b2b_funnel: true, flags: true, coaching: true });

  const loadData = useCallback(async () => {
    if (!salesMemberId) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("getBalancedPerformanceDashboard", {
        sales_member_id: salesMemberId,
      });
      setDashboardData(res?.data || res);
    } catch (e) {
      console.error("Failed to load balanced performance:", e);
    } finally {
      setLoading(false);
    }
  }, [salesMemberId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" /></div>;
  }

  if (!dashboardData) {
    return <div className="text-center py-12 text-[#1A1A1A]/40 text-sm">No balanced performance data available.</div>;
  }

  const { motion_mix_4wk, motion_mix_latest, b2b_funnel, anti_gaming_flags, coaching_health, prospecting_opportunity, raw_outbound_4wk } = dashboardData;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-serif text-[#1A1A1A] flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#B8956A]" /> Balanced Performance Dashboard
        </h3>
        <button onClick={loadData} className="p-2 rounded-lg hover:bg-[#B8956A]/10 text-[#B8956A]">
          <Activity className="w-4 h-4" />
        </button>
      </div>

      {/* Sales Motion Mix (4-week rolling) */}
      <Section title="Sales Motion Mix (4-Week Rolling)" expanded={expandedSections.motion_mix} onToggle={() => toggleSection("motion_mix")}>
        {motion_mix_4wk?.motions?.length > 0 ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="text-sm text-[#1A1A1A]/60">Balance Score:</div>
              <div className={`text-lg font-bold ${motion_mix_4wk.balance_score >= 60 ? "text-emerald-600" : motion_mix_4wk.balance_score >= 40 ? "text-amber-600" : "text-red-600"}`}>
                {motion_mix_4wk.balance_score}/100
              </div>
            </div>
            <div className="space-y-2">
              {motion_mix_4wk.motions.map(m => (
                <div key={m.key} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: m.color }} />
                  <div className="flex-1 text-sm text-[#1A1A1A]">{m.label}</div>
                  <div className="text-sm font-medium text-[#1A1A1A]/70">{m.pct}%</div>
                  <div className="w-24 h-2 bg-[#1A1A1A]/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-[#1A1A1A]/50">
              Total activity (4wk): {motion_mix_4wk.total_activity} · Raw outbound: {raw_outbound_4wk}
            </div>
          </>
        ) : (
          <p className="text-sm text-[#1A1A1A]/40">No motion mix data yet.</p>
        )}
      </Section>

      {/* B2B Funnel */}
      <Section title="B2B Funnel" expanded={expandedSections.b2b_funnel} onToggle={() => toggleSection("b2b_funnel")}>
        {b2b_funnel?.stages?.length > 0 ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-[#B8956A]" />
              <div className="text-sm text-[#1A1A1A]/60">Overall Conversion:</div>
              <div className="text-lg font-bold text-[#B8956A]">{b2b_funnel.overall_conversion}%</div>
            </div>
            <div className="space-y-1.5">
              {b2b_funnel.stages.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <div className="w-6 text-xs text-[#1A1A1A]/40">{i + 1}</div>
                  <div className="flex-1 text-sm text-[#1A1A1A]">{s.label}</div>
                  <div className="text-sm font-bold text-[#1A1A1A]">{s.count}</div>
                  {i > 0 && <div className="text-xs text-[#1A1A1A]/40">{s.conversion_pct}%</div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-[#1A1A1A]/40">No B2B funnel data yet.</p>
        )}
      </Section>

      {/* Anti-Gaming Flags */}
      <Section title={`Anti-Gaming Flags (${anti_gaming_flags?.filter(f => f.triggered).length || 0} active)`} expanded={expandedSections.flags} onToggle={() => toggleSection("flags")}>
        {anti_gaming_flags?.length > 0 ? (
          <div className="space-y-2">
            {anti_gaming_flags.map(f => (
              <div key={f.key} className={`p-2.5 rounded-lg border ${f.triggered ? (f.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50") : "border-[#1A1A1A]/10 bg-[#1A1A1A]/5"}`}>
                <div className="flex items-center gap-2">
                  {f.triggered ? <AlertTriangle className={`w-4 h-4 ${f.severity === "critical" ? "text-red-500" : "text-amber-500"}`} /> : <Shield className="w-4 h-4 text-emerald-500" />}
                  <span className={`text-sm font-medium ${f.triggered ? "text-[#1A1A1A]" : "text-[#1A1A1A]/40"}`}>{f.label}</span>
                </div>
                {f.triggered && f.evidence && <p className="text-xs text-[#1A1A1A]/60 mt-1 ml-6">{f.evidence}</p>}
                <p className="text-xs text-[#1A1A1A]/50 mt-1 ml-6">{f.description}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#1A1A1A]/40">No anti-gaming flags configured.</p>
        )}
      </Section>

      {/* Coaching Health */}
      <Section title="Coaching Health Score" expanded={expandedSections.coaching} onToggle={() => toggleSection("coaching")}>
        {coaching_health?.components?.length > 0 ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="text-sm text-[#1A1A1A]/60">Coaching Health:</div>
              <div className={`text-2xl font-bold ${coaching_health.total >= 75 ? "text-emerald-600" : coaching_health.total >= 50 ? "text-amber-600" : "text-red-600"}`}>
                {coaching_health.total}/100
              </div>
            </div>
            <div className="space-y-2">
              {coaching_health.components.map(c => (
                <div key={c.key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-sm text-[#1A1A1A]">{c.label}</div>
                    <div className="text-xs text-[#1A1A1A]/50">{c.detail}</div>
                  </div>
                  <div className="text-sm font-bold text-[#1A1A1A]">{c.score}/{c.max}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#1A1A1A]/50 mt-3">{coaching_health.summary}</p>
          </>
        ) : (
          <p className="text-sm text-[#1A1A1A]/40">No coaching health data yet.</p>
        )}
      </Section>

      {/* Prospecting Opportunity Time */}
      {prospecting_opportunity && (
        <div className="p-3 rounded-lg border border-[#B8956A]/20 bg-[#FFFBF5]">
          <h4 className="text-sm font-medium text-[#1A1A1A] mb-2">Prospecting Opportunity Time</h4>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-[#1A1A1A]/60">Available: </span>
              <span className="font-bold text-[#1A1A1A]">{prospecting_opportunity.available_hours}h</span>
              <span className="text-[#1A1A1A]/40"> / {prospecting_opportunity.raw_hours}h</span>
            </div>
            <div>
              <span className="text-[#1A1A1A]/60">Reductions: </span>
              <span className="font-bold text-amber-600">{prospecting_opportunity.reduction_hours}h</span>
            </div>
          </div>
          {prospecting_opportunity.reductions?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {prospecting_opportunity.reductions.map((r, i) => (
                <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {r.label}: {r.hours}h
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, expanded, onToggle, children }) {
  return (
    <div className="border border-[#B8956A]/20 rounded-lg overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between p-3 bg-white hover:bg-[#B8956A]/5">
        <span className="text-sm font-medium text-[#1A1A1A]">{title}</span>
        {expanded ? <ChevronUp className="w-4 h-4 text-[#1A1A1A]/40" /> : <ChevronDown className="w-4 h-4 text-[#1A1A1A]/40" />}
      </button>
      {expanded && <div className="p-3 bg-white border-t border-[#B8956A]/10">{children}</div>}
    </div>
  );
}