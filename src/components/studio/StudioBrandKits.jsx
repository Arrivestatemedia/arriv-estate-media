import React from "react";
import { Palette, Plus, Check } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio Brand Kits — native brand kits page.
// Shows the default Arriv brand kit + empty state for custom kits.
export default function StudioBrandKits() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8" style={{ ...STUDIO_FONT }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>Brand Kits</h1>
        <button
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: C.accent, color: "#ffffff" }}
        >
          <Plus className="w-4 h-4" /> New Brand Kit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Default Arriv brand kit */}
        <div className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-4 h-4" style={{ color: C.accent }} />
            <span className="text-xs font-medium" style={{ color: C.muted }}>Default</span>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg" style={{ background: "#2d2d2d" }} />
            <h3 className="text-base font-bold" style={{ color: C.text }}>Arriv Default</h3>
          </div>
          <div className="flex gap-2 mb-4">
            {["#E0564D", "#262626", "#F5F5F5"].map((c) => (
              <div key={c} className="w-8 h-8 rounded-full" style={{ background: c, border: "1px solid rgba(255,255,255,0.1)" }} />
            ))}
          </div>
          <p className="text-sm" style={{ color: C.muted }}>Confident, warm, professional — never salesy</p>
        </div>

        {/* Create new brand kit card */}
        <button
          className="rounded-xl p-5 flex flex-col items-center justify-center gap-2 transition-all hover:border-[#FF5A4F]/40"
          style={{ background: "transparent", border: `2px dashed ${C.border}`, minHeight: "180px" }}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
            <Palette className="w-5 h-5" style={{ color: C.accent }} />
          </div>
          <p className="text-sm font-medium" style={{ color: C.muted }}>Create new brand kit</p>
        </button>
      </div>
    </div>
  );
}