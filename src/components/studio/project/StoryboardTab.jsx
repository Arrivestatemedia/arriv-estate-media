import React from "react";
import { Film, AlertCircle } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Storyboard Tab — empty state matching canonical Arriv Studio.
// "No storyboard yet" with "A script is required first" warning.
export default function StoryboardTab({ project, onLaunchStudio }) {
  return (
    <div style={{ ...STUDIO_FONT }}>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => onLaunchStudio?.({ section: "storyboard" })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: C.accent, color: "#ffffff" }}
        >
          <Film className="w-4 h-4" /> Generate Storyboard
        </button>
      </div>
      <div className="rounded-xl p-12 text-center" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
          <Film className="w-6 h-6" style={{ color: C.accent }} />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>No storyboard yet</h2>
        <p className="text-sm max-w-md mx-auto mb-2" style={{ color: C.muted }}>
          After script approval, the AI Director generates a scene-level production plan.
          Choose a direction preset and generate.
        </p>
        <p className="text-sm flex items-center justify-center gap-1.5" style={{ color: C.accent }}>
          <AlertCircle className="w-4 h-4" /> A script is required first.
        </p>
      </div>
    </div>
  );
}