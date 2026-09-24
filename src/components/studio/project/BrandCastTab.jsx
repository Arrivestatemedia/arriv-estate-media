import React, { useState } from "react";
import { Check } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

const SUB_TABS = ["Brand Kit", "Presenter", "Voice", "Music"];

// Brand & Cast Tab — Brand Kit card with color swatches + sub-tabs.
// Matches canonical Arriv Studio Brand & Cast tab.
export default function BrandCastTab({ project, onLaunchStudio }) {
  const [subTab, setSubTab] = useState("Brand Kit");

  return (
    <div style={{ ...STUDIO_FONT }}>
      {/* Sub-tabs */}
      <div className="flex gap-6 mb-6 border-b" style={{ borderColor: C.border }}>
        {SUB_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className="py-2.5 text-sm font-medium relative"
            style={{ color: subTab === tab ? C.text : C.muted }}
          >
            {tab}
            {subTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: C.accent }} />}
          </button>
        ))}
      </div>

      {subTab === "Brand Kit" && <BrandKitCard />}
      {subTab === "Presenter" && <EmptySubTab title="No presenter selected" description="Choose a presenter to appear in your video." onLaunch={() => onLaunchStudio?.({ section: "presenter" })} cta="Browse Presenters" />}
      {subTab === "Voice" && <EmptySubTab title="No voice selected" description="Select an AI voice for narration." onLaunch={() => onLaunchStudio?.({ section: "voice" })} cta="Browse Voices" />}
      {subTab === "Music" && <EmptySubTab title="No music selected" description="Choose background music for your production." onLaunch={() => onLaunchStudio?.({ section: "music" })} cta="Browse Music" />}
    </div>
  );
}

function BrandKitCard() {
  const swatches = ["#E0564D", "#262626", "#F5F5F5"];
  return (
    <div className="rounded-xl p-5 max-w-sm" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Check className="w-4 h-4" style={{ color: C.accent }} />
        <span className="text-xs font-medium" style={{ color: C.muted }}>Brand Kit</span>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg" style={{ background: "#2d2d2d" }} />
        <h3 className="text-base font-bold" style={{ color: C.text }}>Arriv Default</h3>
      </div>
      <div className="flex gap-2 mb-4">
        {swatches.map((c) => (
          <div key={c} className="w-8 h-8 rounded-full" style={{ background: c, border: "1px solid rgba(255,255,255,0.1)" }} />
        ))}
      </div>
      <p className="text-sm" style={{ color: C.muted }}>Confident, warm, professional — never salesy</p>
    </div>
  );
}

function EmptySubTab({ title, description, onLaunch, cta }) {
  return (
    <div className="rounded-xl p-10 text-center" style={{ background: C.container, border: `1px solid ${C.border}` }}>
      <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>{title}</h2>
      <p className="text-sm mb-4" style={{ color: C.muted }}>{description}</p>
      <button
        onClick={onLaunch}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
        style={{ background: C.accent, color: "#ffffff" }}
      >
        {cta}
      </button>
    </div>
  );
}