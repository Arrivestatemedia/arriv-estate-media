import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, FileText, Mic, Sparkles, CheckCircle2, Clock, AlertCircle, TrendingUp } from "lucide-react";
import EvaluationDisplay from "@/components/hireiq/EvaluationDisplay";
import ScorecardEditor from "@/components/hireiq/ScorecardEditor";
import OcrScorecardUpload from "@/components/hireiq/OcrScorecardUpload";
import PerformanceTracker from "@/components/hireiq/PerformanceTracker";
import { evaluateCandidate, analyzeInterview } from "@/lib/hireiq";

export default function HireIQCandidateDetail() {
  const [candidate, setCandidate] = useState(null);
  const [job, setJob] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInterview, setShowInterview] = useState(false);
  const [interviewMode, setInterviewMode] = useState("live");
  const [evaluating, setEvaluating] = useState(false);
  const [notes, setNotes] = useState("");
  const navigate = useNavigate();
  const id = new URLSearchParams(window.location.search).get("id");

  const [error, setError] = useState(null);
  const [debug, setDebug] = useState("");

  useEffect(() => {
    if (!id) { setLoading(false); setDebug("No id in URL"); return; }
    setDebug("id=" + id);
    base44.entities.HireCandidate.list("-created_date", 50)
      .then(list => {
        setDebug(d => d + " | list=" + JSON.stringify((list || []).map(c => c.id)));
        const c = (list || []).find(x => x.id === id);
        setDebug(d => d + " | found=" + !!c);
        setCandidate(c);
        setNotes(c?.interview_notes || "");
        if (c?.job_id) {
          return Promise.all([
            base44.entities.HireJob.list("-created_date", 50).then(jobs => (jobs || []).find(j => j.id === c.job_id)).catch(() => null),
            base44.entities.HireInterview.filter({ candidate_id: id }, "-created_date", 20).catch(() => []),
          ]).then(([j, ints]) => {
            setJob(j);
            setInterviews(ints || []);
          });
        }
      })
      .catch(e => { setError(e?.message || String(e)); setDebug(d => d + " | err=" + (e?.message || e)); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleInterviewComplete = async (interviewData) => {
    let finalData = { ...interviewData };
    if (!finalData.ai_summary && finalData.questions) {
      try {
        finalData.ai_summary = await analyzeInterview({ questions: finalData.questions }, job, job?.role_success_profile);
      } catch (_) {}
    }
    const interview = await base44.entities.HireInterview.create({
      candidate_id: id,
      job_id: candidate.job_id,
      ...finalData,
    });
    setInterviews(prev => [interview, ...prev]);
    setShowInterview(false);
    setInterviewMode("live");
    await base44.entities.HireCandidate.update(id, { status: "interviewing" });
    setCandidate(prev => ({ ...prev, status: "interviewing" }));
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const evaluation = await evaluateCandidate(candidate, job, job.role_success_profile, interviews, candidate.resume_analysis);
      const updated = await base44.entities.HireCandidate.update(id, { evaluation });
      setCandidate(updated);
    } catch (_) {}
    setEvaluating(false);
  };

  const handleDecision = async (decision) => {
    const statusMap = { advance: "advanced", hold: "hold", another_interview: "interviewing", offer: "offer", decline: "declined" };
    const updated = await base44.entities.HireCandidate.update(id, {
      decision,
      decision_notes: notes,
      status: statusMap[decision] || candidate.status,
    });
    setCandidate(updated);
  };

  const saveNotes = async () => {
    await base44.entities.HireCandidate.update(id, { interview_notes: notes });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  if (!candidate) return <div className="text-center py-20 text-gray-500"><div>{error ? `Error: ${error}` : "Candidate not found"}</div><div className="text-xs mt-2 text-gray-400">{debug}</div></div>;

  const ra = candidate.resume_analysis;
  const ev = candidate.evaluation;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <button onClick={() => navigate(createPageUrl("HireIQJobDetail") + `?id=${candidate.job_id}`)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Job
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{candidate.name}</h1>
          <p className="text-sm text-gray-500">{candidate.email} {candidate.phone && `· ${candidate.phone}`}</p>
          <span className="inline-block text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 mt-1">{candidate.status}</span>
        </div>
        {candidate.resume_url && (
          <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline"><FileText className="w-4 h-4 mr-2" /> View Resume</Button>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Resume Analysis */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-[#B8956A]" /> Resume Analysis</h3>
            {!ra ? (
              <p className="text-sm text-gray-400">No resume analysis available</p>
            ) : (
              <div className="space-y-3 text-sm">
                {ra.strong_matches?.length > 0 && <div><p className="font-semibold text-green-600 mb-1">Strong Matches</p><ul className="space-y-0.5">{ra.strong_matches.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.partial_matches?.length > 0 && <div><p className="font-semibold text-yellow-600 mb-1">Partial Matches</p><ul className="space-y-0.5">{ra.partial_matches.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.missing_experience?.length > 0 && <div><p className="font-semibold text-red-600 mb-1">Missing Experience</p><ul className="space-y-0.5">{ra.missing_experience.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.transferable_skills?.length > 0 && <div><p className="font-semibold text-blue-600 mb-1">Transferable Skills</p><ul className="space-y-0.5">{ra.transferable_skills.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.potential_concerns?.length > 0 && <div><p className="font-semibold text-orange-600 mb-1">Potential Concerns</p><ul className="space-y-0.5">{ra.potential_concerns.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.follow_up_questions?.length > 0 && <div><p className="font-semibold text-gray-600 mb-1">Suggested Follow-Up Questions</p><ul className="space-y-0.5">{ra.follow_up_questions.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {ra.explanation && <div className="bg-gray-50 p-2 rounded text-xs text-gray-600"><p className="font-semibold mb-1">AI Explanation</p>{ra.explanation}</div>}
              </div>
            )}
          </div>

          {/* Interviews */}
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold flex items-center gap-2"><Mic className="w-4 h-4 text-[#B8956A]" /> Interviews ({interviews.length})</h3>
              <Button size="sm" onClick={() => setShowInterview(!showInterview)} style={{ backgroundColor: "#B8956A" }}>
                <Mic className="w-4 h-4 mr-1" /> New Interview
              </Button>
            </div>
            {showInterview && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setInterviewMode("live")} className={`px-3 py-1 rounded text-sm font-medium ${interviewMode === "live" ? "bg-[#B8956A] text-white" : "bg-white border"}`}>Live / Manual Entry</button>
                  <button onClick={() => setInterviewMode("ocr")} className={`px-3 py-1 rounded text-sm font-medium ${interviewMode === "ocr" ? "bg-[#B8956A] text-white" : "bg-white border"}`}>OCR Upload</button>
                </div>
                {interviewMode === "live" ? (
                  <ScorecardEditor candidate={candidate} job={job} roleProfile={job?.role_success_profile} onComplete={handleInterviewComplete} onCancel={() => setShowInterview(false)} />
                ) : (
                  <OcrScorecardUpload candidate={candidate} job={job} roleProfile={job?.role_success_profile} onComplete={handleInterviewComplete} onCancel={() => setShowInterview(false)} />
                )}
              </div>
            )}
            {interviews.length === 0 && !showInterview ? (
              <p className="text-sm text-gray-400">No interviews yet</p>
            ) : (
              <div className="space-y-2">
                {interviews.map(interview => (
                  <div key={interview.id} className="border rounded p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{interview.interviewer_name || "Interviewer"}</span>
                      <span className="text-xs text-gray-400">{interview.interview_date}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{interview.questions?.length || 0} questions · Score: {interview.overall_score || 0}/100</p>
                    {interview.ai_summary?.overall_assessment && <p className="text-xs text-gray-600 mt-1">{interview.ai_summary.overall_assessment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">Interview Notes</h3>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="General notes about this candidate..." />
            <Button size="sm" variant="outline" onClick={saveNotes} className="mt-2">Save Notes</Button>
          </div>
        </div>

        {/* Right: Evaluation & Decision */}
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#B8956A]" /> AI Candidate Evaluation</h3>
              <Button size="sm" onClick={handleEvaluate} disabled={evaluating} style={{ backgroundColor: "#B8956A" }}>
                {evaluating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                {ev ? "Re-evaluate" : "Evaluate"}
              </Button>
            </div>
            {evaluating ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#B8956A]" /><span className="ml-2 text-gray-500">Evaluating candidate...</span></div>
            ) : ev ? (
              <EvaluationDisplay evaluation={ev} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Click "Evaluate" to generate an AI evaluation. This combines resume analysis, interview scorecards, and job requirements to estimate candidate success.</p>
            )}
          </div>

          {/* Human Decision */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-1">Human Decision</h3>
            <p className="text-xs text-gray-500 mb-3">The final decision is always made by a human. AI assists only.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant={candidate.decision === "advance" ? "default" : "outline"} onClick={() => handleDecision("advance")} disabled={candidate.decision === "advance"}><CheckCircle2 className="w-4 h-4 mr-1" /> Advance</Button>
              <Button size="sm" variant={candidate.decision === "hold" ? "default" : "outline"} onClick={() => handleDecision("hold")} disabled={candidate.decision === "hold"}><Clock className="w-4 h-4 mr-1" /> Hold</Button>
              <Button size="sm" variant={candidate.decision === "another_interview" ? "default" : "outline"} onClick={() => handleDecision("another_interview")} disabled={candidate.decision === "another_interview"}><Mic className="w-4 h-4 mr-1" /> Another Interview</Button>
              <Button size="sm" variant={candidate.decision === "offer" ? "default" : "outline"} onClick={() => handleDecision("offer")} disabled={candidate.decision === "offer"} style={candidate.decision === "offer" ? { backgroundColor: "#16a34a" } : {}}><CheckCircle2 className="w-4 h-4 mr-1" /> Offer Position</Button>
              <Button size="sm" variant={candidate.decision === "decline" ? "default" : "outline"} onClick={() => handleDecision("decline")} disabled={candidate.decision === "decline"} style={candidate.decision === "decline" ? { backgroundColor: "#dc2626" } : {}}><AlertCircle className="w-4 h-4 mr-1" /> Decline</Button>
            </div>
            {candidate.decision !== "pending" && <p className="text-xs text-gray-500 mt-2">Current decision: <span className="font-semibold capitalize">{candidate.decision.replace(/_/g, " ")}</span></p>}
          </div>
        </div>
      </div>

      {(candidate.decision === "offer" || candidate.status === "hired") && (
        <div className="mt-6 border rounded-lg p-4">
          <h3 className="font-semibold mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#B8956A]" /> Performance Tracking (Learning System)</h3>
          <p className="text-xs text-gray-500 mb-3">Track actual job performance to help HireIQ learn which hiring factors predict success.</p>
          <PerformanceTracker candidate={candidate} job={job} />
        </div>
      )}
    </div>
  );
}