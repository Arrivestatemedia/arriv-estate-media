import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Users, Video, FileText, Search, Briefcase } from "lucide-react";

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

// ─── Candidates View ─── (exact replica of central app)
export function CandidatesView({ onSelectCandidate }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.HireCandidate.list("-created_date", 200);
        setCandidates(res?.data ?? res ?? []);
      } catch { setCandidates([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = candidates.filter(c => !search || (c.name || "").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Candidates</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>All candidates across your hiring pipeline</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED_DARK_40 }} />
        <input
          type="text"
          placeholder="Search candidates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none"
          style={{ border: "1px solid rgba(184,149,106,0.15)", color: TEXT_DARK }}
          onFocus={e => e.target.style.borderColor = GOLD}
          onBlur={e => e.target.style.borderColor = "rgba(184,149,106,0.15)"}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No candidates yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(c => (
            <div
              key={c.id}
              onClick={() => onSelectCandidate?.(c)}
              className="p-4 cursor-pointer transition-all hover:shadow-md"
              style={whiteCard}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(184,149,106,0.3)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(184,149,106,0.15)"}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{c.name || "—"}</h3>
                <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ border: "1px solid rgba(184,149,106,0.2)", color: MUTED_DARK_70 }}>
                  {c.status || "applied"}
                </span>
              </div>
              <p className="text-sm" style={{ color: MUTED_DARK }}>{c.target_role ? c.target_role.replace(/_/g, " ") : "—"}</p>
              {c.email && <p className="text-xs mt-2" style={{ color: MUTED_DARK_40 }}>{c.email}</p>}
            </div>
          ))}
        </div>
      )}

      <InternalCandidates />
    </div>
  );
}

// ─── Internal Candidates ─── (exact replica of central app)
function InternalCandidates() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.SalesTeamMember.list("-created_date", 50);
        const all = res?.data ?? res ?? [];
        setEmployees(all.filter(e => e.is_active));
      } catch { setEmployees([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>Internal Candidates</h2>
      {employees.length === 0 ? (
        <div className="p-6 text-center" style={whiteCard}>
          <Users className="w-8 h-8 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p className="text-sm" style={{ color: MUTED_DARK }}>No active employees to surface as internal candidates.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {employees.map(e => (
            <div key={e.id} className="p-4" style={whiteCard}>
              <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{e.full_name || e.name || "—"}</h3>
              <p className="text-sm" style={{ color: MUTED_DARK }}>{e.role || "Employee"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Interviews View ─── (exact replica of central app)
export function InterviewsView({ onSelectCandidate }) {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.HireInterview.list("-interview_date", 200);
        setInterviews(res?.data ?? res ?? []);
      } catch { setInterviews([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Interviews</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>All interviews across your hiring pipeline</p>
      </div>

      {interviews.length === 0 ? (
        <div className="text-center py-12">
          <Video className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No interviews scheduled yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {interviews.map(iv => (
            <div key={iv.id} className="p-4 flex items-center justify-between" style={whiteCard}>
              <div>
                <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{iv.interviewer_name || "Interview"}</h3>
                <p className="text-sm" style={{ color: MUTED_DARK }}>{iv.interview_date || ""}</p>
              </div>
              <div className="flex items-center gap-2">
                {iv.overall_score != null && iv.overall_score > 0 && (
                  <span className="text-sm" style={{ color: MUTED_DARK_70 }}>{Math.round(iv.overall_score)}/100</span>
                )}
                <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ border: "1px solid rgba(184,149,106,0.2)", color: MUTED_DARK_70 }}>
                  {iv.status || "scheduled"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Offers View ─── (exact replica of central app)
export function OffersView({ onSelectCandidate }) {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.entities.HireCandidate.filter({ status: "offer" }, "-created_date", 100);
        setCandidates(res?.data ?? res ?? []);
      } catch { setCandidates([]); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Offers</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>Candidates with pending offers</p>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>No pending offers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {candidates.map(c => (
            <div key={c.id} onClick={() => onSelectCandidate?.(c)} className="p-4 cursor-pointer" style={whiteCard}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{c.name || "—"}</h3>
                <span className="text-xs px-2 py-0.5 rounded" style={{ border: "1px solid rgba(184,149,106,0.2)", color: MUTED_DARK_70 }}>Offer Extended</span>
              </div>
              <p className="text-sm" style={{ color: MUTED_DARK }}>{c.target_role ? c.target_role.replace(/_/g, " ") : "—"}</p>
              {c.email && <p className="text-sm mt-2" style={{ color: MUTED_DARK_70 }}>{c.email}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}