import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Users, Video, FileText, Search } from "lucide-react";

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

  const filtered = candidates.filter(c => !search || (c.name || c.full_name || "").toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Candidates</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>All candidates across your hiring pipeline</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED_DARK }} />
        <input
          type="text"
          placeholder="Search candidates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg text-sm focus:outline-none"
          style={{ border: "1px solid rgba(184,149,106,0.2)", backgroundColor: "#FFFFFF", color: TEXT_DARK }}
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
              className="p-4 cursor-pointer transition-all hover:-translate-y-0.5"
              style={card}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{c.name || c.full_name || "—"}</h3>
                <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>{c.status || c.hiring_status || "applied"}</span>
              </div>
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>{c.target_role || "—"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InterviewsView() {
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;

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
            <div key={iv.id} className="p-4 flex items-center justify-between" style={card}>
              <div>
                <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{iv.interviewer_name || "Interview"}</h3>
                <p className="text-sm" style={{ color: MUTED_LIGHT }}>{iv.interview_date || ""}</p>
              </div>
              {iv.overall_score != null && (
                <span className="text-sm" style={{ color: GOLD }}>Score: {Math.round(iv.overall_score)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OffersView() {
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /></div>;

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
            <div key={c.id} className="p-4" style={card}>
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold" style={{ ...SERIF, color: CREAM }}>{c.name || c.full_name || "—"}</h3>
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>Offer Extended</span>
              </div>
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>{c.target_role || "—"}</p>
              {c.email && <p className="text-sm mt-2" style={{ color: MUTED_LIGHT }}>{c.email}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}