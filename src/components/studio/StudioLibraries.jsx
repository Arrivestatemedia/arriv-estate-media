import React from "react";
import { Library as LibraryIcon, Upload, Film, Music, Image, Plus } from "lucide-react";

const STUDIO_FONT = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
const C = {
  bg: "#0f0f0f", container: "#1a1a1a", border: "#2d2d2d",
  text: "#ffffff", muted: "#a0a0a0", accent: "#FF5A4F",
};

// Studio Libraries — native libraries page.
// Shows asset library categories with empty states.
export default function StudioLibraries() {
  const categories = [
    { icon: Film, label: "Video Clips", count: 0 },
    { icon: Image, label: "Images", count: 0 },
    { icon: Music, label: "Music", count: 0 },
    { icon: Upload, label: "Uploads", count: 0 },
  ];

  return (
    <div className="max-w-4xl mx-auto px-8 py-8" style={{ ...STUDIO_FONT }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: C.text }}>Libraries</h1>
        <button
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: C.accent, color: "#ffffff" }}
        >
          <Plus className="w-4 h-4" /> Upload Asset
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const Icon = cat.icon;
          return (
            <div key={cat.label} className="rounded-xl p-5" style={{ background: C.container, border: `1px solid ${C.border}` }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(255,90,79,0.1)" }}>
                <Icon className="w-5 h-5" style={{ color: C.accent }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: C.text }}>{cat.label}</p>
              <p className="text-xs mt-1" style={{ color: C.muted }}>{cat.count} assets</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl p-10 text-center mt-6" style={{ background: C.container, border: `1px solid ${C.border}` }}>
        <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: "rgba(255,90,79,0.1)" }}>
          <LibraryIcon className="w-6 h-6" style={{ color: C.accent }} />
        </div>
        <h2 className="text-lg font-bold mb-2" style={{ color: C.text }}>No assets yet</h2>
        <p className="text-sm max-w-md mx-auto" style={{ color: C.muted }}>
          Upload your own media or connect your Estate Media deliverables to use in Studio productions.
        </p>
      </div>
    </div>
  );
}