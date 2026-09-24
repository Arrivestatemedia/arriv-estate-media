import React from "react";
import { Sparkles } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Script Tab — empty state matching canonical Arriv Studio.
// "No script yet" with Generate Script button that launches Studio.
export default function ScriptTab({ project, onLaunchStudio }) {
  return (
    <div style={{ ...STUDIO_FONT }}>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => onLaunchStudio?.({ section: "script" })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: C.accent, color: "#ffffff" }}
        >
          <Sparkles className="w-4 h-4" /> Generate Script
        </button>
      </div>
      <div className="rounded-xl p-12 text-center" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
          <Sparkles className="w-6 h-6" style={{ color: C.accent }} />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>No script yet</h2>
        <p className="text-sm max-w-md mx-auto" style={{ color: C.muted }}>
          Generate a script from your creative brief. Studio writes a first pass, then runs an
          invisible editorial review — you see one clean workflow.
        </p>
      </div>
    </div>
  );
}