import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Download } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const ROUND1_PDF_URL = "https://media.base44.com/files/public/698b3b9e4b7d348873dbf213/b8f35ac95_HireHQ_Round1_Scorecard_and_Competency_Guide_v31.pdf";

const SECTIONS = [
  { name: "Communication", weight: 20, questions: [
    { q: "Tell me about yourself.", competencies: "Communication, Confidence" },
    { q: "Tell me about a difficult conversation you handled well.", competencies: "Communication, Professionalism" },
    { q: "How do you prefer to communicate with others and why?", competencies: "Communication" },
  ]},
  { name: "Confidence", weight: 15, questions: [
    { q: "What accomplishment are you most proud of?", competencies: "Confidence" },
    { q: "Describe a time you stepped outside your comfort zone.", competencies: "Confidence, Resilience" },
    { q: "What motivates you every day?", competencies: "Confidence" },
  ]},
  { name: "Coachability", weight: 20, questions: [
    { q: "Tell me about a time you received constructive criticism.", competencies: "Coachability" },
    { q: "What did you do with that feedback?", competencies: "Coachability, Growth Mindset" },
    { q: "Tell me about a mistake you made and what you learned.", competencies: "Coachability, Accountability" },
  ]},
  { name: "Work Ethic", weight: 15, questions: [
    { q: "Describe a difficult challenge you've overcome.", competencies: "Work Ethic, Problem Solving" },
    { q: "How do you stay organized?", competencies: "Work Ethic" },
    { q: "Tell me about a time you went above and beyond.", competencies: "Work Ethic, Initiative" },
  ]},
  { name: "Professionalism", weight: 10, questions: [
    { q: "Tell me about a disagreement with a coworker or manager.", competencies: "Professionalism" },
    { q: "How do you react when treated unfairly?", competencies: "Professionalism, Emotional Intelligence" },
  ]},
  { name: "Culture Fit", weight: 10, questions: [
    { q: "What kind of manager brings out your best?", competencies: "Culture Fit" },
    { q: "What type of company culture helps you thrive?", competencies: "Culture Fit" },
    { q: "Why do you want to work at Arriv?", competencies: "Culture Fit, Motivation" },
  ]},
];

const RECOMMENDATIONS = ["Strong Hire", "Hire", "Advance", "Hold", "No Hire"];
const CONFIDENCE_LEVELS = ["Very Confident", "Confident", "Neutral", "Unsure"];

function buildInitialScores(existing) {
  const scores = {};
  SECTIONS.forEach(s => {
    s.questions.forEach((_, qi) => {
      const key = `${s.name}_${qi}`;
      const prev = existing?.sections?.find(es => es.name === s.name)?.questions?.[qi];
      scores[key] = { score: prev?.score || 0, notes: prev?.notes || "" };
    });
  });
  return scores;
}

function computeTotals(scores) {
  const sectionTotals = {};
  SECTIONS.forEach(s => {
    const qScores = s.questions.map((_, qi) => scores[`${s.name}_${qi}`]?.score || 0);
    const avg = qScores.reduce((a, b) => a + b, 0) / qScores.length;
    sectionTotals[s.name] = Math.round((avg / 5) * s.weight * 10) / 10;
  });
  const total = Object.values(sectionTotals).reduce((a, b) => a + b, 0);
  return { sectionTotals, total: Math.round(total * 10) / 10 };
}

export default function Round1ScorecardForm({ candidateName, initialData, onSubmit, onCancel }) {
  const [scores, setScores] = useState(buildInitialScores(initialData));
  const [recommendation, setRecommendation] = useState(initialData?.recommendation || "");
  const [confidence, setConfidence] = useState(initialData?.interviewer_confidence || "");
  const [overallNotes, setOverallNotes] = useState(initialData?.overall_notes || "");
  const [submitting, setSubmitting] = useState(false);

  const setScore = (key, score) => setScores(prev => ({ ...prev, [key]: { ...prev[key], score } }));
  const setNotes = (key, notes) => setScores(prev => ({ ...prev, [key]: { ...prev[key], notes } }));
  const { sectionTotals, total } = computeTotals(scores);

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = {
      round: 1,
      candidate_name: candidateName,
      sections: SECTIONS.map(s => ({
        name: s.name, weight: s.weight, score: sectionTotals[s.name],
        questions: s.questions.map((q, qi) => ({
          question: q.q, competencies: q.competencies,
          score: scores[`${s.name}_${qi}`]?.score || 0,
          notes: scores[`${s.name}_${qi}`]?.notes || "",
        })),
      })),
      total_score: total,
      recommendation,
      interviewer_confidence: confidence,
      overall_notes: overallNotes,
      submitted_at: new Date().toISOString(),
    };
    await onSubmit(result);
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold" style={{ ...SERIF, color: CREAM }}>Round 1 Scorecard</h3>
          {candidateName && <p className="text-sm" style={{ color: MUTED_LIGHT }}>Candidate: {candidateName}</p>}
        </div>
        <a href={ROUND1_PDF_URL} target="_blank" rel="noopener noreferrer" download>
          <Button variant="outline" size="sm" style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.2)" }}>
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
        </a>
      </div>

      {SECTIONS.map(section => (
        <div key={section.name} style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)", borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold" style={{ ...SERIF, color: CREAM }}>{section.name}</h4>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: MUTED_LIGHT }}>Weight: {section.weight}%</span>
              <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: GOLD }}>
                {sectionTotals[section.name]}/{section.weight}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            {section.questions.map((q, qi) => {
              const key = `${section.name}_${qi}`;
              const current = scores[key]?.score || 0;
              return (
                <div key={qi} className="rounded-lg p-3" style={{ backgroundColor: "#2A2A2A", border: "1px solid rgba(184,149,106,0.1)" }}>
                  <p className="text-sm font-medium mb-1" style={{ color: CREAM }}>{q.q}</p>
                  <p className="text-xs mb-2" style={{ color: MUTED_LIGHT }}>Competencies: {q.competencies}</p>
                  <div className="flex gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setScore(key, n)}
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
                  <input type="text" placeholder="Interviewer notes..." value={scores[key]?.notes || ""}
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
        <h4 className="font-bold mb-3" style={{ ...SERIF, color: CREAM }}>Overall Recommendation</h4>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {SECTIONS.map(s => (
            <div key={s.name} className="flex justify-between text-sm rounded px-3 py-1.5" style={{ backgroundColor: "#2A2A2A" }}>
              <span style={{ color: MUTED_LIGHT }}>{s.name} ({s.weight}%)</span>
              <span className="font-bold" style={{ color: GOLD }}>{sectionTotals[s.name]}/{s.weight}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm rounded px-3 py-1.5 col-span-2" style={{ backgroundColor: "rgba(184,149,106,0.1)", border: "1px solid rgba(184,149,106,0.3)" }}>
            <span className="font-bold" style={{ color: CREAM }}>TOTAL</span>
            <span className="font-bold text-lg" style={{ color: GOLD }}>{total}/100</span>
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
        <Button onClick={handleSubmit} disabled={submitting || total === 0} style={{ backgroundColor: GOLD, color: "#1A1A1A", fontWeight: 600 }}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
          Submit Scorecard
        </Button>
      </div>
    </div>
  );
}