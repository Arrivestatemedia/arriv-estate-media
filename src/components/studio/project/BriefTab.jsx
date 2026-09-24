import React from "react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0",
};

// Brief Tab — displays the creative brief fields in a label/value grid.
// Matches canonical Arriv Studio Brief tab layout.
export default function BriefTab({ project }) {
  const rows = [
    { label: "Description", value: project?.description },
    { label: "Content type", value: project?.contentType },
    { label: "Audience", value: project?.audience },
    { label: "Objective", value: project?.objective },
    { label: "Tone", value: project?.tone },
    { label: "Target runtime", value: project?.targetRuntime ? `${project.targetRuntime} min` : null },
    { label: "Destination", value: project?.destination },
    { label: "Call to action", value: project?.callToAction },
    { label: "Required information", value: project?.requiredInfo },
    { label: "Prohibited claims", value: project?.prohibitedClaims },
    { label: "Brand requirements", value: project?.brandRequirements },
    { label: "Presenter preferences", value: project?.presenterPreferences },
    { label: "Reference materials", value: null },
    { label: "Industry context", value: project?.industryContext },
  ];

  return (
    <div style={{ ...STUDIO_FONT }}>
      <h2 className="text-xl font-bold mb-4" style={{ color: C.text }}>Creative Brief</h2>
      <div className="rounded-xl p-6" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="divide-y" style={{ borderColor: C.border }}>
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between py-3 gap-8" style={{ borderColor: C.border }}>
              <span className="text-sm shrink-0" style={{ color: C.muted }}>{r.label}</span>
              <span className="text-sm text-right" style={{ color: r.value ? C.text : C.muted }}>
                {r.value || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}