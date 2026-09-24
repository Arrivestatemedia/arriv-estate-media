import React from "react";
import { FolderOpen, Plus, ArrowRight } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio Projects — native projects list page.
// Shows empty state when no projects exist; "Create project" launches the wizard.
// When ARRIV_STUDIO_BASE_URL is configured, this can switch to the iframe.
export default function StudioProjects({ onStartProject }) {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8" style={{ ...STUDIO_FONT }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>Projects</h1>
        <button
          onClick={() => onStartProject?.({ mode: "new_production" })}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: C.accent, color: "#ffffff" }}
        >
          <Plus className="w-4 h-4" /> New Production
        </button>
      </div>

      <div className="rounded-xl p-12 text-center" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
          <FolderOpen className="w-6 h-6" style={{ color: C.accent }} />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>No projects yet</h2>
        <p className="text-sm max-w-md mx-auto mb-4" style={{ color: C.muted }}>
          Create your first real-estate production to get started. Studio handles the brief,
          script, direction, and production.
        </p>
        <button
          onClick={() => onStartProject?.({ mode: "new_production" })}
          className="inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: C.accent }}
        >
          Create project <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}