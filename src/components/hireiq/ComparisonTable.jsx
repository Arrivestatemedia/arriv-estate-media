import React, { useState } from "react";
import { scoreColor } from "@/lib/hireiq";
import { Checkbox } from "@/components/ui/checkbox";

const CREAM = "#f3efe9";
const DARK_BORDER = "#1a2021";
const DARK_TEXT = "#2a3536";
const GOLD = "#B8956A";

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
          <label key={c.id} className="flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
            style={{ backgroundColor: selected.includes(c.id) ? "#ede8e0" : CREAM, border: `1px solid ${DARK_BORDER}`, color: DARK_TEXT }}>
            <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
            {c.name}
          </label>
        ))}
      </div>

      {toCompare.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "#6b7c7a" }}>Select candidates to compare</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left w-40" style={{ backgroundColor: "#ede8e0", border: `1px solid ${DARK_BORDER}`, color: "#6b7c7a" }}>Metric</th>
                {toCompare.map(c => (
                  <th key={c.id} className="p-2 text-center font-bold" style={{ backgroundColor: "#ede8e0", border: `1px solid ${DARK_BORDER}`, color: DARK_TEXT }}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(field => (
                <tr key={field.key}>
                  <td className="p-2 font-medium" style={{ border: `1px solid ${DARK_BORDER}`, color: "#6b7c7a" }}>{field.label}</td>
                  {toCompare.map(c => {
                    const val = c.evaluation?.[field.key];
                    return (
                      <td key={c.id} className="p-2 text-center align-top" style={{ border: `1px solid ${DARK_BORDER}`, color: DARK_TEXT }}>
                        {field.type === "score" && val != null ? (
                          <span className={`inline-block px-2 py-0.5 rounded border text-xs font-bold ${scoreColor(val)}`}>{Math.round(val)}</span>
                        ) : field.type === "list" && Array.isArray(val) ? (
                          <ul className="text-left text-xs space-y-0.5">
                            {val.slice(0, 4).map((item, i) => <li key={i}>• {item}</li>)}
                          </ul>
                        ) : (
                          <span className="text-xs" style={{ color: DARK_TEXT }}>{val || "—"}</span>
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