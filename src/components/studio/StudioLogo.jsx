import React from "react";
import { Play } from "lucide-react";

// Canonical Arriv Studio logo mark — 36px rounded-square with coral gradient + white play triangle.
// Used inside the Studio section to establish Studio identity within Estate Media.
// size prop overrides default 36px.
export default function StudioLogo({ size = 36, showWordmark = true, subtitle = "Real Estate" }) {
  const px = `${size}px`;
  return (
    <div className="flex items-center gap-2.5" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div
        className="rounded-xl flex items-center justify-center shrink-0"
        style={{
          width: px,
          height: px,
          background: "linear-gradient(135deg, #FF4F46 0%, #FF806F 100%)",
          boxShadow: "0 0 20px rgba(255,90,79,0.25)",
        }}
      >
        <Play className="text-white fill-white" style={{ width: size * 0.36, height: size * 0.36, marginLeft: 2 }} />
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-extrabold tracking-tight" style={{ color: "#FAF8F5", fontSize: size * 0.42 }}>
            ARRIV
          </span>
          <span
            className="font-semibold uppercase"
            style={{ color: "#FF5A4F", fontSize: size * 0.22, letterSpacing: "0.15em" }}
          >
            STUDIO{subtitle ? ` · ${subtitle}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}