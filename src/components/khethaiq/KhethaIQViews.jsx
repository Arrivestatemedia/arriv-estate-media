import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Users, Video, FileText, Search, Briefcase, ExternalLink, ClipboardList, UserX, Play, FileAudio } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import ConvertToAiButton from "@/components/interviews/ConvertToAiButton";
import ConvertToHumanButton from "@/components/interviews/ConvertToHumanButton";
// Questionnaire now opens in-page via onOpenQuestionnaire (no modal)

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

  const filtered = candidates.filter(c => !c.archived && c.status !== "declined" && (!search || (c.name || "").toLowerCase().includes(search.toLowerCase())));

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
export function InterviewsView({ onSelectCandidate, onOpenQuestionnaire }) {
  const { toast } = useToast();
  const [interviews, setInterviews] = useState([]);
  const [conferences, setConferences] = useState([]);
  const [recordingsByRoom, setRecordingsByRoom] = useState({});
  const [loading, setLoading] = useState(true);
  const [disqualifyingId, setDisqualifyingId] = useState(null);
  const [loadingRecRoom, setLoadingRecRoom] = useState(null);
  const [generatingScorecardId, setGeneratingScorecardId] = useState(null);
  const [view, setView] = useState("active"); // "active" | "archived"

  // A conference is "archived" (past) if its scheduled date/time is before now.
  const isConfPast = (c) => {
    const date = c.scheduled_date || "";
    const time = c.scheduled_time || "00:00";
    if (!date) return false;
    const dt = new Date(`${date}T${time}:00`);
    return dt < new Date();
  };
  // A HireInterview is "archived" if its interview_date is before today.
  const isInterviewPast = (iv) => {
    const date = iv.interview_date || "";
    if (!date) return false;
    return new Date(date) < new Date(new Date().toDateString());
  };

  const loadInterviews = async () => {
    try {
      const [ivRes, confRes, candRes, recRes] = await Promise.all([
        base44.entities.HireInterview.list("-interview_date", 200),
        base44.entities.Conference.list("-scheduled_date", 200),
        base44.entities.HireCandidate.list("-created_date", 200),
        base44.entities.VideoRecording.list("-created_date", 200),
      ]);
      const allCandidates = candRes?.data ?? candRes ?? [];
      const archivedIds = new Set(allCandidates.filter(c => c.archived || c.status === "declined").map(c => c.id));
      // Hide interviews belonging to archived (declined) candidates
      setInterviews((ivRes?.data ?? ivRes ?? []).filter(iv => !iv.candidate_id || !archivedIds.has(iv.candidate_id)));
      setConferences(confRes?.data ?? confRes ?? []);
      // Build room_name -> recording map (recordings live in VideoRecording, not on the conference)
      const recs = recRes?.data ?? recRes ?? [];
      const byRoom = {};
      recs.forEach(r => { if (r.room_name && r.file_url) byRoom[r.room_name] = r; });
      setRecordingsByRoom(byRoom);
    } catch { setInterviews([]); setConferences([]); }
  };

  useEffect(() => {
    (async () => {
      await loadInterviews();
      setLoading(false);
    })();
  }, []);

  const handleDisqualify = async (conference) => {
    const applicantName = conference?.participants?.[0]?.name || "this applicant";
    if (!window.confirm(`Disqualify ${applicantName} for missing their interview? The same notice used for "offer not extended" will be emailed to them at 9:00 AM ET, 48 hours from now.`)) return;
    setDisqualifyingId(conference.id);
    try {
      const res = await base44.functions.invoke("disqualifyMissedInterview", { conferenceId: conference.id });
      if (res?.error) throw new Error(res.error);
      toast({ title: "Applicant disqualified", description: `${applicantName} marked "offer not extended". Notice scheduled for 9:00 AM ET, 48 hours from now.` });
      await loadInterviews();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to disqualify", description: err.message || "Unknown error" });
    } finally {
      setDisqualifyingId(null);
    }
  };

  const handlePlayRecording = async (recording) => {
    const fileUrl = recording?.file_url || "";
    // S3 recordings (Tavus server-side) need a fresh presigned URL
    if (fileUrl.startsWith("s3://")) {
      setLoadingRecRoom(recording.room_name || fileUrl);
      try {
        const res = await base44.functions.invoke("getTavusRecordingUrl", { storageUri: fileUrl });
        const url = res?.url || res?.data?.url;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        else toast({ variant: "destructive", title: "Recording unavailable", description: "Could not generate a playback URL." });
      } catch (err) {
        toast({ variant: "destructive", title: "Recording unavailable", description: err.message || "Unknown error" });
      } finally {
        setLoadingRecRoom(null);
      }
    } else {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleGenerateScorecard = async (conference) => {
    setGeneratingScorecardId(conference.id);
    try {
      const res = await base44.functions.invoke("parseRecordingToScorecard", { conferenceId: conference.id });
      if (res?.error) throw new Error(res.error);
      if (res.saved) {
        toast({ title: "Scorecard generated", description: `Auto-scorecard saved (score: ${Math.round(res.total_score)}/100). ${res.all_answered ? "All questions answered." : "Some questions were not answered."}` });
      } else if (res.review_required) {
        toast({ title: "Scorecard needs review", description: `Confidence: ${Math.round(res.confidence * 100)}%. The scorecard was saved but requires human review.`, variant: "default" });
      }
      await loadInterviews();
    } catch (err) {
      toast({ variant: "destructive", title: "Scorecard generation failed", description: err.message || "Unknown error" });
    } finally {
      setGeneratingScorecardId(null);
    }
  };

  const formatConfWhen = (c) => {
    const date = c.scheduled_date || "";
    const time = c.scheduled_time || "";
    if (!date) return "";
    try {
      const dt = new Date(`${date}T${time || "00:00"}:00`);
      return dt.toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
    } catch { return `${date} ${time}`; }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: "rgba(184,149,106,0.4)" }} /></div>;

  const activeConfs = conferences.filter(c => !isConfPast(c));
  const archivedConfs = conferences.filter(c => isConfPast(c));
  const activeIvs = interviews.filter(iv => !isInterviewPast(iv));
  const archivedIvs = interviews.filter(iv => isInterviewPast(iv));

  const activeCount = activeConfs.length + activeIvs.length;
  const archivedCount = archivedConfs.length + archivedIvs.length;
  const visibleConfs = view === "active" ? activeConfs : archivedConfs;
  const visibleIvs = view === "active" ? activeIvs : archivedIvs;
  const hasVisible = visibleConfs.length > 0 || visibleIvs.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ ...SERIF, color: TEXT_DARK }}>Interviews</h1>
        <p className="text-sm mt-1" style={{ color: MUTED_DARK }}>All interviews across your hiring pipeline</p>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: "rgba(184,149,106,0.08)" }}>
        <button
          onClick={() => setView("active")}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={view === "active"
            ? { backgroundColor: "#FFFFFF", color: TEXT_DARK, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
            : { color: MUTED_DARK_70 }}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => setView("archived")}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={view === "archived"
            ? { backgroundColor: "#FFFFFF", color: TEXT_DARK, boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
            : { color: MUTED_DARK_70 }}
        >
          Archived ({archivedCount})
        </button>
      </div>

      {!hasVisible ? (
        <div className="text-center py-12">
          <Video className="w-10 h-10 mx-auto mb-2" style={{ color: "rgba(184,149,106,0.3)" }} />
          <p style={{ color: MUTED_DARK }}>
            {view === "active" ? "No active interviews." : "No archived interviews."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Scheduled conferences (from Interview Scheduler) */}
          {visibleConfs.map(c => {
            const applicantName = c.participants?.[0]?.name || c.title || "Interview";
            const when = formatConfWhen(c);
            const recording = c.room_name ? recordingsByRoom[c.room_name] : null;
            return (
              <div key={`conf-${c.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={whiteCard}>
                <div className="min-w-0">
                  <h3 className="font-semibold" style={{ ...SERIF, color: TEXT_DARK }}>{applicantName}</h3>
                  {when && <p className="text-sm" style={{ color: MUTED_DARK }}>{when}</p>}
                  {c.meeting_link && (
                    <a href={c.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs mt-1 hover:underline" style={{ color: GOLD }}>
                      <ExternalLink className="w-3 h-3" /> Join link
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ConvertToAiButton conference={c} onConverted={loadInterviews} />
                  <ConvertToHumanButton conference={c} onConverted={loadInterviews} />
                  {recording && (
                    <button
                      onClick={() => handlePlayRecording(recording)}
                      disabled={loadingRecRoom === (recording.room_name || recording.file_url)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ backgroundColor: "transparent", color: GOLD, border: "1px solid rgba(184,149,106,0.4)" }}
                    >
                      {loadingRecRoom === (recording.room_name || recording.file_url)
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Play className="w-3.5 h-3.5" />}
                      Recording
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateScorecard(c)}
                    disabled={generatingScorecardId === c.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "transparent", color: GOLD, border: "1px solid rgba(184,149,106,0.4)" }}
                  >
                    {generatingScorecardId === c.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FileAudio className="w-3.5 h-3.5" />}
                    Generate Scorecard
                  </button>
                  <button
                    onClick={() => onOpenQuestionnaire?.(c)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: GOLD, color: "#1A1A1A" }}
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Questionnaire
                  </button>
                  {c.status !== "cancelled" && (
                    <button
                      onClick={() => handleDisqualify(c)}
                      disabled={disqualifyingId === c.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      style={{ backgroundColor: "transparent", color: "#DC2626", border: "1px solid rgba(220,38,38,0.3)" }}
                    >
                      {disqualifyingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                      Disqualify
                    </button>
                  )}
                  {c.tavus_scorecard_saved && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
                      ✓ Scorecard
                    </span>
                  )}
                  {c.tavus_review_required && !c.tavus_scorecard_saved && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ border: "1px solid rgba(184,149,106,0.3)", color: MUTED_DARK_70 }}>
                      Needs Review
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded capitalize" style={{ border: "1px solid rgba(184,149,106,0.2)", color: MUTED_DARK_70 }}>
                    {c.status || "scheduled"}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Completed scorecard interviews (HireInterview) */}
          {visibleIvs.map(iv => (
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