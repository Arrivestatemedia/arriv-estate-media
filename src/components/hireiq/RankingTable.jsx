import React, { useState } from "react";
import { scoreColor, computeCompositeScore, computeApplicationScore } from "@/lib/hireiq";
import { Trophy, ChevronDown, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: MUTED_LIGHT }}>—</span>;
  const colorClass = scoreColor(score);
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${colorClass}`} style={{ fontFamily: "'SF Mono', monospace" }}>
      {Math.round(score)}
    </span>
  );
}

function ReasonCell({ evaluation }) {
  const rec = evaluation?.overall_recommendation;
  if (!rec) return <span style={{ color: MUTED_LIGHT, fontSize: "0.75rem" }}>Not evaluated yet</span>;
  return (
    <span style={{ color: CREAM, fontSize: "0.75rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
      {rec}
    </span>
  );
}

function ExpandedReasoning({ candidate, composite }) {
  const ev = candidate.evaluation || {};
  const appScore = computeApplicationScore(candidate);
  const hasData = candidate.evaluation || candidate.resume_analysis;

  if (!hasData) {
    return (
      <div className="px-4 py-3" style={{ backgroundColor: "#222" }}>
        <p className="text-xs" style={{ color: MUTED_LIGHT }}>
          This candidate hasn't been evaluated yet. Click "Evaluate All" above to generate AI scores and reasoning.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-3" style={{ backgroundColor: "#222" }}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <p style={{ color: MUTED_LIGHT }}>Application Score</p>
          <ScoreBadge score={appScore} />
        </div>
        <div>
          <p style={{ color: MUTED_LIGHT }}>Resume Match</p>
          <ScoreBadge score={ev.resume_match} />
        </div>
        <div>
          <p style={{ color: MUTED_LIGHT }}>Experience Match</p>
          <ScoreBadge score={ev.experience_match} />
        </div>
        <div>
          <p style={{ color: MUTED_LIGHT }}>Skills Match</p>
          <ScoreBadge score={ev.skills_match} />
        </div>
      </div>

      {ev.overall_recommendation && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>AI Recommendation</p>
          <p className="text-xs" style={{ color: CREAM }}>{ev.overall_recommendation}</p>
        </div>
      )}

      {ev.evidence_summary && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>Evidence Summary</p>
          <p className="text-xs" style={{ color: CREAM }}>{ev.evidence_summary}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ev.strengths?.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>Strengths</p>
            <ul className="text-xs space-y-0.5" style={{ color: CREAM }}>
              {ev.strengths.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
          </div>
        )}
        {ev.development_areas?.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-1" style={{ color: "#FB923C" }}>Development Areas</p>
            <ul className="text-xs space-y-0.5" style={{ color: CREAM }}>
              {ev.development_areas.map((d, i) => <li key={i}>• {d}</li>)}
            </ul>
          </div>
        )}
      </div>

      {candidate.resume_analysis && (
        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: GOLD }}>Resume Analysis Highlights</p>
          <div className="text-xs space-y-1" style={{ color: CREAM }}>
            {candidate.resume_analysis.strong_matches?.length > 0 && (
              <p><span style={{ color: GOLD }}>Strong matches:</span> {candidate.resume_analysis.strong_matches.join(", ")}</p>
            )}
            {candidate.resume_analysis.missing_experience?.length > 0 && (
              <p><span style={{ color: "#FCA5A5" }}>Missing:</span> {candidate.resume_analysis.missing_experience.join(", ")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RankingTable({ candidates, jobId, onSelectCandidate, onEvaluateAll, evaluating }) {
  const [expanded, setExpanded] = useState(null);

  const ranked = [...candidates].sort((a, b) => {
    const aComposite = computeCompositeScore(a) ?? computeApplicationScore(a) ?? 0;
    const bComposite = computeCompositeScore(b) ?? computeApplicationScore(b) ?? 0;
    return bComposite - aComposite;
  });

  const unevaluatedCount = candidates.filter(c => !c.evaluation).length;

  if (ranked.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: MUTED_LIGHT }}>
        <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No candidates yet. Add candidates to see rankings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {unevaluatedCount > 0 && onEvaluateAll && (
        <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: "rgba(184,149,106,0.08)", border: "1px solid rgba(184,149,106,0.2)" }}>
          <div>
            <p className="text-sm font-medium" style={{ color: CREAM }}>
              {unevaluatedCount} candidate{unevaluatedCount !== 1 ? "s" : ""} not yet evaluated
            </p>
            <p className="text-xs" style={{ color: MUTED_LIGHT }}>Run AI evaluation to generate scores and ranking reasoning.</p>
          </div>
          <Button size="sm" onClick={onEvaluateAll} disabled={evaluating} style={{ backgroundColor: GOLD, color: "#0A0A0A", border: "none", fontWeight: 600 }}>
            {evaluating ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Evaluating...</> : <><Sparkles className="w-4 h-4 mr-1" /> Evaluate All</>}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ borderBottom: "1px solid rgba(184,149,106,0.12)", color: MUTED_LIGHT }}>
              <th className="py-2 px-2 w-8"></th>
              <th className="py-2 px-2 w-12">Rank</th>
              <th className="py-2 px-2">Candidate</th>
              <th className="py-2 px-2 text-center">Composite</th>
              <th className="py-2 px-2 text-center">AI Eval</th>
              <th className="py-2 px-2 text-center">Round 1</th>
              <th className="py-2 px-2 text-center">Round 2</th>
              <th className="py-2 px-2 text-center">Resume</th>
              <th className="py-2 px-2">Why This Rank</th>
              <th className="py-2 px-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((c, i) => {
              const ev = c.evaluation || {};
              const composite = computeCompositeScore(c);
              const evalScore = ev.estimated_success_score;
              const r1Score = c.round1_scorecard?.total_score;
              const r2Score = c.round2_scorecard?.total_score;
              const isExpanded = expanded === c.id;
              return (
                <React.Fragment key={c.id}>
                  <tr className="cursor-pointer transition-colors"
                    style={{ borderBottom: "1px solid rgba(184,149,106,0.06)", color: CREAM }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = "#252525"}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                    onClick={() => onSelectCandidate?.(c)}>
                    <td className="py-2 px-2" onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : c.id); }}>
                      {isExpanded ? <ChevronDown className="w-4 h-4" style={{ color: GOLD }} /> : <ChevronRight className="w-4 h-4" style={{ color: MUTED_LIGHT }} />}
                    </td>
                    <td className="py-2 px-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={{
                        backgroundColor: i === 0 ? "rgba(184,149,106,0.15)" : "transparent",
                        color: i === 0 ? GOLD : MUTED_LIGHT,
                        border: "1px solid rgba(184,149,106,0.15)",
                      }}>{i + 1}</span>
                    </td>
                    <td className="py-2 px-2 font-medium">{c.name}</td>
                    <td className="py-2 px-2 text-center"><ScoreBadge score={composite} /></td>
                    <td className="py-2 px-2 text-center"><ScoreBadge score={evalScore} /></td>
                    <td className="py-2 px-2 text-center"><ScoreBadge score={r1Score} /></td>
                    <td className="py-2 px-2 text-center"><ScoreBadge score={r2Score} /></td>
                    <td className="py-2 px-2 text-center text-xs" style={{ fontFamily: "'SF Mono', monospace" }}>
                      {ev.resume_match != null ? Math.round(ev.resume_match) : "—"}
                    </td>
                    <td className="py-2 px-2" style={{ maxWidth: "220px" }}>
                      <ReasonCell evaluation={ev} />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#2A2A2A", color: CREAM }}>{c.status}</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, borderBottom: "1px solid rgba(184,149,106,0.12)" }}>
                        <ExpandedReasoning candidate={c} composite={composite} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2" style={{ color: MUTED_LIGHT }}>
        Initial ranking is based on application (resume &amp; experience). After Round 1, composite blends application (50%) + Round 1 (50%). After Round 2, composite blends application (40%) + Round 1 (30%) + Round 2 (30%). Click the chevron to see full reasoning.
      </p>
    </div>
  );
}