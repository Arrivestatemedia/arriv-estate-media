import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Activity, TrendingUp } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";
const MUTED_DARK_40 = "rgba(26,26,26,0.4)";
const MUTED_DARK_70 = "rgba(26,26,26,0.7)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "0.75rem",
};

const ratingLabels = ["—", "Poor", "Below Avg", "Average", "Above Avg", "Excellent"];

export default function PerformanceDataView() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.HirePerformance.list("-created_date", 200);
        setRecords(res?.data ?? res ?? []);
      } catch { setRecords([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;
  }

  const avgRating = records.length > 0
    ? (records.reduce((s, r) => s + (r.performance_rating || 0), 0) / records.length).toFixed(1)
    : "—";
  const avgRetention = records.length > 0
    ? (records.reduce((s, r) => s + (r.retention_months || 0), 0) / records.length).toFixed(1)
    : "—";
  const promotedCount = records.filter(r => r.promoted).length;
  const avgTraining = records.length > 0
    ? Math.round(records.reduce((s, r) => s + (r.training_completion || 0), 0) / records.length)
    : 0;

  const metrics = [
    { label: "Total Records", value: records.length, icon: Activity },
    { label: "Avg Performance", value: `${avgRating}/5`, icon: TrendingUp },
    { label: "Avg Retention", value: `${avgRetention} mo`, icon: Activity },
    { label: "Promoted", value: promotedCount, icon: TrendingUp },
    { label: "Avg Training Completion", value: `${avgTraining}%`, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Performance Data</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Post-hire performance outcomes feeding hiring intelligence</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={i} className="p-4" style={whiteCard}>
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-4 h-4" style={{ color: GOLD }} />
              </div>
              <p className="text-xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>{m.value}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED_DARK }}>{m.label}</p>
            </div>
          );
        })}
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12">
          <Activity className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No performance data recorded yet.</p>
          <p className="text-sm mt-1" style={{ color: MUTED_DARK_40 }}>Performance data is tracked after candidates are hired.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="p-4" style={whiteCard}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{r.candidate_name || "—"}</h3>
                  <p className="text-sm" style={{ color: MUTED_DARK }}>{r.job_title || "—"}</p>
                  {r.hire_date && <p className="text-xs mt-1" style={{ color: MUTED_DARK_40 }}>Hired: {r.hire_date}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.promoted && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>Promoted</span>
                  )}
                  {r.performance_rating != null && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ border: "1px solid rgba(184,149,106,0.2)", color: MUTED_DARK_70 }}>
                      {ratingLabels[r.performance_rating] || r.performance_rating}
                    </span>
                  )}
                </div>
              </div>
              {(r.retention_months != null || r.training_completion != null || r.goal_completion != null) && (
                <div className="flex flex-wrap gap-4 mt-2 text-xs" style={{ color: MUTED_DARK_70 }}>
                  {r.retention_months != null && <span>Retention: {r.retention_months} mo</span>}
                  {r.training_completion != null && <span>Training: {r.training_completion}%</span>}
                  {r.goal_completion != null && <span>Goals: {r.goal_completion}%</span>}
                  {r.attendance_rating != null && <span>Attendance: {r.attendance_rating}/5</span>}
                  {r.customer_satisfaction != null && <span>CSAT: {r.customer_satisfaction}</span>}
                </div>
              )}
              {r.manager_evaluation && (
                <p className="text-sm mt-2" style={{ color: MUTED_DARK_70 }}>{r.manager_evaluation}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}