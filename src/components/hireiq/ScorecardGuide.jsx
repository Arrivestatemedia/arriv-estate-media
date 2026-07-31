import React, { useState } from "react";
import { Info, ChevronDown } from "lucide-react";

const CREAM = "#FFFBF5";
const GOLD = "#B8956A";
const MUTED_LIGHT = "rgba(255,251,245,0.5)";
const SERIF = { fontFamily: "Georgia, 'Times New Roman', serif" };

const RATINGS = [
  { num: 1, label: "Poor", desc: "Candidate shows no evidence of this competency. Answer was vague, defensive, or missing entirely." },
  { num: 2, label: "Below Average", desc: "Weak or inconsistent evidence. Candidate struggled to provide concrete examples." },
  { num: 3, label: "Average", desc: "Adequate evidence. Candidate provided a basic example but lacked depth or impact." },
  { num: 4, label: "Good", desc: "Strong evidence with a clear, specific example. Candidate demonstrated the competency well." },
  { num: 5, label: "Excellent", desc: "Exceptional evidence. Candidate provided a detailed, impactful example that exceeded expectations." },
];

export default function ScorecardGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ backgroundColor: "#1A1A1A", border: "1px solid rgba(184,149,106,0.2)", borderRadius: "12px", marginBottom: "12px", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ backgroundColor: "rgba(184,149,106,0.06)" }}
      >
        <span className="flex items-center gap-2 text-sm font-bold" style={{ ...SERIF, color: CREAM }}>
          <Info className="w-4 h-4" style={{ color: GOLD }} />
          How to Use This Scorecard
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: GOLD }} />
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4">
          {/* Rating Scale */}
          <div>
            <p className="text-sm font-bold mb-2" style={{ ...SERIF, color: GOLD }}>Rating Scale (1–5)</p>
            <p className="text-xs mb-3" style={{ color: MUTED_LIGHT }}>
              Rate each question on a 1–5 scale based on the evidence the candidate provides. Always cite specific examples in the Evidence field.
            </p>
            <div className="space-y-1.5">
              {RATINGS.map(r => (
                <div key={r.num} className="flex items-start gap-3 rounded p-2" style={{ backgroundColor: "#2A2A2A" }}>
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ backgroundColor: r.num >= 4 ? GOLD : r.num >= 3 ? "rgba(184,149,106,0.4)" : "rgba(252,165,165,0.2)", color: r.num >= 4 ? "#1A1A1A" : CREAM }}>
                    {r.num}
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: CREAM }}>{r.label}</p>
                    <p className="text-xs" style={{ color: MUTED_LIGHT }}>{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* How Scores Are Calculated */}
          <div>
            <p className="text-sm font-bold mb-2" style={{ ...SERIF, color: GOLD }}>How Scores Are Calculated</p>
            <div className="space-y-2 text-xs" style={{ color: CREAM }}>
              <div className="rounded p-2.5" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-semibold mb-1" style={{ color: CREAM }}>Section Score (0–100)</p>
                <p style={{ color: MUTED_LIGHT }}>Each section's score = (weighted average of question ratings ÷ 5) × 100. Only questions with a rating above 0 are counted.</p>
              </div>
              <div className="rounded p-2.5" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-semibold mb-1" style={{ color: CREAM }}>Competency Score (0–100)</p>
                <p style={{ color: MUTED_LIGHT }}>Each competency's score = (weighted average of ratings from all questions measuring it ÷ 5) × 100. A single question can measure multiple competencies.</p>
              </div>
              <div className="rounded p-2.5" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-semibold mb-1" style={{ color: CREAM }}>Total Score (0–100)</p>
                <p style={{ color: MUTED_LIGHT }}>The overall score = weighted average of all section scores, using each section's weight percentage. This means sections with higher weights have more impact on the final score.</p>
              </div>
              <div className="rounded p-2.5" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-semibold mb-1" style={{ color: CREAM }}>Question Weight</p>
                <p style={{ color: MUTED_LIGHT }}>Each question has a weight (default 1). Higher weights (2, 3) are used for critical questions that should count more toward the section and competency scores.</p>
              </div>
            </div>
          </div>

          {/* Evidence-Based Evaluation */}
          <div>
            <p className="text-sm font-bold mb-2" style={{ ...SERIF, color: GOLD }}>Evidence-Based Evaluation</p>
            <div className="rounded p-2.5 text-xs space-y-1.5" style={{ backgroundColor: "#2A2A2A", color: MUTED_LIGHT }}>
              <p>• <span style={{ color: CREAM }}>Evidence field is mandatory</span> for any question rated above 0. Write what the candidate actually said or did.</p>
              <p>• <span style={{ color: CREAM }}>Excellent Answer</span> and <span style={{ color: CREAM }}>Poor Answer</span> guidance is provided for each question — use these as benchmarks.</p>
              <p>• <span style={{ color: CREAM }}>Why This Matters</span> explains the intent behind each question and what it reveals about the candidate.</p>
              <p>• Rate based on <span style={{ color: CREAM }}>demonstrated evidence only</span>, not assumptions or potential.</p>
            </div>
          </div>

          {/* Two-Round System */}
          <div>
            <p className="text-sm font-bold mb-2" style={{ ...SERIF, color: GOLD }}>Two-Round Interview System</p>
            <div className="space-y-2 text-xs" style={{ color: MUTED_LIGHT }}>
              <div className="rounded p-2.5" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-semibold" style={{ color: CREAM }}>Round 1 — General Competency</p>
                <p>Same 7 sections for every candidate: Communication, Confidence, Coachability, Work Ethic, Professionalism, Problem Solving, and Culture Fit. Assesses baseline soft skills.</p>
              </div>
              <div className="rounded p-2.5" style={{ backgroundColor: "#2A2A2A" }}>
                <p className="font-semibold" style={{ color: CREAM }}>Round 2 — Role-Specific</p>
                <p>Deep-dive questions tailored to the specific job. Generated by AI from the job description and role success profile. Goes beyond Round 1 with technical and situational questions.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}