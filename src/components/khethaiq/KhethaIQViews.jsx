import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Users, Video, FileText, Search, Mail, Phone, Calendar, MapPin, Briefcase, Filter } from "lucide-react";

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

const STATUS_OPTIONS = ["all", "applied", "screening", "interviewing", "advanced", "offer", "hired", "declined", "hold"];

function StatusBadge({ status }) {
  const ss = STATUS_COLORS[status] || STATUS_COLORS.applied;
  return <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ backgroundColor: ss.bg, color: ss.text }}>{status}</span>;
}

// ─── Candidates View ───
export function CandidatesView({ onSelectCandidate }) {
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const [candRes, jobsRes] = await Promise.all([
          base44.entities.HireCandidate.list("-created_date", 200),
          base44.entities.HireJob.list("-created_date", 50),
        ]);
        setCandidates(candRes?.data ?? candRes ?? []);
        setJobs(jobsRes?.data ?? jobsRes ?? []);
      } catch { setCandidates([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const jobMap = {};
  jobs.forEach(j => { jobMap[j.id] = j; });

  const filtered = candidates.filter(c => {
    const matchesSearch = !search || (c.name || "").toLowerCase().includes(search.toLowerCase()) || (c.email || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Candidates</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>{filtered.length} of {candidates.length} candidates across your hiring pipeline</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED_DARK }} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none"
            style={{ border: "1px solid rgba(184,149,106,0.2)", backgroundColor: "#FFFFFF", color: TEXT_DARK }}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          <Filter className="w-4 h-4 shrink-0" style={{ color: MUTED_DARK }} />
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap capitalize transition-colors"
              style={{
                backgroundColor: statusFilter === s ? GOLD : "#FFFFFF",
                color: statusFilter === s ? "#1A1A1A" : MUTED_DARK,
                border: "1px solid rgba(184,149,106,0.2)",
                fontWeight: statusFilter === s ? 600 : 400,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No candidates match your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => {
            const job = c.job_id ? jobMap[c.job_id] : null;
            return (
              <div
                key={c.id}
                onClick={() => onSelectCandidate?.(c)}
                className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                style={card}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{c.name || "—"}</h3>
                  <StatusBadge status={c.status} />
                </div>
                <div className="space-y-1">
                  {c.target_role && (
                    <p className="text-sm capitalize" style={{ color: GOLD }}>{c.target_role.replace(/_/g, " ")}</p>
                  )}
                  {job && (
                    <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}>
                      <Briefcase className="w-3 h-3" /> {job.title}
                    </p>
                  )}
                  {c.email && (
                    <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}>
                      <Mail className="w-3 h-3" /> {c.email}
                    </p>
                  )}
                  {c.source && c.source !== "company_career_page" && (
                    <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}>
                      <MapPin className="w-3 h-3" /> Source: {c.source.replace(/_/g, " ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Interviews View ───
export function InterviewsView({ onSelectCandidate }) {
  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    (async () => {
      try {
        const [ivRes, candRes, jobsRes] = await Promise.all([
          base44.entities.HireInterview.list("-interview_date", 200),
          base44.entities.HireCandidate.list("-created_date", 200),
          base44.entities.HireJob.list("-created_date", 50),
        ]);
        setInterviews(ivRes?.data ?? ivRes ?? []);
        setCandidates(candRes?.data ?? candRes ?? []);
        setJobs(jobsRes?.data ?? jobsRes ?? []);
      } catch { setInterviews([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const candMap = {};
  candidates.forEach(c => { candMap[c.id] = c; });
  const jobMap = {};
  jobs.forEach(j => { jobMap[j.id] = j; });

  const filtered = interviews.filter(iv => statusFilter === "all" || iv.status === statusFilter);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Interviews</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>{filtered.length} interviews across your hiring pipeline</p>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {["all", "scheduled", "in_progress", "completed"].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="text-xs px-3 py-1.5 rounded-full whitespace-nowrap capitalize transition-colors"
            style={{
              backgroundColor: statusFilter === s ? GOLD : "#FFFFFF",
              color: statusFilter === s ? "#1A1A1A" : MUTED_DARK,
              border: "1px solid rgba(184,149,106,0.2)",
              fontWeight: statusFilter === s ? 600 : 400,
            }}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Video className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No interviews scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(iv => {
            const candidate = iv.candidate_id ? candMap[iv.candidate_id] : null;
            const job = iv.job_id ? jobMap[iv.job_id] : null;
            return (
              <div
                key={iv.id}
                className={`p-4 flex items-center justify-between ${candidate ? "cursor-pointer hover:translate-y-[-1px] transition-all" : ""}`}
                style={card}
                onClick={() => candidate && onSelectCandidate?.(candidate)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
                    <Video className="w-5 h-5" style={{ color: GOLD }} />
                  </div>
                  <div>
                    <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{candidate?.name || iv.interviewer_name || "Interview"}</h3>
                    <div className="flex items-center gap-3 text-xs mt-1" style={{ color: MUTED_LIGHT }}>
                      {iv.interview_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {iv.interview_date}</span>}
                      {job && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {job.title}</span>}
                      {iv.interview_type && <span className="capitalize">{iv.interview_type}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {iv.overall_score != null && iv.overall_score > 0 && (
                    <span className="text-sm font-semibold" style={{ color: GOLD }}>{Math.round(iv.overall_score)}/100</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded capitalize" style={{
                    backgroundColor: iv.status === "completed" ? "rgba(184,149,106,0.15)" : iv.status === "in_progress" ? "#B8956A" : "rgba(255,251,245,0.08)",
                    color: iv.status === "completed" ? GOLD : iv.status === "in_progress" ? "#1A1A1A" : MUTED_LIGHT,
                  }}>{iv.status?.replace(/_/g, " ")}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Offers View ───
export function OffersView({ onSelectCandidate }) {
  const [candidates, setCandidates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [candRes, jobsRes] = await Promise.all([
          base44.entities.HireCandidate.filter({ status: "offer" }, "-created_date", 100),
          base44.entities.HireJob.list("-created_date", 50),
        ]);
        setCandidates(candRes?.data ?? candRes ?? []);
        setJobs(jobsRes?.data ?? jobsRes ?? []);
      } catch { setCandidates([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const jobMap = {};
  jobs.forEach(j => { jobMap[j.id] = j; });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Offers</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>{candidates.length} candidates with pending offers</p>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No pending offers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {candidates.map(c => {
            const job = c.job_id ? jobMap[c.job_id] : null;
            return (
              <div
                key={c.id}
                onClick={() => onSelectCandidate?.(c)}
                className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
                style={card}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{c.name || "—"}</h3>
                    {c.target_role && <p className="text-sm capitalize mt-0.5" style={{ color: GOLD }}>{c.target_role.replace(/_/g, " ")}</p>}
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>Offer Extended</span>
                </div>
                <div className="space-y-1.5">
                  {job && <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}><Briefcase className="w-3 h-3" /> {job.title}</p>}
                  {c.email && <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}><Mail className="w-3 h-3" /> {c.email}</p>}
                  {c.phone && <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}><Phone className="w-3 h-3" /> {c.phone}</p>}
                  {c.decision && <p className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}>Decision: <span className="capitalize">{c.decision}</span></p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}