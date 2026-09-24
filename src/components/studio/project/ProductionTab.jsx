import React from "react";
import { AlertTriangle, Grid, Speaker, Scissors, Plus, CheckCircle2 } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Production Tab — warnings, estimate, audio QC, deliverables.
// Matches canonical Arriv Studio Production tab.
export default function ProductionTab({ project, entitlement, onLaunchStudio }) {
  const remaining = entitlement?.minutes_remaining ?? 5;
  const estimated = project?.targetRuntime ? `${project.targetRuntime} min` : "2 min";
  const purchased = 0;

  const blockers = [
    "storyboard not approved",
    "no script",
    "no storyboard",
    "no presenter selected",
    "no voice selected",
  ];

  return (
    <div style={{ ...STUDIO_FONT }} className="space-y-5 max-w-3xl">
      {/* Warning box */}
      <div className="rounded-xl p-4" style={{ background: C.container, border: "1px solid #8a6d1f" }}>
        <div className="flex items-start gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#c9a227" }} />
          <span className="text-sm font-semibold" style={{ color: C.text }}>Not ready to produce yet:</span>
        </div>
        <ul className="ml-6 space-y-1">
          {blockers.map((b) => (
            <li key={b} className="text-sm" style={{ color: C.muted }}>• {b}</li>
          ))}
        </ul>
      </div>

      {/* Production Estimate */}
      <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-4">
          <Grid className="w-4 h-4" style={{ color: C.muted }} />
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>Production Estimate</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <EstimateBox label="Estimated" value={estimated} />
          <EstimateBox label="Remaining" value={`${remaining} min`} />
          <EstimateBox label="Purchased" value={`${purchased} min`} />
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: C.muted }}>
          <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
          Within your included allowance.
        </div>
      </div>

      {/* Start Production */}
      <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: C.text }}>Start Production</h2>
        <p className="text-sm" style={{ color: C.muted }}>
          Complete script approval and storyboard (Approve & Produce) to unlock production.
        </p>
      </div>

      {/* Audio QC */}
      <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Speaker className="w-4 h-4" style={{ color: C.muted }} />
          <h2 className="text-sm font-semibold" style={{ color: C.text }}>Audio QC</h2>
        </div>
        <p className="text-sm mb-4" style={{ color: C.muted }}>
          Dialogue loudness, music loudness, automatic ducking, normalization, peak/clipping/silence detection.
        </p>
        <div className="flex gap-2">
          {["Subtle", "Balanced", "Prominent"].map((opt) => (
            <button
              key={opt}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: opt === "Balanced" ? "rgba(255,90,79,0.15)" : "transparent",
                border: `1px solid ${opt === "Balanced" ? C.accent : C.border}`,
                color: opt === "Balanced" ? C.accent : C.muted,
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Deliverables & Cutdowns */}
      <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <h2 className="text-sm font-semibold mb-2" style={{ color: C.text }}>Deliverables & Cutdowns</h2>
        <p className="text-sm mb-4" style={{ color: C.muted }}>
          Multiple deliverables from one approved project. Each consumes Studio Production Minutes.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "+ Add 9:16 variation", icon: Plus },
            { label: "+ Add 4:5 variation", icon: Plus },
            { label: "+ Add 1:1 variation", icon: Plus },
            { label: "Social cutdown (9:16)", icon: Scissors },
          ].map((d) => {
            const Icon = d.icon;
            return (
              <button
                key={d.label}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:border-[#FF5A4F]/40"
                style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted }}
              >
                <Icon className="w-3.5 h-3.5" /> {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Render Jobs header */}
      <div>
        <h2 className="text-sm font-semibold" style={{ color: C.text }}>Render Jobs</h2>
      </div>
    </div>
  );
}

function EstimateBox({ label, value }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: "#0f0f0f", border: `1px solid ${C.border}` }}>
      <p className="text-xs mb-1" style={{ color: C.muted }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: C.text }}>{value}</p>
    </div>
  );
}