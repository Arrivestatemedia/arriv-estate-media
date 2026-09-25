import React from "react";

// Canonical Arriv Studio logo — uses the official uploaded logo image with
// "Real Estate" centered beneath it in proportionate coral text. Used anywhere
// Arriv Studio identity appears within Estate Media. size = logo image height.
const STUDIO_LOGO_URL = "https://media.base44.com/images/public/698b3b9e4b7d348873dbf213/721174ccf_Screenshot2026-09-24at90728PM.png";

export default function StudioLogo({ size = 36, subtitle = "Real Estate" }) {
  return (
    <div className="flex flex-col items-start" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <img
        src={STUDIO_LOGO_URL}
        alt="Arriv Studio"
        style={{ height: `${size}px`, width: "auto", display: "block", marginLeft: -size * 0.1 }}
      />
      {subtitle && (
        <span
          className="font-semibold uppercase"
          style={{ color: "#f17c5b", fontSize: 8, letterSpacing: "0.15em", marginTop: -4, marginLeft: size * 0.72 }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}