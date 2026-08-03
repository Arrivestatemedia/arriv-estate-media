import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Briefcase, CircleAlert, Users, Clock, Send, Flame, UserCheck } from "lucide-react";

const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.6)";
const MUTED_DARK_40 = "rgba(26,26,26,0.4)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const whiteCard = {
  backgroundColor: "#FFFFFF",
  border: "1px solid rgba(184,149,106,0.15)",
  borderRadius: "0.75rem",
};

// StatCard matching central app's design — colored icon background + value + label
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="p-3 rounded-xl flex flex-col items-center text-center gap-1" style={whiteCard}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: color.bg }}>
        <Icon className="w-4 h-4" style={{ color: color.text }} />
      </div>
      <p className="text-xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>{value}</p>
      <p className="text-[10px] leading-tight" style={{ color: MUTED_DARK }}>{label}</p>
    </div>
  );
}

const STATUS_COLORS = {
  not_started: { bg: "rgba(184,149,106,0.1)", text: GOLD },
  active: { bg: GOLD, text: "#1A1A1A" },
  paused: { bg: "rgba(26,26,26,0.08)", text: MUTED_DARK },
};
const STATUS_LABELS = {
  not_started: "Not Started",
  active: "Active",
  paused: "Paused",
};

export default function RecruitingAssistantHome({ onStartSearch, onRecruitForJob }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [jobsRes, prospectsRes, tasksRes] = await Promise.all([
          base44.entities.HireJob.list("-created_date", 50),
          base44.entities.RecruitingProspect.list("-created_date", 500),
          base44.entities.RecruitingTask.filter({ status: "pending" }, "-created_date", 100),
        ]);
        const jobs = jobsRes?.data ?? jobsRes ?? [];
        const prospects = prospectsRes?.data ?? prospectsRes ?? [];
        const tasks = tasksRes?.data ?? tasksRes ?? [];

        const openJobs = jobs.filter(j => j.status === "open");
        const jobsWithProspects = openJobs.filter(j => {
          const jobProspects = prospects.filter(p => p.job_id === j.id);
          return jobProspects.length > 0;
        });
        const newProspects = prospects.filter(p => p.status === "new").length;
        const awaitingReview = prospects.filter(p => p.status === "saved" || p.status === "approved").length;
        const outreachApproved = prospects.filter(p => p.outreach_status === "approved").length;
        const followUpsDue = tasks.filter(t => t.status === "pending").length;
        const warm = prospects.filter(p => p.status === "responded" || p.status === "contacted").length;
        const converted = prospects.filter(p => p.status === "converted").length;

        // Build job stats
        const jobsWithStats = openJobs.map(j => {
          const jobProspects = prospects.filter(p => p.job_id === j.id);
          return {
            ...j,
            prospects_identified: jobProspects.length,
            prospects_contacted: jobProspects.filter(p => p.outreach_status === "sent" || p.status === "contacted").length,
            interested: jobProspects.filter(p => p.status === "responded" || p.status === "converted").length,
            recruiting_status: jobProspects.length > 0 ? "active" : "not_started",
          };
        });

        setData({
          stats: {
            open_jobs: openJobs.length,
            jobs_no_prospects: openJobs.length - jobsWithProspects.length,
            new_prospects: newProspects,
            awaiting_review: awaitingReview,
            outreach_approved: outreachApproved,
            follow_ups_due: followUpsDue,
            warm,
            converted,
          },
          jobs: jobsWithStats,
        });
      } catch (e) {
        setData(null);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;
  if (!data) return <p className="text-sm text-center py-8" style={{ color: MUTED_DARK_40 }}>Unable to load recruiting dashboard.</p>;

  const { stats, jobs } = data;

  const statCards = [
    { icon: Briefcase, label: "Open Jobs", value: stats.open_jobs, color: { bg: "rgba(184,149,106,0.1)", text: GOLD } },
    { icon: CircleAlert, label: "No Prospects", value: stats.jobs_no_prospects, color: { bg: "rgba(251,191,36,0.1)", text: "#d97706" } },
    { icon: Users, label: "New Prospects", value: stats.new_prospects, color: { bg: "#FFFBF5", text: MUTED_DARK } },
    { icon: Clock, label: "Awaiting Review", value: stats.awaiting_review, color: { bg: "rgba(251,191,36,0.1)", text: "#d97706" } },
    { icon: Send, label: "Outreach Approved", value: stats.outreach_approved, color: { bg: "rgba(147,51,234,0.1)", text: "#7c3aed" } },
    { icon: Clock, label: "Follow-Ups Due", value: stats.follow_ups_due, color: { bg: "rgba(220,38,38,0.1)", text: "#dc2626" } },
    { icon: Flame, label: "Warm Prospects", value: stats.warm, color: { bg: "rgba(249,115,22,0.1)", text: "#ea580c" } },
    { icon: UserCheck, label: "Converted", value: stats.converted, color: { bg: "rgba(184,149,106,0.1)", text: GOLD } },
  ];

  return (
    <div className="space-y-5">
      {/* Stats grid — matches central app's 8-card layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {statCards.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {/* Open Jobs Needing Candidates — matches central app */}
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ ...SERIF, color: TEXT_DARK }}>Open Jobs Needing Candidates</h2>
        {jobs.length === 0 ? (
          <div className="p-8 text-center" style={whiteCard}>
            <Briefcase className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
            <p className="text-sm mb-3" style={{ color: MUTED_DARK }}>No open jobs yet. Create a job and Khetha IQ will recruit for it.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const sc = STATUS_COLORS[job.recruiting_status] || STATUS_COLORS.not_started;
              return (
                <div key={job.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3" style={whiteCard}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate" style={{ ...SERIF, color: TEXT_DARK }}>{job.title}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        {STATUS_LABELS[job.recruiting_status] || "Not Started"}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: MUTED_DARK }}>{job.department || "No department"}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs" style={{ color: MUTED_DARK }}>
                    <span>{job.prospects_identified} prospects</span>
                    <span>{job.prospects_contacted} contacted</span>
                    <span style={{ color: GOLD }}>{job.interested} interested</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => (onRecruitForJob || onStartSearch)?.(job)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ backgroundColor: GOLD, color: "#1A1A1A" }}
                    >
                      Recruit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}