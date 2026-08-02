import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Mic, Sparkles, CheckCircle2, Clock, AlertCircle, TrendingUp } from "lucide-react";
import EvaluationDisplay from "@/components/hireiq/EvaluationDisplay";
import ScorecardEditor from "@/components/hireiq/ScorecardEditor";
import OcrScorecardUpload from "@/components/hireiq/OcrScorecardUpload";
import PerformanceTracker from "@/components/hireiq/PerformanceTracker";
import { evaluateCandidate, analyzeInterview } from "@/lib/hireiq";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
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

export default function CandidateDetailPanel({ candidate, job, onBack, onCandidateUpdated }) {
  const [interviews, setInterviews] = useState([]);
  const [loadingInterviews, setLoadingInterviews] = useState(true);
  const [showInterview, setShowInterview] = useState(false);
  const [interviewMode, setInterviewMode] = useState("live");
  const [evaluating, setEvaluating] = useState(false);
  const [notes, setNotes] = useState(candidate?.interview_notes || "");

  useEffect(() => {
    setNotes(candidate?.interview_notes || "");
  }, [candidate?.id]);

  const loadInterviews = async () => {
    if (!candidate?.id) return;
    setLoadingInterviews(true);
    try {
      const res = await base44.entities.HireInterview.filter({ candidate_id: candidate.id }, "-created_date", 20);
      const list = res?.data ?? res;
      setInterviews(Array.isArray(list) ? list : []);
    } catch (_) { setInterviews([]); }
    setLoadingInterviews(false);
  };

  useEffect(() => { loadInterviews(); }, [candidate?.id]);

  const handleInterviewComplete = async (interviewData) => {
    let finalData = { ...interviewData };
    if (!finalData.ai_summary && finalData.questions) {
      try {
        finalData.ai_summary = await analyzeInterview({ questions: finalData.questions }, job, job?.role_success_profile);
      } catch (_) {}
    }
    const res = await base44.entities.HireInterview.create({
      candidate_id: candidate.id,
      job_id: candidate.job_id,
      ...finalData,
    });
    const interview = res?.data ?? res;
    setInterviews(prev => [interview, ...prev]);
    setShowInterview(false);
    setInterviewMode("live");
    await base44.entities.HireCandidate.update(candidate.id, { status: "interviewing" });
    onCandidateUpdated({ ...candidate, status: "interviewing" });
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const evaluation = await evaluateCandidate(candidate, job, job?.role_success_profile, interviews, candidate.resume_analysis);
      const res = await base44.entities.HireCandidate.update(candidate.id, { evaluation });
      const updated = res?.data ?? res;
      onCandidateUpdated(updated);
    } catch (_) {}
    setEvaluating(false);
  };

  const handleDecision = async (decision) => {
    const statusMap = { advance: "advanced", hold: "hold", another_interview: "interviewing", offer: "offer", decline: "declined" };
    const res = await base44.entities.HireCandidate.update(candidate.id, {
      decision,
      decision_notes: notes,
      status: statusMap[decision] || candidate.status,
    });
    const updated = res?.data ?? res;
    onCandidateUpdated(updated);
  };

  const saveNotes = async () => {
    await base44.entities.HireCandidate.update(candidate.id, { interview_notes: notes });
  };

  const ra = candidate?.resume_analysis;
  const ev = candidate?.evaluation;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Candidate header card */}
      <div className="p-5 mb-5" style={card}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ ...SERIF, color: CREAM }}>{candidate?.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: MUTED_LIGHT }}>{candidate?.email} {candidate?.phone && `· ${candidate.phone}`}</p>
            <span className="inline-block text-xs px-2 py-0.5 rounded mt-2" style={{ backgroundColor: "#2A2A2A", color: CREAM }}>{candidate?.status}</span>
          </div>
          {candidate?.resume_url && (
            <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><FileText className="w-4 h-4 mr-2" /> View Resume</Button>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left column */}
        <div className="space-y-5">
          <div className="p-5" style={card}>
            <h3 className="font-bold mb-3 flex items-center gap-2" style={{ ...SERIF, color: CREAM }}><FileText className="w-4 h-4" style={{ color: GOLD }} /> Resume Analysis</h3>
            {!ra ? (
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>No resume analysis available</p>
            ) : (
              <div className="space-y-3 text-sm" style={{ color: CREAM }}>
                {ra.strong_matches?.length > 0 && <div><p className="font-semibold mb-1" style={{ color: GOLD }}>Strong Matches</p><ul className="space-y-0.5">{ra.strong_matches.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.partial_matches?.length > 0 && <div><p className="font-semibold mb-1" style={{ color: "#FCD34D" }}>Partial Matches</p><ul className="space-y-0.5">{ra.partial_matches.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.missing_experience?.length > 0 && <div><p className="font-semibold mb-1" style={{ color: "#FCA5A5" }}>Missing Experience</p><ul className="space-y-0.5">{ra.missing_experience.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.transferable_skills?.length > 0 && <div><p className="font-semibold mb-1" style={{ color: CREAM }}>Transferable Skills</p><ul className="space-y-0.5">{ra.transferable_skills.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.potential_concerns?.length > 0 && <div><p className="font-semibold mb-1" style={{ color: "#FB923C" }}>Potential Concerns</p><ul className="space-y-0.5">{ra.potential_concerns.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.follow_up_questions?.length > 0 && <div><p className="font-semibold mb-1" style={{ color: MUTED_LIGHT }}>Suggested Follow-Up Questions</p><ul className="space-y-0.5">{ra.follow_up_questions.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.explanation && <div className="p-2 rounded text-xs" style={{ backgroundColor: innerBg, color: CREAM }}><p className="font-semibold mb-1">AI Explanation</p>{ra.explanation}</div>}
              </div>
            )}
          </div>

          <div className="p-5" style={card}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold flex items-center gap-2" style={{ ...SERIF, color: CREAM }}><Mic className="w-4 h-4" style={{ color: GOLD }} /> Interviews ({interviews.length})</h3>
              <Button size="sm" onClick={() => setShowInterview(!showInterview)} style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}>
                <Mic className="w-4 h-4 mr-1" /> New Interview
              </Button>
            </div>
            {showInterview && (
              <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.12)" }}>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setInterviewMode("live")} className="px-3 py-1 rounded text-sm font-medium" style={interviewMode === "live" ? { backgroundColor: GOLD, color: "#0A0A0A" } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Live / Manual Entry</button>
                  <button onClick={() => setInterviewMode("ocr")} className="px-3 py-1 rounded text-sm font-medium" style={interviewMode === "ocr" ? { backgroundColor: GOLD, color: "#0A0A0A" } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>OCR Upload</button>
                </div>
                {interviewMode === "live" ? (
                  <ScorecardEditor candidate={candidate} job={job} roleProfile={job?.role_success_profile} onComplete={handleInterviewComplete} onCancel={() => setShowInterview(false)} />
                ) : (
                  <OcrScorecardUpload candidate={candidate} job={job} roleProfile={job?.role_success_profile} onComplete={handleInterviewComplete} onCancel={() => setShowInterview(false)} />
                )}
              </div>
            )}
            {loadingInterviews ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" style={{ color: GOLD }} /></div>
            ) : interviews.length === 0 && !showInterview ? (
              <p className="text-sm" style={{ color: MUTED_LIGHT }}>No interviews yet</p>
            ) : (
              <div className="space-y-2">
                {interviews.map(interview => (
                  <div key={interview.id} className="p-3 text-sm rounded-lg" style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.1)" }}>
                    <div className="flex justify-between">
                      <span className="font-medium" style={{ color: CREAM }}>{interview.interviewer_name || "Interviewer"}</span>
                      <span className="text-xs" style={{ color: MUTED_LIGHT }}>{interview.interview_date}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: MUTED_LIGHT }}>{interview.questions?.length || 0} questions · Score: <span style={{ fontFamily: "'SF Mono', monospace", color: GOLD }}>{interview.overall_score || 0}</span>/100</p>
                    {interview.ai_summary?.overall_assessment && <p className="text-xs mt-1" style={{ color: CREAM }}>{interview.ai_summary.overall_assessment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5" style={card}>
            <h3 className="font-bold mb-2" style={{ ...SERIF, color: CREAM }}>Interview Notes</h3>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="General notes about this candidate..." style={{ backgroundColor: innerBg, border: "1px solid rgba(184,149,106,0.2)", color: CREAM }} />
            <Button size="sm" variant="outline" onClick={saveNotes} className="mt-2" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Save Notes</Button>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="p-5" style={card}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold flex items-center gap-2" style={{ ...SERIF, color: CREAM }}><Sparkles className="w-4 h-4" style={{ color: GOLD }} /> AI Candidate Evaluation</h3>
              <Button size="sm" onClick={handleEvaluate} disabled={evaluating} style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}>
                {evaluating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                {ev ? "Re-evaluate" : "Evaluate"}
              </Button>
            </div>
            {evaluating ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} /><span className="ml-2" style={{ color: MUTED_LIGHT }}>Evaluating candidate...</span></div>
            ) : ev ? (
              <EvaluationDisplay evaluation={ev} />
            ) : (
              <p className="text-sm text-center py-8" style={{ color: MUTED_LIGHT }}>Click "Evaluate" to generate an AI evaluation. This combines resume analysis, interview scorecards, and job requirements to estimate candidate success.</p>
            )}
          </div>

          <div className="p-5" style={card}>
            <h3 className="font-bold mb-1" style={{ ...SERIF, color: CREAM }}>Human Decision</h3>
            <p className="text-xs mb-3" style={{ color: MUTED_LIGHT }}>The final decision is always made by a human. AI assists only.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant={candidate?.decision === "advance" ? "default" : "outline"} onClick={() => handleDecision("advance")} disabled={candidate?.decision === "advance"} style={candidate?.decision === "advance" ? { backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><CheckCircle2 className="w-4 h-4 mr-1" /> Advance</Button>
              <Button size="sm" variant={candidate?.decision === "hold" ? "default" : "outline"} onClick={() => handleDecision("hold")} disabled={candidate?.decision === "hold"} style={candidate?.decision === "hold" ? { backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><Clock className="w-4 h-4 mr-1" /> Hold</Button>
              <Button size="sm" variant={candidate?.decision === "another_interview" ? "default" : "outline"} onClick={() => handleDecision("another_interview")} disabled={candidate?.decision === "another_interview"} style={candidate?.decision === "another_interview" ? { backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><Mic className="w-4 h-4 mr-1" /> Another Interview</Button>
              <Button size="sm" variant={candidate?.decision === "offer" ? "default" : "outline"} onClick={() => handleDecision("offer")} disabled={candidate?.decision === "offer"} style={candidate?.decision === "offer" ? { backgroundColor: GOLD_DARK, color: CREAM, border: "none", fontWeight: 600 } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><CheckCircle2 className="w-4 h-4 mr-1" /> Offer Position</Button>
              <Button size="sm" variant={candidate?.decision === "decline" ? "default" : "outline"} onClick={() => handleDecision("decline")} disabled={candidate?.decision === "decline"} style={candidate?.decision === "decline" ? { backgroundColor: "#991b1b", color: CREAM, border: "none", fontWeight: 600 } : { backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}><AlertCircle className="w-4 h-4 mr-1" /> Decline</Button>
            </div>
            {candidate?.decision !== "pending" && candidate?.decision && <p className="text-xs mt-2" style={{ color: MUTED_LIGHT }}>Current decision: <span className="font-semibold capitalize" style={{ color: CREAM }}>{candidate.decision.replace(/_/g, " ")}</span></p>}
          </div>
        </div>
      </div>

      {(candidate?.decision === "offer" || candidate?.status === "hired") && (
        <div className="mt-5 p-5" style={card}>
          <h3 className="font-bold mb-1 flex items-center gap-2" style={{ ...SERIF, color: CREAM }}><TrendingUp className="w-4 h-4" style={{ color: GOLD }} /> Performance Tracking (Learning System)</h3>
          <p className="text-xs mb-3" style={{ color: MUTED_LIGHT }}>Track actual job performance to help YouHireIQ learn which hiring factors predict success.</p>
          <PerformanceTracker candidate={candidate} job={job} />
        </div>
      )}
    </div>
  );
}