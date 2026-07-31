import React from "react";
import { scoreColor, computeCompositeScore } from "@/lib/hireiq";
import { Trophy } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";

function ScoreBadge({ score, label }) {
  if (score == null) return <span style={{ color: MUTED_LIGHT }}>—</span>;
  const colorClass = scoreColor(score);
  return (
    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${colorClass}`} style={{ fontFamily: "'SF Mono', monospace" }}>
      {Math.round(score)}
    </span>
  );
}

export default function RankingTable({ candidates, jobId, onSelectCandidate }) {
  const ranked = [...candidates].sort((a, b) => {
    const aComposite = computeCompositeScore(a) ?? a.evaluation?.estimated_success_score ?? 0;
    const bComposite = computeCompositeScore(b) ?? b.evaluation?.estimated_success_score ?? 0;
    return bComposite - aComposite;
  });

  if (ranked.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: MUTED_LIGHT }}>
        <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No candidates yet. Add candidates to see rankings.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ borderBottom: "1px solid rgba(184,149,106,0.12)", color: MUTED_LIGHT }}>
            <th className="py-2 px-2 w-12">Rank</th>
            <th className="py-2 px-2">Candidate</th>
            <th className="py-2 px-2 text-center">Composite</th>
            <th className="py-2 px-2 text-center">AI Eval</th>
            <th className="py-2 px-2 text-center">Round 1</th>
            <th className="py-2 px-2 text-center">Round 2</th>
            <th className="py-2 px-2 text-center">Resume</th>
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
            return (
              <tr key={c.id} className="cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid rgba(184,149,106,0.06)", color: CREAM }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#252525"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                onClick={() => onSelectCandidate?.(c)}>
                <td className="py-2 px-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={{
                    backgroundColor: i === 0 ? "rgba(184,149,106,0.15)" : "transparent",
                    color: i === 0 ? GOLD : MUTED_LIGHT,
                    border: "1px solid rgba(184,149,106,0.15)",
                  }}>{i + 1}</span>
                </td>
                <td className="py-2 px-2 font-medium">{c.name}</td>
                <td className="py-2 px-2 text-center">
                  <ScoreBadge score={composite} />
                </td>
                <td className="py-2 px-2 text-center">
                  <ScoreBadge score={evalScore} />
                </td>
                <td className="py-2 px-2 text-center">
                  <ScoreBadge score={r1Score} />
                </td>
                <td className="py-2 px-2 text-center">
                  <ScoreBadge score={r2Score} />
                </td>
                <td className="py-2 px-2 text-center text-xs" style={{ fontFamily: "'SF Mono', monospace" }}>
                  {ev.resume_match != null ? Math.round(ev.resume_match) : "—"}
                </td>
                <td className="py-2 px-2 text-center">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#2A2A2A", color: CREAM }}>{c.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs mt-3" style={{ color: MUTED_LIGHT }}>
        Composite score blends AI evaluation (40%), Round 1 scorecard (30%), and Round 2 scorecard (30%) — weighted by available data.
      </p>
    </div>
  );
}