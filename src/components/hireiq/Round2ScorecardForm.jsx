import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Download } from "lucide-react";
import { downloadRound2BlankPdf } from "@/lib/scorecardPdf";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const RECOMMENDATIONS = ["Strong Hire", "Hire", "Advance", "Hold", "No Hire"];
const CONFIDENCE_LEVELS = ["Very Confident", "Confident", "Neutral", "Unsure"];

function groupTemplate(template) {
  const sections = {};
  (template || []).forEach((q, i) => {
    const s = q.section || "General";
    if (!sections[s]) sections[s] = { name: s, questions: [] };
    sections[s].questions.push({ ...q, _idx: i });
  });
  return Object.values(sections);
}

function buildInitialScores(template) {
  const scores = {};
  (template || []).forEach((_, i) => {
    scores[i] = { score: 0, notes: "" };
  });
  return scores;
}

export default function Round2ScorecardForm({ job, candidateName, onSubmit, onCancel }) {
  const template = job?.scorecard_template || [];
  const sections = groupTemplate(template);
  const [scores, setScores] = useState(buildInitialScores(template));
  const [recommendation, setRecommendation] = useState("");
  const [confidence, setConfidence] = useState("");
  const [overallNotes, setOverallNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const setScore = (idx, score) => setScores(prev => ({ ...prev, [idx]: { ...prev[idx], score } }));
  const setNotes = (idx, notes) => setScores(prev => ({ ...prev, [idx]: { ...prev[idx], notes } }));

  // Compute per-section and total (equal weight across all questions)
  const totalQuestions = template.length;
  const allScores = template.map((_, i) => scores[i]?.score || 0);
  const answeredCount = allScores.filter(s => s > 0).length;
  const overallAvg = answeredCount > 0 ? allScores.reduce((a, b) => a + b, 0) / answeredCount : 0;
  const totalScore = Math.round((overallAvg / 5) * 100 * 10) / 10;

  const sectionTotals = sections.map(sec => {
    const sScores = sec.questions.map(q => scores[q._idx]?.score || 0).filter(s => s > 0);
    const avg = sScores.length > 0 ? sScores.reduce((a, b) => a + b, 0) / sScores.length : 0;
    return { name: sec.name, score: Math.round((avg / 5) * 100 * 10) / 10, count: sec.questions.length };
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = {
      round: 2,
      candidate_name: candidateName,
      sections: sections.map(sec => ({
        name: sec.name,
        max_score: 100,
        score: sectionTotals.find(st => st.name === sec.name)?.score || 0,
        questions: sec.questions.map(q => ({
          question: q.question,
          competency: q.competency,
          explanation: q.explanation,
          score: scores[q._idx]?.score || 0,
          notes: scores[q._idx]?.notes || "",
        })),
      })),
      total_score: totalScore,
      recommendation,
      interviewer_confidence: confidence,
      overall_notes: overallNotes,
      submitted_at: new Date().toISOString(),
    };
    await onSubmit(result);
    setSubmitting(false);
  };

  if (template.length === 0) {
    return (
      <div className="p-6 rounded-lg text-center" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)" }}>
        <p style={{ color: CREAM }}>No Round 2 questions generated yet.</p>
        <p className="text-sm mt-1" style={{ color: MUTED_LIGHT }}>Use "Generate with AI" in the Round 2 template section above to create questions first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold" style={{ ...SERIF, color: CREAM }}>Round 2 Scorecard</h3>
          {candidateName && <p className="text-sm" style={{ color: MUTED_LIGHT }}>Candidate: {candidateName}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadRound2BlankPdf(job, candidateName)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
          <Download className="w-4 h-4 mr-2" /> Download PDF
        </Button>
      </div>

      {sections.map(sec => (
        <div key={sec.name} style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>{sec.name}</h4>
            <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
              {sectionTotals.find(st => st.name === sec.name)?.score || 0}/100
            </span>
          </div>
          <div className="space-y-4">
            {sec.questions.map((q) => {
              const idx = q._idx;
              const current = scores[idx]?.score || 0;
              return (
                <div key={idx} className="rounded-lg p-3" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.1)" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: CREAM }}>{q.question}</p>
                  {q.competency && <p className="text-xs mb-1" style={{ color: MUTED_LIGHT }}>Competency: {q.competency}</p>}
                  {q.explanation && <p className="text-xs mb-2 italic" style={{ color: "rgba(184,149,106,0.6)" }}>{q.explanation}</p>}
                  <div className="flex gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setScore(idx, n)}
                        className="w-9 h-9 rounded-lg text-sm font-bold transition-all"
                        style={{
                          backgroundColor: current === n ? GOLD : "rgba(255,251,245,0.05)",
                          color: current === n ? "#1A1A1A" : MUTED_LIGHT,
                          border: current === n ? "none" : "1px solid rgba(184,149,106,0.15)",
                        }}>
                        {n}
                      </button>
                    ))}
                    {current > 0 && (
                      <span className="ml-2 text-xs self-center" style={{ color: MUTED_LIGHT }}>
                        {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][current]}
                      </span>
                    )}
                  </div>
                  <input type="text" placeholder="Interviewer notes..." value={scores[idx]?.notes || ""}
                    onChange={e => setNotes(idx, e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded"
                    style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.1)" }} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Summary */}
      <div style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.3)", borderRadius: "12px", padding: "16px" }}>
        <h4 className="font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Overall Recommendation</h4>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {sectionTotals.map(st => (
            <div key={st.name} className="flex justify-between text-sm rounded px-3 py-1.5" style={{ backgroundColor: "#2A2A2A" }}>
              <span style={{ color: MUTED_LIGHT }}>{st.name}</span>
              <span className="font-bold" style={{ color: GOLD }}>{st.score}/100</span>
            </div>
          ))}
          <div className="flex justify-between text-sm rounded px-3 py-1.5 col-span-2" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
            <span className="font-bold" style={{ color: CREAM }}>TOTAL ({answeredCount}/{totalQuestions} answered)</span>
            <span className="font-bold text-lg" style={{ color: GOLD }}>{totalScore}/100</span>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: MUTED_LIGHT }}>Recommendation</p>
            <div className="flex flex-wrap gap-2">
              {RECOMMENDATIONS.map(r => (
                <button key={r} onClick={() => setRecommendation(r)}
                  className="px-3 py-1 rounded text-sm font-medium transition-all"
                  style={{ backgroundColor: recommendation === r ? GOLD : "#2A2A2A", color: recommendation === r ? "#1A1A1A" : MUTED_LIGHT, border: recommendation === r ? "none" : "1px solid rgba(184,149,106,0.15)" }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: MUTED_LIGHT }}>Interviewer Confidence</p>
            <div className="flex flex-wrap gap-2">
              {CONFIDENCE_LEVELS.map(c => (
                <button key={c} onClick={() => setConfidence(c)}
                  className="px-3 py-1 rounded text-sm font-medium transition-all"
                  style={{ backgroundColor: confidence === c ? GOLD : "#2A2A2A", color: confidence === c ? "#1A1A1A" : MUTED_LIGHT, border: confidence === c ? "none" : "1px solid rgba(184,149,106,0.15)" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5" style={{ color: MUTED_LIGHT }}>Overall Notes</p>
            <textarea rows={3} value={overallNotes} onChange={e => setOverallNotes(e.target.value)} placeholder="Overall interview notes..."
              className="w-full text-sm px-3 py-2 rounded"
              style={{ backgroundColor: "#2A2A2A", color: CREAM, border: "1px solid rgba(184,149,106,0.15)" }} />
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting || answeredCount === 0} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Submit Scorecard
        </Button>
      </div>
    </div>
  );
}