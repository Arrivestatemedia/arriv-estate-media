import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Briefcase, Users, Video, FileText, TrendingUp, Clock, CheckCircle, AlertCircle } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const card = {
  backgroundColor: "#1A1A1A",
  border: "1px solid rgba(184,149,106,0.2)",
  borderRadius: "14px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
};

const STATUS_COLORS = {
  applied: { bg: "rgba(184,149,106,0.15)", text: GOLD },
  screening: { bg: "rgba(184,149,106,0.15)", text: GOLD },
  interviewing: { bg: "#B8956A", text: "#1A1A1A" },
  advanced: { bg: "#B8956A", text: "#1A1A1A" },
  offer: { bg: "#A68559", text: CREAM },
  hired: { bg: "#A68559", text: CREAM },
  declined: { bg: "rgba(220,38,38,0.2)", text: "#FCA5A5" },
  hold: { bg: "rgba(255,251,245,0.08)", text: MUTED_LIGHT },
};

export default function DashboardView({ onSelectJob, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [recentCandidates, setRecentCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [jobsRes, candRes, ivRes] = await Promise.all([
          base44.entities.HireJob.list("-created_date", 50),
          base44.entities.HireCandidate.list("-created_date", 100),
          base44.entities.HireInterview.list("-created_date", 50),
        ]);
        const jobs = jobsRes?.data ?? jobsRes ?? [];
        const candidates = candRes?.data ?? candRes ?? [];
        const interviews = ivRes?.data ?? ivRes ?? [];

        const openJobs = jobs.filter(j => j.status === "open").length;
        const totalCandidates = candidates.length;
        const interviewing = candidates.filter(c => c.status === "interviewing" || c.status === "advanced").length;
        const offers = candidates.filter(c => c.status === "offer").length;
        const hired = candidates.filter(c => c.status === "hired").length;
        const scheduledInterviews = interviews.filter(i => i.status === "scheduled").length;

        setStats({ openJobs, totalCandidates, interviewing, offers, hired, scheduledInterviews, totalJobs: jobs.length });
        setRecentJobs(jobs.slice(0, 4));
        setRecentCandidates(candidates.slice(0, 5));
      } catch (e) {
        setStats({ openJobs: 0, totalCandidates: 0, interviewing: 0, offers: 0, hired: 0, scheduledInterviews: 0, totalJobs: 0 });
      }
      setLoading(false);
    })();
  }, []);

  if (loading || !stats) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;
  }

  const metrics = [
    { label: "Open Jobs", value: stats.openJobs, icon: Briefcase, color: GOLD },
    { label: "Total Candidates", value: stats.totalCandidates, icon: Users, color: GOLD },
    { label: "Interviewing", value: stats.interviewing, icon: Video, color: GOLD },
    { label: "Offers Extended", value: stats.offers, icon: FileText, color: GOLD },
    { label: "Hired", value: stats.hired, icon: CheckCircle, color: GOLD },
    { label: "Scheduled Interviews", value: stats.scheduledInterviews, icon: Clock, color: GOLD },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Hiring overview and key metrics</p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={i} className="p-4" style={card}>
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-5 h-5" style={{ color: m.color }} />
              </div>
              <p className="text-2xl font-bold" style={{ ...SERIF, color: CREAM }}>{m.value}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>{m.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>Recent Jobs</h2>
            <button onClick={() => onNavigate?.("jobs")} className="text-sm" style={{ color: GOLD }}>View all →</button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="p-6 text-center" style={card}>
              <Briefcase className="w-8 h-8 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>No jobs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentJobs.map(job => {
                const ss = STATUS_COLORS[job.status] || STATUS_COLORS.applied;
                return (
                  <div key={job.id} onClick={() => onSelectJob?.(job)} className="p-3 cursor-pointer transition-all hover:translate-y-[-1px]" style={card}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm" style={{ ...SERIF, color: CREAM }}>{job.title || "Untitled"}</h3>
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: ss.bg, color: ss.text }}>{job.status}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: MUTED_LIGHT }}>{job.department || "No department"}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Candidates */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>Recent Candidates</h2>
            <button onClick={() => onNavigate?.("candidates")} className="text-sm" style={{ color: GOLD }}>View all →</button>
          </div>
          {recentCandidates.length === 0 ? (
            <div className="p-6 text-center" style={card}>
              <Users className="w-8 h-8 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>No candidates yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCandidates.map(c => {
                const ss = STATUS_COLORS[c.status] || STATUS_COLORS.applied;
                return (
                  <div key={c.id} className="p-3 flex items-center justify-between" style={card}>
                    <div>
                      <h3 className="font-medium text-sm" style={{ ...SERIF, color: CREAM }}>{c.name || "—"}</h3>
                      <p className="text-xs mt-0.5" style={{ color: MUTED_LIGHT }}>{c.target_role?.replace(/_/g, " ") || "—"}</p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ backgroundColor: ss.bg, color: ss.text }}>{c.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}