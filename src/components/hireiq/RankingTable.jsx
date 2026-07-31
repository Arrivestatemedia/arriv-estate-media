import React from "react";
import { scoreColor } from "@/lib/hireiq";
import { Trophy } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const TEXT_DARK = "#1A1A1A";
const MUTED_DARK = "rgba(26,26,26,0.45)";

export default function RankingTable({ candidates, jobId, onSelectCandidate }) {
  const ranked = [...candidates].sort((a, b) => {
    const aScore = a.evaluation?.estimated_success_score || 0;
    const bScore = b.evaluation?.estimated_success_score || 0;
    return bScore - aScore;
  });

  if (ranked.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: MUTED_DARK }}>
        <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No candidates yet. Add candidates to see rankings.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ borderBottom: "1px solid rgba(184,149,106,0.12)", color: MUTED_DARK }}>
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
            const colorClass = score != null ? scoreColor(score) : "text-gray-400 bg-gray-50 border-gray-200";
            return (
              <tr key={c.id} className="cursor-pointer transition-colors"
                style={{ borderBottom: "1px solid rgba(184,149,106,0.06)", color: TEXT_DARK }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#F5F2EC"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                onClick={() => onSelectCandidate?.(c)}>
                <td className="py-2 px-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={{
                    backgroundColor: i === 0 ? "#FEF3C7" : i === 1 ? "#F5F2EC" : i === 2 ? "#FEF3C7" : "transparent",
                    color: i === 0 ? "#92400e" : i === 1 ? "#6B6B6B" : i === 2 ? "#92400e" : MUTED_DARK,
                    border: "1px solid rgba(184,149,106,0.15)",
                  }}>{i + 1}</span>
                </td>
                <td className="py-2 px-2 font-medium">{c.name}</td>
                <td className="py-2 px-2 text-center">
                  {score != null ? (
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${colorClass}`}>{Math.round(score)}</span>
                  ) : <span style={{ color: MUTED_DARK }}>—</span>}
                </td>
                <td className="py-2 px-2 text-center text-xs" style={{ color: MUTED_DARK }}>{ev.confidence_level || "—"}</td>
                <td className="py-2 px-2 text-center text-xs">{ev.interview_score != null ? Math.round(ev.interview_score) : "—"}</td>
                <td className="py-2 px-2 text-center text-xs">{ev.resume_match != null ? Math.round(ev.resume_match) : "—"}</td>
                <td className="py-2 px-2 text-center">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#E8E5E0", color: TEXT_DARK }}>{c.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}