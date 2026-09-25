import React from "react";

// Canonical Arriv Studio logo — clean icon + text composition.
// Icon: circular aperture/shutter with orange-red gradient.
// Text: "ARRIV" bold, "STUDIO" and "REAL ESTATE" stacked below, left-aligned to icon.
// `size` = icon diameter in px; text scales proportionally.
const STUDIO_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

function ApertureIcon({ size, gradId }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff6b3d" />
          <stop offset="100%" stopColor="#c70039" />
        </linearGradient>
      </defs>
      {/* Outer gradient circle */}
      <circle cx="50" cy="50" r="48" fill={`url(#${gradId})`} />
      {/* 6 dark aperture blades */}
      <g fill="#0f0f0f">
        <path d="M65.6 41 L96 50 A46 46 0 0 1 73 89.9 L65.6 59 Z" />
        <path d="M65.6 59 L73 89.9 A46 46 0 0 1 27 89.9 L50 68 Z" />
        <path d="M50 68 L27 89.9 A46 46 0 0 1 4 50 L34.4 59 Z" />
        <path d="M34.4 59 L4 50 A46 46 0 0 1 27 10.1 L34.4 41 Z" />
        <path d="M34.4 41 L27 10.1 A46 46 0 0 1 73 10.1 L50 32 Z" />
        <path d="M50 32 L73 10.1 A46 46 0 0 1 96 50 L65.6 41 Z" />
      </g>
      {/* Gradient center hexagon (the opening) */}
      <polygon points="50,32 65.6,41 65.6,59 50,68 34.4,59 34.4,41" fill={`url(#${gradId})`} />
    </svg>
  );
}

export default function StudioLogo({ size = 36, subtitle = "Real Estate" }) {
  const rawId = React.useId();
  const gradId = `aperture-${rawId.replace(/:/g, "")}`;
  const arrivFs = size * 0.38;
  const subFs = size * 0.19;
  const gap = size * 0.05;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.14,
        fontFamily: STUDIO_FONT,
      }}
    >
      <ApertureIcon size={size} gradId={gradId} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        <span
          style={{
            fontSize: `${arrivFs}px`,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "0.01em",
          }}
        >
          ARRIV
        </span>
        <span
          style={{
            fontSize: `${subFs}px`,
            fontWeight: 600,
            color: "#ffffff",
            letterSpacing: "0.18em",
            marginTop: `${gap}px`,
          }}
        >
          STUDIO
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: `${subFs}px`,
              fontWeight: 600,
              color: "#ffffff",
              letterSpacing: "0.18em",
              marginTop: `${gap * 0.6}px`,
            }}
          >
            {subtitle.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}