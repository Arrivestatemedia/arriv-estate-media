import React, { useState, useEffect } from "react";
import { Users, Search, Briefcase, Layers, CheckSquare, TrendingUp, ArrowRight } from "lucide-react";
import { getAssistantHome } from "@/lib/recruitingApi";

export default function RecruitingAssistantHome({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAssistantHome()
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-[#B8956A]/20 border-t-[#B8956A] rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-[#1A1A1A]/50">
        Failed to load dashboard
      </div>
    );
  }

  const { stats, recent_searches, open_jobs, active_pipelines, pending_tasks } = data;

  const statCards = [
    { label: "Total Prospects", value: stats.total_prospects, icon: Users, color: "#B8956A" },
    { label: "New", value: stats.new, icon: Users, color: "#D4A574" },
    { label: "Saved", value: stats.saved, icon: Users, color: "#C9A87B" },
    { label: "Approved", value: stats.approved, icon: Users, color: "#B8956A" },
    { label: "Contacted", value: stats.contacted, icon: Users, color: "#A68559" },
    { label: "Converted", value: stats.converted, icon: TrendingUp, color: "#8B6F47" },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#FFFBF5] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Recruiting Dashboard</h1>
          <p className="text-sm text-[#1A1A1A]/60 mt-1">Overview of your talent pipeline and recruiting activity</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {statCards.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-xl border border-[#B8956A]/20 p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-4 h-4" style={{ color: s.color }} />
                </div>
                <p className="text-2xl font-bold text-[#1A1A1A]">{s.value}</p>
                <p className="text-xs text-[#1A1A1A]/60 mt-0.5">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate?.("chat")}
            className="bg-[#1A1A1A] rounded-xl p-5 text-left hover:bg-[#2A3536] transition-colors group"
          >
            <Search className="w-6 h-6 text-[#B8956A] mb-3" />
            <h3 className="font-semibold text-[#FFFBF5] mb-1">Start AI Search</h3>
            <p className="text-sm text-[#FFFBF5]/60 flex items-center gap-1">
              Find new candidates <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </p>
          </button>

          <button
            onClick={() => onNavigate?.("prospects")}
            className="bg-white rounded-xl border border-[#B8956A]/20 p-5 text-left hover:border-[#B8956A]/40 transition-colors group"
          >
            <Users className="w-6 h-6 text-[#B8956A] mb-3" />
            <h3 className="font-semibold text-[#1A1A1A] mb-1">Review Prospects</h3>
            <p className="text-sm text-[#1A1A1A]/60 flex items-center gap-1">
              {stats.new} new to review <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
            </p>
          </button>
        </div>

        {/* Open jobs */}
        {open_jobs && open_jobs.length > 0 && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A]">Open Jobs</h3>
            </div>
            <div className="space-y-2">
              {open_jobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b border-[#B8956A]/10 last:border-0">
                  <div>
                    <p className="font-medium text-[#1A1A1A] text-sm">{job.title}</p>
                    {job.department && <p className="text-xs text-[#1A1A1A]/50">{job.department}</p>}
                  </div>
                  <button
                    onClick={() => onNavigate?.("chat")}
                    className="text-xs text-[#B8956A] font-medium hover:underline"
                  >
                    Source →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active pipelines + pending tasks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-5 h-5 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A]">Active Pipelines</h3>
            </div>
            {active_pipelines && active_pipelines.length > 0 ? (
              <div className="space-y-2">
                {active_pipelines.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-[#1A1A1A]">{p.name}</span>
                    <span className="text-xs text-[#1A1A1A]/50">{p.prospect_count || 0} prospects</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#1A1A1A]/50">No active continuous pipelines</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-5 h-5 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A]">Pending Tasks</h3>
            </div>
            {pending_tasks && pending_tasks.length > 0 ? (
              <div className="space-y-2">
                {pending_tasks.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-[#1A1A1A]">{t.prospect_name || t.type}</span>
                    <span className="text-xs text-[#1A1A1A]/50">{t.due_date || "No due date"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#1A1A1A]/50">No pending tasks</p>
            )}
          </div>
        </div>

        {/* Recent searches */}
        {recent_searches && recent_searches.length > 0 && (
          <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-5 h-5 text-[#B8956A]" />
              <h3 className="font-semibold text-[#1A1A1A]">Recent Searches</h3>
            </div>
            <div className="space-y-2">
              {recent_searches.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-[#B8956A]/10 last:border-0">
                  <span className="text-sm text-[#1A1A1A] truncate flex-1">
                    {s.natural_language_query || s.queries?.[0] || s.strategy}
                  </span>
                  <span className="text-xs text-[#B8956A] font-medium ml-2 shrink-0">
                    {s.results_count} results
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}