import React from "react";
import { Aperture } from "lucide-react";

// Canonical Arriv Studio logo mark — rounded-square dark tile with coral aperture icon,
// ARRIV (white) / STUDIO (coral) wordmark, and "Real Estate" beneath. Used anywhere
// Arriv Studio identity appears within Estate Media. size prop overrides default 36px.
export default function StudioLogo({ size = 36, showWordmark = true, subtitle = "Real Estate" }) {
  const px = `${size}px`;
  return (
    <div className="flex items-center gap-2.5" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <div
        className="rounded-lg flex items-center justify-center shrink-0"
        style={{
          width: px,
          height: px,
          background: "#1a1a1a",
        }}
      >
        <Aperture style={{ width: size * 0.62, height: size * 0.62, color: "#f17c5b" }} strokeWidth={2} />
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span className="font-extrabold tracking-tight" style={{ color: "#ffffff", fontSize: size * 0.42 }}>
            ARRIV
          </span>
          <span
            className="font-semibold uppercase"
            style={{ color: "#f17c5b", fontSize: size * 0.22, letterSpacing: "0.15em" }}
          >
            STUDIO
          </span>
          {subtitle && (
            <span
              className="font-semibold uppercase"
              style={{ color: "#f17c5b", fontSize: size * 0.22, letterSpacing: "0.15em" }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}