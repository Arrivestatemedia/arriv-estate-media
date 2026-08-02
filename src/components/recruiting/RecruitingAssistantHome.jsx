import React, { useState, useEffect } from "react";
import { getAssistantHome } from "@/lib/recruitingApi";
import { Loader2, Users, UserCheck, TrendingUp, Briefcase, ListChecks, Sparkles } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED = "rgba(26,26,26,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
          <Icon className="w-5 h-5" style={{ color: GOLD }} />
        </div>
        <div>
          <p className="text-2xl font-bold" style={{ color: CREAM }}>{value}</p>
          <p className="text-xs" style={{ color: "rgba(255,251,245,0.5)" }}>{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function RecruitingAssistantHome({ onStartSearch, onSelectJob }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAssistantHome().then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;
  if (!data) return <p style={{ color: MUTED }}>Unable to load recruiting dashboard.</p>;

  const { stats, open_jobs, active_pipelines, pending_tasks } = data;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3" style={{ backgroundColor: "rgba(184,149,106,0.1)" }}>
          <Sparkles className="w-4 h-4" style={{ color: GOLD }} />
          <span className="text-sm font-medium" style={{ color: GOLD }}>Recruiting Assistant</span>
        </div>
        <h2 className="text-2xl font-bold mb-1" style={{ ...SERIF, color: TEXT_DARK }}>Your sourcing command center</h2>
        <p className="text-sm" style={{ color: MUTED }}>Search the web for real candidates, manage your talent pipeline, and track outreach.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="Total Prospects" value={stats?.total_prospects || 0} />
        <StatCard icon={UserCheck} label="Approved" value={stats?.approved_prospects || 0} />
        <StatCard icon={TrendingUp} label="Converted" value={stats?.converted_prospects || 0} />
        <StatCard icon={ListChecks} label="Pending Tasks" value={stats?.pending_tasks || 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="p-5 rounded-xl" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
          <h3 className="font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Open Jobs to Recruit For</h3>
          {open_jobs?.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(255,251,245,0.5)" }}>No open jobs. Create a job in the Jobs tab first.</p>
          ) : (
            <div className="space-y-2">
              {open_jobs.map((job) => (
                <button key={job.id} onClick={() => onStartSearch && onStartSearch(job)}
                  className="w-full text-left p-3 rounded-lg transition-colors"
                  style={{ backgroundColor: "rgba(255,251,245,0.05)", border: "1px solid rgba(184,149,106,0.1)" }}>
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4" style={{ color: GOLD }} />
                    <span className="font-medium text-sm" style={{ color: CREAM }}>{job.title}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "rgba(255,251,245,0.4)" }}>{job.department || "General"}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 rounded-xl" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
          <h3 className="font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Active Pipelines</h3>
          {active_pipelines?.length === 0 ? (
            <p className="text-sm" style={{ color: "rgba(255,251,245,0.5)" }}>No active pipelines. Create one in the Pipelines tab.</p>
          ) : (
            <div className="space-y-2">
              {active_pipelines.map((p) => (
                <div key={p.id} className="p-3 rounded-lg" style={{ backgroundColor: "rgba(255,251,245,0.05)", border: "1px solid rgba(184,149,106,0.1)" }}>
                  <span className="font-medium text-sm" style={{ color: CREAM }}>{p.name}</span>
                  <p className="text-xs mt-1" style={{ color: "rgba(255,251,245,0.4)" }}>
                    {(p.target_roles || []).join(", ") || "No target roles"} · {p.prospect_count || 0} prospects
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pending_tasks?.length > 0 && (
        <div className="mt-5 p-5 rounded-xl" style={{ backgroundColor: "#FFFBF5", border: "1px solid rgba(184,149,106,0.3)" }}>
          <h3 className="font-bold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>Pending Tasks</h3>
          <div className="space-y-2">
            {pending_tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.05)" }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: TEXT_DARK }}>{t.title || t.type}</p>
                  {t.due_date && <p className="text-xs" style={{ color: MUTED }}>Due: {t.due_date}</p>}
                </div>
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>{t.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}