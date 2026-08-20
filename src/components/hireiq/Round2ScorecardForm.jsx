import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Download, AlertCircle } from "lucide-react";
import { downloadRound2BlankPdf } from "@/lib/scorecardPdf";
import { computeCompetencyScores, computeSectionScores, computeOverallScore, normalizeQuestion } from "@/lib/scorecardScoring";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const RECOMMENDATIONS = ["Strong Hire", "Hire", "Advance", "Hold", "No Hire"];
const CONFIDENCE_LEVELS = ["Very Confident", "Confident", "Neutral", "Unsure"];
const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

function groupTemplate(template) {
  const sections = {};
  (template || []).forEach((q, i) => {
    const s = q.section || "General";
    if (!sections[s]) sections[s] = { name: s, questions: [] };
    sections[s].questions.push({ ...q, _idx: i });
  });
  return Object.values(sections);
}

function buildInitialScores(template, existing) {
  const scores = {};
  (template || []).forEach((q, i) => {
    const prev = existing?.sections?.flatMap(s => s.questions || [])?.find(pq => pq.question === q.question);
    scores[i] = {
      rating: prev?.rating ?? prev?.score ?? 0,
      evidence: prev?.evidence || "",
      notes: prev?.notes || "",
    };
  });
  return scores;
}

export default function Round2ScorecardForm({ job, candidateName, initialData, onSubmit, onCancel, onAutoSave }) {
  const template = job?.scorecard_template || [];
  const sections = groupTemplate(template);
  const [scores, setScores] = useState(buildInitialScores(template, initialData));
  const [recommendation, setRecommendation] = useState(initialData?.recommendation || "");
  const [confidence, setConfidence] = useState(initialData?.interviewer_confidence || "");
  const [overallNotes, setOverallNotes] = useState(initialData?.overall_notes || "");
  const [submitting, setSubmitting] = useState(false);

  const setRating = (idx, rating) => setScores(prev => ({ ...prev, [idx]: { ...prev[idx], rating } }));
  const setEvidence = (idx, evidence) => setScores(prev => ({ ...prev, [idx]: { ...prev[idx], evidence } }));
  const setNotes = (idx, notes) => setScores(prev => ({ ...prev, [idx]: { ...prev[idx], notes } }));

  // Build flat question list with ratings for scoring
  const scoredQuestions = useMemo(() => {
    return template.map((q, i) => {
      const nq = normalizeQuestion(q);
      const s = scores[i] || {};
      return { ...nq, rating: s.rating || 0, evidence: s.evidence || "", notes: s.notes || "" };
    });
  }, [template, scores]);

  const competencyScores = useMemo(() => computeCompetencyScores(scoredQuestions), [scoredQuestions]);
  const sectionScores = useMemo(() => computeSectionScores(scoredQuestions, null), [scoredQuestions]);
  const totalScore = useMemo(() => computeOverallScore(sectionScores), [sectionScores]);

  const answeredCount = scoredQuestions.filter(q => q.rating > 0).length;
  const canSubmit = answeredCount > 0;

  const [saveStatus, setSaveStatus] = useState("idle");
  const skipSave = useRef(true);

  const buildResult = () => ({
    round: 2,
    candidate_name: candidateName,
    sections: sections.map(sec => ({
      name: sec.name,
      max_score: 100,
      score: sectionScores[sec.name]?.score || 0,
      questions: sec.questions.map(q => {
        const sc = scores[q._idx] || {};
        return {
          question: q.question,
          section: q.section || sec.name,
          competencies: q.competencies || (q.competency ? q.competency.split(",").map(s => s.trim()).filter(Boolean) : []),
          weight: q.weight ?? 1,
          excellent_answer: q.excellent_answer || "",
          poor_answer: q.poor_answer || "",
          why_this_matters: q.why_this_matters || q.explanation || "",
          rating: sc.rating || 0,
          evidence: sc.evidence || "",
          notes: sc.notes || "",
        };
      }),
    })),
    competency_scores: competencyScores,
    total_score: totalScore,
    recommendation,
    interviewer_confidence: confidence,
    overall_notes: overallNotes,
  });

  // Debounced auto-save — saves draft as you type
  useEffect(() => {
    if (!onAutoSave) return;
    if (skipSave.current) { skipSave.current = false; return; }
    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        await onAutoSave(buildResult());
        setSaveStatus("saved");
      } catch (_) {
        setSaveStatus("idle");
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [scores, recommendation, confidence, overallNotes]);

  const handleSubmit = async () => {
    setSubmitting(true);
    await onSubmit({ ...buildResult(), submitted_at: new Date().toISOString() });
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
              {sectionScores[sec.name]?.score || 0}/100
            </span>
          </div>
          <div className="space-y-4">
            {sec.questions.map((q) => {
              const idx = q._idx;
              const current = scores[idx]?.rating || 0;
              const evidence = scores[idx]?.evidence || "";
              const notes = scores[idx]?.notes || "";
              const competencies = q.competencies || (q.competency ? q.competency.split(",").map(s => s.trim()).filter(Boolean) : []);
              return (
                <div key={idx} className="rounded-lg p-3" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.1)" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: CREAM }}>{q.question}</p>
                  {competencies.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {competencies.map(c => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: GOLD }}>{c}</span>
                      ))}
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,251,245,0.05)", color: MUTED_LIGHT }}>Weight: {q.weight ?? 1}</span>
                    </div>
                  )}
                  {q.excellent_answer && (
                    <p className="text-xs mb-1" style={{ color: "rgba(184,149,106,0.7)" }}>
                      <span className="font-semibold">Excellent:</span> {q.excellent_answer}
                    </p>
                  )}
                  {q.poor_answer && (
                    <p className="text-xs mb-1" style={{ color: "rgba(252,165,165,0.6)" }}>
                      <span className="font-semibold">Poor:</span> {q.poor_answer}
                    </p>
                  )}
                  {q.why_this_matters && (
                    <p className="text-xs mb-2 italic" style={{ color: MUTED_LIGHT }}>
                      <span className="font-semibold not-italic">Why this matters:</span> {q.why_this_matters}
                    </p>
                  )}
                  {!q.why_this_matters && q.explanation && (
                    <p className="text-xs mb-2 italic" style={{ color: "rgba(184,149,106,0.6)" }}>{q.explanation}</p>
                  )}
                  <div className="flex gap-2 mb-2 items-center">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRating(idx, n)}
                        className="w-9 h-9 rounded-lg text-sm font-bold transition-all"
                        style={{
                          backgroundColor: current === n ? GOLD : "rgba(255,251,245,0.05)",
                          color: current === n ? "#1A1A1A" : MUTED_LIGHT,
                          border: current === n ? "none" : "1px solid rgba(184,149,106,0.15)",
                        }}>
                        {n}
                      </button>
                    ))}
                    {current > 0 && <span className="ml-2 text-xs" style={{ color: MUTED_LIGHT }}>{RATING_LABELS[current]}</span>}
                  </div>
                  <textarea rows={2} placeholder="Evidence observed (optional)..." value={evidence}
                    onChange={e => setEvidence(idx, e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded mb-2"
                    style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.1)" }} />
                  <input type="text" placeholder="Additional notes (optional)..." value={notes}
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
        <h4 className="font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Automatic Scoring Summary</h4>

        {Object.keys(competencyScores).length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold mb-1.5" style={{ color: MUTED_LIGHT }}>Competency Scores (auto-calculated)</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {Object.entries(competencyScores).map(([comp, score]) => (
                <div key={comp} className="flex justify-between text-xs rounded px-2.5 py-1" style={{ backgroundColor: "#2A2A2A" }}>
                  <span style={{ color: MUTED_LIGHT }}>{comp}</span>
                  <span className="font-bold" style={{ color: GOLD }}>{score}/100</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-3">
          {Object.entries(sectionScores).map(([name, st]) => (
            <div key={name} className="flex justify-between text-sm rounded px-3 py-1.5" style={{ backgroundColor: "#2A2A2A" }}>
              <span style={{ color: MUTED_LIGHT }}>{name}</span>
              <span className="font-bold" style={{ color: GOLD }}>{st.score}/100</span>
            </div>
          ))}
          <div className="flex justify-between text-sm rounded px-3 py-1.5 col-span-2" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
            <span className="font-bold" style={{ color: CREAM }}>TOTAL ({answeredCount}/{template.length} answered)</span>
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

      <div className="flex gap-3 items-center pt-2">
        <Button variant="outline" onClick={onCancel} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting || !canSubmit} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Submit Scorecard
        </Button>
        {onAutoSave && saveStatus === "saving" && (
          <span className="text-xs flex items-center gap-1" style={{ color: MUTED_LIGHT }}>
            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
          </span>
        )}
        {onAutoSave && saveStatus === "saved" && (
          <span className="text-xs flex items-center gap-1" style={{ color: GOLD }}>
            <CheckCircle2 className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}