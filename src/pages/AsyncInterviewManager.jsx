import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Clock, Brain, Video, CheckCircle2, AlertCircle, RefreshCw, ChevronRight, ChevronDown, Film, Play, CalendarClock } from "lucide-react";
import { ROUND1_ALL_QUESTIONS } from "@/lib/round1Questions";
import { FORMAT_LABELS } from "@/lib/asyncInterviewConfig";
import ScheduledInterviewMigration from "@/components/interviews/ScheduledInterviewMigration";

const isS3 = (url) => typeof url === "string" && url.startsWith("s3://");

async function resolveTavusUrl(storageUri) {
  if (!isS3(storageUri)) return storageUri;
  const res = await base44.functions.invoke("getTavusRecordingUrl", {
    storageUri,
    responseContentType: "video/mp4",
    responseContentDisposition: "inline",
  });
  return res?.url || res?.data?.url || null;
}

const STATUS_COLORS = {
  INVITED: "#6b7280",
  OPENED: "#3b82f6",
  FORMAT_SELECTED: "#8b5cf6",
  STARTED: "#f59e0b",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#B8956A",
  EXPIRED: "#ef4444",
  TECHNICAL_ISSUE: "#ef4444",
  REOPENED: "#3b82f6",
};

export default function AsyncInterviewManager() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [responses, setResponses] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [conference, setConference] = useState(null);
  const [tavusPlayableUrl, setTavusPlayableUrl] = useState(null);
  const [resolvingTavus, setResolvingTavus] = useState(false);
  const [activeTab, setActiveTab] = useState("sessions");

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.entities.InterviewSession.list("-created_date", 100);
      setSessions(res || []);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const loadDetail = async (session) => {
    setSelectedSession(session);
    setLoadingDetail(true);
    setConference(null);
    setTavusPlayableUrl(null);
    try {
      const res = await base44.entities.InterviewResponse.filter({ session_id: session.id }, "question_index", 20);
      setResponses(res || []);
      // For conversational AI sessions, fetch the Conference to surface the Tavus recording
      if (session.delivery_mode === "CONVERSATIONAL_AI" && session.conference_id) {
        try {
          const conf = await base44.entities.Conference.get(session.conference_id);
          setConference(conf || null);
        } catch (err) {
          console.error("Failed to load conference:", err);
        }
      }
    } catch (err) {
      console.error("Failed to load responses:", err);
      setResponses([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePlayTavus = async () => {
    if (!conference?.tavus_recording_storage_uri) return;
    setResolvingTavus(true);
    try {
      const url = await resolveTavusUrl(conference.tavus_recording_storage_uri);
      if (url) setTavusPlayableUrl(url);
    } catch (err) {
      console.error("Failed to resolve Tavus recording:", err);
    } finally {
      setResolvingTavus(false);
    }
  };

  const formatDeadline = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: "America/New_York",
    });
  };

  const isExpired = (s) => s.status === "EXPIRED" || (s.expires_at && new Date(s.expires_at) < new Date() && s.status !== "COMPLETED");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#FFFBF5]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1A1A]">Async Interview Manager</h1>
            <p className="text-sm text-[#1A1A1A]/50 mt-1">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""} · First-round asynchronous interviews
            </p>
          </div>
          <button
            onClick={fetchSessions}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#B8956A]/30 text-sm text-[#1A1A1A]/70 hover:bg-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl border border-[#B8956A]/15 p-1">
          <button
            onClick={() => setActiveTab("sessions")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "sessions" ? "bg-[#B8956A] text-[#1A1A1A]" : "text-[#1A1A1A]/60 hover:bg-[#FFFBF5]"
            }`}
          >
            <Video className="w-4 h-4" />
            Async Sessions
          </button>
          <button
            onClick={() => setActiveTab("migration")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "migration" ? "bg-[#B8956A] text-[#1A1A1A]" : "text-[#1A1A1A]/60 hover:bg-[#FFFBF5]"
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            Scheduled Migration
          </button>
        </div>

        {activeTab === "migration" ? (
          <ScheduledInterviewMigration />
        ) : (
          <>

        {/* Analytics summary */}
        {!loading && sessions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {(() => {
              const completed = sessions.filter(s => s.status === "COMPLETED").length;
              const expired = sessions.filter(s => s.status === "EXPIRED").length;
              const inProgress = sessions.filter(s => ["OPENED", "FORMAT_SELECTED", "STARTED", "IN_PROGRESS"].includes(s.status)).length;
              const invited = sessions.filter(s => s.status === "INVITED").length;
              const conversational = sessions.filter(s => s.delivery_mode === "CONVERSATIONAL_AI").length;
              const selfGuided = sessions.filter(s => s.delivery_mode === "SELF_GUIDED_VIDEO").length;
              const completionRate = sessions.length > 0 ? Math.round((completed / sessions.length) * 100) : 0;
              const stats = [
                { label: "Invited", value: invited, color: "#6b7280" },
                { label: "In Progress", value: inProgress, color: "#f59e0b" },
                { label: "Completed", value: completed, color: "#B8956A" },
                { label: "Expired", value: expired, color: "#ef4444" },
              ];
              return (
                <>
                  {stats.map((s) => (
                    <div key={s.label} className="bg-white rounded-xl border border-[#B8956A]/15 p-4">
                      <p className="text-xs text-[#1A1A1A]/50 font-medium uppercase tracking-wide">{s.label}</p>
                      <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
                    </div>
                  ))}
                  <div className="col-span-2 md:col-span-4 bg-white rounded-xl border border-[#B8956A]/15 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-[#1A1A1A]/50 font-medium uppercase tracking-wide">Format Distribution</p>
                      <p className="text-xs text-[#1A1A1A]/50">Completion rate: <span className="font-bold text-[#B8956A]">{completionRate}%</span></p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5"><Brain className="w-4 h-4 text-[#B8956A]" /> Conversational: <strong>{conversational}</strong></span>
                      <span className="flex items-center gap-1.5"><Video className="w-4 h-4 text-[#B8956A]" /> Self-Guided: <strong>{selfGuided}</strong></span>
                      <span className="text-[#1A1A1A]/40">Not yet chosen: <strong>{sessions.length - conversational - selfGuided}</strong></span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Session list */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-[#1A1A1A]/40">
                <Film className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>No async interview sessions yet</p>
                <p className="text-xs mt-1">Invite candidates from the Applications panel</p>
              </div>
            ) : (
              sessions.map((s) => {
                const active = selectedSession?.id === s.id;
                const expired = isExpired(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => loadDetail(s)}
                    className={`w-full text-left bg-white rounded-xl border p-4 transition-all ${
                      active ? "border-[#B8956A] shadow-sm" : "border-[#B8956A]/15 hover:border-[#B8956A]/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[#1A1A1A] truncate">{s.candidate_name}</p>
                        <p className="text-xs text-[#1A1A1A]/50 truncate">{s.position_title} · {s.candidate_email}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-[#1A1A1A]/60">
                          {s.delivery_mode && (
                            <span className="flex items-center gap-1">
                              {s.delivery_mode === "CONVERSATIONAL_AI" ? <Brain className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                              {FORMAT_LABELS[s.delivery_mode] || s.delivery_mode}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDeadline(s.expires_at)}
                          </span>
                        </div>
                      </div>
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-semibold text-white shrink-0"
                        style={{ backgroundColor: STATUS_COLORS[s.status] || "#6b7280" }}
                      >
                        {s.status}
                      </span>
                    </div>
                    {s.responses_saved_count > 0 && (
                      <p className="text-xs text-[#B8956A] mt-2">{s.responses_saved_count} response(s) saved</p>
                    )}
                    {expired && s.status !== "EXPIRED" && (
                      <p className="text-xs text-red-500 mt-1">Deadline passed — not yet marked expired</p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Detail panel */}
          <div>
            {!selectedSession ? (
              <div className="bg-white rounded-xl border border-[#B8956A]/15 p-8 text-center text-[#1A1A1A]/40">
                <ChevronRight className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Select a session to view responses</p>
              </div>
            ) : loadingDetail ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#B8956A]" />
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#B8956A]/20 p-5">
                <div className="mb-4 pb-4 border-b border-[#B8956A]/15">
                  <h2 className="text-lg font-semibold text-[#1A1A1A]">{selectedSession.candidate_name}</h2>
                  <p className="text-sm text-[#1A1A1A]/60">{selectedSession.position_title}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#1A1A1A]/60">
                    {selectedSession.delivery_mode && (
                      <span className="flex items-center gap-1">
                        {selectedSession.delivery_mode === "CONVERSATIONAL_AI" ? <Brain className="w-3 h-3" /> : <Video className="w-3 h-3" />}
                        {FORMAT_LABELS[selectedSession.delivery_mode]}
                      </span>
                    )}
                    <span>Deadline: {formatDeadline(selectedSession.expires_at)}</span>
                    <span>Responses: {responses.length}/{ROUND1_ALL_QUESTIONS.length}</span>
                  </div>
                </div>

                {/* Conversational AI — Tavus recording */}
                {selectedSession.delivery_mode === "CONVERSATIONAL_AI" && conference?.tavus_recording_storage_uri && (
                  <div className="mb-4 p-3 border border-[#B8956A]/20 rounded-lg bg-[#FFFBF5]">
                    <p className="text-xs font-semibold text-[#B8956A] mb-2 flex items-center gap-1.5">
                      <Brain className="w-3.5 h-3.5" /> Ashley AI Interview Recording
                    </p>
                    {tavusPlayableUrl ? (
                      <video src={tavusPlayableUrl} controls autoPlay className="w-full rounded-lg bg-black max-h-72" />
                    ) : (
                      <button
                        onClick={handlePlayTavus}
                        disabled={resolvingTavus}
                        className="w-full flex items-center justify-center gap-2 py-6 rounded-lg bg-black text-white/80 hover:text-white transition-colors"
                      >
                        {resolvingTavus ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                            </div>
                            <span className="text-sm">Click to load recording</span>
                          </>
                        )}
                      </button>
                    )}
                    {conference.tavus_completed_at && (
                      <p className="text-xs text-[#1A1A1A]/50 mt-2">
                        Completed {new Date(conference.tavus_completed_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                      </p>
                    )}
                  </div>
                )}

                {responses.length === 0 ? (
                  <div className="text-center py-8 text-[#1A1A1A]/40">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">
                      {selectedSession.delivery_mode === "CONVERSATIONAL_AI"
                        ? "No individual responses — Ashley conducts a free-form conversation"
                        : "No responses recorded yet"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                    {responses.map((r, idx) => {
                      const question = ROUND1_ALL_QUESTIONS[r.question_index] || {};
                      return (
                        <div key={r.id || idx} className="border border-[#B8956A]/15 rounded-lg p-3">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-xs font-bold text-[#B8956A] shrink-0 mt-0.5">Q{r.question_index + 1}</span>
                            <p className="text-sm text-[#1A1A1A]/70">{r.question_text || question.question}</p>
                          </div>
                          {r.recording_url && (
                            <video src={r.recording_url} controls className="w-full rounded-lg bg-black max-h-48 mb-2" />
                          )}
                          {r.transcript && (
                            <div className="bg-[#FFFBF5] rounded p-2 mt-2">
                              <p className="text-xs font-semibold text-[#B8956A] mb-1">Transcript</p>
                              <p className="text-sm text-[#1A1A1A]/70 whitespace-pre-wrap">{r.transcript}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-[#1A1A1A]/50">
                            <span>{Math.round(r.duration_seconds || 0)}s</span>
                            {r.is_rerecord && <span className="text-amber-600">Re-recorded</span>}
                            {r.transcribed_at && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#B8956A]" /> Transcribed</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedSession.scorecard_saved && (
                  <div className="mt-4 pt-4 border-t border-[#B8956A]/15">
                    <p className="text-sm font-semibold text-[#B8956A] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Scorecard generated
                    </p>
                    {selectedSession.review_required && (
                      <p className="text-xs text-amber-600 mt-1">Requires human review — incomplete coverage</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}