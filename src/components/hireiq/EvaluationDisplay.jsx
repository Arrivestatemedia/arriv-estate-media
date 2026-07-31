import React from "react";
import { scoreColor, scoreBar } from "@/lib/hireiq";
import { AlertTriangle, TrendingUp, TrendingDown, Info } from "lucide-react";

const TEXT_DARK = "#1A1A1A";
const GOLD = "#B8956A";
const GOLD_DARK = "#A68559";
const MUTED_DARK = "rgba(26,26,26,0.45)";

function ScoreRow({ label, score }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span style={{ color: MUTED_DARK }}>{label}</span>
        <span className="font-semibold" style={{ color: TEXT_DARK }}>{Math.round(score || 0)}/100</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#E8E5E0" }}>
        <div className={`h-full ${scoreBar(score || 0)} rounded-full transition-all`} style={{ width: `${score || 0}%` }} />
      </div>
    </div>
  );
}

function ListSection({ title, items, icon, color }) {
  if (!items || items.length === 0) return null;
  const Icon = icon;
  return (
    <div>
      <p className="text-sm font-semibold mb-1 flex items-center gap-1.5" style={{ color }}>
        <Icon className="w-4 h-4" /> {title}
      </p>
      <ul className="text-sm space-y-1 ml-6" style={{ color: TEXT_DARK }}>
        {items.map((item, i) => <li key={i} className="list-disc">{item}</li>)}
      </ul>
    </div>
  );
}

export default function EvaluationDisplay({ evaluation }) {
  if (!evaluation) return null;
  const ev = evaluation;
  const successColor = scoreColor(ev.estimated_success_score);

  return (
    <div className="space-y-5">
      {/* Success Score Hero */}
      <div className={`rounded-xl border p-6 text-center ${successColor}`}>
        <p className="text-sm font-semibold uppercase tracking-wide opacity-70">Estimated Success Score</p>
        <p className="text-5xl font-bold my-2">{Math.round(ev.estimated_success_score || 0)}</p>
        <p className="text-sm opacity-80">out of 100 · {ev.confidence_level || "Moderate"} confidence</p>
        <p className="text-xs mt-2 opacity-60 italic">This estimate supports human decision-making and does not determine hiring outcomes.</p>
      </div>

      {/* Score Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <ScoreRow label="Overall Match" score={ev.overall_match_score} />
          <ScoreRow label="Resume Match" score={ev.resume_match} />
          <ScoreRow label="Skills Match" score={ev.skills_match} />
          <ScoreRow label="Experience Match" score={ev.experience_match} />
        </div>
        <div className="space-y-3">
          <ScoreRow label="Interview Score" score={ev.interview_score} />
          <ScoreRow label="Competency Match" score={ev.competency_match} />
          <ScoreRow label="Evidence Completeness" score={ev.evidence_completeness} />
          <div className="text-sm">
            <span style={{ color: MUTED_DARK }}>Confidence: </span>
            <span className="font-semibold" style={{ color: TEXT_DARK }}>{ev.confidence_rating || "—"}</span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      {ev.overall_recommendation && (
        <div className="rounded-lg p-3" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.2)" }}>
          <p className="text-sm font-semibold" style={{ color: GOLD_DARK }}>AI Recommendation</p>
          <p className="text-sm mt-1" style={{ color: TEXT_DARK }}>{ev.overall_recommendation}</p>
        </div>
      )}

      {/* Strengths & Development Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListSection title="Strengths" items={ev.strengths} icon={TrendingUp} color={GOLD_DARK} />
        <ListSection title="Development Areas" items={ev.development_areas} icon={TrendingDown} color="#c2410c" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListSection title="Missing Information" items={ev.missing_information} icon={AlertTriangle} color="#991b1b" />
      </div>

      {/* Evidence Summary */}
      {ev.evidence_summary && (
        <div className="rounded-lg p-3" style={{ backgroundColor: "#F5F2EC", border: "1px solid rgba(184,149,106,0.12)" }}>
          <p className="text-sm font-semibold mb-1 flex items-center gap-1.5" style={{ color: TEXT_DARK }}><Info className="w-4 h-4" style={{ color: MUTED_DARK }} /> Evidence Summary</p>
          <p className="text-sm" style={{ color: TEXT_DARK }}>{ev.evidence_summary}</p>
        </div>
      )}

      {/* Score Explanations */}
      {ev.score_explanations && Object.keys(ev.score_explanations).length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: TEXT_DARK }}>Score Explanations</p>
          <div className="space-y-2">
            {Object.entries(ev.score_explanations).map(([key, val]) => (
              <div key={key} className="text-sm">
                <span className="font-medium capitalize" style={{ color: MUTED_DARK }}>{key.replace(/_/g, " ")}: </span>
                <span style={{ color: TEXT_DARK }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}