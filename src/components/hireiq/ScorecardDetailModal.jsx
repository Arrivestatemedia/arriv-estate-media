import React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { downloadRound1FilledPdf, downloadRound2FilledPdf } from "@/lib/scorecardPdf";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED = "rgba(255,251,245,0.55)";
const INNER = "#2A2A2A";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

function ratingColor(rating) {
  const r = Number(rating) || 0;
  if (r >= 4) return GOLD;
  if (r === 3) return "#FCD34D";
  if (r === 2) return "#FB923C";
  return "#FCA5A5";
}

function List({ label, items, color }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold mb-1" style={{ color: color || GOLD }}>{label}</p>
      <ul className="space-y-0.5 text-sm" style={{ color: CREAM }}>
        {items.map((it, i) => <li key={i}>• {it}</li>)}
      </ul>
    </div>
  );
}

function RatingBadge({ rating }) {
  const r = Number(rating) || 0;
  return (
    <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ backgroundColor: "rgba(184,149,106,0.15)", color: ratingColor(r), fontFamily: "'SF Mono', monospace" }}>
      {r}/5
    </span>
  );
}

function QuestionBlock({ question, competencies, rating, evidence, notes }) {
  const tags = Array.isArray(competencies) ? competencies : (competencies ? [competencies] : []);
  return (
    <div className="p-3 rounded-lg" style={{ backgroundColor: INNER, border: "1px solid rgba(184,149,106,0.12)" }}>
      <div className="flex justify-between gap-3">
        <p className="text-sm font-medium" style={{ color: CREAM }}>{question}</p>
        <RatingBadge rating={rating} />
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((t, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(184,149,106,0.12)", color: GOLD }}>{t}</span>
          ))}
        </div>
      )}
      {evidence && <p className="text-sm mt-2" style={{ color: CREAM }}><span className="text-xs" style={{ color: MUTED }}>Evidence: </span>{evidence}</p>}
      {notes && <p className="text-sm mt-1" style={{ color: CREAM }}><span className="text-xs" style={{ color: MUTED }}>Notes: </span>{notes}</p>}
    </div>
  );
}

export default function ScorecardDetailModal({ open, onClose, title, scorecard, interview, candidateName, job }) {
  const sections = scorecard?.sections || [];
  const questions = interview?.questions || [];
  const ai = interview?.ai_summary || {};
  const competencyScores = scorecard?.competency_scores || {};

  const handleDownload = () => {
    if (!scorecard) return;
    if (scorecard.round === 2) downloadRound2FilledPdf(job, candidateName, scorecard);
    else downloadRound1FilledPdf(candidateName, scorecard);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.3)" }}>
        <div className="flex items-start justify-between gap-3 pr-6">
          <div>
            <DialogTitle className="text-xl font-bold" style={{ ...SERIF, color: CREAM }}>
              {title || "Scorecard"}
            </DialogTitle>
            <p className="text-sm mt-1" style={{ color: MUTED }}>{candidateName}</p>
          </div>
          {scorecard && (
            <Button size="sm" variant="outline" onClick={handleDownload} style={{ backgroundColor: "transparent", color: CREAM, border: "1px solid rgba(184,149,106,0.3)" }}>
              <Download className="w-4 h-4 mr-1.5" /> PDF
            </Button>
          )}
        </div>

        {/* Summary */}
        <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg mt-1" style={{ backgroundColor: INNER, border: "1px solid rgba(184,149,106,0.15)" }}>
          <div>
            <p className="text-xs" style={{ color: MUTED }}>Score</p>
            <p className="text-2xl font-bold" style={{ ...SERIF, color: GOLD, fontFamily: "'SF Mono', monospace" }}>
              {Math.round(scorecard?.total_score ?? interview?.overall_score ?? 0)}<span className="text-sm" style={{ color: MUTED }}>/100</span>
            </p>
          </div>
          {scorecard?.recommendation && (
            <div>
              <p className="text-xs" style={{ color: MUTED }}>Recommendation</p>
              <p className="text-sm font-semibold" style={{ color: CREAM }}>{scorecard.recommendation}</p>
            </div>
          )}
          {scorecard?.interviewer_confidence && (
            <div>
              <p className="text-xs" style={{ color: MUTED }}>Confidence</p>
              <p className="text-sm font-semibold" style={{ color: CREAM }}>{scorecard.interviewer_confidence}</p>
            </div>
          )}
          {interview && (
            <>
              <div>
                <p className="text-xs" style={{ color: MUTED }}>Interviewer</p>
                <p className="text-sm font-semibold" style={{ color: CREAM }}>{interview.interviewer_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: MUTED }}>Date</p>
                <p className="text-sm font-semibold" style={{ color: CREAM }}>{interview.interview_date || "—"}</p>
              </div>
            </>
          )}
        </div>

        {/* Competency scores */}
        {Object.keys(competencyScores).length > 0 && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: INNER, border: "1px solid rgba(184,149,106,0.12)" }}>
            <p className="text-sm font-semibold mb-2" style={{ ...SERIF, color: CREAM }}>Competency Scores</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(competencyScores).map(([comp, score]) => (
                <div key={comp} className="flex justify-between text-sm gap-2">
                  <span style={{ color: MUTED }}>{comp}</span>
                  <span style={{ color: ratingColor((Number(score) || 0) / 20), fontFamily: "'SF Mono', monospace" }}>{score}/100</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Round scorecard sections */}
        {sections.map((sec, si) => (
          <div key={si} className="space-y-2">
            <div className="px-3 py-2 rounded" style={{ backgroundColor: "rgba(184,149,106,0.15)" }}>
              <span className="text-sm font-semibold" style={{ color: GOLD }}>
                {sec.name} — {sec.score ?? "—"}/100{sec.weight ? ` (Weight ${sec.weight}%)` : ""}
              </span>
            </div>
            {(sec.questions || []).map((q, qi) => (
              <QuestionBlock
                key={qi}
                question={q.question}
                competencies={q.competencies}
                rating={q.rating}
                evidence={q.evidence}
                notes={q.notes}
              />
            ))}
          </div>
        ))}

        {scorecard?.overall_notes && (
          <div className="p-3 rounded-lg" style={{ backgroundColor: INNER, border: "1px solid rgba(184,149,106,0.12)" }}>
            <p className="text-sm font-semibold mb-1" style={{ ...SERIF, color: CREAM }}>Overall Notes</p>
            <p className="text-sm" style={{ color: CREAM }}>{scorecard.overall_notes}</p>
          </div>
        )}

        {/* Human interview questions */}
        {questions.length > 0 && (
          <div className="space-y-2">
            {questions.map((q, qi) => (
              <QuestionBlock
                key={qi}
                question={q.question}
                competencies={q.competency || q.competencies}
                rating={q.rating}
                evidence={q.evidence}
                notes={q.notes}
              />
            ))}
          </div>
        )}

        {/* AI summary */}
        {ai.overall_assessment && (
          <div className="p-3 rounded-lg space-y-3" style={{ backgroundColor: INNER, border: "1px solid rgba(184,149,106,0.12)" }}>
            <p className="text-sm font-semibold" style={{ ...SERIF, color: CREAM }}>AI Interview Summary</p>
            <p className="text-sm" style={{ color: CREAM }}>{ai.overall_assessment}</p>
            <List label="Candidate Strengths" items={ai.candidate_strengths} />
            <List label="Development Areas" items={ai.development_areas} color="#FCD34D" />
            <List label="Competencies Demonstrated" items={ai.competencies_demonstrated} />
            <List label="Concerns" items={ai.concerns} color="#FCA5A5" />
            {ai.confidence_level && <p className="text-sm" style={{ color: CREAM }}><span className="text-xs" style={{ color: MUTED }}>Confidence: </span>{ai.confidence_level}</p>}
            {ai.recommendation_explanation && <p className="text-sm" style={{ color: CREAM }}><span className="text-xs" style={{ color: MUTED }}>Recommendation: </span>{ai.recommendation_explanation}</p>}
            {ai.evidence_sufficiency && <p className="text-sm" style={{ color: CREAM }}><span className="text-xs" style={{ color: MUTED }}>Evidence sufficiency: </span>{ai.evidence_sufficiency}</p>}
          </div>
        )}

        {sections.length === 0 && questions.length === 0 && (
          <p className="text-sm py-6 text-center" style={{ color: MUTED }}>This scorecard has no question detail recorded.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}