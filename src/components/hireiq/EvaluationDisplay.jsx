import React from "react";
import { scoreColor, scoreBar } from "@/lib/hireiq";
import { AlertTriangle, TrendingUp, TrendingDown, Info } from "lucide-react";

function ScoreRow({ label, score }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{Math.round(score || 0)}/100</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
      <ul className="text-sm text-gray-700 space-y-1 ml-6">
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
      <div className={`rounded-xl border-2 p-6 text-center ${successColor}`}>
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
            <span className="text-gray-600">Confidence: </span>
            <span className="font-semibold">{ev.confidence_rating || "—"}</span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      {ev.overall_recommendation && (
        <div className="bg-[#B8956A]/10 border border-[#B8956A]/30 rounded-lg p-3">
          <p className="text-sm font-semibold text-[#A68559]">AI Recommendation</p>
          <p className="text-sm text-gray-700 mt-1">{ev.overall_recommendation}</p>
        </div>
      )}

      {/* Strengths & Development Areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListSection title="Strengths" items={ev.strengths} icon={TrendingUp} color="#16a34a" />
        <ListSection title="Development Areas" items={ev.development_areas} icon={TrendingDown} color="#ea580c" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListSection title="Missing Information" items={ev.missing_information} icon={AlertTriangle} color="#dc2626" />
      </div>

      {/* Evidence Summary */}
      {ev.evidence_summary && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm font-semibold mb-1 flex items-center gap-1.5"><Info className="w-4 h-4 text-gray-500" /> Evidence Summary</p>
          <p className="text-sm text-gray-700">{ev.evidence_summary}</p>
        </div>
      )}

      {/* Score Explanations */}
      {ev.score_explanations && Object.keys(ev.score_explanations).length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Score Explanations</p>
          <div className="space-y-2">
            {Object.entries(ev.score_explanations).map(([key, val]) => (
              <div key={key} className="text-sm">
                <span className="font-medium capitalize text-gray-600">{key.replace(/_/g, " ")}: </span>
                <span className="text-gray-700">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}