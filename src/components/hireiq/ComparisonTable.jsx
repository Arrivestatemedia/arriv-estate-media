import React, { useState } from "react";
import { scoreColor } from "@/lib/hireiq";
import { Checkbox } from "@/components/ui/checkbox";

const FIELDS = [
  { key: "estimated_success_score", label: "Success Score", type: "score" },
  { key: "resume_match", label: "Resume Match", type: "score" },
  { key: "interview_score", label: "Interview Score", type: "score" },
  { key: "skills_match", label: "Skills Match", type: "score" },
  { key: "experience_match", label: "Experience Match", type: "score" },
  { key: "competency_match", label: "Competency Match", type: "score" },
  { key: "confidence_level", label: "Confidence", type: "text" },
  { key: "overall_recommendation", label: "Recommendation", type: "text" },
  { key: "strengths", label: "Strengths", type: "list" },
  { key: "development_areas", label: "Development Areas", type: "list" },
];

export default function ComparisonTable({ candidates }) {
  const [selected, setSelected] = useState(candidates.map(c => c.id).slice(0, 3));
  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toCompare = candidates.filter(c => selected.includes(c.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {candidates.map(c => (
          <label key={c.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-50">
            <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
            {c.name}
          </label>
        ))}
      </div>

      {toCompare.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Select candidates to compare</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border p-2 text-left text-gray-500 bg-gray-50 w-40">Metric</th>
                {toCompare.map(c => (
                  <th key={c.id} className="border p-2 text-center font-semibold bg-gray-50">{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(field => (
                <tr key={field.key}>
                  <td className="border p-2 font-medium text-gray-600">{field.label}</td>
                  {toCompare.map(c => {
                    const val = c.evaluation?.[field.key];
                    return (
                      <td key={c.id} className="border p-2 text-center align-top">
                        {field.type === "score" && val != null ? (
                          <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${scoreColor(val)}`}>{Math.round(val)}</span>
                        ) : field.type === "list" && Array.isArray(val) ? (
                          <ul className="text-left text-xs space-y-0.5">
                            {val.slice(0, 4).map((item, i) => <li key={i}>• {item}</li>)}
                          </ul>
                        ) : (
                          <span className="text-xs text-gray-600">{val || "—"}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}