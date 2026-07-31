import React from "react";
import { scoreColor } from "@/lib/hireiq";
import { Trophy } from "lucide-react";

const CREAM = "#f3efe9";
const DARK_BORDER = "#1a2021";
const DARK_TEXT = "#2a3536";
const GOLD = "#B8956A";

export default function RankingTable({ candidates, jobId, onSelectCandidate }) {
  const ranked = [...candidates].sort((a, b) => {
    const aScore = a.evaluation?.estimated_success_score || 0;
    const bScore = b.evaluation?.estimated_success_score || 0;
    return bScore - aScore;
  });

  if (ranked.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "#6b7c7a" }}>
        <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No candidates yet. Add candidates to see rankings.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: DARK_BORDER, color: "#6b7c7a" }}>
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
              <tr key={c.id} className="border-b cursor-pointer transition-colors hover:bg-opacity-50"
                style={{ borderColor: "rgba(26,32,33,0.1)", color: DARK_TEXT }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = "#ede8e0"}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}
                onClick={() => onSelectCandidate?.(c)}>
                <td className="py-2 px-2">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={{
                    backgroundColor: i === 0 ? "#fef3c7" : i === 1 ? "#e5e7eb" : i === 2 ? "#fed7aa" : "transparent",
                    color: i === 0 ? "#92400e" : i === 1 ? "#4b5563" : i === 2 ? "#9a3412" : "#6b7c7a",
                    border: `1px solid ${DARK_BORDER}`,
                  }}>{i + 1}</span>
                </td>
                <td className="py-2 px-2 font-medium">{c.name}</td>
                <td className="py-2 px-2 text-center">
                  {score != null ? (
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${colorClass}`}>{Math.round(score)}</span>
                  ) : <span style={{ color: "#6b7c7a" }}>—</span>}
                </td>
                <td className="py-2 px-2 text-center text-xs" style={{ color: "#6b7c7a" }}>{ev.confidence_level || "—"}</td>
                <td className="py-2 px-2 text-center text-xs">{ev.interview_score != null ? Math.round(ev.interview_score) : "—"}</td>
                <td className="py-2 px-2 text-center text-xs">{ev.resume_match != null ? Math.round(ev.resume_match) : "—"}</td>
                <td className="py-2 px-2 text-center">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#e5e7eb", color: DARK_TEXT }}>{c.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}