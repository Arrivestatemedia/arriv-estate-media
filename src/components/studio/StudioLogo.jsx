import React from "react";

// Canonical Arriv Studio logo — uses the official Arriv Studio brand mark
// (camera-aperture icon + ARRIV STUDIO wordmark). Used inside the Studio
// section to establish Studio identity within Estate Media.
// size prop controls the image height in px (width scales proportionally).
const STUDIO_LOGO_URL = "https://media.base44.com/images/public/698b3b9e4b7d348873dbf213/721174ccf_Screenshot2026-09-24at90728PM.png";

export default function StudioLogo({ size = 36, showWordmark = true, subtitle = "Real Estate" }) {
  return (
    <div className="flex flex-col" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <img
        src={STUDIO_LOGO_URL}
        alt="Arriv Studio"
        style={{ height: `${size}px`, width: "auto", objectFit: "contain", display: "block" }}
      />
      {showWordmark && subtitle && (
        <span
          className="font-semibold uppercase mt-1.5"
          style={{ color: "#a0a0a0", fontSize: Math.max(10, size * 0.2), letterSpacing: "0.15em" }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}