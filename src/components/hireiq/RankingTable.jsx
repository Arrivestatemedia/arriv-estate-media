import React from "react";
import { scoreColor } from "@/lib/hireiq";
import { Trophy } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";

export default function RankingTable({ candidates, jobId, onSelectCandidate }) {
  const ranked = [...candidates].sort((a, b) => {
    const aScore = a.evaluation?.estimated_success_score || 0;
    const bScore = b.evaluation?.estimated_success_score || 0;
    return bScore - aScore;
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
            <th className="py-2 px-2 text-center">Success Score</th>
            <th className="py-2 px-2 text-center">Confidence</th>
            <th className="py-2 px-2 text-center">Interview</th>
            <th className="py-2 px-2 text-center">Resume</th>
            <th className="py-2 px-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((c, i) => {
            const ev = c.evaluation || {};
            const score = ev.estimated_success_score;
            const colorClass = score != null ? scoreColor(score) : "text-gray-400 bg-gray-500/10 border-gray-500/30";
            return (
              <tr key={c.id} className="cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid rgba(184,149,106,0.06)", color: CREAM }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,251,245,0.04)"}
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
                  {score != null ? (
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${colorClass}`} style={{ fontFamily: "'SF Mono', monospace" }}>{Math.round(score)}</span>
                  ) : <span style={{ color: MUTED_LIGHT }}>—</span>}
                </td>
                <td className="py-2 px-2 text-center text-xs" style={{ color: MUTED_LIGHT }}>{ev.confidence_level || "—"}</td>
                <td className="py-2 px-2 text-center text-xs" style={{ fontFamily: "'SF Mono', monospace" }}>{ev.interview_score != null ? Math.round(ev.interview_score) : "—"}</td>
                <td className="py-2 px-2 text-center text-xs" style={{ fontFamily: "'SF Mono', monospace" }}>{ev.resume_match != null ? Math.round(ev.resume_match) : "—"}</td>
                <td className="py-2 px-2 text-center">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,251,245,0.08)", color: CREAM }}>{c.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}