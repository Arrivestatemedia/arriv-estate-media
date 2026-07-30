import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { scoreColor } from "@/lib/hireiq";
import { Trophy } from "lucide-react";

export default function RankingTable({ candidates, jobId }) {
  const navigate = useNavigate();
  const ranked = [...candidates].sort((a, b) => {
    const aScore = a.evaluation?.estimated_success_score || 0;
    const bScore = b.evaluation?.estimated_success_score || 0;
    return bScore - aScore;
  });

  if (ranked.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No candidates yet. Add candidates to see rankings.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
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
              <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(createPageUrl("HireIQCandidateDetail") + `?id=${c.id}`)}>
                <td className="py-2 px-2">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                    i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-200 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "text-gray-400"
                  }`}>{i + 1}</span>
                </td>
                <td className="py-2 px-2 font-medium">{c.name}</td>
                <td className="py-2 px-2 text-center">
                  {score != null ? (
                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${colorClass}`}>{Math.round(score)}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="py-2 px-2 text-center text-xs text-gray-500">{ev.confidence_level || "—"}</td>
                <td className="py-2 px-2 text-center text-xs">{ev.interview_score != null ? Math.round(ev.interview_score) : "—"}</td>
                <td className="py-2 px-2 text-center text-xs">{ev.resume_match != null ? Math.round(ev.resume_match) : "—"}</td>
                <td className="py-2 px-2 text-center">
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{c.status}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}