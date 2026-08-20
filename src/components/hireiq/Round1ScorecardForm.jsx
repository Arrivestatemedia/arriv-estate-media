import React, { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Download, AlertCircle } from "lucide-react";
import { downloadRound1BlankPdf, downloadRound1FilledPdf } from "@/lib/scorecardPdf";
import { ROUND1_SECTIONS, ROUND1_SECTION_WEIGHTS, ROUND1_ALL_QUESTIONS } from "@/lib/round1Questions";
import { computeCompetencyScores, computeSectionScores, computeOverallScore } from "@/lib/scorecardScoring";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const RECOMMENDATIONS = ["Strong Hire", "Hire", "Advance", "Hold", "No Hire"];
const CONFIDENCE_LEVELS = ["Very Confident", "Confident", "Neutral", "Unsure"];
const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

function buildInitialScores(existing) {
  const scores = {};
  ROUND1_SECTIONS.forEach(s => {
    s.questions.forEach((q, qi) => {
      const key = `${s.name}_${qi}`;
      const prev = existing?.sections?.find(es => es.name === s.name)?.questions?.[qi];
      scores[key] = {
        rating: prev?.rating ?? prev?.score ?? 0,
        evidence: prev?.evidence || "",
        notes: prev?.notes || "",
      };
    });
  });
  return scores;
}

export default function Round1ScorecardForm({ candidateName, initialData, onSubmit, onCancel, onAutoSave }) {
  const [scores, setScores] = useState(buildInitialScores(initialData));
  const [recommendation, setRecommendation] = useState(initialData?.recommendation || "");
  const [confidence, setConfidence] = useState(initialData?.interviewer_confidence || "");
  const [overallNotes, setOverallNotes] = useState(initialData?.overall_notes || "");
  const [submitting, setSubmitting] = useState(false);

  const setRating = (key, rating) => setScores(prev => ({ ...prev, [key]: { ...prev[key], rating } }));
  const setEvidence = (key, evidence) => setScores(prev => ({ ...prev, [key]: { ...prev[key], evidence } }));
  const setNotes = (key, notes) => setScores(prev => ({ ...prev, [key]: { ...prev[key], notes } }));

  // Build flat question list with ratings for scoring
  const scoredQuestions = useMemo(() => {
    return ROUND1_ALL_QUESTIONS.map((q, i) => {
      const secIdx = ROUND1_SECTIONS.findIndex(s => s.name === q.section);
      const qIdx = ROUND1_SECTIONS[secIdx].questions.indexOf(q);
      const key = `${q.section}_${qIdx}`;
      const s = scores[key] || {};
      return { ...q, rating: s.rating || 0, evidence: s.evidence || "", notes: s.notes || "" };
    });
  }, [scores]);

  const competencyScores = useMemo(() => computeCompetencyScores(scoredQuestions), [scoredQuestions]);
  const sectionScores = useMemo(() => computeSectionScores(scoredQuestions, ROUND1_SECTION_WEIGHTS), [scoredQuestions]);
  const totalScore = useMemo(() => computeOverallScore(sectionScores), [sectionScores]);

  const answeredCount = scoredQuestions.filter(q => q.rating > 0).length;
  const canSubmit = answeredCount > 0;

  const [saveStatus, setSaveStatus] = useState("idle");
  const skipSave = useRef(true);

  const buildResult = () => ({
    round: 1,
    candidate_name: candidateName,
    sections: ROUND1_SECTIONS.map(s => ({
      name: s.name,
      weight: s.weight,
      score: sectionScores[s.name]?.score || 0,
      questions: s.questions.map((q, qi) => {
        const key = `${s.name}_${qi}`;
        const sc = scores[key] || {};
        return {
          question: q.question,
          section: s.name,
          competencies: q.competencies,
          weight: q.weight,
          excellent_answer: q.excellent_answer,
          poor_answer: q.poor_answer,
          why_this_matters: q.why_this_matters,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold" style={{ ...SERIF, color: CREAM }}>Round 1 Scorecard</h3>
          {candidateName && <p className="text-sm" style={{ color: MUTED_LIGHT }}>Candidate: {candidateName}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadRound1BlankPdf(candidateName)} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
          <Download className="w-4 h-4 mr-2" /> Download PDF
        </Button>
      </div>

      {ROUND1_SECTIONS.map(section => (
        <div key={section.name} style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>{section.name}</h4>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: MUTED_LIGHT }}>Weight: {section.weight}%</span>
              <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
                {sectionScores[section.name]?.score || 0}/100
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {section.questions.map((q, qi) => {
              const key = `${section.name}_${qi}`;
              const current = scores[key]?.rating || 0;
              const evidence = scores[key]?.evidence || "";
              const notes = scores[key]?.notes || "";
              return (
                <div key={qi} className="rounded-lg p-3" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.1)" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: CREAM }}>{q.question}</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {q.competencies.map(c => (
                      <span key={c} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: GOLD }}>{c}</span>
                    ))}
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,251,245,0.05)", color: MUTED_LIGHT }}>Weight: {q.weight}</span>
                  </div>
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
                  <div className="flex gap-2 mb-2 items-center">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setRating(key, n)}
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
                    onChange={e => setEvidence(key, e.target.value)}
                    className="w-full text-xs px-3 py-1.5 rounded mb-2"
                    style={{ backgroundColor: "#1A1A1A", color: CREAM, border: "1px solid rgba(184,149,106,0.1)" }} />
                  <input type="text" placeholder="Additional notes (optional)..." value={notes}
                    onChange={e => setNotes(key, e.target.value)}
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

        {/* Competency Scores */}
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

        {/* Section Scores */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {ROUND1_SECTIONS.map(s => (
            <div key={s.name} className="flex justify-between text-sm rounded px-3 py-1.5" style={{ backgroundColor: "#2A2A2A" }}>
              <span style={{ color: MUTED_LIGHT }}>{s.name} ({s.weight}%)</span>
              <span className="font-bold" style={{ color: GOLD }}>{sectionScores[s.name]?.score || 0}/100</span>
            </div>
          ))}
          <div className="flex justify-between text-sm rounded px-3 py-1.5 col-span-2" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
            <span className="font-bold" style={{ color: CREAM }}>TOTAL ({answeredCount}/{ROUND1_ALL_QUESTIONS.length} answered)</span>
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