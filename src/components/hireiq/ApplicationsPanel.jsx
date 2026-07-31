import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Search, FileText } from "lucide-react";
import { APPLICATION_STATUSES, SALES_STATUSES, POSITION_LABELS, getStatusLabel } from "@/lib/applicationStatus";

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

const innerBg = "#2A2A2A";

export default function ApplicationsPanel() {
  const [applications, setApplications] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      base44.entities.JobApplication.list("-created_date", 200),
      base44.entities.HireJob.list("-created_date", 100),
    ]).then(([appsRes, jobsRes]) => {
      const appsList = appsRes?.data ?? appsRes;
      const jobsList = jobsRes?.data ?? jobsRes;
      setApplications(Array.isArray(appsList) ? appsList : []);
      setJobs(Array.isArray(jobsList) ? jobsList : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const jobTitleFor = (app) => {
    if (app.job_id) {
      const job = jobs.find(j => j.id === app.job_id);
      return job?.title || "Unknown Job";
    }
    return POSITION_LABELS[app.position] || app.position || "Media Specialist";
  };

  const allStatuses = [...APPLICATION_STATUSES, ...SALES_STATUSES];
  const uniqueStatuses = [...new Map(allStatuses.map(s => [s.value, s])).values()];

  const filtered = applications.filter(a => {
    if (a.archived) return false;
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (sourceFilter === "hireiq" && !a.job_id) return false;
    if (sourceFilter === "legacy" && a.job_id) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return a.full_name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q);
  });

  const updateStatus = async (id, status) => {
    await base44.entities.JobApplication.update(id, { status });
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED_DARK }} />
          <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }}>
          <option value="all">All Statuses</option>
          {uniqueStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="rounded-lg px-3 py-2.5 text-sm" style={{ backgroundColor: "#FFFFFF", border: "1px solid rgba(184,149,106,0.2)", color: TEXT_DARK }}>
          <option value="all">All Sources</option>
          <option value="hireiq">HireIQ Jobs</option>
          <option value="legacy">Legacy Positions</option>
        </select>
      </div>

      <p className="text-sm" style={{ color: MUTED_DARK }}>{filtered.length} application{filtered.length !== 1 ? "s" : ""}</p>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="font-medium" style={{ color: TEXT_DARK }}>No applications found</p>
          <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Share a job's application link to start receiving applications.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(app => (
            <div key={app.id} className="p-4" style={card}>
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h3 className="font-bold" style={{ ...SERIF, color: CREAM }}>{app.full_name}</h3>
                  <p className="text-sm mt-0.5" style={{ color: MUTED_LIGHT }}>{app.email} · {app.phone}</p>
                  <p className="text-xs mt-1" style={{ color: GOLD }}>{jobTitleFor(app)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded font-medium" style={{ backgroundColor: innerBg, color: CREAM }}>{getStatusLabel(app.status)}</span>
                  <select value={app.status || "received"} onChange={e => updateStatus(app.id, e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs" style={{ borderColor: "rgba(184,149,106,0.2)", backgroundColor: innerBg, color: CREAM }}>
                    {uniqueStatuses.map(s => <option key={s.value} value={s.value} style={{ color: "#1A1A1A" }}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}