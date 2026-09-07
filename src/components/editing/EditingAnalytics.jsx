import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Loader2, TrendingUp, Clock, AlertTriangle, Users, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EDITING_TASK_LABELS } from "@/lib/editingConfig";

export default function EditingAnalytics({ refreshKey }) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke("getEditingAnalytics");
        setAnalytics(res.analytics);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshKey]);

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
      </div>
    );
  }

  if (!analytics) return <Card className="p-8 text-center text-[#1A1A1A]/50">Failed to load analytics.</Card>;

  const a = analytics;

  return (
    <div className="space-y-4">
      {/* Capacity indicator */}
      <Card
        className="p-4 border-l-4"
        style={{
          borderLeftColor:
            a.capacity.indicator === "FIRST_EDITOR_HIRING_THRESHOLD" ? "#ef4444" :
            a.capacity.indicator === "RECRUITMENT_CONSIDERATION" ? "#f97316" :
            a.capacity.indicator === "WATCH" ? "#eab308" :
            "#22c55e",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-[#B8956A]" />
          <h3 className="font-semibold text-[#1A1A1A]">Capacity Indicator</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Metric label="Jobs This Week" value={a.capacity.weekly_job_count} />
          <Metric label="Editing Hours This Week" value={a.capacity.weekly_editing_hours} />
          <Metric label="Active Editors" value={a.capacity.active_editor_count} />
        </div>
        <div className="mt-3">
          <Badge
            className={
              a.capacity.indicator === "FIRST_EDITOR_HIRING_THRESHOLD" ? "bg-red-100 text-red-800" :
              a.capacity.indicator === "RECRUITMENT_CONSIDERATION" ? "bg-orange-100 text-orange-800" :
              a.capacity.indicator === "WATCH" ? "bg-yellow-100 text-yellow-800" :
              "bg-green-100 text-green-800"
            }
          >
            {a.capacity.indicator.replace(/_/g, " ")}
          </Badge>
          {a.capacity.high_utilization_editors?.length > 0 && (
            <p className="text-xs text-orange-600 mt-2">
              ⚠ {a.capacity.high_utilization_editors.length} editor(s) approaching capacity:{" "}
              {a.capacity.high_utilization_editors.map((e) => e.editor_name).join(", ")}
            </p>
          )}
        </div>
      </Card>

      {/* Volume metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Completed Jobs (Week)" value={a.completed_jobs_week} icon={TrendingUp} />
        <MetricCard label="Completed Jobs (Month)" value={a.completed_jobs_month} icon={BarChart3} />
        <MetricCard label="Editing Hours (Week)" value={a.active_editing_hours_week} icon={Clock} />
        <MetricCard label="Editing Hours (Month)" value={a.active_editing_hours_month} icon={Clock} />
      </div>

      {/* Queue health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Ready for Editing" value={a.queue.ready_for_editing} icon={Clock} />
        <MetricCard label="Backlog Hours" value={a.queue.backlog_hours} icon={Clock} />
        <MetricCard label="Oldest Unassigned" value={`${a.queue.oldest_unassigned_age_hours}h`} icon={AlertTriangle} />
        <MetricCard label="Revision Rate" value={`${a.quality.revision_rate}%`} icon={AlertTriangle} />
      </div>

      {/* Quality metrics */}
      <Card className="p-4">
        <h3 className="font-semibold text-[#1A1A1A] mb-3">Quality Metrics</h3>
        <div className="grid grid-cols-3 gap-4">
          <Metric label="First-Pass QC Approval" value={`${a.quality.first_pass_qc_approval_rate}%`} />
          <Metric label="On-Time Completion" value={`${a.quality.on_time_completion_rate}%`} />
          <Metric label="Revision Rate" value={`${a.quality.revision_rate}%`} />
        </div>
      </Card>

      {/* Average editing time by task type */}
      <Card className="p-4">
        <h3 className="font-semibold text-[#1A1A1A] mb-3">Average Editing Time by Task Type</h3>
        <div className="space-y-2">
          {Object.entries(a.avg_minutes_by_task_type).length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/50">No completed tasks yet — averages will appear once data accumulates.</p>
          ) : (
            Object.entries(a.avg_minutes_by_task_type).map(([type, minutes]) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm text-[#1A1A1A]/70">{EDITING_TASK_LABELS[type] || type}</span>
                <span className="text-sm font-medium text-[#1A1A1A]">
                  {minutes > 0 ? `${(minutes / 60).toFixed(1)} hrs` : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Average editing time by package */}
      <Card className="p-4">
        <h3 className="font-semibold text-[#1A1A1A] mb-3">Average Editing Time by Package</h3>
        <div className="space-y-2">
          {Object.entries(a.avg_minutes_by_package).length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/50">No completed tasks yet.</p>
          ) : (
            Object.entries(a.avg_minutes_by_package).map(([pkg, minutes]) => (
              <div key={pkg} className="flex items-center justify-between">
                <span className="text-sm text-[#1A1A1A]/70">{pkg}</span>
                <span className="text-sm font-medium text-[#1A1A1A]">
                  {minutes > 0 ? `${(minutes / 60).toFixed(1)} hrs` : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Editor utilization */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-[#B8956A]" />
          <h3 className="font-semibold text-[#1A1A1A]">Editor Utilization (This Week)</h3>
        </div>
        <div className="space-y-3">
          {a.editor_utilization.length === 0 ? (
            <p className="text-sm text-[#1A1A1A]/50">No active editors.</p>
          ) : (
            a.editor_utilization.map((e) => (
              <div key={e.editor_id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[#1A1A1A]/70">{e.editor_name}</span>
                  <span className="text-sm font-medium text-[#1A1A1A]">
                    {e.weekly_hours}h / {e.max_weekly_hours}h ({e.utilization_pct}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      e.utilization_pct >= 85 ? "bg-orange-500" :
                      e.utilization_pct >= 60 ? "bg-[#B8956A]" :
                      "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(e.utilization_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-[#1A1A1A]/50">{label}</p>
      <p className="text-lg font-bold text-[#1A1A1A]">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-[#B8956A]" />
        <span className="text-xs text-[#1A1A1A]/60">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#1A1A1A]">{value}</p>
    </Card>
  );
}