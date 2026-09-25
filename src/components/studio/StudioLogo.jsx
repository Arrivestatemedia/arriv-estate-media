import React from "react";

// Canonical Arriv Studio logo — uses the official uploaded logo image with
// "Real Estate" positioned directly below the "STUDIO" text in the image.
// The image has empty space at the bottom (content ends at ~80.5% of height),
// so we use absolute positioning to place the subtitle at the STUDIO baseline
// rather than below the full image (which would create a visible gap).
// size = logo image height in px.
const STUDIO_LOGO_URL = "https://media.base44.com/images/public/698b3b9e4b7d348873dbf213/721174ccf_Screenshot2026-09-24at90728PM.png";

export default function StudioLogo({ size = 36, subtitle = "Real Estate" }) {
  // Image native dimensions: 789 x 370
  // STUDIO "S" starts at x=108 native → 108/789 of image width
  // STUDIO text bottom is at y=298 native → 298/370 of image height
  const studioLeftFraction = 108 / 789; // fraction of image width
  const studioBottomFraction = 298 / 370; // fraction of image height
  const imageMarginLeft = -size * 0.1; // shift image left to align icon with sidebar edge
  // Displayed image width at the given height (native 789 x 370)
  const imageDisplayedWidth = size * (789 / 370);
  // Left-align the subtitle with the ARRIV/STUDIO text in the image,
  // then shift it forward (right) to sit beneath the STUDIO wordmark.
  const subtitleLeft = imageMarginLeft + studioLeftFraction * imageDisplayedWidth + size * 0.7;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <img
        src={STUDIO_LOGO_URL}
        alt="Arriv Studio"
        style={{
          height: `${size}px`,
          width: "auto",
          display: "block",
          marginLeft: `${imageMarginLeft}px`,
        }}
      />
      {subtitle && (
        <span
          className="font-semibold uppercase"
          style={{
            color: "#f17c5b",
            fontSize: 8,
            letterSpacing: "0.15em",
            lineHeight: 1,
            position: "absolute",
            left: `${subtitleLeft}px`,
            top: `${studioBottomFraction * size + 3}px`,
          }}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}